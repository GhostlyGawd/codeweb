# Audit implementation status

Checked 2026-09-14 against commit `16d3a9bebbf675ef8ccdad56cde73aa5df40fee7` and the existing working tree. This inventory reconciles historical reports with implementation records and source files; it is the starting point for a new documentation and repository-structure audit.

Most older audit batches produced implementation. Their original reports preserve the problems they found, so reading those reports alone makes completed work look open.

## How to read the evidence

- **Implemented:** completion records and corresponding code or documents exist. This does not imply every historical benchmark was rerun today.
- **Partial:** work landed, with a documented exclusion or an unresolved part.
- **Proposed or pending:** a recommendation or follow-up lacks implementation evidence in this review.
- **Working tree:** implementation exists locally but is not part of the baseline commit.
- **Historical:** a dated observation, decision, or test result; it is not a current backlog item by itself.

The review used local files, git history, ancestry checks, and source inspection. External deployment, directory-listing, account, and pilot-service states were not rechecked.

## Audit batches and what happened

| Batch | Sources | Implementation status and evidence |
| --- | --- | --- |
| July 18 product review | [Product review](../docs/product-review-2026-07-18.md) | **Implemented roadmap, historically verified.** The July 20 review records the P0–P3 work shipping in v0.8.0/v0.9.0. Budgeted tools, plugin MCP registration, freshness handling, and pre-edit hooks exist in the current source. |
| July 20 product review | [15 findings and implementation addendum](../docs/product-review-2026-07-20.md) | **Implemented with a language limitation.** The addendum records all 15 dispositions and tests. Item 14 delivered Ruby/PHP dispatch; Kotlin/Swift remain regex-only in the current [grammar provenance record](../scripts/grammars/PROVENANCE.md). |
| July 21 performance review, first round | [32 findings](../docs/perf-quality-review-2026-07-21.md) | **Implemented across two rounds.** The next audit explicitly found that the first completion claim omitted findings 29–32. Those CI/release/test gaps became work in round 2; the first round's blanket completion claim should not stand alone. |
| July 21 performance review, round 2 | [IMPROVEMENTS](IMPROVEMENTS.md), [plan](../docs/specs/round2-plan.md), [evidence](../docs/specs/round2-evidence.md) | **Implemented with recorded scope decisions.** Merge `414630a` records 42 findings implemented/reviewed. The evidence ledger covers WS-A through WS-H plus late-added finding 39, including performance limits and fallbacks; it is stronger evidence than the merge title alone. |
| July 23 growth and adoption | [FUNNEL](FUNNEL.md), [COMPETITIVE](COMPETITIVE.md), [REVENUE](REVENUE.md), [AI-IDEAS](AI-IDEAS.md), [CRO](CRO.md), [SEO](SEO.md), [PROOF](PROOF.md), [ACTIVATION](ACTIVATION.md), [RETENTION](RETENTION.md), [FORMS](FORMS.md), [CHECKOUT](CHECKOUT.md) | **Partial implementation; strategy is not a completed feature list.** Merge `cce941c` records the reports plus truth/first-contact batches. PLAN §2 records registry/plugin metadata, site discovery, install guidance, conversion footers and the unmapped-workspace nudge as done. Later launch work has separate receipts. |
| July 24 documentation and interface clarity | [DOCS](DOCS.md), [COPY](COPY.md), [API](API.md), [COMPREHENSION](COMPREHENSION.md), [ERRORS](ERRORS.md), [CLI](CLI.md), [MICROCOPY](MICROCOPY.md) | **Substantially implemented, with residuals.** FIXLOG's first session maps 14 deduplicated finding families to commits and verification. The cited implementation commits are ancestors of HEAD. Documentation-specific residuals are listed below. |
| July 26 Spring Cleaning | [PRUNE](PRUNE.md), [SIMPLIFY](SIMPLIFY.md), [DEBT](DEBT.md), [HOTSPOTS](HOTSPOTS.md) | **Main implementation and close-out landed.** Merges `ff23bbb` and `1174be7` carry the work. The tool manifest, MCP queue/graph modules, shared workspace discovery, durable annotations, and removal of retired files are present. D4 risk assembly and remaining manifest-default drift were closed in the August work. |
| July 26–27 build/harness program | [SCAFFOLD](SCAFFOLD.md), [SPEC report](SPEC.md), [BUILDLOG](BUILDLOG.md), [SHIP-GATE](SHIP-GATE.md) | **Implemented; original null reports were superseded.** The harness, root SPEC and ADR exist. FIXLOG records installation, package exclusions and a successful ship-gate rerun. The old “no spec/gate” text describes the initial blocked run. |
| August 16 deep-dive plan | [PLAN](PLAN.md), [BUILDLOG](BUILDLOG.md), [v0.13.0 changelog](../CHANGELOG.md) | **Phases 0–3 implemented.** Merge `a590a3c` and the build log cover claim checks, snapshot/diff, dependents, advisor freshness, provenance, gate adoption/history, evals and reference cleanup. The phase-4 recall work and experiments must be assessed separately. |
| August–September productization and launch | [Launch kit](LAUNCH-KIT.md), [launch status](launch/README.md), [submissions](submissions/README.md), [v0.14.0 changelog](../CHANGELOG.md) | **Repo-side implementation landed; outreach is mixed.** C/C++, boundary/pricing pages, gate-led copy, comparison/LSP pages and receipt repairs are in history. The September 2 records report a posted GitHub announcement and outstanding human submissions. Those external statuses are dated, not reverified here. |
| September 14 Paperclip planning review | Local-only `paperclip-pilot/REVIEW.md` and `paperclip-pilot/RUN-RECORD.md` | **Planning documents and documented corrections exist locally.** RUN-RECORD maps R1–R4 to corrections in the brief, setup spec, evidence and scorecard. It explicitly records no full delivery trial or baseline comparison. This directory is untracked in the current checkout. |
| September 14 Paperclip product investigation | Local-only `paperclip-pilot/investigation-01/RECOMMENDATION.md` and `FEASIBILITY.md` | **Recommendation with subsequent local implementation to verify.** It prioritizes a trustworthy first structural gate loop and warns against rebuilding the supplied gate-comment changes. Current AC-13–16 changes address related areas, but are uncommitted; the investigation's earlier source snapshot is not the final working-tree state. |

