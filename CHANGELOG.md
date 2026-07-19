# Changelog

All notable changes to **codeweb** are recorded here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Beyond the usual change groups, releases also carry **Research** and **Capabilities**
notes so validated results, papers, and new tools never get lost in commit history.

## [Unreleased]

### Added
- **The local outcome ledger** (`scripts/stats.mjs`, `npm run stats`): codeweb now counts what
  it actually does during real work — session briefs injected, pre-edit cards delivered,
  post-edit checks run, regressions flagged before landing, queries served, auto-refreshes —
  written by the hooks and the MCP server beside the graph (`stats.json`). Strictly local
  (never transmitted; counter names + integers only; `CODEWEB_NO_STATS=1` disables), fail-open
  by construction. The brief carries a one-line receipt ("codeweb this month: …") — the value
  made visible where it accrued.

### Research
- **Evidence program moves into the product** (`paper/STATUS.md`): the manuscript is frozen as
  a reproducible artifact; claims live in the site's evidence ledger + these Research notes.
- **Replay benchmark** (`paper/experiments/replay-mine.mjs` + `replay-ab.workflow.js`): mine
  git history for commits that changed a depended-on signature and provably missed caller
  files a later commit had to fix — each hit is a task with a built-in answer key (no invented
  tasks, no floor effect). First verified mining run on axios (1,647 commits, funnel reported
  at every stage): 2 ground-truth tasks, e.g. `forEach` — 9 caller files, 8 missed, fixed in a
  follow-up. The replay workflow runs control vs ambient codeweb over the mined set, graded on
  historical-miss coverage + the deterministic gate.

## [0.5.0] - 2026-07-19

### Added (fewer mistakes per token)
- **Day-one briefing** (`codeweb_brief`, 24th MCP tool + `scripts/brief.mjs` + a SessionStart
  hook): one ~2KB page — areas with summaries, the most depended-on symbols, entry points
  (heuristic), test layout, known issues — injected automatically when a session starts in a
  mapped repo. Replaces the first 20-50k tokens of exploratory orientation with pre-computed
  answers; served in-process from the cached graph.
- **Caller-reliance contracts** (`lib/reliance.mjs`): the explain card (and therefore the
  pre-edit hook, which embeds its summary) now reads the actual call sites and says what
  callers depend on — destructured/member-accessed result fields ("callers use {timeout,
  retries} — keep those"), awaited fraction, and the argument-count range in use. Targets the
  most common breaking edit: changing a return shape a caller still destructures.
  Conservative: only call-site-line patterns count; no sites → no claim.
- **Confidence calibration** (extractor v10): symbols reachable from a package entrypoint
  (package.json main/module/browser/bin/exports, followed through named + star re-export
  chains) are stamped `pub` — "0 in-repo callers" on a public symbol now answers with
  "⚠ public API — external callers likely; renames are breaking" instead of false confidence.
  Files using dynamic dispatch (computed member calls, getattr, non-literal require, emitters)
  are recorded in `meta.dynamic`, and empty callers/dependents answers cite them ("absence of
  callers is weaker evidence"). Confident answers stay caveat-free — no noise.

### Research
- **H18-v2 prepped** (`paper/experiments/agent-ab2-ambient.workflow.js` + `agent-ab2.README.md`):
  the agent A/B rerun as one funded command — v1's null was a floor effect (both arms ~0
  regressions on easy tasks), so v2 pre-registers hard tasks (graph-verified fan-in ≥ 5 /
  shape changes) and an AMBIENT treatment arm mirroring what the hooks now inject (brief +
  explain cards with reliance/caveats — context delivered, not offered). The analyzer takes
  raw/out paths so v1 results stay frozen.

## [0.4.0] - 2026-07-19

