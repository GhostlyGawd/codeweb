# Lens 05 — Repeated reliance

**Verdict: narrow the local hypothesis; repeated Codeweb reliance and paid renewal remain unresolved.** Return is plausible when a later task creates fresh source uncertainty and the evidence reduces net work. Familiarity, adequate defaults, intentional duplication and repeated noise may remove that reason. The existing research establishes candidate mechanisms and counterexamples, not observed Codeweb retention.

Issue: COD-84 (`a578154c-75d4-48de-bb1c-13a93fa55398`). Run: `82d1566c-5c11-42c4-b9f7-ce3d2ed06f09`. Session (CODEX_THREAD_ID): `01a0f07f-bece-7833-8fb9-cdf7eb04ac59`.
Frozen input-manifest SHA256: `748f176be9d48ccf383ff6a6a601b56e7a8337bc898d27c2f1c319462a7e9852`.

Exact question: why would the same person return on a later eligible task without prompting, and what does the research actually establish about that?

Repeated-value conditions: another eligible task occurs; it introduces unresolved source uncertainty; the host makes evidence available; the person voluntarily chooses or meaningfully continues the workflow; correct inspection/reuse decisions improve enough to cover setup, refresh, reading, verification and dismissal costs. This chain must be observed after familiarity. A first useful finding, installation, displayed brief or competitor anecdote does not complete it.

The proposed proof sprint is unexecuted. Keep its first-use gate separate from an opportunity-based return record. A two-week follow-up is a checkpoint, not proof of churn when no eligible work occurs. Do not automatically extend the experiment or authorize outreach.

## L05-F01 — Recurring reuse uncertainty is supported; repeated voluntary Codeweb reliance is not established.

**Verdict:** narrow. **Actor/task:** Agent-heavy developer extending shared utilities in a changing repository; strongest concrete account is an experienced solo developer who later built duplication tooling.

**Conditions:** Later task has an unresolved consumer or reuse decision; A fresh source-backed answer changes inspection or reuse choice beyond native search.

**Strongest supported case:** Haldimann reports repeated intervention to find abstractions; david_d8912 reports duplicated utilities and review burden. These support recurrence of a problem, not adoption of this solution.

**Strongest countercase:** Successful bounded native changes and the clean-code pilot allow the same person to solve later work without another tool. The author already supplies architectural memory.

**Failure scenario:** The first brief introduces an overlooked helper; on later tasks the developer already knows it and ignores the brief.

**Weakest assumption:** The next task contains new structural uncertainty that Codeweb resolves more cheaply than the now-informed user and native tools.

**Local implication:** Retain only an opportunity-conditioned return hypothesis; do not sell a universal pre-edit ritual.

**Paid implication:** Recurring local value remains free and cannot establish paid-service retention.

**Minimal falsification test:** After one independently adjudicated useful task, observe the same person on two naturally occurring later eligible changes without reminders; compare decisions and total effort to their native baseline. Two redundant or prompted-only uses falsify repeated value for that case.

**Confidence:** Moderate confidence in a reported recurrence mechanism; low confidence in generality and no direct Codeweb retention evidence.

**For evidence:**

