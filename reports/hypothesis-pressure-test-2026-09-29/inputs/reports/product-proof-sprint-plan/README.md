# Next step: prove usefulness during a real edit

This is the recommended next sprint after the independently reviewed [user-pain research](../user-pain-research-2026-09-27/README.md). It is a prepared experiment brief, not a record that a build, comparison, recruitment campaign, or participant trial has begun.

## The decision

Test one job for developers who regularly use Claude Code or Codex in their own repositories: **before changing shared code, identify mapped consumers and existing implementation candidates that could change the edit plan.** The product must reduce inspection work or prevent a material omission while making its limits clear.

The [opportunity report](../user-pain-research-2026-09-27/OPPORTUNITY-DECISIONS.md) supports this as the first hypothesis. It does not establish Codeweb's incremental value, retention, or willingness to pay. Use the existing product as the starting point. A larger feature set is not a prerequisite for learning.

## First concrete deliverable

A runnable example inside a real Claude Code session and a real Codex session, plus a frozen pilot protocol. A developer gives an ordinary change request; Codeweb supplies a compact brief when structural inspection is relevant:

- What shared symbol or implementation is involved.
- Which mapped consumers deserve inspection, with source locations.
- Whether a body-similarity candidate might avoid rebuilding existing logic.
- What the map covers, how fresh it is, and what remains unknown.
- One useful next action: inspect a consumer, compare an implementation, or continue with the project's usual checks.

Use existing `codeweb_explain`, `codeweb_context`, `codeweb_impact`/`codeweb_dependents`, and `codeweb_find_similar` capabilities. Preserve the existing fresh-baseline/diff loop and behavioral tests. The brief is conditional, source-backed, and small. It is not a correctness guarantee or an instruction to merge similar code.

Before changing product code, inspect the existing output in the target hosts. If it already supports the trial, use it. If concrete activation or reading friction blocks the trial, isolate the smallest adapter/output change and independently review it. A visual report change would use the existing Codeweb direction and saved Refero references.

## Sprint sequence

1. **Prove native first use.** Freeze package/source revision and actual host versions. In clean sessions verify installation, tool discovery, a real tool invocation, returned source links, graph refresh, and an honest failure/inconclusive result. Confirm that control sessions have no Codeweb hooks, tools, or instructions enabled. Current official extension references: [Claude Code](https://code.claude.com/docs/en/features-overview), [Codex plugin packaging and hook trust](https://developers.openai.com/plugins/build/plugins). Record actual behavior rather than assuming host parity.
2. **Prepare the field pilot.** The Product Lead sources five plausible ordinary weekly coding-agent users, prepares individual invitations and a low-friction task procedure, and owns logistics. Seek both host users and meaningful cross-file work; do not substitute tool builders for ordinary developers without labeling them. Prepare recipients, routes, exact messages, and sender before any send decision. No new contact list is required from the founder.
3. **Observe ten real changes.** Aim for two task opportunities per consenting developer, covering shared-function changes and reuse/refactoring decisions, with small familiar changes and ambiguous/generated cases as controls. Compare their normal native search/LSP/tests with the Codeweb brief using matched tasks and counterbalanced order. Freeze the detailed allocation and scoring rules before measurement. Avoid presenting repeated exposure to the identical task as an independent time comparison.
4. **Measure decisions and total effort.** Record what the developer planned to inspect, what the brief changed, whether a maintainer confirms that change was useful, false warnings, unnecessary edits, and all discovery/verification time and available token costs. A query returning relationships is not itself an actionable finding. Distinguish a prototype access failure from rejection of the job.
5. **Observe return use.** After the initial task, let the participant choose whether to use Codeweb on later work. Follow up two weeks later through the authorized channel, with actual examples. Polite interest and feature wishes are weaker than voluntary use.

## Proposed decision gate

The research proposed at least two additional actionable consumer/reuse findings across ten changes, with no increase in median total inspection/review time. Keep that as a provisional small-pilot rule and define “additional” against a recorded native baseline or pre-brief decision. Require independent adjudication and report every case, including null results. This sample can guide a product choice; it cannot establish a general effect size or product-market fit.

Continue only if developers obtain material value beyond their existing tools and some choose to use it again. If the brief adds reading, misses the relevant relationships, or benefits only artificial tasks, narrow the job or stop that approach. A successful first task alone does not establish repeated reliance.

## Ownership and adjacent work

Product Lead owns the experiment, sourcing, interpretation, and durable records. Technical Lead owns host proof and any minimal reversible implementation. Independent Reviewer verifies the actual output, scoring, evidence, and limits without approving its own work. Use the existing team and one delivery workstream.

At preparation, COD-65/COD-66 already owned a separate two-direction homepage art exploration. Preserve that authorized work. This proof sprint supplies product evidence for later presentation decisions; it does not silently retask the website delivery.

The first paid hypothesis remains hosted cross-repository consumer checks and shared evidence under the charter's free-local boundary. Move to a real team pilot after a recurring coordination problem and buyer are established. All local single-repo capability remains free. A generic paid receipt is not supported by the current evidence.

## Completion evidence

Save actual host captures/transcripts, the frozen protocol, recruitment state, ten task records or an honest participation shortfall, independent findings review, two-week reuse outcomes, and the resulting product decision. If no participant responds, continue independent host work and record the external dependency; do not simulate participants or turn recruitment into founder homework.
