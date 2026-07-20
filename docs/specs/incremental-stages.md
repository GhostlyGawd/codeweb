# Spec O: incremental downstream stages — recompute only what an edit touched

## Problem
Stage memoization (Spec B) is all-or-nothing: the downstream chain reuses outputs only when
the fragment is **byte-identical**. Edit one file and cluster/overlap/optimize/render all
re-run from scratch — the full downstream cost on every re-map after an agent edit, and twice
per CI-gate run. The one-file-edit number Spec K records is the cost this spec exists to cut.

## Amendment (Spec K's measurement moved the target — read this first)
The refreshed split at 16k symbols (bench/results/scale-typescript.json) says the downstream
wall is NOT where this spec originally aimed. One-file-edit re-map = 73.3s: extract 8.2s
(cache riding), cluster **0.6s**, overlap **1.2s**, **optimize 60.5s**, report 2.2s. Cluster +
overlap — the stages the projection/group-cache design below targets — are ~2s of 73s.
`optimize.mjs` is 83% of the edit path (36% of cold): each of 112 duplicate-logic candidates
runs `applyEdit` (clones the entire 16k-node graph) + `fileCycles` (full file-graph SCC on the
clone) + `impactOf` — O(candidates × graph) with allocation churn to match.

So the execution order inverts, under the same byte-identity contract:
- **O-1 (the win): optimize stops cloning the world.** Compute each candidate's simulated
  merge as a DELTA — the set of file-level edges the merge would add — and answer "does this
  create a new cycle?" by scoped reachability on the ONE shared file graph (a new cycle must
  traverse an added edge), never by cloning the graph and re-running full SCC. Same tiers,
  same ordering, byte-identical optimize.md/--json output, pinned by an equivalence property
  test (delta result == clone-and-SCC result on randomized graphs + every fixture).
- **O-2 (decide from the post-O-1 split):** the projection memos + overlap group cache below
  are implemented ONLY if the re-measured edit path still says they pay (cluster+overlap ≥
  ~15% of the remaining re-map). Otherwise this spec records the measured "not worth it" the
  same way Spec B recorded the shards deletion.

## Resolution (2026-07-20, measured post-O-1 — O-2 NOT implemented; explicit rule override)
O-1 landed and delivered the spec's goal: one-file-edit re-map **73.3s → 6.7s (11×)**, cold
79.1s → 32.0s (optimize 60.5s → 0.56s; equivalence property-tested, byte-identical payloads).
The post-O-1 split: extract 4.2s (63%), overlap 1.27s, report 0.35s, cluster 0.27s, optimize
0.56s.

The letter of the pre-registered O-2 rule FIRES — cluster+overlap = 1.54s = 23% ≥ 15% — and we
are overriding it openly rather than quietly satisfying it: the rule's premise was that this
cost is memo-skippable stage work. Measurement says it is mostly content-dependent compute
(LSH signatures over per-node sets + cluster's single global pass), where projection memos and
group caches would save ≲1s absolute on a path extract dominates — machinery, test surface, and
byte-identity risk priced against under a second. The Spec-B shards precedent applies: record
the measured "not worth it", keep the design above for the day the numbers change.

**Revisit triggers:** extract drops below ~2s (parallel parse or baseline-fragment reuse would
invert the split); corpora ≥50k symbols; or the CI gate's two-pipeline cost becomes the
bottleneck in real projects. The byte-identity property machinery this spec mandated exists
where it matters: OD1/OD2 pin O-1's delta-vs-clone equivalence; Spec B's S1–S4 pin the stage
memo. 

## Design principle (the contract everything hangs on)
Incremental output MUST be **byte-identical to the full recompute** — the determinism
guarantee and the gate built on it are non-negotiable. So incrementality is only ever a
*narrower memo key*, never a different computation:
1. **Stage-relevant projections.** Each downstream stage declares the projection of the
   fragment it actually reads (cluster: topology + names + the node fields it consumes;
   overlap: bodies + shingle inputs per node; optimize/report: graph.json). The memo key for a
   stage becomes the hash of ITS projection, not the whole fragment. A body-only edit that
   leaves cluster's projection unchanged skips cluster even though the fragment changed; edits
   that change a projection re-run that stage in full. Projections are derived by reading the
   stage code, then PINNED by tests that fail if the stage starts reading a field its
   projection omits (a projection-completeness guard test per stage).
2. **Overlap group-level cache.** Within an overlap run, per-group confirmation results are
   cached in the workspace keyed by (group member ids + their body hashes + overlap config).
   A one-file edit re-confirms only groups containing changed nodes (plus LSH buckets the
   changed nodes occupy, once Spec N lands); untouched groups replay their cached findings.
   The assembled overlap.md/graph.json must remain byte-identical to a cold run — group
   results are position-independent by construction (deterministic ordering happens at
   assembly, as today).
3. **Fallback is always full.** Anything unhashable, any cache miss, any version bump →
   full stage run. `--full` still forces everything. MEMO_VERSION governs all of it.

## Behavior (testable contract)
1. A body-only edit (no signature/edge change) re-runs overlap partially (changed groups
   only), skips cluster, and re-renders — and every artifact is byte-identical to `--full`.
2. An edge-changing edit (add/remove a call) re-runs cluster + affected overlap, byte-identical
   to `--full`.
3. The banner reports what was reused at stage granularity (`cluster reused (projection
   unchanged) · overlap 3/41 groups recomputed`), per the no-silent-caps rule.
4. **Scale receipt:** on TS-src, the Spec K one-file-edit number drops; the new number and the
   old are both in scale-typescript.json.

## Tests (TDD — tests/incremental-stages.test.mjs)
- **O1 byte-identity property (the core):** on fixture corpora, apply a scripted sequence of
  randomized edits (seed fixed in test: body tweak / signature change / add fn / remove fn /
  rename), after each edit run incremental and `--full` into twin workspaces → every artifact
  byte-identical at every step.
- **O2 projection-completeness guards:** per stage, a fixture whose ONLY difference lives in a
  field the stage reads → projection hash changes (stage re-runs). Catches projection drift
  when stage code grows a new input.
- **O3 group cache correctness:** one-file edit recomputes only groups containing changed
  nodes (banner counts asserted), output byte-identical to cold.
- **O4 fallbacks:** corrupt group cache / bumped MEMO_VERSION / `--full` → full recompute,
  identical output.

## Done when
Tests pass; suite green; TS-src one-file-edit re-map measurably cheaper with the receipt
committed; byte-identity property holds across the scripted edit sequences.
