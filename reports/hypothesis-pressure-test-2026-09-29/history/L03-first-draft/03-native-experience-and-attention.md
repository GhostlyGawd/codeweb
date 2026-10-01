# Lens 03 — Native experience and attention

**Verdict: revise.** Retain conditional pre-edit inspection as a hypothesis; revise native-experience claims into surface-specific, decision-timed, recoverable evidence with an explicit total-attention budget. Neither six lines nor one-second warm response is validated.

Assignment: COD-82 (26a76a68-4fe4-408d-8dc8-9418dd5e003a); run `ece66b7f-e96f-4c26-8890-574f99aef49d`; session `01a0f07b-67b6-7022-89ae-b9a898e9e47a`. Input manifest SHA256 `748f176be9d48ccf383ff6a6a601b56e7a8337bc898d27c2f1c319462a7e9852`.

The strongest surviving case is an ambiguous shared-code edit where a timely, source-linked consumer changes inspection. The strongest rival is that native search/tests already suffice and the brief creates setup, reading and recovery work. The evidence supports testing this distinction, not claiming that the proposed flow has removed work.

## L03-F01 — Availability must be claimed per observed host surface and worktree; installation metadata is insufficient.

**Actor/task:** Agent-heavy developer starting a change in a CLI, desktop/WSL, cloud session or linked worktree.

**Conditions:** Exact package, host version, surface, working directory, trust policy and session restart state matter. Historical incidents are not claims of current defects.

**Strongest supported case:** H3 has direct incident-level support: declared cloud plugins were absent; CLI-installed plugins were invisible in Desktop/WSL; project hooks were reported absent in linked worktrees. Graph quality cannot compensate for a tool the active session never invokes.

**Strongest countercase:** The BugBot incident was resolved by precise invocation syntax, and the Checkly author reconsidered MCP after an equivalent-workflow comparison. Integration failure is neither permanent nor evidence that all MCP delivery is burdensome. Frozen Codeweb docs report an exercised Codex baseline loop.

**Failure scenario:** A developer starts a worktree, sees an installed plugin, and edits while believing the consumer brief is active; no brief arrives and silence is mistaken for no affected consumers.

**Verdict:** `narrow`. **Weakest assumption:** A successful advertised installation predicts availability in the next actual editing session.

**Local implication:** Keep the local hypothesis limited to demonstrated surfaces; do not promise host parity.

**Paid implication:** Host setup support could cost service labor, but its removal is not established paid coordination value.

**Smallest falsification test:** Proposed only: in one clean session per intended host, record discovery, one real source-linked invocation and a pre-edit trigger; repeat the trigger in a linked worktree. Pin host/package versions and actual cwd. Exclude any failed surface from availability claims until corrected by its owner.

**Confidence:** High confidence in the frozen source/documentation distinctions; moderate in transfer from reported incidents; low in unmeasured Codeweb user effect. No prevalence inference.

Evidence and opposing evidence (the JSON preserves full source boundaries):

