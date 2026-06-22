# Backlog — a parser-backed (tree-sitter) intelligence tier

Status: **EXPLORE NEXT SESSION.** Approved in principle by the maintainer: *"I'm OK with dependencies
that add significant intelligence and capability that aligns with our product goal."* This is the one
deliberate fork away from the current zero-dependency, regex-based engine — so it gets its own
exploration with an explicit go/no-go, not a quiet creep.

## Why this is the next frontier

The Tier 0–3 build deepened codeweb as far as a **deterministic, regex/line-based, zero-dependency**
extractor can honestly go. Three classes of intelligence remain structurally out of reach without a
real parse tree, and each maps to a thing the product already wants:

| Want | Today (regex / skeleton) | With an AST |
|------|--------------------------|-------------|
| **Semantic (Type-3/4) clones** | F6 catches Type-2 (renamed) via a token skeleton; cannot see "same intent, reordered statements / extracted subexpression" | Sub-tree / PDG hashing catches near-miss and gapped clones |
| **Data-flow / taint coupling** | schema *reserves* a `dataflow` edge kind but no stage emits it (a regex approximation would be noisy and break the "don't guess" contract) | source→sink value tracking with real scoping → the reserved edge becomes real |
| **Dynamic dispatch (`obj.fn()`)** | deliberately DROPPED (can't attribute to a type) → under-counts blast radius, deadcode false positives | type/receiver resolution attributes the call → tighter `--impact`, fewer false orphans |
| **Exact cyclomatic complexity** | F4 approximates by counting decision tokens per language (good enough for ranking) | exact McCabe from control-flow nodes; per-language correctness for free |

All of these *preserve* the core guarantees: tree-sitter parses statically (it **never executes the
target** — the non-negotiable), and parsing is deterministic given a pinned grammar version (preserves
**evidence over guesswork** and **one graph, one schema**). The only philosophy line that moves is
"zero runtime dependencies" — which the maintainer has explicitly approved trading for real capability.

## Candidate approach

- **`web-tree-sitter` (WASM)** rather than native node bindings: a single pure-WASM runtime + per-grammar
  `.wasm` files, no node-gyp / native toolchain, cross-platform (matters — this repo is developed on
  Windows). Vendoring the `.wasm` grammars keeps installs offline and **pins determinism** to an exact
  grammar version (record the version in `meta.engine`).
- **Additive tier, not a rewrite.** Keep the regex fast-path as the default and the fallback. Add an
  optional `--engine tree-sitter` (or auto-detect when the grammar for a language is vendored) that
  ENRICHES the same `{nodes, edges}` schema: exact complexity, dynamic-dispatch call edges, and a new
  `clone`/`dataflow` signal — never a divergent schema. Everything downstream (query/diff/overlap/
  hotspots/campaign/shards) keeps working unchanged because the schema is stable.
- **Gate every new edge kind behind the precision contract.** A tree-sitter `dataflow` edge ships only
  if it can be emitted without guessing; otherwise it stays reserved. Same bar the regex extractor
  holds (drop-ambiguous-over-fabricate).

## What it would upgrade (concrete)

- **F4** → replace the token-count cyclomatic with an exact CFG count; keep the lib's public API
  (`cyclomatic`/`nestingDepth`) so hotspots/risk are unchanged.
- **F6** → add an AST-subtree-hash pass beside the skeleton-shingle pass; Type-3 clones become findings.
- **F9** → tree-sitter has an incremental-parse API (`tree.edit` + re-parse) that could make the
  edge-derivation incrementality (already shipped via the symbol-signature guard) cheaper and finer.
- **schema** → flip `dataflow` from RESERVED to emitted for languages with a vendored grammar.

## Risks / open questions to resolve next session

1. **Footprint & install** — size of the WASM runtime + N grammars; do we vendor or fetch-on-first-use?
2. **Determinism across versions** — pin grammar versions; assert byte-identical graphs in CI per
   pinned version (reuse the F9 IE-EQUIVALENCE harness pattern).
3. **Performance** — parse cost vs the regex scan on a large monorepo; does it stay under the CI gate
   budget? Benchmark on axios + a large Go/Rust target.
4. **Per-language coverage** — which of JS/TS/Py/Go/Rust grammars are mature enough to trust for
   dispatch resolution? Start with one (TS) behind the flag, prove the pipeline, then widen.
5. **Fallback semantics** — when a file's grammar is absent, fall back to regex for that file only and
   record per-file engine in a way `meta` can express.

## Suggested first next-session step

Spike `web-tree-sitter` on a single language (TypeScript): vendor the grammar, parse one file, emit
exact cyclomatic + dynamic-dispatch call edges into the existing schema for a tiny fixture, and run the
F9 equivalence-style determinism check across two runs. Decide go/no-go on the spike, not on theory.
