# Lens 02 — Incremental value and alternatives

**Verdict: narrow.** Codeweb has a plausible role in reaching a consequential consumer or reuse candidate that the native workflow missed. The reviewed evidence does not establish that Codeweb changes decisions, reduces total work, earns repeat use or warrants payment. Reject generic receipt value; leave residual paid coordination unresolved.

Assignment: H1, H2, H5. Input manifest SHA256 `748f176be9d48ccf383ff6a6a601b56e7a8337bc898d27c2f1c319462a7e9852`. Issue COD-81 (`a9ac96fc-1dbf-4981-b01d-1984d88217bb`), run `f7326cb1-7ec5-446f-912a-a1eaaaa45b26`, session `01a0f075-e447-7802-bd11-d6f12b75b1fc`.

## The decision Codeweb must add

The comparison is against the developer’s competent existing workflow: grep/search and LSP for locating code; clone detection plus source inspection for reuse; compiler/tests for their actual contracts; diffs, specs, review notes and CI for change evidence. A map can package an answer differently without changing the answer. Its proposed advantage is earlier, cheaper access to a missing fact that changes what gets inspected or reused. That is an empirical hypothesis, not a consequence of having a graph.

The strongest rival is to improve ordinary source access and keep familiar tools. It wins when it reaches the same actionable evidence with less total burden. The strategy already allows this rival to win; the proof sprint must preserve that possibility rather than selecting only tasks where Codeweb is likely to look useful.

## Findings

### L02-F01 — Navigation must change inspection scope

The useful incremental answer is a justified additional consumer to inspect, not a more precise or longer relationship list. Retain this only for tasks where native retrieval leaves consequential uncertainty.

**Actor/task and conditions:** Agent-heavy developer preparing a cross-file shared-symbol edit; ambiguous references are the best-supported candidate condition. Relevant consumers are statically mapped at the task revision; Native workflow leaves an unresolved inspection decision; Lexical fallback remains available for strings/configuration and unmapped use.

**For:** CW-X001 reports that semantic navigation helped disambiguate noisy references; CW-L023 illustrates why context outside the edited file can matter.

**Against:** CW-X001 also reports clean-repository overhead and unchanged overall caller recall. CW-Z001 records a successful bounded native refactor. Neither is a Codeweb comparison.

**Failure:** A developer already has the relevant references from search/LSP; a brief repeats them, adds refresh and reading work, and omits a string-based consumer that lexical search would find.

**Verdict:** `narrow`. **Weakest assumption:** Packaging mapped context reaches a missing consequential consumer more cheaply than the existing host workflow.

**Local:** Offer an optional inspection aid when uncertainty remains; do not make a mandatory structural step or assert complete impact. **Paid:** This is a free local benefit and cannot independently justify a hosted charge.

**Small falsification test:** On one real ambiguous shared-symbol task and one clean control, record native planned inspection first; independently adjudicate any additional Codeweb-induced inspection against source and task requirements. Falsify this use case if the added list changes no correct decision or increases total effort without preventing an omission.

**Confidence:** Moderate confidence in this boundary; low confidence in Codeweb incremental effect because no matched Codeweb task comparison exists in the reviewed evidence.

