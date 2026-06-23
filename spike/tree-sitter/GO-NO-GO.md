# Tree-sitter parser tier — spike results & go/no-go

Spike for [`docs/backlog-ast-tree-sitter.md`](../../docs/backlog-ast-tree-sitter.md). Quarantined in
`spike/tree-sitter/` (own `package.json`; nothing wired into the engine). Reproduce with
`cd spike/tree-sitter && npm install && npm run spike && npm run determinism`.

## TL;DR — **GO, staged and conditional.**

The parse tree delivers exactly the two capabilities the backlog predicted, the precision contract
holds, and output is deterministic on a pinned grammar — on a real cross-platform (Windows) pure-WASM
stack with **no native toolchain**. Recommend adopting it as a **strictly additive, opt-in
`--engine tree-sitter` tier, TypeScript first**, behind the conditions in the last section. This is a
go on the *spike*; the actual merge (which adds codeweb's first runtime dependency to the shipped
product) remains the maintainer's call — the spike exists to inform it, not to pre-empt it.

## What was spiked (all three delivered)

| Deliverable | Result |
|---|---|
| Vendor a grammar + parse a file | ✅ `web-tree-sitter` 0.26.9 + `@vscode/tree-sitter-wasm` 0.3.1 (TS grammar, ABI 14) load & parse on Windows, pure WASM |
| **Exact cyclomatic** into the schema | ✅ McCabe from CFG nodes; **60% of fixture symbols diverge** from the regex (Σ\|Δ\|=4, max\|Δ\|=2) |
| **Dynamic-dispatch call edges** | ✅ **3 edges** (`this.m()` + typed receiver) resolved vs **0** from the regex baseline; precision preserved |
| Determinism across runs | ✅ **PASS** — byte-identical across 3 derivations (2 in-process + 1 subprocess) |

## Evidence

### 1. Exact vs regex cyclomatic — the regex is wrong in *both directions*

Same decision definition on both sides (the harness calls the **real** `scripts/lib/complexity.mjs`),
so every gap is a precision gap:

```
  symbol     kind      exact  regex   Δ   why the regex diverges
  render     function     3      1   -2   strips the whole template literal → misses && + ternary in ${…}
  execute    method       1      2   +1   matches `.catch(` as \bcatch\b — a Promise method, not try/catch
  validate   method       3      4   +1   counts optional param `cfg?:` `?` as a ternary
  bootstrap  function     1      1    0
  run        method       1      1    0
  ── 5 symbols · diverged 3 (60%) · Σ|Δ| 4 · max|Δ| 2 · mean|Δ| 0.80
```

The errors point **both ways** (−2, +1, +1), so they do **not** average out — a per-symbol ranking
signal (hotspots, risk, reading-order) is genuinely corrupted, not merely noisy. And every divergence
is a *systematic TypeScript construct* (template interpolation, optional params, Promise `.catch`),
not a contrived edge case — these recur on every real TS file. This is the strongest argument for the
tier: the regex isn't a little fuzzy, it is reliably wrong on ordinary TS in ways only a parser fixes.

### 2. Dynamic-dispatch edges — new capability, precision intact

Resolved (regex emits 0 of these — it drops every `obj.method()`):

```
  bootstrap → run       resolved via typed:Pipeline   (parameter `p: Pipeline`)
  run → execute         resolved via this
  run → validate        resolved via this
```

Correctly **dropped** (no type → no guess; the precision contract is preserved, not bypassed):

```
  doWork().catch(onError)   receiver is a call result, not a typed name
  items.map(…) / .join(…)   `items: string[]` is an array type, no receiver class
```

These edges matter for reachability/impact: without them, `validate`/`execute`/`run` can look like
dead-code orphans and `--impact` under-counts blast radius. The AST attributes them precisely; the
regex cannot, and correctly refuses to.

### 3. Determinism — PASS

`npm run determinism` → all three serializations share one sha256 (2047 bytes). A pinned grammar +
static parse = reproducible graph, satisfying "one graph, one schema."

### 4. Footprint — small, vendored, offline

- **2** npm packages. Actually vendored per language: runtime **200 KB** + TS grammar **1.4 MB** ≈
  **1.6 MB**, then ≈ +1 MB per additional grammar. (`node_modules` shows 26 MB only because
  `@vscode/tree-sitter-wasm` bundles ~20 grammars we don't vendor.)
- Pure WASM: **no node-gyp, no native build** — this is why it runs on Windows unchanged.

## The ABI lesson (the one real footgun)

The obvious first choice — `tree-sitter-wasms@0.1.13` — ships grammars built with
`tree-sitter-cli@0.20.x` (**ABI 13**) and **fails to load** against `web-tree-sitter@0.26.9` with a
`dylink` metadata error. The grammar `.wasm` must sit inside the runtime's ABI window. **Mitigation,
which becomes a hard adoption requirement:** vendor a *known-good matched set* (runtime + grammars),
pin both exact versions, record the grammar version in `meta.engine`, and assert byte-identical graphs
in CI per pinned version (reuse the F9 IE-EQUIVALENCE harness).

## Backlog risks — resolved vs still open

| # | Risk (from backlog) | Status |
|---|---|---|
| 1 | Footprint & install | **Resolved** — ~1.6 MB/lang vendored, pure WASM, offline. Vendor (don't fetch-on-use). |
| 2 | Determinism across versions | **Resolved** — PASS with pinned grammar; CI must assert per pinned ABI. |
| 3 | Performance at scale | **OPEN** — fixture is tiny. Must benchmark parse cost on axios + a large Go/Rust target vs the CI-gate budget **before** default-on. |
| 4 | Per-language dispatch maturity | **Partly** — TS proven (`this` + typed param). Widen one language at a time behind the flag. |
| 5 | Fallback semantics | **Design known** — regex stays the default + per-file fallback; record per-file engine in `meta`. Not yet implemented. |

### New question the spike surfaced — method id convention

The schema labels methods by **bare name** (`file:method`), so two classes with a same-named method
collide. Dispatch resolution *knows* the receiver class, so its full value (disambiguating
`A.save` from `B.save`) needs **class-qualified method ids** (`file:Class.method`) — a schema
refinement to settle **before** wiring dispatch into the live graph, since it ripples through
query/diff/overlap/impact. The spike emits bare-name ids to stay schema-faithful and flags this as the
first adoption decision, not a silent change.

## Recommendation — GO, with these conditions

Adopt as an **additive, opt-in tier**, not a rewrite. Concretely:

1. **Keep the regex engine the default and the fallback.** tree-sitter enriches the *same*
   `{nodes, edges}` schema behind `--engine tree-sitter` (or auto when a vendored grammar exists);
   never a divergent schema. Everything downstream keeps working unchanged.
2. **TypeScript only** in the first increment. Prove the pipeline end-to-end on real repos, then widen
   one grammar at a time.
3. **Vendor a matched, pinned runtime+grammar set**; record grammar version in `meta.engine`; add a
   CI determinism assertion per pinned ABI.
4. **Benchmark first (risk #3).** Measure parse cost on axios + a large target against the CI-gate
   budget before anything is default-on.
5. **Settle the method-id convention** (class-qualified vs bare-name + collision handling) before
   dispatch edges enter the live graph.
6. **`dataflow` stays RESERVED** — explicitly out of this increment; it ships only if it can be
   emitted without guessing, on its own later evaluation.

What this spike does **not** do, on purpose: it does not add a dependency to the root package, does not
touch the engine, and does not decide adoption — it quarantines the proof so the GO can be made (or
declined) with evidence in hand.
