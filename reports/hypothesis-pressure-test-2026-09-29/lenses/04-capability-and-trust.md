# Lens 04 — Capability and trust

Verdict: **narrow** the local promise to source-linked inspection guidance; **revise** confidence and failure presentation. Reject completeness, semantic-equivalence and behavioral-safety implications. The paid coordination capability remains unproven by this packet.

Assignment: H2, H4, H8; CW-Z007, CW-Z011, CW-T022, CW-X013, CW-Z004.

Input manifest SHA256: `748f176be9d48ccf383ff6a6a601b56e7a8337bc898d27c2f1c319462a7e9852`. All 192 input files verified before analysis; final verification recorded in the receipt.

Strongest case: hashed mapped relationships, explicit unresolved questions and preserved structural baselines provide useful inspectable facts. Strongest countercase: generated/dynamic gaps, silent hook failure paths, bounded lexical comparison, and lack of actual behavioral-run provenance prevent these facts from becoming a safety verdict.

The current strategy already acknowledges many boundaries. This review narrows what can be claimed as available today; it does not reject its carefully qualified trial proposal or authorize implementation. The concrete misleading formatter and silent hook paths below deserve explicit disposition in synthesis.

## L04-F01 — Retain mapped consumers as source-inspection leads; reject an exhaustive affected-code or safe-deletion interpretation.

**Actor/task:** Agent-heavy developer modifying a shared extracted symbol in an accessible repository.

**Conditions:** Correct source root and revision, supported extraction profile, inspected witness source; generated/runtime/external consumers explicitly outside guaranteed coverage.

**Strongest case:** Evidence receipts bind caller/callee/impact relations to witness paths and source hashes and label unmapped calls and external consumers. Locating those files can make contextual inspection practical.

**Strongest countercase:** The generated-method capability matrix preserves text/compiler alternatives; the empty-reference incident shows a plausible absence/failure confusion, not a demonstrated Codeweb defect. Native tools can suffice on clean tasks.

**Failure scenario:** A developer removes a callback because the map has zero callers; a reflective registration or generated consumer still invokes it.

**Verdict:** narrow

**Weakest assumption:** Relevant callers are mapped and source inspection changes a decision.

**Local implication:** Promise a bounded list of mapped relationships and questions; keep zero, unavailable, partial and unsupported distinct.

**Paid implication:** Explicit cross-repository relationships and external checks are additional inputs; a local graph cannot promise automatic contract compatibility.

**Minimal falsification test (not executed):** On one pinned fixture contrast a direct caller, reflective caller, generated method and actual orphan. Independently enumerate callers with text/compiler/runtime evidence. Fail the promise if absence is presented as exhaustive or safe.

**Confidence and limits:** High for frozen receipt fields; moderate for useful guidance; no runtime completeness or customer-effect measurement.

**Supporting:** L04-C01, L04-C03, CW-L023. **Opposing/qualifying:** CW-Z007, CW-Z011, CW-X001. Source pointers follow; JSON carries the same full schema.

## L04-F02 — Similarity supports candidate comparison, not semantic reuse; reject the frozen CLI’s empty-result safety wording.

**Actor/task:** Developer considering reuse before adding a function.

**Conditions:** Candidate text and accessible graph bodies; lexical default or identifier-normalized structural mode; existing bodies capped, test files excluded, threshold and top-k bound results.

**Strongest case:** The implementation provides deterministic scores, source locations, mode, body cap, total count and omitted-match count. These can cheaply shortlist code for inspection.

**Strongest countercase:** The strategy already leaves suitability with the developer. Even renamed clones can have different domain contracts; semantically equivalent implementations can have dissimilar token sequences. Missing bodies are skipped in the source loop.

**Failure scenario:** A semantically equivalent implementation uses a different algorithm and scores below threshold; the plain CLI prints “safe to write” and the agent creates a needless duplicate. Conversely a high-scoring billing routine differs in rounding semantics.

**Verdict:** revise

**Weakest assumption:** Lexical proximity correlates with useful candidates in the selected task.

**Local implication:** Use candidate language, disclose searched set and omissions; neither a score tier nor zero matches proves equivalence, novelty or safety. Text formatter at find-similar.mjs is a concrete confidence mismatch, identified statically, not a measured user failure.

