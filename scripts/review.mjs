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
import { incrementalOverlap } from './lib/dup-check.mjs'; // F3: duplication-delta in the edit gate
import { loadSimilarIndex } from './lib/similar-index.mjs'; // finding #26: serve the dup-check pool from the map-time sidecar

const USAGE = 'usage: review.mjs <graph.json> (--changed <file[:s-e],...> | --range <gitref>) [--before <graph.json>] [--gate] [--json]';
import { die, emitJson, finish, loadGraph, parseArgs } from './lib/cli.mjs';

// finding 24: THE flag loop (lib/cli.mjs parseArgs) — one unknown-flag policy, --help included.
const { opts, pos } = parseArgs(process.argv.slice(2), {
  usage: USAGE,
  flags: {
    json: { type: 'bool', default: false },
    gate: { type: 'bool', default: false },
    changed: { type: 'string', default: null },
    range: { type: 'string', default: null },
    before: { type: 'string', default: null },
  },
});
const { json, gate, changed, range, before } = opts;
const graphPath = pos[0];
if (!graphPath || (changed == null && range == null)) die(USAGE, 2);

const load = (p) => loadGraph(p).graph; // Spec E: one truth with every other CLI (was a duplicated pre-loadGraph copy)
const { graph, abs } = loadGraph(graphPath); // abs feeds loadSimilarIndex (finding #26)

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
// F3: duplication delta — when the target source is readable, body-confirm whether any CHANGED symbol
// now duplicates an existing one (the overlap delta a refreshed graph's overlaps:[] cannot show). A
// new body-confirmed duplication is a regression (fails --gate), closing the prevent-duplication hole.
const root = graph.meta?.root;
// finding #26: serve the pool from the map-time sidecar when it's stamp-fresh; a stale/absent stamp
// yields null and incrementalOverlap runs the live path unchanged (fall back toward correctness). The
// changed symbols always shingle live regardless. Until WS-F #25 regenerates sidecars on refresh, the
// fresh path mostly engages after full maps — byte-identical either way.
const newDuplications = (root && existsSync(root)) ? incrementalOverlap(graph, impact.changedSymbols, { root, similarIndex: loadSimilarIndex(abs) }) : [];
if (newDuplications.length) hasRegression = true;

// F1/API §5: the labeled verdict object — same fields as diff/simulate/codemod, so "the gate"
// names one thing everywhere. Without --before this run can only see duplication; the check
// label says so instead of implying the structural half ran.
const expOf = new Map(graph.nodes.map((n) => [n.id, !!n.exports]));
const verdict = {
  ok: !hasRegression,
  check: structural ? 'call-caller-preflight' : 'duplication-only',
  scope: 'full',
  checks: {
    newCycles: structural?.newCycles ?? [],
    lostCallers: (structural?.lostCallers ?? []).map((id) => ({ id, exported: expOf.get(id) || false, exempted: false })),
    newDuplications,
  },
};
const payload = { ...impact, filesChanged: hunks.map((h) => h.file).sort(), structural, newDuplications, verdict };
const code = (gate && hasRegression) ? 1 : 0;

if (json) { emitJson(payload, code); } else {

console.log(`codeweb review: ${impact.changedSymbols.length} changed symbol(s) across ${payload.filesChanged.length} file(s)`);
console.log(`  domains touched: ${impact.domainsTouched.join(', ') || '(none)'}`);
console.log(`  blast radius: ${impact.blastRadius.count} transitive dependent(s)`);
if (impact.callerCounts.length) {
  console.log('  highest-fan-in changed symbols (review first):');
  for (const c of impact.callerCounts.slice(0, 8)) console.log(`    ${c.callers} caller(s)  ${c.id}`);
}
if (structural) {
  if (structural.newCycles.length || structural.lostCallers.length) {
    console.log('  STRUCTURAL REGRESSIONS:');
    if (structural.newCycles.length) console.log(`    x ${structural.newCycles.length} new file cycle(s): ${structural.newCycles.map((c) => c.join('+')).join(', ')}`);
    if (structural.lostCallers.length) console.log(`    x ${structural.lostCallers.length} symbol(s) lost all callers: ${structural.lostCallers.join(', ')}`);
  } else console.log('  structural: ok — no new cycles or lost-caller regressions vs --before');
}
if (newDuplications.length) {
  console.log(`  NEW DUPLICATION (body-confirmed) — ${newDuplications.length}:`);
  for (const d of newDuplications) console.log(`    x ${d.id} duplicates ${d.dupOf} (${(d.sim * 100).toFixed(0)}%)`);
}
finish(code);
}
