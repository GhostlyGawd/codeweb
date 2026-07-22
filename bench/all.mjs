#!/usr/bin/env node
// Spec C (docs/specs/bench-all-ci-gates.md): the one-command benchmark suite behind every number
// codeweb publishes. Runs the deterministic, agent-free benchmarks available in this environment,
// writes bench/results/benchmarks.json (+ a byte-identical mirror for the site), and — with
// --gate — FAILS when a measurement breaks a promise in bench/budgets.json. Skips are explicit,
// never silent.
//
//   node bench/all.mjs [--target <dir>] [--ws <dir>] [--corpus <dir>] [--budgets <file>]
//                      [--out <file>] [--site <file>] [--gate]
//
// Sections: pipeline (cold map + no-change rerun + regex extraction baseline), session (a
// representative 12-call MCP session — bytes, ≈tokens, JSON validity), toolBudgets (max response
// bytes per tool), tsEngine (the Spec-A perf gate when the pinned corpus is present).

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync, mkdtempSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = { target: ROOT, ws: null, corpus: join(ROOT, 'bench', 'corpus', 'axios'), budgets: join(ROOT, 'bench', 'budgets.json'), out: join(ROOT, 'bench', 'results', 'benchmarks.json'), site: join(ROOT, 'site', 'data', 'benchmarks.json'), gate: false };
for (let i = 0; i < argv.length; i++) {
  const t = argv[i];
  if (t === '--target') opt.target = resolve(argv[++i]);
  else if (t === '--ws') opt.ws = resolve(argv[++i]);
  else if (t === '--corpus') opt.corpus = resolve(argv[++i]);
  else if (t === '--budgets') opt.budgets = resolve(argv[++i]);
  else if (t === '--out') opt.out = resolve(argv[++i]);
  else if (t === '--site') opt.site = resolve(argv[++i]);
  else if (t === '--gate') opt.gate = true;
}
const ws = opt.ws || mkdtempSync(join(tmpdir(), 'codeweb-benchws-'));
const budgets = JSON.parse(readFileSync(opt.budgets, 'utf8'));
const NODE = process.execPath;
const S = (p) => join(ROOT, 'scripts', p);
const ENV = { ...process.env, CODEWEB_NO_STATS: '1', CODEWEB_NO_AUTOREFRESH: '1' };

