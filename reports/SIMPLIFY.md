# SIMPLIFY — simplification pass

Spring Cleaning · stage 2/4 · brief 27

**Date:** 2026-07-26 · read-only pass; this file is the only write. Fresh run (no prior
SIMPLIFY.md). Bounded by `CHARTER.md`: complexity that exists to honor an invariant
(zero deps · deterministic, no LLM in the loop · local, no telemetry · small agent answers ·
bench machinery as receipts, §9) goes on the Keep list, not the simplify list. Code stage 1
(`reports/PRUNE.md`) already marked for deletion is not re-counted here.

Scope surveyed: 12,551 LOC across `bin/` (4), `scripts/` (40), `scripts/lib/` (41), `hooks/` (3),
plus MCP server, site builder, editor extension; ~148 test files as the pin harness.

## The headline

**This codebase is unusually well-earned.** No one-implementation abstractions, no pass-through
layers (every CLI/​`lib/*-core` split has two real consumers: the CLI transport and the MCP
in-process fast path), no frozen config (spot-checked option params all take different values from
different callers; PRUNE already verified all 22 `CODEWEB_*` levers are exercised), and no
imported ceremony that isn't receipts-backed. The big structural complexity — dual fast-path/
fallback serving, five derived-cache sidecars, the per-workspace reader/writer queue — is
load-bearing, measured, and documented finding-by-finding.

What remains is one pattern: **tiny infrastructure idioms restated instead of shared** — the
sidecar stamp check written five times, the workspace walk-up written four times, the hook's
fallback re-doing in a subprocess what a sibling lib already does in-process. Exactly the class of
duplication codeweb hunts in other people's repos. The wins are small in lines but real in
concepts: each one turns N restatements of a rule into 1.

## 1 · Hop counts (before)

**Trace A — build the map (`codeweb .`)**
`bin/codeweb.mjs` (shim) → `scripts/run.mjs` (orchestrator) → 5 child processes in sequence
(`extract-symbols` → `cluster3` → `overlap` → `optimize` → `build-report`) → epilogue back in
run.mjs (hook-baseline sidecar, history row, stats). Hand-offs travel via `CODEWEB_WS` env +
`fragment.json` → `graph.json`. Answering "where does a call edge actually get created" is 4 files
deep (run → extract-symbols → `lib/edge-derive.mjs`, fed by `lang-rules` + `import-resolve`);
extract-symbols alone imports 11 lib modules. **Tally: 7 processes, ~9 files on the spine, 2
artifact hand-offs.** This is the densest place in the repo — and the density is the product
(determinism, per-stage memo, crash-isolation), so the spine goes on the Keep list.

**Trace B — "who calls X"**
CLI: `bin/codeweb-query.mjs` → `query.mjs` → `lib/cli.mjs` (loadGraph) → `lib/query-core.mjs` →
`lib/graph-ops.mjs`. **5 files, 1 process, each layer a distinct duty.** The cleanest path in the
repo.
MCP: `bin/codeweb-mcp.mjs` → `mcp-server.mjs` (validate → discover → cachedGraph) → `query-core`
→ `graph-ops` in-process — **4 files, 0 child processes** — *plus* a dormant spawn fallback that
re-enters the whole CLI chain (+3 hops when it fires). Every query tool therefore has two live
code paths to hold in your head; the payload parity between them is held by the shared `-core`
libs, which is why the split is Keep, not simplify.

**Trace C — pre-edit impact card (the per-edit hot path)**
Sidecar path: `hooks/pre-edit-impact.mjs` → read `index-lite.json` + `stale-stamps.json` —
**1 process, 2 small reads, ~10ms.** Fallback path (sidecar missing/stale): the hook parses the
multi-MB `graph.json` itself, then **spawns `explain.mjs`, which parses the same graph a second
time** → `explain-core.buildCards` → JSON back over the pipe. **2 processes, 2 full graph parses,
4 files — for one ~1KB card.** The most-hops-per-byte spot found; item 3 below.