- For: [CW-T002](https://github.com/anthropics/claude-code/issues/88214); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:8`; passage: Body and all 0 comments; comment IDs in source registry.
- For: [CW-T004](https://github.com/anthropics/claude-code/issues/97515); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:10`; passage: Body and all 0 comments; comment IDs in source registry.
- For: [CW-X009](https://github.com/openai/codex/issues/27133); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:43`; passage: Body reproduction; comment 5233430635; comment 5416744725.
- Against: [CW-L026](https://forum.cursor.com/t/bugbot-without-background-agents/157812); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:78`; passage: Original post; support reply 6; author confirmation 7.
- Against: [CW-L024](https://www.checklyhq.com/blog/mcp-vs-cli-token-efficiency/); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:76`; passage: There’s no difference anymore?; final paragraphs.

Frozen capability/proposal passages:

- `inputs/README.md:217-229 (plugin restart versus per-client MCP registration)`
- `inputs/docs/reference.md:269-272 (Codex CLI 0.154.0 assessment; Claude and all-tool certification excluded)`
- `inputs/hooks/hooks.json:1-39 (host-specific event matchers)`

## L03-F02 — A six-line limit must protect the edit-relevant consumer and uncertainty, not merely truncate a ranked list.

**Actor/task:** Developer modifying one symbol in a multi-symbol file or deciding whether to reuse an implementation.

**Conditions:** Target symbol must be identified; high fan-in is not necessarily relevance to the requested edit. Dynamic/generated consumers remain outside a completeness claim.

**Strongest supported case:** The small semantic-navigation pilot supports task-dependent precision and inline source. External caller context helped adjudicate false positives in a firmware experiment. A compact source-linked card could focus inspection.

**Strongest countercase:** Full context can be unnecessary for tiny edits; verification rereads can erase token savings. A bounded cloud change succeeded with ordinary tests. None establishes that three consumers, two candidates and all qualifications fit six readable lines.

**Failure scenario:** The file has a high-fan-in helper and a low-fan-in public function being changed. The hook surfaces the helper and its four callers; the materially affected consumer of the public function falls outside the brief, while a lexical similarity candidate attracts an unnecessary rewrite.

**Verdict:** `revise`. **Weakest assumption:** A popularity-ranked sample remains decision-relevant when compressed into six lines.

**Local implication:** Retain compact evidence, but prioritize the requested symbol and relevant relation; reserve uncertainty space before adding optional candidates. Similarity is a source-inspection lead, not semantic reuse advice.

**Paid implication:** A shorter local card creates no independent paid entitlement or buyer evidence.

**Smallest falsification test:** Proposed only: freeze ranking before preflight and use one multi-symbol fixture whose edited low-fan-in symbol has a known consequential consumer. Require that consumer or an explicit incomplete-selection indication before edit, working expansion, omitted counts, and coverage/freshness labels. Measure characters/tokens and source-opening work as well as lines.

**Confidence:** High confidence in the frozen source/documentation distinctions; moderate in transfer from reported incidents; low in unmeasured Codeweb user effect. No prevalence inference.

Evidence and opposing evidence (the JSON preserves full source boundaries):

- For: [CW-X001](https://www.agentconnect.md/blog/grep-beat-lsp-harness/); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:35`; passage: Sections: agents route by task; noisy codebases; output shape; limitations.
- For: [CW-L023](https://edgelog.dev/blog/how-many-ai-code-reviews/); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:75`; passage: Parts 1, 5; limitations 23.5–23.7.
- Against: [CW-Z012](https://github.com/oraios/serena/discussions/131); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:120`; passage: May 30–June 2 maintainer replies; reporter May 31 recovery.
- Against: [CW-Z009](https://simonwillison.net/2025/Jun/3/openai-codex-pr/); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:117`; passage: Setup script; prompt; result paragraph.

Frozen capability/proposal passages:

- `inputs/hooks/pre-edit-impact.mjs:58-105 (highest incoming-edge symbol; card assembly)`
- `inputs/hooks/pre-edit-impact.mjs:147-164 (four callers, two tests and expansion instruction)`
- `inputs/reports/user-centric-value-strategy/STRATEGY.md, Make the useful path feel native (proposed three consumers/two candidates/six lines)`

## L03-F03 — One-second warm evidence is an end-to-end pre-edit target, not an engine-speed or installed-readiness result.

**Actor/task:** Developer waiting for useful evidence during a live coding session, particularly after cold start or source changes.

**Conditions:** Clock includes trigger/discovery, permissions, queueing, refresh, tool execution, rendering and usable source links. Warm, cold, stale and failed cases must be separated.

**Strongest supported case:** The historical Cursor account illustrates disabling workflow features after reported slow invocation. Cold test startup separately interrupts feedback loops. These identify elapsed-time risk, without attributing either problem to Codeweb.

**Strongest countercase:** The Cursor author changed two variables and another user reported speed; Checkly found similar context consumption for equivalent transports. These cannot establish inherent MCP slowness or the correct Codeweb threshold. Frozen sidecar paths suggest a plausible low-cost hook mechanism.

**Failure scenario:** A fast cached hook responds inside a second with stale evidence while a refresh or permission prompt delays the correct result until after the edit decision; the engine meets a microbenchmark while the experience fails.

**Verdict:** `unresolved_from_existing_evidence`. **Weakest assumption:** Cheap map reads dominate elapsed time experienced by the developer.

**Local implication:** Do not claim the target achieved; give cold progress and bounded truthful failure. Do not introduce a resident daemon to chase this target under the current charter.

**Paid implication:** Paid coordination must include runner/wait/recovery costs independently; local query speed is not paid-attributable savings.

**Smallest falsification test:** Proposed only: timestamp ordinary request, trigger, permission, refresh, output and first valid source opening on warm, unmapped and changed-source runs. Report each end-to-end latency, not a percentile from a tiny preflight. Fail the timing claim when usable evidence arrives after the decision; retain one second only as a provisional warm target.

**Confidence:** High confidence in the frozen source/documentation distinctions; moderate in transfer from reported incidents; low in unmeasured Codeweb user effect. No prevalence inference.

Evidence and opposing evidence (the JSON preserves full source boundaries):

- For: [CW-Y006](https://forum.cursor.com/t/is-cursor-extremely-slow-for-you-since-the-0-49-update/82831); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:126`; passage: posts 1 and 5.
- For: [CW-T006](https://github.com/anthropics/claude-code/issues/70680); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:12`; passage: Body and all 2 comments; comment IDs in source registry.
- Against: [CW-L024](https://www.checklyhq.com/blog/mcp-vs-cli-token-efficiency/); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:76`; passage: There’s no difference anymore?; final paragraphs.

Frozen capability/proposal passages:

- `inputs/hooks/pre-edit-impact.mjs:22-34 (sidecar/fallback paths and code-comment timing claims, not measurements by this review)`
- `inputs/hooks/hooks.json (10-second pre-edit and 30-second post-edit timeouts are ceilings, not latency evidence)`
- `inputs/CHARTER.md, Non-goals 1 (no resident daemon)`

## L03-F04 — Mistaken suppression is a first-class failure: silence must not imply safe isolation.

**Actor/task:** Developer making an apparently isolated edit in an unmapped, stale, generated or partially represented repository.

**Conditions:** The proposal suppresses known small isolated edits but requires uncertainty visibility. Hook silence has several causes and is not a typed zero-consumer answer.

**Strongest supported case:** The Serena record distinguishes crashed reference lookup from an empty set, and its scoping workaround lost cross-project references. Generated APIs expose representational limits. Frozen Codeweb pre-edit source returns null for unreadable graph, missing nodes, no mapped target and zero incoming edges.

**Strongest countercase:** Native grep and tests can already suffice for small clean changes, so showing a full warning on every edit is also costly. Fail-open avoids blocking the user; it is a reasonable execution policy if evidence availability remains inspectable.

**Failure scenario:** A parser or graph read fails, no card appears, and the user proceeds as if the shared function has no consumers. Alternatively, the classifier labels an edit isolated because the missed consumer was never mapped.

**Verdict:** `revise`. **Weakest assumption:** The trigger can distinguish known irrelevant work from work whose relevance is unknown.

**Local implication:** Use a quiet inspectable availability state plus explicit unknown/failure when relying on evidence; count false suppression and unnecessary triggers separately.

**Paid implication:** Hosted silence similarly cannot mean checks passed, but this local defect class does not itself validate a paid job.

**Smallest falsification test:** Proposed only: one fixture each for known zero, unmapped, corrupt graph, stale source and generated consumer. Record expected trigger versus observed trigger and whether uncertainty is visible without a full alert. A missed known consequential mapped consumer or failure presented as known zero fails preflight; do not score generated absence as runtime completeness.

**Confidence:** High confidence in the frozen source/documentation distinctions; moderate in transfer from reported incidents; low in unmeasured Codeweb user effect. No prevalence inference.

Evidence and opposing evidence (the JSON preserves full source boundaries):

- For: [CW-Z007](https://github.com/oraios/serena/issues/1814); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:115`; passage: Summary; Additional suggestion; Note on scoping.
- For: [CW-Z011](https://github.com/oraios/serena/issues/1432); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:119`; passage: Capability matrix in body.
- For: [CW-X009](https://github.com/openai/codex/issues/27133); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:43`; passage: Body reproduction; comment 5233430635; comment 5416744725.
- Against: [CW-X001](https://www.agentconnect.md/blog/grep-beat-lsp-harness/); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:35`; passage: Sections: agents route by task; noisy codebases; output shape; limitations.
- Against: [CW-Z009](https://simonwillison.net/2025/Jun/3/openai-codex-pr/); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:117`; passage: Setup script; prompt; result paragraph.

Frozen capability/proposal passages:

- `inputs/hooks/pre-edit-impact.mjs:44-64 (null on unreadable/no-node/no-edge paths)`
- `inputs/hooks/pre-edit-impact.mjs:113-139 (unmapped/no-entry returns and best-effort staleness)`
- `inputs/hooks/pre-edit-impact.mjs:170-197 (caught failures and non-blocking exit)`
- `inputs/hooks/session-brief.mjs:24-46 (once-per-workspace unmapped nudge)`

## L03-F05 — On-demand recovery must preserve the pre-edit baseline and permissions; another reminder to remap leaves recurring work with the user.

**Actor/task:** Developer recovering from stale evidence, first-use absence or a failed check while an edit/repair is already underway.

**Conditions:** Local analysis remains free; host permission decisions remain the host’s. An already lost pre-edit baseline cannot be recreated from edited source.

**Strongest supported case:** Tool-builder self-report describes repeated prompts only briefly restoring invocation. Other records describe restart failure or manual resource recovery. Frozen docs require an explicit pre-edit baseline and preserve it during ordinary refresh; the hook points to further tools instead of owning every recovery step.

**Strongest countercase:** Trigger correction resolved one real incident, and the historical Serena configuration problem recovered. Frozen Codeweb has a documented stable-baseline path and its advisory hook intentionally does not auto-approve edits; recovery need not be burdensome if the host actually performs it.

**Failure scenario:** After a stale-card warning, an agent captures a new baseline over already-edited source to make the comparison look clean, or repeatedly asks the user to repair configuration. The evidence is now misleading even if the command succeeds.

**Verdict:** `revise`. **Weakest assumption:** An on-demand path will be discovered and executed correctly by a person who did not know a brief was missing.

**Local implication:** Provide discoverable status/expansion and truthful recovery; measure all manual prompts and baseline operations as adoption burden.

**Paid implication:** Account for support/recovery cost before claiming managed service savings; do not monetize fixing local access.

**Smallest falsification test:** Proposed only: deny one tool permission and supply one stale/missing-baseline condition. Require an actionable typed state, no bypass or auto-approval, and one documented recovery path. Verify baseline hash survives refresh and repair; missing pre-edit evidence remains unknown. Check uninstall disables injection and leaves user source intact.

**Confidence:** High confidence in the frozen source/documentation distinctions; moderate in transfer from reported incidents; low in unmeasured Codeweb user effect. No prevalence inference.

Evidence and opposing evidence (the JSON preserves full source boundaries):

- For: [CW-001](https://github.com/anthropics/claude-code/issues/47565); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:1`; passage: Issue body: What Claude Actually Did; Additional Context items 6–7.
- For: [CW-Z007](https://github.com/oraios/serena/issues/1814); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:115`; passage: Summary; Additional suggestion; Note on scoping.
- For: [CW-T004](https://github.com/anthropics/claude-code/issues/97515); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:10`; passage: Body and all 0 comments; comment IDs in source registry.
- Against: [CW-L026](https://forum.cursor.com/t/bugbot-without-background-agents/157812); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:78`; passage: Original post; support reply 6; author confirmation 7.
- Against: [CW-Z012](https://github.com/oraios/serena/discussions/131); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:120`; passage: May 30–June 2 maintainer replies; reporter May 31 recovery.

Frozen capability/proposal passages:

- `inputs/docs/cli.md:108-142 (baseline capture, preservation, missing-baseline limit)`
- `inputs/hooks/pre-edit-impact.mjs:182-195 (additionalContext only; host permission retained)`
- `inputs/hooks/session-brief.mjs:43-45 (on-demand mapping nudge)`
- `inputs/README.md:311-325 (repair against original baseline and behavioral tests)`

## L03-F06 — The decisive experience measure is changed decisions per total attention spent, not card delivery or six-line compliance.

**Actor/task:** Ordinary weekly coding-agent developer doing consequential shared-code work versus small familiar changes; tool-builder findings remain separately labeled.

**Conditions:** Count setup, restarts, trigger prompts, refresh, permission handling, card reading, source expansion, false warnings, unnecessary edits and usual validation. Agent context injection and human-visible reading are distinct.

**Strongest supported case:** External context can change an inspection decision and precision on ambiguous tasks; a well-timed consumer could prevent an omission. This is a defensible conditional job.

**Strongest countercase:** Extra verification rereads, adequate grep and native successful changes can erase the entire benefit. The hooks also inject a session briefing plus per-edit/post-edit material, so one compact card is not the whole attention budget.

**Failure scenario:** The card is correct and quick, but appears repeatedly through a multi-file change, leads to redundant source opens, and does not change the edit plan. The recorded tool invocation looks like activation while total work rises.

**Verdict:** `narrow`. **Weakest assumption:** A useful finding saves more work than all delivery, interpretation and verification work it introduces.

**Local implication:** Retain only conditional use in tasks where evidence changes inspection or reuse decisions; six-line/warm targets are subordinate to total effort and correctness.

**Paid implication:** No local attention win proves purchase or renewal. Paid coordination needs a separate observed recurring team burden and net savings beyond local/CI.

**Smallest falsification test:** Proposed only after technical preflight and separate trial authority: compare a recorded native baseline with brief-assisted matched tasks, counterbalance order, independently adjudicate changed decisions, and record null/negative cases and later voluntary use. Reject the default brief for a segment if added work persists without material decision benefit.

**Confidence:** High confidence in the frozen source/documentation distinctions; moderate in transfer from reported incidents; low in unmeasured Codeweb user effect. No prevalence inference.

Evidence and opposing evidence (the JSON preserves full source boundaries):

- For: [CW-L023](https://edgelog.dev/blog/how-many-ai-code-reviews/); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:75`; passage: Parts 1, 5; limitations 23.5–23.7.
- For: [CW-X001](https://www.agentconnect.md/blog/grep-beat-lsp-harness/); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:35`; passage: Sections: agents route by task; noisy codebases; output shape; limitations.
- Against: [CW-Z012](https://github.com/oraios/serena/discussions/131); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:120`; passage: May 30–June 2 maintainer replies; reporter May 31 recovery.
- Against: [CW-Z009](https://simonwillison.net/2025/Jun/3/openai-codex-pr/); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:117`; passage: Setup script; prompt; result paragraph.
- Against: [CW-L024](https://www.checklyhq.com/blog/mcp-vs-cli-token-efficiency/); `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:76`; passage: There’s no difference anymore?; final paragraphs.

Frozen capability/proposal passages:

- `inputs/hooks/session-brief.mjs:1-6 and preview (session briefing is a separate injection)`
- `inputs/hooks/post-edit-diff.mjs:91-115 (deduplicates post-edit regressions against baseline; does not establish overall attention savings)`
- `inputs/reports/product-proof-sprint-plan/README.md, Measure decisions and total effort; Proposed decision gate`

## Smallest needed host preflight — proposed, not executed

1. Pin package/source and exact Claude Code/Codex host versions, surfaces, cwd/worktree, policy and session identities. Use one small representative repo, not a broad compatibility campaign.
2. Prove discovery and a real returned source link, then an ordinary request triggering evidence before edit in each intended host and linked worktree. A listed tool or installed plugin is not sufficient.
3. Use the same small fixture for a shared low-fan-in symbol in a busy file, a small isolated change, and generated/unknown coverage. Freeze selection and output rules before comparison; inspect omitted counts and uncertainty.
4. Exercise warm, unmapped/cold, changed-source, corrupt-graph and denied-permission states. Timestamp end-to-end evidence; record separate status and recovery work. Test expansion, preserved baseline through repair and uninstall.
5. Proceed to a separately authorized participant comparison only after usable evidence precedes the decision, uncertainty cannot masquerade as zero/pass, expansion/recovery works and permission policy is respected. A preflight pass proves operability on these cases only, not usefulness or availability everywhere.

## Access, isolation and coverage limits

- No fresh installation, host experiment, product edit, outreach, participant observation, runtime latency measurement or current-host certification was performed.
- All 192 frozen input hashes verified at start and final delivery; full packet was available, but this lens selectively inspected original evidence records, source-registry boundaries, strategy/proof sprint, research review and relevant frozen capability files.
- Original public URLs and passage locators are carried per finding. Relevant complete external page captures are not present in the frozen packet; this review uses the preserved original evidence records, not a claim to have reopened those pages. No additional source count is claimed.
- The imported explain-core implementation is absent from the frozen selected capability files; internal caller ordering was not inspected. Visible hook code establishes highest-fan-in symbol selection and truncation only. No assertion of ranking completeness follows.
- Historical/version-specific reports and resolved counterexamples are preserved. Corpus counts cannot estimate prevalence; independent measurement labels do not mean this reviewer reproduced studies.
- Fresh task context is reported from this run identity; other lens outputs were not read. Shared filesystem isolation is procedural. Product Lead must independently verify runtime-session freshness.

This is delivery of an independent lens, not self-review approval or acceptance of the parent objective. No implementation correction is performed here; owners can use the findings through the parent’s native synthesis/review path.
