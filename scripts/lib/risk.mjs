// codeweb risk scoring primitive (F7) — the change-risk formula in ONE place so risk.mjs and its
// tests share the same constants (the test imports these; it does not re-hardcode them). Pure.
//
// risk = Σ wᵢ · normᵢ(componentᵢ), where normᵢ = componentᵢ / graph-max(componentᵢ) (0 when the max
// is 0). Weights are non-negative and sum to 1, so risk ∈ [0,1] and is monotonic non-decreasing in
// each component for fixed maxes (pinned by RK-MONOTONE).

export const RISK_WEIGHTS = { fanIn: 0.30, fanOut: 0.15, loc: 0.15, blast: 0.30, churn: 0.10 };

export function riskScore(components, maxes) {
  let s = 0;
  for (const k of Object.keys(RISK_WEIGHTS)) {
    const m = maxes[k] || 0;
    const norm = m > 0 ? (components[k] || 0) / m : 0;
    s += RISK_WEIGHTS[k] * norm;
  }
  return s;
}

import { allBlastCounts, productScope } from './graph-ops.mjs';

/** D4a (SIMPLIFY §2.4): THE ranking assembler — the CLI and a future MCP fast path share it,
 *  so `codeweb_risk` stops being the one advisor whose assembly lives in its bin. No IO: churn
 *  arrives as data. Returns the full sorted list plus the maxes and scope the payload reports. */
export function rankRisk(graph, index, { churn = {}, all = false, changed = null } = {}) {
  const scope = productScope(graph.nodes, all);
  const blastByNode = allBlastCounts(index);
  const comp = scope.kept.map((n) => ({
    id: n.id, file: n.file, domain: n.domain,
    fanIn: index.callIn.get(n.id)?.size || 0,
    fanOut: index.callOut.get(n.id)?.size || 0,
    loc: n.loc || 0,
    blast: blastByNode.get(n.id) ?? 0,
    churn: churn[n.file] || 0,
  }));
  const maxes = { fanIn: 0, fanOut: 0, loc: 0, blast: 0, churn: 0 };
  for (const c of comp) for (const k of Object.keys(maxes)) maxes[k] = Math.max(maxes[k], c[k]);
  let ranked = comp.map((c) => ({ id: c.id, file: c.file, domain: c.domain, risk: riskScore(c, maxes), components: { fanIn: c.fanIn, fanOut: c.fanOut, loc: c.loc, blast: c.blast, churn: c.churn } }))
    .sort((a, b) => b.risk - a.risk || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (changed != null) {
    const files = new Set(String(changed).split(',').map((s) => s.trim()).filter(Boolean));
    ranked = ranked.filter((r) => files.has(r.file));
  }
  return { ranked, maxes, scope };
}
