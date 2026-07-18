# codeweb — Product Review: Good → Great

**Date:** 2026-07-18 · **Scope:** UI/UX, Features, Actual Performance, and a strategy for making codeweb a tool that makes agents more capable, intelligent, efficient, effective, and aware — while decreasing token usage.

**Method:** everything below was measured, not assumed. The pipeline was run against three real targets (codeweb itself, `axios/lib`, and the full `vitejs/vite` monorepo at HEAD — 3,031 symbols); every query tool was timed and its output measured; the MCP server was driven over raw stdio (initialize / tools/list / tools/call, including error paths); `report.html` was driven in headless Chromium (load time, frame rate, heap, search, click, accessibility probe); the full test suite was run (370 tests: 350 pass, 0 fail, 20 skipped without optional tree-sitter). Two independent deep reviews (engine + integration surface) fed this document. File references are `path:line`.

---

## Executive summary

codeweb's **engine is genuinely good**: zero-dependency, deterministic, fast (full pipeline on the vite monorepo in 2.8s; structural queries in ~100–140ms, matching the paper's claims), with an unusually honest measurement culture (pre-registered paper, null results disclosed, consistency CI, property tests against independent oracles). The report renders 3,031 nodes at 60fps from a 278ms cold load in a self-contained file. This is a real foundation, not a demo.

What stands between good and great is not the engine — it's **the interface between the engine and the agent**, plus a precision layer the rankings need. Today:

1. **The token story is inverted at the tool boundary.** The product exists to save agent tokens, yet a single MCP call can return **265KB (~66k tokens)** (`codeweb_deadcode` on vite) or **306KB** (`codeweb_context`) — enough to blow the entire context (Claude Code truncates MCP tool output around 25k tokens, so the agent receives clipped JSON). No tool has a limit, cursor, or summary mode.
2. **A P0 output-truncation bug corrupts large results anyway:** every CLI ends with `process.stdout.write(JSON.stringify(payload)); process.exit(0)`, which silently drops everything past the 64KB pipe buffer. Piped CLI output truncates at exactly 65,536 bytes; MCP responses truncate nondeterministically mid-JSON (observed 152KB delivered of 306KB).
3. **The headline capability isn't installed by the plugin.** `.claude-plugin/plugin.json` wires only hooks — no `mcpServers` — so the "20 deterministic query tools" require a separate manual `claude mcp add` with an absolute path the marketplace user never sees. ~7 steps from "found the repo" to "agent uses the graph."
4. **Ranking precision fails on real-world repos.** On vite, the top "duplication" findings are Rollup plugin hooks (`resolveId()` "defined in 32 files — merge these"), the top HIGH body-confirmed recommendation is to merge 23 intentionally-isolated `playground/` test-fixture helpers, and the top fan-in "symbols" include the test global `expect` (215 callers) and property names `id`/`url`. An agent that trusts top-N here gets worse, not better.
5. **Awareness is missing at the right moment.** Nothing nudges an agent *before* an edit; the only always-on integration is a *post*-edit hook that re-extracts the whole repo on every edit (ignoring the engine's own `--cache`); queries happily serve a stale graph with no staleness signal.

The strategic pivot: **stop being a database that dumps query results; become an advisor that returns decisions with drill-down handles** — auto-registered, auto-discovered, auto-fresh, and budgeted to ~1k tokens per answer. The measured plan below cuts a typical 12-call agent session from ~630KB of raw tool output (~157k tokens; ~65k even after client-side clipping) to ~14KB (~3.5k tokens) — a 20–40× reduction — while making the answers *more* actionable.

---

## 1. Actual Performance (measured)

### 1.1 What is fast — claims verified

| Measurement | Result | README/paper claim | Verdict |
|---|---|---|---|
| Full pipeline, codeweb itself (912 nodes / 2,556 edges) | **1.18s** | — | ✓ |
| Full pipeline, axios/lib (303 / 490) | **0.51s** | — | ✓ |
| Full pipeline, vite monorepo (3,031 / 4,795, 82 domains) | **2.84s** | sub-quadratic scaling | ✓ consistent |
| `--impact` / `--callers` / `--cycles` / `--orphans` / `context-pack` / `hotspots` / `risk` / `deadcode` on the 3,031-node graph | **101–138ms** each | "~95–120ms on a 3,201-symbol graph" | ✓ honest claim |
| MCP round-trip (spawn included) | **75–122ms** | — | ✓ |
| `report.html` cold load (vite, 1.9MB file) | **278ms**, 60fps sustained, 10MB JS heap | self-contained, no CDN | ✓ genuinely well-engineered |
| Test suite | **370 tests, 350 pass, 0 fail**, 20 skipped (optional tree-sitter absent), 41s | "286-test suite" | ✓ grown since |

### 1.2 What is slow or broken

- **`campaign.mjs`: 8.9s** on vite while every other tool is ~100ms (`scripts/campaign.mjs`). It re-runs the cycle gate per step across the whole worklist. Needs memoized SCC/adjacency reuse across steps — this is the "auto-optimize at any scale" flagship and it's 80× slower than everything else. `review.mjs` (639ms) and `reading-order.mjs` (367ms) are mild outliers.
- **P0 — silent 64KB truncation of large outputs.** `process.stdout.write(JSON.stringify(payload) + '\n'); process.exit(0)` at `scripts/context-pack.mjs:68`, `scripts/deadcode.mjs:73`, `scripts/query.mjs:91,115` (pattern repeated across the CLIs). Node drops unflushed pipe output on `process.exit`. Measured: `context-pack --json` on vite writes 306,431 bytes to a file but **exactly 65,536 bytes through a pipe**; via MCP (`spawnSync` reader) 152,011 bytes arrived — nondeterministic, mid-string truncation, invalid JSON. Any agent or script consuming large results gets corrupted data today. Fix: write via a drain-aware helper (or `console.log` + natural exit; set `process.exitCode` instead of calling `exit()`).
- **Incremental extraction barely pays.** `--cache` on vite: 907ms cold → 775ms warm (~15%). The per-file mtime/hash scan plus Node startup dominates. Not harmful, but the "incremental" story doesn't yet deliver at watch-loop frequency (see the post-edit hook below, which doesn't even use it).
- **`run.mjs` path-resolution bug + crash UX.** Stages run with `cwd: ROOT` (`scripts/run.mjs:42`), so a **relative `<SRC>` resolves against the plugin root**, while a relative `--out-dir` resolves against the caller's cwd (`run.mjs:34`). `node run.mjs axios/lib --out-dir out` from another directory fails with a raw `execFileSync` stack trace (`status: 1, stdout: null, stderr: null`) instead of a one-line error. Resolve `opts.src` against the caller's cwd before spawning, and wrap stage failures in a clean message.

### 1.3 Token cost of tool outputs — the inverted story

Measured on the vite graph (bytes of tool output; tokens ≈ bytes/4):

| Tool | Output today | ≈ tokens | Note |
|---|---|---|---|
| `tools/list` (once per session) | 8,575 B | ~2.1k | 20 schemas; fine, could tighten |
| `codeweb_callers` | 5.1 KB | ~1.3k | acceptable |
| `codeweb_impact` | 16.4 KB | ~4.1k | lists all 259 impacted ids |
| `codeweb_cycles` | 5.4 KB | ~1.3k | acceptable |
| `codeweb_orphans` | 60.5 KB | ~15k | unbounded list |
| `codeweb_deadcode` | **265.8 KB** | **~66k** | unbounded; exceeds Claude Code's MCP output cap → clipped JSON |
| `codeweb_campaign` | 78.4 KB | ~20k | all 80+ steps, full detail |
| `codeweb_context` | **306 KB** (JSON) | **~76k** | full body of *every* caller (88×) |
| `codeweb_hotspots` / `codeweb_risk` | ~1.5 KB | ~400 | **the model to copy** — top-N, scored, auditable |
| `report.md` (vite) | 172 KB | — | leads with an 82-node mermaid graph; unusable as agent context |