## 2 · Simplifications (ranked by clarity gained per risk taken)

| # | Where | Current → simpler | Lines | Hops/concepts | Risk | Effort |
|---|---|---|---|---|---|---|
| 1 | `lib/brief-sidecar.mjs`, `lib/stale-stamps.mjs`, `lib/narration.mjs`, `lib/similar-index.mjs`, `hooks/pre-edit-impact.mjs:35-44` | 5 hand-rolled copies of the stamp-check loader → one shared `loadStamped()` | ≈ −35 | stamp rule stated 1× instead of 5× | Low | S |
| 2 | `lib/cli.mjs:findTarget`, `mcp-server.mjs:discoverGraph` + `discoverUnsupported`, `hooks/session-brief.mjs:findGraph` | 4 copies of the 40-level `.codeweb` walk-up → one `nearestWorkspace()` primitive + thin adapters | ≈ −25 | "which graph am I talking to" lives 1×; kills the `join(cwd,'x')` anchor trick in `loadGraph` | Low-Med | S |
| 3 | `hooks/pre-edit-impact.mjs:graphEntry` | Fallback spawns `explain.mjs` (re-parses the graph the hook just parsed) → lazy-import `buildCards` + `buildIndex` in-process — the literal code `lib/index-lite.mjs:buildIndexLite` already runs | ≈ −6, −1 process, −1 multi-MB parse | the hook's two paths converge on the one card assembler | Low-Med | S |
| 4 | `scripts/risk.mjs` vs `scripts/hotspots.mjs` | Sibling rankers, asymmetric splits: hotspots keeps `rankHotspots` in `lib/`, risk builds components/maxes/rank inline in the CLI with only the 18-line formula in `lib/risk.mjs` → move assembly to `lib/risk.mjs:rankRisk()` | ~0 (moved) | one shape for the two rankers; unlocks a future MCP in-process path for `codeweb_risk` | Low | S |
| 5 | `scripts/run.mjs:242-249` | Banner regex-scrapes optimize's *prose* stdout (`/(\d+) actionable findings …/`) → run optimize with `--json --out optimize.md` (md still written) and read `totals.*` fields; run.mjs prints its own 2-line stderr preview | ~0 | replaces a prose-coupling (silent banner degradation if wording shifts) with a schema field read | Low-Med | S |

Details and caveats:

1. **One stamped-sidecar loader.** The idiom — read JSON beside `graph.json`, check `version`,
   `statSync` the graph, compare `stamp.graphMtimeMs`/`graphSize`, return payload-or-null — is
   verified byte-similar at all five sites (`grep graphMtimeMs`). Variants are preserved at call
   sites: similar-index adds its `k` check after the load; the pre-edit hook keeps its
   undefined-(unusable) vs null-(fresh-but-no-entry) contract by mapping the helper's null.
   **Placement trap:** `lib/sidecars.mjs` (which mints the stamp) already imports the four sidecar
   libs — putting the loader there creates a lib cycle **codeweb's own gate would flag**. Home it
   in `lib/common.mjs` (the pure-helpers module) or a new 15-line `lib/sidecar-stamp.mjs`.
   Deliberately excluded: `lib/hook-baseline.mjs` (different stamp shape + sha1 re-check tier,
   documented) and `flagged.json` (its own `{m,s}` dialect, noisy-direction fail-open).
2. **One walk-up.** Spec E already consolidated the two *hook* copies into `findTarget`; the MCP
   server's two loops and session-brief's `findGraph` are the stragglers. Differences to preserve:
   `discoverGraph`'s `CODEWEB_WS`-first precedence, `discoverUnsupported` collecting candidates
   rather than first-hit, `findGraph` starting from a dir not a file. A `nearestWorkspace(startDir)`
   returning the hit (or visit-callback) covers all four; `loadGraph` drops its fake-filename
   anchor. Hook boot cost unchanged (both hooks already import `cli.mjs`).
