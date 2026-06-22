// F10 — properties + units for lib/shards.mjs (graph sharding + cross-shard boundary index for
// monorepo-scale graphs), written BEFORE the implementation (RED until the lib exists).
//
// The headline intent lock is SH-ANSWER-PRESERVING: for any symbol, callers/callees/impact computed
// from (its shard + the boundary index) must EQUAL the same computed from the full monolithic graph.
// Sharding may only change WHAT you must load, never the ANSWER. SH-LOSSLESS + SH-PARTITION guarantee
// no node/edge is dropped or duplicated, so the split is a faithful re-representation of one graph.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitGraph, mergeShards, shardCallersOf, shardCalleesOf, shardImpactOf } from '../scripts/lib/shards.mjs';
import { buildIndex, callersOf, calleesOf, impactOf, resolveSymbol } from '../scripts/lib/graph-ops.mjs';
import { prng, randomGraph } from './_proptest.mjs';

// Give the random graph multi-directory ids so sharding-by-dir produces several shards + boundary
// edges. randomGraph spreads nodes across d0..d3/m.js. Robust rewrite: precompute an id map (no
// O(n) find() per edge, and no crash if an edge ever references a missing node), and ASSERT ids stay
// unique so a future generator change can't silently feed buildIndex a malformed graph.
function withDirs(g) {
  const newId = new Map(g.nodes.map((n) => [n.id, `${n.file}:${n.label}`]));
  const nodes = g.nodes.map((n) => ({ ...n, id: newId.get(n.id), file: n.file }));
  const ids = nodes.map((n) => n.id);
  assert.equal(new Set(ids).size, ids.length, 'withDirs produced duplicate node ids');
  const edges = g.edges.map((e) => ({ ...e, from: newId.get(e.from), to: newId.get(e.to) })).filter((e) => e.from && e.to);
  return { ...g, nodes, edges, domains: [], overlaps: [] };
}

const nodeSet = (g) => new Set(g.nodes.map((n) => n.id));
const edgeSet = (g) => new Set(g.edges.map((e) => `${e.from} ${e.to} ${e.kind}`));

test('SH-LOSSLESS: mergeShards(splitGraph(g)) restores the exact node + edge sets', () => {
  const rng = prng(1);
  for (let i = 0; i < 200; i++) {
    const g = withDirs(randomGraph(rng));
    const merged = mergeShards(splitGraph(g, 'dir'));
    assert.deepEqual([...nodeSet(merged)].sort(), [...nodeSet(g)].sort(), `nodes lost/added, case ${i}`);
    assert.deepEqual([...edgeSet(merged)].sort(), [...edgeSet(g)].sort(), `edges lost/added, case ${i}`);
  }
});

test('SH-PARTITION: every node in exactly one shard; every edge intra-shard XOR boundary, once', () => {
  const rng = prng(2);
  for (let i = 0; i < 200; i++) {
    const g = withDirs(randomGraph(rng));
    const split = splitGraph(g, 'dir');
    // each node appears in exactly one shard
    const counts = new Map();
    for (const sh of split.shards) for (const n of sh.nodes) counts.set(n.id, (counts.get(n.id) || 0) + 1);
    for (const n of g.nodes) assert.equal(counts.get(n.id), 1, `node ${n.id} not in exactly one shard`);
    // intra-shard edges + boundary edges == all edges, deduped, no overlap
    const intra = new Set();
    for (const sh of split.shards) for (const e of sh.edges) intra.add(`${e.from} ${e.to} ${e.kind}`);
    const bound = new Set(split.boundary.map((e) => `${e.from} ${e.to} ${e.kind}`));
    for (const k of intra) assert.ok(!bound.has(k), `edge ${k} double-counted in intra + boundary`);
    assert.deepEqual([...new Set([...intra, ...bound])].sort(), [...edgeSet(g)].sort(), `edge partition incomplete, case ${i}`);
  }
});

