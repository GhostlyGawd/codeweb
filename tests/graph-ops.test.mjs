// Direct unit tests for scripts/lib/graph-ops.mjs — the pure graph primitives shared by
// query.mjs and diff.mjs. Unlike the engine CLIs (tested as subprocesses), this is an importable
// pure module, so we test it directly: this pins the function signatures the CLI adapters depend
// on (a guarantee the subprocess tests cannot give) and locks the iterative-Tarjan + recursion
// safety the reviewer flagged.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeGraph, buildIndex, resolveSymbol, callersOf, calleesOf, impactOf, impactCountOf,
  allBlastCounts, fileCycles, orphans, structuralRegressions,
} from '../scripts/lib/graph-ops.mjs';
import { prng, randomGraph, randomOp, naiveApply } from './_proptest.mjs';

test('normalizeGraph fills sane defaults (mirrors build-report)', () => {
  const g = normalizeGraph({ nodes: [{ id: 'x.js:f', label: 'f' }] });
  assert.equal(g.nodes[0].exports, false, 'missing exports -> false');
  assert.equal(g.nodes[0].domain, 'unassigned', 'missing domain -> unassigned');
  assert.equal(g.nodes[0].file, '', 'missing file -> empty string');
  assert.ok(Array.isArray(g.edges) && Array.isArray(g.overlaps), 'missing top-level arrays defaulted');
});

test('buildIndex separates call adjacency from any-incoming (call|import)', () => {
  const g = normalizeGraph({
    nodes: [{ id: 'a.js:m', file: 'a.js' }, { id: 'b.js:h', file: 'b.js' }],
    edges: [{ from: 'a.js:m', to: 'b.js:h', kind: 'call' }, { from: 'a.js:m', to: 'b.js:h', kind: 'import' }],
  });
  const ix = buildIndex(g);
  assert.deepEqual([...ix.callIn.get('b.js:h')], ['a.js:m']);
  assert.deepEqual([...ix.callOut.get('a.js:m')], ['b.js:h']);
  assert.ok(ix.hasIncoming.has('b.js:h'), 'call or import in-edge marks incoming');
});

test('resolveSymbol: exact id wins; else all label matches (sorted); else []', () => {
  const g = normalizeGraph({
    nodes: [{ id: 'b.js:h', label: 'h', file: 'b.js' }, { id: 'c.js:h', label: 'h', file: 'c.js' }, { id: 'a.js:m', label: 'm', file: 'a.js' }],
    edges: [],
  });
  assert.deepEqual(resolveSymbol(g, 'a.js:m'), ['a.js:m']);
  assert.deepEqual(resolveSymbol(g, 'h'), ['b.js:h', 'c.js:h']);
  assert.deepEqual(resolveSymbol(g, 'nope'), []);
});

test('callersOf / calleesOf use only call edges, sorted + unioned', () => {
  const g = normalizeGraph({
    nodes: [{ id: 'a.js:m', file: 'a.js' }, { id: 'b.js:h', file: 'b.js' }, { id: 'x.js:i', file: 'x.js' }],
    edges: [{ from: 'a.js:m', to: 'b.js:h', kind: 'call' }, { from: 'x.js:i', to: 'b.js:h', kind: 'import' }],
  });
  const ix = buildIndex(g);
  assert.deepEqual(callersOf(ix, ['b.js:h']), ['a.js:m'], 'import edge x->h excluded');
  assert.deepEqual(calleesOf(ix, ['a.js:m']), ['b.js:h']);
});

test('impactOf is transitive, excludes seeds, and terminates on self-loops', () => {
  const g = normalizeGraph({
    nodes: [{ id: 'r.js:loop', file: 'r.js' }, { id: 'r.js:c', file: 'r.js' }, { id: 'r.js:cc', file: 'r.js' }],
    edges: [
      { from: 'r.js:loop', to: 'r.js:loop', kind: 'call' }, // self-loop must not hang
      { from: 'r.js:c', to: 'r.js:loop', kind: 'call' },
      { from: 'r.js:cc', to: 'r.js:c', kind: 'call' },
    ],
  });
  assert.deepEqual(impactOf(buildIndex(g), ['r.js:loop']), ['r.js:c', 'r.js:cc']);
});

test('fileCycles: file-level SCCs (>=2), sorted + deterministic; same-file self-call ignored', () => {
  const g = normalizeGraph({
    nodes: [
      { id: 'x.js:a', file: 'x.js' }, { id: 'y.js:b', file: 'y.js' },
      { id: 'p.js:a', file: 'p.js' }, { id: 'q.js:b', file: 'q.js' },
      { id: 'z.js:a', file: 'z.js' }, { id: 'z.js:b', file: 'z.js' },
    ],
    edges: [
      { from: 'x.js:a', to: 'y.js:b', kind: 'import' }, { from: 'y.js:b', to: 'x.js:a', kind: 'import' },
      { from: 'p.js:a', to: 'q.js:b', kind: 'call' }, { from: 'q.js:b', to: 'p.js:a', kind: 'call' },
      { from: 'z.js:a', to: 'z.js:b', kind: 'call' }, { from: 'z.js:b', to: 'z.js:a', kind: 'call' }, // same file -> not a cycle
    ],
  });
  assert.deepEqual(fileCycles(g), [['p.js', 'q.js'], ['x.js', 'y.js']]);
});