function sh(file, args, extra = {}) {
  const t0 = performance.now();
  const r = spawnSync(NODE, [file, ...args], { encoding: 'utf8', maxBuffer: 1 << 28, env: ENV, ...extra });
  return { ms: Math.round(performance.now() - t0), status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

// ---------------------------------------------------------------- pipeline
rmSync(ws, { recursive: true, force: true }); mkdirSync(ws, { recursive: true });
const cold = sh(S('run.mjs'), [opt.target, '--out-dir', ws]);
if (cold.status !== 0) { console.error(cold.stderr); process.exit(2); }
const warm = sh(S('run.mjs'), [opt.target, '--out-dir', ws]);
const stagesReused = /stages reused/.test(warm.stderr);
const regexBase = sh(S('extract-symbols.mjs'), [opt.target, '--engine', 'regex', '--out', join(ws, '.regex-base.json')]);
const graph = JSON.parse(readFileSync(join(ws, 'graph.json'), 'utf8'));
// The warm-vs-baseline factor is meaningful only when the baseline dwarfs process-startup
// noise; on tiny fixture targets both terms are ~100ms of node spawns and the ratio is jitter
// (a CI runner measured 2.17x on a two-file fixture). Below the floor it reports null with the
// reason, and the gate skips it — explicitly, never silently.
const BASELINE_FLOOR_MS = 300;
// finding 13(a): per-stage wall times from run.mjs's own `[run] <stage> done in Xms` stderr lines,
// each gated as a factor of the regex-extract baseline. The previous only-timing-gate measured the
// stage-REUSE path (which skips overlap/optimize entirely) — a 10x regression in any post-graph
// stage passed every gate; the quadratic risk loop shipped exactly that way.
const stageTimesOf = (stderr) => {
  const out = {};
  for (const m of String(stderr).matchAll(/\[run\] (\w[\w-]*) done in (\d+)ms/g)) out[m[1]] = Number(m[2]);
  return out;
};
const coldStages = stageTimesOf(cold.stderr);
const measurable = regexBase.ms >= BASELINE_FLOOR_MS;
const factorOf = (ms) => (measurable && ms != null ? +(ms / regexBase.ms).toFixed(2) : null);
const pipeline = {
  target: opt.target === ROOT ? 'codeweb (self)' : opt.target,
  symbols: graph.nodes.length, edges: graph.edges.length,
  coldMs: cold.ms, warmMs: warm.ms, stagesReused,
  regexExtractBaselineMs: regexBase.ms,
  stageMs: coldStages,
  stageFactorsVsRegexBaseline: Object.fromEntries(Object.entries(coldStages).map(([k, v]) => [k, factorOf(v)])),
  warmFactorVsRegexBaseline: measurable ? +(warm.ms / regexBase.ms).toFixed(2) : null,
  ...(measurable ? {} : { warmFactorNote: `target too small to measure (baseline ${regexBase.ms}ms < ${BASELINE_FLOOR_MS}ms floor) — the factor gates only at repo scale` }),
};

// ---------------------------------------------------------------- advisors (finding 13(c))
// risk / deadcode / hotspots / campaign ran in NO timed harness — gate them as baseline factors.
const gpath = join(ws, 'graph.json');
const advisorRuns = {
  risk: sh(S('risk.mjs'), [gpath, '--json']),
  deadcode: sh(S('deadcode.mjs'), [gpath, '--json']),
  hotspots: sh(S('hotspots.mjs'), [gpath, '--json']),
  campaign: sh(S('campaign.mjs'), [gpath, '--json']),
  readingOrder: sh(S('reading-order.mjs'), [gpath, '--json']), // round 2, #22: was 75.9s@15.7k with no bench row
};
const advisors = Object.fromEntries(Object.entries(advisorRuns).map(([k, r]) => [k, {
  ms: r.ms, ok: r.status === 0, factorVsRegexBaseline: r.status === 0 ? factorOf(r.ms) : null,
}]));

// ---------------------------------------------------------------- session (12-call MCP drive)
const fanIn = new Map();
for (const e of graph.edges) fanIn.set(e.to, (fanIn.get(e.to) || 0) + 1);
const hubs = graph.nodes
  .filter((n) => (n.kind === 'function' || n.kind === 'method') && (n.role || 'product') === 'product')
  .map((n) => ({ id: n.id, f: fanIn.get(n.id) || 0 }))
  .sort((a, b) => b.f - a.f || (a.id < b.id ? -1 : 1));
const sym1 = (hubs[0] || { id: graph.nodes[0].id }).id;
const sym2 = (hubs[1] || hubs[0] || { id: graph.nodes[0].id }).id;
const gp = join(ws, 'graph.json');
const CALLS = [
  ['codeweb_brief', {}], ['codeweb_find', { query: 'refresh cache' }],
  ['codeweb_explain', { symbol: sym1 }], ['codeweb_context', { symbol: sym1 }],
  ['codeweb_impact', { symbol: sym1 }], ['codeweb_impact', { symbol: sym2 }],
  ['codeweb_callers', { symbol: sym1 }], ['codeweb_callers', { symbol: sym2 }],
  ['codeweb_cycles', {}], ['codeweb_hotspots', {}],
  ['codeweb_refresh', {}], ['codeweb_diff', { before: gp, after: gp }],
];
const reqs = [
  { jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'bench-all', version: '0' } } },
  { jsonrpc: '2.0', method: 'notifications/initialized' },
  ...CALLS.map(([name, args], i) => ({ jsonrpc: '2.0', id: i + 1, method: 'tools/call', params: { name, arguments: { graph: gp, ...args } } })),
];
const srv = spawnSync(NODE, [S('mcp-server.mjs')], { encoding: 'utf8', maxBuffer: 1 << 28, env: ENV, input: reqs.map((m) => JSON.stringify(m)).join('\n') + '\n' });
const lines = (srv.stdout || '').split('\n').filter(Boolean);
const byId = new Map();
for (const l of lines) { try { const m = JSON.parse(l); if (m.id != null) byId.set(m.id, { m, bytes: Buffer.byteLength(l) }); } catch { /* counted below */ } }
const calls = CALLS.map(([name], i) => {
  const hit = byId.get(i + 1);
  const ok = !!hit && !hit.m.error && !hit.m.result?.isError;
  return { tool: name, bytes: hit ? hit.bytes : 0, tokensApprox: hit ? Math.round(hit.bytes / 4) : 0, ok };
});
const session = {
  calls,
  totalBytes: calls.reduce((a, c) => a + c.bytes, 0),
  totalTokensApprox: calls.reduce((a, c) => a + c.tokensApprox, 0),
  allValidJson: calls.every((c) => c.ok) && lines.length >= CALLS.length + 1,
};

