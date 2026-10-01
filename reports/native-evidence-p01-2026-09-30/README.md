# P-01 — bounded similarity-output correction

Status: separately reviewed and locally verified candidate. The user approved proceeding with Sol high implementation and a separate Sol high reviewer. Direct Codex was the stated execution assumption after a routing clarification; Paperclip was not started. Product source is isolated on `codex/p01-honest-similarity-output` from main `fd3b637e9ad4e1f7265799298761bc1ee83fe76c`.

## Result

Empty similarity results no longer imply novelty or safe writing. Positive results are source candidates for comparison, with mapped non-test scope, lexical/structural mode, similarity floor, existing-body cap, missing/unmapped limits and source/test judgment kept explicit. Human output names omitted candidates and a working expansion command. The matching MCP description uses the same bounded claims and shared constants.

Ranking, JSON fields/counts, similarity thresholds, body/candidate caps, source errors, exit behavior and MCP argument/schema behavior are preserved. AC-34 and its failing-before/passing-after product regressions pin this surface. [Implementation](IMPLEMENTATION.md), [verification](VERIFICATION.json) and [original regression](REGRESSION-BEFORE.json) preserve the work.

## Verification

The separate Sol high reviewer issued [PASS](REVIEW.md) for the exact five source/test/spec hashes. Its [verification](REVIEWER-VERIFICATION.json) includes 70 targeted test executions, 36 exact CLI base/candidate comparisons and eight MCP reply/schema comparisons, plus independent reproduction of the old six-failure regression.

Root's `sh scripts/check` [passed](FULL-GATE.json): 46 Python checks, 1,218 passing product tests, 60 skipped product tests and five golden evals. This was a bare main-based worktree; optional/unavailable cases remain skipped, not passes. [Full log](FULL-GATE.log). Protected harness and existing dirty-original-checkout hashes are unchanged.

## Delivery and limits

[COMPLETION.json](COMPLETION.json) records the source identity and technical scope; [COORDINATION.json](COORDINATION.json) records the operating method without inventing active time, costs or comparative benefit. The original root checkout's existing product edits remain preserved. Source code was changed in the isolated candidate; the published package is not updated and main merge/release are separate actions.

Applicable similarity parts of NED-01/03/06/07 are checked. The broader fixture/host matrix remains P-02 and final field readiness remains P-04. No participant outcome, retained use, purchase or direct-versus-Paperclip superiority is claimed. This is a technical truthfulness correction, not a product-value study.

GitHub [CI readback](CI.json) reports all ten checks successful on exact source commit `5da4d883c6e7056a4a419f23df86ab6f1c546a75`, including Linux Node 22/24, Windows Node 22, no-AST, bench, gate, consistency and browser verification. Delivery is [draft PR #98](https://github.com/GhostlyGawd/codeweb/pull/98); no merge or package release occurred.
