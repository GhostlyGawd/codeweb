# Documentation

Choose a reading path below. These guides describe the current checkout; features marked
unreleased may be absent from the published npm package.

## Start with your task

| Task | Reading path |
| --- | --- |
| Use Codeweb on a repository | [Install and map](../README.md) → [CLI and configuration](cli.md) → [tools and outputs](reference.md). |
| Check an edit with your agents | [MCP setup](../README.md#use-it-as-an-mcp-tool) → [version-specific edit workflow](reference.md#guard-agent-edits-diff) → [analysis limits](cli.md#context-analysis-status). |
| Gate pull requests | [CI-gate setup and verdict contract](ci-gate.md). |
| Contribute a change | [Prerequisites and required gate](../CONTRIBUTING.md) → [product contract](../SPEC.md) → [test guidance](../tests/README.md). |
| Integrate with graph data | [Graph schema and operational examples](../skills/codebase-anatomy/references/graph-schema.md) → [extractor invariants](extractor-invariants.md). |
| Understand prior audits | [Implementation inventory](../reports/AUDIT-STATUS.md) → [latest documentation audit](../reports/docs-structure-2026-09-14/README.md) → [its fixes and receipts](../reports/docs-structure-2026-09-14/FIXLOG.md). |

## Which document governs a decision?

- [CHARTER.md](../CHARTER.md) records product boundaries and ratified direction.
- [SPEC.md](../SPEC.md) controls acceptance criteria. “Built” identifies implemented, test-pinned work; release status comes from release records.
- [DECISIONS.md](../DECISIONS.md) is the append-only architectural decision log. [Detailed decisions](decisions/) and [task specs](specs/) provide supporting history.
- [Requirements records](requirements/) provide traceability; they do not replace the root SPEC.
- [CHANGELOG.md](../CHANGELOG.md) records releases. [ROADMAP.md](ROADMAP.md) summarizes direction; check its date and the charter's later amendments.
- [The harness contract](harness.md) identifies operator-owned verification files. [CONTRIBUTING.md](../CONTRIBUTING.md) gives the current change workflow.

Historical reports describe their reviewed revision. Use the implementation inventory and
fix logs to determine their disposition before treating an old finding as current work.

## Repository ownership map

| Location | Purpose | Where to make a change |
| --- | --- | --- |
| Root README and `docs/*.md` guides | Authored documentation | Edit the relevant Markdown guide; check whether it is a current guide or a dated report. |
| [bin/](../bin/), [scripts/](../scripts/), [scripts/lib/](../scripts/lib/) | Executable entry points, pipeline/advisors and shared implementation | Edit product code here; use [the component map](reference.md#components) to find its owner. |
| [site/](../site/) | Website content, templates, data and styles | Edit authored inputs and run `node site/build.mjs` from the checkout. |
| `docs/*.html`, [docs/assets/](assets/) | Generated website output | Change the producers in `site/` or copied asset sources, then regenerate. |
| [Report template](../scripts/report-template.html), [docs/demo/](demo/) | Report UI source and generated demonstration | Follow the separate [demo and screenshot workflow](../CONTRIBUTING.md#brand-sync-visual-surfaces). |
| [commands/](../commands/), [skills/](../skills/), [agents/](../agents/) | Shipped agent instructions | Keep workflows aligned with the capability version they describe. |
| [hooks/](../hooks/) | Shipped integration hooks | See [hook descriptions](../hooks/README.md). These differ from the repository's harness hooks. |
| [tests/](../tests/), [evals/](../evals/) | Product checks, harness checks and golden cases | Edit product checks outside the protected manifest in [harness.md](harness.md). |
| `.claude/`, `.githooks/`, `.github/`, selected `scripts/` files | Repository automation and verification | Consult the exact protected manifest; protection applies to listed files, not every file in these directories. |
| [docs/specs/](specs/), [docs/decisions/](decisions/), [docs/requirements/](requirements/) | Plans, detailed decisions and trace records | Preserve historical evidence; identify the controlling current contract when adding a record. |
| [reports/](../reports/) | Audits, implementation logs and verification receipts | Keep dated findings and update their status through linked fix records. |
| [bench/](../bench/) | Benchmark instruments, corpus metadata and retained measurements | Follow [benchmark provenance rules](../bench/README.md). Cloned corpus directories are ignored; committed receipts carry evidence. |
| `.codeweb/` | Local maps, caches and deliberate workspace memory | Regenerate maps. Follow `.codeweb/.gitignore`: annotations and history are retained separately from disposable cache and local stats. |
| [editor/vscode-codeweb/](../editor/vscode-codeweb/) | Optional editor integration | Follow [the extension guide](../editor/vscode-codeweb/README.md). |

## Authored guides and generated pages share this directory

`site/build.mjs` produces the website's HTML and assets inside `docs/`. It does not
generate this Markdown index or the Markdown guides. A correction to website copy belongs
in `site/content/`; a correction to a CLI reference belongs in `docs/cli.md`.

The demo has its own report-generation step. Follow the contributor instructions before
rebuilding it, especially when the report template or screenshots change.

## Reading the audit history

The [reports index](../reports/README.md) routes to implementation evidence. Its historical
[conductor index](../reports/INDEX.md) covers specific July runs, while the
[implementation inventory](../reports/AUDIT-STATUS.md) reconciles later batches too.

The July [product review](product-review-2026-07-18.md),
[follow-up review](product-review-2026-07-20.md), and
[performance review](perf-quality-review-2026-07-21.md) remain here as dated records.
Their old counts and findings are historical; their current status lives in the inventory.
