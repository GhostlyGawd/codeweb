# Replay benchmark — evidence from what actually broke

Two pieces:

1. **`replay-mine.mjs`** (offline, deterministic, free): walks a repo's git history for commits
   that changed a depended-on function's signature and — per the history itself — missed caller
   files that a later commit had to fix. Every hit is a task with a built-in answer key
   (`missedByChange` + the follow-up fix commits). The funnel is reported at every stage, never
   silent.

   ```sh
   node bench/experiments/replay-mine.mjs <repo-clone> \
     --max-commits 2000 --max-pairs 150 --min-callers 2 --followup-window 8 \
     --out bench/results/replay-tasks-<repo>.json
   ```

   First verified run (axios, 1,647 commits walked, 150 signature-change pairs graphed):
   **2 ground-truth tasks** — e.g. `28c7215` changed `forEach` used by 9 caller files, missed 8,
   fixed later by `ef3711d`. Yield ≈ 1 task / 800 commits, so a real corpus comes from mining
   several repos (deep clones needed — `git fetch --deepen`).

2. **`replay-ab.workflow.js`** (funded — spends session tokens): replays each mined task at its
   base revision, control vs **ambient** codeweb (brief + explain cards with reliance/caveats,
   mirroring the hooks). Graded on (a) coverage of the historically-missed caller files — the
   ground truth — and (b) the deterministic `diff.mjs` gate.

   ```
   Workflow({ scriptPath: "bench/experiments/replay-ab.workflow.js",
              args: { root: "<abs codeweb>", tasksFile: "<abs replay-tasks.json>", smoke: true } })
   ```

   Persist the return to `bench/results/replay-ab-raw.json`. Cost ≈ 100–250k tokens/cell
   (cells = tasks × 2 × reps).

Why this beats the invented-task field study: tasks provably had a failure mode (no floor
effect), the answer key comes from history (not a model judge), mining is free and repeatable,
and every new mined repo grows the corpus.
