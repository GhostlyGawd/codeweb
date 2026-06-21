// Properties + units for graph-ops.applyEdit(graph, op) — the shared pure edit-simulation primitive
// behind simulate-edit and optimize. Written BEFORE the implementation: applyEdit is not exported
// yet, so this suite fails to import until it is built. Cross-checks applyEdit against the
// independent naiveApply via the pre-tested structuralRegressions oracle (AE + SE-FAITHFUL core).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEdit, structuralRegressions, normalizeGraph, fileCycles } from '../scripts/lib/graph-ops.mjs';
import { prng, randomGraph, randomOp, naiveApply } from './_proptest.mjs';

const nodeIds = (g) => g.nodes.map((n) => n.id).sort();
const edgeKeys = (g) => g.edges.map((e) => `${e.from} ${e.to} ${e.kind}`).sort();

test('AE-IMMUTABLE: applyEdit never mutates its argument', () => {
  const rng = prng(1);
  for (let i = 0; i < 100; i++) {
    const g = randomGraph(rng);
    const snap = JSON.stringify(g);
    const op = randomOp(rng, g);
    applyEdit(g, op);
    assert.equal(JSON.stringify(g), snap, `applyEdit mutated the input on op ${JSON.stringify(op)}`);
  }
});

test('AE-DELETE: removes exactly the named nodes and every edge touching them', () => {
  const g = {
    nodes: [{ id: 'a.js:x', file: 'a.js', line: 1, loc: 1 }, { id: 'b.js:y', file: 'b.js', line: 1, loc: 1 }],
    edges: [{ from: 'b.js:y', to: 'a.js:x', kind: 'call' }],
  };
  const out = applyEdit(g, { kind: 'delete', ids: ['a.js:x'] });
  assert.deepEqual(nodeIds(out), ['b.js:y']);
  assert.deepEqual(edgeKeys(out), [], 'edge into the deleted node is gone');
});

test('AE-MERGE: drops non-canonical copies, redirects in AND out edges, drops self-loops, de-dups', () => {
  const g = {
    nodes: [
      { id: 'a.js:dup', file: 'a.js', line: 1, loc: 1 }, { id: 'b.js:dup', file: 'b.js', line: 1, loc: 1 },
      { id: 'c.js:caller', file: 'c.js', line: 1, loc: 1 }, { id: 'e.js:leaf', file: 'e.js', line: 1, loc: 1 },
    ],
    edges: [
      { from: 'c.js:caller', to: 'a.js:dup', kind: 'call' },
      { from: 'c.js:caller', to: 'b.js:dup', kind: 'call' }, // both redirect to canonical -> de-dup to one
      { from: 'a.js:dup', to: 'b.js:dup', kind: 'call' },    // becomes a self-loop -> dropped
      { from: 'b.js:dup', to: 'e.js:leaf', kind: 'call' },   // OUTGOING edge of the dropped copy -> must redirect to canonical
    ],
  };
  const out = applyEdit(g, { kind: 'merge', ids: ['a.js:dup', 'b.js:dup'], into: 'a.js:dup' });
  assert.deepEqual(nodeIds(out), ['a.js:dup', 'c.js:caller', 'e.js:leaf'], 'b.js:dup removed, canonical kept');
  assert.deepEqual(edgeKeys(out), ['a.js:dup e.js:leaf call', 'c.js:caller a.js:dup call'],
    'incoming redirected+de-duped, outgoing redirected, self-loop dropped');
});

test('AE-MERGE: a pre-existing self-call on a copy stays a self-loop and is dropped', () => {
  const g = {
    nodes: [{ id: 'a.js:rec', file: 'a.js', line: 1, loc: 1 }, { id: 'b.js:rec', file: 'b.js', line: 1, loc: 1 }],
    edges: [{ from: 'b.js:rec', to: 'b.js:rec', kind: 'call' }], // recursion on the dropped copy
  };
  const out = applyEdit(g, { kind: 'merge', ids: ['a.js:rec', 'b.js:rec'], into: 'a.js:rec' });
  assert.deepEqual(nodeIds(out), ['a.js:rec']);
  assert.deepEqual(edgeKeys(out), [], 'recursion maps canonical->canonical -> dropped, not kept as a self-call');
});

test('AE-MOVE: changes only the target node file; nothing else', () => {
  const g = {
    nodes: [{ id: 'a.js:x', file: 'a.js', line: 1, loc: 1 }, { id: 'b.js:y', file: 'b.js', line: 1, loc: 1 }],
    edges: [{ from: 'b.js:y', to: 'a.js:x', kind: 'call' }],
  };
  const out = applyEdit(g, { kind: 'move', id: 'a.js:x', to: 'z/new.js' });
  assert.equal(out.nodes.find((n) => n.id === 'a.js:x').file, 'z/new.js');
  assert.equal(out.nodes.find((n) => n.id === 'b.js:y').file, 'b.js', 'other node untouched');
  assert.deepEqual(edgeKeys(out), ['b.js:y a.js:x call'], 'edges untouched');
});

// The core of SE-FAITHFUL, exercised in-process over many cases: applyEdit composed with the
// trusted oracle must equal naiveApply composed with the same oracle. Independent apply paths ->
// any divergence in applyEdit's graph construction surfaces as a regression-output mismatch.
test('SE-FAITHFUL (core): applyEdit agrees with independent naiveApply under structuralRegressions', () => {
  const rng = prng(42);
  for (let i = 0; i < 300; i++) {
    const g = normalizeGraph(randomGraph(rng));
    const op = randomOp(rng, g);
    const viaFeature = structuralRegressions(g, applyEdit(g, op));
    const viaNaive = structuralRegressions(g, naiveApply(g, op));
    assert.deepEqual(viaFeature, viaNaive, `seed-driven case ${i}, op ${JSON.stringify(op)}`);
  }
});

// A pure delete cannot couple files that weren't already in a cycle together: removing edges only
// shrinks/removes SCCs. (Note: a shrunk SCC can change its sorted-file key, so structuralRegressions
// may still report it as a "newCycle" — the tool faithfully mirrors the gate's representation. The
// real, representation-independent invariant is containment, asserted here.)
test('SE-DELETE-NO-NEW-COUPLING: every after-cycle is contained in some before-cycle', () => {
  const rng = prng(7);
  for (let i = 0; i < 200; i++) {
    const g = normalizeGraph(randomGraph(rng));
    const id = g.nodes[Math.floor(rng() * g.nodes.length)].id;
    const after = applyEdit(g, { kind: 'delete', ids: [id] });
    const beforeCyc = fileCycles(g).map((c) => new Set(c));
    for (const c of fileCycles(after)) {
      const contained = beforeCyc.some((bc) => c.every((f) => bc.has(f)));
      assert.ok(contained, `after-cycle [${c.join(',')}] not ⊆ any before-cycle (deleting ${id}, case ${i})`);
    }
  }
});
