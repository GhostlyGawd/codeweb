# Spec: replay miner correctness + multi-repo corpus

## Problem
`bench/experiments/replay-mine.mjs` produces the ground-truth tasks the replay A/B runs on,
but has **zero tests** — a miner bug would silently poison the benchmark. The corpus is also
thin: 2 tasks, one repo (axios).

## Behavior (testable contract)
Given a repo history, the miner emits a task **iff** all of:
1. A commit `C` (non-merge, first-parent, ≤12 source files changed, signature-ish diff) changes
   the definition line or extracted signature of a product function/method `S` present at both
   `C^` and `C` under the same id — compared AFTER normalizing quote style, parens, whitespace,
   and trailing semicolons, so a pure reformat is **not** a signature change. `S`'s label must
   not be a language keyword: rule 4's evidence is a word-bounded mention, and a keyword
   "mention" matches syntax, not the symbol.
2. At `C^`, `S` has ≥ `--min-callers` caller **files** (call/import/ref edges, own file excluded).
3. `C` itself does NOT touch ≥1 of those caller files (`missedByChange` non-empty).
4. A commit within the next `--followup-window` first-parent commits touches a missed caller
   file AND its diff mentions `S`'s label (word-bounded) — `fixedInFollowup` non-empty.
5. The change's file diff embeds **complete** (≤16KB) — the instruction promises the change
   verbatim, so a task whose diff would truncate is rejected, never cut mid-hunk.

Emitted task carries: `baseSha = C^`, `changeSha = C`, `missedByChange`, `fixedInFollowup`
(sha + files), the complete definition-side diff, and a neutral instruction. The funnel
(pairs → symbols → idPresent → distinctiveLabel → signatureChanged → enoughCallers → missed
→ followupFix → defDiffComplete) is always reported — a 0-task run must say where candidates
died.

## Tests (TDD — synthetic git fixtures, no network)
- **P1 positive**: history = base(hub + 3 callers) → C(change hub's signature, update 1 caller)
  → F(fix one missed caller, mentions hub) → noise commit. Expect exactly one task:
  correct base/change shas, `missedByChange` = the 2 un-updated caller files,
  `fixedInFollowup` = [F], not the noise commit.
- **P2 negative (well-executed change)**: C updates ALL caller files → 0 tasks,
  funnel shows `hadMissedCallers 0`.
- **P3 window boundary**: fix lands outside `--followup-window` → 0 tasks,
  funnel shows `hadFollowupFix 0`.
- **P4 formatting guard**: a quotes/spacing-only reformat of the def line, with a later
  caller reformat that mentions the symbol → 0 tasks, funnel shows `signatureChanged 0`.
- **P5 verbatim guard**: a real signature change whose file diff exceeds the embed cap →
  0 tasks, funnel shows `defDiffComplete 0`.
- **P6 keyword-label guard**: a real signature change on a symbol named `type` → 0 tasks,
  funnel shows `distinctiveLabel 0`.

## Corpus target
≥3 ground-truth tasks across ≥2 real repos (axios mined; add vite history). Mining runs are
free/offline; every run's funnel is committed with the task file. Before freezing, every
surviving task is verified BY HAND against history: the follow-up fix must be a semantic
caller update (e.g. passing a new argument), not a reformat that happens to mention the symbol.

## Amendment (2026-07-19, before any v2 solving)
The v1 frozen corpus (3 axios tasks) contained 2 invalid tasks: `isObject` and `forEach` came
from a prettier reformat bundled into a security commit — the def line changed only in
quote/spacing style, and the "missed callers" were files a later repo-wide reformat touched.
The raw def-line comparison read formatting as a signature change. Fixes: the normalization in
rule 1 (test P4), the verbatim guard in rule 5 (test P5; v1 truncated instructions at 4KB
mid-hunk), and the hand-verification step above. The corpus is re-mined and re-frozen as v2
with these guards before any v2 cell is solved.

Also found while re-mining: (a) the v1 "vite history is quiet" explanation was wrong — the
clone was shallow (201 commits); deepened to 2,731 for v2. (b) The deepened vite walk surfaced
a candidate named `type` (a `ModuleNode` getter) whose "follow-up fix" matched only
`import type {...}` syntax in an unrelated hostname fix — rejected by hand-verification and
turned into the keyword-label guard in rule 1 (test P6).

## Done when
Tests pass; any miner bug they expose is fixed; `bench/results/replay-tasks.json` holds the
multi-repo corpus with funnels.
