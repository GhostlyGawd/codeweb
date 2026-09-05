# CodeWeb and Graphify

Reviewed: 2026-09-05. This is a qualitative comparison, not a performance benchmark.

Use this page to select a workflow to try. CodeWeb concentrates on the effect of code changes and named structural checks. Graphify describes a graph that connects code, documents, and media. Both document local code analysis without an LLM. Neither this review nor their separate published benchmarks establishes which product gives better results on your repository.

| Task | CodeWeb | Graphify |
|---|---|---|
| Inspect code relationships | Caller, impact, and dependency queries over local graph artifacts. [Reference](reference.md) | Code graph queries, paths, and explanations. [README](https://github.com/Graphify-Labs/graphify/blob/v8/README.md#see-it-in-action) |
| Review a pull request | A base-versus-head gate checks new cycles, duplicate findings, and lost callers of non-exported symbols. [Gate](ci-gate.md) | `graphify prs` documents CI status, review status, worktrees, graph impact, and optional AI triage. [Commands](https://github.com/Graphify-Labs/graphify/blob/v8/README.md#full-command-reference) |
| Connect code with other material | The local product focuses on code structure. [Charter](../CHARTER.md) | Documents, PDFs, images, and audio/video can join the graph through a model-based semantic pass. [Capabilities](https://github.com/Graphify-Labs/graphify/blob/v8/README.md#what-it-does) |
| Inspect evidence and limits | Check graph freshness, rule scope, source locations, and available coverage. A pass does not prove runtime correctness. [Reference](reference.md) | Connections carry `EXTRACTED` or `INFERRED` labels. [README](https://github.com/Graphify-Labs/graphify/blob/v8/README.md#see-it-in-action) |

Our suggested fit: try CodeWeb for a repeatable structural check around an edit. Try Graphify when links across code and supporting material are central to your task. This is an interpretation of the documented workflows, not an exclusive feature claim.

## What the evidence can support

CodeWeb's caller-discovery pilot found better recall at similar token cost. Its small edit-quality experiment found no measured improvement. The separate context-cost experiment compares context bytes in a simulated search loop, not total agent-session savings. These results compare stated baselines; they do not compare CodeWeb with Graphify. See the [research source](../site/content/research.html) and [context-cost receipt](../bench/results/oracle-ab.json).

Before publishing a numerical comparison, record both product commits and versions, source commits, tasks, extraction options, model versions, budgets, and runtime environment. Use the same tasks and budgets. Include text search and available language-server tools as baselines. Separate map-build cost, query cost, and complete session cost. Use independent tests and human review to assess edits. Publish failures and uncertainty with successes. This protocol has not been run here. Existing parked experiments remain subject to the [charter](../CHARTER.md).

## Source record

- Graphify: official README on branch `v8`, read on the date above; Git blob `28a471f44bdffddb6aa30bbb8dbf0b3882772fa8`. The branch links can change. Recheck the document and record its new revision before updating this comparison.
- CodeWeb: implementation baseline `16d3a9bebbf675ef8ccdad56cde73aa5df40fee7`, package 0.14.0; this release adds the package workflow described in the [demo guide](guides/product-clarity-demo.md). Relative links refer to the checkout containing this page.
- No popularity, market-share, speed, accuracy, or cost ranking was measured for this comparison.

For fresh evidence, use the [pilot procedure](guides/product-clarity-pilot.md) and [case-study template](guides/product-clarity-case-study.md).
