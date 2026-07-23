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
import { buildIndex, resolveSymbol } from '../scripts/lib/graph-ops.mjs';
import { runNode, script, tmpDir, cleanup, readJSON } from './helpers.mjs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { prng, int, pick, randomGraph } from './_proptest.mjs';

// ---- FROZEN ORACLE (round 2, finding #22) ------------------------------------------------------
// A verbatim copy of the pre-#22 readingOrder + scopeIdsOf (the O(n²) full-order greedy with the
// trailing budget slice). The rewritten implementation must equal this on every graph/scope, and
// its early exit must equal this oracle's PREFIX for every budget — the property below is the
// byte-identity guard for the live-counter/swap-pop/early-exit rewrite. Do not modernize this copy.
function oracleScopeIdsOf(graph, index, scope) {
  const kind = (scope && scope.kind) || 'all';
  if (kind === 'domain') return graph.nodes.filter((n) => (n.domain || 'unassigned') === scope.value).map((n) => n.id);
  if (kind === 'file') return graph.nodes.filter((n) => n.file === scope.value).map((n) => n.id);
  if (kind === 'symbol') {
    const seeds = resolveSymbol(graph, scope.value);
    const set = new Set(seeds); const q = [...seeds];
    while (q.length) { const cur = q.shift(); for (const c of (index.callOut.get(cur) || [])) if (!set.has(c)) { set.add(c); q.push(c); } }
    return [...set];
  }
  return graph.nodes.filter((n) => n.kind !== 'module').map((n) => n.id); // 'all'
}
function oracleReadingOrder(graph, { scope = { kind: 'all' }, budget = Infinity } = {}) {
  const index = buildIndex(graph);
  const inScope = new Set(oracleScopeIdsOf(graph, index, scope));
  const calleesIn = new Map(), fanInIn = new Map();
  for (const id of inScope) { calleesIn.set(id, new Set([...(index.callOut.get(id) || [])].filter((x) => inScope.has(x)))); fanInIn.set(id, 0); }
  for (const id of inScope) for (const c of calleesIn.get(id)) fanInIn.set(c, (fanInIn.get(c) || 0) + 1);

  const emitted = new Set(), order = [];
  const remaining = [...inScope].sort();
  while (remaining.length) {
    let best = null;
    for (const id of remaining) {
      let un = 0; for (const c of calleesIn.get(id)) if (!emitted.has(c)) un++;
      const cand = { id, un, fi: fanInIn.get(id) || 0 };
      if (!best || cand.un < best.un || (cand.un === best.un && (cand.fi > best.fi || (cand.fi === best.fi && cand.id < best.id)))) best = cand;
    }
    emitted.add(best.id); order.push(best.id);
    remaining.splice(remaining.indexOf(best.id), 1);
  }

  const out = order.map((id) => {
    const fi = fanInIn.get(id) || 0, co = calleesIn.get(id).size;
    const why = fi === 0
      ? (co ? `entry point — orchestrates ${co} in-scope symbol(s)` : 'isolated symbol')
      : `foundation — ${fi} in-scope caller(s)${co ? `, depends on ${co}` : ''}`;
    return { id, why };
  });
  return Number.isFinite(budget) ? out.slice(0, Math.max(0, budget)) : out;
}

// RO-EQUIV-ORACLE + RO-EARLY-EXIT (round 2, finding #22): over seeded random graphs — self-call
// edges and cycles included (randomGraph emits both) — across all three scope kinds:
//   (a) early-exit ≡ full prefix: readingOrder(g, {scope, budget: b}) equals the FULL order's
//       first b entries for every b in 0..n+2 (the greedy choice depends only on the emitted set);
//   (b) new ≡ oracle: the full order equals the frozen pre-#22 implementation above, deep-equal
//       ({id, why} both — the why strings ride fanInIn/calleesIn and must not drift).
test('RO-EQUIV-ORACLE + RO-EARLY-EXIT: rewrite ≡ frozen O(n²) oracle; budget b ≡ full-order prefix (200+ seeded cases, all scopes)', () => {
  const rng = prng(0x22F1E1D);
  let cases = 0, selfCallSeen = 0;
  while (cases < 210) {
    const g = randomGraph(rng);
    if (g.edges.some((e) => e.from === e.to)) selfCallSeen++;
    const scopeKind = pick(rng, ['all', 'file', 'symbol']);
    let scope;
    if (scopeKind === 'all') scope = { kind: 'all' };
    else if (scopeKind === 'file') scope = { kind: 'file', value: pick(rng, g.nodes).file };
    else scope = { kind: 'symbol', value: pick(rng, g.nodes).id };
    const full = readingOrder(g, { scope, budget: Infinity });
    const oracleFull = oracleReadingOrder(g, { scope, budget: Infinity });
    assert.deepEqual(full, oracleFull, `case ${cases}: full order must equal the frozen oracle (scope ${scopeKind})`);
    const b = int(rng, 0, g.nodes.length + 2);
    assert.deepEqual(readingOrder(g, { scope, budget: b }), full.slice(0, b),
      `case ${cases}: budget ${b} must equal the full order's prefix (scope ${scopeKind})`);
    cases++;
  }
  assert.ok(selfCallSeen >= 5, `generator must produce self-call graphs (saw ${selfCallSeen}) — the self-loop un-counting is pinned here`);
});

// RO-BUDGET-NORMALIZE (round 2, finding #22): the LIB boundary keeps today's exact budget
// semantics for non-natural inputs (the CLI clamps to >= 1, but readingOrder is also the MCP /
// library API): finite budgets truncate like Array.slice (2.5 -> 2, -1 -> 0), non-finite
// (NaN / ±Infinity) mean the full order — i.e. `Number.isFinite(b) ? out.slice(0, Math.max(0, b))
// : out` exactly.
test('RO-BUDGET-NORMALIZE: -1 / 0 / 2.5 / NaN / Infinity keep the pre-#22 slice semantics', () => {
  const rng = prng(0x22B0D6);
  for (let i = 0; i < 25; i++) {
    const g = randomGraph(rng);
    const full = oracleReadingOrder(g, { scope: { kind: 'all' }, budget: Infinity });
    for (const b of [-1, 0, 2.5, NaN, Infinity, -Infinity]) {
      const want = Number.isFinite(b) ? full.slice(0, Math.max(0, b)) : full;
      assert.deepEqual(readingOrder(g, { scope: { kind: 'all' }, budget: b }), want, `case ${i}, budget ${b}`);
    }
  }
});

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
