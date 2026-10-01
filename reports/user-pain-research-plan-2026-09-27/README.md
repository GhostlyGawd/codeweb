# Deep web research on Codeweb user pain — plan

27 September 2026. Planning is complete; this research pass has not been dispatched. The user requested a plan before the work begins.

## Objective

Build a broad, traceable picture of the problems developers encounter when Claude Code, Codex, and similar agents inspect, change, and review repositories. Determine which problems Codeweb can solve with repeated value, which users feel them most, what prevents adoption, and what could justify a hosted Teams purchase.

Preserve the [six-lens audit](../product-indispensability-audit-2026-09-26/README.md) and its four screenshots as the dated product baseline. [AUDIT-BASELINE.json](AUDIT-BASELINE.json) records their hashes. Add new evidence and an overlay rather than rewriting historical observations. This pass produces secondary research from public user accounts; it does not count those accounts as interviews with us or establish Codeweb retention or willingness to pay.

The proposed in-agent change brief and receipt are hypotheses to challenge. Agents must look for evidence that built-in search/LSP/tests are sufficient, structural tools create extra work, or a different job matters more.

## Swarm shape

Use the existing Product Lead, Technical Lead, and Independent Reviewer under [TERMINAL-CONTRACT.md](../../docs/product-team/TERMINAL-CONTRACT.md). Create one research parent with up to six child assignments, reusing those roles. Six means six distinct research lenses, not six newly provisioned agents. Maximum three concurrent runs across the existing team, one run per role; actual concurrency depends on available roles. Parent synthesis and native independent review do not require extra research children.

The lead and technical role collect and synthesize; reserve the independent reviewer for checking findings it did not author. The concurrency ceiling includes the reviewer, rather than adding a review run on top of three research runs.

Live read-only status at planning found a separate website workstream, COD-54 → COD-55, refining the v6 candidate. Preserve that work, its user gates, and earlier candidates. Do not interrupt it or treat the September 26 published-site screenshots as observations of the newer candidate. Research work should use available roles or queue behind existing delivery. Research has no implementation workstream.

The lead owns decomposition, source allocation, deduplication, gaps, continuations, and synthesis. Each lane checkpoints artifacts within the existing 600-second run window; use native task continuations rather than creating duplicate tasks. Keep the existing one-correction limit. At launch, retrieve live state again before creating anything.

| Lane | Ownership boundary | Core question |
| --- | --- | --- |
| 1. Claude Code users | First-person Claude-specific workflows and failures, with version/date context. | Where do users lose time or confidence while navigating, changing, and checking code? |
| 2. Codex users | First-person Codex CLI, desktop, and cloud evidence, clearly distinguished. | Where does the actual workflow need additional structural evidence or better integration? |
| 3. Cross-file change risk | Real change narratives: missing callers, duplication, refactors, dynamic dependencies, tests, and maintenance. | Which costly mistakes are structural, and would Codeweb plausibly change the outcome? |
| 4. Adoption and native experience | Setup, MCP, plugin/skill/hook use, permissions, noise, performance, abandonment, and successful activation. | What makes an extension disappear into the workflow, and what makes users remove it? |
| 5. Team review and trust | Maintainers, reviewers, engineering leads, governance, private code, CI, and shared evidence. | Who carries the burden of agent changes, and what evidence earns trust? |
| 6. Value, alternatives, and buying | Switching reasons, cancellations, recurring use, free alternatives, paid-tool experience, and purchase authority. | What recurring job could people pay Codeweb Teams to perform? |

Use [AGENT-BRIEFS.md](AGENT-BRIEFS.md) for bounded lane questions and query starters. A source belongs to one collection lane; other lanes cite its shared evidence IDs rather than counting it again.

## Research breadth

Target **150–200 fully opened and read source pages or threads**, producing approximately **80–120 useful, deduplicated first-person evidence records**. These are coverage targets, not quotas to fill with weak material. Report shortfalls and access limits honestly. Thread participants can supply separate experiences, but copied posts, repeated authors describing the same incident, and syndicated articles count once.

Prioritize the six months preceding the actual research start. Use the preceding two years selectively to understand recurring patterns and changes. Capture publication date, event date when available, retrieval time, host surface, and product version. Resolve stale complaints against current official documentation or maintainer resolution; mark historical/resolved problems explicitly.

Search GitHub issues/discussions and maintainer exchanges; Hacker News; relevant Reddit communities; Stack Overflow and developer forums; firsthand engineering blogs and public retrospectives; and accessible review, video transcript, or social sources. Use several source families per lane. X or YouTube access gaps should remain gaps, not secondhand claims presented as original testimony. Search-engine snippets locate sources; they are not final evidence.

Sample solo/independent developers, experienced developers working in teams, open-source maintainers, reviewers/engineering leads, and users with privacy or organization constraints. Assign a segment only when the source supports it. Tool builders and competitors have useful technical evidence but form a separate group from typical users. Vendor documentation and marketing establish capabilities and offers, not customer demand.

