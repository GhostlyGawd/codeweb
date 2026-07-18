# Changelog

All notable changes to **codeweb** are recorded here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Beyond the usual change groups, releases also carry **Research** and **Capabilities**
notes so validated results, papers, and new tools never get lost in commit history.

## [Unreleased]

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

[Unreleased]: https://github.com/GhostlyGawd/codeweb/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/GhostlyGawd/codeweb/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/GhostlyGawd/codeweb/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/GhostlyGawd/codeweb/releases/tag/v0.1.0
