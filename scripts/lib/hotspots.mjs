// codeweb hotspot scoring (F4) — rank symbols by refactoring priority: complexity x fan-in x churn
// (the Tornhill model). "Where do I start" in a huge repo. The formula lives here so hotspots.mjs and
// its tests share one truth (mirrors lib/risk.mjs). Pure.
//
// score = Σ wᵢ · normᵢ, normᵢ = componentᵢ / graph-max(componentᵢ) (0 when the max is 0). Weights are
// non-negative and sum to 1, so score ∈ [0,1] and is monotonic non-decreasing in each component for
// fixed maxes (HOT-DOMINANCE).

import { buildIndex, productScope } from './graph-ops.mjs';

export const HOTSPOT_WEIGHTS = { complexity: 0.5, fanIn: 0.3, churn: 0.2 };

export function hotspotScore(components, maxes) {
  let s = 0;
  for (const k of Object.keys(HOTSPOT_WEIGHTS)) {
    const m = maxes[k] || 0;
    s += HOTSPOT_WEIGHTS[k] * (m > 0 ? (components[k] || 0) / m : 0);
  }
  return s;
}

// Rank function/method nodes (the ones carrying complexity) by hotspot score. churn: { <relpath>: count }.
// #6: product scope by default — a hotspot list led by test helpers is advice nobody can act on;
// allRoles restores the everything view, and the exclusion is always counted, never silent.
export function rankHotspots(graph, { churn = {}, allRoles = false } = {}) {
  const index = buildIndex(graph);
  const scope = productScope(graph.nodes.filter((n) => n.kind === 'function' || n.kind === 'method'), allRoles);
  const comps = scope.kept
    .map((n) => ({ id: n.id, file: n.file, domain: n.domain, complexity: n.complexity || 0, fanIn: index.callIn.get(n.id)?.size || 0, churn: churn[n.file] || 0 }));
  const maxes = { complexity: 0, fanIn: 0, churn: 0 };
  for (const c of comps) for (const k of Object.keys(maxes)) maxes[k] = Math.max(maxes[k], c[k]);
  const ranked = comps
    .map((c) => ({ id: c.id, file: c.file, domain: c.domain, score: hotspotScore(c, maxes), components: { complexity: c.complexity, fanIn: c.fanIn, churn: c.churn } }))
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { weights: HOTSPOT_WEIGHTS, maxes, count: ranked.length, ranked, excluded: scope.excluded, excludedByRole: scope.excludedByRole };
}