3. **In-process card for the hook fallback.** Precedent is exact: the post-edit hook replaced its
   extractor spawn with an in-process `runExtract` (finding #18b) behind a rollback lever
   (`CODEWEB_HOOK_INPROC=0`). The pre-edit fallback's spawn does `buildCards` behind a process
   boundary; `buildIndexLite` performs the identical assembly in-process, with parity already
   pinned by `tests/hook-sidecar.test.mjs`. Lazy-import after the sidecar miss so the fast path
   pays nothing; the existing try/catch keeps it fail-open. Only the *fallback* changes — the
   sidecar path is untouched.
4. **risk/hotspots symmetry.** Not a line-count win — a shape win. Two tools that pitch themselves
   as siblings should decompose identically; today, answering "where is risk ranked?" and "where
   are hotspots ranked?" gives two different answers.
5. **Banner de-scraping.** Today a wording tweak in optimize's headline silently drops
   `ready`/`LOC` from the run banner (the regexes just stop matching). Reading
   `totals.{findings,ready,blocked,review,locReclaimable}` from `--json` makes the contract a
   schema, not prose. Cost: run.mjs renders the 2-line stderr preview itself (a small duplicated
   rendering — the reason this ranks last; an acceptable alternative is to keep the scrape but pin
   the headline wording with a test).

Considered and cleared (so the next pass doesn't re-litigate): `parseArgs`'s `'pair'` type has one
consumer (reading-order `--scope`) but is 4 lines inside THE flag loop — not worth a dialect
split; `--stages through-overlap` is a one-value enum but exercised (trend fast path +
`stage-memo` S7); `MEMO_VERSION = 1` is a bump mechanism awaiting its first bump, not dead config;
`cluster3`'s "v3" name and the `} else {` transport style are cosmetic; `serve.mjs`,
`reliance.mjs`, `lib/hash.mjs` (7 lines) all have real consumers and tests.

## 3 · Keep list — complexity that earns its place (do not "simplify" later)

- **The MCP per-workspace reader/writer queue** (`mcp-server.mjs`, invariants I1–I7): 130 lines of
  concurrency machinery that looks org-scale in a local tool — but it fixed real interleaving
  bugs (#30–#32), the aggressive variant was reviewed and **rejected** for torn multi-artifact
  reads, `READER_CAP=1` is the documented rollback, and scenario tests assert event interleavings.
- **Fast-path + spawned-fallback dual serving** (10 MCP tools): the fast path is a measured win
  (sub-ms vs ~100ms spawn+parse per call), the fallback is "what ships is what's tested" plus the
  error-text authority. Payload parity is held by the shared `-core` libs; removing either side
  loses something real.
- **The CLI / `lib/*-core` split** (query, find, brief, explain, context, diff): not pass-through
  layering — one truth, two transports, both exercised.
- **The five-sidecar derived-cache family** (brief, index-lite, similar-index, stale-stamps,
  hook-baseline): textbook "stored derivables," each justified by per-edit/per-session latency
  receipts (350ms → 10ms pre-edit; 97–328ms → boot-floor brief; 0.48s+ → zero-read find_similar),
  each stamp-guarded and fail-open with parity tests. Consolidate their *loaders* (item 1), never
  the caches.
- **Subprocess-per-stage pipeline + stage memo** (`run.mjs`): process isolation per stage, file
  hand-offs, and the per-output size+sha1 memo that replaced a weaker belt after a reproduced
  corruption (T-19.3). The determinism invariant lives here.
- **The old-syntax bin shims** (`bin/*.mjs`): deliberately ES5-parseable so pre-22 Node users get
  one sentence instead of a SyntaxError; exit-code 2/1 discipline documented.
- **Parallel legacy paths behind A/B levers** (`CODEWEB_OPT_SIM=clone`, `CODEWEB_HOOK_INPROC=0`,
  `CODEWEB_LEGACY_FALLBACK`, `CODEWEB_DEADCODE_LEGACY`, `CODEWEB_HUB_INDEG`): equivalence- and
  effectiveness-tested rollback/proof levers — PRUNE §4 already ruled the flag garden tended.
- **`applyEdit` and `createMergeSimulator` coexisting**: not a duplicate implementation —
  applyEdit is the one-shot path (simulate-edit, codemod), the simulator is the O(edges) batched
  path for candidate loops (optimize, campaign), with a property oracle pinning equivalence.
- **campaign's three-advisor subprocess composition**: 4 processes and 4 graph parses per call is
  a real hop cost, but the advisors staying authoritative artifacts (no logic fork between
  `codeweb_campaign` and `codeweb_deadcode` et al.) is the right trade for an advisory,
  non-hot-path tool.
- **LANG_DISPATCH: one skeleton, seven language tables** (`lib/ts-engine.mjs`) — the
  multi-implementation case done right; also the documented source of deadcode self-false-positives
  (PRUNE finding 5), which is a suppression task, not a refactor.
- **Bench/measurement machinery** — receipts behind public claims (charter §9); out of scope by
  charter, kept by conviction.

Out-of-scope observation for the drift audit (not a simplification): `run.mjs:329` still prints
"sponsoring pays for its benchmarks" — the exact premise CHARTER C7 ruled fabricated on
2026-07-25; the in-product ask needs the realigned sponsorship copy.

## 4 · Before / after — the top item

**Before** (the same 8 lines, five times — `lib/brief-sidecar.mjs` shown; `stale-stamps.mjs`,
`narration.mjs`, `similar-index.mjs`, and `hooks/pre-edit-impact.mjs:sidecarEntry` repeat it):

```js
export function loadBriefSidecar(graphPath) {
  try {
    const st = statSync(graphPath);
    const b = JSON.parse(readFileSync(join(dirname(graphPath), BRIEF_SIDECAR), 'utf8'));
    if (!b || b.version !== 1 || !b.stamp || b.stamp.graphMtimeMs !== st.mtimeMs
        || b.stamp.graphSize !== st.size) return null;
    return b.brief;
  } catch { return null; }
}
```

**After** — the stamp rule once (in `lib/common.mjs` or a new `lib/sidecar-stamp.mjs`; NOT
`sidecars.mjs`, which would cycle):

```js
/** Read a sidecar beside graph.json iff version matches and its stamp equals one stat of the
 *  graph; else null. THE stamp rule (lib/sidecars.mjs mints it; this is the one reader). */
export function loadStamped(absGraphPath, filename, version) {
  try {
    const doc = JSON.parse(readFileSync(join(dirname(absGraphPath), filename), 'utf8'));
    if (!doc || doc.version !== version || !doc.stamp) return null;
    const st = statSync(absGraphPath);
    return doc.stamp.graphMtimeMs === st.mtimeMs && doc.stamp.graphSize === st.size ? doc : null;
  } catch { return null; }
}
```

and each site becomes one line of its own semantics:

```js
export const loadBriefSidecar = (p) => loadStamped(p, BRIEF_SIDECAR, 1)?.brief ?? null;

export function loadSimilarIndex(p) {                       // keeps its k-guard
  const idx = loadStamped(p, SIMILAR_SIDECAR, SIMILAR_VERSION);
  return idx && idx.k === SIMILAR_K ? idx : null;
}

function sidecarEntry(t, rel) {                             // hook keeps undefined/null contract
  const lite = loadStamped(t.baseline, SIDECAR_NAME, 1);
  return lite ? (lite.files?.[rel] || null) : undefined;
}
```

Five restatements of the freshness contract become one function the comment block in
`sidecars.mjs` already describes in prose — the code finally matches its own documentation.

---

**Which simplifications should I make?** (a) the idiom trio — items 1–3 (one stamped loader, one
walk-up, in-process hook card); (b) the trio plus the symmetry/decoupling pair — items 4–5; (c) a
subset you name; or (d) none — file this as the record that the house is already in order?
