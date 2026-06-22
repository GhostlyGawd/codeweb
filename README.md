<div align="center">

<img src="assets/brand/hero.svg" alt="codeweb — the system map for your codebase" width="840">

[![Claude Code plugin](https://img.shields.io/badge/Claude_Code-plugin-58a6ff?style=flat-square)](#install)
[![zero dependencies](https://img.shields.io/badge/dependencies-zero-3fb950?style=flat-square)](#how-it-works)
[![deterministic engine](https://img.shields.io/badge/engine-deterministic-58a6ff?style=flat-square)](#how-it-works)
[![MCP server](https://img.shields.io/badge/MCP-server-a371f7?style=flat-square)](#use-it-as-an-mcp-tool)
[![tests](https://img.shields.io/badge/tests-195_passing-3fb950?style=flat-square)](tests/)

**You can't see where your codebase does the same work twice — and neither can the agent editing it.**
codeweb dissects a repo to its atomic parts (functions, classes, methods), wires them into a living
call/import graph, tags each node's domain, and surfaces cross-domain overlap. Then it serves that
graph **two ways**: a self-contained, interactive **HTML map for you**, and **15 deterministic query
tools** (over MCP, no LLM in the loop) **for your coding agent** to consult *before* it edits —
*does this already exist? what breaks if I change it? where should this go?*

[See it in action](#see-it-in-action)&nbsp;·&nbsp;[Install](#install)&nbsp;·&nbsp;[Use](#use)&nbsp;·&nbsp;[For agents (MCP)](#use-it-as-an-mcp-tool)&nbsp;·&nbsp;[How it works](#how-it-works)

</div>

---

## See it in action

One command runs the whole deterministic pipeline and drops an interactive map at
`<target>/.codeweb/report.html`. **Every screenshot below is that actual generated report**, codeweb
pointed read-only at **[axios](https://github.com/axios/axios)** — 274 symbols across 8 domains. No mockups.

> **▶ Read the full [axios case study](docs/case-study-axios.md):** on a library downloaded ~50M
> times a week, codeweb body-confirmed **3 real duplications** (two byte-identical across files),
> dismissed 12 false positives, and produced a cycle-safe merge plan for each. A click-around hosted
> version of this exact map lands with the next push — see [Roadmap](#roadmap).

### Navigate the whole system

A force-directed map of every symbol, collapsible to domains. Search, drag, zoom, and click any
node to trace what depends on it and what it reaches.

<img src="assets/screens/05-axios-graph.png" alt="codeweb Graph tab on axios: a force-directed domain map (adapters, helpers, core, cancel, defaults, platform) on a dark canvas" width="100%">

### Findings — stop guessing what to refactor

Ranked **duplication** (the same function defined across many files), the most depended-on
**hotspots** to change with care, and likely-**dead code** — every row clickable to inspect what
calls it and what it calls.

<img src="assets/screens/05-axios-findings.png" alt="codeweb Findings tab on axios: ranked duplication, hotspots, and likely-dead code, with a clickable detail panel" width="100%">

### See duplication density, and where areas tangle

<table>
<tr>
<td width="50%" valign="top">
<img src="assets/screens/05-axios-treemap.png" alt="codeweb Treemap on axios: every file sized by lines of code and shaded green-to-red by duplication density">
<br><b>Treemap</b> — every file sized by lines of code and shaded green→red by how duplicated it
is. The red blocks are your consolidation targets, at a glance.
</td>
<td width="50%" valign="top">
<img src="assets/screens/05-axios-matrix.png" alt="codeweb Matrix on axios: a heatmap of call coupling between domains">
<br><b>Matrix</b> — area-to-area coupling. A big off-diagonal cell means two areas are tangled:
merge them, or put a clean interface between them.
</td>
</tr>
</table>

<div align="center">
<img src="assets/brand/demo.svg" alt="The codeweb pipeline: extract → cluster → overlap → render, looping" width="840">
<br><sub>The deterministic pipeline, looping: extract → cluster → overlap → render.</sub>
</div>

---

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

This is a self-contained Claude Code plugin — zero npm dependencies, just Node.js.

**As a Claude Code plugin:**
```
/plugin marketplace add GhostlyGawd/codeweb
/plugin install codeweb
```
Then restart Claude Code so the `/codeweb` command, agents, and skill register.

**Or run the engine directly — no plugin, no install:**
```
git clone https://github.com/GhostlyGawd/codeweb.git
node codeweb/scripts/run.mjs /path/to/your/project --out-dir /path/to/your/project/.codeweb
# then open /path/to/your/project/.codeweb/report.html
```

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

## Gate every PR (GitHub Action)

`scripts/ci-gate.mjs` turns the `diff` gate into CI: it builds the graph for the PR base and head and
**fails the build on a structural regression** (a new cycle, a new duplication, or a symbol that
loses all its callers). Drop it into any repo (full spec: [`docs/ci-gate.md`](docs/ci-gate.md)):

```yaml
# .github/workflows/codeweb-gate.yml
on: pull_request
jobs:
  gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }   # required — the gate diffs against the PR base
      - uses: GhostlyGawd/codeweb/.github/actions/codeweb-gate@main
        with: { target: src }
```

Locally: `node scripts/ci-gate.mjs --base <ref> [--target <subdir>]`. Pure removals never trip the
gate; a brand-new uncalled function is reported but doesn't fail the build.

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

## Track duplication over time (`trend.mjs`)

A one-shot map tells you where you are; `trend.mjs` tells you which way you're heading — is the
codebase consolidating or sprawling? It charts **body-confirmed duplication** and **cross-domain
coupling** across snapshots, with a sparkline and a rising/falling verdict:

```
node scripts/trend.mjs --git <repo> --last 10 [--focus <subdir>] [--json]   # snapshot the last N commits
node scripts/trend.mjs a.json b.json c.json [--labels …] [--json]           # or chart pre-built snapshots
```

The `--git` mode checks out each of the last N commits into an **ephemeral worktree** (read-only
over your working tree), runs the deterministic pipeline, and records the metrics — so you can watch
duplication trend down as you consolidate, or catch it creeping up in review.

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

## Agent capability suite (write · review · optimize)

A set of read-only, deterministic tools that make an agent better at the three jobs — each pinned by
property tests against an independent oracle (full spec: [`docs/agent-tools-v2.md`](docs/agent-tools-v2.md)):

| Tool | Job | What it answers |
|---|---|---|
| `find-similar.mjs <graph> --body/--stdin/--signature` | **write** | "Does code like this already exist?" — ranks existing bodies by shingle similarity, so the agent reuses instead of re-implementing. |
| `placement.mjs <graph> --calls <ids>` | **write** | Where a new symbol belongs (domain + file by callee gravity) and whether it duplicates something. |
| `query.mjs <graph> --tests <symbol>` | **write** | The tests that exercise a symbol — run the right subset after an edit. |
| `review.mjs <graph> --changed <files> [--before g] [--gate]` | **review** | Maps a change to its changed symbols, blast radius, domains, and a fan-in-ranked review order; structural regression gate. |
| `fitness.mjs <graph> --rules codeweb.rules.json` | **review** | Checks architectural invariants (forbidden deps, layering, no-cycles, fan-in/loc caps); fails on violation. |
| `risk.mjs <graph> [--changed] [--churn/--git]` | **review** | Ranks symbols by change-risk (fan-in × fan-out × loc × blast × churn) for triage. |
| `codemod.mjs <graph> --merge <ids> --into <id> [--write]` | **optimize** | Plans a consolidation merge (deletions + caller rewrites + projected gate); `--write` applies it, gated + reversible. |
| `break-cycles.mjs <graph>` | **optimize** | For each dependency cycle, the cheapest edge to sever — *verified* to break it. |
| `deadcode.mjs <graph>` | **optimize** | Tiers orphans into safe-to-delete vs review-first (test-guarded / entrypoint-like). |

Plus **graph freshness**: `extract-symbols.mjs --cache <path>` re-scans only changed files, and
`refresh.mjs <graph>` re-extracts a graph's nodes+edges from disk so mid-edit queries stay accurate.
Nodes now carry a `signature` (params/returns), and edges from test files are a distinct `test` kind
(so production `--callers` exclude tests). All of the above are also exposed over MCP (below).

## Use it as an MCP tool

`scripts/mcp-server.mjs` is a zero-dependency MCP (Model Context Protocol) stdio server exposing
codeweb's queries + the capability suite as tools any MCP client can call mid-task:
`codeweb_callers/callees/impact/cycles/orphans/diff`, plus `codeweb_tests/find_similar/placement/
review/fitness/risk/break_cycles/deadcode/codemod` (the last is plan-only — `--write` is not exposed).
Register it with Claude Code:

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

For JavaScript, TypeScript, Python, Rust, and Go the default is a **deterministic Node pipeline** — one
command, no LLM in the loop, reproducible byte-for-byte. `scripts/run.mjs` chains four stages
into a per-target workspace:

<div align="center">
<img src="assets/brand/pipeline.svg" alt="codeweb's four deterministic stages: extract, cluster, overlap, render" width="100%">
</div>

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
│   ├── extract-symbols.mjs         # stage 1: source -> atomic nodes + edges (JS/TS/Python/Rust/Go)
│   ├── cluster3.mjs                # stage 2: hub-strip + directory-anchored domains
│   ├── overlap.mjs                 # stage 3: body-confirmed duplication/overlap detection
│   ├── build-report.mjs            # stage 4: graph.json -> interactive report.html + report.md
│   ├── report-template.html        # the renderer's self-contained HTML shell
│   ├── query.mjs                   # structural queries (callers/callees/tests/impact/cycles/orphans)
│   ├── diff.mjs                    # graph-delta / post-edit regression gate (before vs after)
│   ├── trend.mjs                   # duplication + coupling over snapshots / git history (dashboard)
│   ├── ci-gate.mjs                 # CI gate: before(base)-vs-after(working tree) diff, exits 1 on regression
│   ├── refresh.mjs                 # F0: re-extract a graph's nodes+edges from disk (cached, fast)
│   ├── find-similar.mjs            # F1: rank existing bodies vs a candidate (reuse-at-write-time)
│   ├── placement.mjs               # F2: suggest a new symbol's domain/file + reuse warnings
│   ├── review.mjs                  # F5: structural review of a change (blast radius, regressions)
│   ├── fitness.mjs                 # F6: architectural fitness-rule checker
│   ├── risk.mjs                    # F7: change-risk ranking for review triage
│   ├── codemod.mjs                 # F8: consolidation edit plan (+ gated/reversible --write)
│   ├── deadcode.mjs                # F10: confidence-tiered dead-code workflow
│   ├── break-cycles.mjs            # F9: cheapest verified cut per dependency cycle
│   ├── mcp-server.mjs              # MCP stdio server exposing all queries + the capability suite
│   └── lib/
│       ├── graph-ops.mjs           # shared pure graph primitives (index, cycles, orphans, impact, reviewImpact, …)
│       ├── shingles.mjs            # F1: shared token-shingle/jaccard (also used by overlap.mjs)
│       └── risk.mjs                # F7: the change-risk formula + weights (one truth)
├── agents/                          # fallback path (unparseable langs / --engine read)
│   ├── codeweb-dissector.md         # atomic dissection (parallel, read-only)
│   └── codeweb-domain-mapper.md     # domain tagging + overlap detection
├── skills/codebase-anatomy/
│   ├── SKILL.md                     # orchestration brain (fast path default, agents fallback)
│   └── references/
│       ├── graph-schema.md
│       ├── overlap-heuristics.md
│       └── engine-detection.md
├── assets/                          # brand art (logo, hero, animated demo) + report screenshots
└── README.md
```

## Roadmap

- **More first-class languages** — Java, C#, and others on the deterministic fast path. (JavaScript,
  TypeScript, Python, **Rust**, and **Go** are native today; everything else routes through the agent
  fallback.)

_Recently shipped: a **[live interactive demo](https://ghostlygawd.github.io/codeweb/demo/)** on
GitHub Pages · Go and Rust on the fast path · duplication-over-time trend (`trend.mjs`) · a
one-command CI regression gate + GitHub Action · a shareable report that no longer embeds the local
source path._

## Handoffs

codeweb's domain map and overlap list feed naturally into `refactor-cleaner` (act on the
consolidation list), `codebase-onboarding` (use the domain map for a guide), and `code-tour`
(anchor a tour to the symbol index).
