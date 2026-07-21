#!/usr/bin/env node
// codeweb coverage CLI (#13) — annotate a graph with MEASURED execution from a coverage report:
//   node scripts/coverage.mjs <graph.json> <lcov.info|coverage-final.json> [more reports...] [--json]
// After this, explain/tests/context answers say "covered (peak N hits)" or "NOT covered by the
// recorded run" instead of relying on name/path heuristics alone. Node's own runner emits the
// input directly: `node --test --experimental-test-coverage --test-reporter=lcov > lcov.info`.
// Optional and explicit (like --churn): never runs in the deterministic pipeline by default;
// codeweb_refresh re-extracts nodes, so re-annotate after a refresh. Exit: 0 ok, 2 usage/IO.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseLcov, parseIstanbul, annotateCoverage } from './lib/coverage.mjs';

const USAGE = 'usage: coverage.mjs <graph.json> <lcov.info|coverage-final.json> [more...] [--json]';
if (process.argv.includes('--help') || process.argv.includes('-h')) { console.log(USAGE); process.exit(0); } // #5: every CLI answers --help
import { die, emitJson, emitText, finish, loadGraph } from './lib/cli.mjs';

const argv = process.argv.slice(2);
let json = false; const pos = [];
for (const t of argv) { if (t === '--json') json = true; else if (!t.startsWith('-')) pos.push(t); else die(USAGE, 2); }
if (pos.length < 2) die(USAGE, 2);

const { graph, abs } = loadGraph(pos[0], { usage: USAGE });

const covFiles = new Map();
const labels = [];
for (const reportPath of pos.slice(1)) {
  const p = resolve(reportPath);
  let text;
  try { text = readFileSync(p, 'utf8'); } catch (e) { die(`coverage report unreadable: ${p}: ${e.message}`, 2); }
  let parsed;
  if (text.trimStart().startsWith('{')) {
    try { parsed = parseIstanbul(JSON.parse(text)); } catch (e) { die(`invalid coverage JSON in ${p}: ${e.message}`, 2); }
  } else {
    parsed = parseLcov(text);
  }
  if (!parsed.size) die(`no coverage records found in ${p} (expected lcov SF:/DA: lines or an istanbul/c8 JSON map)`, 2);
  for (const [f, lines] of parsed) {
    const prev = covFiles.get(f);
    if (!prev) covFiles.set(f, lines);
    else for (const [l, h] of lines) prev.set(l, Math.max(prev.get(l) || 0, h));
  }
  labels.push(reportPath.replace(/\\/g, '/').split('/').pop());
}

const summary = annotateCoverage(graph, covFiles, labels.join('+'));
writeFileSync(abs, JSON.stringify(graph, null, 2));

const line = `codeweb coverage: ${summary.filesMapped} file(s) mapped, ${summary.symbolsCovered}/${summary.symbolsSeen} instrumented symbol(s) covered — annotated ${abs}`;
if (json) { emitJson({ ok: true, graph: abs, ...summary, note: 'explain/tests/context answers now carry measured-coverage facts; re-annotate after codeweb_refresh' }); }
else { emitText(line); }
