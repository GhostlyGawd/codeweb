# L11 — Shared team dependence

**Verdict: revise.** Shared revision-bound facts are a plausible aid. The packet does not establish earned team dependence. A generic paid receipt duplicates existing PR/CI; the remaining paid hypothesis is a narrowly specified coordination service that demonstrably removes work after adequate CI.

Issue COD-90; run `d339a9e1-2486-45e3-8744-8bf2a9342773`; session `01a0f08b-d2d5-7b91-a3a8-ef298b06f39f`. Input manifest SHA256 `748f176be9d48ccf383ff6a6a601b56e7a8337bc898d27c2f1c319462a7e9852`. All 192 frozen files verified before analysis. No other lens outputs read; runtime independence requires the lead’s check.

Exact question: do authors, reviewers and repository owners gain from shared checked facts, and what handoffs/conflicting states return if it is removed? Compare ordinary CI/PR history, distinguish earned reliance from mandated gates, and identify ownership/cross-repo inputs.

## Actor and state handoffs

| Actor | Needs | Decision | Without the shared artifact |
|---|---|---|---|
| Author | PR base/head, local dirty state, mapped scope and omissions, consumer candidates, exact check run/revision | What to inspect/change and which checks to request | Reconstruct source facts and link CI in PR; no loss if PR already contains them |
| Reviewer | Same base/head plus tested revisions, engine/config version, completed/failed/skipped/pending/unknown status, source-linked findings and previous exceptions | Inspect, request changes or approve within normal review policy | Follow existing diff/check links; repeated questions return only if facts are genuinely missing |
| Producer repository owner | Consumer relationship inventory, intended supported version pair, test owner and unresolved consumer states | Coordinate compatibility work and accept residual limits | Ask consumer owners for specific revision results unless CI already dispatches them |
| Consumer repository owner | Own revision plus producer revision, generated schema/artifact revision where applicable, actual contract/type/runtime test result | Rerun/update consumer or explicitly accept supported state | Manual rerun/result reconciliation may return; measured impact unknown |

A shared result must identify repository, base/head (or the exact producer/consumer pair), dirty/uncommitted state, engine and check configuration, run ID, source locations, coverage and result status. A new push invalidates the old result for the new revision; it does not erase its historical truth. Pending, failed, skipped, unknown and completed must remain distinct. An owner’s exception needs its reason, scope, revision and re-evaluation trigger. These are proposed requirements, not claims of implemented cross-repository behavior.

The supported mechanism is avoiding repeated factual collection and state reconciliation. People retain architecture, behavioral adequacy and merge decisions. Necessary cross-repo inputs include explicit relationships, supported version pair selection, generated contract provenance, permitted commands/runners, access policy, owner routing and stale-result handling. If people still dispatch, chase, copy and reconcile each result, the service has not taken over the proposed job.

## Original CI/PR substitute inspected

