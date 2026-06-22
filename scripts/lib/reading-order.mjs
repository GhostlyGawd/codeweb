// codeweb reading-order (F8) — a minimal, dependency-ordered reading path for understanding a scope at
// any scale: foundations (the depended-upon leaves) first, orchestrators last, bounded to a budget. A
// curated tour instead of blind grep. Pure, deterministic. Built on lib/graph-ops.mjs.
//
// RO-FOUNDATIONS-FIRST: a valid "callee before caller" linearization of the in-scope call DAG — when A
// calls B and both are emitted, B precedes A. Greedy "fewest unemitted in-scope callees first" gives a
// reverse-topo order on DAGs (a sink has 0 unemitted callees) and degrades gracefully on cycles
// (fewest-deps, then highest in-scope fan-in, then id). RO-BUDGET: keeps the first `budget` foundations.

import { buildIndex, resolveSymbol } from './graph-ops.mjs';

function scopeIdsOf(graph, index, scope) {
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

export function readingOrder(graph, { scope = { kind: 'all' }, budget = Infinity } = {}) {
  const index = buildIndex(graph);
  const inScope = new Set(scopeIdsOf(graph, index, scope));
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
