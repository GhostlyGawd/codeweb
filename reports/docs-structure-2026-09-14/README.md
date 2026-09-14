# Documentation and repository-structure audit

**2026-09-14 · baseline `16d3a9bebbf675ef8ccdad56cde73aa5df40fee7` plus existing local changes.**

The documentation's main weakness is agreement between entry points. The current checkout can complete a stable edit/check/repair loop, but prominent guides teach an older sequence, overstate parts of the verdict, and assume different installation contexts.

Seven current findings follow. The existing folder layout can support clearer documentation with corrected guides and an ownership map; the evidence does not justify a large repository reorganization.

## Scope and evidence

This audit follows three readers: a new user mapping a repository, an agent preparing an edit, and a contributor changing Codeweb. It reviews documentation text, commands, contracts and file ownership; it makes no visual-design or live-site assessment.

The [prior-audit inventory](../AUDIT-STATUS.md) establishes what already landed. Existing AC-13–16 code, tests and CLI documentation are treated as uncommitted implementation, distinct from the v0.14.0 package; no package-registry or deployment state was checked.

- [CLI receipts](evidence/execution.json): commands, exit codes, payloads, runtime version and source hashes.
- [MCP receipts](evidence/mcp-execution.json): initialization, initialized notification, tool enumeration and sequential baseline/edit/repair calls.
- [Static inspection](evidence/static-inspection.json): 35 source hashes, checked paths, baseline working-tree status and the limited link scan.
- Commands used disposable JavaScript fixtures with the regex engine. Target functions were analyzed, never executed. `$CODEWEB_ROOT`, `$FIXTURE` and `$AUDIT_TMP` replace machine-specific paths in the receipts.

## Reading-path results

| Reader | What worked | Where guidance broke down |
| --- | --- | --- |
| New user | Four bin help commands exit 0. Mapping creates the graph; an implicit-workspace caller query resolves `alpha`. Doctor reports missing setup with exit 2 and mapped setup with exit 0. | The site moves from npm instructions to `node scripts/...` without establishing a Codeweb checkout or the sample input files. |
| Agent | Explicit baseline → edit → background refresh → diff detects a new cycle. Repair returns a clean structural verdict against the unchanged baseline, through both CLI and MCP. | README/site rules still recommend the legacy after-edit snapshot sequence. Verdict summaries also omit conditions and analysis scope. |
| Contributor | The required gate is present, and source/generated responsibilities can be reconstructed from build scripts and existing contracts. | CONTRIBUTING omits the required gate, gives wrong history-folder paths, and offers no complete map of authored, generated, historical and protected files. |

The local link scan checked 27 inline file links across 22 selected current Markdown files; all targets exist. It excludes anchors, external URLs and reference-style links, so it does not establish universal link health.

## Ranked findings

**All seven findings are verified in the working tree** after three fix batches; see [implementation and receipts](FIXLOG.md). The observations below preserve the original audit state.

| ID | Priority / status | Finding | Implementation target |
| --- | --- | --- | --- |
| DS-01 | High · verified | Prominent edit instructions can advance the comparison baseline | README, site start content, reference workflow |
| DS-02 | High · verified | Verdict summaries promise more than the gate checks | README, reference, site start content; link to precise gate contract |
| DS-03 | Medium · verified | Quickstart silently switches installation contexts | Site start content, reference examples |
| DS-04 | Medium · verified | Contributor instructions omit the required verification path | CONTRIBUTING, links to harness contract |
| DS-05 | Medium · verified | Graph-schema reference omits operationally important fields | Skill schema reference |
| DS-06 | Medium · verified | Current contract prose is stale and escapes consistency checks | SPEC, reference, product-owned prose checker |
| DS-07 | Medium · verified | Repository navigation does not establish document authority and ownership | Contributor map, docs entry point, historical-document pointers |

### DS-01 — Prominent instructions use an unstable comparison point

