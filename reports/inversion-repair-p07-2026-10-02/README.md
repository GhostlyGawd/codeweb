# P-07 inversion correctness repair

The seven audit issue families have a verified source repair candidate in [draft PR #102](https://github.com/GhostlyGawd/codeweb/pull/102), source `3077eebbf9d1f2421001c8d1872c3ede699f8abb`. The exact candidate source is present in the primary checkout. Main merge and npm release remain separate; published npm remains 0.15.0.

## Changes and traceability

| Audit finding | Result |
| --- | --- |
| INV-F01 | Finished lexical blocks no longer suppress an outer call; the live target has its invoking consumer and no deletion proposal. |
| INV-F02 | JSX literal text is excluded from declaration discovery; the phantom function/deletion proposal is absent. |
| INV-F03 | Parameters, callbacks, catch variables and nested binding patterns suppress unrelated same-named functions. |
| INV-F04 | Namespace access respects exports, local export aliases and ambiguous stars; private members remain unresolved with diagnostics. |
| INV-F05 | Simple immutable aliases and short chains expose invoking consumers; unsupported direct callable aliases retain limits. |
| INV-F06 | Literal decorators contribute reference dependencies from affected definitions; factories remain qualified. |
| INV-F07 | Informational CLI/MCP results retain useful partial facts with typed scope/completeness; action gates stay inconclusive. |

The original [audit packet](../inversion-audit-2026-10-02/README.md) remains unchanged. [OBSERVATIONS.json](OBSERVATIONS.json) preserves generic observed outputs; [SOURCE-HASHES.json](SOURCE-HASHES.json) identifies the exact source. Product criteria AC-37/38 and the proposed P-07 requirements connect findings to the delivered checks.

Verification also found a pre-existing callback extent problem that made later calls appear outside their actual function. Body extents now count balanced callback braces and do not end on a semicolon inside a call argument. Its positive and negative controls are in the new source test suite.

## Verification and limits

The full gate passed 1329 product checks, seven skips, 50 Python checks and five evals. The public audit runner reports zero unmet primary expectations across 16 observations and runs all eight CLI/MCP pairs. The repository structural gate passes. Requested engine modes share code; independent Babel/runtime oracles verify source facts rather than establishing universal parser completeness.

The final local tarball runs without optional dependencies. Its eight primary cases and actual partial CLI/MCP query pass; the new runtime helper ships and matches the verified source. Required dependencies, protected harness and the user's existing local history edit are unchanged. [VERIFICATION.json](VERIFICATION.json) and [CI-CHECKS.json](CI-CHECKS.json) record all ten passing final-source CI checks, including Windows, no-AST, benchmarks, consistency and the structural gate.

The unchanged internal benchmark budget passes at 14301 approximate tokens over twelve calls. Diagnostic answers now carry three samples, exact total/omitted counts and pointers to the saved graph evidence. [BENCH-SUMMARY.json](BENCH-SUMMARY.json) distinguishes this bounded output measurement from actual developer benefit. Initial CI token-budget and generated-page failures were corrected and retained privately.

[NATIVE-SUMMARY.json](NATIVE-SUMMARY.json) records the actual Codex edit/query/review fixture, its scope and one recovered invalid request. Native runs used the earlier tested source head; final artifact/protocol checks cover the later compact-warning changes. Claude remains pending. No ordinary adoption, causal effort saving, retention, human outcome or paid demand is inferred.

## Preservation

Raw runs, native events, first failures, package bytes and hash manifests are retained in private evidence storage outside the repository. This packet publishes only synthetic cases and explicit summary derivatives. No personal Mac configuration, host inventory, authentication or raw correspondence is included. No independent agent review is claimed.
