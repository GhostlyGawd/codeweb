# Product clarity task and verification record

Date: 2026-09-05. Baseline: `16d3a9bebbf675ef8ccdad56cde73aa5df40fee7` (0.14.0).
Authority: user requested a specification, decomposed tasks, independent validation, implementation, verification, and PR merge.
The controlling acceptance criteria are AC-13 through AC-20 in `SPEC.md`.

## Tasks

| ID | Task | AC | Dependency | Owner | Status |
|---|---|---|---|---|---|
| T1 | Write the contract and record scope and evidence limits | All | None | Orchestrator | Complete; independently approved |
| T2 | Independently validate scope, interfaces, tests, and task coverage | All | T1 | Requirements and architecture reviewers | Complete; contract fixes applied |
| T3 | Record the user-authorized charter amendment; align identity and claims; simplify site setup and readable styling | 13, 14 | T2 | Public experience agent | Implemented; focused tests pass |
| T4 | Add package setup, local diagnostics, and gate entry; add explicit report-only policy | 15, 19 | T2 | Setup and gate agent | Implemented; focused tests pass |
| T5 | Expose change review through the package and add supporting HTML and analysis-state evidence | 16 | T2 | Change review agent | Implemented; focused tests pass |
| T6 | Improve finding decisions, source/task actions, and exception guidance in the existing report | 17 | T2 | Report agent | Implemented; focused tests pass |
| T7 | Refresh pinned demo, inspect screenshots, and regenerate site assets | 18 | T3, T5, T6 | Orchestrator | Complete; five real frames inspected and stamped |
| T8 | Add dated comparison, reproducible demo, recording script, and honest pilot/case-study protocols | 20 | T2 | Evidence agent or orchestrator | Implemented; focused tests pass |
| T9 | Run focused checks, all acceptance commands, full harness, and browser checks; fix findings | All | T3–T8 | Orchestrator and reviewers | Focused and browser checks pass; final CI pending |
| T10 | Independently review final diff and acceptance coverage; resolve all blocking findings | All | T9 | Independent reviewers | Code approved; all reported blockers resolved |
| T11 | Create PR, verify required checks on its final commit, merge, and verify merge result | All | T10 | Orchestrator | In progress; final CI and merge pending |

## Validation rules

- Each behavior change has a failing test before implementation and a passing test afterward.
- Existing protected harness files remain unchanged. Run `sh scripts/check` as the repository gate.
- Run the AC check commands verbatim and retain summaries. Mark ACs built only with Python test pins and passing behavior checks.
- Test the npm package from a temporary install and fixture repository; do not use source-checkout paths to prove package setup.
- Run all four subcommands from the installed package. Test reserved directory names through explicit paths and the `--` delimiter.
- Test change review with deletions, supplied invalid baselines, missing analysis data, and a caller outside the edited file.
- Test report-only with both a real regression and a setup failure. Verify the preserved verdict and distinct exit behavior.
- Verify setup selection, copy feedback, finding actions, and change review in the browser. Inspect desktop and narrow layouts and keyboard access.
- Re-run the site build and require no uncommitted generated drift. Retain demo source and engine provenance.
- Independent reviewers must not approve their own implementation. The orchestrator owns integration and final acceptance.
- Required CI must pass on the final PR head. Do not bypass branch protection or merge with unresolved blocking findings.

## Scope and completion limits

This is the implementation release for the product and brand review. Human interviews, actual maintainer decisions, and retention measurements require real participation and are not machine-verifiable release claims.
The release supplies runnable examples and honest protocols for that follow-up; it does not claim those studies have happened.

The existing scheduled comparison remains unchanged. No new accounts, telemetry, runtime model calls, hosted billing, language support, or release publication are included.

## Independent spec review

- Requirements reviewer approved task coverage and runnable criteria; requested explicit subcommand/path disambiguation.
- Architecture reviewer approved the scope subject to explicit diagnostic fields, analysis states, compatibility rules, and a dated charter amendment.
- The orchestrator added those contracts before implementation. Spec lint passes with 20 live criteria and 12 existing built criteria.
- Protected harness changes are excluded. Existing local browser-test failures require environment repair, not weaker checks.

## Verification evidence

- Behavior tests were run before implementation and failed on the absent features.
- Combined focused acceptance run: 39 passed, zero failed or skipped, including offline package setup, doctor, review JSON/HTML, and both gate modes.
- Independent final review found three defects: report-only could suppress a crashed diff, baseline stamps could imply complete analysis, and new review details were unbounded. Regression tests reproduce all three; fixes passed independent review.
- Independent review passed gate (6 tests), change review (9 tests), and the runnable evidence workflow (5 tests).
- The first integrated product run passed the packed offline installation, including all four installed subcommands. Its remaining failures identified caption/navigation drift, pending regenerated screenshots, and missing local Chromium. Caption/navigation fixes are applied.
- The new read-only product UI workflow runs the existing browser checks with an explicitly installed development browser, then captures setup, report, and change-review evidence. Final CI and the final browser rerun are pending.
- The human pilot and maintainer case study are supplied as protocols, not claimed results.

## Final review and merge

Independent architecture review approved all code after the source-pin edge case was fixed. Protected harness paths have no changes.
Draft PR: https://github.com/GhostlyGawd/codeweb/pull/91. Final head checks and merge are recorded in the PR, so this document does not claim a merge before GitHub confirms it.

## Browser and demo evidence

- Browser run https://github.com/GhostlyGawd/codeweb/actions/runs/33937357302 passed the existing report-scale checks and all 19 UI checks. It tested five client clipboard round trips, copy-failure selection, keyboard navigation, home/setup/review at 1440 and 375 pixels, finding task copying, and five real report captures.
- The orchestrator inspected the five report captures and the desktop/narrow review and finding views. `assets/screens/capture-receipt.json` records the template, source, CI run, and image hashes. The screenshot stamp was written only after inspection.
- Image review found a selected-client command mismatch on setup. Both setup and doctor examples now follow all five client choices; regression tests cover the exact commands and paths. A final browser run checks that correction.
- Two pinned-source extractions produced byte-identical graph and standalone HTML, including with conflicting local experiment settings. The helper explicitly disables ctags, clears experiment overrides, validates all untracked source files, and publishes only graph and HTML.
- Rebuild the demo with `node scripts/refresh-demo.mjs --source <checkout-at-the-manifest-Axios-commit>`, then `node site/build.mjs`. Re-capture and inspect report screenshots before stamping any future template change.
- Current brand raster art was inspected after the old headline, tool count, and numerical performance claims were removed.
