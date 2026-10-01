# Lens 07 — Capability expansion

Assignment: COD-86. Input manifest SHA256: `748f176be9d48ccf383ff6a6a601b56e7a8337bc898d27c2f1c319462a7e9852`.

**Verdict: narrow.** Codeweb could help a maintainer scope a consequential shared-utility change, but the corpus does not establish that it enables a task otherwise avoided or requiring substantial help. The supported proposition is source-backed inspection. Larger safe changes, reduced expert dependence and paid expansion remain unobserved.

The exact question is what consequential task becomes more attainable, through what causal mechanism, and whether the evidence establishes that expansion. The strongest candidate is extending an existing shared utility across unfamiliar consumers without introducing a redundant implementation. The test must distinguish a correct change in plan and help required from a faster lookup.

## Findings

### L07-F01 — narrow

A plausible expansion candidate is independently scoping a shared-utility extension across unfamiliar consumers; the corpus suggests an inspection aid but does not establish that Codeweb unlocks that task.

**Actor / task:** Agent-heavy maintainer extending shared code in their own repository; strongest pain record has unknown occupational segment, so ordinary-developer generalization remains conditional. Extend an existing utility while preserving callers in other modules and decide whether an existing implementation is suitable for reuse.

**Conditions:** Current map covers the relevant source and named consumers. Developer understands intended behavior and can inspect candidate bodies. Scope uncertainty, rather than missing permissions or business requirements, is the limiting work. Native search/LSP baseline leaves a material consumer or candidate undiscovered.

**Strongest case:** CW-T018 reports working features accompanied by duplicated utilities and costly upfront review; CW-P003 reports reference-related refactor breakage. A source-linked consumer or candidate can direct inspection before the change.

**Countercase:** Native refactors already succeed (CW-X003); retrieval may add overhead without recall gains (CW-X001). Finding similar code does not settle whether it should share a lifecycle (CW-Z006).

**Mechanism:** Reported duplicate/reference burden creates a candidate information bottleneck. → Mapped dependents and candidate bodies expose concrete places to inspect. → Inspection confirms a missed consumer or suitable implementation and changes the edit plan. → Developer executes a bounded change with ordinary behavior checks and less expert scoping help. → Only the first two steps have pain/documentation support; decision change, reduced help and completion are unobserved for Codeweb.

**Failure scenario:** The brief repeats all native findings, or recommends merging helpers whose business rules differ; interpretation costs exceed saved search effort.

**Weakest assumption:** A missing structural fact is the binding constraint on undertaking the task rather than merely a convenient lookup.

**Local / paid:** Retain conditional pre-edit scoping as a free local hypothesis; avoid a demonstrated capability-expansion claim. Any single-repository inspection gain belongs to free local value and cannot justify a hosted bill.

**Confidence:** Moderate support for reported pain and available interfaces; low confidence in Codeweb-specific task expansion because no observed comparison bridges the mechanism.

**Minimal test:** L07-T01: a real postponed shared-utility task with a recorded native baseline; falsified for that case if Codeweb adds no correct plan change or does not reduce the stated scoping/help barrier.