The Paperclip materials above were inspected as separate, untracked local inputs. Their paths are recorded for provenance; they are not dependencies of the portable documentation change.

Some FIXLOG hashes are original branch commits and do not appear as ancestors of HEAD. The Spring Cleaning changes are represented by the merged commits above and by current source; absence of an original hash is not evidence that a fix disappeared.

## The July documentation audit, checked more closely

| Original item | Current evidence | Disposition |
| --- | --- | --- |
| Broken “bundled corpus” clone example | README's clone path now maps `/path/to/your/project`; it no longer promises an ignored corpus is bundled. | Implemented correction. |
| Conflicting gate/preflight descriptions | FIXLOG records `5c81f8b` and verdict tests. Current gate and baseline code is being changed again locally. | Historical fix landed; verify the present workflow in the new audit. |
| Retired agent-tools spec claiming a current tool count | `docs/agent-tools.md` is absent; FIXLOG records its retirement and reference cleanup. | Implemented. |
| Wrong Node floor in test instructions | `tests/README.md` states Node 22+. | Implemented. |
| Incomplete pipeline/component explanation | CLI reference and contributor orientation exist, but `docs/reference.md` still labels report building stage 4 and omits optimize from that sequence. | Partial; current source needs a fresh architecture explanation. |
| Links to removed spike directory | `docs/backlog-ast-tree-sitter.md` identifies the spike as pruned and preserved in git history. | Historical-reference correction present. |
| Literal test count in release instructions | Release instructions say “the full suite” rather than the old count. | Implemented. |
| Missing CLI/configuration reference | `docs/cli.md` lists bins, pipeline flags, environment variables and exit codes, including `--stages through-overlap`. | Implemented core reference; coverage of today's surface needs a new pass. |
| Missing privacy control documentation | SECURITY and CLI docs describe `CODEWEB_NO_STATS=1`. | Implemented. |
| Missing contributor guide | CONTRIBUTING exists, but its loop omits the required `sh scripts/check` and names nonexistent root `decisions/` and `specs/` directories. Actual paths are `docs/decisions/` and `docs/specs/`. | Partial; concrete current corrections needed. |
| Incomplete graph schema | The schema example still omits `role` and `signature`, both emitted by `scripts/extract-symbols.mjs`; it also omits source-root/stamp metadata used by current tools. | Still open in the reference; provenance labeling was added separately. |
| Internal reports mixed with user documentation at root | Reports live under `reports/`, with a README describing their historical purpose. | Implemented move; cross-report status navigation remained incomplete. |

