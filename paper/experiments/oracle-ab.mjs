#!/usr/bin/env node
// Oracle A/B — the discovery question ("who depends on X? what breaks if I change it?") answered
// through the two channels a coding agent actually has, graded against an INDEPENDENT oracle:
//
//   control   = grep  (`rg -n '\bX\b'` — the dump the agent must then read)
//   treatment = codeweb (`--dependents`, budgeted pages, as served over MCP)
//   oracle    = the TypeScript compiler's own reference finder (LanguageService
//               getReferencesAtPosition) — mechanical, reproducible, no human labels.
//
// This extends the efficiency pilot (efficiency-pilot.STATE.md) from 4 hand-labeled symbols to a
// seeded SAMPLE of real high-fan-in symbols, and swaps hand labels for a compiler oracle. It is NOT
// the frozen frontier-agent protocol (no stochastic agent loop; steps are not comparable) — it
// measures the two channels' RECALL, PRECISION, and CONTEXT COST (the bytes an agent must ingest),
// which run 1 proved are what decide the agent outcome.
//
// Grading unit: FILES. truth(X) = files with >=1 compiler reference to X outside its declaration.
// grep reports every file with a \bX\b text hit (it cannot tell a reference from a comment or an
// unrelated same-name symbol). codeweb reports files of `--dependents` symbols (call, import,
// inherit, test, ref edges). Cost: grep = the full rg dump; codeweb = the budgeted JSON page(s)
// (limit 20/page, paged until the full result is enumerated — exactly what MCP serves).
//
// Usage: node paper/experiments/oracle-ab.mjs <graph.json> <src-root> [--n 30] [--json <out>]
// Requires the `typescript` package resolvable from cwd (TS_MODULE env overrides) — an OPTIONAL
// oracle dependency, like universal-ctags: absent -> the experiment reports SKIPPED, exit 0.

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { normalizeGraph, buildIndex } from '../../scripts/lib/graph-ops.mjs';
import { runQuery } from '../../scripts/lib/query-core.mjs';

const require_ = createRequire(join(process.cwd(), 'noop.js'));
let ts = null;
try { ts = require_(process.env.TS_MODULE || 'typescript'); }
catch { console.log(JSON.stringify({ skipped: 'typescript not resolvable from cwd (npm i typescript, or set TS_MODULE)' })); process.exit(0); }

const argv = process.argv.slice(2);
let N = 30, outPath = null; const pos = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--n') N = Math.max(1, parseInt(argv[++i], 10) || 30);
  else if (argv[i] === '--json') outPath = argv[++i];
  else if (!argv[i].startsWith('-')) pos.push(argv[i]);
}
if (pos.length < 2) { console.error('usage: oracle-ab.mjs <graph.json> <src-root> [--n N] [--json out]'); process.exit(2); }
const graph = normalizeGraph(JSON.parse(readFileSync(resolve(pos[0]), 'utf8')));
const index = buildIndex(graph);
const SRC_ROOT = resolve(pos[1]);
const graphRoot = graph.meta?.root;
if (!graphRoot || !existsSync(graphRoot)) { console.error('graph.meta.root missing/absent — need source on disk'); process.exit(2); }
// repo-relative prefix of the corpus (e.g. packages/vite/src)
const scope = SRC_ROOT.replace(/\\/g, '/').slice(graphRoot.replace(/\\/g, '/').length).replace(/^\//, '');

// ---- deterministic symbol sample: exported product functions/methods in scope, fan-in >= 3 ----
const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rng = mulberry(42);
const candidates = graph.nodes.filter((n) =>
  (n.kind === 'function' || n.kind === 'class') && n.role === 'product' && n.exports &&
  n.file.startsWith(scope) && n.label.length >= 4 &&
  (index.callIn.get(n.id)?.size || 0) + (index.importIn.get(n.id)?.size || 0) >= 3
).sort((a, b) => (a.id < b.id ? -1 : 1));
const sample = [];
const pool = candidates.slice();
while (sample.length < Math.min(N, pool.length) && pool.length) sample.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);

