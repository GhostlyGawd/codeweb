# SPEC — codeweb

Date: 2026-07-26
Written by 142 · Spec the Product (All Build Goal Prompts, stage 2/4 re-run after the
harness install; supersedes the null report preserved at `reports/SPEC.md`). Sources: the
ratified `CHARTER.md` (2026-07-25) and shipped behavior only — v1 codifies what the product
already promises publicly, so every AC below is `built` and pinned (`tests/test_ac_pins.py`).
Nothing here invents roadmap: the charter keeps **Next** deliberately open for the operator,
so no AC carries `status: next` yet; when the operator picks Next, its ACs are appended here
(ids never renumber — retirement is `status: dropped`).

## Job

**"Your agents break less code and burn fewer tokens."** Before an edit, the agent asks the
map — who calls this, what breaks, does this already exist — and gets exact, small answers
(27 MCP tools over a deterministic call/import graph, built locally, no LLM in the loop);
the regression gate enforces the same sight after the edit. Receipts: callers found 44%→74%
vs grep; impact answers at a fraction of grep's tokens (`CHARTER.md`, Problem/Job).

## Non-goals

From the charter's ratified list — scope creep dies here:

- No resident daemon (`docs/decisions/fastpath-daemon.md`, NO-GO).
- No embeddings or vector search — `find` stays deterministic-lexical.
- No LLM inside the runtime analysis path.
- No accounts, telemetry, or license keys in the local product, ever.
- No hosted "Teams" build before the distribution trigger; no VS Code Marketplace publish
  (the .vsix still builds per release).
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
reached through the gate's PR comments; a paid Teams tier waits behind the distribution
trigger (Non-goals). Brief 144's first-dollar lens verifies the sponsor doorway exists and
resolves; it cannot verify a stranger's card, and this spec claims nothing more.

## Acceptance criteria

Grammar (parsed by `scripts/spec_lint.py` — one line per AC):
`- **AC-n** — <criterion> | check: ` `` `<command>` `` ` | status: next|built|dropped`

- **AC-1** — the full product suite passes from a bare, dependency-free checkout | check: `npm test` | status: built
- **AC-2** — every public claim surface agrees with package.json and the charter identity line | check: `node scripts/check-consistency.mjs` | status: built
- **AC-3** — the product installs and runs with zero required dependencies | check: `node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf8'));process.exit(p.dependencies&&Object.keys(p.dependencies).length?1:0)"` | status: built
- **AC-4** — the gate can go red: prove-red plants a failing canary and the gate catches it | check: `sh scripts/check --prove-red` | status: built
- **AC-5** — the npm tarball ships the product only: no repo-only trees, no harness files | check: `node --test tests/package-shape.test.mjs` | status: built
- **AC-6** — every shipped bin answers --help with exit 0 | check: `sh -c 'for b in bin/*.mjs; do node "$b" --help >/dev/null || exit 1; done'` | status: built
- **AC-7** — all golden eval cases pass | check: `python3 evals/run.py` | status: built
- **AC-8** — imported JSON files are file-level map nodes: JS/TS imports of .json resolve, stamp staleness, and feed the pre-edit importer card | check: `node --test tests/json-support.test.mjs` | status: built

Pins live in `tests/test_ac_pins.py` (`test_ac_<n>_...`); pins are cheap wiring witnesses —
the `check:` commands above are what brief 144 runs verbatim.

## Interfaces

- **MCP server** — `codeweb-mcp` (stdio): 27 tools over the local graph (impact, callers,
  duplication, context packs …). The canonical tool list and count live in
  `docs/reference.md` / `docs/agent-tools.md` and are locked to `package.json` by AC-2's
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
