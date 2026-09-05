# SPEC — codeweb

Date: 2026-07-26; product clarity implementation added 2026-09-05.
Written by 142 · Spec the Product (All Build Goal Prompts, stage 2/4 re-run after the
harness install; supersedes the null report preserved at `reports/SPEC.md`). Sources: the
ratified `CHARTER.md` (2026-07-25) and shipped behavior only — v1 codifies what the product
already promises publicly, so every AC below is `built` and pinned (`tests/test_ac_pins.py`).
The operator selected the product clarity work on 2026-09-05 after the product and brand
review. Its acceptance criteria are appended below; existing identifiers remain stable.

## Job

**"See what your AI edits affect."** Your agents inspect callers and dependencies before an edit,
then check new structural findings afterward. The local graph supplies bounded answers through
MCP; the tool list is defined in `scripts/mcp-server.mjs`. The supporting report explains those results.

## Non-goals

From the charter's ratified list — scope creep dies here:

- No resident daemon (`docs/decisions/fastpath-daemon.md`, NO-GO).
- No embeddings or vector search — `find` stays deterministic-lexical.
- No LLM inside the runtime analysis path.
- No accounts, telemetry, or license keys in the local product, ever.
- No VS Code Marketplace publish (the .vsix still builds per release). *(Amendment A1,
  2026-08-17: the hosted "Teams" build is green-lit and its distribution trigger superseded,
  so that half of this line is gone; non-goal 6 was re-examined the same day and stands.)*
- No new first-class language until its parser grammar clears
  `scripts/grammars/PROVENANCE.md` provenance.
- The human-facing map stays a supporting view of the findings — never the lead.
- The parked A/B experiments run only on an explicit operator go.

## Buyer and the first dollar

The user is the agent-heavy individual developer working their own repo; everything local is
free forever (MIT — charter invariant). There is deliberately no paywall and no license key:
the wired money path is **GitHub Sponsors** (the README Support section and the site support
page link it), sponsorship simply supports the project, and sponsors get featured README
placement — no cost claims (charter C7 ruling). The team lead is the secondary audience,
reached through the gate's PR comments; the paid tier they are offered is **codeweb Teams**,
a separate hosted service green-lit on 2026-08-17 (amendment A1) and priced as intent at ~€10
per active author per month. The boundary holds either way: billing lives only in that
service, never in this repo, so the local product keeps taking no accounts, no telemetry, and
no license keys. Brief 144's first-dollar lens verifies the sponsor doorway exists and
resolves; it cannot verify a stranger's card, and this spec claims nothing more.

## Acceptance criteria

Grammar (parsed by `scripts/spec_lint.py` — one line per AC):
`- **AC-n** — <criterion> | check: ` `` `<command>` `` ` | status: next|built|dropped`

The structured trace and verification companion is
`docs/requirements/codeweb-product-requirements.yaml`. `SPEC.md` remains the
controlling product specification.

- **AC-1** — the full product suite passes from a bare, dependency-free checkout | check: `npm test` | status: built
- **AC-2** — every public claim surface agrees with package.json and the charter identity line | check: `node scripts/check-consistency.mjs` | status: built
- **AC-3** — the product installs and runs with zero required dependencies | check: `node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf8'));process.exit(p.dependencies&&Object.keys(p.dependencies).length?1:0)"` | status: built
- **AC-4** — the gate can go red: prove-red plants a failing canary and the gate catches it | check: `sh scripts/check --prove-red` | status: built
- **AC-5** — the npm tarball ships the product only: no repo-only trees, no harness files | check: `node --test tests/package-shape.test.mjs` | status: built
- **AC-6** — every shipped bin answers --help with exit 0 | check: `sh -c 'for b in bin/*.mjs; do node "$b" --help >/dev/null || exit 1; done'` | status: built
- **AC-7** — all golden eval cases pass | check: `python3 evals/run.py` | status: built
- **AC-8** — imported JSON files are file-level map nodes: JS/TS imports of .json resolve, stamp staleness, and feed the pre-edit importer card | check: `node --test tests/json-support.test.mjs` | status: built
- **AC-9** — after an edit, an MCP-only client can complete the gate loop: refresh with snapshot:true preserves the prior graph as graph.prev.json and diff defaults before:"prev", after: the discovered graph | check: `node --test tests/mcp-snapshot-diff.test.mjs` | status: built
- **AC-10** — codeweb_dependents returns the union answer (call, import, inherit, test, ref) over MCP with true totals within budget | check: `node --test tests/mcp-dependents.test.mjs` | status: built
- **AC-11** — spawned advisor answers carry the call-time staleness verdict, and overlap-independent advisors auto-refresh like the orient family | check: `node --test tests/mcp-staleness-parity.test.mjs` | status: built
- **AC-12** — agent-fallback graphs carry their meta.engine provenance and the brief caveats agent-built maps | check: `node --test tests/agent-graph-label.test.mjs` | status: built
- **AC-13** — current public identity uses a shared evidence-scoped headline and descriptor; token-cost claims identify the measured context-size comparison and gate copy states its limits | check: `node --test tests/product-clarity-copy.test.mjs` | status: built
- **AC-14** — setup presents one client-specific full-width recipe with copy feedback, a package-first workflow, and an explicit source-checkout alternative | check: `node --test tests/product-clarity-setup-page.test.mjs` | status: built
- **AC-15** — package setup and diagnostics provide a reversible client recipe, verify the local server and graph state, and distinguish configuration evidence from an editor connection | check: `node --test tests/product-clarity-setup.test.mjs` | status: built
- **AC-16** — a package change-review command combines changed symbols, affected callers, structural findings, recorded coverage, and analysis limits in JSON and a supporting HTML report | check: `node --test tests/product-clarity-review.test.mjs` | status: built
- **AC-17** — report findings distinguish confidence from action priority, caution on trivial duplicates, expose source and an agent task, and reuse existing exception records | check: `node --test tests/product-clarity-findings.test.mjs` | status: built
- **AC-18** — the public demo records a pinned source commit and current engine, generated report and screenshots match the template, and visual identity remains consistent | check: `node --test tests/product-clarity-demo.test.mjs tests/brand-sync.test.mjs` | status: built
- **AC-19** — the package PR gate and Action support explicit report-only use that retains a failing finding verdict while still failing setup or analysis errors | check: `node --test tests/product-clarity-gate.test.mjs` | status: built
- **AC-20** — a dated qualitative Graphify comparison and reproducible demonstration and pilot protocols distinguish existing evidence from unmeasured outcomes | check: `node --test tests/product-clarity-evidence.test.mjs` | status: built

