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
// Cost: grep = the full rg dump; codeweb = the budgeted JSON page(s) (limit 20/page, paged until
// the full result is enumerated — exactly what MCP serves). The engine lives in
// scripts/lib/bench-core.mjs — shared verbatim with the product CLI `scripts/bench.mjs`, so the
// published numbers and a user's own bench measure the same thing.
//
// Usage: node bench/experiments/oracle-ab.mjs <graph.json> <src-root> [--n 30] [--json <out>]
// Requires the `typescript` package resolvable from cwd (TS_MODULE env overrides) — an OPTIONAL
// oracle dependency, like universal-ctags: absent -> the experiment reports SKIPPED, exit 0.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeGraph, buildIndex } from '../../scripts/lib/graph-ops.mjs';
import { loadTypescript, scopeOf, sampleSymbols, makeTsOracle, codewebArm, grepArm, score, impactCost, aggArm, aggImpact } from '../../scripts/lib/bench-core.mjs';

const ts = loadTypescript();
if (!ts) { console.log(JSON.stringify({ skipped: 'typescript not resolvable from cwd (npm i typescript, or set TS_MODULE)' })); process.exit(0); }

const argv = process.argv.slice(2);
let N = 30, outPath = null, symbolsPath = null; const pos = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--n') N = Math.max(1, parseInt(argv[++i], 10) || 30);
  else if (argv[i] === '--json') outPath = argv[++i];
  else if (argv[i] === '--symbols') symbolsPath = argv[++i]; // fixed task list (A/B across ENGINE versions needs identical tasks)
  else if (!argv[i].startsWith('-')) pos.push(argv[i]);
}
if (pos.length < 2) { console.error('usage: oracle-ab.mjs <graph.json> <src-root> [--n N] [--json out]'); process.exit(2); }
const graph = normalizeGraph(JSON.parse(readFileSync(resolve(pos[0]), 'utf8')));
const index = buildIndex(graph);
const SRC_ROOT = resolve(pos[1]);
const graphRoot = graph.meta?.root;
if (!graphRoot || !existsSync(graphRoot)) { console.error('graph.meta.root missing/absent — need source on disk'); process.exit(2); }
const scope = scopeOf(SRC_ROOT, graphRoot);

const fixedIds = symbolsPath ? JSON.parse(readFileSync(resolve(symbolsPath), 'utf8')) : null;
const { sample, missing } = sampleSymbols(graph, index, { scope, n: N, seed: 42, fixedIds });
if (missing.length) console.error(`[oracle-ab] ${missing.length} fixed symbol(s) absent from this graph: ${missing.slice(0, 5).join(', ')}`);

const { oracleFiles } = makeTsOracle(ts, { srcRoot: SRC_ROOT, graphRoot });

const rows = [];
for (const node of sample) {
  const truth = oracleFiles(node);
  if (!truth) continue; // oracle couldn't resolve (position/refs) — excluded, counted below
  const truthNoDecl = new Set([...truth].filter((f) => f !== node.file));
  const cw = codewebArm(graph, index, node);
  cw.files.delete(node.file);
  const gr = grepArm(node, { srcRoot: SRC_ROOT, graphRoot }) ?? { files: new Set(), bytes: 0 };
  const imp = impactCost(graph, index, node, { srcRoot: SRC_ROOT });
  rows.push({
    symbol: node.id, label: node.label, truthFiles: truthNoDecl.size,
    codeweb: { ...score(cw.files, truthNoDecl), files: cw.files.size, bytes: cw.bytes, pages: cw.pages },
    grep: { ...score(gr.files, truthNoDecl), files: gr.files.size, bytes: gr.bytes },
    impact: { ...imp, grepBytes: imp.grepBytes ?? 0, grepRounds: imp.grepRounds ?? 0 },
  });
}

const result = {
  design: 'oracle-graded dependents-discovery: control=rg dump, treatment=codeweb --dependents (budgeted pages), oracle=TS LanguageService references; file-level grading; seed 42. Plus blast-radius COST: one codeweb_impact call vs the recursive grep loop (graph-assisted, i.e. generous to grep).',
  corpus: { graph: pos[0], scope, sampled: sample.length, graded: rows.length, oracleExcluded: sample.length - rows.length },
  codeweb: aggArm(rows, 'codeweb'),
  grep: aggArm(rows, 'grep'),
  impact: aggImpact(rows),
  tokensNote: 'tokens ~ bytes/4; cost = what the channel injects into the agent context',
  rows,
};
if (outPath) writeFileSync(resolve(outPath), JSON.stringify(result, null, 2));
console.log(`oracle-ab: ${rows.length} symbol(s) graded (of ${sample.length} sampled; oracle excluded ${sample.length - rows.length})`);
console.log(`  codeweb : recall ${result.codeweb.meanRecall}  precision ${result.codeweb.meanPrecision}  cost ${Math.round(result.codeweb.totalBytes / 1024)}KB total (${Math.round(result.codeweb.meanBytes / 1024 * 10) / 10}KB/task)`);
console.log(`  grep    : recall ${result.grep.meanRecall}  precision ${result.grep.meanPrecision}  cost ${Math.round(result.grep.totalBytes / 1024)}KB total (${Math.round(result.grep.meanBytes / 1024 * 10) / 10}KB/task)`);
const wins = rows.filter((r) => r.codeweb.recall >= r.grep.recall).length;
console.log(`  per-task: codeweb recall >= grep on ${wins}/${rows.length}`);