// ---- TS language service over the scope ----
const tsFiles = [];
(function walk(d) { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) { if (!/node_modules|__tests__/.test(e.name)) walk(p); } else if (/\.tsx?$/.test(e.name) && !/\.d\.ts$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) tsFiles.push(p); } })(SRC_ROOT);
const snapshots = new Map();
const host = {
  getScriptFileNames: () => tsFiles,
  getScriptVersion: () => '1',
  getScriptSnapshot: (f) => { if (!snapshots.has(f)) { try { snapshots.set(f, ts.ScriptSnapshot.fromString(readFileSync(f, 'utf8'))); } catch { snapshots.set(f, null); } } return snapshots.get(f); },
  getCurrentDirectory: () => SRC_ROOT,
  getCompilationSettings: () => ({ allowJs: true, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, moduleResolution: ts.ModuleResolutionKind.Bundler, noEmit: true, skipLibCheck: true }),
  getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
  fileExists: (f) => existsSync(f),
  readFile: (f) => { try { return readFileSync(f, 'utf8'); } catch { return undefined; } },
  directoryExists: (d) => { try { return statSync(d).isDirectory(); } catch { return false; } },
  getDirectories: (d) => { try { return readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch { return []; } },
};
const ls = ts.createLanguageService(host, ts.createDocumentRegistry());
const relOf = (abs) => abs.replace(/\\/g, '/').slice(graphRoot.replace(/\\/g, '/').length).replace(/^\//, '');

// oracle: files containing >=1 reference to the symbol OUTSIDE its declaration entry
function oracleFiles(node) {
  const abs = join(graphRoot, node.file);
  const text = host.readFile(abs);
  if (!text) return null;
  const lines = text.split(/\r?\n/);
  const declLine = lines[node.line - 1] || '';
  const col = declLine.indexOf(node.label);
  if (col === -1) return null;
  const position = lines.slice(0, node.line - 1).reduce((s, l) => s + l.length + 1, 0) + col;
  let refs;
  try { refs = ls.getReferencesAtPosition(abs, position); } catch { return null; }
  if (!refs || !refs.length) return null;
  const files = new Set();
  for (const r of refs) {
    if (r.isDefinition) continue;
    files.add(relOf(r.fileName));
  }
  return files.size ? files : null;
}

// arm: codeweb --dependents, budgeted pages of 20 (the MCP default), paged to exhaustion
function codewebArm(node) {
  let offset = 0, files = new Set(), bytes = 0, pages = 0;
  for (;;) {
    const { payload } = runQuery(graph, index, { query: 'dependents', symbol: node.id, limit: 20, offset });
    bytes += JSON.stringify(payload).length; pages++;
    for (const id of payload.results || []) { const n = index.byId.get(id); if (n) files.add(n.file); }
    if (!payload.more) break;
    offset = payload.more.nextOffset;
  }
  return { files, bytes, pages };
}

// arm: one rg dump over the scope (what a grep-first agent ingests)
function grepArm(node) {
  let out = '';
  try { out = execFileSync('rg', ['-n', `\\b${node.label}\\b`, SRC_ROOT], { encoding: 'utf8', maxBuffer: 1 << 28 }); }
  catch (e) { out = e.stdout || ''; }
  const files = new Set();
  for (const line of out.split('\n')) { const m = /^(.*?):\d+:/.exec(line); if (m) files.add(relOf(resolve(m[1]))); }
  files.delete(node.file); // the agent knows the definition site already
  return { files, bytes: out.length };
}

const score = (reported, truth) => {
  const inter = [...reported].filter((f) => truth.has(f)).length;
  return { recall: truth.size ? inter / truth.size : 1, precision: reported.size ? inter / reported.size : 1 };
};

// ---- second question: BLAST RADIUS ("what transitively breaks?") --------------------------------
// grep has no transitive operator: an agent must grep X, identify the enclosing caller symbols,
// grep EACH of those, and so on to a fixpoint. We simulate that loop GENEROUSLY for grep (the graph
// itself tells it the next frontier's symbol names — a real agent must read files to learn them)
// and sum the rg bytes it ingests. codeweb answers the same question with one budgeted
// codeweb_impact call. Cost-only comparison — both arms enumerate the same closure.
function impactCost(node) {
  const cw = (() => {
    const { payload } = runQuery(graph, index, { query: 'impact', symbol: node.id, limit: 20 });
    return { bytes: JSON.stringify(payload).length, size: payload.count };
  })();
  let bytes = 0, rounds = 0;
  const seen = new Set([node.id]);
  let frontier = [node];
  while (frontier.length && rounds < 12) {
    rounds++;
    const labels = [...new Set(frontier.map((n) => n.label))];
    for (const label of labels) {
      try { bytes += execFileSync('rg', ['-n', `\\b${label}\\b`, SRC_ROOT], { encoding: 'utf8', maxBuffer: 1 << 28 }).length; }
      catch (e) { bytes += (e.stdout || '').length; }
    }
    const next = [];
    for (const n of frontier) for (const c of index.callIn.get(n.id) || []) {
      if (!seen.has(c)) { seen.add(c); const cn = index.byId.get(c); if (cn) next.push(cn); }
    }
    frontier = next;
  }
  return { codewebBytes: cw.bytes, impactSize: cw.size, grepBytes: bytes, grepRounds: rounds };
}

const rows = [];
for (const node of sample) {
  const truth = oracleFiles(node);
  if (!truth) continue; // oracle couldn't resolve (position/refs) — excluded, counted below
  const truthNoDecl = new Set([...truth].filter((f) => f !== node.file));
  const cw = codewebArm(node);
  cw.files.delete(node.file);
  const gr = grepArm(node);
  rows.push({
    symbol: node.id, label: node.label, truthFiles: truthNoDecl.size,
    codeweb: { ...score(cw.files, truthNoDecl), files: cw.files.size, bytes: cw.bytes, pages: cw.pages },
    grep: { ...score(gr.files, truthNoDecl), files: gr.files.size, bytes: gr.bytes },
    impact: impactCost(node),
  });
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const agg = (arm) => ({
  meanRecall: +mean(rows.map((r) => r[arm].recall)).toFixed(3),
  meanPrecision: +mean(rows.map((r) => r[arm].precision)).toFixed(3),
  totalBytes: rows.reduce((s, r) => s + r[arm].bytes, 0),
  meanBytes: Math.round(mean(rows.map((r) => r[arm].bytes))),
});
const impactAgg = {
  meanImpactSize: Math.round(mean(rows.map((r) => r.impact.impactSize))),
  codewebMeanBytes: Math.round(mean(rows.map((r) => r.impact.codewebBytes))),
  grepMeanBytes: Math.round(mean(rows.map((r) => r.impact.grepBytes))),
  grepMeanRounds: +mean(rows.map((r) => r.impact.grepRounds)).toFixed(1),
  costRatio: +(mean(rows.map((r) => r.impact.grepBytes)) / Math.max(1, mean(rows.map((r) => r.impact.codewebBytes)))).toFixed(1),
};
const result = {
  design: 'oracle-graded dependents-discovery: control=rg dump, treatment=codeweb --dependents (budgeted pages), oracle=TS LanguageService references; file-level grading; seed 42. Plus blast-radius COST: one codeweb_impact call vs the recursive grep loop (graph-assisted, i.e. generous to grep).',
  corpus: { graph: pos[0], scope, sampled: sample.length, graded: rows.length, oracleExcluded: sample.length - rows.length },
  codeweb: agg('codeweb'),
  grep: agg('grep'),
  impact: impactAgg,
  tokensNote: 'tokens ~ bytes/4; cost = what the channel injects into the agent context',
  rows,
};
if (outPath) writeFileSync(resolve(outPath), JSON.stringify(result, null, 2));
console.log(`oracle-ab: ${rows.length} symbol(s) graded (of ${sample.length} sampled; oracle excluded ${sample.length - rows.length})`);
console.log(`  codeweb : recall ${result.codeweb.meanRecall}  precision ${result.codeweb.meanPrecision}  cost ${Math.round(result.codeweb.totalBytes / 1024)}KB total (${Math.round(result.codeweb.meanBytes / 1024 * 10) / 10}KB/task)`);
console.log(`  grep    : recall ${result.grep.meanRecall}  precision ${result.grep.meanPrecision}  cost ${Math.round(result.grep.totalBytes / 1024)}KB total (${Math.round(result.grep.meanBytes / 1024 * 10) / 10}KB/task)`);
const wins = rows.filter((r) => r.codeweb.recall >= r.grep.recall).length;
console.log(`  per-task: codeweb recall >= grep on ${wins}/${rows.length}`);
