// codeweb reading-order (F8) — a minimal, dependency-ordered reading path for understanding a scope at
// any scale: foundations (the depended-upon leaves) first, orchestrators last, bounded to a budget. A
// curated tour instead of blind grep. Pure, deterministic. Built on lib/graph-ops.mjs.
//
// RO-FOUNDATIONS-FIRST: a valid "callee before caller" linearization of the in-scope call DAG — when A
// calls B and both are emitted, B precedes A. Greedy "fewest unemitted in-scope callees first" gives a
// reverse-topo order on DAGs (a sink has 0 unemitted callees) and degrades gracefully on cycles
// (fewest-deps, then highest in-scope fan-in, then id). RO-BUDGET: keeps the first `budget` foundations.
//
// Round 2, finding #22: the greedy used to recount every remaining node's unemitted callees per
// emit (O(n²·deg)) and only slice to the budget AFTER the full order existed — 75.9 s for a
// 40-item answer at 15.7k nodes, past MCP's spawn timeout at 30k. Now: live `un` counters
// decremented through a reverse-caller map, swap-pop removal, and an early exit at the budget.
// The greedy choice depends only on the EMITTED set, so the first N picks are byte-identical to
// the full order's prefix — pinned by the RO-EQUIV-ORACLE / RO-EARLY-EXIT property against a
// frozen copy of the old implementation.

import { buildIndex, resolveSymbol } from './graph-ops.mjs';

function scopeIdsOf(graph, index, scope) {
  const kind = (scope && scope.kind) || 'all';
  if (kind === 'domain') return graph.nodes.filter((n) => (n.domain || 'unassigned') === scope.value).map((n) => n.id);
  if (kind === 'file') return graph.nodes.filter((n) => n.file === scope.value).map((n) => n.id);
  if (kind === 'symbol') {
    const seeds = resolveSymbol(graph, scope.value);
    const set = new Set(seeds); const q = [...seeds];
    // finding #22: index-pointer queue (the impactOf idiom) — q.shift() is O(frontier) per pop.
    // FIFO order is preserved exactly (pointer walks the same sequence shift() would pop).
    for (let i = 0; i < q.length; i++) { const cur = q[i]; for (const c of (index.callOut.get(cur) || [])) if (!set.has(c)) { set.add(c); q.push(c); } }
    return [...set];
  }
  return graph.nodes.filter((n) => n.kind !== 'module').map((n) => n.id); // 'all'
}

export function readingOrder(graph, { scope = { kind: 'all' }, budget = Infinity } = {}) {
  const index = buildIndex(graph);
  const inScope = new Set(scopeIdsOf(graph, index, scope));
  const calleesIn = new Map(), fanInIn = new Map();
  for (const id of inScope) { calleesIn.set(id, new Set([...(index.callOut.get(id) || [])].filter((x) => inScope.has(x)))); fanInIn.set(id, 0); }
  for (const id of inScope) for (const c of calleesIn.get(id)) fanInIn.set(c, (fanInIn.get(c) || 0) + 1);

  // Budget normalized ONCE at the lib boundary (the CLI clamps to >=1, but this is also the
  // MCP/library API): trunc matches Array.slice's ToIntegerOrInfinity on the old trailing slice
  // (2.5 -> 2, -1 -> 0); NaN/±Infinity -> full order — exactly the pre-#22
  // `Number.isFinite(budget) ? out.slice(0, Math.max(0, budget)) : out` semantics.
  const cap = Number.isFinite(budget) ? Math.max(0, Math.trunc(budget)) : Infinity;

  // Live unemitted-callee counters: `un` starts at |in-scope callees| and is decremented through
  // the reverse-caller map when a callee is emitted. `fanInIn` stays FROZEN at init — only `un`
  // is live (the selection rule reads init-time fan-in, and must keep doing so).
  const un = new Map();
  const callersIn = new Map(); // calleeId -> [in-scope callers], built once from calleesIn
  for (const id of inScope) {
    un.set(id, calleesIn.get(id).size);
    for (const c of calleesIn.get(id)) {
      let list = callersIn.get(c);
      if (!list) callersIn.set(c, (list = []));
      list.push(id);
    }
  }

  // `remaining` as array + position map, removal by swap-pop (O(1)). Tie-break proof: ids in
  // `remaining` are unique, so (un asc, fanIn desc, id asc) is a strict total order with a UNIQUE
  // argmin — the strict `<`/`>` comparisons below (verbatim from the old loop) select the
  // lexicographic-min id among equal-(un, fi) candidates from ANY scan order, so swap-pop's
  // reordering of the scan cannot change the choice.
  const remaining = [...inScope].sort();
  const posOf = new Map(remaining.map((id, i) => [id, i]));
  const order = [];
  while (order.length < cap && remaining.length) {
    let best = null;
    for (const id of remaining) {
      const cand = { id, un: un.get(id), fi: fanInIn.get(id) || 0 };
      if (!best || cand.un < best.un || (cand.un === best.un && (cand.fi > best.fi || (cand.fi === best.fi && cand.id < best.id)))) best = cand;
    }
    const bid = best.id;
    order.push(bid);
    const i = posOf.get(bid);
    const last = remaining.pop();
    if (last !== bid) { remaining[i] = last; posOf.set(last, i); }
    posOf.delete(bid);
    // Decrement `un` only for callers still remaining — an emitted caller's `un` is never read
    // again, and a SELF-call edge keeps its own +1 until emission (bid is already out of posOf
    // here, so its own counter is not touched), exactly like the old !emitted.has(c) recount.
    const callers = callersIn.get(bid);
    if (callers) for (const caller of callers) if (posOf.has(caller)) un.set(caller, un.get(caller) - 1);
  }

  return order.map((id) => {
    const fi = fanInIn.get(id) || 0, co = calleesIn.get(id).size;
    const why = fi === 0
      ? (co ? `entry point — orchestrates ${co} in-scope symbol(s)` : 'isolated symbol')
      : `foundation — ${fi} in-scope caller(s)${co ? `, depends on ${co}` : ''}`;
    return { id, why };
  });
}
