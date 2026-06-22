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