**Observed:** [README](../../README.md) lines 292–297 and [site start content](../../site/content/start.html) lines 52–60 teach after-edit `refresh {snapshot:true}` followed by `diff {}`. [CLI documentation](../../docs/cli.md) lines 106–145 and the current server instructions instead explain a separate pre-edit baseline.

**Reproduction:** capture a clean map, add a reverse dependency, run an ordinary refresh, then follow the legacy snapshot/diff sequence. `legacy-diff` exits 0 with no new cycle because both snapshots already contain it; `stable-diff-red` exits 1 against the pre-edit baseline.

The MCP check independently waits for a background refresh after a context query. The explicit baseline survives, detects the cycle and verifies its repair. This confirms the local fix; it does not prove a newcomer will discover the right instructions.

**Impact:** agents following the public rules can mistake a clean comparison for successful verification of their edit.

**Proposed fix:** make one canonical pre-edit/after-edit walkthrough and align README, reference, server instructions and authored site content. Label the new sequence as checkout-only until its implementation ships; retain the legacy sequence with its limitations.

**Closure:** execute the published sequence with an intervening refresh and a repair. The cycle must be detected, the baseline hash must stay unchanged, and the repaired graph must pass the checks actually performed.

### DS-02 — Short verdict descriptions omit material conditions

**Observed:** README line 32 and [reference](../../docs/reference.md) lines 67–71 say losing every caller fails the gate. [CI-gate documentation](../../docs/ci-gate.md) distinguishes non-exported orphans from the stricter call-caller preflight.

**Reproduction:** two otherwise identical graph pairs remove the only call edge to a surviving symbol. `lost-callers-exported` exits 0; `lost-callers-nonexported` exits 1. In the edit walkthrough, refresh-based diffs explicitly return duplication as `not-evaluated`.

The site rules also say dependents lists “EVERY user,” while [current CLI analysis documentation](../../docs/cli.md) correctly distinguishes mapped edges from runtime completeness. A complete returned list cannot recover edges the extractor never recorded.

**Impact:** users can infer that an exported symbol, duplication check, or runtime dependency was covered when it was not.

**Proposed fix:** use consistent terms for structural diff, edit preflight and behavioral tests. State the exported-symbol exception, say “mapped dependents,” and make each walkthrough explain `analysis.checks` before interpreting `ok:true`.

**Closure:** examples explain both exported/non-exported outcomes and refresh's skipped duplication check. All prominent verdict summaries agree with the precise contract without implying behavioral correctness or complete runtime coverage.

### DS-03 — The quickstart changes its assumed working directory

**Observed:** [site start content](../../site/content/start.html) first offers npm-based mapping, then its five-minute quickstart runs `node scripts/run.mjs ./my-app` and other repository-relative scripts. It supplies neither a Codeweb clone step nor a fixture containing `myFunction`, `before.json` and `after.json`.

**Reproduction:** executing that first script command from the mapped user fixture exits 1 with `MODULE_NOT_FOUND`. Invoking Codeweb's actual bin by its checkout path succeeds on the same target. This demonstrates missing execution context, not an npm installation failure.

**Impact:** a reader who followed the npm path cannot continue the numbered walkthrough as written.

**Proposed fix:** keep one executable npm-user path using shipped bins, and label source-checkout examples with their required directory. Provide a small fixture and actual snapshot-creation steps; separate schematic reference syntax from runnable tutorials.

**Closure:** start in a disposable user repo without a `scripts/` directory and complete each numbered step. Validate the eventual released-package path separately from checkout-only features.

### DS-04 — Contributor guidance omits the required gate

**Observed:** [CONTRIBUTING](../../CONTRIBUTING.md) lines 7–16 asks for `npm test` and `check-consistency` before a PR. [CLAUDE](../../CLAUDE.md) line 19 and [the harness contract](../../docs/harness.md) require `sh scripts/check`, which also runs spec lint, harness tests and evals.

