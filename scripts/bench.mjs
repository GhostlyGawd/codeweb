#!/usr/bin/env node
// codeweb bench — run the grep-vs-codeweb comparison on YOUR repo, graded by YOUR compiler.
//
// The published oracle A/B (bench/results/oracle-ab.json) is a paper artifact; this is the same
// engine (scripts/lib/bench-core.mjs, shared verbatim) packaged as a product command, so anyone
// can generate their own evidence — and a recall dip on a real repo is a bug report with a
// built-in reproducer.
//
//   Q1  "who depends on X?"        cost per task + (TS repos) recall/precision vs the compiler
//   Q2  "what transitively breaks?" one budgeted impact call vs the recursive grep loop
//
// usage: bench.mjs <graph.json> [--scope <rel>] [--n 30] [--seed 42] [--json] [--out <file>]
//   --scope   repo-relative dir to sample from (default: the whole mapped root)
//   --n       symbols to sample (default 30; deterministic given --seed)
//   --json    emit the full result object instead of the text summary
//   --out     also write the result object to a file
// Optional at runtime: ripgrep (grep arm; absent -> reported unavailable) and the `typescript`
// package resolvable from cwd or TS_MODULE (compiler grading; absent -> cost-only).

import { writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { die, emitJson, emitText, loadGraph } from './lib/cli.mjs';
import { buildIndex } from './lib/graph-ops.mjs';
import { loadTypescript, rgAvailable, sampleSymbols, makeTsOracle, codewebArm, grepArm, score, impactCost, mean, aggArm, aggImpact } from './lib/bench-core.mjs';

const argv = process.argv.slice(2);
const USAGE = 'usage: bench.mjs <graph.json> [--scope <rel>] [--n 30] [--seed 42] [--json] [--out <file>]';
let n = 30, seed = 42, scopeArg = '', outPath = null, asJson = false; const pos = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--n') n = Math.max(1, parseInt(argv[++i], 10) || 30);
  else if (argv[i] === '--seed') seed = parseInt(argv[++i], 10) || 42;
  else if (argv[i] === '--scope') scopeArg = String(argv[++i] || '').replace(/^\/+|\/+$/g, '');
  else if (argv[i] === '--out') outPath = argv[++i];
  else if (argv[i] === '--json') asJson = true;
  else if (!argv[i].startsWith('-')) pos.push(argv[i]);
}
const { graph } = loadGraph(pos[0], { usage: USAGE });
const index = buildIndex(graph);
const root = graph.meta?.root;
if (!root || !existsSync(root)) die('graph.meta.root missing or absent on disk — bench needs the mapped source (rebuild the graph where the source lives)', 2);
const srcRoot = scopeArg ? join(root, scopeArg) : root;
if (!existsSync(srcRoot)) die(`--scope not found under the mapped root: ${srcRoot}`, 2);
const scope = scopeArg;

const { sample } = sampleSymbols(graph, index, { scope, n, seed });
if (!sample.length) die(`no benchable symbols in scope "${scope || '(whole repo)'}" — need exported product functions/classes with fan-in >= 3 (is the graph fresh? is the scope right?)`, 2);

// oracle: optional, TS-only (the compiler grades its own language)
const ts = loadTypescript();
let oracle = null, oracleReason = 'typescript not resolvable from cwd (npm i typescript, or set TS_MODULE)';
if (ts) {
  const o = makeTsOracle(ts, { srcRoot, graphRoot: root });
  if (o.tsFileCount > 0) { oracle = o; oracleReason = null; }
  else oracleReason = 'no TypeScript files in scope — cost-only (grading needs a compiler oracle)';
}

const hasRg = rgAvailable();
const rows = [];
let oracleExcluded = 0;
for (const node of sample) {
  const truth = oracle ? oracle.oracleFiles(node) : undefined; // undefined = ungraded run, null = oracle couldn't resolve
  if (oracle && !truth) { oracleExcluded++; continue; }
  const cw = codewebArm(graph, index, node);
  cw.files.delete(node.file);
  const gr = hasRg ? grepArm(node, { srcRoot, graphRoot: root }) : null;
  const row = {
    symbol: node.id, label: node.label,
    codeweb: { files: cw.files.size, bytes: cw.bytes, pages: cw.pages },
    grep: gr ? { files: gr.files.size, bytes: gr.bytes } : null,
    impact: impactCost(graph, index, node, { srcRoot }),
  };
  if (oracle) {
    const truthNoDecl = new Set([...truth].filter((f) => f !== node.file));
    row.truthFiles = truthNoDecl.size;
    Object.assign(row.codeweb, score(cw.files, truthNoDecl));
    if (gr) Object.assign(row.grep, score(gr.files, truthNoDecl));
  }
  rows.push(row);
}
if (!rows.length) die(`oracle excluded all ${sample.length} sampled symbol(s) — nothing gradable (try a different --scope or --seed)`, 2);