### Added
- **Java + C# on the deterministic fast path** (extractor v8): class/interface/enum/
  record/struct discovery with visibility-as-export, owner-qualified method ids
  (constructors included), Allman-brace + expression-bodied members (C#), `extends` /
  base-list inheritance edges, control-flow phantom guards, Maven/Gradle test-layout
  and `*Test.java` / `*Tests.cs` role detection, and pom.xml / build.gradle / .csproj
  package boundaries. Verified on square/javapoet (497 symbols, 0 phantoms, 0.7s) and
  restsharp/RestSharp (1,542 symbols, Allman style, 0.9s). Method-dispatch recall
  (`obj.Method()`) stays precision-gated as in the JS regex tier — a tree-sitter tier
  for Java/C# is the next increment.

### Added (recall ceiling + ambient loop)
- **Tree-sitter tier default-on** when web-tree-sitter is installed (`--engine regex`
  opts out; absent dependency degrades to regex byte-identically). Class-field arrow
  methods survive the AST handoff.
- **Barrels are dependents** (the measured recall gap): `export { X } from` edges the
  barrel's `<module>` to the resolved symbol; `export * from` chains resolve
  transitively AND edge the barrel to the target module. Oracle A/B moved from
  recall 0.94 to **1.00** (precision 0.94 vs grep 0.87) on both the fixed and a
  fresh-seeded 30-task sample.
- **Ambient loop**: the pre-edit hook now injects the ~1KB explain card (identity, top
  callers, tests) instead of a pointer — blast radius arrives with zero agent
  discipline; the MCP server **auto-refreshes a stale graph inline** (~1s incremental,
  throttled, CODEWEB_NO_AUTOREFRESH=1 opts out) before structural queries, and
  per-DIRECTORY mtime stamps make brand-new files trip the staleness check (per-file
  stamps cannot see a file that didn't exist).

### Added (the proof, the surfaces, the last query family)
- **`codeweb bench`** (`scripts/bench.mjs`, `npm run bench`): the oracle A/B packaged as a
  one-command benchmark on YOUR repo — context cost per dependents task + blast-radius cost
  always; recall/precision graded by the TypeScript LanguageService when `typescript` is
  resolvable; ripgrep optional. The engine moved verbatim into `scripts/lib/bench-core.mjs`
  (the paper experiment is now a thin wrapper over it — reproduction against the committed
  canonical run is byte-identical), so published numbers and user-generated numbers can
  never measure different things.
- **The gate now posts its review**: `ci-gate --md` renders the structural delta (blocking
  regressions, new cycles/duplications, symbols that lost all callers, renames-not-churn)
  as a budgeted digest and the `codeweb gate` workflow posts/updates it as a sticky PR
  comment on pass AND fail — visible where reviewers already look, verdict unchanged.
- **Editor CodeLens** (`editor/vscode-codeweb`): zero-dependency VS Code extension showing
  `N callers · blast M` above every mapped symbol from the nearest `.codeweb/graph.json`
  (identical semantics to `codeweb_callers`/`codeweb_impact`), click-through to
  `report.html#s=<id>`.
- **`codeweb_find` — concept search** (23rd MCP tool + `scripts/find.mjs`): free text
  ("where is retry handled?") → ranked symbols, deterministically — camelCase/snake_case
  token match with light stemming over identifiers/files/domains, weighted by exports,
  role (tests only when asked for), and fan-in. Served in-process from the cached graph,
  budgeted, staleness-annotated. Closes the last gap: every other query tool needs a name;
  this one turns an idea into the right starting symbol.

### Research
- **Oracle A/B** (`paper/experiments/oracle-ab.mjs`, results in
  `paper/results/oracle-ab.json`): dependents-discovery graded by the TypeScript
  compiler's own reference finder over 30 seeded vite symbols — codeweb recall 0.94 /
  precision 0.89 at **1/3 of an idealized grep's context cost** (0.8KB vs 2.5KB per
  task); blast-radius ("what transitively breaks") in one ~1KB call vs a recursive
  grep loop's ~130KB (**126× on the canonical run**, simulated generously for grep). Mechanical and
  reproducible — complements (does not replace) the frozen frontier-agent pilot,
  whose run stays the evidence for agent-loop behavior (+0.27 recall, ~44% fewer
  tokens). The 6/30 under-recalled symbols are the known dispatch/re-export gap.

## [0.3.0] - 2026-07-18

The agent-efficiency release: outputs that can't corrupt, answers that fit a context
window, and a map that tells you when it's stale. Driven by the measured product review
(`PRODUCT-REVIEW.md`).

### Fixed
- **Flush-safe output everywhere**: `process.exit()` after a large stdout write silently
  truncated anything past the 64KB pipe buffer (piped CLI JSON cut at exactly 65,536
  bytes; MCP responses clipped mid-string). All CLIs now end naturally via
  `lib/cli.mjs` emitters; `| head` (EPIPE) exits cleanly.
- `run.mjs` resolves a relative `<SRC>` against the caller's cwd (it resolved against the
  plugin root while `--out-dir` used the cwd) and reports stage failures in one clean
  line instead of a raw `execFileSync` stack. `--open` is parsed and forwarded (it was
  documented but inert).
