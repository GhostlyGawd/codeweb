# Documentation fixes

## Batch 1 — 2026-09-14

**DS-01, DS-02 and DS-03: verified in the working tree.** Changes remain uncommitted. The audit's original observations and baseline receipts are preserved.

The checkout already contained baseline guidance and an executable cycle walkthrough at the start of this batch. This work extended those changes instead of recreating them; the existing hooks and runtime implementation were preserved.

| Finding | Final change | Verification |
| --- | --- | --- |
| DS-01 | README, reference, CLI guide and site distinguish the unreleased explicit-baseline workflow from npm v0.14.0. Repair keeps the original comparison point. | Existing `first-use-cycle` tests execute the checkout's published cycle commands and verify caller → red → repair → green. The audit's sequential MCP receipt covers background refresh and baseline preservation. |
| DS-02 | Prominent verdict summaries identify the non-exported orphan condition, distinguish preflight, and explain skipped duplication checks and behavioral limits. Site rules and MCP instructions/descriptions refer to mapped users. | Exported/non-exported counterexamples remain in the audit receipts. Walkthrough/copy checks and the complete repository gate pass on the revised wording. |
| DS-03 | The site supplies four complete npm blocks: create/map, query/save, introduce/detect, repair/compare. Checkout examples name their execution context. | Executed the actual site snippets with published npm v0.14.0 in a temporary user directory: map/query succeed; diff exits 1 on the cycle and 0 after repair. |

### Evidence

- [npm execution log](evidence/batch-1/npm-quickstart.log) and [executed script](evidence/batch-1/npm-quickstart.sh). The script records expected diff statuses; its product commands come from the authored site blocks.
- [Checkout walkthrough and copy checks](evidence/batch-1/walkthrough-and-copy.log).
- [Gate-lead and copy checks](evidence/batch-1/gate-lead-and-copy.log).
- [Full required gate](evidence/batch-1/gate.log): `sh scripts/check`, exit 0, `ALL CHECKS PASSED`.
- [Revision fingerprints](evidence/batch-1/verification.json) identify the exact working-tree files verified.

The site was regenerated from its authored source. `git diff --check` passed; the npm quickstart, checkout walkthrough and rules-snippet anchors each occur once in the generated page.

Browser verification subsequently completed with Playwright and Chromium at 1440 × 1000 and 390 × 844. All six screenshots were inspected. The page has no horizontal overflow, console errors or failed requests; all three documentation anchors land below the sticky header.

Verification exposed headings hidden by the sticky header. A scoped scroll margin fixes their landing positions; the unreleased notice now follows the rules heading so direct links retain it. The site was rebuilt and the full gate passed again.

[Browser results](evidence/batch-1/browser/results.json) · [desktop quickstart](evidence/batch-1/browser/desktop-npm.png) · [mobile quickstart](evidence/batch-1/browser/mobile-npm.png) · [mobile rules](evidence/batch-1/browser/mobile-rules.png) · [post-fix gate](evidence/batch-1/browser/gate.log).

This batch makes no claim about deployment or publication; the new baseline API remains explicitly labeled unreleased.

DS-04–07 remain open: contributor verification, schema coverage, current-contract/checker drift, and repository navigation. Updating a touched reference's workflow does not close its separate count/checker finding.

## Batch 2 — 2026-09-14

**DS-04, DS-05 and DS-06: verified in the working tree.** DS-07 remains open. No protected harness files or acceptance criteria were changed.

| Finding | Final change | Closure evidence |
| --- | --- | --- |
| DS-04 | Contributor setup names Node, Python, Git and shell prerequisites; the change loop requires `sh scripts/check`. Focused checks, generated-site work and protected harness ownership are distinguished. Test-suite guidance links to that workflow; incorrect history-folder paths are corrected. | File links resolve; copy checks and the complete documented gate pass. |
| DS-05 | Schema documentation distinguishes minimum rendering from operational source access. It documents roles, parsed signatures, source roots/stamps, parser provenance, missing-field behavior and refresh invalidation; a runnable example generates real metadata. | Executed the actual documented block: source body, signature, role, stamps and refresh verified. Minimum JSON renders, reports source unavailable and refuses refresh with exit 2. |
| DS-06 | SPEC reflects the ratified Next decision and distinguishes built from released. SPEC/reference counts agree with 28 served tools; canonical interface ownership points to the manifest/server. The prose checker includes SPEC and recognizes the observed Markdown/HTML formatting and Codeweb possessive phrasing. | New tests failed before the fix and pass afterward. Fixtures catch stale current SPEC/reference counts while retaining dated audit counts unchanged. |

Evidence: [failing count regressions](evidence/batch-2/count-regressions-red.log), [passing focused checks](evidence/batch-2/focused-green.log), [schema example execution](evidence/batch-2/schema-examples.json), [full gate](evidence/batch-2/gate.log), and [verified source hashes](evidence/batch-2/source-hashes.json).

Final `sh scripts/check`: exit 0, **1,135 product tests passed, 7 skipped, 0 failed**, and all five evals passed. `git diff --check` and contributor/schema file-link checks pass.

The checker covers the reproduced count forms; it is not a general natural-language claim verifier. Historical audit and release records remain outside the current-count sweep. All changes remain uncommitted.

## Batch 3 — 2026-09-14

**DS-07: verified in the working tree. All seven audit findings are now verified.**

[docs/README.md](../../docs/README.md) now provides task-based reading paths, document authority, repository ownership, and the distinction between authored guides and generated pages. README, CONTRIBUTING and the tool reference link to it.

Historical review headers point to the implementation inventory, and the broken root `IMPROVEMENTS.md` link now reaches its actual location. The reports index identifies the scope of each implementation log. Historical findings and their measurements remain preserved; no files were moved.

Verification:

- [Navigation receipt](evidence/batch-3/navigation.json): 137 local inline links and GitHub-style heading anchors passed. Historical reviews were checked at their navigation headers; external URLs and reference-style links were outside this check.
- [Required gate](evidence/batch-3/gate.log): `sh scripts/check` exited 0 with `ALL CHECKS PASSED`, including all five evals.
- `git diff --check` passed. No protected harness files changed.

This batch changes Markdown navigation only, so it does not require site generation or another browser pass. Changes remain uncommitted; a final review of the combined runtime, documentation and evidence diff still precedes commit preparation.
