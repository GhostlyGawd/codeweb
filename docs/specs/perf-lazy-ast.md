# Spec A: lazy AST engine init + published ts-engine perf verdict

## Problem
`extract-symbols.mjs:441` awaits `loadTsEngine()` unconditionally before knowing whether any
file needs (re)parsing. Measured on codeweb itself: a warm `--cache` run rescans **0/173 files
yet takes 1.89s** (regex-tier cold: 0.50s) — ~1.4s of WASM runtime + grammar init paid for zero
work, on the hottest paths in the product (MCP auto-refresh, the post-edit hook, staleness
checks). Separately, `bench-ts-engine.mjs` — the pre-registered performance gate for this tier
(GO-NO-GO risk #3) — has never had a committed verdict, while the tier runs default-on.

## Behavior (testable contract)
1. **Probe, don't load, at startup.** A cheap sync-safe `probeTsEngine()` (module resolvable +
   grammar file exists + version string assembly — no `Parser.init`, no `Language.load`)
   replaces the eager load for everything decided up front: the cache `engineMode` namespace
   (`+ts`), `meta.complexityEngine`, and the banner's engine name. Probe and loader share one
   version-assembly helper so their version strings cannot diverge.
2. **Load on first need.** The real `loadTsEngine()` runs at most once, awaited at the first
   scanned (cache-missed) JS/TS file — same lazy singleton pattern `langEngineFor` already uses
   for Java/C#. A run that scans zero JS/TS files never initializes the WASM runtime.
3. **Byte-identical fragments.** For the same target + install state, the fragment produced by
   a warm run (engine never loaded) is byte-identical to a cold run (engine loaded) — including
   `meta.complexityEngine`.
4. **Observable state.** The banner (stderr) reports the AST tier's load state:
   `ast: loaded` (initialized this run) / `ast: idle` (available, not needed) / `ast: off`
   (regex opt-out or unavailable).
5. **Poison guard.** If the probe says available but the real load later fails, the run does
   not write a scan cache (and says so on stderr) — a `+ts`-namespaced cache can never contain
   regex-computed nodes.
6. **Published verdict.** `bench-ts-engine.mjs` runs on the pinned axios corpus + codeweb
   itself; results committed to `bench/results/ts-engine-bench.json` with the default-on policy
   decision recorded in the file (cold cost bound + the warm cost after this fix).

## Tests (TDD — tests/lazy-ts-engine.test.mjs)
- **L1 warm laziness + identity (property):** TS fixture; cold `--cache` run then warm run →
  fragments byte-identical; cold stderr `ast: loaded`, warm stderr `ast: idle` + `scanned 0/N`.
- **L2 non-JS/TS targets never load:** Python-only fixture → stderr `ast: idle` even cold;
  `meta.complexityEngine` still stamped by availability (unchanged public contract).
- **L3 opt-out unchanged:** `--engine regex` → `ast: off`, no `+ts` cache namespace.
- **L4 version parity:** probe's version string === loaded engine's `version` (direct unit
  comparison via `_resetForTest` + both paths).

## Done when
Tests pass; the full suite stays green; warm cached extraction on codeweb drops from ~1.9s to
roughly the regex baseline (measured number recorded in the PR); the ts-engine bench verdict is
committed under `bench/results/`.
