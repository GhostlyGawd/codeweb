# Spec: replay miner correctness + multi-repo corpus

## Problem
`paper/experiments/replay-mine.mjs` produces the ground-truth tasks the replay A/B runs on,
but has **zero tests** — a miner bug would silently poison the benchmark. The corpus is also
thin: 2 tasks, one repo (axios).

## Behavior (testable contract)
Given a repo history, the miner emits a task **iff** all of:
1. A commit `C` (non-merge, first-parent, ≤12 source files changed, signature-ish diff) changes
   the definition line or extracted signature of a product function/method `S` present at both
   `C^` and `C` under the same id.
2. At `C^`, `S` has ≥ `--min-callers` caller **files** (call/import/ref edges, own file excluded).
3. `C` itself does NOT touch ≥1 of those caller files (`missedByChange` non-empty).
4. A commit within the next `--followup-window` first-parent commits touches a missed caller
   file AND its diff mentions `S`'s label (word-bounded) — `fixedInFollowup` non-empty.

Emitted task carries: `baseSha = C^`, `changeSha = C`, `missedByChange`, `fixedInFollowup`
(sha + files), the definition-side diff (≤4KB), and a neutral instruction. The funnel
(pairs → symbols → signatureChanged → enoughCallers → missed → followupFix) is always
reported — a 0-task run must say where candidates died.

## Tests (TDD — synthetic git fixtures, no network)
- **P1 positive**: history = base(hub + 3 callers) → C(change hub's signature, update 1 caller)
  → F(fix one missed caller, mentions hub) → noise commit. Expect exactly one task:
  correct base/change shas, `missedByChange` = the 2 un-updated caller files,
  `fixedInFollowup` = [F], not the noise commit.
- **P2 negative (well-executed change)**: C updates ALL caller files → 0 tasks,
  funnel shows `hadMissedCallers 0`.
- **P3 window boundary**: fix lands outside `--followup-window` → 0 tasks,
  funnel shows `hadFollowupFix 0`.

## Corpus target
≥3 ground-truth tasks across ≥2 real repos (axios mined; add vite history). Mining runs are
free/offline; every run's funnel is committed with the task file.

## Done when
Tests pass; any miner bug they expose is fixed; `paper/results/replay-tasks.json` holds the
multi-repo corpus with funnels.
