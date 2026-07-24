# codeweb agent tools — context-pack & simulate-edit

> **Historical spec.** This documents the first two agent tools only. The current surface is the
> full capability suite in [`agent-tools-v2.md`](agent-tools-v2.md) + [`tier0-3-spec.md`](tier0-3-spec.md),
> all exposed over MCP — see the README's "Use it as an MCP tool" for the current tool count.

Two read-only, deterministic tools that move work out of the stochastic LLM and into the graph:
`context-pack` answers *"what's the minimal context to safely change X?"* and `simulate-edit`
answers *"would the regression gate accept this edit?"* — **without** the agent reading whole files
or performing the edit.

Both build on `scripts/lib/graph-ops.mjs` (the logic lives once). Neither writes any file.

---

## Feature 1 — `context-pack`

`node scripts/context-pack.mjs <graph.json> <symbol> [--json]`   (or set `CODEWEB_WS`)

Given a symbol (node id like `src/a.js:foo`, or a bare label `foo`), return the **blast-radius-scoped
context** an agent needs to edit it: the target body, the direct callers (the call sites that break
if its contract changes), the direct callees (its dependencies, location-only), and the transitive
impact set (ids only, for awareness). Replaces "grep + read 30 files".

### Success criteria
- **SC1** Resolves the symbol by exact id, else by label (reusing `resolveSymbol`); unknown symbol → exit **1**.
  A bare label matching **multiple** nodes resolves to all of them and the pack is the **union** across
  every matched id (all are `target`; `callers`/`callees`/`blastRadius` are unioned), so an ambiguous
  name never silently drops a definition.
- **SC2** Returns `target`, `callers`, `callees`, and `blastRadius` (`{count, ids}`).
- **SC3** `target` and `callers` carry the **exact source body** when the source is on disk
  (`graph.meta.root`); `callees` are location-only (signature awareness, no body) to stay bounded.
- **SC4** When source is unavailable, bodies are `null` and `sourceAvailable: false` — never a guess.
- **SC5** `--json` emits a deterministic object; exit **0** on success, **1** not found, **2** usage/IO.

### Properties (intent, checked over many inputs)
- **CP-SOUND** Every id in `callers` has a real `call` edge into a target id; every id in `callees`
  is the target of a `call` edge *from* a target id. (No fabricated neighbors.)
- **CP-COMPLETE** `callers` equals exactly the set of call-edge in-neighbors of the target derived
  independently from the raw edge list; `callees` likewise for out-neighbors. (Nothing omitted.)
- **CP-BODY-FIDELITY** With source present, each emitted body equals the source lines
  `[line, line+loc-1]` of `root/file` **joined by `\n`, with no trailing newline** — i.e. the exact
  text of those lines, not paraphrased and not truncated. (The line-join convention is fixed so the
  last line's file newline is not part of the body.)
- **CP-BLAST-SUPERSET** `blastRadius.ids` ⊇ `callers`, and excludes the target ids themselves.
- **CP-BOUNDED** No body text is emitted for `callees` or `blastRadius` — pack body-cost is
  O(direct neighbors), not O(transitive closure). (The whole point: a small window.)
- **CP-DETERMINISTIC** Same graph + symbol → byte-identical output; all lists sorted.

> Coverage note: CP-SOUND/CP-COMPLETE/CP-BLAST-SUPERSET/CP-BOUNDED/CP-DETERMINISTIC are
> **graph-structural** properties, exercised over random graphs **without** source on disk (bodies
> are `null` there). CP-BODY-FIDELITY is the only property that exercises the body-reading path, via
> a dedicated on-disk fixture. These two coverage regions are intentionally distinct.

---

## Feature 2 — `simulate-edit`

```
node scripts/simulate-edit.mjs <graph.json> --delete <symbol>
node scripts/simulate-edit.mjs <graph.json> --merge <s1,s2,...> [--into <id>]
node scripts/simulate-edit.mjs <graph.json> --move <symbol> --to <file>
```

Predict the **regression gate's structural verdict** for a hypothetical edit, without performing it.
Lets an agent discard doomed edits for ~zero cost before generating a line. Scoped to the *structural*
gate (`structuralRegressions`: new file-cycles + symbols that lose all callers) — the same subset the
post-edit hook enforces. Duplication delta is **out of scope** (it needs the full body-confirmed
pipeline) and this is documented, not silently dropped.

### Success criteria
- **SC1** Supports `--delete`, `--merge` (canonical via `--into`, default = smallest resolved id),
  and `--move … --to <file>`.
- **SC2** Returns `projected: { newCycles, lostCallers, ok }` plus the labeled `verdict`
  (`check: call-caller-preflight`, `scope: edges-only`) — **stricter than the CI gate**: it flags
  any surviving symbol losing its last call-caller, exported or not, while the gate
  (`verdict.check: orphan-gate`) exempts exported symbols and also sees duplication;
  `ok === (newCycles.length === 0 && lostCallers.length === 0)`.
- **SC3** **Purely read-only**: the input `graph.json` and all source files are byte-identical after
  running. No mutation, no writes.
- **SC4** Unknown symbol → exit **1**; bad usage → exit **2**; otherwise exit **0** (advisory — the
  verdict lives in `projected.ok`, not the exit code).

### Properties (intent, checked over many inputs)
- **SE-FAITHFUL** *(the anti-cheat property)* For any graph and any delete/merge/move op, the tool's
  `projected` equals `structuralRegressions(before, INDEPENDENTLY_APPLIED(before, op))`, where the
  test applies the edit with its own simple implementation and runs the **trusted, pre-tested**
  oracle. The only way to pass is to compute the genuinely-correct post-edit graph — you cannot fit
  to examples.
- **SE-PURE** The graph file's bytes are unchanged after a run (hash before == hash after).
- **SE-DELETE-MONOTONE** A pure `--delete` never *adds* a file cycle (removing edges can only remove
  cycles): `newCycles` is always `[]` for delete.
- **SE-DETERMINISTIC** Same input → identical output.
- **SE-OPTIMIZE-AGREE** For a duplicate-logic cluster, `simulate-edit --merge` reports the same
  `newCycles` that `optimize.mjs` projects for that finding. (Cross-tool consistency — one truth.)

---

## Shared primitive

`applyEdit(graph, op)` is added to `graph-ops.mjs` as a **pure** function (no I/O, never mutates its
argument) modelling delete/merge/move, so both `simulate-edit` and `optimize` construct the
hypothetical graph through *one* implementation. `optimize.mjs`'s inline merge simulation is
refactored onto it (removing the duplication — the very thing codeweb exists to kill).

### applyEdit properties
- **AE-IMMUTABLE** `graph` is not mutated (deep-equal to a pre-snapshot after the call).
- **AE-DELETE** removes exactly the named nodes and every edge touching them.
- **AE-MERGE** drops the non-canonical copies, redirects their in/out edges to the canonical, drops
  self-loops, de-dups edges.
- **AE-MOVE** changes only the target node's `file`; node/edge identity otherwise preserved.
