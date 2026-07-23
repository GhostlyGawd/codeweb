# Spec L: report.html at scale — measure first, fix only if red

## Problem
`graph.json` is 13.5MB at 16k symbols and report.html embeds the graph — but browser-side
behavior at that scale was never recorded in the scale results: load time, force-layout
settle, interaction latency, and heap are all unknowns. The scale receipts claim the pipeline
handles a monorepo; the report is the surface a human actually opens.

## Behavior (testable contract)
1. **Measurement script: `bench/experiments/report-scale.mjs`.** Playwright + the
   pre-installed Chromium (`PLAYWRIGHT_BROWSERS_PATH`), headless, `file://` load of a built
   report.html. Measures:
   - report.html bytes on disk;
   - `domContentLoaded` and `load` (navigation timing);
   - **time to interactive graph** — first frame where the graph SVG/canvas has rendered
     nodes (poll a report-exposed DOM condition);
   - **layout settle** — ms until two consecutive 500ms windows produce no node-position
     mutations (or the report's own layout-done signal if one exists);
   - **search latency** — type a symbol name into the report search, ms to results;
   - JS heap used after settle.
   Emits JSON via `--out`; takes `--report <path>`.
2. **Thresholds (decided up front, so "red" is not vibes).** At the 16k-symbol report:
   time-to-interactive-graph ≤ 10s, search ≤ 300ms, no tab crash/OOM. **Expand-all (finding
   #35):** `settledMsPerFrame` ≤ 50 (the sim-cheap-per-frame primary target) AND
   `maxSingleStepMs` ≤ 250 (no single uninterruptible task freezes a frame — the chunker
   guarantees it); **fitted `drawOnceMs` ≤ 100 (finding #37).** Within thresholds → record the
   numbers, done: the receipt closes the gap. Any threshold red → implement the smallest bounded
   fix (defer non-viewport node rendering, cap initial render to top-N domains with drill-in, or
   move layout to a worker — whichever the measurement blames), with its own regression test,
   then re-measure and record both before/after. At 16.8k the settled per-step cost is a
   documented **floor** (~270 ms): the far-field monopole is O(n·cells) and ≤50 ms/frame needs a
   hierarchical Barnes-Hut tree — out of #35's frozen scope — so the fallback ships with
   `maxSingleStepMs` ≤ 250 met and the honest number recorded (see report-scale.json's verdict).
3. **Committed results: `bench/results/report-scale.json`** — small-fixture sanity row + the
   16k-symbol row, environment noted (headless Chromium version), linked from the scale
   results file.

## Tests (TDD — tests/report-scale-bench.test.mjs)
- **L1 harness smoke:** run report-scale.mjs against a small fixture report; JSON has all
  measurement fields with sane values (>0, finite); exit 0.
- **L2 graph-ready probe:** the "interactive graph" condition the script polls actually flips
  on the fixture report (guards against measuring a probe that never fires → bogus timeouts).
- (Only if a fix lands) **L3 fix regression:** the specific red behavior, pinned.

## Done when
Tests pass; suite green; report-scale.json committed with the 16k row; thresholds all green
(either measured green outright, or after a bounded fix with before/after recorded).