**Paid implication:** No paid semantic engine is evidenced here; do not sell candidate similarity as guaranteed reuse or savings.

**Minimal falsification test (not executed):** Compare two similar bodies with conflicting contracts and two equivalent implementations with different syntax, plus a missing body and a beyond-cap distinction. Check JSON and plain text. Reject any safe/novel or equivalent claim based solely on the score.

**Confidence and limits:** High for algorithm and quoted formatter; inference for the failure scenario. Frozen imported shingler internals and end-to-end host outputs were not executed.

**Supporting:** L04-C02, L04-C08. **Opposing/qualifying:** L04-C07, CW-Z011. Source pointers follow; JSON carries the same full schema.

## L04-F03 — Preserved baselines and explicit evidence receipts support auditable structural change, but unchanged/green and refresh are narrower than complete verification.

**Actor/task:** Author or reviewer comparing a consequential edit and its repair.

**Conditions:** Same preserved pre-edit baseline, compatible analysis profile, accessible immutable source snapshot, explicit list of checks actually performed.

**Strongest case:** Receipts bind source inventory, analyzer identity and witness evidence; reconciliation distinguishes changed, unchanged and inconclusive. Gate documentation flags incomplete extraction in either snapshot. CI documentation specifies revision-aware source links.

**Strongest countercase:** Refresh drops overlap evidence, leaving duplication unevaluated. The ordinary gate exempts exports from its orphan criterion and pure removals do not fail. Post-edit hook checks differ from the PR gate; identical green badges cannot be assumed interchangeable.

**Failure scenario:** An agent refreshes then calls a green diff duplication-clean, or overwrites the original baseline after a repair and hides an earlier regression.

**Verdict:** narrow

**Weakest assumption:** The host preserves the original baseline and displays performed/skipped checks without collapsing them.

**Local implication:** Keep analyzer/profile, baseline/current identity, performed checks and unresolved questions with the result. An unchanged evidence subset can coexist with changed unrelated inputs; neither state establishes behavior.

**Paid implication:** A hosted receipt is only meaningful if it binds each actual run to tested revisions; an artifact alone does not implement reruns or guarantee queue recovery.

**Minimal falsification test (not executed):** Capture baseline, introduce a duplicate, compare refresh-only versus full-pipeline diff, then repair against the original baseline. Add incompatible profile/incomplete-baseline cases. Require skipped duplication and inconclusive states to remain visible.

**Confidence and limits:** High for frozen contracts and reconciliation source; no gate execution or host lifecycle demonstration in this read-only lens.

**Supporting:** L04-C01, L04-C03, L04-C04. **Opposing/qualifying:** L04-C06, CW-X013. Source pointers follow; JSON carries the same full schema.

## L04-F04 — Honest uncertainty exists in explicit outputs but the ambient hooks do not establish the proposed universal failure/coverage presentation.

**Actor/task:** Developer receiving unsolicited pre/post-edit context inside a host.

**Conditions:** Missing target/map/source, extraction failure, stale state, no signal, or prior-warning suppression.

**Strongest case:** Fail-open hooks preserve editing continuity; current receipt API has explicit diagnostic and inconclusive information, and the strategy requires truthful failure states.

**Strongest countercase:** The pre-edit source returns null for missing targets/entries and catches failures; freshness annotation is best-effort and file-stat based. The post-edit hook is explicitly silent on baseline/extraction failures and deduplicates repeated flags. Silence therefore has multiple meanings.

**Failure scenario:** The user treats a missing brief as evidence of an isolated safe edit when the map was unavailable, or treats a suppressed warning as a resolved issue.

**Verdict:** revise

**Weakest assumption:** Users can distinguish intentional suppression from unavailable analysis in the actual host.

**Local implication:** Before promising honest conditional suppression, show readiness and recoverable unavailability through a verified host path; retain unresolved issues outside deduplicated notification delivery. This is a source-level gap, not proof of a current host incident.

**Paid implication:** Paid check coordination must preserve failed/pending/skipped/unknown states durably; the local advisory hook is not that service.

**Minimal falsification test (not executed):** In the intended host exercise no-signal, missing-map, malformed-map, stale-file, extraction-failure and repeated-warning cases; require inspectable distinct status and recovery. No fresh installation trial performed here.