- Campaign delete steps ranked ROI 0: `deadcode` now emits `loc` per item and the
  planner reads it (`locSaved` stays as a legacy alias).
- Same-file same-name methods collided into one node id: v6/v7 extraction emits
  owner-qualified ids (`file:Type.method`) in every tier (Python classes, Rust impls,
  Go receivers, JS/TS classes), with member-access resolution following.
- Body spans no longer desync on multi-line template literals / block comments (bodies
  swallowed whole neighboring functions — a 5-line helper recorded as 550 loc on vite,
  poisoning complexity, context-pack, and body-confirmation). Extents are measured on
  masked lines.
- `mcp-server` advertised version 0.1.0 on a 0.2.0 product; `serverInfo.version` now
  derives from package.json and `check-consistency` audits it.
- Signal-B twins de-duplicate by label pair (several `<module>` nodes produced N
  byte-identical findings).

### Added
- **Budgeted MCP responses**: list-heavy tools default to a one-line `summary` + top-N
  most-relevant items + TRUE totals + explicit `more.remaining`; `full: true` or
  `limit`/`offset` override. `codeweb_context` returns call-site windows (±3 lines)
  instead of whole caller bodies (~300KB → ~10KB on a busy vite symbol).
- **`codeweb_map`**: build/rebuild the graph over MCP; `graph` becomes
  optional on every tool (nearest `.codeweb/graph.json` above cwd, or `CODEWEB_WS`),
  and a missing graph returns an actionable error naming the fix.
- **`codeweb_explain`**: one ~1KB card (identity, contract, dependents, blast radius,
  findings) answering "tell me about X" — previously 3-4 calls. 22 tools total.
- **Plugin auto-registration**: `.claude-plugin/plugin.json` now carries `mcpServers`,
  so `/plugin install codeweb` delivers the tools without a manual `claude mcp add`.
- **Code roles**: every node carries `role` (product|test|fixture|example|bench|
  generated). Overlap findings, deadcode tiers, and the report's default view scope to
  product code (`CODEWEB_ALL_ROLES=1` / an in-report toggle widen it).