Supporting evidence: [CW-T018](https://news.ycombinator.com/item?id=48033774), [CW-P003](https://github.com/anthropics/claude-code/issues/39703). Opposing evidence: [CW-X001](https://www.agentconnect.md/blog/grep-beat-lsp-harness/), [CW-X003](https://baransel.dev/post/replaced-entire-dev-workflow-with-claude-code/), [CW-Z006](https://www.florian.bruniaux.com/blog/articles/claude-is-my-second-contributor/).

### L07-F02 — reject

Inspection evidence cannot grant permission to enlarge a change safely; mapped completeness and passing structure cannot establish runtime or semantic compatibility.

**Actor / task:** Maintainer changing shared entry points, generated interfaces, dynamic calls or similar-looking implementations. Choose the scope and verification plan for a cross-module refactor or deletion.

**Conditions:** Dynamic/generated consumers may fall outside extraction. Behavioral requirements and suitable tests must be supplied independently. Similarity is only a candidate signal.

**Strongest case:** Codeweb documentation explicitly restricts list completeness to mapped relationships and rejects behavioral correctness from structural green. Adjacent-tool generated-symbol and empty-reference incidents illustrate why absence needs qualification.

**Countercase:** Missed-reference failures and reuse complaints still leave meaningful room for better inspection; refusing a safety guarantee does not imply the map is useless.

**Mechanism:** Returned mapped facts narrow inspection targets. → Unmapped entry points and intended behavior remain unresolved. → A larger edit amplifies those unresolved obligations unless actual tests and source review address them.

**Failure scenario:** An unmapped callback is treated as absent and deleted, or similar utilities are unified despite different semantics; the structural result is clean while behavior changes. This scenario is hypothetical, not a reported Codeweb incident.

**Weakest assumption:** More visible mapped relationships are an adequate proxy for the full set of obligations of a larger change.

**Local / paid:** Reject the broader safe-change claim; use the brief to identify both inspection targets and unresolved questions. Shared receipts can report actual check states but cannot turn the same static evidence into a compatibility guarantee.

**Confidence:** High confidence in the documented limitation; external examples are adjacent/historical and do not establish a present Codeweb defect.

**Minimal test:** L07-T01 includes a real dynamic/generated boundary where present. Reject the expansion claim for that case if the user mistakes mapped completeness for safety or omits a maintainer-required behavioral check.

Supporting evidence: [CW-Z007](https://github.com/oraios/serena/issues/1814), [CW-Z011](https://github.com/oraios/serena/issues/1432), [CW-Z005](https://omeratagun.net/blog/ai-coding-agents-experiment), [CW-Z006](https://www.florian.bruniaux.com/blog/articles/claude-is-my-second-contributor/). Opposing evidence: [CW-P003](https://github.com/anthropics/claude-code/issues/39703), [CW-T018](https://news.ycombinator.com/item?id=48033774).

### L07-F03 — unresolved_from_existing_evidence

The strongest observed expansion belongs to existing coding-agent workflows; a separate incremental Codeweb effect remains unresolved.

**Actor / task:** Individual revisiting old projects; separately, an experienced founding engineer/tool builder. Neither is a representative sample. Resume postponed maintenance or enter an unfamiliar implementation domain.

**Conditions:** Bounded goals, human architectural judgment, runnable stages and verification remain available. Codeweb must be compared with a functioning native workflow, not unaided manual work.

**Strongest case:** The reopened CW-Z006 article attributes undertaking a Rust tool to the Claude workflow; CW-Z001 describes reviving old projects with bounded native-agent work. These are self-reports of the host workflow, not Codeweb outcomes.

**Countercase:** Native success coexists with reuse and reference failures. It leaves open a narrower class of unfamiliar shared-code tasks where extra structural evidence might change the attainable outcome.

**Mechanism:** Agents reduce mechanical implementation and orientation effort. → Some authors undertake previously deferred work. → Neither report isolates Codeweb as the cause; transferring this expansion to a structural brief would misattribute host capability.

**Failure scenario:** A study compares Codeweb plus an agent with unaided manual work, credits all completion gains to Codeweb, and counts faster lookup as a newly achievable task.

**Weakest assumption:** The incremental brief, rather than the host agent and ordinary verification, changes what the developer can undertake.

**Local / paid:** Require a recorded native-agent comparison and a predeclared task/help barrier before claiming expansion. Faster lookup alone can still be useful convenience. A host subscription or greater coding-agent throughput is not evidence of willingness to buy Codeweb coordination.

**Confidence:** Original passages support attribution boundaries; no controlled Codeweb completion/help comparison was found in the reviewed packet.

**Minimal test:** L07-T01 keeps host/model, tests and source access constant. If both conditions complete with the same expert assistance and plan quality, classify any lookup gain as efficiency rather than capability expansion.

Supporting evidence: [CW-Z001](https://shan-verse.com/blog/codex-after-the-update/), [CW-Z006](https://www.florian.bruniaux.com/blog/articles/claude-is-my-second-contributor/), [CW-T020](https://community.openai.com/t/how-to-achieve-greater-code-refactoring-automation/1385318), [CW-X001](https://www.agentconnect.md/blog/grep-beat-lsp-harness/). Opposing evidence: [CW-T018](https://news.ycombinator.com/item?id=48033774), [CW-P003](https://github.com/anthropics/claude-code/issues/39703).

### L07-F04 — unresolved_from_existing_evidence

Cross-repository checking is a separate possible paid task, but current evidence supports a coordination question rather than demonstrated capability expansion.

**Actor / task:** Developer champion coordinating backend/frontend repositories; purchase authority unknown. Assemble revision-specific compatibility-check results across explicitly related repositories.

**Conditions:** Supported checks exist and actual producer/consumer revisions are known. Permissions and source boundaries allow the service to operate. Ordinary CI fails to remove a recurring coordination burden adequately.

**Strongest case:** CW-Y007 records manual cross-repo checks and a near-term constraint on monorepo migration, suggesting repeated coordination work.

**Countercase:** The same reporter accepts CI as a suitable alternative; CW-Y004 adds source-isolation constraints without establishing purchase authority. Local graph evidence cannot establish cross-service behavior (CW-Z005).

**Mechanism:** Known consumer relationships identify checks to coordinate. → A proposed service runs agreed checks at exact revisions and assembles statuses. → Reduced chasing might let the team undertake a coordinated change with less help. → The service execution, net saved coordination work and buyer response are not demonstrated.

**Failure scenario:** A normal CI job checking out both repositories gives the same actionable result; a hosted evidence layer adds setup and security evaluation without reducing coordination.

**Weakest assumption:** Coordination is the material remaining barrier after a competent CI alternative is available.

**Local / paid:** Do not extend single-repo static claims into cross-repo completeness. Test separately against ordinary CI; do not charge attribution from the free local scoping test to paid value.

**Confidence:** Sparse public champion evidence, no Codeweb buyer or completed managed-check trial; frozen strategy labels the mechanism proposed.

**Minimal test:** L07-T02: on one authorized real cross-repo change, first assemble exact-revision checks in ordinary CI and record coordination steps. If that removes the burden, reject extra managed-service value for that case. No pilot or outreach executed here.

Supporting evidence: [CW-Y007](https://forum.cursor.com/t/any-way-of-using-multiple-repositories-in-bugbot/152120). Opposing evidence: [CW-Y004](https://forum.cursor.com/t/request-for-documentation-bugbot-repository-isolation-boundaries-for-gitlab/165666), [CW-Z005](https://omeratagun.net/blog/ai-coding-agents-experiment).

## Smallest decisive task

{
  "id": "L07-T01",
  "status": "proposed_not_executed",
  "task": "One real deferred extension of a shared utility with cross-module consumers, in a repository maintained by the consenting developer. Do not manufacture a postponement or select only a task known to favor Codeweb.",
  "before": "Record why the task is deferred or needs expert help, the intended behavior, the native agent/search/LSP plan, unresolved consumer questions and a time/help budget before showing the brief. Keep expert advice from contaminating the baseline.",
  "comparison": "Use a matched second task and counterbalance order for any comparative timing; a same-task reveal can test additional plan changes but is not an independent time trial. Hold host/model, source revision access and behavior checks constant.",
  "measure": [
    "Correct additional consumer/reuse decision, independently adjudicated by a maintainer with complete task knowledge.",
    "Whether the predeclared blocker is removed and a bounded change completes with ordinary tests and relevant behavior checks.",
    "Expert interventions/minutes and all setup, reading, recovery, implementation and verification effort.",
    "Unsafe assumptions, unnecessary edits, unresolved dynamic/generated consumers and baseline contamination."
  ],
  "success": "Evidence of expansion in this case requires an objectively useful plan change tied to Codeweb evidence plus removal of the recorded task/help barrier, without additional material errors or shifting equivalent effort to reviewers. Willingness alone or faster lookup does not qualify.",
  "failure": "No incremental correct decision; same help still required; increased total burden; or false confidence causing a missed obligation. One case can refute the proposed mechanism for that task, not estimate prevalence.",
  "source_findings": [
    "L07-F01",
    "L07-F02",
    "L07-F03"
  ]
}

The proof-sprint proposal already asks for actionable decisions, effort and voluntary return. For this lens, add the recorded prior task/help barrier and independently verified completion outcome; its provisional actionable-finding gate alone cannot establish expanded capability. This is a proposed scoring distinction, not a change to the frozen protocol or authorization to run it.

L07-T02 is separate: test ordinary CI against a real cross-repo coordination burden before testing paid additional work. No paid purchase inference follows from L07-T01.

## Source and capability pointers

- **CW-T018**: [https://news.ycombinator.com/item?id=48033774](https://news.ycombinator.com/item?id=48033774); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:24`; passage: Story body and author reply 48035884; complete four-comment tree read. Capture: `sources/L07/CW-T018.html`. Limits: Algolia complete story tree read; unverified firsthand account, not measured quality.
- **CW-P003**: [https://github.com/anthropics/claude-code/issues/39703](https://github.com/anthropics/claude-code/issues/39703); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:4`; passage: Context and Category H; all body categories read. Capture: `not newly captured; frozen record only`. Limits: VS Code extension, not desktop app. Body plus all 2 bot comments read. One grouped author/project narrative, not 55 independent incidents. March 27 is just outside preferred six months; retained for concrete mechanism. No current reproduction or verified fix.
- **CW-X001**: [https://www.agentconnect.md/blog/grep-beat-lsp-harness/](https://www.agentconnect.md/blog/grep-beat-lsp-harness/); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:35`; passage: Sections: agents route by task; noisy codebases; output shape; limitations. Capture: `not newly captured; frozen record only`. Limits: Two–three runs per cell. No LSP rename/diagnostics tested. Primary article read completely; linked experiment repo not read. One study, not customer incidents.
- **CW-Z006**: [https://www.florian.bruniaux.com/blog/articles/claude-is-my-second-contributor/](https://www.florian.bruniaux.com/blog/articles/claude-is-my-second-contributor/); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:114`; passage: Refactoring at scale; What humans still do. Capture: `sources/L07/CW-Z006.html`. Limits: Updated September 12; statistics describe May snapshot. Builder account; quantities not independently audited.
- **CW-Z001**: [https://shan-verse.com/blog/codex-after-the-update/](https://shan-verse.com/blog/codex-after-the-update/); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:109`; passage: The Old Projects I Refactored; How I Use Codex Now. Capture: `sources/L07/CW-Z001.html`. Limits: Surface of this particular task is unspecified; do not count as cloud incident. Product/pricing discussion not adopted as current facts.
- **CW-Z005**: [https://omeratagun.net/blog/ai-coding-agents-experiment](https://omeratagun.net/blog/ai-coding-agents-experiment); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:113`; passage: Chapters 1–4; What I Learned. Capture: `not newly captured; frozen record only`. Limits: Historical 2025 account, not a current Codex performance finding; one author/context bundle rather than counting each comparison as independent.
- **CW-Z007**: [https://github.com/oraios/serena/issues/1814](https://github.com/oraios/serena/issues/1814); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:115`; passage: Summary; Additional suggestion; Note on scoping. Capture: `not newly captured; frozen record only`. Limits: API rate-limited; full body read, comment completeness unverified. First-query crash fix merged Aug 20 (#1848); later-query fix #2007 remains open. No blanket fixed claim.
- **CW-Z011**: [https://github.com/oraios/serena/issues/1432](https://github.com/oraios/serena/issues/1432); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:119`; passage: Capability matrix in body. Capture: `not newly captured; frozen record only`. Limits: Full body only; comments unavailable. Closed with #1434, but linked PR inaccessible, so resolution not verified.
- **CW-T020**: [https://community.openai.com/t/how-to-achieve-greater-code-refactoring-automation/1385318](https://community.openai.com/t/how-to-achieve-greater-code-refactoring-automation/1385318); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:26`; passage: Posts 1, 4 and 11. Capture: `not newly captured; frozen record only`. Limits: Posts 1–15 and part of 16 read; no full-thread credit. Progress is reported, migration completion not established. Reported progress and successful workflow adjustment do not establish final migration completion or current outcome. Later additive review: Original reporter reports improvement after expanding bounded iteration and correcting sandbox assumptions; modernization completion not claimed.
- **CW-X003**: [https://baransel.dev/post/replaced-entire-dev-workflow-with-claude-code/](https://baransel.dev/post/replaced-entire-dev-workflow-with-claude-code/); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:37`; passage: Refactoring — Surprisingly Good; Where It Falls Short. Capture: `not newly captured; frozen record only`. Limits: Reporter-confirmed success for this task only. Business rules outside code remain a stated limitation; linked repositories not reproduced.
- **CW-Y007**: [https://forum.cursor.com/t/any-way-of-using-multiple-repositories-in-bugbot/152120](https://forum.cursor.com/t/any-way-of-using-multiple-repositories-in-bugbot/152120); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:127`; passage: posts 1,5,6. Capture: `not newly captured; frozen record only`. Limits: No confirmed purchase authority or willingness to pay. March host limits are historical, not asserted current.
- **CW-Y004**: [https://forum.cursor.com/t/request-for-documentation-bugbot-repository-isolation-boundaries-for-gitlab/165666](https://forum.cursor.com/t/request-for-documentation-bugbot-repository-isolation-boundaries-for-gitlab/165666); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:124`; passage: posts 1,6,7. Capture: `not newly captured; frozen record only`. Limits: No purchase authority, rejection, approval, or technical breach demonstrated.
- **L07-CAP01**: `inputs/docs/cli.md:73` — Context analysis status: mapped scope, list/source evidence completeness, lexical windows, freshness and unknowns. Frozen bytes control; mutable main URL is an origin locator, not a claim about current main.
- **L07-CAP02**: `inputs/scripts/lib/tool-specs.mjs:26` — TOOL_SPECS entries for dependents, impact, explain, context and find_similar. Interface inspection, not executed runtime proof.
- **L07-CAP03**: `inputs/README.md:310` — Baseline/diff loop; unsupported layouts; skipped checks; refresh drops overlap evidence; behavior caveat. Frozen documentation, no host run performed.
- **L07-CAP04**: `inputs/docs/ci-gate.md:91` — Passing structural gate does not establish behavior; no mapped callers is not unused. Frozen documentation.
- **L07-CAP05**: `inputs/CHARTER.md` — The boundary: free forever / Teams; all local single-repo work stays free. Product constraint, not demand evidence.

## Coverage and independence

- No other pressure-test lens outputs were read during this first draft; shared filesystem isolation is procedural only. Lead must independently verify runtime session freshness.
- All 192 manifest-listed input files were hash-checked at start and delivery. Full packet was available; this lens used selected original records, capability files, the frozen strategy/proof sprint and prior research review, not an exhaustive reread of every original source.
- Three targeted original pages reopened and captured separately; remaining external cases rely on frozen canonical records and their original access limits. Captured HTML is a separate HTTP fetch from the inspected rendered web response.
- No Codeweb host experiment, participant observation, customer contact, product edit or paid trial occurred. Missing external evidence is not failed technical delivery of this report.
- Historical source versions/resolutions remain bounded: CW-Z007 has a limited first-query fix and an unresolved later-query account in the frozen record; CW-Z011 resolution is unverified. No current runtime defect is asserted.
- Public author self-reports, builder accounts and one small retrieval study do not establish prevalence or incremental Codeweb demand. Reopens add provenance, not new independent customer incidents.

The machine-readable companion preserves every material finding, both evidence-ID directions, source locators, conditions, implications and tests. Source reopens are in `sources/L07/REOPENS.json`. The receipt records actual runtime identities and output hashes. Delivery completion is not self-review approval.