CONTRIBUTING also says `check-consistency` rebuilds the site. The required gate deliberately excludes the site build/freshness diff; site generation and CI freshness checking are separate steps.

**Impact:** following the contributor guide alone omits required checks and obscures which command can write generated files.

**Proposed fix:** document Node and Python prerequisites, the single required gate, focused checks during development, and the separate site-generation workflow. Link the operator-owned harness boundary so contributors know where product edits belong.

**Closure:** every contributor entry point leads to the same gate, with prerequisites and generated-file steps identified. Preserve the existing harness; this finding requires no harness change.

### DS-05 — The graph-schema example is insufficient for operational use

**Observed:** [graph-schema reference](../../skills/codebase-anatomy/references/graph-schema.md) presents the shared format but omits node `role`/`signature` and metadata `root`/`sources`. The fresh fixture's graph contains all four; the CLI receipt records its observed field keys.

[Extraction](../../scripts/extract-symbols.mjs) emits role and signature data and source stamps; [refresh](../../scripts/refresh.mjs) depends on `meta.root`. Current diff/context tooling also relies on analysis-state metadata that the schema reference does not explain.

**Impact:** an agent or integrator can produce a renderable graph while missing the information needed for source lookup, freshness or role-aware analysis.

**Proposed fix:** distinguish the minimum renderable graph from the operational extractor format. Document required/optional fields, producer ownership, absent-field behavior, source-stamp semantics and refresh invalidation; preserve the existing additive-format policy.

**Closure:** compare the reference against generated fixtures and consumers. A documented operational example supports source lookup and refresh, while the minimum example explicitly states its limitations.

### DS-06 — Stale current contracts evade the prose checker

**Observed:** [reference](../../docs/reference.md) line 245 advertises “all **27** of codeweb's tools.” [SPEC](../../SPEC.md) lines 15 and 81 also says 27; actual MCP enumeration returns 28. SPEC's opening still says Next is deliberately undecided despite the charter's later ruling.

**Reproduction:** `count-scanner-repro` reports 28 tools, confirms reference is scanned and SPEC is not, and returns no problem for the actual reference text. Plain `27 tools` is caught; the formatted, separated phrase is missed.

**Impact:** the gate's “all surfaces aligned” output can coexist with wrong current documentation. The earlier inventory already exposed this class; the new receipt identifies its mechanism.

**Proposed fix:** reconcile current SPEC/reference prose with existing charter decisions and implementation, without inventing acceptance criteria. Extend the product-owned checker for the observed phrase forms and explicitly distinguish current contracts from dated historical records.

**Closure:** checks fail on the actual stale wording and pass on corrected text. Current contracts agree with served capabilities; historical release counts retain their dates and remain unchanged.

### DS-07 — Readers must reconstruct repository ownership

**Observed:** CONTRIBUTING's folder map points to absent root `decisions/` and `specs/`; actual folders are `docs/decisions/` and `docs/specs/`. Root `docs/` contains 13 tracked Markdown files and 12 tracked HTML files, with no `docs/README.md` or architecture guide.

[Site build code](../../site/build.mjs) generates pages/assets into `docs/`, while Markdown guides and historical reviews are authored there. Demo generation is a separate workflow. The README's component-map link does not explain these ownership distinctions.

One historical review's header still points readers to missing root `IMPROVEMENTS.md`; the report moved to `reports/IMPROVEMENTS.md`. Historical findings should stay dated, but their navigation pointers need not remain broken.

**Impact:** readers cannot quickly determine where to edit, which record governs a decision, or whether a recommendation was already implemented.

**Proposed fix:** add an audience-oriented docs entry point and the ownership map below; correct contributor paths and historical navigation. Link new audit status from the existing inventory. Keep current paths unless a later move has a demonstrated benefit.

**Closure:** each major directory has an accurate purpose and edit rule; user, contributor and agent paths reach their authoritative sources. Validate file links and heading anchors separately.