- **Interface-pattern detection**: ≥4 same-named implementations that nothing in-repo
  calls demote from "merge these" to an informational `interface-pattern` finding
  (framework hooks like a bundler plugin's `resolveId()`).
- **Workspace scoping**: bare-name call resolution never crosses a package (manifest)
  boundary — cross-package name collisions no longer fabricate edges in monorepos.
- **Staleness awareness**: the extractor stamps per-file size+mtime into
  `meta.sources`; query/context results annotate when the graph no longer matches disk
  and point at `codeweb_refresh`.
- **Pre-edit hook**: one advisory line of blast radius before an edit lands in a mapped
  target (PreToolUse; fail-open). The post-edit hook re-extracts incrementally
  (`--cache`) instead of full-scanning per edit.
- Bare-identifier arguments become `ref` edges (a callback passed is a reference, not an
  invocation); class-field arrow methods (`handleClick = () => {}`) are discovered and
  owner-qualified.
- Report: product-only filter, interface-pattern section, search that navigates
  (Enter cycles + selects matches), `#s=<id>` deep links, keyboard/ARIA support, and
  `prefers-reduced-motion` (layout settles without animation).
- `lib/cli.mjs`: the shared CLI harness (die/emit/loadGraph/capList/staleness) —
  deleting the die()×16 / graph-load×13 duplication codeweb's own overlap report flagged.

- **In-process query serving**: the MCP server answers structural queries from a
  cached parsed graph (4–6ms vs 75–122ms spawn+parse), via the same
  `lib/query-core.mjs` the CLI ships — one truth, two transports.
- **Rename-aware diff**: a removed+added pair with an identifier-normalized
  (Type-2) body match ≥85% reports as `renamed[]` instead of delete+add churn.
- Domain summaries are genuinely descriptive: size, file count, exported-first
  key symbols, and role composition ("mostly test code").

### Changed
- `campaign` batches its delete simulation (one clone instead of one per step):
  8.9s → 1.25s on a 3k-symbol monorepo.
- MCP `initialize` returns workflow `instructions` and negotiates a SUPPORTED protocol
  version instead of echoing arbitrary client strings; tool calls get a 120s timeout.
- `codeweb_find_similar` accepts `body` (stdin plumbing) + `structural` over MCP;
  `codeweb_review` accepts `before` + `gate`; `codeweb_reading_order` accepts
  scope/value/budget — previously CLI-only capability, now agent-reachable.

## [0.2.0] - 2026-06-23

The first managed release: codeweb gets a real public front and the machinery to keep
product, marketing, and research in lock-step.

### Added

- **Public website** built from a zero-dependency Node builder (`site/build.mjs`) into
  `docs/` — Home, Product, Research, Get Started, and Changelog pages, all self-contained
  with zero third-party requests, served by GitHub Pages.
- **Design system** (`site/tokens.css` + `site/styles.css`): the engine's palette codified
  into reusable tokens and components, plus a polished animated hero.
- **Evidence ledger** on the Research page — every claim tagged `Validated`,
  `Preliminary`, or `Null` with its exact number, sample size, and source file.
- **Single source of truth** (`site/data/product.json`) for the tagline, the 20 MCP tools,
  the Tier 0–3 map, supported languages, and the claim ledger.
- **Release ecosystem**: this `CHANGELOG.md`, plus `scripts/version-sync.mjs`,
  `scripts/check-consistency.mjs`, and `scripts/release.mjs`.
- Shared navigation injected into the existing interactive demo and research paper, so
  they are no longer orphaned pages.

### Changed

- Corrected the Claude Code plugin manifest, which advertised **15** query tools; the real
  surface is **20**. The tool count is now derived from the MCP server and verified in CI.
- README updated for the new site, version, and a `Versioning & Releases` section.

### Fixed

- Per-page Open Graph metadata and favicon (the Pages root previously 404'd — there was no
  landing page at all).

### Research

- Surfaced the **efficiency pilot**: frontier-agent caller discovery improves by
  **+0.265 ± 0.045** recall and **~34% fewer steps** vs grep over 8 engine-frozen reps
  (`paper/experiments/efficiency-pilot.reps8.json`). Labelled preliminary.

## [0.1.0] - 2026-06-22

The deterministic engine and its evidence base.

### Added

- **Core pipeline** — extract → cluster → overlap → render: a parse-free, zero-dependency
  code-structure graph with a self-contained interactive `report.html`.
- **Ten features across four tiers** (F1–F10): scoped context, live refresh, the
  duplication-delta gate, hotspots, campaign planning, structural clone detection,
  suppression memory, reading order, incremental edge derivation, and sharded subgraphs.
- **20 deterministic MCP tools** spanning structural queries, write-time, review-time,
  optimize-time, freshness, and comparison.
- **Five-language fast path**: JavaScript, TypeScript, Python, Rust, and Go.
- **CI gate** — a GitHub Action that fails a PR on a new cycle, a new duplication, or a
  symbol that loses all callers.

### Research

- **Pre-registered effectiveness study** — 32 of 33 checks pass; 0 disagreements across
  ~490k oracle comparisons; the study found and fixed two real engine bugs the 286-test
  suite had missed (`paper/`).

[Unreleased]: https://github.com/GhostlyGawd/codeweb/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/GhostlyGawd/codeweb/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/GhostlyGawd/codeweb/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/GhostlyGawd/codeweb/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/GhostlyGawd/codeweb/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/GhostlyGawd/codeweb/releases/tag/v0.1.0