// ---------------------------------------------------------------- toolBudgets
const perTool = {};
for (const c of calls) perTool[c.tool] = Math.max(perTool[c.tool] || 0, c.bytes);
const toolBudgets = { perToolMaxBytes: perTool, budgetBytes: budgets.perToolBytesMax };

// ---------------------------------------------------------------- tsEngine (optional corpus)
let tsEngine;
if (existsSync(opt.corpus)) {
  const outF = join(ws, '.ts-engine.json');
  const r = sh(S('bench-ts-engine.mjs'), [opt.corpus, '--out', outF]);
  tsEngine = r.status === 0 && existsSync(outF) ? JSON.parse(readFileSync(outF, 'utf8')) : { skipped: `bench-ts-engine failed (exit ${r.status})` };
} else {
  tsEngine = { skipped: `corpus absent at ${opt.corpus} — run bench/corpus/clone-corpus.sh` };
}

// ---------------------------------------------------------------- loaded corpus (finding 13(b))
// The synthetic corpus that actually TRIGGERS the machinery: every function is a twin candidate
// (LSH engages on its own past 800), and 15 planted same-name clusters must be found. The old
// harness corpus produced 0 candidates / 0 groups — an idle pipeline timed as if it were load.
// file:// URL, not a bare absolute path — on windows a D:\ path is an unsupported ESM scheme and
// this import crashed the whole bench (the matrix's first real windows catch).
const { writeLoadedCorpus } = await import(pathToFileURL(join(ROOT, 'bench', 'lib', 'loaded-corpus.mjs')).href);
const loadedSrc = join(ws, 'loaded-src');
const loadedWs = join(ws, 'loaded-ws');
rmSync(loadedSrc, { recursive: true, force: true }); rmSync(loadedWs, { recursive: true, force: true });
const planted = writeLoadedCorpus(loadedSrc);
const loadedRun = sh(S('run.mjs'), [loadedSrc, '--target', 'bench-loaded', '--out-dir', loadedWs]);
let loaded;
if (loadedRun.status !== 0) loaded = { ok: false, error: `run failed (exit ${loadedRun.status})` };
else {
  const lg = JSON.parse(readFileSync(join(loadedWs, 'graph.json'), 'utf8'));
  // round 2, #22: reading-order timed at load (default budget) — the 75.9s@15.7k regression
  // lived exactly here, invisible because no harness ever timed it on a loaded graph.
  const loadedReadingOrder = sh(S('reading-order.mjs'), [join(loadedWs, 'graph.json'), '--json']);
  loaded = {
    ok: true,
    files: planted.files, fns: planted.fns, plantedClusters: planted.plantedClusters,
    symbols: lg.nodes.length, edges: lg.edges.length,
    overlapFindings: (lg.overlaps || []).length,
    lshEngaged: /\[overlap\] LSH path engaged/.test(loadedRun.stderr),
    stageMs: stageTimesOf(loadedRun.stderr),
    mapMs: loadedRun.ms,
    readingOrderMs: loadedReadingOrder.status === 0 ? loadedReadingOrder.ms : null,
  };
}

