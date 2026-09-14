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
| 2 | usage, IO, setup, or inconclusive analysis: inspect the error or structured diagnostics; never treat it as a clean gate |

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

## Context analysis status

`codeweb_context` and `context-pack.mjs --json` include an `analysis` object:

- `scope: "mapped-call-graph"`: counts describe mapped call edges. Imports,
  inheritance, tests, and references are available through `codeweb_dependents`.
  Neither a full response nor an unchanged map proves all runtime callers are known.
- `freshness`: `stale` preserves the existing `stale` detail; `unchanged-stamps`
  means the recorded stamps showed no change; `unknown` means source access or
  nonempty source stamps were unavailable. Stamp checking is not a completeness
  audit. `CODEWEB_VERIFY_FRESHNESS=1` also checks recorded content hashes.
- `listsComplete`: whether all mapped callers, callees, and impact IDs are shown.
  Existing `moreCallers` / `moreCallees` and new `blastRadius.more` count omissions.
  Context has no offset argument: increase `limit` / `--limit`, or use MCP
  `full:true` to remove list budgets.
- `sourceEvidenceComplete`: whether the returned targets have bodies and each
  returned caller has uncapped label-match evidence (or a body in full-body mode).
  This concerns returned items only; it is independent of `listsComplete`.
- `limitations` contains stable reason codes; `nextSteps` gives corresponding
  recovery or inspection actions, including exported contracts and dynamic calls.

Each caller in window mode carries `windowEvidence`: `shown`, `truncated`,
`no-label-match`, or `source-unavailable`. When source can be searched,
`matchedLines`, `shownLines`, and `remaining` describe matching **lines**, not
verified call sites. Windows use lexical label matches within recorded spans;
comments can match and aliases can be missed.

At most eight matching lines per caller seed the windows. MCP `full:true` removes list budgets but retains that
cap; use `bodies:"full"` (CLI `--full-bodies`) or inspect the file to see the rest.

Missing source must be restored; stale spans require a refresh. No numeric
confidence or whole-repository completeness score is inferred from these signals.


## Before and after an edit

**Available in Codeweb 0.15.0 and later:** `baseline:true`, `--baseline`, diff
`refresh:true` / `--refresh`, and the analysis fields below. For an installed-binary
example, use the [npm quickstart](https://ghostlygawd.github.io/codeweb/start.html#npm-quickstart).

CLI examples in this section run from the Codeweb checkout. For another target, pass
its absolute `.codeweb/graph.json` path instead of the relative example.

Capture a fresh baseline **before** changing source:

```text
MCP: codeweb_refresh {baseline:true}
CLI: node scripts/refresh.mjs .codeweb/graph.json --baseline --json
```

This saves `graph.baseline.json` after successful extraction. Ordinary refresh,
background auto-refresh, and `snapshot:true` leave it intact. Calling
`baseline:true` again explicitly starts a new edit and replaces it; finish the
current comparison first. Baselines are local workspace state, not committed history.

After editing, refresh and compare in one action:

```text
MCP: codeweb_diff {before:"baseline", refresh:true}
CLI: node scripts/diff.mjs baseline .codeweb/graph.json --refresh --json
```

MCP serializes extraction and comparison as one workspace writer operation.
`verification` names the baseline, its SHA-256, and the refreshed graph. A missing,
invalid, or different-root baseline fails before refreshing. Losing a pre-edit
baseline cannot be repaired by capturing already-edited source.

The legacy `refresh {snapshot:true}` → `diff {}` loop remains available. It compares
with the graph just before that refresh, which may already include edits after an
automatic refresh. Use the explicit baseline flow for a stable comparison across
mid-edit queries. Without `refresh:true`, diff still compares stored snapshots only.

`analysis.checks` distinguishes evaluated graph checks from missing analysis.
Refresh drops overlap findings, so diff reports duplication as `not-evaluated`
and does not claim that old findings disappeared. Run the full pipeline for both
snapshots or use `codeweb_review` with `gate:true` for a bounded scan of changed
symbols.

Review preserves its boolean `analysis.checks` fields and labels per-check scope in
`analysis.checkStatus`.

`ok:true` means no regressions were found by the checks performed. It does not
mean every check ran or that behavior is correct. Inspect `analysis` and run the
relevant tests. The existing exit codes remain 0 for no detected regressions,
1 for regressions, and 2 for setup or IO failures.

## Setup diagnostics

Run `codeweb --doctor --json` (or `node scripts/doctor.mjs --json`) to inspect the
running installation without creating a map. An optional target directory checks
that project's setup. The standalone script also accepts `--graph <path>`.

The result includes package root, version, checkout/packaged origin, entrypoint,
Node executable, and Codeweb executables found on PATH. Compare these paths when
a global package and a development checkout behave differently: a packaged install
is a snapshot, even when it shares the checkout's version number.

Diagnostics report graph discovery, recorded source root, freshness, and optional
parser availability. Parser probes check availability, not successful grammar
initialization. Missing optional AST support is a warning; regex extraction
remains available. Missing or invalid graph/source setup exits 2; stale or
unstamped graphs produce warnings with repair guidance.

Repair commands use explicit argument arrays in `issues[].command`, avoiding
ambiguous quoting. Diagnostics never install dependencies, remap code, modify
workspace artifacts, or contact a package registry.

The package subcommand `codeweb doctor` additionally checks the local MCP handshake
and optional explicit client configuration. Its required freshness checks can fail when
source stamps are unavailable. The `codeweb --doctor` flag and explicit-target script
form provide lightweight installation/map diagnostics; they do not verify a client connection.

## Known incomplete extraction

Known unsupported same-line JS/TS declarations are recorded in `graph.meta.analysis`.
An `incomplete` status includes an exact diagnostic count and at most 20 samples with
file, line, column, and masked-source evidence. Strings and comments are not copied
into those samples. An unflagged graph does not prove complete syntax coverage.

Diff and review comparisons involving a diagnosed incomplete snapshot return
`ok:false`, `status:"inconclusive"`, diagnostics in `analysis.completeness`, and exit 2.
Inspect the locations and callers in source; this result cannot establish a clean gate.
MCP preserves structured inconclusive results. Existing complete-baseline regressions
return exit 1; a comparison with no detected regression or incompleteness returns 0.

Diagnostics survive caches and refreshes. Both comparison snapshots matter: repairing
the current source does not validate an incomplete baseline. Recover and inspect the
pre-edit source before starting a new baseline; never replace it merely to turn a
failed comparison green. Skipped duplication checks and behavioral limits still apply.


Graphs saved by older versions are not retroactively audited for these diagnostics.
Refresh or remap before relying on them. To audit an old baseline, restore its pre-edit
source revision and remap that revision; do not overwrite it from edited source.
