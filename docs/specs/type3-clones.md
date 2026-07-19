# Spec H: Type-3 (near-miss) clone detection via AST subtree hashing

## Problem
The skeleton pass catches Type-2 (renamed) clones; statement-reordered / extracted-subexpression
/ small-insertion clones (Type-3) are invisible to both the shingle and skeleton passes. The
AST tier (Spec A's engine) makes a precise pass possible for JS/TS.

## Behavior (testable contract)
1. **Normalized statement fingerprints.** For each function body the ts-engine emits a
   multiset of statement-subtree hashes (identifiers/literals normalized as in the skeleton
   pass, structure preserved). Stored per node as `t3` (compact, deterministic) only when the
   engine is loaded — absent otherwise; fragments stay byte-identical when the tier is off.
2. **Pairing rule (precision-gated):** two bodies are a Type-3 candidate when both have ≥ 6
   statements, share ≥ 70% of statement hashes (Jaccard on multisets), and are NOT already an
   exact/Type-2 finding. Thresholds live in one place (`lib/overlap` constants) and in the
   finding's payload.
3. **Distinct finding kind.** Reported by `overlap.mjs` as kind `near-miss-clone` with the
   shared/total statement counts and the differing statement count per side — tiered REVIEW
   always, never READY, never auto-"merge these"; `optimize.mjs` lists them under review only.
4. **Determinism + budget:** same repo → identical findings; report/MCP surfaces show them
   under the existing findings budgets.

## Tests (TDD — tests/type3-clones.test.mjs)
- **T1 reorder:** two functions, same statements reordered → detected (shared ≥ threshold).
- **T2 extraction:** one side extracts a subexpression into a local → still detected.
- **T3 negative control:** two structurally different functions of equal length → NOT paired.
- **T4 small-body guard:** < 6 statements each, identical → not a Type-3 finding (stays the
  exact-clone path's business).
- **T5 no-engine fallback (property):** without the AST tier the fragment and findings are
  byte-identical to today.
- **T6 determinism:** two runs → identical findings ids/order.

## Done when
Tests pass; suite green; self-map + axios runs show the new kind only as REVIEW findings with
sane counts (spot-checked and recorded in the PR).
