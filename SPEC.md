# SPEC — codeweb

Created 2026-07-26 by the spec program after harness installation; supersedes the initial
null report at `reports/SPEC.md`. Current authority is `CHARTER.md`, including its
2026-08-17/18 amendments and later ratified decisions.

The operator selected **productize and launch** as Next on 2026-08-17. New work enters
acceptance criteria under that scope; IDs remain stable and retirement uses `status: dropped`.
A `built` criterion records implementation and test pins, not a release or deployment.

AC-13–18 currently describe unreleased working-tree implementation. The tests in
`tests/test_ac_pins.py` connect criteria to their verification commands.

## Job

**"Your agents break less code and burn fewer tokens."** Before an edit, the agent asks the
map — who calls this, what breaks, does this already exist — and gets exact, small answers
(28 MCP tools over a deterministic call/import graph, built locally, no LLM in the loop);
the regression gate enforces the same sight after the edit. Receipts: callers found 44%→74%
vs grep; impact answers at a fraction of grep's tokens (`CHARTER.md`, Problem/Job).

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
- **AC-13** — PR gate comments show bounded source locations, duplication evidence, investigation steps, and analysis limits; GitHub links use the analyzed commit and preserve subdirectory targets without changing verdicts | check: `node --test tests/gate-md.test.mjs tests/ci-gate.test.mjs` | status: built
- **AC-14** — context JSON distinguishes list and source-evidence completeness from graph uncertainty, reports unknown freshness without stamps, and gives actionable recovery steps identically through CLI and MCP | check: `node --test tests/context-analysis.test.mjs` | status: built

- **AC-15** — an explicit pre-edit baseline survives ordinary and automatic refreshes; one diff refreshes and compares against it, reports skipped checks, and fails actionably without a valid baseline | check: `node --test tests/edit-baseline.test.mjs` | status: built
- **AC-16** — setup diagnostics report the running installation, discovered graph, source freshness, parser availability, and local repair commands without modifying the workspace | check: `node --test tests/doctor.test.mjs` | status: built

- **AC-17** — first-run CLI, README and start-page guidance capture an explicit pre-edit baseline and preserve it through repair; the published tiny cycle walkthrough finds a caller, goes red then green, and discloses skipped analysis and behavioral limits | check: `node --test tests/first-run.test.mjs tests/first-use-cycle.test.mjs` | status: built
- **AC-18** — shipped hook metadata omits settings schema and matcher-level metadata, preserves adjacent descriptions and all three handler commands, and passes fixture-driven handler checks | check: `node --test tests/hooks-config.test.mjs tests/brief.test.mjs tests/awareness.test.mjs tests/post-edit-diff.test.mjs` | status: built

Pins live in `tests/test_ac_pins.py` (`test_ac_<n>_...`); pins are cheap wiring witnesses —
the `check:` commands above are what brief 144 runs verbatim.

## Interfaces

- **MCP server** — `codeweb-mcp` (stdio): 28 tools over the local graph (impact, callers,
  duplication, context packs …). Interfaces live in `scripts/lib/tool-specs.mjs`; server
  behavior lives in `scripts/mcp-server.mjs`. The consistency checker derives the tool count
  from those sources and checks current prose and package metadata. Unknown arguments are
  rejected; booleans and pagination follow the tested transport contracts.
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
`example-upper`, `cli-help`, `mcp-initialize`, `mcp-tools-list` and `query-help`.
Floor: **all cases pass** — the runner exits non-zero on any failure.
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
