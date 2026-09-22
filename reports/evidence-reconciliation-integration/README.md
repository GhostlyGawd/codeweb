# Evidence reconciliation: integration verification

Integrated from the unreleased V1 work on `codex/release-0.15.0` onto `main` at `2fb533f38ec9d69ecf4ab4a82d1dbe17983983aa`. The original workspace, including unrelated untracked files, was left intact.

## Behavior

Before an edit, `codeweb_context` can capture a task-owned receipt for one mapped symbol. After the edit, `codeweb_review` can compare the exact recorded caller, callee and impact evidence with a coherent private source snapshot. It reports new, removed and changed witnesses, and carries detected unanswered questions. Historical pages are immutable and byte-bounded. The result states separately when the normal structural review used a different graph.

The merge preserves the current main-branch review's changed-file analysis and HTML output. It also preserves explicit-output file-target discovery introduced after the original feature implementation. Evidence capture uses the documented directory-root regex snapshot profile; it does not change ordinary file mapping.

## Local checks on the integration branch

- `sh scripts/check`: **pass**. Spec lint: 33 live ACs, all built and pinned. Python: 45 passed. Node: 1,211 passed, 60 skipped, 0 failed (1,271 total). Consistency and five golden evals passed.
- Four focused evidence suites: 58 passed.
- `git diff --check`: pass.
- Offline package smoke: packed the local tarball, installed it in a clean prefix with optional dependencies omitted, mapped a temporary repository, captured a receipt, added a caller, reconciled the evidence and paged the stored result. Capture was `captured`, review was `changed`, and the historical page exposed both new caller/impact relationships. Required package dependencies remained empty.

The local test environment used Node 26. GitHub CI will supply the repository's Linux/Windows and Node matrix result for this branch. No package publication or site deployment was performed.

## Limits

The evidence mode is opt-in. The private snapshot deliberately uses native regex extraction with no ctags, AST or shared cache; its scope is labeled beside the existing graph's review result. It does not run the target code or establish behavioral correctness. Source files may have changed after a historical page was written, so pages do not claim present currency.

A prior single generated task on the original branch showed additional overall time and stdout bytes when capture, review and one delta page were counted. No token savings or improvement in edit quality is claimed. A real maintainer task remains the next product test after the integration is reviewed.

## CI correction

The first PR run exposed three integration issues. The changelog source needed its generated site page. The self gate mapped a false file cycle through a generic helper name and treated two unrelated error constructors as duplication; specific names and an error factory removed those reported regressions without changing gate rules. Windows treated different casing of the same canonical workspace path as distinct; record checks now compare normalized paths according to the host filesystem. The full local gate and self gate passed after these changes. Cross-platform CI is the final verification for this correction.
