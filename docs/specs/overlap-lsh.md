# Spec N: LSH/MinHash banding restores full overlap coverage in near-linear time

## Problem
The TypeScript scale run proved overlap was the wall (two quadratic passes) and Spec B fixed
it with **declared caps**: 12-node same-name group samples, >50-caller hubs excluded from twin
seeding, a 200k pair budget. Honest — every cap is reported — but caps sacrifice coverage:
beyond the budget, real twins are simply never examined. MinHash signatures + LSH banding over
the **existing shingle sets** generate candidate pairs in near-linear time with a tunable
false-negative rate, so the pair budget stops being a coverage ceiling and becomes a true
backstop.

## Behavior (testable contract)
1. **`scripts/lib/minhash.mjs`** — pure, dependency-free, deterministic:
   - `signature(shingleSet, K=128)` — K minhash values via fixed-constant 2-universal hashing
     (no `Math.random`, no `Date`; constants are a committed table, so signatures are
     byte-stable across runs and platforms);
   - `bandKeys(sig, bands=32, rows=4)` — banding keys (threshold S-curve centered ≈0.42, so
     pairs at the product's J≥0.7 confirm threshold are candidates with P ≥ 0.999);
   - `estimate(sigA, sigB)` — Jaccard estimate (matching rows / K).
2. **Overlap wiring.** Twin/near-miss candidate generation in `overlap.mjs` uses LSH bucket
   collisions as the PRIMARY candidate source when the eligible-node count exceeds the size
   where exact all-pairs fits the existing budget; below that, the exact path runs as today
   (small inputs keep bit-for-bit historical behavior). Every LSH candidate still goes through
   the SAME exact confirmation (shingle Jaccard + evidence) — LSH changes which pairs get
   *examined*, never how a finding is *confirmed*. Existing caps remain as declared backstops;
   the overlap.md header reports `candidates: lsh(<n> buckets)` vs `exact` so no silent
   behavior change.
3. **Determinism.** Two runs on the same fragment produce byte-identical overlap.md +
   graph.json, LSH path included. Ordering of candidate pairs is canonicalized before
   confirmation, so bucket iteration order can never leak into output.
4. **Scale receipt.** Re-run the Spec K scale bench on TS-src after wiring: record overlap
   stage ms and finding counts before/after in scale-typescript.json. Coverage must not
   regress (findings ⊇ pre-LSH findings on the fixtures; on TS-src, the pair budget should no
   longer bind — the header count proves it).

## Tests (TDD — tests/minhash.test.mjs, tests/overlap-lsh.test.mjs)
- **N1 estimate accuracy (property):** across seeded-PRNG generated set pairs (seed fixed IN
  THE TEST) spanning J∈[0,1], |estimate − trueJaccard| ≤ 0.15 at K=128 for ≥95% of pairs.
- **N2 candidate recall (property):** generated corpora with planted pairs at J≥0.7 —
  banding proposes ≥99% of planted pairs as candidates; report the measured rate.
- **N3 determinism:** identical inputs → identical signatures, bucket keys, and overlap
  artifacts, twice.
- **N4 coverage restoration:** a synthetic fragment sized past the old TWIN_PAIR_BUDGET with
  a planted twin pair the old path provably never examined → LSH path finds and confirms it;
  the pre-LSH path (env-forced) does not. Both facts asserted.
- **N5 small-input identity:** on every existing overlap fixture, output is byte-identical to
  pre-LSH behavior (exact path still taken below the size threshold).

## Done when
Tests pass; suite green; TS-src scale re-run committed showing overlap ms + candidate method
+ non-binding budget; determinism 2×; no fixture output changed.
