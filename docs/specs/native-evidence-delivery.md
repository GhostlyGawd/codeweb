# Native evidence delivery and trust — first bounded product spec

Spec ID: NED. Prepared September 30, 2026. Status: execution-ready specification; product work and host trials are pending. Owner: Codex. Work: P-01 through P-04. Sources: F-C02/F-C03, F-T02/F-T03 and the linked findings in [DECISIONS.json](../product-team/DECISIONS.json). [Baseline and reproduced CLI behavior](../../reports/research-to-execution-plan-2026-09-30/BASELINE.json).

## User and outcome

An individual maintainer asks their coding agent for an actual change involving unresolved reference scope or a possible existing implementation. Relevant supported source facts arrive before the edit decision; unavailable or ambiguous evidence is understandable and recoverable with less supervision. The maintainer can continue with normal source inspection and tests.

This spec establishes technical readiness for a user comparison. It does not establish decision improvement, complete runtime dependency coverage, safe reuse, retention or payment.

## Existing implementation and smallest change

Published 0.15.0 includes context/impact/similarity tools and advisory hooks. PR #96's first-use discovery fixes are merged; PR #97's optional receipts are merged source work and unreleased in the package. Reuse those mechanisms where available. Do not build a second evidence store, task-memory platform, dashboard or coordinator.

P-01 starts with `scripts/find-similar.mjs`: an empty match list currently emits “looks novel; safe to write.” The [published CLI reproduction](../../reports/research-to-execution-plan-2026-09-30/EMPTY-RESULT-REPRO.json) uses an empty/incomplete supplied map and returns that statement. Replace it with a bounded no-candidates statement and a clear supported-source limitation. Preserve documented JSON fields/counts, exit semantics and ranking unless a separately justified contract amendment is made.

The current impact hook chooses the highest-incoming-edge symbol in the file. If the actual edit target is known, the evidence must concern it. If only a file is known, label the scope as a file-level summary or ambiguous selection rather than pretending the popular symbol is the edited target. Resolve scope using existing supported selectors; an exact-target claim is not a mandate to build a new semantic parser.

Explicit evidence outputs already distinguish several failures. Verify the ambient path separately. Missing/unavailable evidence should remain inspectable without turning every ordinary edit into a disruptive alert. Correctness states must not depend on an accidental silent return.

## Acceptance cases

| ID | Required behavior | Verification |
|---|---|---|
| NED-01 | No empty, unchanged or green result asserts safe writing, safe deletion, exhaustive scope or behavioral correctness | Text/JSON review on empty, supported-zero and incomplete cases; ordinary failures retain their original exit behavior |
| NED-02 | A known edited low-fan-in symbol has its relevant supported consumer shown; a file-only input explicitly declares its scope/ambiguity | Multi-symbol fixture with a more popular unrelated symbol and a known consequential consumer |
| NED-03 | Similarity offers source-linked candidates for comparison, with existing threshold/body-cap/truncation limits; it never asserts semantic substitutability | Conflicting-contract similar bodies, different-syntax equivalents, missing bodies, body-cap and no-match controls |
| NED-04 | Empty supported result, unmapped, corrupt, stale, unsupported/generated scope and invocation failure are distinguishable where that surface is claimed | Run the complete fixture matrix and inspect the actual host-delivered state as well as explicit CLI/MCP output |
| NED-05 | Recovery respects permissions, names a usable next step and preserves the original pre-edit baseline; missing original evidence is not invented | Denied permission, missing/stale map, refresh/repair and linked-worktree checks with before/after baseline hashes |
| NED-06 | Structural verdict, test-neighbor hints, historical coverage and actual executed-test results retain separate provenance | Failed/skipped/stale/current tests and a deliberately invalid test oracle; preserve the ordinary gate's failures |
| NED-07 | Bounded output preserves relevance, omitted counts/source expansion and uncertainty; same-file relationships and intentional duplication are valid | Exact source opening, useful consumer/candidate coverage, expansion and an intentional-duplication dismissal |
| NED-08 | Native availability is recorded per host/surface/candidate/worktree; permissions/trust are not bypassed | Clean discovery, actual source-linked tool use and claimed pre-edit delivery in each supported host and linked worktree |
| NED-09 | Delivery is usable before the relevant edit; cold/warm/refresh/recovery effort is reported per run | Request/trigger/permission/refresh/result/source-open timestamps; no latency percentile or one-second promise inferred from a tiny run |
| NED-10 | User control and ordinary workflow survive: disable/uninstall stops injection, and quiet supported cases avoid repeated irrelevant interventions | Claimed disable/uninstall path, normal edits, repeated events, and equivalent competent-control sessions |

The full technical matrix precedes an unqualified field-ready claim; P-01 alone does not pass the spec. P-02 records all cases, P-03 repairs only demonstrated remaining gaps, and P-04 freezes the final candidate and relevant review/check evidence. Amend central SPEC.md/acceptance pins through its existing process if implementation changes require it; this planning pass changes no protected harness or product code.

## Host surfaces

Claude Code: verify the shipped plugin/MCP and any advisory pre-tool delivery on the installed version. The [official hooks reference](https://code.claude.com/docs/en/hooks) documents contextual hook output separately from permission decisions; preserve the user's permission flow.

Codex: verify MCP/skill discovery and explicit evidence use first. Any claimed ambient delivery needs its actual supported runtime event, adapter and trusted definition verified. [Official plugin packaging](https://developers.openai.com/plugins/build/plugins) requires hook scripts in the execution environment and user trust; [Claude plugin adaptation guidance](https://developers.openai.com/plugins/guides/submit-claude-plugin) calls for adapting hooks. Do not infer that the shipped Claude hook schema runs unchanged in Codex or every Chat surface. Documentation capability is not a completed Codeweb client test.

## Delivery evidence

Use an isolated checkout of the selected main/source candidate, with Node/package/host versions, configuration, source/layout scope and before-baseline identity pinned. Keep published-package results separate from newer source/receipt results. Retain commands, output, failures, checks and observed host transcripts or inspected captures. Keep participant source private; no new local telemetry/account/network feature is introduced.

Follow the project-required check/review process for the actual change. Report applicable case outcomes as pass/fail/unavailable with reasons and owners. Unresolved unsafe claims, relevant-target omissions or lost baseline block an unqualified readiness result. Source facts remain limited; ordinary compiler/tests and human judgment are still required.

## Limits and expansion

Six-line output and one-second warm delivery are provisional research budgets, not hard results or release promises. Choose a compact form that retains the needed fact and uncertainty, and let user-task evidence determine further simplification. New multi-repo inference, task memory, semantic clone decisions, hosted billing and a redesigned website are outside this spec.