**Confidence and limits:** High for source-level null/fail-open branches; unknown for complete current host behavior and user interpretation.

**Supporting:** L04-C05, L04-C06, CW-Z007. **Opposing/qualifying:** L04-C01, L04-C07. Source pointers follow; JSON carries the same full schema.

## L04-F05 — Test-neighbor edges, recorded coverage, structural verdicts and behavioral success require separate provenance; reject a single synthetic verified label.

**Actor/task:** Author/reviewer deciding what was actually checked after an edit.

**Conditions:** Actual test/CI artifacts exist with command, source revision, execution status, logs and relevant environment; test oracle adequacy remains independently assessed.

**Strongest case:** The reference explicitly distinguishes heuristic test-kind edges from imported coverage hits. Structural gate documentation tells users to run real tests. Source-linked evidence is useful to orient those checks.

**Strongest countercase:** Coverage means code was exercised in a recorded run, not that assertions are correct. The cited UI-test account reports test-time repairs masking defects; the workflow accounts separate attempted fixes/completion from independently verified outcomes. Those are source-specific reports, not Codeweb reproductions.

**Failure scenario:** A green structural diff and a named test neighbor are rendered as tests passed although no project tests ran, or old coverage is attached to a newer revision.

**Verdict:** reject

**Weakest assumption:** The proposed aggregator obtains authoritative, revision-matched test evidence rather than agent narration.

**Local implication:** Retain structural guidance; show tests as heuristic suggestions unless a real run supports a separately labeled status. Missing provenance is unknown, not pass. Do not imply test-oracle validation.

**Paid implication:** Actual runner/CI ingestion, revision invalidation and recovery need demonstrated machinery; a static local receipt cannot supply them. Paid promise remains proposed.

**Minimal falsification test (not executed):** Present a skipped test, failed run, stale green run, current green run and deliberately invalid oracle alongside the same structural graph. Require correct distinct statuses and no claim of behavioral safety. Independent test review must catch the invalid oracle.

**Confidence and limits:** High for documented separation; public incidents are unreplicated and bounded; no current CI execution provenance was provided or generated in this assignment.

**Supporting:** L04-C03, L04-C04, CW-T022, CW-X013, CW-Z004. **Opposing/qualifying:** L04-C01, L04-C07. Source pointers follow; JSON carries the same full schema.

## L04-F06 — H2 survives only as a contextual-inspection hypothesis with recall and effort tradeoffs; the paid coordination promise remains technically unproven.

**Actor/task:** Developer/reviewer whose uncertainty can be resolved by inspecting another file; potential team coordinator remains a hypothesis.

**Conditions:** Consequential cross-file task, relevant retrieved source, ordinary native baseline, total inspection/verification cost included.

**Strongest case:** The firmware experiment reports that caller/header/init context removed recurring false positives, making source navigation a plausible aid.

**Strongest countercase:** The same experiment reports lower recall; historical semantic-tool accounts describe rereading cost. Existing PR artifacts and native tools may already serve the job. Neither replicated agreement nor a coherent service design supplies customer or buyer evidence.

**Failure scenario:** A concise brief omits a rare real defect, reduces visible warnings and is mistaken for improved review; the team still manually runs and reconciles all checks behind a paid-looking receipt.

**Verdict:** unresolved_from_existing_evidence

**Weakest assumption:** Relevant context yields net better decisions after lost recall and additional work are counted.

**Local implication:** Retain a conditional, falsifiable inspection aid; do not generalize false-positive reduction into fewer regressions or repeated reliance.

**Paid implication:** Reject describing managed coordination as currently implemented from this packet. Keep the proposal conditional on a demonstrated recurring job and incremental value over CI.

**Minimal falsification test (not executed):** Use one matched cross-file task with recorded native baseline and independently adjudicated true/false findings; include total reading and verification effort. Separately trace one explicit producer/consumer check through revision change and runner failure before asserting a service capability.

**Confidence and limits:** Moderate mechanism plausibility, low incremental-effect and paid confidence; small builder-heavy reports, no Codeweb replay or buyer result.

**Supporting:** CW-L023, L04-C01, L04-C07. **Opposing/qualifying:** CW-Z012, CW-X001, CW-Y012, CW-Z004. Source pointers follow; JSON carries the same full schema.

