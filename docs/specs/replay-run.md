# Spec: replay A/B execution + analysis

## Question
On tasks that **provably** broke callers historically, does the ambient codeweb loop (brief +
explain card with reliance/caveats, required — mirroring the hooks) raise the fraction of
historically-missed caller files an agent updates, versus the same agent with no tooling?

## Protocol (frozen before solving)
- Tasks: `paper/results/replay-tasks.json` (mined, see replay-corpus spec). No task edits
  after solving begins.
- Arms: `control` (no tooling) vs `treatment` (ambient, REQUIRED steps). Same isolation
  (repo copy at `baseSha`), same instruction, same grader.
- Smoke first: 1 task × 2 arms × 1 rep — verifies cell integrity (metrics present, treatment's
  `ambientContextNoted` non-empty) before spending on the full grid.
- Full: all tasks × 2 arms × 2 reps.

## Metrics (graded by fixed functions, not judges)
1. **Primary**: `missedCovered / missedTotal` — coverage of the historically-missed caller
   files (the answer key from git history).
2. `structuralRegressions` (diff.mjs gate), completion rate.
3. Validity: every completed treatment cell shows real ambient engagement.

## Analysis & reporting
Per-condition means + per-task pairing; small-N reported as directional, never as
significance theater. Results → `paper/results/replay-ab.json` (+ raw cells), a CHANGELOG
Research note, and the site ledger IF the claim survives its own evidence rules. A null or
a control win is reported plainly.

## Done when
Smoke green → full run complete → analysis committed with the honest verdict.