Two design facts drive the blowups: (a) no tool has a `limit`/`top`/cursor — every list is exhaustive; (b) `codeweb_context` embeds the **entire body of every caller** rather than call-site windows — and body-span bugs (§3.2) inflate some "bodies" by hundreds of unrelated lines. `hotspots`/`risk` prove the team already knows the right shape; it just isn't the default everywhere.

---

## 2. UI/UX Review

### 2.1 report.html — strong bones, real gaps

**Genuinely good:** self-contained single file (works from `file://`, air-gapped); 278ms load and 60fps at 3k nodes on canvas with a 10MB heap; **Treemap** is the best view (clear hierarchy, LOC×duplication shading, `packages/vite · 1807` reads instantly); **Matrix** has a plain-language legend ("rows call columns · blue = cross-area dependency (tangling)"); the header stat line gives instant scale.

**Gaps, in priority order:**

1. **No product/test separation — the map is drowned by fixtures.** On vite, ~70 of 82 domain bubbles are `playground/*` test fixtures; the actual product is one bubble among them. Findings, Matrix rows, and the mermaid in `report.md` all lead with fixture noise. One `role: test|fixture|example|generated|product` tag per node (path heuristics + `test` edge kind already exist) and a default "product-first" filter with a toggle would transform every tab at once.
2. **Findings tab presents interface patterns as duplication.** Top entries: `resolveId()` ×32 files, `load()` ×31, `transform()` ×25, `handler()` ×24 — Rollup/Vite plugin hooks, i.e. *intentional* same-name implementations, labeled "merge these — same function defined in many files." This is the tab agents and humans act on; its top advice on a flagship repo is wrong. (See §3.3 for the fix.)
3. **Search doesn't navigate.** Typing `normalizePath` + Enter dims the canvas but does not zoom to, select, count, or list matches; the detail panel still says "Pick an item to inspect it." Expected: incremental result list, match count, Enter → zoom + select + populate the panel.
4. **Accessibility is zero.** Probe results: 0 `aria-*`/`role` attributes, 0 tabbable elements, all-canvas rendering — invisible to screen readers, unusable by keyboard. At minimum: keyboard tab-switching, a DOM-mirrored node list for the current selection, focus management, `prefers-reduced-motion` for the force layout.
5. **Symbol-level view is a dot cloud.** "Expand symbols" renders 3,031 unlabeled translucent dots; hit targets are a few pixels (a scripted click at canvas center selected nothing). Needs zoom-dependent labeling, hover tooltips, click-radius forgiveness, and a "neighborhood" mode (selected node + N hops) instead of all-nodes.
6. **Small polish:** the header engine caption truncates into jargon ("de-hubbed dir-seeded call-cohesi…"); domain labels collide at load until the layout settles; no deep links (`report.html#symbol=…`) so findings can't be shared or opened from tool output; no jump-to-editor (`vscode://file/...`) from the detail panel — the report is where a human decides to act, and today the action is manual navigation.

### 2.2 CLI ergonomics

- The `hotspots`/`risk`/`campaign` text outputs are compact and auditable (scores with components) — good.
- `run.mjs` relative-path bug + raw stack traces (§1.2) is the first-run experience for anyone not copy-pasting absolute paths.
- Piped output truncation (§1.2) breaks `| jq`, `| head`, and any agent using the CLI directly.
- Exit codes are documented and sensible (`0/1/2`), and `--json` is consistently available — good agent hygiene, undermined only by the truncation bug.

### 2.3 Onboarding (from the integration review, verified)

