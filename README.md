# codeweb

> Dissect a codebase to its atomic parts, wire them into a living system web, tag each node's
> domain, and surface where the system does overlapping work — so it can be restructured into
> well-defined, non-duplicative systems. Renders a self-contained interactive HTML map.

codeweb is the missing **atomic-analysis + overlap-detective** layer. Where `repo-scan`
classifies *files* and flags duplicate *modules*, and `codebase-onboarding` writes high-level
architecture docs, codeweb works at **symbol resolution**: functions, classes, and methods, the
call/import edges between them, the semantic domain each belongs to, and the cross-domain
overlap graph.

## Two modes

- **Internal** — map your own codebase and find consolidation opportunities to restructure.
- **External** — clone a third-party repo *read-only* (e.g. a Claude Code plugin you found on
  GitHub), fully map it, and get an adoption review before you commit to using it. codeweb
  never executes target code.

## Install

This is a self-contained Claude Code plugin. To use it:

1. Copy the `codeweb/` directory into a plugins location Claude Code discovers, **or** add the
   directory as a local marketplace and install it:
   ```
   /plugin marketplace add D:/GitHub Projects/ecc-test/codeweb
   /plugin install codeweb
   ```
2. Restart Claude Code so the command, agents, and skill register.

Requires Node.js — the whole deterministic pipeline (extract → cluster → overlap → render) runs
on Node, no external dependencies. Static-analysis tools (universal-ctags, ripgrep, madge, etc.)
are *optional* — they only sharpen the agent fallback path; the default engine reads the code
directly.

## Use

```
/codeweb                                  # map the current project
/codeweb src/payments --depth symbol      # deep-dive one subsystem
/codeweb https://github.com/owner/repo    # external review before adopting
/codeweb owner/repo --open                # clone, map, and open the report
```

Flags: `--depth module|symbol|auto`, `--engine hybrid|read|tools`, `--focus <glob>`,
`--mode internal|external`, `--open`. See `commands/codeweb.md`.

## Outputs (under `<target>/.codeweb/`)

| File | What it is |
|---|---|
| `graph.json` | The machine-readable web: `nodes`, `edges`, `domains`, `overlaps`, plus `meta` (target root, engine, languages, stats). |
| `report.html` | Self-contained interactive map — force-directed graph, domain tree, clickable node details, ranked overlap tab. No network/CDN required. |
| `report.md` | The same map as plain markdown — domains, top nodes, ranked overlaps. |
| `overlap.md` | The ranked consolidation opportunities in plain markdown. |
| `fragment.json` | The raw extractor output (atomic nodes + edges) before clustering — the pipeline's first stage. |

## Query the graph (for agents & humans)

Once `graph.json` exists, `scripts/query.mjs` answers the structural questions an agent needs
before it edits — read-only, deterministic, no LLM in the loop:

```
node scripts/query.mjs <graph.json> --impact  <symbol>   # blast radius: transitive callers + domains touched
node scripts/query.mjs <graph.json> --callers <symbol>   # direct callers
node scripts/query.mjs <graph.json> --callees <symbol>   # direct callees
node scripts/query.mjs <graph.json> --cycles             # file-level dependency cycles (SCCs)
node scripts/query.mjs <graph.json> --orphans            # uncalled & unexported (dead-code candidates)
```

`<symbol>` is a node id (`file:label`) or a bare label (a label matching several nodes operates on
the union, reported in `matched`). Add `--json` for stable, machine-readable output. Exit codes:
`0` success (even when empty), `1` symbol not found, `2` usage/IO error. Example — *"what could I
break if I change the state store?"*:

```
$ node scripts/query.mjs .codeweb/graph.json --impact lib/state-store/index.js:get
impact of lib/state-store/index.js:get: 120 functions across 12 domains
```

> `--orphans` is a *candidate* list: extraction deliberately drops ambiguous call edges (precision
> over recall), so genuinely-called functions and entrypoints can surface — cross-check before deleting.

## Guard agent edits (`diff`)

`scripts/diff.mjs` compares two `graph.json` snapshots (before vs after an edit) and flags
structural **regressions**, so it can run as a PostToolUse hook or CI gate:

```
node scripts/diff.mjs <before.json> <after.json> [--json]
```

It reports nodes/edges/overlaps/cycles/orphans added & removed plus the cross-domain coupling
delta, and **exits 1** (listing `regressions`) when an edit introduces a new dependency cycle, a
new duplication finding, or makes an existing symbol lose all its callers. It **exits 0** for pure
removals — deleting code/cycles/dups is an improvement, not a regression — and a brand-new uncalled
node is reported but does not trip the gate (agents add functions before wiring them).

## Advise consolidations (`optimize.mjs`)

Where `diff.mjs` *gates* (pass/fail on an edit), `optimize.mjs` *advises*: it reads a graph's
body-confirmed `overlaps[]` and ranks the `duplicate-logic` findings into consolidation
opportunities, **pre-flighting each proposed merge against the gate's own cycle check** — without
editing a line of source.

```
node scripts/optimize.mjs <graph.json> [--json]   # or set CODEWEB_WS
```