test('SH-ANSWER-PRESERVING: shard queries equal the monolith for every symbol', () => {
  const rng = prng(3);
  for (let i = 0; i < 150; i++) {
    const g = withDirs(randomGraph(rng));
    const idx = buildIndex(g);
    const split = splitGraph(g, 'dir');
    for (const n of g.nodes) {
      const id = n.id;
      assert.deepEqual(shardCallersOf(split, id), callersOf(idx, [id]), `callers mismatch for ${id}`);
      assert.deepEqual(shardCalleesOf(split, id), calleesOf(idx, [id]), `callees mismatch for ${id}`);
      assert.deepEqual(shardImpactOf(split, id), impactOf(idx, [id]), `impact mismatch for ${id}`);
    }
  }
});

test('SH-DETERMINISTIC: splitGraph is deterministic (stable shards + boundary)', () => {
  const rng = prng(4);
  for (let i = 0; i < 50; i++) {
    const g = withDirs(randomGraph(rng));
    const a = splitGraph(g, 'dir'), b = splitGraph(g, 'dir');
    assert.deepEqual(a.shards.map((s) => s.key).sort(), b.shards.map((s) => s.key).sort());
    assert.deepEqual(a.boundary.map((e) => `${e.from} ${e.to} ${e.kind}`).sort(),
      b.boundary.map((e) => `${e.from} ${e.to} ${e.kind}`).sort());
  }
});

test('SH-BY-DOMAIN: sharding by domain partitions on node.domain', () => {
  const g = {
    meta: {}, domains: [], overlaps: [],
    nodes: [
      { id: 'a/x.js:f', label: 'f', file: 'a/x.js', domain: 'auth' },
      { id: 'b/y.js:g', label: 'g', file: 'b/y.js', domain: 'auth' },
      { id: 'c/z.js:h', label: 'h', file: 'c/z.js', domain: 'billing' },
    ],
    edges: [{ from: 'a/x.js:f', to: 'c/z.js:h', kind: 'call' }],
  };
  const split = splitGraph(g, 'domain');
  assert.deepEqual(split.shards.map((s) => s.key).sort(), ['auth', 'billing']);
  assert.equal(split.boundary.length, 1, 'the cross-domain call is a boundary edge');
});

// Forces MULTI-HOP cross-shard reachability: fa -> gb -> hc spans three dir-shards, so impact(hc)
// must traverse two boundary edges. A broken boundary walk passes the sparse random property but
// fails here.
test('SH-IMPACT-CHAIN: transitive impact across 3 shards equals the monolith (multi-hop boundary)', () => {
  const g = {
    meta: {}, domains: [], overlaps: [],
    nodes: [
      { id: 'a/f.js:fa', label: 'fa', file: 'a/f.js', domain: 'a' },
      { id: 'b/g.js:gb', label: 'gb', file: 'b/g.js', domain: 'b' },
      { id: 'c/h.js:hc', label: 'hc', file: 'c/h.js', domain: 'c' },
    ],
    edges: [{ from: 'a/f.js:fa', to: 'b/g.js:gb', kind: 'call' }, { from: 'b/g.js:gb', to: 'c/h.js:hc', kind: 'call' }],
  };
  const split = splitGraph(g, 'dir');
  assert.equal(split.shards.length, 3, 'three single-node shards');
  assert.equal(split.boundary.length, 2, 'both calls cross shard boundaries');
  const idx = buildIndex(g);
  assert.deepEqual(shardImpactOf(split, 'c/h.js:hc'), impactOf(idx, ['c/h.js:hc']), 'foundation impact crosses two boundaries');
  assert.deepEqual(shardImpactOf(split, 'c/h.js:hc'), ['a/f.js:fa', 'b/g.js:gb']);
});

test('SH-SHUFFLE-INVARIANT: splitGraph result is independent of input node/edge ordering', () => {
  const rng = prng(5);
  for (let i = 0; i < 50; i++) {
    const g = withDirs(randomGraph(rng));
    const shuffled = { ...g, nodes: g.nodes.slice().reverse(), edges: g.edges.slice().reverse() };
    const a = mergeShards(splitGraph(g, 'dir'));
    const b = mergeShards(splitGraph(shuffled, 'dir'));
    assert.deepEqual([...nodeSet(a)].sort(), [...nodeSet(b)].sort());
    assert.deepEqual([...edgeSet(a)].sort(), [...edgeSet(b)].sort());
  }
});