Additional current drift: `docs/reference.md` says the server exposes 27 tools, while package metadata and the main README say 28. Its old per-edit instructions also need comparison with the in-progress baseline workflow.

## Work that already exists locally

These changes predate this inventory. Root SPEC marks them built, but they are not committed or released from this checkout.

| Criterion | Existing implementation | Existing checks |
| --- | --- | --- |
| AC-13: actionable gate comments | `scripts/lib/gate-md.mjs`, `scripts/ci-gate.mjs`, related diff/review changes | `tests/gate-md.test.mjs`, `tests/ci-gate.test.mjs` |
| AC-14: context evidence and uncertainty | `scripts/lib/context-core.mjs` | `tests/context-analysis.test.mjs` |
| AC-15: stable pre-edit baseline | `scripts/refresh.mjs`, `scripts/diff.mjs`, `scripts/mcp-server.mjs`, tool manifest | `tests/edit-baseline.test.mjs` |
| AC-16: local setup diagnostics | `scripts/doctor.mjs`, `scripts/run.mjs` | `tests/doctor.test.mjs` |

The associated CLI and gate documentation is also modified. A new audit should evaluate these changes as a separate working-tree layer instead of diagnosing the older baseline again.

## What should not be carried forward as an open bug

- REVENUE's original benchmark-cost premise was explicitly withdrawn in its correction banner and CHARTER. It is not a valid premise for new recommendations.
- CHECKOUT's “no donation surface” verdict is historical; `.github/FUNDING.yml` and support pages now exist. This does not establish a verified payment transaction.
- PLAN's old Teams-distribution threshold and C/C++ deferral were superseded by charter amendments and subsequent work. The local history does not prove the hosted service's current operational state.
- The early BUILDLOG/SPEC nulls were followed by an installed harness and a real root specification.
- Parked P1–P3/H22 experiments and Kotlin/Swift AST support have explicit constraints. They are not documentation fixes awaiting an automatic implementation pass.
- Performance findings include accepted limits and fallbacks. A “done” batch does not mean every aspirational timing target or proposed mechanism shipped unchanged.

## Recommended fresh audit

Completed as [Documentation and repository structure — 2026-09-14](docs-structure-2026-09-14/README.md).
All seven findings are now verified locally; its [fix log](docs-structure-2026-09-14/FIXLOG.md) records the three implementation batches. Changes remain uncommitted.

Create one new audit of **documentation clarity and repository orientation**, grounded in the current source and the existing local changes. Preserve these older reports as evidence.

1. Trace three reading paths: a first-time user, an agent preparing an edit, and a contributor making a change.
2. Check each path's commands in disposable fixtures, including setup, baseline creation, a red structural finding, repair and the required verification gate.
3. Map authoritative files, authored site sources, generated pages, current specs, historical decisions, audit records and benchmark evidence.
4. Check terminology, tool counts, schema fields, links and stage descriptions against their actual producers.
5. Rank only reproduced current gaps, with one finding ID, source evidence, proposed fix and closure check per item.

Use one status table for the new audit: `open`, `implemented`, `verified`, `deferred`, or `superseded`, with a commit or working-tree reference. Keep implementation status distinct from historical test results and external publication.

Start with the contributor gate/path corrections, graph-schema coverage, reference-count/workflow drift and a clear source/generated/history map. A broad folder move is not yet justified by this inventory.

## Verification for this inventory

Historical test totals above belong to their cited runs. This inventory does not independently reproduce all prior audit experiments or certify every finding closed.

Current verification: `sh scripts/check` exited 0 with `ALL CHECKS PASSED`, including spec lint, harness tests, product tests, consistency and all five evals. All 45 local links across this document and `reports/README.md` resolve.

The passing consistency check does not detect the reference page's “27” wording identified above. Only this document and its link from `reports/README.md` are authored by this inventory pass.
