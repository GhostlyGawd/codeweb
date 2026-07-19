# Spec B: pipeline stage memoization + monorepo scale test + shards decision

## Problem
`--cache` covers extraction only. Cluster → overlap → optimize → render re-run in full on every
`run.mjs` invocation (~2.8s of codeweb's 5.0s self-run) even when the extracted fragment is
byte-identical to the previous run — they are pure functions of it. Separately, the largest
graph codeweb has ever been measured on is ~3k symbols, and `lib/shards.mjs` (monorepo
sharding) still has zero consumers outside its tests — "wire it or delete it" has been open
since the product review.

## Behavior (testable contract)
1. **Fragment-keyed memoization.** `run.mjs` records a hash of (fragment bytes + stage-relevant
   options + engine pipeline version) in the workspace (`.stages.json`). When the hash matches
   the previous run and every stage output file exists, cluster/overlap/optimize/render are
   **skipped**; the banner says which stages were reused. Any mismatch (or `--full`, or a
   missing output) runs the stage chain exactly as today.
2. **Purity property.** For the same fragment: outputs of a skipped run (reused files) are
   byte-identical to a forced `--full` re-run. Memoization can change wall-time only, never a
   single output byte.
3. **Correct invalidation.** Editing any source file (fragment changes) re-runs the downstream
   stages; deleting an output file re-runs; changing `--focus`/mode re-runs.
4. **Scale test (measured, committed).** Map a ≥30k-symbol real repo (microsoft/TypeScript at a
   pinned SHA; fall back to the largest clonable if disk blocks, with the limit recorded).
   Record pipeline wall-time per stage, query latencies (impact/callers/context on the biggest
   hubs), report.html load behavior, and graph.json size in
   `bench/results/scale-typescript.json`.
5. **Shards decision from evidence.** If the scale test shows structural queries or graph loads
   degrading past the product envelope (queries >1s or graph >100MB), wire `lib/shards.mjs`
   into extraction/query as the mitigation; otherwise **delete it** and record the measured
   rationale in the scale results file. Either outcome closes the item.

## Tests (TDD — tests/stage-memo.test.mjs)
- **S1 skip + identity (property):** run pipeline twice on a fixture; second run skips all four
  stages (banner) and every output file is byte-identical to a third `--full` run.
- **S2 invalidation:** touch one source file between runs → extract re-scans that file and all
  downstream stages re-run; outputs equal a from-scratch build.
- **S3 damage recovery:** delete `report.html` between identical runs → render re-runs, others
  skip; output equals `--full`.
- **S4 flag safety:** changing `--focus` between runs never serves memoized outputs.

## Done when
Tests pass; suite green; measured no-change re-run on codeweb drops to ~extract-only cost
(number in the PR); scale results committed; `shards.mjs` wired or deleted with the rationale
recorded.