- `.claude-plugin/plugin.json` registers **hooks only** — no `mcpServers`, no `.mcp.json` in the repo. The README's headline ("20 deterministic query tools for your coding agent") requires the buried manual step `claude mcp add codeweb -- node /abs/path/...` (`README.md:384`) with a path a marketplace install never surfaces. **This is the #1 adoption cliff.**
- Nothing auto-builds the graph; a missing graph yields `graph not found: <path>` with no "run `/codeweb` first" hint (`scripts/query.mjs:48` → `scripts/mcp-server.mjs:107-109`).
- Doc drift: README/SKILL say "four stages" while `run.mjs:46-50` runs five (optimize is in the chain); `SKILL.md` omits three of the six outputs; `--open` is documented (`commands/codeweb.md:26`) but `run.mjs:20-27` never parses it — silently inert; three generations of agent-tool specs (`docs/agent-tools.md`, `-v2`, `tier0-3-spec`) with no "superseded" markers; SKILL/README reference handoff plugins (`repo-scan`, `refactor-cleaner`, …) that don't ship with the plugin.
- The consistency gate (`scripts/release-utils.mjs:74-107`) genuinely enforces version/tool-count across five files — but misses `mcp-server.mjs:30`, which still advertises `version: '0.1.0'` on a `0.2.0` product. The one component an MCP client handshakes with is the one the gate doesn't watch.

---

## 3. Features Review

### 3.1 What's genuinely strong (keep and lean on)

- **Layered architecture with one oracle.** Producers (`extract → cluster3 → overlap → build-report`) and ~18 consumers compose via `graph.json`. `optimize`, `simulate-edit`, and `codemod` all project edits through the *same* `applyEdit` + `structuralRegressions` in `scripts/lib/graph-ops.mjs` (:236, :217) — the "projected gate verdict" really is one truth. `lib/shingles.mjs` is shared by overlap/find-similar/dup-check.
- **Thoughtful gate semantics.** Pure removals pass; a brand-new uncalled function doesn't trip the gate (agents wire code after writing it); suppressions are identity-fingerprinted so new issues can't hide behind old ones (`scripts/annotate.mjs`).
- **Test culture is real.** Subprocess characterization against shipped artifacts; property tests with *independent naive oracles* (`tests/_proptest.mjs`); A/B env levers (`CODEWEB_LEGACY_FALLBACK`, …) that prove fixes are load-bearing by turning them off. This is rare and worth protecting.
- **The masked-scan extractor is disciplined** (comments/strings/docstrings masked before scanning; precision-over-recall edge gate at `extract-symbols.mjs:667-689` that drops ambiguous calls rather than fabricating hubs).

### 3.2 Correctness gaps that poison downstream features

The extractor is regex/scanner-based (tree-sitter tier is JS/TS-only and optional). Verified failure modes, each with downstream cost:

1. **Body-span overrun (measured, high impact).** On vite, 70/3,031 nodes claim `loc > 200`; spot-checks: `cleanUrl` (really 5 lines) recorded as **550**, `resolveBaseUrl` (really ~39) as **605** — the brace scanner desyncs (IIFE-as-argument, optional-chaining calls, multi-line template literals are the suspects since string state is line-local) and swallows neighboring functions. This inflates `context-pack` bodies, corrupts `complexity`/`maxDepth` (hotspots), and skews body-confirmation for duplication.
2. **ID collisions.** Node id is `file:name` (`extract-symbols.mjs:402`), deduped only by `name:line` (:380) — so same-named methods in one file (Python methods across classes, Rust `fn` across `impl`s, Go methods across receivers — receiver type discarded at :218) produce **duplicate node ids**, corrupting `byName`, edge attribution, and `diff` keys. The tree-sitter tier qualifies `Class.method` for JS/TS only (`scripts/lib/ts-engine.mjs:159`).
3. **Name-collision edges in monorepos (measured).** `create-vite` template files "call" vite's `normalizePath`; the Matrix's playground→vite coupling is partly fictitious; the top fan-in "symbols" include test-global `expect` (215 callers) and property names `id`/`url`. Unique-global resolution (:677-682) needs package/workspace scoping (see `lib/shards.mjs`, §3.4).
4. **Bare identifiers passed as arguments become `call` edges** (`extract-symbols.mjs:704, 751`) — `render(user, config)` fabricates a call to a function named `config`. Should be a distinct `ref` kind (the edge model already has kinds).
5. **Missed symbols:** class-field arrow methods (`handleClick = () => {}` — the standard React pattern) are missed by both tiers (`ts-engine.mjs:155` collects only `method_definition`); object-property functions (`const api = { get: () => {} }`); decorators can fabricate edges from enclosing scope; `export * from` unhandled (:513); dynamic imports dropped.

