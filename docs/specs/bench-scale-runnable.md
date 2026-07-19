# Spec K: runnable scale bench + per-stage split + refreshed numbers

## Problem
The monorepo scale figures (`bench/results/scale-typescript.json`: 43s cold, 4s no-change,
~200ms queries at 16,286 symbols) were measured **by hand** — no script in the repo can
reproduce them — and they are **stale**: Type-3 fingerprints, four more languages, and
reliance v2 all landed after the 43s was recorded, each touching cold-build cost. Worse, the
file records only pipeline *totals*, so every downstream perf decision (incremental stages,
LSH overlap, daemon go/no-go) would be priced against numbers that don't say **which stage
costs what** or what a **one-file edit** costs — the path agents actually hit on re-map.

## Behavior (testable contract)
1. **Per-stage timing in `run.mjs`.** Every `[run] <label>` stage completion prints
   `[run] <label> done in <N>ms` on **stderr**. Timing output never changes a single artifact
   byte (stderr only; no timestamps enter any output file — the memo file already stores a
   timestamp and is excluded from artifact identity, as today).
2. **Runnable experiment: `bench/experiments/scale.mjs`.** Takes `--repo <path>`
   (a pinned checkout), `--out <results.json>`, optional `--label`. Runs, in order, against a
   fresh workspace:
   - **cold full build** — total ms + per-stage ms parsed from run.mjs stderr;
   - **no-change re-run** — total ms, asserts the stage-reuse banner fired;
   - **one-file-edit re-run** — appends a comment line to a deterministic source file
     (restores it after), total ms + per-stage ms: this is the *re-map after an agent edit*
     number that Spec O must beat;
   - **query latencies** — impact/callers/cycles/orphans on the highest-fan-in symbol,
     per-call subprocess ms;
   - **graph stats** — symbols/edges/files/domains/overlaps/graphJsonBytes.
   Emits one JSON with all of the above plus target label, SHA if the repo is a git checkout,
   and the engine version (package.json), so results are traceable to what produced them.
3. **The committed results refresh.** Re-run on the SAME pin as the stale figures —
   microsoft/TypeScript `src/` @ `637d5746b70257028fb95aad32ddec6b26ab0a14` — and commit the
   refreshed `bench/results/scale-typescript.json` including the per-stage split, the
   one-file-edit number, and a `previous` block preserving the superseded 43s/4s figures for
   the receipt trail. Any doc citing the stale totals is updated in the same change.
4. **No prediction baked in.** The refresh records whatever the numbers ARE — later specs
   consume them; this spec does not promise an improvement.

## Tests (TDD — tests/scale-bench.test.mjs)
- **K1 stage timing:** run the pipeline on a small fixture; stderr contains a
  `done in <N>ms` line for extract/cluster/overlap/optimize/report; artifacts are
  byte-identical to a run captured before this change (timing is stderr-only).
- **K2 experiment schema:** run `scale.mjs` against a tiny fixture repo; the emitted JSON has
  cold/noChange/oneFileEdit/queries/graph blocks, per-stage ms for cold+edit, and the
  one-file-edit pass restored the source file byte-identically.
- **K3 reuse honesty:** the no-change block records `stagesReused: true` only when the banner
  actually fired (assert against a `--full`-forced control).

## Done when
Tests pass; suite green; refreshed scale-typescript.json committed from a real TS-src run at
the pinned SHA with per-stage + one-file-edit numbers; stale citations updated.