[PR #96](https://github.com/GhostlyGawd/codeweb/pull/96) has head `080c6079b18d273c93079036df3f5fba6774c5fe`, a problem/validation description, a sticky structural digest and ten returned successful check records bound to that head. The metadata now says merged; this is a later observation than frozen CURRENT.md’s draft status. This proves inspectable artifacts exist, not that all tests are correct or that users saved time. The digest itself says structural checks do not establish behavioral correctness. Its promotional Teams footer is not evidence that a hosted service works. No CI logs, runtime behavior or customer reliance were inferred. Full captures and fetch hashes are in `sources/L11/provenance.json`.

## L11-F01 — Shared facts can reduce repeated factual reconstruction, but ordinary PR/CI artifacts already supply much of this mechanism.

**Verdict:** narrow. **Actor/task:** Authors handing a concrete change to reviewers and repository owners; shared implementation or cross-file change.

**Conditions:** Facts must bind to exact source revisions and actual check runs; reviewer must use them in a decision, not merely acknowledge a report.

**Strongest case:** A common source-linked inspection record can let an author and reviewer reason from the same scope and distinguish checked from unknown.

**Strongest countercase:** Existing specs, PR history, commit-linked CI and the free structural digest already preserve facts. A reported regression was solved with history and tests.

**Failure scenario:** Author maintains a separate receipt while reviewers reconstruct the PR anyway; two status surfaces disagree after a push.

**Weakest assumption:** Reviewers repeatedly lack facts that cannot be made accessible through their existing PR.

**Local:** Retain free source-linked factual evidence as an optional aid; do not claim shared dependence from gate adoption.

**Paid:** Reject a paid generic receipt; incremental coordination must exceed existing PR/CI value.

**Minimal falsification test (not executed):** For one real eligible PR, observe author preparation and reviewer reconstruction using normal PR/CI, then the proposed artifact on a matched later task. Count duplicated lookups, stale interpretations and total maintenance/reading time. If decisions and reconstruction are unchanged or overhead rises, reject added artifact.

**Confidence:** High confidence in availability of the substitute; low confidence in incremental human benefit.

Evidence (full original locators and limitations are mirrored in JSON):

- L11-S02: [https://github.com/GhostlyGawd/codeweb/blob/v0.15.0/docs/ci-gate.md](https://github.com/GhostlyGawd/codeweb/blob/v0.15.0/docs/ci-gate.md) — `inputs/docs/ci-gate.md`; The gate as a reviewer; What it does; Pin the action; analysis.checks.
- CW-Y012: [https://www.beyondautocomplete.nl/ai-writes-faster-than-we-can-review-heres-how-we-fixed-that/](https://www.beyondautocomplete.nl/ai-writes-faster-than-we-can-review-heres-how-we-fixed-that/) — `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl#CW-Y012`; Solutions; Artifacts; Where we are now.
- L11-S01: [https://github.com/GhostlyGawd/codeweb/pull/96](https://github.com/GhostlyGawd/codeweb/pull/96) — `sources/L11/PR96.json`; body, head.sha, base.sha, merged; PR96-comments.json/[0]/body; PR96-checks.json/check_runs.
- CW-T019: [https://moonlab.ventures/blog/hand-claude-code-a-red-test-suite](https://moonlab.ventures/blog/hand-claude-code-a-red-test-suite) — `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl#CW-T019`; What it did; The brief; The gotchas.

## L11-F02 — Cross-repository revision reconciliation is a plausible narrower coordination job, not demonstrated shared Codeweb dependence.

**Verdict:** revise. **Actor/task:** Backend author, frontend consumer owner and reviewer on a change spanning separate repositories.

**Conditions:** Explicit producer-consumer relationships, tested revision pairs, supported check commands, owner routing and a real residual burden after a CI baseline.

**Strongest case:** The original reporter repeatedly invokes an assistant for frontend/backend checks. Revision-pair evidence could prevent different owners relying on different checked states.

**Strongest countercase:** The same reporter accepts CI or a monorepo as more correct. No implemented CI comparison or Codeweb team outcome exists.

**Failure scenario:** Backend head advances after a frontend check; the shared page remains green, and people chase which pair was tested manually.

**Weakest assumption:** Scheduling, reruns and result reconciliation remain recurring work after a simple two-repository CI check is configured.

**Local:** Single-repository consumer lookup may aid the author but cannot certify cross-repo compatibility.

**Paid:** Test managed check coordination only where it owns dispatch, stale-result invalidation and failure recovery; do not sell inferred graph edges as contract tests.

**Minimal falsification test (not executed):** On one consented producer/consumer workflow, first configure or inspect existing CI with explicit revisions. Compare a matched later change with managed coordination; record messages chasing results, reruns and setup/maintenance. If CI removes the burden or owners still chase the same work, reject the paid mechanism.

**Confidence:** Medium for existence of a specific manual workflow; low for incremental service value and recurrence magnitude.

Evidence (full original locators and limitations are mirrored in JSON):

- CW-Y007: [https://forum.cursor.com/t/any-way-of-using-multiple-repositories-in-bugbot/152120](https://forum.cursor.com/t/any-way-of-using-multiple-repositories-in-bugbot/152120) — `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl#CW-Y007`; posts 1,5,6.
- L11-S03: internal proposal; no public URL — `inputs/reports/user-centric-value-strategy/STRATEGY.md`; Connect developer value to a paid team job; hypothetical before/after; Confidence and review target.
- CW-Y007: [https://forum.cursor.com/t/any-way-of-using-multiple-repositories-in-bugbot/152120](https://forum.cursor.com/t/any-way-of-using-multiple-repositories-in-bugbot/152120) — `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl#CW-Y007`; posts 1,5,6.
- L11-S01: [https://github.com/GhostlyGawd/codeweb/pull/96](https://github.com/GhostlyGawd/codeweb/pull/96) — `sources/L11/PR96.json`; body, head.sha, base.sha, merged; PR96-comments.json/[0]/body; PR96-checks.json/check_runs.

## L11-F03 — Shared evidence needs explicit ownership and permitted information flows; cross-repo aggregation can increase coordination instead of reducing it.

**Verdict:** narrow. **Actor/task:** Repository owners and organization evaluators permitting selected repository combinations.

**Conditions:** Repository/ref access, non-transitive sharing policy where required, authorized consumer relationship, named decision owner and exception expiry.

**Strongest case:** One evaluator requires isolation and provenance of derived context; a source-linked shared record must respect which owners may see it.

**Strongest countercase:** Shared rule configuration has native substitutes, including a reported resolved file-reference limitation. Local per-repo evidence avoids some transfer burden.

**Failure scenario:** Owner B can access A and C, but publishing a combined receipt leaks A context to C; people then redact and manually duplicate reports.

**Weakest assumption:** A narrowly scoped service can enforce the actual ownership boundaries without adding more setup and triage than it removes.

**Local:** Keep local evidence portable and free; a cross-repo ownership regime is not required for every individual user.

**Paid:** No generic organization-wide evidence pool. Require a small explicit relationship and permission model only for the demonstrated job; no inferred compliance product.

**Minimal falsification test (not executed):** For one proposed allowed repository pair and one forbidden transitive pair, trace source and derived fields to recipients and replay an owner/revision change. Reject the service design if unauthorized evidence flows or human redaction is needed each run. This is a proposed design test, not an executed security assessment.

**Confidence:** Strong evidence for one evaluator constraint, not prevalence, breach, purchase rejection or buyer authority.

Evidence (full original locators and limitations are mirrored in JSON):

- CW-Y004: [https://forum.cursor.com/t/request-for-documentation-bugbot-repository-isolation-boundaries-for-gitlab/165666](https://forum.cursor.com/t/request-for-documentation-bugbot-repository-isolation-boundaries-for-gitlab/165666) — `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl#CW-Y004`; posts 1,6,7.
- L11-S03: internal proposal; no public URL — `inputs/reports/user-centric-value-strategy/STRATEGY.md`; Connect developer value to a paid team job; hypothetical before/after; Confidence and review target.
- CW-Y008: [https://forum.cursor.com/t/applying-shared-coding-guidelines-across-multiple-repos-with-bugbot/133667](https://forum.cursor.com/t/applying-shared-coding-guidelines-across-multiple-repos-with-bugbot/133667) — `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl#CW-Y008`; posts 1-13,15,17,20.
- L11-S02: [https://github.com/GhostlyGawd/codeweb/blob/v0.15.0/docs/ci-gate.md](https://github.com/GhostlyGawd/codeweb/blob/v0.15.0/docs/ci-gate.md) — `inputs/docs/ci-gate.md`; The gate as a reviewer; What it does; Pin the action; analysis.checks.

## L11-F04 — Earned shared reliance remains unproven; removing a mandated gate is not a valid withdrawal test.

**Verdict:** unresolved_from_existing_evidence. **Actor/task:** Authors, reviewers and owners with repeated eligible tasks, each free to use existing PR/CI alternatives.

**Conditions:** After familiarity, remove only the supplemental shared artifact while retaining repository access, tests, historical evidence and normal merge policy.

**Strongest case:** Repeated factual reconciliation could become work users voluntarily avoid by returning to the shared artifact.

**Strongest countercase:** Internal review infrastructure and ordinary CI can absorb the job. Competitor payment relates to AI review, not Codeweb receipts; no Codeweb withdrawal evidence exists.

**Failure scenario:** Manager requires report links before merge; usage rises, but removing that requirement eliminates usage and reduces review time.

**Weakest assumption:** Multiple roles voluntarily depend on the same facts rather than one champion maintaining a compliance step.

**Local:** A useful individual brief can survive even if team dependence fails.

**Paid:** Do not infer purchase or renewal from compulsory usage or a manager request. Paid benefit requires observed removal of coordination work and a buyer decision.

**Minimal falsification test (not executed):** After a familiarization task, alternate matched eligible changes with and without the artifact, counterbalancing order. Keep checks and merge rules constant. Measure author/reviewer/owner reconstruction, stale-state errors and total time; allow voluntary reinstatement without prompts. No recurring loss and no voluntary reinstatement falsify shared dependence for that workflow.

**Confidence:** High confidence that existing packet lacks direct Codeweb reliance evidence; effect unresolved, not technical failure.

Evidence (full original locators and limitations are mirrored in JSON):

- CW-Y007: [https://forum.cursor.com/t/any-way-of-using-multiple-repositories-in-bugbot/152120](https://forum.cursor.com/t/any-way-of-using-multiple-repositories-in-bugbot/152120) — `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl#CW-Y007`; posts 1,5,6.
- CW-Y012: [https://www.beyondautocomplete.nl/ai-writes-faster-than-we-can-review-heres-how-we-fixed-that/](https://www.beyondautocomplete.nl/ai-writes-faster-than-we-can-review-heres-how-we-fixed-that/) — `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl#CW-Y012`; Solutions; Artifacts; Where we are now.
- L11-S01: [https://github.com/GhostlyGawd/codeweb/pull/96](https://github.com/GhostlyGawd/codeweb/pull/96) — `sources/L11/PR96.json`; body, head.sha, base.sha, merged; PR96-comments.json/[0]/body; PR96-checks.json/check_runs.
- CW-Y005: [https://eng.wealthfront.com/2026/08/03/experiments-with-ai-code-review/](https://eng.wealthfront.com/2026/08/03/experiments-with-ai-code-review/) — `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl#CW-Y005`; Why Build; Unix Philosophy; Performance; Dev Lifecycle.
- CW-Y001: [https://forum.cursor.com/t/bugbot-pricing-feedback/131907](https://forum.cursor.com/t/bugbot-pricing-feedback/131907) — `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl#CW-Y001`; posts 1 and 3.

## Coverage and access limits

Public sources are attributable self-reports, not adjudicated customer results. Reopened CW-Y007 supports a manual cross-repo workflow and its CI countercase; CW-Y004 supports a specific information-boundary requirement; CW-Y012 describes a young review-process experiment. CW-Y008’s resolved file-reference complaint is not treated as a current missing feature. CW-Y005 is a sophisticated internal builder, not a general buyer. CW-Y001 concerns another review product, not Codeweb purchase intent. Frozen evidence records supply their passage locators and historical access limits. No source count is treated as prevalence.

The prepared proof sprint measures individual pre-edit value and later return; it does not itself settle team handoff dependence. A later separately authorized team comparison would be required. Missing customer evidence is an external evidence gap, not failed technical delivery. This lens delivers analysis and proposed falsification tests only; no product edits, outreach, participants, gate changes, service provisioning or self-approval occurred.