### 3.3 Ranking/advice gaps (the "intelligence" layer)

- **No code-role model.** Nothing distinguishes product code from tests/fixtures/examples/generated code, so: vite's top HIGH (body 93%) recommendation is to merge 23 `playground/*` fixture `text()` helpers — following it would damage vite's test isolation; `deadcode`/`orphans` list fixture entry points; hotspots rank test scaffolding. A `role` tag + default product-scope for rankings fixes the whole class.
- **No interface-pattern detection.** Same name + same signature + disjoint callers across many files (plugin hooks, visitor methods, handlers) is a *pattern*, not duplication. A cheap heuristic (N same-name implementations each called by different framework paths, near-zero body similarity variance across group) would demote the `resolveId()`×32 class of findings.
- **`campaign` delete-ROI is always 0** (real bug): `lib/campaign.mjs:33` reads `locSaved` that `deadcode.mjs:57` never emits (its items are `{id,file,domain,reason,fingerprint}`; `orphans()` returns `{id,file,domain}` at `graph-ops.mjs:207`) — masked by a test fixture that fabricates `locSaved: 2` (`tests/campaign.test.mjs:49`). The flagship ROI-ranked worklist under-ranks every delete step.

### 3.4 Built-but-unwired / missing features

- **`lib/shards.mjs` (monorepo sharding) is implemented and tested but wired to no CLI and no MCP tool** — exactly the workspace awareness that would fix §3.2.3. Wire it or delete it.
- **No staleness detection.** No tool compares graph meta against source mtimes/hashes; queries silently serve stale maps. `refresh.mjs` is manual and unconditionally rewrites.
- **No watch/daemon mode**; every MCP call spawns a fresh Node process and re-parses the 1.8MB graph (fine at 100ms, but forecloses sub-ms queries, sessions, and push staleness).
- **No rename tracking** in `diff` (a rename reads as delete+add → false `lostCallers`).
- **MCP exposes a subset of CLI power:** `find_similar` is signature-mode only (no `--body`/`--structural` — the Type-2 clone detection the README advertises), `review` can't take `--before`/`--gate`, `reading_order` can't take scope/budget. Agents get the weakest form of each tool.
- **Language coverage:** JS/TS/Py/Rust/Go only; no C/C++/Java/C#/Ruby/PHP/Kotlin/Swift. Fine to sequence later; the near-term win is making the five supported languages *trustworthy* (§3.2).
- **Ironic self-duplication:** `die()` defined in 16 scripts, the graph-load block in 13, the `CODEWEB_WS` fallback in 11, a hand-rolled arg loop in each (`query.mjs:24,47-53`, `optimize.mjs:30,43-47`, + 14 more). codeweb's own `overlap` output on itself flags this ("extractGraph and <module> call the same 63% of helpers" — and prints that finding 3× as ov92/ov93/ov94, a dedup miss in findings emission). A ~40-LOC `lib/cli.mjs` deletes ~250 LOC and makes the dogfood story credible.

---

## 4. Strategy: the agent-native leap (capable · intelligent · efficient · effective · aware — with fewer tokens)

The unifying thesis: **codeweb currently answers like a database (exhaustive rows); agents need it to answer like a staff engineer (a decision, the top evidence, and a handle to drill down).** Every recommendation below is one of five properties, and all of them *reduce* tokens.

### 4.1 Efficient — budgeted, progressively-disclosed responses (the 20× token cut)

Adopt one response contract for every tool:

```json
{
  "summary": "editing normalizePath touches 259 fns across 11 domains (4 outside this package)",
  "top": [ /* N most relevant items, ranked, with why */ ],
  "totals": { "impacted": 259, "domains": 11 },
  "more": { "cursor": "impact:normalizePath:15", "remaining": 244 }
}
```

