// F5 — review (git-range structural review). Tests first. ★ANTI-CHEAT RV-HUNK-MAP uses an inline
// interval-overlap oracle over random graphs+hunks; RV-BLAST-EXACT pins blastRadius to EXACTLY
// impactOf(changedSymbols) (not a superset — the whole-graph return would satisfy a superset check).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runNode, script, tmpDir, writeTree, cleanup } from './helpers.mjs';
import { prng, int, pick } from './_proptest.mjs';
import { normalizeGraph, buildIndex, impactOf } from '../scripts/lib/graph-ops.mjs';

const REVIEW = script('review.mjs');
const FILES = ['a.js', 'b.js', 'c.js'];

function makeGraph(rng, n) {
  const nodes = Array.from({ length: n }, (_, i) => {
    const f = pick(rng, FILES);
    return { id: `${f}:s${i}`, label: `s${i}`, kind: 'function', file: f, line: int(rng, 1, 40), loc: int(rng, 1, 8), exports: false, domain: pick(rng, ['x', 'y']) };
  });
  const ids = nodes.map((x) => x.id); const edges = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j && rng() < 0.12) edges.push({ from: ids[i], to: ids[j], kind: 'call' });
  return { meta: {}, nodes, edges, domains: [], overlaps: [] };
}
function makeHunks(rng) {
  const hunks = [];
  for (const f of FILES) if (rng() < 0.7) { const ranges = []; for (let i = int(rng, 1, 3); i > 0; i--) { const s = int(rng, 1, 40); ranges.push([s, s + int(rng, 0, 6)]); } hunks.push({ file: f, ranges }); }
  if (!hunks.length) hunks.push({ file: 'a.js', ranges: [[1, 40]] });
  return hunks;
}
const serializeChanged = (hunks) => hunks.flatMap((h) => h.ranges.map((r) => `${h.file}:${r[0]}-${r[1]}`)).join(',');
const write = (g) => { const dir = tmpDir('cw-rv-'); writeTree(dir, { 'graph.json': JSON.stringify(g) }); return { dir, graphPath: join(dir, 'graph.json') }; };

// inline interval-overlap oracle
function oracleChanged(g, hunks) {
  const byFile = new Map();
  for (const h of hunks) { if (!byFile.has(h.file)) byFile.set(h.file, []); byFile.get(h.file).push(...h.ranges); }
  const out = [];
  for (const n of g.nodes) {
    const rs = byFile.get(n.file); if (!rs) continue;
    const start = n.line, end = n.line + (n.loc || 1) - 1;
    if (rs.some((r) => !(end < r[0] || start > r[1]))) out.push(n.id);
  }
  return out.sort();
}

// ★ANTI-CHEAT · RV-HUNK-MAP (+ RV-BLAST-EXACT)
test('RV-HUNK-MAP: changedSymbols == inline interval-overlap oracle; RV-BLAST-EXACT: blast == impactOf (40 cases)', () => {
  const rng = prng(0x5EE);
  for (let c = 0; c < 40; c++) {
    const g = makeGraph(rng, int(rng, 5, 12));
    const hunks = makeHunks(rng);
    const { dir, graphPath } = write(g);
    try {
      const out = JSON.parse(runNode(REVIEW, [graphPath, '--changed', serializeChanged(hunks), '--json']).stdout);
      const expChanged = oracleChanged(g, hunks);
      assert.deepEqual(out.changedSymbols.slice().sort(), expChanged, `case ${c}: changedSymbols`);
      // RV-BLAST-EXACT: equality against the trusted (independently-pinned) impactOf, not a superset
      const idx = buildIndex(normalizeGraph(structuredClone(g)));
      assert.deepEqual(out.blastRadius.ids.slice().sort(), impactOf(idx, expChanged).slice().sort(), `case ${c}: blast exact`);
    } finally { cleanup(dir); }
  }
});

// RV-WHOLE-FILE: a files-only change selects exactly the nodes in those files.
test('RV-WHOLE-FILE: whole-file change selects exactly that file\'s nodes', () => {
  const g = {
    meta: {}, edges: [], domains: [], overlaps: [],
    nodes: [
      { id: 'a.js:one', label: 'one', kind: 'function', file: 'a.js', line: 1, loc: 3, exports: false, domain: 'x' },
      { id: 'a.js:two', label: 'two', kind: 'function', file: 'a.js', line: 10, loc: 2, exports: false, domain: 'x' },
      { id: 'b.js:three', label: 'three', kind: 'function', file: 'b.js', line: 1, loc: 5, exports: false, domain: 'y' },
    ],
  };
  const { dir, graphPath } = write(g);
  try {
    const out = JSON.parse(runNode(REVIEW, [graphPath, '--changed', 'a.js', '--json']).stdout);
    assert.deepEqual(out.changedSymbols.slice().sort(), ['a.js:one', 'a.js:two']);
  } finally { cleanup(dir); }
});

// SC3 + --gate: with --before, structural regressions (new cycle) are reported and --gate exits 1.
test('SC3/--gate: a new file cycle vs --before is reported and gates', () => {
  // before: a -> b (no cycle). after: a -> b and b -> a (cycle).
  const before = {
    meta: {}, domains: [], overlaps: [],
    nodes: [{ id: 'a.js:fa', label: 'fa', kind: 'function', file: 'a.js', line: 1, loc: 1, exports: true, domain: 'x' }, { id: 'b.js:fb', label: 'fb', kind: 'function', file: 'b.js', line: 1, loc: 1, exports: true, domain: 'y' }],
    edges: [{ from: 'a.js:fa', to: 'b.js:fb', kind: 'call' }],
  };
  const after = structuredClone(before);
  after.edges.push({ from: 'b.js:fb', to: 'a.js:fa', kind: 'call' }); // introduces a file cycle a<->b
  const dir = tmpDir('cw-rv-g-');
  try {
    writeTree(dir, { 'before.json': JSON.stringify(before), 'after.json': JSON.stringify(after) });
    const out = JSON.parse(runNode(REVIEW, [join(dir, 'after.json'), '--changed', 'b.js', '--before', join(dir, 'before.json'), '--json']).stdout);
    assert.ok(out.structural && out.structural.newCycles.length >= 1, 'new cycle reported');
    // --gate exits 1 on regression
    assert.equal(runNode(REVIEW, [join(dir, 'after.json'), '--changed', 'b.js', '--before', join(dir, 'before.json'), '--gate']).status, 1);
    // without --gate, advisory exit 0
    assert.equal(runNode(REVIEW, [join(dir, 'after.json'), '--changed', 'b.js', '--before', join(dir, 'before.json')]).status, 0);
  } finally { cleanup(dir); }
});

// RV-DETERMINISTIC
test('RV-DETERMINISTIC: identical inputs -> identical stdout', () => {
  const rng = prng(0x5E7);
  const g = makeGraph(rng, 8); const hunks = makeHunks(rng);
  const { dir, graphPath } = write(g);
  try {
    const ch = serializeChanged(hunks);
    assert.equal(runNode(REVIEW, [graphPath, '--changed', ch, '--json']).stdout, runNode(REVIEW, [graphPath, '--changed', ch, '--json']).stdout);
  } finally { cleanup(dir); }
});
