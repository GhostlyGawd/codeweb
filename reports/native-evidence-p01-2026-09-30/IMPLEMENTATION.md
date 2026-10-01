# P-01 implementation handoff — September 30, 2026

The similarity CLI now reports no candidates in available mapped bodies without asserting
novelty or safe writing. Positive output offers source candidates for comparison. CLI text
and the related MCP tool description name mapped non-test function/method scope, missing
bodies/unmapped code, the existing 15% shingle threshold and first-400-line body cap, and
the uncapped candidate. Similarity does not establish equivalent behavior, novelty or safe
reuse; source inspection and relevant tests remain necessary.

Human output retains exact candidate source locations and now names omitted candidates and
a usable `--k <total>` expansion. Thresholds, scoring, sorting, sidecar selection, source
reads, JSON fields/counts and success/error exits were not changed. No structural verdict,
test-neighbor hint, historical coverage or executed-test result was relabeled.

## Candidate and files

Isolated checkout: `/var/folders/3r/mm394ldj6fx82vpdgz3tmwj00000gp/T/codeweb-p01-3tylipwm`.
Branch: `codex/p01-honest-similarity-output`. Base/HEAD:
`fd3b637e9ad4e1f7265799298761bc1ee83fe76c`. No commit, GitHub action or release was made.

- `scripts/find-similar.mjs`: human output and explanatory comments only.
- `scripts/mcp-server.mjs`: this tool's description and shared threshold/cap imports only;
  name, arguments, schema and transport behavior are unchanged.
- `SPEC.md`: central executable AC-34, initially `next`, now `built`; broader readiness
  explicitly remains pending.
- `tests/find-similar-output.test.mjs`: seven executable controls for empty/supported-zero/
  incomplete maps, conflicting contracts, intentional same-file duplication, exact source
  opening, different-syntax equivalents, missing bodies, cap/truncation/expansion,
  ordinary failures and MCP discovery/transport.
- `tests/test_ac_pins.py`: product-layer AC-34 pin required by current specification lint.

Reports in this directory retain the regression-before run and final focused checks;
`VERIFICATION.json` records exact candidate file hashes and check results. The protected
harness, dependencies and original dirty checkout were not modified.

## Verification and applicable NED scope

Tests were written before implementation. [REGRESSION-BEFORE.json](REGRESSION-BEFORE.json)
records exit 1: six new checks failed against the old safety/reuse wording and absent human
limits, while the ordinary error control passed. The final
[FOCUSED-TESTS.json](FOCUSED-TESTS.json) records 28 tests passed, none failed or skipped.
This includes the existing randomized independent shingler/ranking oracle, true-count/
truncation contract, deterministic output, live/sidecar parity, structural comparison and
MCP budget/staleness checks. The central AC check's three suites are included in this run.
[SPEC-LINT.json](SPEC-LINT.json) records 34 live ACs, all built and test-pinned.
[AC-PIN.json](AC-PIN.json) and [DIFF-CHECK.json](DIFF-CHECK.json) pass.

| Case | Modified similarity surface result | Broader limit |
| --- | --- | --- |
| NED-01 | Pass: bounded empty/supported-zero/incomplete output; JSON zero results and ordinary exit-2 failures retained | Other empty/green surfaces pending P-02 |
| NED-03 | Pass: conflicting-contract similar bodies remain comparison candidates; different-syntax equivalent/missing-body/cap controls retain prior scoring | No semantic equivalence, safe reuse or host readiness established |
| NED-06 | Pass for preservation: no new structural/test verdict or provenance label; scoring/JSON/error contracts retained | Failed/skipped/stale/current test and invalid-oracle matrix pending P-02/full gate |
| NED-07 | Pass for similarity: exact source opening, same-file candidates, intentional duplication, threshold/cap uncertainty and omitted-count expansion verified | Actual task relevance, consumer coverage and host delivery pending P-02 |

The full `sh scripts/check` gate and independent review are owned by the root session and
remain pending at this implementation handoff. No global NED, release/host readiness,
customer value, behavioral safety or coordination benefit is claimed. Source is frozen
for the independent reviewer; any requested revision must be assigned back explicitly.