- [CW-Z003](https://ngof.nikhaldimann.com/p/deja-code): Quantifying code duplication; methodological weaknesses; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:111`; targeted capture notes `sources/L05/REOPEN-NOTES.json#CW-Z003`.
- [CW-T018](https://news.ycombinator.com/item?id=48033774): Story body and author reply 48035884; complete four-comment tree read; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:24`. Frozen prior-read boundary applies.

**Against evidence:**

- [CW-Z001](https://shan-verse.com/blog/codex-after-the-update/): The Old Projects I Refactored; How I Use Codex Now; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:109`. Frozen prior-read boundary applies.
- [CW-X001](https://www.agentconnect.md/blog/grep-beat-lsp-harness/): Sections: agents route by task; noisy codebases; output shape; limitations; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:35`. Frozen prior-read boundary applies.

## L05-F02 — Familiarity can erase first-use value; repeated orientation is a distinct, only partly addressable burden.

**Verdict:** narrow. **Actor/task:** Developer resuming a changed or unfamiliar module; distinguish source orientation from remembering task intent and session state.

**Conditions:** New revision, unfamiliar module or genuine lapse in source knowledge; Evidence reduces repeated lookup without requiring equivalent revalidation.

**Strongest supported case:** A builder reports encoding learned NotePlan quirks in skills to avoid rediscovery; a session-handoff report describes manual summaries. These show recurring orientation work but do not demonstrate a structural-map solution.

**Strongest countercase:** Serena maintainers describe overkill when relevant code is already in context; a small-repo user reports removing Serena. Existing skills and handoff summaries can retain knowledge.

**Failure scenario:** The user returns after a week needing to remember why work stopped; Codeweb returns callers but not the outstanding decision or task state.

**Weakest assumption:** The repeated burden is rebuilding source facts rather than remembering intent, and those facts can be refreshed cheaply.

**Local implication:** Limit the promise to source orientation on changed/unfamiliar code. If benefit disappears after familiarization, describe an episodic exploration aid. Saved decisions remain proposed, not established retention machinery.

**Paid implication:** Do not charge for local memory or infer a compounding paid knowledge asset from this evidence.

**Minimal falsification test:** Compare a familiar unchanged module and a genuinely changed/unfamiliar module after initial use. Record time spent locating facts versus reconstructing intent. Narrow to exploration if only the unfamiliar first encounter benefits.

**Confidence:** Moderate confidence in the boundary; builder analogy and partial Reddit access make magnitude and ordinary-user transfer uncertain.

**For evidence:**

- [CW-L037](https://david.coffee/i-still-prefer-mcp-over-skills/): Skills + MCP; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:89`. Frozen prior-read boundary applies.
- [CW-T007](https://github.com/anthropics/claude-code/issues/83790): Body and all 1 comments; comment IDs in source registry; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:13`. Frozen prior-read boundary applies.

**Against evidence:**

- [CW-Z012](https://github.com/oraios/serena/discussions/131): May 30–June 2 maintainer replies; reporter May 31 recovery; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:120`; targeted capture notes `sources/L05/REOPEN-NOTES.json#CW-Z012`.
- [CW-L015](https://www.reddit.com/r/ClaudeCode/comments/1nnftyr/huge_improvement_upgraded_to_latest_version/): UnrulyThesis reply; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:67`. Frozen prior-read boundary applies.

## L05-F03 — Low calendar frequency need not mean low value; lack of an eligible task must not be scored as churn.

**Verdict:** revise. **Actor/task:** Developer making occasional consequential shared-code changes; adjacent evidence comes from a team member discussing complex feature PRs.

**Conditions:** An independently identified consequential task actually occurs; Benefit is assessed per eligible opportunity and net of idle-period maintenance.

**Strongest supported case:** A Bugbot user values complex low-volume feature PR review and automatic operation. This challenges a daily-use requirement, without proving Codeweb return or renewal.

**Strongest countercase:** A consultant describes a client considering a temporary paid period before returning to free tooling; small native changes can remain adequate. Neither proposed future behavior is an observed outcome.

**Failure scenario:** A two-week follow-up finds no cross-file work and incorrectly labels a satisfied occasional user a churned user; alternatively one valuable migration is mistaken for a permanent recurring job.

**Weakest assumption:** Consequential opportunities recur for this person rather than ending with one migration.

**Local implication:** Report eligible opportunities, delay until opportunity, voluntary choice and outcome separately; calendar activity is insufficient.

**Paid implication:** Rare complexity can justify some services, but this competitor account proves neither Codeweb willingness to pay nor paid-attributable coordination savings.

**Minimal falsification test:** At the proposed two-week follow-up classify no opportunity, inaccessible workflow, eligible nonuse and actual use separately. Leave recurrence unresolved if no eligible task occurs; do not extend observation or outreach without separate authority.

**Confidence:** Strong measurement rationale, weak evidence on Codeweb opportunity frequency; competitor self-report is a boundary example only.

**For evidence:**

- [CW-Y001](https://forum.cursor.com/t/bugbot-pricing-feedback/131907): posts 1 and 3; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:121`; targeted capture notes `sources/L05/REOPEN-NOTES.json#CW-Y001`.

**Against evidence:**

- [CW-Y010](https://community.sonarsource.com/t/is-it-easy-to-revert-from-developer-edition-to-community-edition/41189): post 1; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:130`. Frozen prior-read boundary applies.
- [CW-Z001](https://shan-verse.com/blog/codex-after-the-update/): The Old Projects I Refactored; How I Use Codex Now; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:109`. Frozen prior-read boundary applies.

## L05-F04 — Repeated noise and intentional duplication can turn a correct finding into a reason to stop using the brief.

**Verdict:** revise. **Actor/task:** Developer maintaining purposeful separate implementations or repeatedly reviewing familiar consumers.

**Conditions:** Similarity is treated as a candidate, not semantic equivalence; Fresh source evidence and exception scope prevent stale advice; All reading, dismissal and unnecessary edit costs are counted.

**Strongest supported case:** The firmware experiment reports recurring false positives reduced by repository context but with a recall tradeoff. Bruniaux explicitly leaves intentional duplication decisions to humans. A repeated finding can be technically true and operationally useless.

**Strongest countercase:** One reviewer keeps multiple tools for occasional useful catches despite noise; duplicated utilities are also a real reported burden. Noise alone does not imply universal rejection.

**Failure scenario:** An intentional duplicate is highlighted on every edit, producing repeated explanations or an inappropriate abstraction; a saved dismissal later hides a materially changed implementation.

**Weakest assumption:** The brief can avoid repeat burden without suppressing newly relevant evidence.

**Local implication:** Measure net effort and correct decisions after familiarity; explicit revision-scoped exceptions are a proposal requiring validation. Static similarity never decides shared lifecycle or behavior.

**Paid implication:** Shared evidence that repeats unresolved noise can increase team coordination work; count that cost separately from free findings.

**Minimal falsification test:** On a real later task containing a previously adjudicated intentional duplicate, record dismissal effort and whether changed source reopens it appropriately. An unnecessary refactor or persistent net added work fails that case.

**Confidence:** Moderate confidence in failure mechanisms; no runtime trial of Codeweb suppression, saved decisions or net effect.

**For evidence:**

- [CW-L023](https://edgelog.dev/blog/how-many-ai-code-reviews/): Parts 1, 5; limitations 23.5–23.7; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:75`. Frozen prior-read boundary applies.
- [CW-Z006](https://www.florian.bruniaux.com/blog/articles/claude-is-my-second-contributor/): Refactoring at scale; What humans still do; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:114`; targeted capture notes `sources/L05/REOPEN-NOTES.json#CW-Z006`.

**Against evidence:**

- [CW-L051](https://news.ycombinator.com/item?id=49321400): Comment 49353756; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:103`. Frozen prior-read boundary applies.
- [CW-T018](https://news.ycombinator.com/item?id=48033774): Story body and author reply 48035884; complete four-comment tree read; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:24`. Frozen prior-read boundary applies.

## L05-F05 — Automatic invocation and installed defaults are not voluntary return; repeated prompting would defeat the stated reliance loop.

**Verdict:** revise. **Actor/task:** Ordinary host user with a readily available workflow; integration counterevidence includes a custom MCP builder and an application-security engineer.

**Conditions:** User has a real choice and can bypass the brief; No experimenter reminders or per-task enforcement masquerade as preference; Availability and user action are separately observed.

**Strongest supported case:** A builder reports skipped MCP use despite instructions after prior success; Synthesia reports slow self-serve adoption and moves review into nonblocking CI. Useful outputs need not generate voluntary behavior.

**Strongest countercase:** Automatic review is valued in the Bugbot account, and another reviewer voluntarily keeps a noisy tool. Defaults can reduce effort without making every invocation evidence of preference.

**Failure scenario:** Hooks display a brief on every task; the team reports perfect retention even though the user neither reads nor acts on it, or an observer repeatedly reminds them to invoke it.

**Weakest assumption:** The user would keep or select this workflow because of its benefit, independent of prompting, inertia or mandate.

**Local implication:** Count self-initiated invocation separately from user-chosen continued automation and passive exposure. Require a useful action/outcome; an enabled hook is only exposure.

**Paid implication:** CI execution may be operationally useful but is not buyer preference or renewal. Separate continued service operation from an authorized buyer choosing it.

**Minimal falsification test:** After first use, make native and Codeweb paths available without reminders. Record user initiation, retained automation, passive exposure and useful action separately. Prompted-only uses cannot pass voluntary-return evidence.

**Confidence:** Strong distinction between adoption and exposure; host incidents are historical and not asserted current Codeweb defects.

**For evidence:**

- [CW-001](https://github.com/anthropics/claude-code/issues/47565): Issue body: What Claude Actually Did; Additional Context items 6–7; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:1`. Frozen prior-read boundary applies.
- [CW-L022](https://www.synthesia.io/post/automating-code-security-reviews-with-claude-mythos-level-capabilities): Building a map; Security Context; From self-serve to CI; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:74`. Frozen prior-read boundary applies.

**Against evidence:**

- [CW-Y001](https://forum.cursor.com/t/bugbot-pricing-feedback/131907): posts 1 and 3; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:121`; targeted capture notes `sources/L05/REOPEN-NOTES.json#CW-Y001`.
- [CW-L051](https://news.ycombinator.com/item?id=49321400): Comment 49353756; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:103`. Frozen prior-read boundary applies.

## L05-F06 — The proof sprint needs an opportunity-based longitudinal record before either reliance claim can survive as more than a hypothesis.

**Verdict:** unresolved_from_existing_evidence. **Actor/task:** Same consenting developer on successive real tasks; a separate actual buyer/team for paid coordination.

**Conditions:** Frozen eligibility rule chosen before outcomes; Familiar and successful-native tasks retained as controls; No customer simulation or automatic inference from model agreement.

**Strongest supported case:** The frozen sprint explicitly seeks later voluntary use; the cross-repo report describes repeated manual checking, giving a candidate recurring job to investigate. Neither contains observed Codeweb returns.

**Strongest countercase:** Ordinary CI, native lookup and short-lived project needs may remove the burden. First-time novelty and transfer of knowledge can explain an initial win.

**Failure scenario:** Ten task demonstrations yield two useful findings, but none of the developers independently chooses the tool later; a positive first-use gate gets misreported as retention or renewal.

**Weakest assumption:** The same person encounters another eligible task, chooses the tool, and gains net benefit after familiarization.

**Local implication:** Keep the first-use gate separate from return. A small case series can falsify a mechanism for those cases, not estimate population retention.

**Paid implication:** Require separate later evidence of recurring coordination work removed beyond CI/free local capability, followed by actual purchase and renewal; local returns cannot satisfy it.

**Minimal falsification test:** Proposed minimum: one established first-use benefit followed by two naturally occurring eligible opportunities per person, with task/revision, prior familiarity, native baseline, availability, choice, prompts, changed decision, independent adjudication and total effort recorded locally with consent. If later choices require reminders or later benefits disappear, narrow to episodic exploration.

**Confidence:** High confidence the packet lacks this direct observation; actual effects, recurrence rates and buyer outcomes remain unknown. The test is proposed, not executed or newly authorized.

**For evidence:**

- [CW-T018](https://news.ycombinator.com/item?id=48033774): Story body and author reply 48035884; complete four-comment tree read; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:24`. Frozen prior-read boundary applies.
- [CW-Y007](https://forum.cursor.com/t/any-way-of-using-multiple-repositories-in-bugbot/152120): posts 1,5,6; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:127`. Frozen prior-read boundary applies.

**Against evidence:**

- [CW-X001](https://www.agentconnect.md/blog/grep-beat-lsp-harness/): Sections: agents route by task; noisy codebases; output shape; limitations; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:35`. Frozen prior-read boundary applies.
- [CW-Y010](https://community.sonarsource.com/t/is-it-easy-to-revert-from-developer-edition-to-community-edition/41189): post 1; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:130`. Frozen prior-read boundary applies.
- [CW-Z012](https://github.com/oraios/serena/discussions/131): May 30–June 2 maintainer replies; reporter May 31 recovery; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:120`; targeted capture notes `sources/L05/REOPEN-NOTES.json#CW-Z012`.

## Access and independence limits

- The complete frozen packet was available; all 192 hashes checked. All 132 canonical record summaries were screened; selected complete records, source registry, original reopens, strategy, proof sprint and independent research review were inspected. This is not a claim to reread all 110 declared full sources.
- No other pressure-test lens output was read before freezing this first draft. Filesystem isolation is procedural. Session identity is recorded, while runtime freshness remains for lead verification.
- The research corpus has a source-volume shortfall, builder-heavy examples, partial Reddit access and historical/version-specific reports. Counts are not prevalence. No customer, host trial, withdrawal test, purchase or renewal was invented.
- Mapped consumers are incomplete structural evidence; body similarity is not semantic reuse; static checks do not establish behavior. No capability execution was performed in this lens.
- Four targeted original reopens are preserved as dated passage notes, not complete page archives. Other citations rely on frozen original evidence records and declared prior read boundaries.

Machine-readable companion: `05-findings.json`; every material finding above is represented there with supporting/opposing evidence, passage pointers and tests. Tests are proposals only. Completion means delivery of this lens, not self-approval or validation of the product hypotheses.