- Default `limit` ≈ 15 with a `cursor` for the rest; `full: true` opt-in for the old behavior.
- `codeweb_context`: call-site **windows** (± 3 lines around the call) instead of whole caller bodies; callees as signatures; impact as counts + top ids. Measured effect: 306KB → ~2.5KB (**99% cut**) and the payload becomes *more* useful (the agent wants the call sites, not 88 full functions).
- `codeweb_impact`: summary + domains + top-15 by fan-in → 16.4KB → ~1KB.
- `deadcode`/`orphans`/`campaign`: tier counts + top-N + cursor → 265KB → ~1.5KB.
- Fix the 64KB flush bug (§1.2) so even `full: true` is correct.
- Net for a representative 12-call session (context, impact ×2, callers ×3, cycles, deadcode, hotspots, review, refresh, diff): **~630KB raw (~157k tokens) today — of which ~65k tokens actually reach the model after client-side clipping mangles the two biggest responses — → ~14KB (~3.5k tokens)**, all of it valid JSON. That's the "decreasing token usage" promise made real.
- The paper already has the harness to prove it: re-run the Theme-5b efficiency pilot against budgeted responses and publish tokens-per-task. (Current honest claim: "~44% fewer tokens than grep" — with budgets it should be >90% on the same tasks.)

### 4.2 Effective — zero-friction path from install to first answer

1. **Auto-register the MCP server in `plugin.json`** (`mcpServers` with `${CLAUDE_PLUGIN_ROOT}/scripts/mcp-server.mjs`). One install = 20 tools. This single line is the highest-leverage change in the repo.
2. **Make `graph` optional on every tool.** Resolution order: explicit arg → walk up from cwd to `.codeweb/graph.json` → `CODEWEB_WS`. The CLIs already have the env fallback (`query.mjs:47`); the MCP layer bypasses it by always passing `args.graph` (`mcp-server.mjs:105`). This deletes the recurring per-call path-threading tax and its guess-wrong failure mode.
3. **Auto-build on first need:** when no graph exists, return `"no graph yet — call codeweb_map (or run /codeweb) to build one (~3s for a 3k-symbol repo)"`, and add a `codeweb_map` tool so the agent can do it without leaving MCP. Missing-graph is currently a dead end (§2.3).
4. **Expose full tool power over MCP** (find_similar `--body`/`--structural`, review `--gate`, reading_order scope/budget, optional churn for risk/hotspots) — agents currently get the weakest variant of each capability.

### 4.3 Aware — freshness and the right moment

1. **Staleness detection:** stamp per-file content hashes into `meta` at extract time; every query cheaply compares and either auto-refreshes changed files (incremental path exists) or annotates the response: `"graph is stale for 2 files you just edited — call codeweb_refresh"`. An agent that can't tell the map is outdated will eventually be burned by it and stop trusting the tool.
2. **Pre-edit awareness (the missing half of the loop):** a `PreToolUse` hook on `Edit|Write` that emits **one line** — `codeweb: editing normalizePath — 126 callers across 4 packages; codeweb_impact for detail` — from a cached lookup. Today the only always-on integration is the *post*-edit gate, i.e. awareness arrives after the mistake. Budget: <150ms, ≤1 line, silent when the file is unmapped.
3. **Fix the post-edit hook's cost:** `hooks/post-edit-diff.mjs:48` re-extracts the **entire target** on every edit with no `--cache`; make it incremental and scope it to the edited file, and document the off-switch.
4. **Teach the loop where agents read:** MCP `initialize.instructions` (currently absent) + a shipped CLAUDE.md fragment stating the workflow: *context → edit → refresh → diff-gate*, and when each tool applies. Tool descriptions are already behavioral ("Call this BEFORE editing") — extend that one level up so the agent knows the tools exist before the first search.

### 4.4 Intelligent — precision so top-N can be trusted