Each opportunity is tiered: **ready** (body-confirmed ≥60%, not drifted, and the simulated merge
stays acyclic → the gate would pass, duplication −1), **blocked** (the naive merge would introduce a
new file cycle → the gate would reject it; needs a neutral home), or **review** (drifted copies,
merely-structural confidence, or non-`duplicate-logic` findings — human/agent judgement required).
Low/refuted findings are excluded outright. It picks a canonical survivor (most-called, tie-broken by
LOC then id) and reports the copies removed, callers rewired, blast radius, and LOC reclaimed. It is
**advisory only** — it never writes code and never exits non-zero on a clean read; the merge stays a
human + gate decision.

## Agent tools — context & pre-flight (`context-pack`, `simulate-edit`)

Two read-only tools that move work off the LLM and into the graph (full spec:
[`docs/agent-tools.md`](docs/agent-tools.md)):

```
node scripts/context-pack.mjs  <graph.json> <symbol> [--json]   # minimal context to edit <symbol>
node scripts/simulate-edit.mjs <graph.json> --delete <sym> | --merge <a,b> [--into <id>] | --move <sym> --to <file>
```

`context-pack` returns the **blast-radius-scoped** context for a symbol — its body, the direct
callers (call sites, with body), the direct callees (location-only), and the transitive impact set
(ids only) — so an agent edits with a small window instead of reading whole files. `simulate-edit`
predicts the regression gate's **structural verdict** (`{newCycles, lostCallers, ok}`) for a
hypothetical delete/merge/move **without performing it**, so doomed edits are discarded cheaply. Both
share the pure `applyEdit` primitive in `graph-ops.mjs` with `optimize.mjs` (one truth), and are
covered by property tests that pin the tool's output to an independent oracle.

## Use it as an MCP tool

`scripts/mcp-server.mjs` is a zero-dependency MCP (Model Context Protocol) stdio server exposing
the five queries as tools (`codeweb_callers/callees/impact/cycles/orphans`) any MCP client can call
mid-task. Register it with Claude Code:

```
claude mcp add codeweb -- node /abs/path/to/codeweb/scripts/mcp-server.mjs
```

or in an `.mcp.json`:

```json
{ "mcpServers": { "codeweb": { "command": "node", "args": ["/abs/path/to/codeweb/scripts/mcp-server.mjs"] } } }
```

Each tool takes a `graph` (path to a `graph.json`) plus, for callers/callees/impact, a `symbol`
(node id or bare label) — so an agent can ask "what breaks if I change X?" before editing.

## How it works

For JavaScript, TypeScript, and Python the default is a **deterministic Node pipeline** — one
command, no LLM in the loop, reproducible byte-for-byte. `scripts/run.mjs` chains four stages
into a per-target workspace:

1. **Extract** (`extract-symbols.mjs`) — parse every source file into atomic nodes (functions,
   classes, methods) and call/import edges. Unresolved bare calls only wire to a global
   definition when the name is unambiguous; multi-def names drop the edge rather than fabricate a
   false hub.
2. **Cluster** (`cluster3.mjs`) — strip genuine utility hubs, then group nodes into
   directory-anchored semantic domains.
3. **Overlap** (`overlap.mjs`) — detect duplicated logic and parallel implementations, then
   confirm each candidate against the real function bodies (token-shingle similarity) so findings
   are body-backed, not name coincidences.
4. **Render** (`build-report.mjs`) — turn `graph.json` into the self-contained `report.html`
   (and `report.md`).

For languages the extractor can't parse (or with `--engine read`), codeweb **falls back** to the
agent path: parallel `codeweb-dissector` agents extract nodes + edges per subsystem, the
fragments merge into one graph by node id, and `codeweb-domain-mapper` tags domains and detects
overlaps. Both paths emit the same `graph.json` schema, so clustering, overlap, and rendering are
shared. In **external** mode, either path appends an adoption verdict (risk, deps, architecture).

## Components

```
codeweb/
├── .claude-plugin/plugin.json
├── commands/codeweb.md              # /codeweb trigger
├── scripts/                         # the deterministic engine (default fast path)
│   ├── run.mjs                      # orchestrator — one command, runs all stages per target
│   ├── extract-symbols.mjs         # stage 1: source -> atomic nodes + edges (JS/TS/Python)
│   ├── cluster3.mjs                # stage 2: hub-strip + directory-anchored domains
│   ├── overlap.mjs                 # stage 3: body-confirmed duplication/overlap detection
│   ├── build-report.mjs            # stage 4: graph.json -> interactive report.html + report.md
│   ├── report-template.html        # the renderer's self-contained HTML shell
│   ├── query.mjs                   # structural queries over graph.json (callers/callees/impact/cycles/orphans)
│   ├── diff.mjs                    # graph-delta / post-edit regression gate (before vs after)
│   ├── mcp-server.mjs              # MCP stdio server exposing the queries as agent tools
│   └── lib/graph-ops.mjs           # shared pure graph primitives (index, cycles, orphans, impact)
├── agents/                          # fallback path (unparseable langs / --engine read)
│   ├── codeweb-dissector.md         # atomic dissection (parallel, read-only)
│   └── codeweb-domain-mapper.md     # domain tagging + overlap detection
├── skills/codebase-anatomy/
│   ├── SKILL.md                     # orchestration brain (fast path default, agents fallback)
│   └── references/
│       ├── graph-schema.md
│       ├── overlap-heuristics.md
│       └── engine-detection.md
└── README.md
```

## Handoffs

codeweb's domain map and overlap list feed naturally into `refactor-cleaner` (act on the
consolidation list), `codebase-onboarding` (use the domain map for a guide), and `code-tour`
(anchor a tour to the symbol index).
