#!/usr/bin/env node
// Spec M (docs/specs/pilot-budgeted-rerun.md) — pilot graph pre-flight. Before spending agents,
// prove every frozen-truth symbolId still resolves in the freshly rebuilt graphs, and print the
// current --dependents count against the frozen truth size per target. Engine drift in the COUNT
// is expected (it is part of what the re-run measures); an id that no longer RESOLVES means the
// run would grade garbage — exit 2 and say which one.
//
//   node bench/experiments/efficiency-pilot.preflight.mjs --graphs <dir> --truth <truth.json>
//
// <dir> holds one subdir per repo (e.g. <dir>/axios/graph.json), matching the harness's layout.

import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const argv = process.argv.slice(2);
let graphsDir = null, truthPath = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--graphs') graphsDir = resolve(argv[++i]);
  else if (argv[i] === '--truth') truthPath = resolve(argv[++i]);
}
if (!graphsDir || !truthPath) {
  console.error('usage: efficiency-pilot.preflight.mjs --graphs <dir> --truth <truth.json>');
  process.exit(2);
}

const truth = JSON.parse(readFileSync(truthPath, 'utf8'));
const targets = Object.entries(truth.targets || {});
if (!targets.length) { console.error('truth file has no targets'); process.exit(2); }

let failed = 0;
for (const [taskId, t] of targets) {
  const graph = join(graphsDir, t.repo, 'graph.json');
  if (!existsSync(graph)) { console.error(`[preflight] ${taskId}: graph missing at ${graph}`); failed++; continue; }
  const r = spawnSync(process.execPath,
    [join(ROOT, 'scripts', 'query.mjs'), graph, '--dependents', t.symbolId, '--json'],
    { encoding: 'utf8', maxBuffer: 1 << 26 });
  let payload = null;
  try { payload = JSON.parse(r.stdout); } catch { /* fall through to the failure branch */ }
  if (r.status !== 0 || !payload || !payload.matched) {
    console.error(`[preflight] ${taskId}: symbolId '${t.symbolId}' unresolved in ${graph}${r.stderr ? ` — ${r.stderr.trim().split('\n')[0]}` : ''}`);
    failed++;
    continue;
  }
  const truthN = (t.truth || []).length;
  console.log(`[preflight] ${taskId}: dependents ${payload.count} vs truth ${truthN} (delta ${payload.count - truthN >= 0 ? '+' : ''}${payload.count - truthN}) — ${t.symbolId}`);
}
if (failed) { console.error(`[preflight] ${failed} target(s) failed — do NOT launch the run`); process.exit(2); }
console.log(`[preflight] all ${targets.length} targets resolve — clear to launch`);