1. **Code-role tagging** (`product|test|fixture|example|generated|vendored`) via path heuristics + existing `test` edge kind; rankings (duplication, deadcode, hotspots, matrix) default to product scope with an explicit toggle. This single feature fixes the vite playground fiasco, the fixture merge advice, and most Findings-tab noise (§2.1.1, §3.3).
2. **Interface-pattern demotion** for same-name/same-arity groups with disjoint caller sets (plugin hooks, visitors) — reclassify as `pattern` finding, never "merge these" (§3.3).
3. **Workspace scoping:** wire `lib/shards.mjs` into extraction so name resolution prefers same-package and never silently crosses package boundaries (kills the `create-vite`→vite false edges and the fake matrix coupling).
4. **Extractor fixes in impact order:** body-span state machine across lines (fixes bodies/complexity/dup-confirm); qualified method ids everywhere (`Class.method`); `ref` vs `call` for bare-identifier arguments; class-field arrow methods. Each is cited in §3.2 with file:line.
5. **Semantic domain naming (cheap LLM pass, optional):** one-line "what this domain does" labels cached in the graph — the only place an LLM belongs in this product, and it's offline, once, not in the query loop.

### 4.5 Capable — new powers the graph already enables

- **`codeweb_map`** (build/rebuild over MCP) — completes the loop (§4.2.3).
- **Persistent server mode:** keep the parsed graph in memory between calls (the stdio server already lives for the session; it just re-spawns a child per call). Sub-ms queries unlock composite tools (e.g. `review` that internally runs impact+tests+risk in one call → one small response instead of three).
- **`codeweb_explain <symbol>`:** one bounded card (signature, role, domain, fan-in/out, top callers, tests, risk) — the "tell me about X before I touch it" question agents ask most, currently requiring 3–4 calls.
- **Campaign memoization** (fixes the 8.9s outlier and makes "auto-optimize" real at scale).
- **Rename detection in `diff`** (delete+add with ≥90% body similarity → `renamed`, preserving caller continuity and killing false `lostCallers` regressions).
- Later, sequenced behind trust: language expansion (Java/C# next by agent demand), cross-repo graphs, LSP-assisted resolution where available.

---

## 5. Prioritized roadmap

**P0 — trust (days):** fix stdout-flush truncation (all CLIs); fix `run.mjs` src resolution + clean stage errors; fix campaign `locSaved` ROI (and align the test fixture with the real producer shape); qualified method ids (id collisions); `mcp-server` version 0.1.0→sync with package.json and add it to `check-consistency`; dedupe repeated findings emission (ov92/93/94).

**P1 — the token flip (1–2 weeks):** budgeted response contract + cursors on all 20 tools; context-pack call-site windows; `graph` param optional with auto-discovery; `mcpServers` in plugin.json; actionable missing-graph error + `codeweb_map`; MCP `instructions`; expose full CLI flags over MCP; add `limit` params to schemas.

**P2 — precision & awareness (2–4 weeks):** role tagging + product-scoped rankings; interface-pattern demotion; workspace scoping via `shards.mjs`; staleness stamps + auto-refresh/annotation; pre-edit one-line hook; incremental post-edit hook; body-span fix; `ref` edge kind; class-field arrows; report UI: product-first filter, navigating search, deep links, a11y pass; `lib/cli.mjs` de-duplication.

**P3 — the moat (quarter):** persistent server + composite `codeweb_explain`; campaign memoization; rename-aware diff; semantic domain labels; re-run the efficiency pilot on budgeted responses and publish tokens-per-task; then language expansion.

**Success metrics to hold ourselves to:** p95 MCP response ≤ 1.5k tokens (today: unbounded, observed 66k); install-to-first-answer ≤ 2 steps (today ~7); top-10 findings precision on vite/axios ≥ 80% product-relevant (today ~20% on vite); zero truncated/invalid JSON responses (today: any result >64KB); pipeline and query latency stay within current envelope (they're already good).

---

## Appendix — reproduction

```bash
# pipeline timing
time node scripts/run.mjs <abs-path-to>/vite --out-dir /tmp/vite-out     # 2.8s, 3031 nodes
# query timing + sizes
node scripts/query.mjs /tmp/vite-out/graph.json --impact packages/vite/src/node/utils.ts:normalizePath | wc -c
# truncation bug
node scripts/context-pack.mjs /tmp/vite-out/graph.json packages/vite/src/node/utils.ts:normalizePath --json > f.json; wc -c f.json   # 306431
node scripts/context-pack.mjs /tmp/vite-out/graph.json packages/vite/src/node/utils.ts:normalizePath --json | wc -c                  # 65536
# MCP probe: initialize/tools/list/tools/call over stdio; body-span spot-check: nodes with loc>200 in graph.json
# report UX: open /tmp/vite-out/report.html — Findings tab top entries, search 'normalizePath' + Enter, DOM a11y probe
```

*Screenshots and raw probe scripts from this review live outside the repo (session scratchpad); all numbers above are reproducible with the commands shown.*

---

## Addendum (2026-07-18): the roadmap, implemented and re-measured

Every phase above was implemented on this branch (P0 → P1 → P2 → P3, one commit each). Same
methodology as the review: every number below re-measured on the same vite checkout (3,036 symbols).

| Metric | Before (review) | After | Change |
|---|---|---|---|
| Piped CLI output > 64KB | truncated at exactly 65,536 B, invalid JSON | complete + parses (306KB verified) | **P0 bug fixed** |
| `codeweb_context` response | 306KB (~76k tokens) | **9.6KB** (call-site windows, 12 callers) | −97% |
| `codeweb_impact` response | 16.4KB | **1.5KB** (summary + top-20 by fan-in) | −91% |
| `codeweb_deadcode` response | 265.8KB (~66k tokens) | **14.3KB** (top-20/tier by span, true totals) | −95% |
| Representative agent session (7 calls) | ~600KB raw / clipped by client caps | **49.2KB (~12.6k tokens), all valid JSON** | ~12× |
| MCP query round-trip | 75–122ms (spawn+parse per call) | **4–6ms** (in-process, cached graph) | ~20× |
| `campaign` on vite | 8,903ms | **1,253ms** (batched delete simulation) | 7× |
| Full pipeline on vite | 2.84s | 2.44s | no regression |
| Install → tools available | ~7 manual steps (no `mcpServers`) | plugin install auto-registers; `graph` optional; `codeweb_map` builds on demand | ≤2 steps |
| vite overlap findings | 76 (top: plugin hooks ×32, fixture merges) | **17 findings + 15 labeled interface patterns**, product-scoped (1,021 non-product symbols excluded, counted) | precision |
| vite graph areas (report) | 82 (fixture-dominated) | **8 product areas** (toggle shows all) | readable |
| Body-span ground truth | `cleanUrl` 550 loc (real 5), `resolveBaseUrl` 605 (real 39) | **5 / 39 exact** | fixed |
| Top fan-in symbols | `id`, `expect` (test global, 215), `url` | `normalizePath` 76, `cleanUrl` 55 (real) | fixed |
| Same-file same-name methods | one colliding id | owner-qualified `file:Type.method` in every tier | fixed |
| Staleness | undetectable | per-file stamps; queries annotate + point at `codeweb_refresh` | aware |
| Pre-edit awareness | none (post-edit only, full re-extract per edit) | one-line PreToolUse advisory; post-edit incremental (`--cache`) | aware |
| Report a11y | 0 ARIA, 0 tabbable, no reduced-motion | tablist/tabs, 122 tabbable, aria-live, `prefers-reduced-motion` | accessible |
| Search / deep links | dim-only, no navigation | Enter cycles + centers + selects; `#s=<id>` deep links | navigable |
| MCP tools | 20 (subset of CLI power; version 0.1.0) | **22** (`codeweb_map`, `codeweb_explain`; body/structural/gate/scope exposed; version derived) | complete |
| Test suite | 370 tests | **394 tests, 0 fail** (+24 pinning every fix above) | guarded |

Still open (honestly): the efficiency-pilot re-run against budgeted responses needs an agent
harness this environment doesn't have — the per-tool token measurements above are the input to it;
language expansion (Java/C#/…) remains sequenced behind trust, as planned.
