#!/usr/bin/env node
// codeweb review (F5) — turn a change into a deterministic STRUCTURAL review. Maps changed line
// ranges to the symbols whose body span they touch, then reports the blast radius, domains touched,
// and per-symbol caller counts (review-prioritization). With --before, adds the structural delta
// (new file cycles + symbols that lost all callers — the structuralRegressions subset, NOT the
// overlap delta a refreshed graph can't populate). Read-only, deterministic. Built on graph-ops.
//
// Usage:
//   node review.mjs <graph.json> --changed <file[:s-e],...>   # explicit hunks (file = whole file)
//   node review.mjs <graph.json> --range <gitref>             # derive hunks via git diff --unified=0
//   ... [--before <graph.json>] [--gate] [--json]
// Exit: 0 ok (advisory), 1 with --gate when a structural regression is present, 2 usage/IO.
//
// NOTE: changed-symbol selection uses the extractor's recorded [line, line+loc-1] span, which is
// best-effort (loc is clamped/brace-matched); it can under-select on truncated bodies. --range path
// assumes the graph's file paths match git's (graph mapped at the repo root).

import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { normalizeGraph, reviewImpact, structuralRegressions } from './lib/graph-ops.mjs';

const USAGE = 'usage: review.mjs <graph.json> (--changed <file[:s-e],...> | --range <gitref>) [--before <graph.json>] [--gate] [--json]';
function die(msg, code) { console.error(msg); process.exit(code); }

const argv = process.argv.slice(2);
let json = false, gate = false, changed = null, range = null, before = null; const pos = [];
for (let i = 0; i < argv.length; i++) {
  const t = argv[i];
  if (t === '--json') json = true;
  else if (t === '--gate') gate = true;
  else if (t === '--changed') changed = argv[++i];
  else if (t === '--range') range = argv[++i];
  else if (t === '--before') before = argv[++i];
  else if (!t.startsWith('-')) pos.push(t);
}
const graphPath = pos[0];
if (!graphPath || (changed == null && range == null)) die(USAGE, 2);

function load(p) {
  const a = resolve(p);
  if (!existsSync(a)) die(`graph not found: ${a}`, 2);
  try { return normalizeGraph(JSON.parse(readFileSync(a, 'utf8'))); }
  catch (e) { die(`invalid JSON in ${a}: ${e.message}`, 2); }
}
const graph = load(graphPath);

// build hunks from --changed (explicit) or --range (git)
function parseChanged(csv) {
  const fileRanges = new Map(); // file -> [[s,e]...] | 'whole'
  for (const entry of csv.split(',').map((s) => s.trim()).filter(Boolean)) {
    const ci = entry.indexOf(':');
    if (ci === -1) { fileRanges.set(entry, 'whole'); continue; }
    const file = entry.slice(0, ci), rng = entry.slice(ci + 1);
    if (fileRanges.get(file) === 'whole') continue;
    const m = /^(\d+)-(\d+)$/.exec(rng);
    if (!m) die(`bad range in --changed (want file:start-end): ${entry}`, 2);
    const arr = fileRanges.get(file) || []; arr.push([+m[1], +m[2]]); fileRanges.set(file, arr);
  }
  return [...fileRanges].map(([file, v]) => ({ file, ranges: v === 'whole' ? null : v }));
}
function hunksFromGit(ref) {
  const r = spawnSync('git', ['diff', '--unified=0', ref], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0) die(`git diff failed: ${(r.stderr || '').trim()}`, 2);
  const byFile = new Map(); let cur = null;
  for (const line of r.stdout.split(/\r?\n/)) {
    let m;
    if ((m = /^\+\+\+ b\/(.+)$/.exec(line))) { cur = m[1] === '/dev/null' ? null : m[1]; if (cur && !byFile.has(cur)) byFile.set(cur, []); }
    else if (cur && (m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line))) {
      const start = +m[1], len = m[2] === undefined ? 1 : +m[2];
      byFile.get(cur).push([start, start + Math.max(len, 1) - 1]);
    }
  }
  return [...byFile].map(([file, ranges]) => ({ file, ranges }));
}
const hunks = range != null ? hunksFromGit(range) : parseChanged(changed);

const impact = reviewImpact(graph, hunks);
let structural = null, hasRegression = false;
if (before != null) {
  const sr = structuralRegressions(load(before), graph);
  structural = sr;
  hasRegression = sr.newCycles.length > 0 || sr.lostCallers.length > 0;
}

const payload = { ...impact, filesChanged: hunks.map((h) => h.file).sort(), structural };
const code = (gate && hasRegression) ? 1 : 0;

if (json) { process.stdout.write(JSON.stringify(payload) + '\n'); process.exit(code); }

console.log(`codeweb review: ${impact.changedSymbols.length} changed symbol(s) across ${payload.filesChanged.length} file(s)`);
console.log(`  domains touched: ${impact.domainsTouched.join(', ') || '(none)'}`);
console.log(`  blast radius: ${impact.blastRadius.count} transitive dependent(s)`);
if (impact.callerCounts.length) {
  console.log('  highest-fan-in changed symbols (review first):');
  for (const c of impact.callerCounts.slice(0, 8)) console.log(`    ${c.callers} caller(s)  ${c.id}`);
}
if (structural) {
  if (hasRegression) {
    console.log('  STRUCTURAL REGRESSIONS:');
    if (structural.newCycles.length) console.log(`    x ${structural.newCycles.length} new file cycle(s): ${structural.newCycles.map((c) => c.join('+')).join(', ')}`);
    if (structural.lostCallers.length) console.log(`    x ${structural.lostCallers.length} symbol(s) lost all callers: ${structural.lostCallers.join(', ')}`);
  } else console.log('  structural: ok — no new cycles or lost-caller regressions vs --before');
}
process.exit(code);