test('orphans: zero incoming (call|import) AND not exported', () => {
  const g = normalizeGraph({
    nodes: [
      { id: 'a.js:used', file: 'a.js', domain: 'd', exports: false },
      { id: 'a.js:dead', file: 'a.js', domain: 'd', exports: false },
      { id: 'a.js:pub', file: 'a.js', domain: 'd', exports: true },
    ],
    edges: [{ from: 'a.js:pub', to: 'a.js:used', kind: 'call' }],
  });
  const ix = buildIndex(g);
  assert.deepEqual(orphans(g, ix).map((o) => o.id), ['a.js:dead'], 'used has a caller; pub is exported');
});

// ---- structuralRegressions: the "trusted oracle" the SE-FAITHFUL anti-cheat design leans on.
// Pin its semantics directly (C1) so its correctness isn't merely implied by the post-edit hook
// tests. Hand cases for the exact rules, then invariants over random before/after pairs.
test('structuralRegressions: a surviving node that loses its only caller is a lostCaller; a deleted one is not', () => {
  const before = normalizeGraph({
    nodes: [{ id: 'a.js:f', file: 'a.js' }, { id: 'b.js:g', file: 'b.js' }, { id: 'c.js:h', file: 'c.js' }],
    edges: [{ from: 'a.js:f', to: 'b.js:g', kind: 'call' }, { from: 'a.js:f', to: 'c.js:h', kind: 'call' }],
  });
  // delete f and h: g survives with no callers (regression); h is gone (not a regression).
  const after = normalizeGraph({ nodes: [{ id: 'a.js:f', file: 'a.js' }, { id: 'b.js:g', file: 'b.js' }], edges: [] });
  assert.deepEqual(structuralRegressions(before, after), { newCycles: [], lostCallers: ['b.js:g'] });
});

test('structuralRegressions: a file cycle present only in after is a newCycle', () => {
  const before = normalizeGraph({
    nodes: [{ id: 'x.js:a', file: 'x.js' }, { id: 'y.js:b', file: 'y.js' }],
    edges: [{ from: 'x.js:a', to: 'y.js:b', kind: 'call' }],
  });
  const after = normalizeGraph({
    nodes: [{ id: 'x.js:a', file: 'x.js' }, { id: 'y.js:b', file: 'y.js' }],
    edges: [{ from: 'x.js:a', to: 'y.js:b', kind: 'call' }, { from: 'y.js:b', to: 'x.js:a', kind: 'call' }],
  });
  assert.deepEqual(structuralRegressions(before, after), { newCycles: [['x.js', 'y.js']], lostCallers: [] });
});

test('structuralRegressions (property): lostCallers ⊆ surviving before-nodes, newCycles ∉ before-cycles', () => {
  const rng = prng(909);
  const cycKey = (c) => c.join('|');
  for (let i = 0; i < 300; i++) {
    const before = normalizeGraph(randomGraph(rng));
    const after = naiveApply(before, randomOp(rng, before)); // any structural edit
    const { newCycles, lostCallers } = structuralRegressions(before, after);
    const beforeIds = new Set(before.nodes.map((n) => n.id));
    const afterIds = new Set(after.nodes.map((n) => n.id));
    const beforeCyc = new Set(fileCycles(before).map(cycKey));
    for (const id of lostCallers) {
      assert.ok(beforeIds.has(id) && afterIds.has(id), `lostCaller ${id} must exist before AND after (case ${i})`);
    }
    for (const c of newCycles) assert.ok(!beforeCyc.has(cycKey(c)), `newCycle ${cycKey(c)} was already present before (case ${i})`);
  }
});

// Perf-quality finding 9 — three blast-radius implementations, one truth. impactOf got an
// index-pointer queue (shift() was O(frontier) per pop), impactCountOf skips the materialize/
// sort, and allBlastCounts computes every node's count in one SCC + 64-wide bit-parallel pass
// (risk's per-node BFS loop was ~quadratic: 82.2s at 15k nodes). Random graphs — including
// cycles, inherit edges, and dangling edge sources — must agree exactly across all three.
test('finding 9: allBlastCounts / impactCountOf agree with per-node impactOf on random graphs', () => {
  const rng = prng(0xB1A57);
  for (let c = 0; c < 25; c++) {
    const n = 3 + Math.floor(rng() * 38);
    const nodes = Array.from({ length: n }, (_, i) => ({ id: `f${i % 5}.js:s${i}`, label: `s${i}`, kind: 'function', file: `f${i % 5}.js`, line: i + 1, loc: 1, exports: true, domain: 'd' }));
    const ids = nodes.map((x) => x.id);
    const edges = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if (i !== j && rng() < 0.12) edges.push({ from: ids[i], to: ids[j], kind: rng() < 0.85 ? 'call' : 'inherit' });
    }
    if (rng() < 0.5) edges.push({ from: 'ghost.js:phantom', to: ids[0], kind: 'call' }); // dangling from participates in BFS
    const g = normalizeGraph({ meta: {}, nodes, edges, domains: [], overlaps: [] });
    const index = buildIndex(g);
    const all = allBlastCounts(index);
    for (const id of ids) {
      const oracle = impactOf(index, [id]).length;
      assert.equal(all.get(id), oracle, `case ${c}: allBlastCounts(${id})`);
      assert.equal(impactCountOf(index, [id]), oracle, `case ${c}: impactCountOf(${id})`);
    }
  }
});
