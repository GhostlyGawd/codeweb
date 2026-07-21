<div align="center">

<img src="assets/brand/hero.svg" alt="codeweb — the living map of your codebase" width="840">

[![Claude Code plugin](https://img.shields.io/badge/Claude_Code-plugin-c6f24e?style=flat-square)](#install)
[![zero dependencies](https://img.shields.io/badge/dependencies-zero-3fb950?style=flat-square)](#how-it-works)
[![deterministic engine](https://img.shields.io/badge/engine-deterministic-c6f24e?style=flat-square)](#how-it-works)
[![MCP server](https://img.shields.io/badge/MCP-server-a371f7?style=flat-square)](#use-it-as-an-mcp-tool)
[![version](https://img.shields.io/badge/version-0.9.0-c6f24e?style=flat-square)](CHANGELOG.md)
[![changelog](https://img.shields.io/badge/changelog-Keep_a_Changelog-ffb65c?style=flat-square)](CHANGELOG.md)

**Your coding agent greps. codeweb knows.**

Every serious change starts with the same questions: *who uses this? what breaks if I change it?
does this already exist? is this dead?* Today an agent answers them by grepping and reading whole
files — thousands of tokens per question, and it still guesses. codeweb maps the repo's call/import
graph once (~3 s for 3,000 symbols), then answers those questions **exactly, in milliseconds, for
about a kilobyte each** — as **27 deterministic MCP tools for your agent** (no LLM in the loop) and
a self-contained **interactive map for you**.

Measured on [vite](https://github.com/vitejs/vite) (3,000+ symbols), graded by the TypeScript
compiler as an independent referee ([`bench/results/oracle-ab.json`](bench/results/oracle-ab.json)):

| The question | codeweb | grep |
|---|---|---|
| *"Who depends on X?"* (30 symbols) | **100% of compiler-verified files, better precision than grep, 0.7 KB, one call** | 100% of files but 3× the tokens, as raw text lines the agent must still read |
| *"What breaks if I change X?"* | **one ~1 KB answer** | no transitive operator: ~5 recursive rounds, **126× the tokens** |
| *"Does this already exist? Is this dead? Did my edit break structure?"* | one call each (`find_similar` / `deadcode` / `diff` gate) | not answerable by search |

Don't take vite's word for it — **run the same referee on your own repo**:
`npm run bench -- <path>/.codeweb/graph.json` (context cost always; recall/precision graded by the
TypeScript compiler wherever `typescript` resolves — same engine as the published results).

In the frontier-agent A/B, the same channel lifted caller-discovery recall **+0.27** with
**~34% fewer tool calls and ~44% fewer tokens** than grep. And the byproduct is the part you can
see: the map also surfaces **duplication, dead code, hotspots, and tangled domains** — where your
codebase does the same work twice, which neither you nor the agent can see from inside a file.

**[Website](https://ghostlygawd.github.io/codeweb/)**&nbsp;·&nbsp;[See it in action](#see-it-in-action)&nbsp;·&nbsp;[Install](#install)&nbsp;·&nbsp;[Use](#use)&nbsp;·&nbsp;[For agents (MCP)](#use-it-as-an-mcp-tool)&nbsp;·&nbsp;[How it works](#how-it-works)&nbsp;·&nbsp;[Changelog](CHANGELOG.md)

</div>

---

## See it in action

One command runs the whole deterministic pipeline and drops an interactive map at
`<target>/.codeweb/report.html`. **Every screenshot below is that actual generated report**, codeweb
pointed read-only at **[axios](https://github.com/axios/axios)** — 274 product symbols across 8
areas (tests and tooling hidden by default). No mockups; regenerate them any time with
`node scripts/screenshot.mjs`.

> **▶ Read the full [axios case study](docs/case-study-axios.md):** on a library downloaded ~50M
> times a week, codeweb body-confirmed **3 real duplications** (two byte-identical across files),
> dismissed 12 false positives, and produced a cycle-safe merge plan for each. Or **[click around
> this exact map yourself](https://ghostlygawd.github.io/codeweb/demo/)** — it's live on GitHub Pages.

### Know what an edit breaks — before you write

That's the whole point. Ask *if I change this function, what else moves?* — and codeweb answers from
structure, not a guess. Click any node in the [living map](https://ghostlygawd.github.io/codeweb/) and
its **blast radius** lights up: every function transitively affected, and the domains it crosses. It's
the `codeweb_impact` tool — the same answer an agent gets over MCP, before it writes a line.

<div align="center">
<img src="assets/screens/06-blast-radius.png" alt="codeweb blast radius: AxiosError selected in the axios graph — its area expanded in place, 58 users listed in the inspector, cross-area dependencies lit, neighboring areas highlighted" width="760">
<br><sub>Selecting <code>AxiosError</code> in axios lights up its <b>58 users across the areas that depend on it</b> — try it yourself in the <a href="https://ghostlygawd.github.io/codeweb/">living map</a>.</sub>
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

### See duplication density, and where areas tangle

<table>
<tr>
<td width="50%" valign="top">
<img src="assets/screens/05-axios-treemap.png" alt="codeweb Treemap on axios: every file sized by lines of code, duplication density carried by a slate-to-red lightness ramp">
<br><b>Treemap</b> — every file sized by lines of code; the brighter red a block, the more of it
is duplicated. The bright blocks are your consolidation targets, at a glance.
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

## Proven effective — measured, not just claimed

We didn't only assert codeweb works; we **pre-registered hypotheses and measured it**, applying the
same rigor codeweb brings to code: independent oracles, a pinned cross-language corpus, confidence
intervals, and adversarial review. **32 of 33 pre-registered checks pass** — and the testing was
rigorous enough to **find and fix two real bugs** the engine's own 286-test suite had missed.

- **Correctness held against independent oracles** — **zero observed disagreements across >490,000
  comparisons** (cycles, impact, callers/callees, context-pack); 0 violations over 20,000 edit-safety trials.
- **Detection is accurate** — exact-clone **F1 1.0** (vs 0.67 name-match), renamed-clone recall **1.0
  structural vs 0.0 lexical**, reuse-ranking **MRR 0.99**.
- **It scales** — runtime grows **sub-quadratically** (sub-linear in this corpus, b=0.33); structural
  queries answer in **~95–120 ms** on a 3,201-symbol graph; zero runtime dependencies.
- **It's honest** — the one pass/fail miss (incremental speedup at high churn) is reported as a measured
  curve; the agent A/B capstone returned a null (no headroom on clean tasks) and says so plainly.
- **And it measurably helps a frontier agent** — a post-hoc discovery pilot (Theme-5b, §3.8) found codeweb
  lifts a frontier agent's caller-discovery **recall +0.27** while using **~34% fewer tool-calls** and
  **~44% fewer tokens** than grep (all 8 engine-frozen reps positive); the harder edit-quality capstone
  stays an honest null.

> **▶ Every number above is a receipt — see the [evidence ledger](https://ghostlygawd.github.io/codeweb/research.html).**
> The benchmark harnesses and raw results live in [`bench/`](bench/); every number regenerates with
> `node bench/run-all.mjs`, and `npm run bench:all -- --gate` re-measures the standing budgets
> **in CI on every PR** — a change that breaks a published number fails the build
> ([`bench/budgets.json`](bench/budgets.json) is the promise ledger). (The retired manuscript and
> pre-registration remain in git history, last at `v0.8.0`.)

And the value codeweb delivers during real work is counted where it accrues — the strictly-local
outcome ledger (`npm run stats`, surfaced in every session brief) prints a receipt shaped like:

```
codeweb this month: 41 pre-edit card(s) · 5 card-named caller(s) followed · 2 regression(s) flagged · 120 queries served
```

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

**Or from npm — any repo, any MCP client, no clone:**
```
npx -y @ghostlygawd/codeweb /path/to/your/project --out-dir /path/to/your/project/.codeweb
# then open /path/to/your/project/.codeweb/report.html
claude mcp add codeweb -- npx -y -p @ghostlygawd/codeweb codeweb-mcp   # the 27 MCP tools, pluginless
```
Cursor, Windsurf, or any other MCP client: point it at the same `codeweb-mcp` command.

**Or run the engine from a clone:**
```
git clone https://github.com/GhostlyGawd/codeweb.git
node codeweb/scripts/run.mjs /path/to/your/project --out-dir /path/to/your/project/.codeweb
```

Requires Node.js — the whole deterministic pipeline (extract → cluster → overlap → render) runs
on Node, no external dependencies. Static-analysis tools (universal-ctags, ripgrep, madge, etc.)
are *optional* — they only sharpen the agent fallback path; the default engine reads the code
directly.

**In your editor:** [`editor/vscode-codeweb`](editor/vscode-codeweb/) is a zero-dependency VS Code
extension that shows **`N callers · blast M`** CodeLens above every mapped symbol (served from the
nearest `.codeweb/graph.json`, same numbers as `codeweb_callers`/`codeweb_impact`), with
click-through into the interactive report.

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
| `optimize.md` | The consolidation advisory — duplicate-logic findings tiered **ready / blocked / review**, each pre-flighted against the gate's cycle check (the `optimize.mjs` report). |
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
        with: { target: src, comment: true }   # comment posts the structural review on the PR
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

## Find the hotspots — where to refactor first (`hotspots.mjs`)

In a large repo the first question is *where do I even start?* `hotspots.mjs` answers it with the
**complexity × fan-in × churn** model — the riskiest, most-depended-on, most-churned symbols rank
first. Cyclomatic complexity and max nesting depth are computed during the body scan (every
`function`/`method` node carries `complexity` and `maxDepth`), so this needs no extra tooling; churn
is optional (`--git`, or `--churn <map.json>`).

```
$ node scripts/hotspots.mjs <graph.json>
codeweb hotspots: axios/lib — 253 symbol(s) ranked by complexity x fan-in x churn
  weights: complexity 0.5, fanIn 0.3, churn 0.2
  0.533  adapters/fetch.js:factory  [cx 147 in 1 churn 0]
  0.347  adapters/http.js:httpAdapter  [cx 102 in 0 churn 0]
  0.312  core/mergeConfig.js:mergeConfig  [cx 33 in 6 churn 0]
  0.270  helpers/toFormData.js:toFormData  [cx 50 in 3 churn 0]
```

Every row shows its raw components, so the ranking is auditable rather than a black box. Add `--json`
for machine output; also surfaced as the `codeweb_hotspots` MCP tool.

## Plan a whole optimization campaign (`campaign.mjs`)

`optimize` (ready merges), `deadcode` (safe deletes), and `break-cycles` (verified cuts) are three
separate advisors. `campaign.mjs` composes them into **one ordered, individually-gated, ROI-ranked
worklist** with cumulative projected deltas — "auto-optimize this codebase, at any scale." Crucially,
every step is pre-flighted so that applying the steps **in order** never introduces a cycle that
wasn't there before: a safe campaign is safe as a *sequence*, not merely per step. It is a read-only
plan — codeweb never writes source; the agent (+ the gate) executes each step.

```
$ node scripts/campaign.mjs <graph.json>
codeweb campaign: axios/lib — 80 step(s): 2 cut, 77 delete, 1 merge
  projected: -12 LOC, 2 cycle(s) broken (all steps stay gate-green in order)
  [DELETE] adapters/fetch.js:duplex  (roi 0; +0 LOC, +0 cycle; cumulative -0 LOC)
  …each of 80 steps tagged [CUT|DELETE|MERGE] with its own gate verdict + cumulative delta
```

`--budget N` keeps the top-N ROI prefix; `--json` emits per-step `{op, gate:{ok}, delta, cumulative,
roi}`. Also surfaced as `codeweb_campaign`.

## Onboard in dependency order (`reading-order.mjs`)

To understand a codebase — or one domain — fast, `reading-order.mjs` emits a **foundations-first**
reading path: the depended-upon leaves before the orchestrators that call them, bounded to a budget.
A curated tour instead of blind grep.

```
$ node scripts/reading-order.mjs <graph.json> --budget 6
codeweb reading-order: 6 symbol(s) — read top-down (foundations first):
    1. core/AxiosError.js:AxiosError
        foundation — 18 in-scope caller(s)
    2. cancel/CanceledError.js:CanceledError
        foundation — 5 in-scope caller(s)
    …
```

Scope it with `--scope domain|file|symbol <value>`; cycles degrade gracefully (members ordered by
fan-in, never a crash). Deterministic and read-only; also the `codeweb_reading_order` MCP tool.

## Measured coverage — "is this symbol actually tested?" (`coverage.mjs`)

`codeweb_tests` answers from test-kind call edges (a heuristic). Feed codeweb a real coverage
report and the answers become **measured**:

```
node --test --experimental-test-coverage --test-reporter=lcov > lcov.info   # Node's own runner
node scripts/coverage.mjs .codeweb/graph.json lcov.info                      # or a c8/istanbul JSON
```

Every instrumented symbol gets `covered`/`hits` facts, and `explain`, `--tests`, and
`context-pack` answers say `covered by the recorded run (peak N hits)` or — the loud one —
`⚠ NOT covered by the recorded test run` before an agent edits an unguarded symbol. Optional and
explicit (absent input leaves graphs byte-identical); `codeweb_refresh` drops stale annotations
and says how to restore them.

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
| `find-similar.mjs <graph> --body/--stdin/--signature [--structural]` | **write** | "Does code like this already exist?" — ranks existing bodies by token-shingle similarity (or, with `--structural`, by identifier-normalized *skeleton* similarity, catching renamed/Type-2 clones), so the agent reuses instead of re-implementing. |
| `placement.mjs <graph> --calls <ids>` | **write** | Where a new symbol belongs (domain + file by callee gravity) and whether it duplicates something. |
| `query.mjs <graph> --tests <symbol>` | **write** | The tests that exercise a symbol — run the right subset after an edit. |
| `review.mjs <graph> --changed <files> [--before g] [--gate]` | **review** | Maps a change to its changed symbols, blast radius, domains, and a fan-in-ranked review order; structural regression gate. |
| `fitness.mjs <graph> --rules codeweb.rules.json` | **review** | Checks architectural invariants (forbidden deps, layering, no-cycles, fan-in/loc caps); fails on violation. |
| `risk.mjs <graph> [--changed] [--churn/--git]` | **review** | Ranks symbols by change-risk (fan-in × fan-out × loc × blast × churn) for triage. |
| `codemod.mjs <graph> --merge <ids> --into <id> [--write]` | **optimize** | Plans a consolidation merge (deletions + caller rewrites + projected gate); `--write` applies it, gated + reversible. |
| `break-cycles.mjs <graph>` | **optimize** | For each dependency cycle, the cheapest edge to sever — *verified* to break it. |
| `deadcode.mjs <graph>` | **optimize** | Tiers orphans into safe-to-delete vs review-first (test-guarded / entrypoint-like). |
| `annotate.mjs --suppress <fingerprint> [--note …]` | **review** | Records a false-positive suppression in `.codeweb/annotations.json` (never touches source); `overlap`/`deadcode` then hide that finding and report a `suppressedCount`. Fingerprints are identity-based, so a genuinely *new* issue can't hide behind an old suppression. |

Plus **graph freshness**: `extract-symbols.mjs --cache <path>` re-scans only changed files **and
reuses per-file edges** (incremental edge derivation, guarded by a global symbol-set signature;
`--full` forces a from-scratch rebuild that is byte-identical to the incremental one), and
`refresh.mjs <graph>` re-extracts a graph's nodes+edges from disk so mid-edit queries stay accurate.
Nodes now carry a `signature` (params/returns) and, for functions/methods, `complexity` + `maxDepth`;
edges from test files are a distinct `test` kind (so production `--callers` exclude tests). All of the
above are also exposed over MCP (below).

## Use it as an MCP tool

`scripts/mcp-server.mjs` is a zero-dependency MCP (Model Context Protocol) stdio server exposing all
**27** of codeweb's queries + the capability suite as tools any MCP client can call mid-task:
`codeweb_map` (build/rebuild the graph over MCP), `codeweb_brief` (the day-one repo page —
call it first), `codeweb_find` (concept search — free text like
*"retry backoff"* ranked into starting symbols, no name needed), `codeweb_callers/callees/impact/
cycles/orphans/diff`, the edit-loop tools `codeweb_context/refresh`, the intelligence tools
`codeweb_hotspots/campaign/reading_order`, the pre-flight + hygiene loop
`codeweb_simulate` (the gate's verdict for a hypothetical delete/merge/move — before any edit),
`codeweb_annotate` (false-positive suppression memory, sidecar-only), and `codeweb_stats` (the
local value receipt), plus `codeweb_tests/find_similar/placement/review/
fitness/risk/break_cycles/deadcode/codemod` (the last is plan-only — `--write` is not exposed).

**Installing the plugin registers the server automatically** (`.claude-plugin/plugin.json` carries
the `mcpServers` entry). Standalone — without the plugin — register it from npm (or a clone):

```
claude mcp add codeweb -- npx -y -p @ghostlygawd/codeweb codeweb-mcp
claude mcp add codeweb -- node /abs/path/to/codeweb/scripts/mcp-server.mjs   # clone variant
```

or in an `.mcp.json`:

```json
{ "mcpServers": { "codeweb": { "command": "node", "args": ["/abs/path/to/codeweb/scripts/mcp-server.mjs"] } } }
```

Built for agents, not just reachable by them:

- **`graph` is optional everywhere** — the server resolves the nearest `.codeweb/graph.json` above
  its cwd (or `CODEWEB_WS`). No graph yet? The error names `codeweb_map`, which builds one (~3s for
  a 3k-symbol repo) without leaving MCP.
- **Budgeted responses by default** — list-heavy tools answer with a one-line `summary`, the top-N
  most relevant items, TRUE totals, and an explicit `more.remaining`; `full: true` (or
  `limit`/`offset`) overrides. A `codeweb_context` that used to weigh ~300KB on a busy symbol now
  answers in ~10KB of call-site windows.
- **Staleness awareness** — when the graph no longer matches disk, query results say so and point
  at `codeweb_refresh`.
- The handshake carries `instructions` teaching the loop: *context → edit → refresh → diff-gate*.

## How it works

For JavaScript, TypeScript, Python, Rust, Go, Java, C#, Ruby, PHP, Kotlin, and Swift the default is a **deterministic Node pipeline** — one
command, no LLM in the loop, reproducible byte-for-byte. `scripts/run.mjs` chains five stages
into a per-target workspace:

<div align="center">
<img src="assets/brand/pipeline.svg" alt="codeweb's four deterministic stages: extract, cluster, overlap, render" width="100%">
</div>

1. **Extract** (`extract-symbols.mjs`) — parse every source file into atomic nodes (functions,
   classes, methods) and call/import edges. Unresolved bare calls only wire to a global
   definition when the name is unambiguous; multi-def names drop the edge rather than fabricate a
   false hub. Each function/method node also gets a `signature`, cyclomatic `complexity`, and
   `maxDepth`; edges are cached per file (incremental, byte-identical to a full rebuild) so refreshes scale.
2. **Cluster** (`cluster3.mjs`) — strip genuine utility hubs, then group nodes into
   directory-anchored semantic domains.
3. **Overlap** (`overlap.mjs`) — detect duplicated logic and parallel implementations, then
   confirm each candidate against the real function bodies (token-shingle similarity) so findings
   are body-backed, not name coincidences. A structural pass over identifier-normalized *skeletons*
   also catches renamed (Type-2) clones (`find-similar --structural`).
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
│   ├── optimize.mjs                # advise: rank body-confirmed dups into gated consolidation opportunities
│   ├── context-pack.mjs            # agent context: blast-radius-scoped window to edit a symbol
│   ├── simulate-edit.mjs           # agent pre-flight: predict the gate's verdict for delete/merge/move
│   ├── refresh.mjs                 # F0: re-extract a graph's nodes+edges from disk (cached, fast)
│   ├── find-similar.mjs            # F1: rank existing bodies vs a candidate (reuse-at-write-time)
│   ├── placement.mjs               # F2: suggest a new symbol's domain/file + reuse warnings
│   ├── review.mjs                  # F5: structural review of a change (blast radius, regressions)
│   ├── fitness.mjs                 # F6: architectural fitness-rule checker
│   ├── risk.mjs                    # F7: change-risk ranking for review triage
│   ├── codemod.mjs                 # F8: consolidation edit plan (+ gated/reversible --write)
│   ├── deadcode.mjs                # F10: confidence-tiered dead-code workflow
│   ├── break-cycles.mjs            # F9: cheapest verified cut per dependency cycle
│   ├── hotspots.mjs                # rank symbols by complexity x fan-in x churn (where to refactor first)
│   ├── campaign.mjs                # compose optimize+deadcode+break-cycles into one gated ROI worklist
│   ├── reading-order.mjs           # foundations-first reading path for onboarding (bounded by budget)
│   ├── annotate.mjs                # record false-positive suppressions in .codeweb/annotations.json
│   ├── mcp-server.mjs              # MCP stdio server exposing all queries + the capability suite
│   └── lib/
│       ├── graph-ops.mjs           # shared pure graph primitives (index, cycles, orphans, impact, reviewImpact, …)
│       ├── shingles.mjs            # F1: shared token-shingle/jaccard (also used by overlap.mjs)
│       ├── skeleton.mjs            # identifier-normalized skeleton for Type-2 (renamed) clone detection
│       ├── complexity.mjs          # cyclomatic complexity + nesting depth (the hotspot inputs)
│       ├── dup-check.mjs           # incremental duplication check over changed symbols (edit gate)
│       ├── annotations.mjs         # finding fingerprints + false-positive suppression memory
│       ├── hotspots.mjs            # the complexity x fan-in x churn blend (shared with tests)
│       ├── campaign.mjs            # the ordered/gated/ROI campaign planner (pure)
│       ├── reading-order.mjs       # foundations-first DAG linearization
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

- **More first-class languages** — eleven native today (JavaScript, TypeScript, Python, **Rust**,
  **Go**, **Java**, **C#**, **Ruby**, **PHP**, **Kotlin**, **Swift**); anything else routes through
  the agent fallback. Dynamic-dispatch AST tiers cover JS/TS, Java, C#, Python, Go, Rust, **Ruby**,
  and **PHP**; Kotlin/Swift dispatch waits on a trusted wasm grammar at our pinned ABI
  (recorded in `scripts/grammars/PROVENANCE.md`).

_Recently shipped: an **agent-intelligence suite** — refactoring **hotspots** (complexity × fan-in ×
churn), a gated ROI-ranked optimization **campaign** planner, a foundations-first **reading-order**,
**Type-2 (renamed) clone** detection, false-positive **suppression memory**, and **5 new MCP tools
(20 total)** · a **[live interactive demo](https://ghostlygawd.github.io/codeweb/demo/)** on GitHub
Pages · Go and Rust on the fast path · duplication-over-time trend (`trend.mjs`) · a one-command CI
regression gate + GitHub Action._

## Versioning & releases

codeweb follows [Semantic Versioning](https://semver.org/) and keeps a
[Keep a Changelog](https://keepachangelog.com/)-formatted [`CHANGELOG.md`](CHANGELOG.md). Every new
capability, benchmark, or fix is recorded there and shipped as a **tagged GitHub release** — product,
marketing, and research move as one front, never lost in commit history.

One source of truth keeps it honest. The version lives in `package.json`; the MCP tool count lives in
`scripts/mcp-server.mjs`. Everything else is derived and verified:

```bash
npm run version-sync        # propagate version + tool count -> plugin.json, SKILL.md, README badge
npm run check-consistency   # fail if any public-facing surface has drifted
npm run build:site          # regenerate the docs/ website (zero-dependency, deterministic)
npm run release -- --minor  # roll the changelog, bump, sync, rebuild; prints the git/tag steps
```

`check-consistency` runs in CI, applying codeweb's own "fail on regression" philosophy to its public
comms — the reason this README and the plugin manifest can't quietly disagree about how many tools
ship.

## Handoffs

codeweb's domain map and overlap list feed naturally into `refactor-cleaner` (act on the
consolidation list), `codebase-onboarding` (use the domain map for a guide), and `code-tour`
(anchor a tour to the symbol index).
