# CLI reference — bins, flags, environment variables, exit codes

The tables the code actually implements. When something here disagrees with `--help`, `--help`
wins and this file has a bug — please report it.

## Bins (`npm i -g @ghostlygawd/codeweb`, or `npx -y -p @ghostlygawd/codeweb <bin>`)

| bin | what it runs | typical call |
|---|---|---|
| `codeweb` | map, setup, diagnostics, review, or PR gate | `codeweb .` — map the current repo into `./.codeweb/` |
| `codeweb-mcp` | the MCP stdio server (28 read-only tools) | `claude mcp add codeweb -- npx -y -p @ghostlygawd/codeweb codeweb-mcp` |
| `codeweb-query` | graph queries (`scripts/query.mjs`) | `codeweb-query --impact <symbol>` from a mapped repo |
| `codeweb-diff` | the regression gate (`scripts/diff.mjs`) | `codeweb-diff before.json after.json` — exit 1 on a regression |

All four bins exit **2** on Node < 22 (a setup error — never 1, which `codeweb-diff` reserves
for "regression found").

## `codeweb` / `run.mjs` flags

| flag | meaning |
|---|---|
| `<SRC>` | path to map (default: current directory) |
| `--target <label>` | display label stamped into the map |
| `--out-dir <dir>` | artifact directory (default `<SRC>/.codeweb` — where MCP + hooks look) |
| `--open` | open `report.html` when built |
| `--serve` | after mapping, serve the workspace at `http://127.0.0.1:<port>` (localhost only) |
| `--json` | one machine-readable result line on stdout (`{ws, symbols, actionable, reused, version}`); progress stays on stderr |
| `--full` | recompute every stage (skip the fragment memo + edge cache) |
| `--allow-empty` | permit a target with no supported source (writes an empty map) |
| `--stages through-overlap` | partial pipeline (skip optimize+report) — the trend fast path |
| `--coverage <path>` | annotate the graph from a coverage report (lcov or c8 JSON) |

Streams: results (the `done ->` block, or the `--json` line) are **stdout**; stage progress and
children's output are **stderr** — `codeweb . | grep mapped` and `codeweb . 2>/dev/null` both work.

## Package subcommands

Run these commands through an installed `codeweb` bin or replace `codeweb` with `npx -y @ghostlygawd/codeweb`.
Each subcommand supports `--help`.

| Command | Required input | Result |
|---|---|---|
| `codeweb setup --client cursor` | `claude`, `cursor`, `windsurf`, `gemini`, or `codex` | Prints one client recipe without changing configuration; `--json` returns the recipe and steps |
| `codeweb doctor --json` | A local map; optional `--graph <file>` | Checks runtime, local MCP initialization, graph presence, and recorded freshness |
| `codeweb doctor --client cursor --config .cursor/mcp.json` | Both flags for an explicit configuration check | Inspects only that file; does not execute its command or print its values |
| `codeweb review .codeweb/graph.json --changed a.js --json --html review.html` | A graph and `--changed <file[:start-end],...>` or `--range <gitref>` | Reports changed symbols, affected callers, findings, coverage, and analysis limits |
| `codeweb gate --base origin/main --target src` | A base git ref; full local history | Compares the base with the working tree and reports structural regressions |

`review` accepts `--before <graph.json>` for a baseline and `--gate` to block on findings. Analysis states are `complete`, `incomplete`, or `stale` for the checks named in the report.
A clean structural verdict does not prove runtime correctness. Unknown coverage stays unknown.

`doctor --json` returns `ok`, named `pass`, `fail`, or `unknown` checks, and an unverified editor connection. Required failures or unknown freshness return exit 2.
Successful local diagnostics return exit 0. Use a caller query inside your client to check its connection.

`gate --report-only` retains the regression verdict but returns exit 0 for a completed, validated finding. Usage errors, failed analysis, missing refs, and interruptions still fail.
Blocking is the default. See [the gate guide](ci-gate.md) for Action inputs and output codes.

### Directories with a reserved name

Bare `setup`, `doctor`, `review`, and `gate` select subcommands. To map a directory with one of these names, use an explicit path or the `--` delimiter:

```sh
codeweb ./review
codeweb /absolute/path/to/review
codeweb -- review
```

## Exit codes

| code | meaning |
|---|---|
| 0 | success — for `simulate-edit` this includes a BLOCK prediction (the verdict is in the payload, it's a pre-flight) |
| 1 | the tool's finding fired: `diff`/`ci-gate`/`review --gate`/`fitness` found a regression; `query`-family symbol not found; a pipeline stage failed |
| 2 | usage, IO, or setup: bad flag, missing file, unmapped directory, wrong-path target, Node < 22 |

## Environment variables

Everything the shipped code reads. Unset = the default behavior; all of it is local — nothing
here (or anywhere else in codeweb) transmits anything.

| variable | effect |
|---|---|
| `CODEWEB_WS` | workspace override: tools read `$CODEWEB_WS/graph.json` instead of walking up to the nearest `.codeweb/` |
| `CODEWEB_NO_STATS=1` | disable the local outcome ledger (`.codeweb/stats.json`) entirely — the privacy lever (also suppresses the upgrade lines below) |
| `CODEWEB_NO_PROMO=1` | suppress every upgrade placement: the gate comment's org-dashboard line, the trend nudge at 5+ snapshots, and the sponsor ask. Attribution footers stay |
| `CODEWEB_ENGINE` | pin the extraction engine (`ts` \| `regex`) instead of auto-detection |
| `CODEWEB_NO_AUTOREFRESH=1` | MCP server stops auto-refreshing stale graphs before answering |
| `CODEWEB_MCP_TRACE=1` | MCP server logs queue lifecycle events (start/end/kill/skip-autorefresh) as NDJSON to stderr |
| `CODEWEB_HOOK_INPROC=0` | post-edit hook falls back to the child-process extraction path (rollback lever) |
| `CODEWEB_VERIFY_FRESHNESS=1` | re-verify stage-memo reuse against the sources instead of trusting stamps |
| `CODEWEB_LSH=0` | overlap candidate generation falls back to the pre-LSH exhaustive path |
| `CODEWEB_OPT_SIM=0` | optimize falls back to whole-graph merge simulation (pre-delta-simulator path) |
| `CODEWEB_NAME_DELTA=0` | disable name-delta cache invalidation (force wider re-extraction) |
| `CODEWEB_ALL_ROLES=1` | disable product-role scoping — advisors count test/bench/generated symbols too |
| `CODEWEB_HUB_INDEG` | hub-stripping threshold for the report graph (default 12) |
| `CODEWEB_LEGACY_FALLBACK=1` | re-enable the legacy bare-name call resolution fallback |
| `CODEWEB_DEADCODE_LEGACY=1` | deadcode reverts to the pre-H13 tiering (test-file-defined symbols not protected) |
| `CODEWEB_VERBOSE=1` | run.mjs restores optimize's full advisory dump instead of the 3-line headline |
| `CODEWEB_TIMING=1` | print per-phase timings in the extractor |
| `CODEWEB_BIN` | set to `1` by the `bin/` shims so the server's main-guard fires when invoked through a bin entry (internal signal — not an editor setting) |
| `CODEWEB_CHROMIUM` | Chromium executable for `screenshot.mjs` |
| `TS_MODULE` | path to a `typescript` module for the bench's token grading |
