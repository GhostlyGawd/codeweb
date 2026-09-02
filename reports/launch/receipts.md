# Claim → receipt — the launch drafts

Every number in `show-hn.md` and `github-release-discussion.md`, and the committed artifact that
produced it. `tests/launch-drafts.test.mjs` re-derives every value in the "Receipt records"
column from the artifact on every `sh scripts/check`, so a re-run that moves a value fails the
build rather than leaving a stale figure published.

**Freshness rule.** Every benchmark artifact cited here was regenerated during this mission
window and is committed. The six study receipts were re-run on 2026-08-24 (`5bca205`, "repair the
four broken instruments") and the budget receipt with them; all carry a `generatedAt`/`ranAt`
stamp after 2026-08-17. Artifacts last regenerated *before* that window are deliberately not
cited by these drafts — see `README.md` for the three figures that rule excludes.

## Benchmark numbers

| # | Claim in the drafts | Receipt records | Artifact | Stamp |
|---|---|---|---|---|
| 1 | 32 pre-registered checks | 32 entries across the six receipts' `perHypothesis[]` | all six `bench/results/*.json` below | 2026-08-24 |
| 2 | all 32 pass | every `perHypothesis[].passed === true` | all six | 2026-08-24 |
| 3 | 497,864 comparisons | sum of `perHypothesis[].comparisons` | `bench/results/correctness-query.json` | 2026-08-24 |
| 4 | 0 disagreements | `perHypothesis[].value === 0` for all five families | `bench/results/correctness-query.json` | 2026-08-24 |
| 5 | 6 repositories, pinned by SHA | `perHypothesis[0].value.perRepo.length` = 6 | `bench/results/determinism.json` | 2026-08-24 |
| 6 | 20 runs per repo, 1 digest each | `H1.value.R` = 20; `distinctRawDigests` = 1 for every repo | `bench/results/determinism.json` | 2026-08-24 |
| 7 | 360 incremental-vs-full comparisons, 0 mismatches | `H2.value.T` = 360, `canonMismatches` = 0 | `bench/results/determinism.json` | 2026-08-24 |
| 8 | 10,000 simulated edits, 0 wrong verdicts | `T.H5` = 10000, `H5.value` = 0 | `bench/results/edit-safety.json` | 2026-08-24 |
| 9 | 3,215 symbols | `H17.value.graph.symbols` | `bench/results/performance.json` | 2026-08-24 |
| 10 | 51.89 ms worst p95 | `H17.value.worstP95Ms` | `bench/results/performance.json` | 2026-08-24 |
| 11 | 29.08 ms Node startup | `H17.value.decomposition.nodeStartup.medianMs` | `bench/results/performance.json` | 2026-08-24 |
| 12 | scaling exponent 0.342, CI upper 0.5702 | `H14.value.slope`, `H14.value.slopeHi` | `bench/results/performance.json` | 2026-08-24 |
| 13 | 1,573 symbols / 5,001 edges on itself | `pipeline.symbols`, `pipeline.edges` | `bench/results/benchmarks.json` | 2026-08-24 |
| 14 | 1,178 ms cold / 143 ms warm | `pipeline.coldMs`, `pipeline.warmMs` | `bench/results/benchmarks.json` | 2026-08-24 |
| 15 | 11 auxiliary checks | `perHypothesis.length` = 11 | `bench/results/auxiliary.json` | 2026-08-24 |
| 16 | 28 tools, CLI parity | `A-MCP.value` = "27/27 parity; conformance=true; toolsList=28" | `bench/results/auxiliary.json` | 2026-08-24 |
| 17 | Type-2 clone recall 1.0 structural vs 0.0 lexical | `details.H10.structuralRecallMean` / `.lexicalRecallMean` | `bench/results/detection-accuracy.json` | 2026-08-24 |
| 18 | dead-code safe-tier precision 1.0 | `H13.value.safePrecision` | `bench/results/detection-accuracy.json` | 2026-08-24 |

## Non-benchmark facts

| # | Claim in the drafts | Receipt |
|---|---|---|
| 19 | 13 languages | `site/data/product.json` → `languages` (length 13); gated by `tests/lang-surfaces.test.mjs` |
| 20 | 28 MCP tools | `scripts/lib/tool-specs.mjs` + `scripts/mcp-server.mjs`; gated by `node scripts/check-consistency.mjs` ("28 tools, all surfaces aligned") |
| 21 | v0.14.0 | `package.json` → `version`; live on npm and as a GitHub release |
| 22 | Node >= 22 | `package.json` → `engines.node` |
| 23 | MIT, zero required dependencies | `package.json` → `license`, empty `dependencies`; H16 in `bench/results/performance.json` proves the pipeline runs on an empty `node_modules` |
| 24 | €10 per active author / month, active = committed in the trailing 90 days | `CHARTER.md` → "The boundary: free forever / Teams", ratified 2026-08-17 (price intent, not a live offer) |

## What the drafts deliberately do not claim

Binding the LAUNCH-KIT `dontClaim` list and `site/data/product.json` → `dontClaim`. Each is
asserted absent by `tests/launch-drafts.test.mjs`.

| Barred | Why |
|---|---|
| `126×` (any framing) | `bench/results/oracle-ab.json` predates the mission window (2026-07-19) |
| Any sponsorship / cost / funding premise | CHARTER **C7** — ruled fabricated 2026-07-25 |
| "Two modes" external-review billing | CHARTER **C3** — demoted to a feature note |
| Enterprise price or SLA language | CHARTER **C4** — price and SLA claims dropped |
| A named rival product beside a number | `product.json` `dontClaim`: no head-to-head against tools we cannot reproduce |
| "finds all clones" / "100% recall" | `product.json` `dontClaim` — body-confirmed overlap only |
| "replaces human review" | `product.json` `dontClaim` — structural pre-flight, not a semantic verdict |
| "agents provably edit better" | `product.json` `dontClaim` — H18 was a null, published as one |
| The v0.9.0 pilot recall figures | True and published on the site with their v0.9.0 frame; stripped of it in a post they would read as a v0.14.0 claim |
| "32 / 33" | The 33rd (H7) was retired with the feature it measured; the fresh receipts carry 32 |

## Reproducing every number

```sh
node bench/run-all.mjs        # the six study receipts (~9.5 min)
npm run bench:all -- --check  # the standing budgets, enforced without rewriting the receipt
sh scripts/check              # includes tests/launch-drafts.test.mjs
```
