# Integration with product clarity

2026-09-14 · PR #93 incorporates `origin/main` at `2e20749`, including product-clarity PR #91.

The integration preserves the ratified product identity, client selector, package setup/doctor/review/gate subcommands, portable change-review HTML, report-only gate behavior and current public demo. It also preserves stable baselines, bounded gate evidence, diagnostics and the documentation audit fixes.

## Acceptance-criterion reconciliation

The branches independently allocated AC-13 onward. Main's existing AC-13–20 stay unchanged. This branch's new criteria move to unused IDs, with corresponding test names and Python pins updated:

| Original branch ID | Integrated ID | Behavior |
| --- | --- | --- |
| AC-13 | AC-21 | Actionable gate comments and truthful source links |
| AC-14 | AC-22 | Context source evidence and uncertainty |
| AC-15 | AC-23 | Stable edit baselines and validation |
| AC-16 | AC-24 | Lightweight installation/map diagnostics |
| AC-17 | AC-25 | First-use baseline and repair walkthrough |
| AC-18 | AC-26 | Shipped hook metadata |

Earlier receipts retain their original IDs and reviewed hashes as historical evidence.

## Overlapping interfaces

- `codeweb doctor` retains the full setup check: runtime, MCP initialization, fresh graph, optional supplied client configuration and unverified editor connection. Its JSON additionally includes installation/map diagnostics.
- `codeweb --doctor` and explicit-target script diagnostics retain the lightweight read-only path. Imports expose diagnostic functions without running the CLI.
- Review preserves main's analysis status, reasons, provenance, boolean `analysis.checks` and HTML output. Added per-check descriptions use `analysis.checkStatus` to preserve the existing boolean contract.
- The gate uses one completed diff payload for terminal and Markdown output, enriching it with bounded evidence and commit links only when the analyzed checkout is clean and unchanged.
- The setup page keeps main's client selector and copy feedback, plus the version-labeled npm and checkout walkthroughs. Agent rules retain stable baselines through repair.

## Validation

The combined local gate passed: 1,180 tests passed, 7 skipped, all five evals passed. Chromium verification exercised all five client recipes and clipboard feedback, keyboard navigation, mobile layout, report inspector/finding actions and portable change-review HTML. All fourteen captured screenshots were inspected.

Generated site output was rebuilt. Protected harness files were not edited. GitHub CI on the pushed integration commit remains the merge gate; local verification does not bypass it.