## Execution sequence

1. **Capability and method pilot.** Inside lane 1, verify that the assigned worker can search, open primary sources, and write a valid evidence record with a direct citation. The reviewer checks a small initial sample. If the worker cannot access the required tools, solve or report that specific access problem before scaling the pass; do not equate task completion with successful research.
2. **First collection wave.** Lanes 1–3 gather host-specific experiences and real change failures. Return an initial evidence set and candidate pain themes. The lead reconciles taxonomy and overlapping sources before expansion.
3. **Second collection wave.** Lanes 4–6 gather adoption, team trust, alternatives, and value evidence, using the first wave's questions without adopting its conclusions. Search both complaints and successful workflows.
4. **Deepen and disprove.** Continue within the same six tasks to cover missing segments, resolve outdated evidence, and search for counterexamples to the strongest proposed themes. Stop a theme after two consecutive targeted sweeps add no distinct mechanism, segment, or contradiction; report that stopping point. Preserve the overall bounded scope.
5. **Independent evidence audit.** Verify every major recommendation against its cited sources, all high-priority claims, and a sample of at least 20% of the remaining records. Check first-person status, dates, deduplication, paraphrase accuracy, contradictions, and whether Codeweb's proposed mechanism actually addresses the reported problem. Correct weak claims within the existing task limits.
6. **Holistic synthesis.** Overlay the user-pain findings on the saved six-lens audit and the current product/candidate evidence. Choose a small set of opportunities, give each a falsifiable next experiment, and identify the unresolved questions requiring real participants.

## Evidence standard

Each record follows [EVIDENCE-SCHEMA.json](EVIDENCE-SCHEMA.json): source and retrieval details; person/incident dedup key; user goal and workflow moment; what happened; consequence; workaround; supported segment; evidence type; current/resolved status; and Codeweb relevance. Keep short attributable excerpts and faithful paraphrases linked to the original. Do not infer an author's job, company size, spend, or intent from a handle.

Separate reported user experience, maintainer-confirmed behavior, product documentation, independent measurement, vendor claims, and our inference. Separate host/model failures from problems a structural tool can solve. A source explicitly choosing an alternative or removing a tool is stronger switching evidence than a feature wish. A public price is not willingness-to-pay evidence.

Rank themes using separate, visible judgments: consequence severity, recurrence across independent contexts, workaround burden, confidence and recency, and Codeweb's ability to address the mechanism. Do not multiply subjective numbers into a fake precision score. Counts describe this corpus; they do not estimate population prevalence.

For high-confidence themes, seek at least three independent firsthand contexts across more than one source family, plus a search for counterevidence. Important isolated incidents can remain in the report with appropriately lower recurrence/confidence. Access failures, null searches, excluded sources, and resolved issues belong in the source map.

## Deliverables

Save completed work in a separate `reports/user-pain-research-2026-09-27/` directory, keeping this plan and the original audit intact:

- `README.md`: clear product story, strongest pains, segments, implications, and evidence limits.
- `EVIDENCE.jsonl` and `EVIDENCE.csv`: the shared, deduplicated source-backed corpus.
- `QUERY-LOG.csv` and `SOURCE-MAP.md`: search coverage, dates, platform mix, exclusions, gaps, and resolutions.
- `lanes/01-claude.md` through `lanes/06-value.md`: six independently reasoned briefs, each with contradictory evidence and a decision it changes.
- `PAIN-MAP.md`: prioritized user jobs, failures, consequences, workarounds, and evidence IDs.
- `CONTRADICTIONS.md`: where people disagree, native tools suffice, paid value is absent, or the change-brief premise fails.
- `AUDIT-OVERLAY.md`: crosswalk to each original audit lens; corroborated gap, challenged assumption, new opportunity, or still unknown. Distinguish published baseline from current candidate.
- `OPPORTUNITY-DECISIONS.md`: 3–5 candidate wedges, who feels them, why they recur, existing alternatives, Codeweb fit, paid/free boundary, and next validation experiment.
- `REVIEW.md` and `COMPLETION.json`: independent review, source-count readout, remaining uncertainty, actual worker/runtime results, and any root interventions.

The final synthesis should make it easier to decide **who Codeweb is for, which repeat job to own, what native integration must do, which friction to remove, and what Teams could sell**. It should also state what the web research cannot settle. Direct user observations and a real paid pilot remain the next tests for reliance and buying behavior.

## Completion and start boundary

This pass is complete when the corpus and six briefs are saved, evidence review passes or residual limitations are named, and the audit overlay produces supported decisions and tests. A large list of links or successful agent runs is insufficient.

The user has requested the research pass and asked to see the plan before it begins. This turn saves the plan and verifies the baseline; it does not dispatch the research. [DISPATCH-BRIEF.md](DISPATCH-BRIEF.md) is prepared for the next execution step. Public-source research is within the requested scope. Contacting people, purchasing access, changing the product, or publishing results would require separate scope or authority.
