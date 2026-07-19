# Spec D: replay corpus v3 growth + cost-to-coverage metric

## Problem
The replay benchmark's v2 corpus froze at ONE fully-verified task, and on it both arms hit the
coverage ceiling — the instrument is validated but cannot discriminate. The recorded growth
path: many-caller cross-package tasks, more repos, and a cost-to-coverage secondary metric so
even ceiling tasks measure *something* (same safety, what price). Extends
`docs/specs/replay-corpus.md` and `docs/specs/replay-run.md`.

## Behavior (testable contract)
1. **Cost-to-coverage in the analyzer.** `replay-analyze.mjs` computes per-cell and
   per-condition `cost = {toolCalls, tokensApprox}` from the raw cells when the harness
   recorded them, and reports `costToFullCoverage` (cost among cells reaching coverage 1.0).
   Cells without cost data → `cost: null`, never fabricated. The workflow records tool-call
   counts + byte totals per cell going forward.
2. **Mining sweep.** The miner runs over deep-cloned pinned histories of ≥3 additional real
   repos (candidates: express, lodash, fastify, dayjs, commander) plus the existing axios/vite.
   Every run's funnel is committed (`bench/results/replay-mine-<repo>.json`) whether or not
   tasks survive — a 0-task funnel is a result.
3. **Hand verification.** Every surviving candidate is verified against history per the v2
   rules (semantic caller update, not reformat; distinctive label; complete diff) with the
   verification note recorded per task.
4. **Corpus v3 freeze.** Survivors + the v2 task freeze as
   `bench/results/replay-tasks.json` v3 with per-task provenance. Target ≥3 tasks across ≥2
   repos, ≥1 many-caller (≥5 caller files) or cross-package; if the guards leave fewer, the
   committed funnels are the honest outcome and the shortfall is stated in the corpus file.
5. **No solving here.** Running arms on v3 stays a separately-funded step (the workflow is
   ready); this spec grows the instrument, not the result.

## Tests (TDD — extends tests/replay-mine.test.mjs + tests/replay-analyze.test.mjs)
- **C1 cost aggregation:** synthetic raw cells with toolCalls/tokens → per-condition means and
  costToFullCoverage computed exactly; cells lacking cost → null, excluded from means, counted.
- **C2 determinism:** analyzer output byte-identical across runs on the same raw set.
- **C3 miner regression guard:** P1–P6 stay green (the sweep must not require weakening them).
- **C4 funnel commitment:** a mining run that yields 0 tasks still writes a funnel file with
  every stage count.

## Done when
Tests pass; ≥3 new repos mined with funnels committed; survivors hand-verified; corpus v3
frozen with provenance; analyzer upgrade merged.
