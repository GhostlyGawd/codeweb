#!/usr/bin/env node
// finding #38 — editor CodeLens timing. Loads a graph.json, finds the worst file (most mapped
// symbols → most blast walks), and times lensesForFile cold (empty blastMemo) and warm (memo hot).
// The <40 ms-per-file evidence tool. Dev-only; not wired into CI.
//
//   node bench/experiments/lens-bench.mjs /path/to/graph.json [--top N]
//
// lens-core is CommonJS (the extension folder installs standalone); import it via createRequire.
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildLensIndex, lensesForFile } = require('../../editor/vscode-codeweb/lens-core.js');

const args = process.argv.slice(2);
const topN = (() => { const i = args.indexOf('--top'); return i >= 0 ? Number(args[i + 1]) : 5; })();
const graphPath = args.find((a) => !a.startsWith('--') && a !== String(topN));
if (!graphPath) { console.error('usage: lens-bench.mjs <graph.json> [--top N]'); process.exit(1); }

const graph = JSON.parse(readFileSync(graphPath, 'utf8'));
const t0 = performance.now();
const index = buildLensIndex(graph);
const buildMs = performance.now() - t0;

// worst file = most mapped symbols
const files = [...index.byFile.entries()].map(([f, arr]) => [f, arr.length]).sort((a, b) => b[1] - a[1]);
const [worst, worstCount] = files[0];

// cold: fresh index (empty memo) so blast walks actually run
const coldIx = buildLensIndex(graph);
const c0 = performance.now();
const lenses = lensesForFile(coldIx, worst);
const coldMs = performance.now() - c0;
// warm: same index, memo now hot
const w0 = performance.now();
lensesForFile(coldIx, worst);
const warmMs = performance.now() - w0;

// whole-repo cold pass (every file once) on a fresh index — the refresh-all cost
const allIx = buildLensIndex(graph);
const a0 = performance.now();
let totalLenses = 0;
for (const f of index.byFile.keys()) totalLenses += lensesForFile(allIx, f).length;
const allMs = performance.now() - a0;

const nodes = (graph.nodes || []).length, edges = (graph.edges || []).length;
console.log(`graph: ${nodes} nodes, ${edges} edges, ${index.byFile.size} mapped files`);
console.log(`index build: ${buildMs.toFixed(1)} ms`);
console.log(`worst file "${worst}" (${worstCount} symbols, ${lenses.length} lenses):`);
console.log(`  cold: ${coldMs.toFixed(2)} ms   warm: ${warmMs.toFixed(2)} ms`);
console.log(`whole-repo cold pass: ${allMs.toFixed(1)} ms for ${totalLenses} lenses across ${index.byFile.size} files`);
console.log(`  → ${(allMs / buildMs).toFixed(1)}× a single index build`);
console.log('top files by symbol count:');
for (const [f, c] of files.slice(0, topN)) console.log(`  ${c}\t${f}`);
