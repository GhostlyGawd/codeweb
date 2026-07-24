<div align="center">

# codeweb

**Your coding agents grep. codeweb knows.**

[![CI](https://github.com/GhostlyGawd/codeweb/actions/workflows/ci.yml/badge.svg)](https://github.com/GhostlyGawd/codeweb/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40ghostlygawd%2Fcodeweb?style=flat-square&color=c6f24e)](https://www.npmjs.com/package/@ghostlygawd/codeweb)
[![license: MIT](https://img.shields.io/npm/l/%40ghostlygawd%2Fcodeweb?style=flat-square&color=3fb950)](LICENSE)

**Free & MIT-licensed. Runs entirely on your machine — no account, no server, no telemetry. Reads your code; never executes it.**

**[Website](https://ghostlygawd.github.io/codeweb/)**&nbsp;·&nbsp;[See it in action](#see-it-in-action)&nbsp;·&nbsp;[Install](#install)&nbsp;·&nbsp;[Use](#use)&nbsp;·&nbsp;[For agents (MCP)](#use-it-as-an-mcp-tool)&nbsp;·&nbsp;[How it works](#how-it-works)&nbsp;·&nbsp;[Changelog](CHANGELOG.md)

</div>

codeweb reads your code and maps it: every function, and every call between them
(~3 s for 3,000 symbols). It's static analysis — no LLM — so the same code always produces
the same map.

Your coding agents query the map instead of grepping. With grep, agents miss more than half of
a function's real callers ([measured](https://ghostlygawd.github.io/codeweb/research.html)).
They break the code they can't see.

- **For agents:** an MCP server with 27 tools — `codeweb_impact`, `codeweb_callers`,
  `codeweb_find_similar`, and 24 more.
- **For you:** an interactive map of the whole codebase.
- **Answers:** exact, instant, tiny. Your agents keep their context for the real work.

The result: your agents break less code, and they stop rewriting functions you already have.

The map also shows things you can't see from inside one file: **duplicated logic, dead code,
hotspots, and tangled domains**.

---

## Try it on your repo

```
cd your-project
npx -y @ghostlygawd/codeweb .
```

Three seconds for 3,000 symbols. Open `.codeweb/report.html` — that's your map.

## See it in action

Every screenshot below is a real generated report of **axios** (274 symbols, 8 domains).
No mockups.

codeweb found 3 real duplications in axios and dismissed 12 false positives —
[the case study](docs/case-study-axios.md). Or
[click around the live map](https://ghostlygawd.github.io/codeweb/demo/).

### Know what an edit breaks — before you write

Click any function in the [living map](https://ghostlygawd.github.io/codeweb/) and its
**blast radius** lights up: everything your change would touch.

Your agents get the same answer over MCP (`codeweb_impact`) — before they write a line.

<div align="center">
<img src="assets/screens/06-blast-radius.png" alt="codeweb blast radius: AxiosError selected in the axios graph — its domain expanded in place, 58 users listed in the inspector, cross-domain dependencies lit, neighboring domains highlighted" width="760">
<br><sub>Selecting <code>AxiosError</code> in axios lights up its <b>58 users across the domains that depend on it</b> — try it yourself in the <a href="https://ghostlygawd.github.io/codeweb/">living map</a>.</sub>
</div>

### Navigate the whole system

A force-directed map of every symbol, collapsible to domains. Search, drag, zoom, and click any
node to trace what depends on it and what it reaches.

<img src="assets/screens/05-axios-graph.png" alt="codeweb Graph tab on axios: a force-directed domain map (adapters, helpers, core, cancel, defaults, platform) on a dark canvas" width="100%">

### Findings — stop guessing what to refactor

Ranked **duplication** (the same function defined across many files), the most depended-on
**hotspots** to change with care, and likely-**dead code** — every row clickable to inspect what
calls it and what it calls.

<img src="assets/screens/05-axios-findings.png" alt="codeweb Findings tab on axios: ranked duplication, hotspots, and likely-dead code, with a clickable detail panel" width="100%">

### See duplication density, and where domains tangle

<table>
<tr>
<td width="50%" valign="top">
<img src="assets/screens/05-axios-treemap.png" alt="codeweb Treemap on axios: every file sized by lines of code, duplication density carried by a slate-to-red lightness ramp">
<br><b>Treemap</b> — every file sized by lines of code; the brighter red a block, the more of it
is duplicated. The bright blocks are your consolidation targets, at a glance.
</td>
<td width="50%" valign="top">
<img src="assets/screens/05-axios-matrix.png" alt="codeweb Matrix on axios: a heatmap of call coupling between domains">
<br><b>Matrix</b> — domain-to-domain coupling. A big off-diagonal cell means two domains are
tangled: merge them, or put a clean interface between them.
</td>
</tr>
</table>

<div align="center">
<img src="assets/brand/demo.svg" alt="The codeweb pipeline: extract → cluster → overlap → render, looping" width="840">
<br><sub>The deterministic pipeline, looping: extract → cluster → overlap → render.</sub>
</div>

---

codeweb works at **symbol resolution** — functions, classes, and methods, and the call/import
edges between them. File-level scanners can tell you two *modules* look alike; codeweb tells you
two *functions* are the same work, who calls each, and what merging them would break.

## Benchmarks

- **Finding callers before an edit** — agents found **74%** of a function's real callers with
  codeweb, **44%** with grep, at the same context spend. Missed callers are how edits break
  working code.
- **"What breaks if I change this?"** — one codeweb call, one small answer. Agents grepping
  for the same answer needed ~5 rounds of search and **126× the tokens**, and still guessed.
- **Duplicate detection** — codeweb caught **every planted duplicate with zero false alarms**,
  including renamed copies. Text search catches renamed copies 0% of the time.
- **Trust the answers** — checked against the TypeScript compiler and other independent
  implementations **490,000+ times: zero disagreements**.
- **Speed** — first map in **~3 s** on a 3,000-symbol repo. Queries answer in **~0.1 s**.
  A repo twice the size maps in ~1.3× the time.
- **Known limits** — re-mapping after huge edits is slower than we'd like. On simple tasks,
  agents did fine without codeweb.

Methodology, raw data, and per-claim receipts:
[the evidence ledger](https://ghostlygawd.github.io/codeweb/research.html). Benchmark your own
repo: `npm run bench -- <path>/.codeweb/graph.json`. CI re-runs the performance budgets on
every PR; breaking a published number fails the build.

codeweb also keeps a local tally of what it actually did for you — `npm run stats`:

```
codeweb this month: 41 pre-edit card(s) · 5 card-named caller(s) followed · 2 regression(s) flagged · 120 queries served
```

## Two modes

- **Internal** — map your own codebase and find consolidation opportunities to restructure.
- **External** — clone a third-party repo *read-only* (e.g. a Claude Code plugin you found on
  GitHub), fully map it, and get an adoption review before you commit to using it. codeweb
  never executes target code.

## Install

**Free & MIT-licensed. Runs entirely on your machine — no account, no server, no telemetry. Reads
your code; never executes it.**

- Requires **Node.js ≥ 22**. That's it.
- Zero required dependencies — runs on an empty `node_modules`, CI-verified.
- One *optional* wasm grammar (`web-tree-sitter`) sharpens extraction. Never required.
- Releases publish from CI with **npm provenance**. Verify with `npm audit signatures`.

**Using Claude Code?** The plugin adds the `/codeweb` command, ambient pre-edit impact cards, and
all 27 tools:
```
/plugin marketplace add GhostlyGawd/codeweb
/plugin install codeweb
```
Then restart Claude Code so the `/codeweb` command, agents, and skill register.

**Using Cursor, Windsurf, or another MCP agent?** Register the same zero-dependency stdio server
(shown with Claude Code's syntax — swap in your client's add-server command):
```
claude mcp add codeweb -- npx -y -p @ghostlygawd/codeweb codeweb-mcp
```

**Just want the map — no AI involved?** One command, from your project directory:
```
cd your-project
npx -y @ghostlygawd/codeweb .    # ~3 s for 3,000 symbols — then open .codeweb/report.html
```

*Not sure? Run the npx one-liner — it's the whole map, no install, nothing to undo.*

**Or run the engine from a clone:**
```
git clone https://github.com/GhostlyGawd/codeweb.git
node codeweb/scripts/run.mjs /path/to/your/project
```

Every bin, flag, and exit code is tabled in [`docs/cli.md`](docs/cli.md).

**In your editor:** [`editor/vscode-codeweb`](editor/vscode-codeweb/) shows a
**`N callers · blast M`** lens above every mapped symbol. Click through into the report.

## What you can do

Each link lands on full docs, flags, and examples in **[the reference](docs/reference.md)**.

- **Know before you edit** — who calls this, what breaks, does this already exist.
  → [Query the graph](docs/reference.md#query-the-graph-for-agents--humans) ·
  [context & pre-flight](docs/reference.md#agent-tools--context--pre-flight-context-pack-simulate-edit)
- **Gate every edit** — a structural regression verdict on edits, PRs, and architecture rules.
  → [The `diff` verdict](docs/reference.md#guard-agent-edits-diff) ·
  [the PR gate](docs/reference.md#gate-every-pr-github-action) ·
  [the capability suite](docs/reference.md#agent-capability-suite-write--review--optimize)
- **Clean up, ranked** — consolidation and dead-code work, ordered by evidence.
  → [`optimize`](docs/reference.md#advise-consolidations-optimizemjs) ·
  [`hotspots`](docs/reference.md#find-the-hotspots--where-to-refactor-first-hotspotsmjs) ·
  [`campaign`](docs/reference.md#plan-a-whole-optimization-campaign-campaignmjs) ·
  [`trend`](docs/reference.md#track-duplication-over-time-trendmjs)

## Use

```
/codeweb                                  # map the current project
/codeweb src/payments --depth symbol      # deep-dive one subsystem
/codeweb https://github.com/owner/repo    # external review before adopting
/codeweb owner/repo --open                # clone, map, and open the report
```

Flags: `--depth module|symbol|auto`, `--engine hybrid|read|tools`, `--focus <glob>`,
`--mode internal|external`, `--open`. See `commands/codeweb.md`.

Everything lands in `<target>/.codeweb/` — `graph.json` for machines, `report.html` for you,
markdown twins for both. [Every output file, explained →](docs/reference.md#outputs-under-targetcodeweb)

## Use it as an MCP tool

`scripts/mcp-server.mjs` is a zero-dependency MCP (Model Context Protocol) stdio server. It gives
any MCP client all **27 tools**, grouped by moment: orient, read the structure, check before
writing, gate the edit, clean up.

**Installing the plugin registers the server automatically.** Standalone:

```
claude mcp add codeweb -- npx -y -p @ghostlygawd/codeweb codeweb-mcp
```

Built for agents, not just reachable by them:

- **`graph` is optional everywhere** — the server finds the nearest map on its own. No map yet?
  The error names `codeweb_map`, which builds one.
- **Budgeted responses** — top items and true totals. A context answer that weighed ~300 KB now
  weighs ~10 KB.
- **Staleness awareness** — stale results say so and point at `codeweb_refresh`.

[All 27 tools, grouped and explained →](docs/reference.md#the-mcp-server-tool-by-tool)

## How it works

For JavaScript, TypeScript, Python, Rust, Go, Java, C#, Ruby, PHP, Kotlin, and Swift the default is a **deterministic Node pipeline** — one
command, no LLM in the loop, reproducible byte-for-byte. `scripts/run.mjs` chains five stages
into a per-target workspace:

<div align="center">
<img src="assets/brand/pipeline.svg" alt="codeweb's four deterministic stages: extract, cluster, overlap, render" width="100%">
</div>

1. **Extract** (`extract-symbols.mjs`) — parse every source file into atomic nodes (functions,
   classes, methods) and call/import edges. When a bare call could belong to several definitions,
   codeweb drops the edge rather than guess. Per-file caching keeps re-extraction incremental,
   byte-identical to a full rebuild.
2. **Cluster** (`cluster3.mjs`) — strip genuine utility hubs, then group nodes into
   directory-anchored semantic domains.
3. **Overlap** (`overlap.mjs`) — detect duplicated logic and parallel implementations, then
   confirm each candidate against the real function bodies (token-shingle similarity) so findings
   are body-backed, not name coincidences. A structural pass over identifier-normalized *skeletons*
   also catches renamed (Type-2) clones (`find-similar --structural`).
4. **Render** (`build-report.mjs`) — turn `graph.json` into the self-contained `report.html`
   (and `report.md`).

For languages the extractor can't parse, codeweb **falls back** to the agent path:
`codeweb-dissector` agents extract nodes and edges per subsystem, and `codeweb-domain-mapper`
tags domains and overlaps.

Both paths emit the same `graph.json` schema. In **external** mode, either path appends an
adoption verdict.

Curious how the repo is laid out? [The component map lives in the
reference.](docs/reference.md#components)

## Roadmap

- **More first-class languages** — eleven native today (JavaScript, TypeScript, Python, **Rust**,
  **Go**, **Java**, **C#**, **Ruby**, **PHP**, **Kotlin**, **Swift**); anything else routes through
  the agent fallback. Dynamic-dispatch AST tiers cover JS/TS, Java, C#, Python, Go, Rust, **Ruby**,
  and **PHP**; Kotlin/Swift dispatch waits on a trusted wasm grammar at our pinned ABI
  (recorded in `scripts/grammars/PROVENANCE.md`).

_Recently shipped: the agent-intelligence suite (**hotspots**, **campaign**, **reading-order**,
Type-2 clone detection, suppression memory — 27 tools today) · a
**[live interactive demo](https://ghostlygawd.github.io/codeweb/demo/)** · Go and Rust on the fast
path · duplication-over-time trend · the one-command CI regression gate + GitHub Action._

## Versioning & releases

codeweb follows [Semantic Versioning](https://semver.org/) and keeps a
[Keep a Changelog](https://keepachangelog.com/)-formatted [`CHANGELOG.md`](CHANGELOG.md). Every
capability, benchmark, and fix is recorded there and ships as a **tagged GitHub release**.

One source of truth keeps it honest: the version lives in `package.json`, the MCP tool count in
`scripts/mcp-server.mjs`. Everything else is derived and verified:

```bash
npm run version-sync        # propagate version + tool count -> plugin.json, SKILL.md, README badge
npm run check-consistency   # fail if any public-facing surface has drifted
npm run build:site          # regenerate the docs/ website (zero-dependency, deterministic)
npm run release -- --minor  # roll the changelog, bump, sync, rebuild; prints the git/tag steps
```

`check-consistency` runs in CI. It gates version strings on every surface, every prose mention of
the tool and language counts, the CHANGELOG entry for the current version, and every evidence
file the ledger cites.

## About

Built by [GhostlyGawd](https://github.com/GhostlyGawd). Much of the code was written with AI
agents; the commit co-author trailers say which. Issues and questions welcome. Security
reporting: [`SECURITY.md`](SECURITY.md).

**Stay current:** codeweb never phones home. To hear about new versions, watch Releases on
GitHub (**Watch → Custom → Releases**).

## Support the project

Everything that runs on your machine is **free forever**. No accounts, no telemetry, no license
keys.

[Sponsorship](https://github.com/sponsors/GhostlyGawd) funds development — mainly the AI bills
from benchmarking, and new language support. Details on the
[support page](https://ghostlygawd.github.io/codeweb/support.html).

**Enterprise support**: email support with an SLA, onboarding help, and priority on feature
requests. **$3–6k/yr**, limited to a few customers. Contact via the GitHub profile.

## Handoffs

codeweb's outputs feed naturally into `refactor-cleaner`, `codebase-onboarding`, and `code-tour`,
if you have them. None are required.

The ideal second step either way: apply the top **ready** merge from `optimize.md`, re-run
codeweb, and watch the findings count drop.
