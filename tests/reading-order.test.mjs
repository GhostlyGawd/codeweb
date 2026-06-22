// F8 — properties + units for lib/reading-order.mjs + the reading-order.mjs CLI, written BEFORE the
// implementation (RED until they exist).
//
// The intent lock is RO-FOUNDATIONS-FIRST: the path must be a valid "callees before callers" order
// (read the depended-upon leaf before the orchestrator that calls it) — a real linearization of the
// in-scope call DAG, not an arbitrary list. RO-BUDGET keeps it bounded for huge scopes; RO-SCOPE-CLOSED
// keeps it honest (never wanders outside what you asked to understand).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readingOrder } from '../scripts/lib/reading-order.mjs';
import { runNode, script, tmpDir, cleanup, readJSON } from './helpers.mjs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { prng, int } from './_proptest.mjs';

// A random-RANK DAG (not strictly layered): every node gets a random integer rank, and a call edge
// goes only from a higher rank to a STRICTLY lower rank (callee = lower). This yields diamonds (shared
// callees with multiple callers), rank-skipping cross edges, and isolated nodes — the cases a naive
// DFS topo sort gets wrong — while staying acyclic so "callee-before-caller" is well-defined.
function randomDag(rng) {
  const n = int(rng, 3, 9);
  const nodes = Array.from({ length: n }, (_, k) => ({ id: `f${k}.js:s${k}`, label: `s${k}`, kind: 'function', file: `f${k}.js`, domain: 'd', loc: 3 }));
  const rank = new Map(nodes.map((nd) => [nd.id, int(rng, 0, n)])); // ties allowed -> no edge between equal ranks
  const edges = [];
  for (const a of nodes) for (const b of nodes) {
    if (rank.get(a.id) > rank.get(b.id) && rng() < 0.45) edges.push({ from: a.id, to: b.id, kind: 'call' });
  }
  return { meta: {}, nodes, edges, domains: [], overlaps: [] };
}

test('RO-FOUNDATIONS-FIRST: for an acyclic call graph, every callee precedes its caller in the order', () => {
  const rng = prng(1);
  let sawEdges = 0;
  for (let i = 0; i < 300; i++) {
    const g = randomDag(rng);
    sawEdges += g.edges.length;
    const order = readingOrder(g, { scope: { kind: 'all' }, budget: 999 });
    const pos = new Map(order.map((o, ix) => [o.id, ix]));
    for (const e of g.edges) {
      if (e.kind !== 'call') continue;
      if (pos.has(e.from) && pos.has(e.to)) {
        assert.ok(pos.get(e.to) < pos.get(e.from), `callee ${e.to} must precede caller ${e.from} (case ${i})`);
      }
    }
  }
  assert.ok(sawEdges > 100, 'the generator must actually produce call edges (else foundations-first is vacuous)');
});

test('RO-BUDGET: output length <= budget; budget >= scope size -> every in-scope symbol once', () => {
  const rng = prng(2);
  for (let i = 0; i < 100; i++) {
    const g = randomDag(rng);
    const small = readingOrder(g, { scope: { kind: 'all' }, budget: 3 });
    assert.ok(small.length <= 3, 'respects a tight budget');
    const full = readingOrder(g, { scope: { kind: 'all' }, budget: 999 });
    const ids = full.map((o) => o.id);
    assert.equal(ids.length, new Set(ids).size, 'no duplicates');
    assert.deepEqual(ids.slice().sort(), g.nodes.map((n) => n.id).sort(), 'covers every in-scope symbol exactly once');
  }
});

test('RO-SCOPE-CLOSED: domain/file scope only emits in-scope ids; symbol scope stays in its closure', () => {
  const g = {
    meta: {}, domains: [], overlaps: [],
    nodes: [
      { id: 'a/x.js:f', label: 'f', kind: 'function', file: 'a/x.js', domain: 'auth', loc: 2 },
      { id: 'a/y.js:g', label: 'g', kind: 'function', file: 'a/y.js', domain: 'auth', loc: 2 },
      { id: 'b/z.js:h', label: 'h', kind: 'function', file: 'b/z.js', domain: 'billing', loc: 2 },
    ],
    edges: [{ from: 'a/x.js:f', to: 'b/z.js:h', kind: 'call' }],
  };
  const dom = readingOrder(g, { scope: { kind: 'domain', value: 'auth' }, budget: 99 });
  assert.deepEqual(dom.map((o) => o.id).sort(), ['a/x.js:f', 'a/y.js:g'], 'only auth-domain symbols');
  const file = readingOrder(g, { scope: { kind: 'file', value: 'b/z.js' }, budget: 99 });
  assert.deepEqual(file.map((o) => o.id), ['b/z.js:h']);
});

test('RO-CYCLE-SAFE + RO-DETERMINISTIC: a cyclic call graph yields a stable total order, no crash', () => {
  const g = {
    meta: {}, domains: [], overlaps: [],
    nodes: [
      { id: 'a.js:p', label: 'p', kind: 'function', file: 'a.js', domain: 'd', loc: 2 },
      { id: 'b.js:q', label: 'q', kind: 'function', file: 'b.js', domain: 'd', loc: 2 },
    ],
    edges: [{ from: 'a.js:p', to: 'b.js:q', kind: 'call' }, { from: 'b.js:q', to: 'a.js:p', kind: 'call' }],
  };
  const a = readingOrder(g, { scope: { kind: 'all' }, budget: 99 });
  const b = readingOrder(g, { scope: { kind: 'all' }, budget: 99 });
  assert.equal(a.length, 2, 'both cycle members ordered, no crash');
  assert.deepEqual(a.map((o) => o.id), b.map((o) => o.id), 'deterministic under cycles');
});

test('RO-CLI: reading-order.mjs --json emits an ordered, budgeted path', () => {
  const dir = tmpDir('codeweb-ro-');
  try {
    const g = randomDag(prng(9));
    const gp = join(dir, 'graph.json'); writeFileSync(gp, JSON.stringify(g));
    const r = runNode(script('reading-order.mjs'), [gp, '--budget', '5', '--json']);
    assert.equal(r.status, 0, r.stderr);
    const payload = JSON.parse(r.stdout);
    assert.ok(Array.isArray(payload.order));
    assert.ok(payload.order.length <= 5);
    assert.ok(payload.order.every((o) => o.id && typeof o.why === 'string'));
  } finally { cleanup(dir); }
});