Pins live in `tests/test_ac_pins.py` (`test_ac_<n>_...`); pins are cheap wiring witnesses —
the `check:` commands above are what brief 144 runs verbatim.

## Interfaces

### Product clarity release contract — 2026-09-05

The implementation tasks and validation record are in `docs/specs/product-clarity-tasks.md`.
The user requested independent specification review, implementation, verification, and PR merge.

- Preserve local operation, MIT licensing, no telemetry, no target-code execution, and zero required dependencies.
- Preserve existing MCP tools and mapping flags. Reserve bare `setup`, `doctor`, `review`, and `gate` as CLI subcommands.
- Map directories with reserved names through `./review`, an absolute path, or `codeweb -- review`; document and test this disambiguation.
- Use `See what your AI edits affect.` as the shared headline and `Structural checks for AI code changes.` as the descriptor.
- Keep individual developers as the primary audience. Small teams remain secondary; the graph supports the agent workflow.
- Keep the square shapes and lime accent. Improve text size, sentence case, navigation, and supporting-text contrast within that system.
- Keep historical research and decisions intact. Label historical claims and scope new claims to their evidence.
- Do not modify the protected verification harness, release credentials, branch protections, billing, or marketplace publication.

#### Setup and diagnostics

- `codeweb setup --client <client>` prints a project recipe; it does not overwrite existing user configuration.
- Support Claude Code, Cursor, Windsurf, Gemini CLI, and Codex with one canonical recipe definition used by setup and diagnostics.
- `codeweb doctor` checks Node compatibility, a local MCP initialization exchange, graph presence and freshness, and supplied client configuration when requested.
- `--client <client> --config <file>` requests an explicit config check. Never search unrelated client profiles or print config contents.
- JSON reports `ok`, `checks` with named `pass|fail|unknown` states, and an explicit unverified editor connection. Required setup failures return 2; a successful local check returns 0.
- Diagnostics must say that a local server check does not establish an editor connection. Missing or invalid required setup returns exit 2.
- JSON is machine-readable on stdout. Diagnostics do not read secrets into output or contact external services.
- A documented first query proves the map can answer a caller question on a small source fixture.

#### Change review

- `codeweb review` exposes the existing review capability through the package. Preserve existing review JSON fields and flags.
- Support optional HTML output with one view of changed symbols, affected callers, new findings, available recorded coverage, and analysis limits.
- Reuse existing graph traversal, comparison, freshness, and coverage data. Do not invent a second graph schema or change gate semantics.
- Distinguish unchecked, stale, or incomplete analysis from a clean result. State when no baseline or source bodies are available.
- Report analysis as `complete`, `incomplete`, or `stale` relative to the named checks, with reasons. Missing baseline, unavailable source/stamps, dynamic gaps, or changed files without mapped symbols prevent a complete label.
- Malformed supplied baselines are errors. Preserve existing advisory versus `--gate` behavior; uncertainty never becomes a runtime-safety claim.
- Report source provenance and only measured coverage. Unknown coverage must remain unknown.
- Escape source-derived text in HTML and generated tasks. Never execute a generated task automatically.

#### Finding decisions

