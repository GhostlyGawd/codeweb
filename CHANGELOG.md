# Changelog

All notable changes to **codeweb** are recorded here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Beyond the usual change groups, releases also carry **Research** and **Capabilities**
notes so validated results, papers, and new tools never get lost in commit history.

## [Unreleased]

_Nothing yet. Open work lands here before it ships in the next tagged release._

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

[Unreleased]: https://github.com/GhostlyGawd/codeweb/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/GhostlyGawd/codeweb/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/GhostlyGawd/codeweb/releases/tag/v0.1.0