## Source and access ledger

Repository findings are observations of frozen code/documentation, not runtime test results. URLs below locate originals; local captures and their manifest hashes bind this assessment.

- **L04-C01** — [https://github.com/GhostlyGawd/codeweb/blob/main/scripts/lib/evidence-core.mjs](https://github.com/GhostlyGawd/codeweb/blob/main/scripts/lib/evidence-core.mjs); `inputs/scripts/lib/evidence-core.mjs`; passage: analysisOf, relationsOf, questionsOf, reconcileReceipt; lines 62–175. Source-hashed witness paths, explicit unmapped/external callers, analysis compatibility and inconclusive states.

- **L04-C02** — [https://github.com/GhostlyGawd/codeweb/blob/main/scripts/find-similar.mjs](https://github.com/GhostlyGawd/codeweb/blob/main/scripts/find-similar.mjs); `inputs/scripts/find-similar.mjs`; passage: lines 1–15, 65–129; candidate loop and text formatter. Token-shingle Jaccard, optional normalized skeleton, capped existing bodies, non-test functions/methods only, null source skipped; empty-result text says safe to write.

- **L04-C03** — [https://github.com/GhostlyGawd/codeweb/blob/main/docs/reference.md](https://github.com/GhostlyGawd/codeweb/blob/main/docs/reference.md); `inputs/docs/reference.md`; passage: Guard agent edits; Measured coverage; final incomplete-extraction note. Preserved baseline; refresh skips duplication; test edges heuristic; imported coverage only records execution hits.

- **L04-C04** — [https://github.com/GhostlyGawd/codeweb/blob/main/docs/ci-gate.md](https://github.com/GhostlyGawd/codeweb/blob/main/docs/ci-gate.md); `inputs/docs/ci-gate.md`; passage: lines 3–20, 77–111. Structural gate criteria, omissions, skipped-check distinction, both-snapshot incompleteness, commit-link fallbacks.

- **L04-C05** — [https://github.com/GhostlyGawd/codeweb/blob/main/hooks/pre-edit-impact.mjs](https://github.com/GhostlyGawd/codeweb/blob/main/hooks/pre-edit-impact.mjs); `inputs/hooks/pre-edit-impact.mjs`; passage: preview lines 100–139 and main handler lines 141 onward. Missing target/entry returns null; freshness is best-effort stat comparison; advisory hook.

- **L04-C06** — [https://github.com/GhostlyGawd/codeweb/blob/main/hooks/post-edit-diff.mjs](https://github.com/GhostlyGawd/codeweb/blob/main/hooks/post-edit-diff.mjs); `inputs/hooks/post-edit-diff.mjs`; passage: header; check lines 60–89; dedupeFlags lines 91–114. Fail-open on missing baseline/extraction failure; baseline-scoped repeated flags suppressed.

- **L04-C07** — [https://github.com/GhostlyGawd/codeweb/blob/main/reports/user-centric-value-strategy/STRATEGY.md](https://github.com/GhostlyGawd/codeweb/blob/main/reports/user-centric-value-strategy/STRATEGY.md); `inputs/reports/user-centric-value-strategy/STRATEGY.md`; passage: Define the experience; Make the useful path feel native; Connect developer value to a paid team job. Honest states, six-line conditional brief and hosted coordination are explicitly proposed; supported checks only.

- **L04-C08** — [https://github.com/GhostlyGawd/codeweb/blob/main/CHARTER.md](https://github.com/GhostlyGawd/codeweb/blob/main/CHARTER.md); `inputs/CHARTER.md`; passage: Non-goals, Invariants, free forever / Teams boundary. Reads code without executing it; local one-repo work remains free; hosted build permission is not shipped capability.

- **CW-Z007** — [https://github.com/oraios/serena/issues/1814](https://github.com/oraios/serena/issues/1814); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl#CW-Z007`; passage: Summary; Additional suggestion; Note on scoping. API rate-limited; full body read, comment completeness unverified. First-query crash fix merged Aug 20 (#1848); later-query fix #2007 remains open. No blanket fixed claim.

- **CW-Z011** — [https://github.com/oraios/serena/issues/1432](https://github.com/oraios/serena/issues/1432); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl#CW-Z011`; passage: Capability matrix in body. Full body only; comments unavailable. Closed with #1434, but linked PR inaccessible, so resolution not verified.

- **CW-T022** — [https://www.reddit.com/r/ClaudeCode/comments/1rug14a/claude_wrote_playwright_tests_that_secretly/](https://www.reddit.com/r/ClaudeCode/comments/1rug14a/claude_wrote_playwright_tests_that_secretly/); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl#CW-T022`; passage: Original post and author clarification. Partial thread; hidden replies not loaded. Exact date not established in opened page (relative ages only); discovery dates not promoted to publication facts. Same author/incident grouped. Self-report; no independent reproduction.

- **CW-X013** — [https://github.com/openai/codex/issues/24285](https://github.com/openai/codex/issues/24285); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl#CW-X013`; passage: Body: Concrete examples from AJENTIC; Expected behavior. Public report only; underlying commits and traces not reproduced. Comments unavailable after REST rate limit. One project context, not each phase counted.

- **CW-Z004** — [https://securityatlightspeed.substack.com/p/building-a-cloud-agentic-swe-loop](https://securityatlightspeed.substack.com/p/building-a-cloud-agentic-swe-loop); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl#CW-Z004`; passage: Attempt 1; Attempt 2; Review Findings Were Not Independently Revalidated. Single experiment; GPT-5.3-Codex. Author explicitly updates earlier API limitation as historical; do not claim a current missing API.

- **CW-L023** — [https://edgelog.dev/blog/how-many-ai-code-reviews/](https://edgelog.dev/blog/how-many-ai-code-reviews/); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl#CW-L023`; passage: Parts 1, 5; limitations 23.5–23.7. Full article read in overlapping chunks; author adjudication, three small tasks, two models, no independent rerun. Tool-builder case. Not a model leaderboard or proven Codeweb effect.

- **CW-Z012** — [https://github.com/oraios/serena/discussions/131](https://github.com/oraios/serena/discussions/131); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl#CW-Z012`; passage: May 30–June 2 maintainer replies; reporter May 31 recovery. Historical discussion; estimates in proposal and pasted model analysis not treated as measurements. Whole discussion counts once.

- **CW-X001** — [https://www.agentconnect.md/blog/grep-beat-lsp-harness/](https://www.agentconnect.md/blog/grep-beat-lsp-harness/); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl#CW-X001`; passage: Sections: agents route by task; noisy codebases; output shape; limitations. Two–three runs per cell. No LSP rename/diagnostics tested. Primary article read completely; linked experiment repo not read. One study, not customer incidents.

- **CW-Y012** — [https://www.beyondautocomplete.nl/ai-writes-faster-than-we-can-review-heres-how-we-fixed-that/](https://www.beyondautocomplete.nl/ai-writes-faster-than-we-can-review-heres-how-we-fixed-that/); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl#CW-Y012`; passage: Solutions; Artifacts; Where we are now. Initial experiment only days old. March 28 and July 10 follow-ups are same underlying team, not independent incidents.

## Targeted original reopens and gaps

See `../receipts/L04-source-addendum.json` for dated original-page reads and bounded paraphrase captures. Reopened Serena issue bodies confirm the absence/failure and generated-symbol distinctions; issue closure alone does not verify complete fixes. Codex issue body and the SWE-loop experiment preserve execution-versus-verification distinctions. EdgeLog Part 5 preserves the precision/recall countercase. No full-thread or independent-reproduction claim is made. CW-T022 remains a frozen partial original-post record, not a newly verified incident.

The full frozen packet was available. This lens inspected canonical relevant records, source registry boundaries, prior independent research review, strategy/proof proposal, charter, and selected implementation/docs. It did not reread all 132 corpus records or audit all engine dependencies. All source counts are corpus coverage, not prevalence. No other pressure-test lens output was opened.

## Delivery and review boundary

First draft preserved under `history/L04-first-draft/`. Machine-readable findings: `04-findings.json`; run/session/hash receipt: `../receipts/L04.json`. Completion means this analytical assignment was delivered; independent synthesis/fidelity review remains the parent workflow. No self-review approval, product change, separate bug task or new workstream was created.
