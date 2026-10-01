# Codeweb customer-voice research

Completed 2026-09-15 UTC. Public-source discovery research using `talk-to-users`, `who-is-this-for`, and `review-the-work`.

**Recommendation:** Prioritize hands-on maintainers checking agent changes across files. A secondary opportunity is reducing repeated code discovery for developers already trying context tools. Treat team review as a separate adoption hypothesis; this research does not validate a paid buyer.

The evidence supports recurring problems, not proof that Codeweb solves them. Most accounts concern other tools. The existing Codeweb charter and brand remain the governing product direction.

## What frequency tells us

Yes, repeated independent mentions indicate recurrence within a sample. Count distinct accounts and distinct conversations, rather than raw keyword matches, replies, or upvotes.

This first pass retained **25 distinct public accounts across 13 conversations**: 19 problem reports, two requests, and four counterexamples. The conversations span Reddit, the Cursor forum, GitHub, and Hacker News. All retained records have 2026 publication metadata, although several Reddit dates are approximate or conflicting.

| Coded need | Accounts out of 25 | Conversations out of 13 | Evidence |
| --- | ---: | ---: | --- |
| Review, verification, or cleanup burden | 10 | 5 | V01, V02, V04, V08, V09, V10, V18, V21, V23, V25 |
| Context tools unavailable, unused, costly, or unreliable | 6 | 5 | V12, V13, V15, V16, V17, V19 |
| Orientation/token efficiency | 5 | 5 | V05, V11, V13, V17, V24 |
| Accurate callers and cross-module context | 4 | 3 | V03, V15, V20, V21 |
| Duplicate logic or failure to reuse utilities | 2 | 2 | V04, V18 |

Every ID resolves in the [evidence ledger](evidence.md); [evidence.json](evidence.json) contains the coding and context. Categories overlap. The two requests contribute to their stated needs; the four counterexamples remain in the denominator and have no problem codes.

These are **counts in retained evidence**, not market percentages. We intentionally searched for relevant problems and selected substantive accounts, so the sample cannot estimate how many developers experience them. The broader review category also naturally captures more accounts than the narrower duplication category.

One HN discussion supplies five accounts, and multiple Reddit threads supply two or three. Conversation counts expose that clustering. Separate handles are not proof of separate people, and corroboration within a thread is not independent recruitment.

No confidence intervals or time trends are warranted. Votes were not counted as customers, agreement, or purchase intent. Several source dates conflict between search publication metadata and relative page ages; these are flagged rather than treated as evidence of rising demand.

## Customer issues and Codeweb's fit