**Original evidence:** [CW-X001](https://www.agentconnect.md/blog/grep-beat-lsp-harness/) (Sections: agents route by task; noisy codebases; output shape; limitations; frozen EVIDENCE.jsonl line 35); [CW-L023](https://edgelog.dev/blog/how-many-ai-code-reviews/) (Parts 1, 5; limitations 23.5–23.7; frozen EVIDENCE.jsonl line 75); [CW-Z001](https://shan-verse.com/blog/codex-after-the-update/) (The Old Projects I Refactored; How I Use Codex Now; frozen EVIDENCE.jsonl line 109).

**Frozen capability/proposal pointers:** `inputs/scripts/context-pack.mjs:2-10`; `inputs/scripts/context-pack.mjs:78-103`; `inputs/scripts/explain.mjs:51`.

### L02-F02 — Reuse discovery competes with search and clone detection

Codeweb could move candidate discovery before implementation, but must beat native search plus ordinary duplication detection on the actual reuse decision. Fewer duplicated lines alone is not success.

**Actor/task and conditions:** Developer adding utility logic in a repository with overlooked existing abstractions; the strongest account is an experienced solo developer who later built duplication tooling. A useful existing implementation is present; Candidate source can be compared; Similarity is treated as a prompt to inspect, not a reuse verdict.

**For:** CW-T018 reports utility duplication and review effort; CW-Z003 reports repeated human prompting and jscpd-assisted inspection.

**Against:** CW-Z003 acknowledges legitimate duplication and measurement weaknesses. A clone tool plus small-commit review already surfaces candidates; familiar code may not need another retrieval layer.

**Failure:** A high-similarity helper has different error or lifecycle semantics. The agent merges it to satisfy a duplication signal and creates coupling; alternatively a semantically suitable but lexically different implementation is missed.

**Verdict:** `narrow`. **Weakest assumption:** Earlier candidate presentation changes a correct reuse choice enough to offset comparison and false-match costs.

**Local:** Keep ranked candidates and explicit human/agent source comparison; novelty or semantic suitability must not be inferred from a thresholded empty result. **Paid:** Candidate discovery on one repo stays free; no paid value follows from it.

**Small falsification test:** Use one actual utility addition with a known possible alternative and one intentional-duplication control. Compare native search plus the developer’s clone checker against Codeweb before editing. Maintainer adjudicates suitability and unwanted coupling; reject the mechanism if it only rediscovers the same candidate or causes an unnecessary abstraction.

**Confidence:** Moderate confidence in this boundary; low confidence in Codeweb incremental effect because no matched Codeweb task comparison exists in the reviewed evidence.

**Original evidence:** [CW-T018](https://news.ycombinator.com/item?id=48033774) (Story body and author reply 48035884; complete four-comment tree read; frozen EVIDENCE.jsonl line 24); [CW-Z003](https://ngof.nikhaldimann.com/p/deja-code) (Quantifying code duplication; methodological weaknesses; frozen EVIDENCE.jsonl line 111); [CW-Z012](https://github.com/oraios/serena/discussions/131) (May 30–June 2 maintainer replies; reporter May 31 recovery; frozen EVIDENCE.jsonl line 120).

**Frozen capability/proposal pointers:** `inputs/scripts/find-similar.mjs:2-12`; `inputs/scripts/find-similar.mjs:42-43`; `inputs/scripts/find-similar.mjs:64-107`.

### L02-F03 — Total task cost is the denominator

Lower query bytes, fewer tool calls or fewer returned false matches do not establish lower total cost. A brief succeeds only after setup, refresh, reading and downstream verification are counted.

**Actor/task and conditions:** Agent user choosing tools for a small edit or repeated consumer inspection. Compare equal task outcomes; Include failed activation and retries; Separate first-use setup from warm use and amortize only over observed eligible tasks.

**For:** CW-X001 supports source-bearing output over bare locations; the frozen context-pack entry point already requests call-site windows.

**Against:** CW-Z012 documents verification rereads erasing proposed editing savings; CW-X001 still favored grep in tested rename outcomes. These are bounded historical experiments, not current host benchmarks.

**Failure:** A six-line brief is cheap to generate but each source link requires another read; the user also repairs map setup, reruns normal tests and repeats native search to check omissions.

**Verdict:** `revise`. **Weakest assumption:** Saved orientation work exceeds new activation, freshness and trust-verification work across naturally occurring tasks.

**Local:** Evaluate end-to-end effort and correctness; output size is a diagnostic metric only. Keep cheap native controls. **Paid:** Any paid saving must exclude free-local savings and include service setup, maintenance and triage.

**Small falsification test:** Instrument one existing-output paired task comparison: setup, mapping, query, reads, retries, tests, review time and available token costs. Keep failure outcomes. Reject a claimed efficiency win when equal-quality completion costs more; do not extrapolate warm savings to invented task frequency.

**Confidence:** Moderate confidence in this boundary; low confidence in Codeweb incremental effect because no matched Codeweb task comparison exists in the reviewed evidence.

**Original evidence:** [CW-X001](https://www.agentconnect.md/blog/grep-beat-lsp-harness/) (Sections: agents route by task; noisy codebases; output shape; limitations; frozen EVIDENCE.jsonl line 35); [CW-Z012](https://github.com/oraios/serena/discussions/131) (May 30–June 2 maintainer replies; reporter May 31 recovery; frozen EVIDENCE.jsonl line 120).

**Frozen capability/proposal pointers:** `inputs/scripts/context-pack.mjs:2-10`; `inputs/reports/product-proof-sprint-plan/README.md:Proposed decision gate`.

### L02-F04 — Structural context is not a behavioral verdict

Codeweb may help locate evidence that changes a review judgment; it cannot replace inspection of runtime invariants or actual compiler/test execution. Compare against repository access, not a deliberately context-starved reviewer.

**Actor/task and conditions:** Reviewer investigating an apparent defect, or developer checking a producer/consumer contract. Source revision and actual executed check are known; Mapped relationships are inspection candidates; Project tests/compilers remain the appropriate evidence for their asserted contracts.

**For:** CW-L023 reports that repository access removed recurring false positives by exposing external context.

**Against:** That experiment also lost recall. CW-Z004 separates green CI from intended behavior; CW-Y007 names type-checking CI as the appropriate alternative for its contract problem.

**Failure:** A reviewer sees a caller path and infers thread identity or runtime order without checking it; a structurally unchanged API passes the map check while its runtime semantics break.

**Verdict:** `narrow`. **Weakest assumption:** A short structural route materially accelerates finding the decisive invariant without suppressing a real defect.

**Local:** Report what to inspect and distinguish unknown behavior from executed checks; no net safety improvement is established. **Paid:** Hosting may coordinate genuine tests but must not sell static map output as compatibility proof.

**Small falsification test:** Replay one disputed finding with both arms given full repository/test access. Add Codeweb only in the treatment. Independently adjudicate the decision, missed defects and total time. Reject the benefit if normal source access yields the same decision with less burden.

**Confidence:** Moderate confidence in this boundary; low confidence in Codeweb incremental effect because no matched Codeweb task comparison exists in the reviewed evidence.

**Original evidence:** [CW-L023](https://edgelog.dev/blog/how-many-ai-code-reviews/) (Parts 1, 5; limitations 23.5–23.7; frozen EVIDENCE.jsonl line 75); [CW-Z004](https://securityatlightspeed.substack.com/p/building-a-cloud-agentic-swe-loop) (Attempt 1; Attempt 2; Review Findings Were Not Independently Revalidated; frozen EVIDENCE.jsonl line 112); [CW-Y007](https://forum.cursor.com/t/any-way-of-using-multiple-repositories-in-bugbot/152120) (posts 1,5,6; frozen EVIDENCE.jsonl line 127).

**Frozen capability/proposal pointers:** `inputs/scripts/context-pack.mjs:2-5`; `inputs/reports/user-centric-value-strategy/STRATEGY.md:Define the experience in the user’s terms`.

### L02-F05 — A receipt must remove reconstruction work

A generic additional change receipt is not a demonstrated job. A source-linked artifact earns value only if it removes a specific evidence-reconstruction step left by ordinary PR practice.

**Actor/task and conditions:** PR reviewer or author reconstructing intended change, affected code and completed checks. An unresolved reviewer question is named; Existing spec, diff, PR history and CI evidence form the control; Any evidence is tied to tested source revisions.

**For:** CW-Y012 reports review load that generated summaries did not resolve; external context can be relevant to disputed findings.

**Against:** CW-Y012 already attaches existing specs/plans/review reports. CW-Y005 replaced bespoke retrieval with filesystem and shell access; this mature internal builder is not evidence of demand for a hosted Codeweb receipt.

**Failure:** The new receipt repeats the PR and CI statuses, diverges after a rebase, and forces the reviewer to reconcile two histories before reading the same source.

**Verdict:** `reject`. **Weakest assumption:** There is a recurring evidence gap that ordinary linked artifacts cannot close with less maintenance.

**Local:** Reject generic receipt value as established; retain a bounded experiment on a named missing consumer/check provenance question. **Paid:** Reject payment rationale based on packaging existing local/PR output alone.

**Small falsification test:** Choose one actual PR with a reviewer question. Give the control all existing artifacts and CI links; add the receipt in a matched review. Count reconstruction steps and adjudicated answer quality. Reject if it duplicates information, introduces stale contradictions, or changes no decision.

**Confidence:** Moderate confidence in this boundary; low confidence in Codeweb incremental effect because no matched Codeweb task comparison exists in the reviewed evidence.

**Original evidence:** [CW-Y012](https://www.beyondautocomplete.nl/ai-writes-faster-than-we-can-review-heres-how-we-fixed-that/) (Solutions; Artifacts; Where we are now; frozen EVIDENCE.jsonl line 132); [CW-L023](https://edgelog.dev/blog/how-many-ai-code-reviews/) (Parts 1, 5; limitations 23.5–23.7; frozen EVIDENCE.jsonl line 75); [CW-Y005](https://eng.wealthfront.com/2026/08/03/experiments-with-ai-code-review/) (Why Build; Unix Philosophy; Performance; Dev Lifecycle; frozen EVIDENCE.jsonl line 125).

**Frozen capability/proposal pointers:** `inputs/scripts/lib/evidence-service.mjs`; `inputs/reports/user-centric-value-strategy/STRATEGY.md:Connect developer value to a paid team job`.

### L02-F06 — CI is the paid baseline, not the strawman

The paid hypothesis survives only as untested residual coordination work: getting agreed checks run, rerun and shared with accurate revision/status provenance beyond adequate CI.

**Actor/task and conditions:** Multi-repository team developer repeatedly invoking a contract check; buyer authority is unestablished. Explicit repository relationships and permitted checks exist; A recurring coordination burden survives an adequate CI alternative; Hosted benefit is measured net of setup, policy and recovery work.

**For:** CW-Y007 reports repeated manual cross-repo checking and delayed repository consolidation, a plausible coordination trigger.

**Against:** The same requester accepted CI as more appropriate but had not evaluated it. No implemented CI failure, buyer decision or Codeweb purchase is established.

**Failure:** One CI workflow checks out the producer and consumer, runs the type check and posts results. A hosted service adds credentials, configuration and another bill while removing no remaining work.

**Verdict:** `unresolved_from_existing_evidence`. **Weakest assumption:** A willing buyer has recurring coordination costs that an ordinary CI integration leaves unsolved.

**Local:** Useful free local analysis remains independent of whether a service business exists. **Paid:** Test residual queue/retry/revision-sharing work separately; reject the paid offer for any team whose job adequate CI already solves.

**Small falsification test:** For one consenting team’s recent cross-repo change, map and cost the smallest CI solution against proposed managed coordination, including maintenance and source policy. If no recurring residual work remains, stop the paid hypothesis for that team. This is a proposed test, not authorized outreach or a completed trial.

**Confidence:** Moderate confidence in this boundary; low confidence in Codeweb incremental effect because no matched Codeweb task comparison exists in the reviewed evidence.

**Original evidence:** [CW-Y007](https://forum.cursor.com/t/any-way-of-using-multiple-repositories-in-bugbot/152120) (posts 1,5,6; frozen EVIDENCE.jsonl line 127); [CW-Y005](https://eng.wealthfront.com/2026/08/03/experiments-with-ai-code-review/) (Why Build; Unix Philosophy; Performance; Dev Lifecycle; frozen EVIDENCE.jsonl line 125); [CW-Y012](https://www.beyondautocomplete.nl/ai-writes-faster-than-we-can-review-heres-how-we-fixed-that/) (Solutions; Artifacts; Where we are now; frozen EVIDENCE.jsonl line 132).

**Frozen capability/proposal pointers:** `inputs/CHARTER.md:The boundary: free forever / Teams`; `inputs/reports/user-centric-value-strategy/STRATEGY.md:Connect developer value to a paid team job`.

## How to preserve a falsifiable comparison

Keep the existing proposed ten-change pilot gate (two additional actionable findings and no increase in median total inspection/review time) provisional. Before measurement, define additional relative to a recorded native decision, adjudicate useful changes independently, and count null and harmful cases. Also report per-case tail burden and material missed defects: a median can conceal a bad failure. Never trade away correctness to claim cheaper retrieval. Do not treat repeated exposure to the same task as an independent timing comparison. These are protocol recommendations, not a run of the pilot.

For navigation, include a clean familiar control and a noisy shared-symbol task. For reuse, include intentional duplication. For review, give the baseline full source access rather than an artificially isolated file. For paid coordination, supply adequate ordinary CI as the alternative and measure only the work remaining beyond it. This tests useful decisions, not tool availability or agent preference.

## Access, evidence and independence limits

All 192 manifest files were verified before analysis; relevant canonical records and primary frozen implementation files were read. Seven original public pages were reopened and raw HTML saved under `source-addenda/L02/`, with timestamps, hashes and passage locators in `PROVENANCE.json`. Public reopens confirm selected passages, not linked experiment reproduction, image inspection or complete source rereading. CW-T018, CW-Z001 and CW-Z004 are used from their frozen original evidence records and retain their stated source boundaries; they were not reopened here. The whole packet was available, but this lens does not claim to have reread every source.

The original corpus has 132 records and 110 declared fully read source units, with its documented coverage shortfall. Counts do not estimate prevalence. Most load-bearing alternatives here come from builders or small experiments. CW-Z012 is a historical resolved discussion, not a claim of a current Serena defect. CW-Y007’s historical host restrictions are not asserted current. No Codeweb matched-task effect, user retention, purchase or renewal was observed. No sources were invented and no customer replies were simulated.

No other lens output was read. The session identity is recorded, but the Product Lead must independently verify runtime freshness; shared filesystem separation is procedural. First-draft Markdown and JSON are copied unchanged into `history/L02-first-draft/`. No correction has been attempted and no independent approval is claimed. Product/harness files and frozen inputs were not edited.

Machine-readable findings include every material conclusion, supporting/opposing IDs, URLs, passage/capture pointers, conditions, failures and tests. `receipts/L02.json` records final input verification and output hashes.
