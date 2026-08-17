# CLI reference — bins, flags, environment variables, exit codes

The tables the code actually implements. When something here disagrees with `--help`, `--help`
wins and this file has a bug — please report it.

## Bins (`npm i -g @ghostlygawd/codeweb`, or `npx -y -p @ghostlygawd/codeweb <bin>`)

| bin | what it runs | typical call |
|---|---|---|
| `codeweb` | the full pipeline (`scripts/run.mjs`) | `codeweb .` — map the current repo into `./.codeweb/` |
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
| `CODEWEB_NO_STATS=1` | disable the local outcome ledger (`.codeweb/stats.json`) entirely — the privacy lever |
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