## Proposed repository ownership map

Implemented as the [documentation entry point and ownership map](../../docs/README.md). The original proposal below required no directory moves.

| Area | Purpose and authority | Editing rule |
| --- | --- | --- |
| `CHARTER.md`, `SPEC.md`, `DECISIONS.md` | Product boundaries, acceptance criteria, append-only architectural decisions | Reconcile prose with ratified decisions; retain decision history. |
| `README.md`, `docs/cli.md`, `docs/reference.md`, `docs/ci-gate.md` | Entry point, CLI/configuration, tool concepts, CI setup | Author here; link to canonical behavior instead of restating full workflows. |
| `site/content/`, `site/data/`, site templates/styles | Authored website sources and data | Build through `site/build.mjs`. |
| `docs/*.html`, `docs/assets/` | Generated website output | Change producers and regenerate; do not treat these as authored guides. |
| `scripts/report-template.html`, `docs/demo/` | Report source and separately generated demo | Follow contributor demo/screenshot regeneration instructions. |
| `bin/`, `scripts/`, `scripts/lib/` | Entry points, pipeline/advisors, shared implementation | Product code; behavior changes need relevant verification. |
| `commands/`, `skills/`, `agents/`, `hooks/` | Shipped agent workflows and integration | Keep instructions aligned with the installed capability version. |
| `tests/`, `evals/`, harness paths | Verification | Distinguish product checks from the protected manifest in `docs/harness.md`. |
| `docs/specs/`, `docs/decisions/`, `docs/requirements/` | Detailed plans, decisions and trace records | Label current versus historical; root SPEC remains controlling. |
| `reports/` | Audits, findings and implementation receipts | Date reports; maintain one current status index and per-audit closure table. |
| `bench/` | Instruments, retained receipts and corpus metadata | Preserve provenance; cloned corpus directories are ignored/regenerable. |
| `.codeweb/` | Generated local maps plus deliberate workspace memory | Follow its ignore rules; distinguish disposable maps from tracked annotations/history. |
| `editor/vscode-codeweb/` | Optional editor integration | Follow its own README and packaging workflow. |

## Documentation style for the fix pass

- Lead each guide with the task, prerequisites, working directory and expected result.
- Use numbered steps for runnable journeys; reserve tables for flags, formats and comparisons.
- Explain “graph,” “baseline,” “preflight” and “gate” once, then use those terms consistently.
- State what a result establishes and what checks were skipped at the point of interpretation.
- Keep historical finding IDs and implementation history in linked records when they do not help the current task.
- Give each current guide a canonical source and connect historical audits to their disposition.

The existing four-stage map explanation is not a new defect: README explicitly places optimize between overlap and render. The component map should clarify this relationship, not force a cosmetic stage renumbering.

## Fix sequence and status discipline

1. Resolve DS-01/02/03 together: one version-aware, runnable user/agent journey with accurate verdict interpretation.
2. Resolve DS-04/05/06: contributor gate, operational schema, current contract prose and focused drift checks.
3. Resolve DS-07: documentation navigation and ownership, preserving historical reports and established paths.

For each ID, record `open` → `implemented` → `verified`, with the exact changed revision and closure evidence. Use `deferred` or `superseded` with an explicit reason when appropriate; the preceding audit batches are not automatically reopened.

## Verification and limits

The CLI and sequential MCP receipts establish the local behaviors described above. They do not establish live-client usability, published-package support for uncommitted features, third-party listing status, AST-engine parity, or visual quality.

`sh scripts/check` exited 0 with `ALL CHECKS PASSED`, including all five evals; see [gate evidence](evidence/gate.log). The runtime was Node v26.7.0; this audit does not repeat the CI platform/version matrix.

All local links in this report and its two index pages resolve. This audit authors its report/evidence and navigation links only; it does not change product behavior, the protected harness, or public guides.
