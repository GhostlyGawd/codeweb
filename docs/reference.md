# codeweb reference

Every tool, output, and workflow — the full detail behind the [README](../README.md).
Bins, flags, environment variables, and exit codes are tabled separately in [`cli.md`](cli.md).

- [Outputs](#outputs-under-targetcodeweb)
- [Query the graph](#query-the-graph-for-agents--humans)
- [Guard agent edits (`diff`)](#guard-agent-edits-diff)
- [Gate every PR (GitHub Action)](#gate-every-pr-github-action)
- [Advise consolidations (`optimize.mjs`)](#advise-consolidations-optimizemjs)
- [Track duplication over time (`trend.mjs`)](#track-duplication-over-time-trendmjs)
- [Find the hotspots (`hotspots.mjs`)](#find-the-hotspots--where-to-refactor-first-hotspotsmjs)
- [Plan an optimization campaign (`campaign.mjs`)](#plan-a-whole-optimization-campaign-campaignmjs)
- [Onboard in dependency order (`reading-order.mjs`)](#onboard-in-dependency-order-reading-ordermjs)
- [Measured coverage (`coverage.mjs`)](#measured-coverage--is-this-symbol-actually-tested-coveragemjs)
- [Context & pre-flight (`context-pack`, `simulate-edit`)](#agent-tools--context--pre-flight-context-pack-simulate-edit)
- [The agent capability suite](#agent-capability-suite-write--review--optimize)
- [The MCP server, tool by tool](#the-mcp-server-tool-by-tool)
- [Components](#components)

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

Once `graph.json` exists, `scripts/query.mjs` answers the structural questions agents need
before they edit — read-only, deterministic, no LLM in the loop:

```
node scripts/query.mjs <graph.json> --impact  <symbol>   # blast radius: transitive callers + domains touched
node scripts/query.mjs <graph.json> --callers <symbol>   # direct callers
node scripts/query.mjs <graph.json> --callees <symbol>   # direct callees
node scripts/query.mjs <graph.json> --cycles             # file-level dependency cycles (SCCs)
node scripts/query.mjs <graph.json> --orphans            # uncalled & unexported (dead-code candidates)
```

`<symbol>` is a node id (`file:label`) or a bare label. A label matching several nodes operates
on the union. Add `--json` for machine-readable output.

Exit codes: `0` success, `1` symbol not found, `2` usage/IO error. Example:

```
$ node scripts/query.mjs .codeweb/graph.json --impact lib/state-store/index.js:get
impact of lib/state-store/index.js:get: 120 functions across 12 domains
```

> `--orphans` is a *candidate* list: codeweb prefers a missing edge to an invented one, so
> genuinely-called functions and entrypoints can surface here — cross-check before deleting.

## Guard agent edits (`diff`)

`scripts/diff.mjs` compares two `graph.json` snapshots (before vs after an edit) and flags
structural **regressions**, so it can run as a PostToolUse hook or CI gate:

```
node scripts/diff.mjs <before.json> <after.json> [--json]
```

The verdict:

- **Exits 1** on a new cycle, a new duplication, or a symbol that loses all its callers.
- **Exits 0** on pure removals. Deleting code is an improvement, not a regression.
- A brand-new uncalled function never trips it — agents add functions before wiring them up.

## Gate every PR (GitHub Action)

`scripts/ci-gate.mjs` runs the same verdict on every pull request. It maps the PR base and head,
then **fails the build on a structural regression**.

Drop it into any repo (full spec: [`ci-gate.md`](ci-gate.md)):

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

Each opportunity lands in one of three tiers:

- **ready** — the copies match, and the simulated merge passes the gate. Safe to apply.
- **blocked** — the naive merge would create a new dependency cycle. Needs a neutral home first.
- **review** — the copies have drifted, or confidence is structural-only. A human (or agent) decides.

For each merge it names the surviving copy and reports what gets removed, which callers get
rewired, and the lines reclaimed. It is **advisory only** — it never writes code; applying the
merge stays a human + gate decision.

## Track duplication over time (`trend.mjs`)

A one-shot map tells you where you are; `trend.mjs` tells you which way you're heading — is the
codebase consolidating or sprawling? It charts **body-confirmed duplication** and **cross-domain
coupling** across snapshots, with a sparkline and a rising/falling verdict:

```
node scripts/trend.mjs --git <repo> --last 10 [--focus <subdir>] [--json]   # snapshot the last N commits
node scripts/trend.mjs a.json b.json c.json [--labels …] [--json]           # or chart pre-built snapshots
```

`--git` maps each of the last N commits in an ephemeral worktree. Your working tree stays
untouched. Watch duplication trend down as you consolidate — or catch it creeping up in review.

## Find the hotspots — where to refactor first (`hotspots.mjs`)

In a large repo the first question is *where do I even start?* `hotspots.mjs` ranks every symbol by
**complexity × fan-in × churn** — the riskiest, most-depended-on, most-churned code first.
Complexity comes free from the body scan; churn is optional (`--git`, or `--churn <map.json>`).

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

`campaign.mjs` composes the three advisors — `optimize`, `deadcode`, `break-cycles` — into **one
ordered, ROI-ranked worklist**. Applying the steps in order never introduces a new cycle.

The plan is read-only. codeweb never writes source; your agents (plus the gate) execute each step.

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

Every instrumented symbol gets `covered`/`hits` facts. Query answers then say `covered by the
recorded run` — or, the loud one, `⚠ NOT covered by the recorded test run` — before agents edit
an unguarded symbol.

The feature is optional. Without a coverage input, graphs are byte-identical to before.

## Agent tools — context & pre-flight (`context-pack`, `simulate-edit`)

Two read-only tools that move work off the LLM and into the graph:

```
node scripts/context-pack.mjs  <graph.json> <symbol> [--json]   # minimal context to edit <symbol>
node scripts/simulate-edit.mjs <graph.json> --delete <sym> | --merge <a,b> [--into <id>] | --move <sym> --to <file>
```

`context-pack` returns everything agents need to edit one symbol: its body, its callers with call
sites, its callees, and the impact set. Agents work from a small window instead of whole files.

`simulate-edit` predicts the gate's verdict for a delete, merge, or move **without performing
it**. Doomed edits get discarded before any code is written.

Both share `optimize.mjs`'s graph primitives, pinned by property tests.

## Agent capability suite (write · review · optimize)

A set of read-only, deterministic tools that make agents better at the three jobs — each pinned by
property tests against an independent reference implementation
(full spec: [`agent-tools-v2.md`](agent-tools-v2.md)):

| Tool | Job | What it answers |
|---|---|---|
| `find-similar.mjs <graph> --body/--stdin/--signature [--structural]` | **write** | "Does code like this already exist?" — ranks existing bodies by similarity to a candidate; `--structural` also catches renamed (Type-2) clones. Reuse instead of re-implementing. |
| `placement.mjs <graph> --calls <ids>` | **write** | Where a new symbol belongs (domain + file by callee gravity) and whether it duplicates something. |
| `query.mjs <graph> --tests <symbol>` | **write** | The tests that exercise a symbol — run the right subset after an edit. |
| `review.mjs <graph> --changed <files> [--before g] [--gate]` | **review** | Maps a change to its changed symbols, blast radius, domains, and a fan-in-ranked review order; structural regression gate. |
| `fitness.mjs <graph> --rules codeweb.rules.json` | **review** | Checks architectural invariants (forbidden deps, layering, no-cycles, fan-in/loc caps); fails on violation. |
| `risk.mjs <graph> [--changed] [--churn/--git]` | **review** | Ranks symbols by change-risk (fan-in × fan-out × loc × blast × churn) for triage. |
| `codemod.mjs <graph> --merge <ids> --into <id> [--write]` | **optimize** | Plans a consolidation merge (deletions + caller rewrites + projected gate); `--write` applies it, gated + reversible. |
| `break-cycles.mjs <graph>` | **optimize** | For each dependency cycle, the cheapest edge to sever — *verified* to break it. |
| `deadcode.mjs <graph>` | **optimize** | Tiers orphans into safe-to-delete vs review-first (test-guarded / entrypoint-like). |
| `annotate.mjs --suppress <fingerprint> [--note …]` | **review** | Records a false-positive suppression in `.codeweb/annotations.json` (never touches source); `overlap`/`deadcode` then hide that finding and report a `suppressedCount`. Fingerprints are identity-based, so a genuinely *new* issue can't hide behind an old suppression. |

Plus **graph freshness**: `refresh.mjs` re-extracts from disk, so mid-edit queries stay accurate.
The cache re-scans only changed files. Test-file edges carry a distinct `test` kind, so
production `--callers` answers exclude tests.

## The MCP server, tool by tool

`scripts/mcp-server.mjs` exposes all **27** of codeweb's tools to any MCP client. In the order
your agents meet them:

- **Orient** — `codeweb_map` builds the graph; `codeweb_brief` is the day-one repo page (call it
  first); `codeweb_find` turns free text like *"retry backoff"* into ranked starting symbols.
- **Read the structure** — `codeweb_callers`, `callees`, `impact`, `cycles`, `orphans`, `tests`,
  and `explain` (one symbol, everything known about it).
- **Before writing** — `codeweb_find_similar` (does this already exist?), `placement` (where does
  a new symbol belong?), `context` (the minimal window needed to edit a symbol).
- **Gate the edit** — `codeweb_simulate` (the gate's verdict for a delete/merge/move, before any
  edit), then `refresh` + `diff` after it; `review`, `fitness`, and `risk` for PR time.
- **Clean up** — `codeweb_hotspots`, `deadcode`, `break_cycles`, `campaign`, `reading_order`,
  `codemod` (plan-only over MCP — `--write` is not exposed).
- **Housekeeping** — `codeweb_annotate` (false-positive suppressions, kept in a sidecar, never in
  source) and `codeweb_stats` (the local value receipt).

Register it from npm (or a clone):

```
claude mcp add codeweb -- npx -y -p @ghostlygawd/codeweb codeweb-mcp
claude mcp add codeweb -- node /abs/path/to/codeweb/scripts/mcp-server.mjs   # clone variant
```

or in an `.mcp.json`:

```json
{ "mcpServers": { "codeweb": { "command": "node", "args": ["/abs/path/to/codeweb/scripts/mcp-server.mjs"] } } }
```

The handshake carries `instructions` teaching the per-edit loop: *context → edit → refresh →
diff-gate*.

## Components

```
codeweb/
├── .claude-plugin/plugin.json
├── commands/codeweb.md              # /codeweb trigger
├── scripts/                         # the deterministic engine (default fast path)
│   ├── run.mjs                      # orchestrator — one command, runs all stages per target
│   ├── extract-symbols.mjs         # stage 1: source -> atomic nodes + edges (all 11 native languages)
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
├── agents/                          # fallback path (unparseable langs / no deterministic engine)
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