- Label body-match confidence explicitly. A high-confidence duplicate may have low action priority.
- Treat very short duplicates as review candidates; explain that new coupling can outweigh a small reduction in repeated lines.
- Keep the confirmed-finding list separate from name matches. Show source locations, relevant caller context, and a copyable agent task.
- Use existing annotation/exception semantics and fingerprints. Provide an actionable existing command rather than adding a second persistence store.

#### Gate rollout

- `codeweb gate` runs the existing base-versus-working-tree gate through the package.
- An explicit `--report-only` option and Action input report findings without blocking. Preserve the underlying verdict in output.
- Report-only must never turn usage errors, missing refs, failed graph builds, or interrupted analysis into success.
- Existing blocking behavior remains the default. A passing check means only that the named structural rules found no regression.

#### Evidence and public demo

- Rebuild the demo from a recorded public source SHA with the current engine. Record the reproduction command and engine version.
- Rebuild generated site content, inspect every recaptured screenshot, and refresh the template stamp only after visual inspection.
- Publish a dated qualitative comparison with links to primary sources; no unmeasured speed, accuracy, adoption, or cost superiority.
- Provide a reproducible technical demo and a short recording script. Label technical examples separately from maintainer-approved case studies.
- Provide a five-participant pilot protocol and a case-study template with acceptance/rejection fields. Do not fabricate participants, retention, acceptance, or comparative performance.
- Human pilot execution, external maintainer decisions, and an independently measured performance comparison remain external follow-up work. This release is complete when the scoped code and evidence tooling pass their checks.

- **MCP server** — `codeweb-mcp` (stdio): tools over the local graph (impact, callers,
  duplication, context packs …). The canonical tool list and count live in
  `docs/reference.md` and are locked to `package.json` by AC-2's
  consistency gate; unknown arguments are rejected, booleans are real booleans, pagination is
  one offset dialect with true totals (pinned in the suite).
- **CLI bins** — `codeweb` (map a repo), `codeweb-mcp`, `codeweb-query`, `codeweb-diff`
  (`package.json` `bin`). Contract: `--help` exits 0 (AC-6); unknown flags die with usage,
  exit 2; IO/setup failures exit 2, real findings exit 1, clean exit 0; `--json` modes emit
  machine output on stdout (stdout-contract pins in the suite; `docs/cli.md`).
- **Artifacts** — `.codeweb/` per-target workspace: `graph.json` (nodes/edges), sidecars,
  `report.html` (the supporting human view). Deterministic: same code, same map.
- **Hooks & gate** — the shipped `hooks/` surface (pre-edit impact cards for user repos) and
  the CI gate Action posting PR comments; both read the same graph the MCP tools read.
- **Error shape** — no network, no telemetry; everything answers from local artifacts or
  fails with a usage/setup message and exit 2.

## Evals

Golden cases in `evals/cases/` (`python3 evals/run.py`, gate step 5/5 — AC-7):
`example-upper` (the runner's own mechanics, from the template) and `cli-help` (the CLI
front door). Floor: **all cases pass** — the runner exits non-zero on any failure.
Judgment-shaped product output (review verdicts, gate rulings) is floored inside the suite
itself: golden-file and property tests (`tests/golden-ecc-scripts.test.mjs`,
`tests/gate-verdict.test.mjs`, FPR-STABLE determinism pins) run under AC-1.

## Dependencies

- Runtime: **none** — zero required dependencies is a charter invariant (AC-3 checks it,
  CI's no-AST leg proves the product works without the optional tier).
- Optional: `web-tree-sitter` (`optionalDependencies`) — the AST tier; predates this spec,
  grandfathered with the no-AST CI leg as its guard.
- Dev tooling: Python 3 for the harness only (spec lint, harness tests, evals) — ADR-0001
  (d) in `DECISIONS.md`; nothing Python ships (AC-5).
- Rule: a Python package added to `requirements.txt` fails the gate unless `DECISIONS.md`
  names it in an ADR (`scripts/spec_lint.py`); Node dependencies stay guarded by review, the
  consistency gate, and the package-shape pins.

## Kill criteria

Measurable tripwires that mean **stop building and fix (or stop, period)** — brief 144
restates these as the first Weekly Vitals checklist:

- **The gate stops being able to fail:** `sh scripts/check --prove-red` reports anything but
  PROVE-RED OK. A harness that cannot go red proves nothing — halt all feature work.
- **A receipt regresses:** the bench caller-recall receipt falls back to the grep baseline
  (charter receipt: 44%→74%) or `npm run bench:all -- --gate` breaks `bench/budgets.json`
  on main twice in a row — stop shipping until the receipt is true again (no claim without
  a source is a charter invariant).
- **Claim drift on main:** `node scripts/check-consistency.mjs` red on main — public copy no
  longer traces to the canonical facts; nothing ships over it.
- **The token half fails:** agent answers stop being small — an MCP budget pin
  (`tests/mcp-budget.test.mjs`) red on main is a stop, not a skip.