| Priority for investigation | Customer job / issue | Existing response | Codeweb fit and boundary |
| --- | --- | --- | --- |
| 1 | Find the relationships an agent must inspect before changing a symbol | IDE references, caller-tracing scripts, manual scrutiny | Direct job fit for callers and impact queries. Validate extraction on the person's actual stack; reflection and runtime wiring remain limits. [V03](evidence.md#v03), [V15](evidence.md#v15), [V20](evidence.md#v20), [V21](evidence.md#v21). |
| 2 | Get an installed context tool reliably used during work | Hooks, explicit prompts, custom retrieval scripts, manual configuration | Activation is part of the product's value. Show the agent actually invoking Codeweb and receiving current, bounded answers. Installation alone is insufficient. [V12](evidence.md#v12), [V16](evidence.md#v16), [V19](evidence.md#v19). |
| 3 | Spend less of a session rediscovering the repository | Handoffs, memory, graph tools, narrower tasks | Plausible fit for structural questions. Measure the full task, including setup, payloads, refresh, and retries; generic quota complaints have several possible causes. [V05](evidence.md#v05), [V13](evidence.md#v13), [V17](evidence.md#v17), [V24](evidence.md#v24). |
| 4 | Review generated changes and avoid repeated cleanup | Tests, diffs, write-protection hooks, review bots, additional humans, fewer simultaneous agents | Structural evidence can assist review. The gate cannot establish behavioral correctness, enforce every requirement, or stop arbitrary test weakening. [V01](evidence.md#v01), [V04](evidence.md#v04), [V09](evidence.md#v09), [V10](evidence.md#v10), [V23](evidence.md#v23). |
| 5 | Reuse existing logic rather than accumulate copies | Rules, layered reviews, manual cleanup | Similarity discovery and body-confirmed duplication are relevant. Only two retained current accounts explicitly support this need; one uses unsupported F#. Keep it a supporting hypothesis. [V04](evidence.md#v04), [V18](evidence.md#v18). |

Priority is an analyst judgment combining specificity, consequence, workarounds, and product fit. It is not a score of market size, and it does not simply follow mention count.

## Provisional ICP 1: Maintainer checking cross-file agent changes

**Who:** A hands-on developer who understands their repository well enough to review an agent's work. Company size and buyer authority are unknown. C# appears in one direct request; other accounts describe dynamic code and unspecified stacks. [V03](evidence.md#v03), [V20](evidence.md#v20), [V21](evidence.md#v21).

**Trigger:** A refactor or shared-function change requires identifying callers and deciding what else to inspect. The developer already distrusts a text-search-only answer.

**Job:** When my agents change code used elsewhere, I want a small, inspectable list of affected relationships so I can review the change and choose follow-up checks.

**Current alternatives:** IDE references, agent-generated tracing scripts, tests, and manual diff review. Native LSP is a meaningful substitute, not a straw-man baseline.

**Why this is first:** It matches Codeweb's charter audience and structural job closely. Recruitment should begin with a known supported repository and a concrete change, rather than a generic request for safer AI coding.

**Exclude or qualify out:** People satisfied with their existing process; tasks needing complete runtime dependency coverage; expectations of safe automated rename; unsupported languages; users unable to assess the answer. The initial offer is the free local product, with no inferred budget or purchase intent.

**Disconfirming evidence:** Some developers find asynchronous refactoring inexpensive and effective already. A useful graph must also surface its blind spots. [V22](evidence.md#v22), [V15](evidence.md#v15).

## Provisional ICP 2: Developer paying repeatedly for code discovery

**Who:** An individual developer on a growing or unfamiliar repository who can observe the agent's tool calls. One account describes roughly 500 files; another describes a startup full-stack workload. These are examples, not a minimum size threshold. [V05](evidence.md#v05), [V24](evidence.md#v24).

**Trigger:** Orientation consumes noticeable quota or time, despite handoffs, memory, or an existing graph tool. The specific qualifying behavior is repeated discovery, not simply a high subscription bill.

**Job:** When I begin a task in unfamiliar code, I want my agents to locate the relevant symbols quickly so more of the session goes into solving the task.

**Adoption requirement:** Prove the agent queries the tool without repeated reminders and keeps answers current. Compare total task cost and correctness on the same task; don't sell a query-only token reduction as a whole-session saving.

**Exclude or qualify out:** Small or well-documented projects already navigating efficiently; costs caused mainly by design generation, long conversation history, or model pricing; users seeking a billing dashboard. Company size, budget ownership, and willingness to pay Codeweb are unknown.

**Disconfirming evidence:** One account reports satisfactory navigation on a much larger repository without extra extensions. Another disabled a graph tool after perceiving higher usage, while a reply disputed that experience. [V07](evidence.md#v07), [V13](evidence.md#v13), [V14](evidence.md#v14).

## Provisional ICP 3: Developer responsible for reviewing team-generated changes

**Who:** A developer in a team where agent output still needs human review. The evidence shows team workflows but does not establish job seniority, headcount, budget authority, or procurement process. [V04](evidence.md#v04), [V25](evidence.md#v25).

**Trigger:** More generated code increases review or cleanup work. Existing tests and review bots still leave a human accountable for understanding the change.

**Job:** When several developers submit agent-assisted changes, I want structural findings and affected relationships attached to the change so I can focus my review.

**Entry point:** Validate the free self-hosted PR gate and its usefulness to reviewers. Paid hosting is a later buyer hypothesis; a large organization with a useful internal multi-repo graph may already have a satisfactory alternative. [V06](evidence.md#v06).

**Exclude or qualify out:** Buyers demanding semantic/security review replacement, teams requiring unsupported coverage, or organizations already satisfied with their review process. Test whether Codeweb adds useful information beyond their current tools before adding another workflow step.

## Important counter-evidence

- **Larger does not automatically mean worse.** V07 reports a large repository working adequately with native features; V06 reports success with an internal graph.
- **An index can be confidently incomplete.** V15 reports missed runtime wiring; a smaller answer is not automatically a better answer.
- **Installed is not used.** V12 and V16 describe the agent failing to use available context tooling.
- **Some existing workflows work.** V04 describes layered review that produces acceptable results; V22 finds agent refactoring low-cost.
- **General agent frustration exceeds Codeweb's scope.** V18's semantic requirements and F# environment are poor grounds for promising Codeweb as the remedy.

## What to do with this research

1. Use ICP 1 as the first recruitment hypothesis. The recent HN account [Incipient](https://news.ycombinator.com/item?id=49608107) and Cursor request [LarrySmithIDIC](https://forum.cursor.com/t/expose-lsp-find-all-references-to-the-agent/170868) describe particularly specific jobs. Neither is a confirmed Codeweb user.
2. Build a trial around one real change with known callers. Observe discovery, tool invocation, correct relationships, omissions, review usefulness, and total effort. Preserve unsupported cases.
3. For ICP 2, check actual tool use before recommending another index. A person who already installed one may need a reliable workflow rather than another product.
4. Use public research to improve qualification and questions. Keep interviews and voluntary repeat-use follow-up available for facts public posts cannot reveal.

No outreach was sent as part of this study. The previously authorized follow-up to Codeweb issue #92 is separate. No website copy, product behavior, pricing, or charter decisions were changed.

## Review verdict

**PASS as exploratory research and provisional ICPs.** Counts are reproducible from retained evidence, contradictory accounts remain visible, and product boundaries are explicit. Weakest point: search and retention were purposive, so frequency describes this selected corpus and cannot rank population prevalence. See [method and screening notes](method.md).
