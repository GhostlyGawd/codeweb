# Spec: replay A/B execution + analysis

## Question
On tasks that **provably** broke callers historically, does the ambient codeweb loop (brief +
explain card with reliance/caveats, required — mirroring the hooks) raise the fraction of
historically-missed caller files an agent updates, versus the same agent with no tooling?

## Protocol (frozen before solving)
- Tasks: `paper/results/replay-tasks.json` (mined, see replay-corpus spec). No task edits
  after solving begins.
- Arms: `control` (no tooling) vs `treatment` (ambient, REQUIRED steps). Same isolation,
  same instruction, same grader.
- **Blind solve**: the solver never sees the answer key. Isolation is a **history-free
  export** of `baseSha` (`git archive` → fresh single-commit repo), so the follow-up fix
  that defines the key does not exist anywhere the solver can look; the prompt forbids
  consulting the source clone, and the solver reports only `filesChanged` + the gate numbers.
- Smoke first: 1 task × 2 arms × 1 rep — verifies cell integrity (grading computed, gate
  numbers present, treatment's `ambientContextNoted` non-empty) before the full grid.
- Full: all tasks × 2 arms × 2 reps (up to 4 reps when the corpus is ≤2 tasks — decided
  before the run, never after seeing results).

## Metrics (graded by fixed functions, not judges)
1. **Primary**: `missedCovered / missedTotal` — computed by the workflow script as
   `|filesChanged ∩ missedByChange|`, never self-reported by the solver.
2. `structuralRegressions` (diff.mjs gate), completion rate.
3. Validity: every completed treatment cell shows real ambient engagement.

## Amendment (2026-07-19, v1 pilot discarded)
The v1 smoke (isObject, 1×2×1) leaked three ways: the prompt pasted the `missedByChange`
list into both arms' grading section; solvers self-reported coverage; and the `cp -r`
isolation kept full git history, so both arms read the follow-up fix commit — the answer
key's source. Both cells also ran on a task later found invalid (formatting artifact, see
the corpus spec amendment). The pilot is preserved in `paper/results/replay-ab-pilot.json`
and excluded from all analysis; the blind-solve protocol above replaces it.

## Analysis & reporting
Per-condition means + per-task pairing; small-N reported as directional, never as
significance theater. Results → `paper/results/replay-ab.json` (+ raw cells), a CHANGELOG
Research note, and the site ledger IF the claim survives its own evidence rules. A null or
a control win is reported plainly.

## Done when
Smoke green → full run complete → analysis committed with the honest verdict.