const kb = (b) => `${Math.round(b / 1024 * 10) / 10}KB`;
const result = {
  design: 'grep-vs-codeweb on this repo, same engine as bench/results/oracle-ab.json: control=rg dump, treatment=codeweb --dependents (budgeted pages of 20); blast radius = one codeweb_impact call vs the graph-assisted recursive grep loop; grading (when available) = TS LanguageService references, file-level.',
  corpus: { root, scope: scope || '(whole repo)', sampled: sample.length, benched: rows.length, oracleExcluded, seed },
  oracle: oracle ? { available: true, gradedBy: 'typescript LanguageService' } : { available: false, reason: oracleReason },
  grepAvailable: hasRg,
  codeweb: oracle && hasRg ? aggArm(rows, 'codeweb') : {
    meanBytes: Math.round(mean(rows.map((r) => r.codeweb.bytes))),
    totalBytes: rows.reduce((s, r) => s + r.codeweb.bytes, 0),
    ...(oracle ? { meanRecall: +mean(rows.map((r) => r.codeweb.recall)).toFixed(3), meanPrecision: +mean(rows.map((r) => r.codeweb.precision)).toFixed(3) } : {}),
  },
  grep: hasRg ? (oracle ? aggArm(rows, 'grep') : {
    meanBytes: Math.round(mean(rows.map((r) => r.grep.bytes))),
    totalBytes: rows.reduce((s, r) => s + r.grep.bytes, 0),
  }) : { unavailable: 'ripgrep (rg) not on PATH' },
  impact: hasRg ? aggImpact(rows) : {
    meanImpactSize: Math.round(mean(rows.map((r) => r.impact.impactSize))),
    codewebMeanBytes: Math.round(mean(rows.map((r) => r.impact.codewebBytes))),
    grepUnavailable: 'ripgrep (rg) not on PATH',
  },
  tokensNote: 'tokens ~ bytes/4; cost = what the channel injects into the agent context',
  rows,
};
if (outPath) writeFileSync(resolve(outPath), JSON.stringify(result, null, 2));
if (asJson) { emitJson(result); }
else {
  const L = [];
  L.push(`codeweb bench — ${root}  (scope: ${scope || 'whole repo'}, ${rows.length} symbols, seed ${seed})`);
  L.push('');
  L.push('  Q1 "who depends on X?" — context cost per task');
  L.push(`    codeweb  ${kb(result.codeweb.meanBytes)}/task  (budgeted pages, as MCP serves it)`);
  if (hasRg) {
    const ratio = result.codeweb.meanBytes ? (result.grep.meanBytes / result.codeweb.meanBytes).toFixed(1) : '—';
    L.push(`    grep     ${kb(result.grep.meanBytes)}/task  (the rg dump an agent must read)   ${ratio}x more context`);
  } else L.push('    grep     unavailable (install ripgrep to compare)');
  if (oracle) {
    L.push(`    graded by the TypeScript compiler (${rows.length}/${sample.length} oracle-resolvable):`);
    L.push(`      codeweb  recall ${result.codeweb.meanRecall}  precision ${result.codeweb.meanPrecision}`);
    if (hasRg) {
      L.push(`      grep     recall ${result.grep.meanRecall}  precision ${result.grep.meanPrecision}`);
      const wins = rows.filter((r) => r.codeweb.recall >= r.grep.recall).length;
      L.push(`      per-task recall: codeweb >= grep on ${wins}/${rows.length}`);
    }
  } else L.push(`    ungraded — ${oracleReason}`);
  L.push('');
  L.push('  Q2 "what transitively breaks?" — blast radius');
  L.push(`    codeweb  ${kb(result.impact.codewebMeanBytes)}/call  (one budgeted impact call, mean closure ${result.impact.meanImpactSize} symbols)`);
  if (hasRg) L.push(`    grep     ${kb(result.impact.grepMeanBytes)}/loop  (${result.impact.grepMeanRounds} rounds, graph-assisted lower bound)   ${result.impact.costRatio}x more context`);
  else L.push('    grep     unavailable (install ripgrep to compare)');
  if (outPath) { L.push(''); L.push(`  full rows: ${resolve(outPath)}`); }
  emitText(L.join('\n'));
}