// ---------------------------------------------------------------- write + gate
const payload = { ranAt: new Date().toISOString(), node: process.version, budgets, pipeline, session, toolBudgets, advisors, loaded, tsEngine };
const json = JSON.stringify(payload, null, 2) + '\n';
mkdirSync(dirname(opt.out), { recursive: true }); writeFileSync(opt.out, json);
mkdirSync(dirname(opt.site), { recursive: true }); writeFileSync(opt.site, json);
console.log(`[bench:all] pipeline cold ${pipeline.coldMs}ms / warm ${pipeline.warmMs}ms (reused: ${pipeline.stagesReused}) · session ${session.totalTokensApprox} tokens over ${calls.length} calls (valid: ${session.allValidJson}) · ts-engine ${tsEngine.skipped ? 'SKIPPED' : tsEngine.factor + 'x'}`);
console.log(`[bench:all] wrote ${opt.out} (+ site mirror)`);

if (opt.gate) {
  const violations = [];
  if (!session.allValidJson) violations.push('session: a response failed to parse or errored');
  if (session.totalTokensApprox > budgets.sessionTokensMax) violations.push(`session: ${session.totalTokensApprox} tokens > sessionTokensMax ${budgets.sessionTokensMax}`);
  for (const [tool, bytes] of Object.entries(perTool)) if (bytes > budgets.perToolBytesMax) violations.push(`tool ${tool}: ${bytes}B > perToolBytesMax ${budgets.perToolBytesMax}`);
  if (!pipeline.stagesReused) violations.push('pipeline: no-change rerun did not reuse stages');
  if (pipeline.warmFactorVsRegexBaseline != null && pipeline.warmFactorVsRegexBaseline > budgets.warmRefreshFactorMax) violations.push(`pipeline: warm rerun ${pipeline.warmFactorVsRegexBaseline}x regex baseline > ${budgets.warmRefreshFactorMax}x`);
  // finding 13(a): every post-graph stage holds a factor-of-baseline promise (skipped, with the
  // note, below the measurement floor — same rule as warmFactor).
  for (const [stage, factor] of Object.entries(pipeline.stageFactorsVsRegexBaseline || {})) {
    const max = budgets.stageFactorVsRegexBaselineMax?.[stage];
    if (max != null && factor != null && factor > max) violations.push(`stage ${stage}: ${factor}x regex baseline > ${max}x`);
  }
  // finding 13(c): advisors hold factors too — and a crashed advisor is itself a violation.
  for (const [name, a] of Object.entries(advisors)) {
    if (!a.ok) { violations.push(`advisor ${name}: exited non-zero`); continue; }
    const max = budgets.advisorFactorVsRegexBaselineMax?.[name];
    if (max != null && a.factorVsRegexBaseline != null && a.factorVsRegexBaseline > max) violations.push(`advisor ${name}: ${a.factorVsRegexBaseline}x regex baseline > ${max}x`);
  }
  // finding 13(b): the loaded corpus must actually exercise the machinery — planted clusters
  // found, LSH engaged at scale. If this fails, the timing numbers above measured an idle engine.
  if (!loaded.ok) violations.push(`loaded corpus: ${loaded.error}`);
  else {
    if (budgets.loadedOverlapFindingsMin != null && loaded.overlapFindings < budgets.loadedOverlapFindingsMin) violations.push(`loaded corpus: ${loaded.overlapFindings} overlap findings < loadedOverlapFindingsMin ${budgets.loadedOverlapFindingsMin}`);
    if (budgets.loadedLshRequired && !loaded.lshEngaged) violations.push('loaded corpus: LSH path did not engage (banner absent)');
  }
  if (violations.length) { console.error(`[bench:all] GATE FAILED:\n  - ${violations.join('\n  - ')}`); process.exit(1); }
  console.log('[bench:all] gate: all promises hold');
}
