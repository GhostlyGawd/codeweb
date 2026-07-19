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
import { fileURLToPath } from 'node:url';
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
const pipeline = {
  target: opt.target === ROOT ? 'codeweb (self)' : opt.target,
  symbols: graph.nodes.length, edges: graph.edges.length,
  coldMs: cold.ms, warmMs: warm.ms, stagesReused,
  regexExtractBaselineMs: regexBase.ms,
  warmFactorVsRegexBaseline: +(warm.ms / Math.max(regexBase.ms, 1)).toFixed(2),
};

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

// ---------------------------------------------------------------- write + gate
const payload = { ranAt: new Date().toISOString(), node: process.version, budgets, pipeline, session, toolBudgets, tsEngine };
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
  if (pipeline.warmFactorVsRegexBaseline > budgets.warmRefreshFactorMax) violations.push(`pipeline: warm rerun ${pipeline.warmFactorVsRegexBaseline}x regex baseline > ${budgets.warmRefreshFactorMax}x`);
  if (violations.length) { console.error(`[bench:all] GATE FAILED:\n  - ${violations.join('\n  - ')}`); process.exit(1); }
  console.log('[bench:all] gate: all promises hold');
}
