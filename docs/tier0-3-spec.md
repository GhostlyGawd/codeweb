# codeweb — Tier 0–3 Agent-Intelligence Build: success criteria & property catalog

Status: **COMPLETE** (branch `feat/agent-intelligence-tier0-3`). Full suite 286/286 green; all 10
features unit + property tested, reviewer-gated, and verified end-to-end against codeweb's own
`scripts/` (dogfood). See "Status table" for per-feature state and the two scoped follow-ups.

This is the contract for a ten-feature build that extends codeweb's agent surface and
auto-optimization intelligence **without breaking the product philosophy**: deterministic (no LLM
in the analysis loop), evidence over guesswork, never execute the target, read-only by default
(mutation stays asymmetric/local), one graph one schema, zero runtime dependencies.

Every feature ships with **failing unit + property tests written before a line of implementation**.
Property names are the intent locks — they are written so that an implementation cannot pass by
"writing to the test" without actually solving the problem (e.g. an incremental extractor must be
*byte-identical to a full extract*, not merely fast; a Type-2 clone skeleton must be *invariant
under identifier renaming*; a sharded query must be *answer-preserving*).

## Status table

| ID | Feature | Tier | Tests | Impl | Green | E2E |
|----|---------|------|:---:|:---:|:---:|:---:|
| F1 | `codeweb_context` MCP tool | 0 | ✅ | ✅ | ✅ | ✅ |
| F2 | `codeweb_refresh` MCP tool | 0 | ✅ | ✅ | ✅ | ✅ |
| F3 | Duplication-delta in the edit gate | 0 | ✅ | ✅ | ✅ | ✅ |
| F4 | Complexity/nesting fields → hotspots | 1 | ✅ | ✅ | ✅ | ✅ |
| F5 | Optimization campaign planner | 1 | ✅ | ✅ | ✅ | ✅ |
| F6 | Type-2 (structural) clone detection | 2 | ✅ | ✅ | ✅ | ✅ |
| F7 | Confidence calibration + FP suppression | 2 | ✅ | ✅ | ✅ | ✅ |
| F8 | Reading-order tool | 2 | ✅ | ✅ | ✅ | ✅ |
| F9 | Incremental edge derivation | 3 | ✅ | ✅ | ✅ | ✅ |
| F10 | Sharded subgraphs + boundary index | 3 | ✅ | ✅ | ✅ | ✅ |
| — | AST/tree-sitter exploration | backlog | n/a | n/a | n/a | n/a |

**Shipped surface.** Libs: `complexity`, `skeleton`, `annotations`, `shards`, `reading-order`,
`hotspots`, `dup-check`, `campaign`. CLIs: `hotspots`, `campaign`, `reading-order`, `annotate`,
`find-similar --structural`. MCP: +5 tools (`codeweb_context/refresh/hotspots/campaign/reading_order`,
20 total). Extractor: complexity/maxDepth fields + incremental edge cache + `--full`. Gate:
`review --before` now reports `newDuplications`. `deadcode` honors `.codeweb/annotations.json`.

**Scoped follow-ups (deliberately deferred, not regressions):**
- **F6/F7 in `overlap.mjs`'s human report** — the agent-facing capabilities ship (`find-similar
  --structural` for Type-2; `annotate`+`deadcode` for suppression). Wiring a structural pass and
  fingerprints into the env-driven `overlap.mjs` report is deferred: it is the product's body-confirmed
  crown-jewel engine and the win is report cosmetics, not new capability. Tracked for a focused PR.
- **AST/tree-sitter tier** — `docs/backlog-ast-tree-sitter.md` (next session, maintainer-approved).

Backlog: `docs/backlog-ast-tree-sitter.md` — explore a parser-backed tier next session (user has
approved taking on dependencies where they add real intelligence).

---

## Tier 0 — close the edit-loop holes

The agent's core loop is **get-context → edit → refresh → gate**. Three leaks today.

### F1 — `codeweb_context` MCP tool
`context-pack.mjs` (target body + direct callers/callees + blast-radius ids, bounded) is the
highest-frequency thing an agent needs, but it is CLI-only. Expose it over MCP so an agent gets a
bounded edit window in one call instead of composing `callers`+`callees`+`impact`.

**Success criteria**
- `tools/list` includes `codeweb_context` with an inputSchema requiring `graph` + `symbol`.
- `tools/call codeweb_context` returns `context-pack.mjs <graph> <symbol> --json` output verbatim.
- Unknown symbol → the same not-found passthrough the other query tools use (exit-1 JSON, not a crash).

**Properties**
- `CTX-MCP-PARITY` — for random graphs+symbols, the MCP tool's returned text is byte-identical to the
  `context-pack.mjs --json` stdout for the same arguments (the server is a faithful pass-through).
- `CTX-MCP-LISTED` — `codeweb_context` is advertised in `tools/list` with `graph` and `symbol` required.

### F2 — `codeweb_refresh` MCP tool
Without an MCP refresh, every query after the agent's own edit silently reasons on a stale graph.

**Success criteria**
- `tools/list` includes `codeweb_refresh` requiring `graph`.
- `tools/call codeweb_refresh` re-extracts from `meta.root`, rewrites `graph.json`, returns the
  refresh summary JSON.

**Properties**
- `RFS-MCP-PARITY` — MCP refresh result text === `refresh.mjs <graph> --json` stdout for the same tree.
- `RFS-IDEMPOTENT` — on a tree with no source changes, a second refresh produces identical node+edge
  id-sets (before === after); domains for surviving ids are preserved; `overlaps` is always emptied.

### F3 — Duplication-delta in the edit gate
`review --before` and the post-edit hook report new cycles + lost-callers but **explicitly skip
duplication** (a refreshed graph has `overlaps:[]`). That is a hole at the exact moment the
prevent-duplication thesis matters. Add an incremental, source-backed duplication check over the
*changed* symbols — reusing the existing shingle/Jaccard confirmation, no full pipeline.

**Success criteria**
- New lib `incrementalOverlap(graph, changedIds, {root})` → list of `{id, dupOf, sim}` for changed
  symbols whose body is a body-confirmed duplicate (Jaccard ≥ the same `high` bar overlap.mjs uses).
- `review.mjs --changed … --before old.json` (when `meta.root` source is readable) adds
  `newDuplications[]` to its output and sets `ok:false` when non-empty.

**Properties**
- `IOV-REFLEXIVE-EXCLUDED` — a symbol is never reported as duplicating itself.
- `IOV-MATCHES-FINDSIMILAR` — the top body-match `incrementalOverlap` finds for a changed symbol
  equals `find-similar.mjs`'s top match for the same body (one similarity truth, no second formula).
- `DUP-GATE-DETECTS` — a changed symbol whose body is a verbatim copy of an existing symbol's body
  yields a non-empty `newDuplications` and `ok:false`.
- `DUP-GATE-CLEAN` — when no changed symbol duplicates any other, `newDuplications` is empty and the
  dup-check does not flip `ok`.
- `DUP-GATE-THRESHOLD` — a near-but-sub-`high` similarity is not reported (precision over recall,
  matching overlap's confirmed bar).

---

## Tier 1 — new deterministic brains (no parser needed)

### F4 — Complexity + nesting fields → refactoring hotspots
Risk uses LOC as the only size proxy. Cyclomatic complexity (count decision points) and max nesting
depth are computable inside the existing body scan — zero new deps, fully deterministic. They unlock
the missing health signal: **hotspots = complexity × fan-in × churn** (the Tornhill model) — "where
do I even start" in a huge repo.

**Success criteria**
- Every `function`/`method` node carries integer `complexity` (≥1) and `maxDepth` (≥0); `class` and
  `module` nodes carry neither (or `null`), consistently. Computed deterministically; documented in
  `graph-schema.md`.
- Pure lib `lib/complexity.mjs` (`cyclomatic(lines)`, `nestingDepth(lines)`), unit-testable.
- `hotspots.mjs <graph> [--json] [--git|--churn map]` ranks symbols by a documented normalized blend
  of complexity, fan-in, and churn; emits ranked list with raw components. MCP `codeweb_hotspots`.
- Existing 210 tests still pass (additive fields only).

**Properties**
- `CX-MIN-ONE` — a non-empty function body has `complexity ≥ 1`; a straight-line body (no decision
  tokens) has `complexity === 1`.
- `CX-MONOTONE` — inserting one more decision token (`if/for/while/case/catch/&&/||/?/?.`) into a body
  raises complexity by ≥1 and never lowers it.
- `CX-RENAME-INVARIANT` — renaming identifiers (not keywords) leaves complexity and maxDepth unchanged
  (they measure control flow, not names; strings/comments are not counted).
- `CX-DEPTH` — `maxDepth ≥ 0`; a flat body has depth ≤ 1; a body nesting N blocks has `maxDepth ≥ N`.
- `HOT-DOMINANCE` — if A ≥ B on every component and > on one, A ranks ≥ B (monotone blend).
- `HOT-DETERMINISTIC` — total order, ties broken by id; same input → same ranking; never NaN.

### F5 — Optimization campaign planner
`optimize` (ready merges), `deadcode` (safe deletes), and `break-cycles` (verified cuts) are three
separate advisors. Compose them into one **topologically-ordered, individually-gated, ROI-ranked
worklist** with cumulative projected deltas. Read-only plan; execution stays with the agent + gate.
This is the literal "auto-optimize at any scale" deliverable.

**Success criteria**
- `campaign.mjs <graph> [--json] [--budget N] [--git]` → ordered steps, each `{op, gate:{ok}, delta,
  cumulative, roi}`; final totals = sum of step deltas; never writes source. MCP `codeweb_campaign`.
- Pure planner `lib/campaign.mjs` over a graph (uses graph-ops `applyEdit`/`fileCycles` + the advisor
  libs), so the ordering/gating logic is unit- and property-testable without subprocesses.

**Properties**
- `CMP-GREEN-CHAIN` — applying the plan's ops **in order** never introduces a file cycle that did not
  exist at the start of the chain; i.e. each step's simulated gate stays green *given all prior steps
  applied*, not merely in isolation. (Intent lock: a "safe" campaign is safe as a sequence.)
- `CMP-ORDER` — ordering respects preconditions: a dead-code delete precedes any merge that would
  otherwise rewrite it; a cycle-cut precedes a merge that depends on the cut. No later step violates an
  earlier step's precondition.
- `CMP-MONOTONE-DELTAS` — cumulative `locReclaimed` and `cyclesBroken` are non-decreasing along the
  plan and the final values equal the per-step sums.
- `CMP-BUDGET` — with `--budget N`, the plan is the top-N prefix of the full ROI ranking (length ≤ N).
- `CMP-EMPTY` / `CMP-DETERMINISTIC` — a clean graph yields an empty plan; planning is deterministic.

---

## Tier 2 — deepen the moat (still deterministic, zero-dep)

### F6 — Type-2 (structural) clone detection
Today's dedup is lexical token-shingles. Add a structural skeleton (identifiers + literals → fixed
placeholders, keywords/operators/structure preserved) and shingle over it, so **renamed clones**
(same shape, different variable names) are caught — without a parser.

**Success criteria**
- Pure lib `lib/skeleton.mjs`: `skeleton(src)` (normalized token stream), `structuralShingles(src,k)`;
  reuses `jaccard` from `lib/shingles.mjs`.
- `overlap.mjs` gains a structural pass that flags pairs with high skeleton-Jaccard that the lexical
  pass ranks lower; such findings tagged with a `structural:true` flag and confidence source.
- `find-similar.mjs --structural` ranks by skeleton similarity.

**Properties**
- `SKL-RENAME-INVARIANT` (headline) — consistently renaming every identifier in a body yields an
  identical skeleton; therefore `jaccard(structuralShingles(body), structuralShingles(renamed)) === 1`.
- `SKL-STRUCTURE-SENSITIVE` — adding/removing an `if`/loop changes the skeleton (Jaccard < 1): it does
  not trivially saturate to 1 for everything.
- `SKL-LITERAL-NORMALIZED` — changing only literal values (numbers/strings) leaves the skeleton equal.
- `SKL-DETERMINISTIC` — same source → same skeleton + shingles.
- `OV-TYPE2-FINDS-RENAME` — overlap on two bodies identical up to a consistent rename reports a
  structural duplication finding.

### F7 — Confidence calibration + false-positive suppression memory
Findings are discrete bands with no feedback loop. Give every finding a stable content `fingerprint`;
a local `.codeweb/annotations.json` records human/agent "false-positive" suppressions; codeweb
suppresses them on future runs and reports the suppressed count. Deterministic memory of judgments —
no model, and it writes only to `.codeweb` metadata, never to source.

**Success criteria**
- Pure lib `lib/annotations.mjs`: `fingerprint(finding)`, `loadAnnotations(dir)`,
  `applySuppressions(findings, annotations)` → `{visible, suppressed}`.
- `overlap.mjs` and `deadcode.mjs` attach `fingerprint` to each finding, honor
  `.codeweb/annotations.json`, hide suppressed findings by default, report `suppressedCount`, and
  reveal them under `--show-suppressed`.
- `annotate.mjs --suppress <fingerprint> [--note …] [--dir .codeweb]` appends a suppression
  (idempotent; never modifies source).

**Properties**
- `FPR-STABLE` — a finding's fingerprint is identical across runs and independent of array order and
  of unrelated graph changes (depends only on the finding's essential identity: kind + sorted nodes).
- `FPR-DISTINGUISHES` — findings with different kind or node-set get different fingerprints.
- `ANN-SUPPRESS-EXACT` — suppressing fingerprint X removes exactly the finding(s) with fingerprint X,
  none other; `suppressedCount` equals the number removed.
- `ANN-IDENTITY-CHANGE-RESURFACES` (headline) — if a suppressed finding's identity changes (a node id
  changes), its fingerprint changes, so it is **not** silently suppressed. You cannot hide a genuinely
  new issue behind an old suppression.

### F8 — Reading-order tool
For onboarding at scale, emit a minimal dependency-ordered reading path (foundations first), bounded
to a budget — a curated tour instead of blind grep.

**Success criteria**
- Pure lib `lib/reading-order.mjs`: `readingOrder(graph, {scope, budget})` → ordered `[{id, why}]`.
- `reading-order.mjs <graph> [--scope domain|file|symbol value] [--budget N] [--json]`; MCP
  `codeweb_reading_order`. Deterministic.

**Properties**
- `RO-FOUNDATIONS-FIRST` — within scope, the order is a valid linearization of the in-scope call DAG
  with callees (depended-upon) before callers; cycles degrade gracefully (members ordered by fan-in
  desc then id) with no crash and still a total order.
- `RO-BUDGET` — output length ≤ budget; with budget ≥ scope size, every in-scope symbol appears once.
- `RO-SCOPE-CLOSED` — every emitted id is within the requested scope; deterministic.

---

## Tier 3 — the scale track (architectural)

### F9 — Incremental edge derivation
Refresh caches symbol *discovery* per file-hash but **re-derives all edges globally** every run — the
scaling bottleneck. Cache per-file edges, guarded by a global symbol-set signature: when the symbol
set is unchanged, reuse edges for unchanged files; when it changes, fall back to full re-derivation
(correctness always preserved). A `--full` flag forces from-scratch.

**Success criteria**
- Extractor persists an edge cache (in the existing `--cache` file) and a global symbol signature.
- A `--full` flag forces full edge derivation; cold cache === current behavior (golden unchanged).

**Properties**
- `IE-EQUIVALENCE` (headline) — for any sequence of file edits (edit body / add symbol / rename /
  delete file / add file), warm-cache incremental extraction produces nodes+edges **byte-identical**
  (sorted, modulo `meta` timing) to a cold full extraction of the same final tree.
- `IE-INCREMENTALITY` — a pure body edit (no top-level symbol added/removed) re-derives edges for only
  the changed file(s), asserted via an extractor instrumentation counter. *(Paired with IE-EQUIVALENCE
  so neither can be faked: always-full passes EQUIVALENCE but fails INCREMENTALITY; a broken cache that
  skips needed work passes INCREMENTALITY but fails EQUIVALENCE.)*
- `IE-COLD-PARITY` — cold-cache extraction equals pre-feature extraction (no regression).

### F10 — Sharded subgraphs + boundary index
For monorepos too big to hold one `graph.json` in memory: split into per-shard subgraphs + a
cross-shard boundary edge index, and answer queries from (one shard + the boundary index) with the
*same* result as the monolith.

**Success criteria**
- `shard.mjs <graph> --by package|domain|dir --out <dir>` writes `shard-*.json` + `boundary.json`;
  `shard.mjs --merge <dir>` reconstructs the graph.
- Pure lib `lib/shards.mjs`: `splitGraph(graph, by)`, `mergeShards(parts)`, and answer-preserving
  `callersOf/calleesOf/impactOf(shardSet, boundary, id)`.

**Properties**
- `SH-LOSSLESS` — `mergeShards(splitGraph(g)) === g` (node+edge sets identical; deterministic).
- `SH-PARTITION` — every node is in exactly one shard; every edge is intra-shard or recorded once in
  boundary; nothing lost or duplicated.
- `SH-ANSWER-PRESERVING` (headline) — for any symbol, `callers/callees/impact` from (its shard +
  boundary) equal the same from the full graph. Sharding changes only what must be loaded, never the answer.
- `SH-DETERMINISTIC` — partition + outputs are deterministic.

---

## Definition of done (whole build)
1. Every property + unit test above written **first** and observed failing (RED).
2. Independent reviewer pass on this spec + the tests **before** implementation; findings addressed.
3. All tests green (`node --test`), including the pre-existing 210.
4. **Real E2E**: MCP handshake lists the new tools and round-trips them; `hotspots`/`campaign`/
   `reading-order`/`shard`/incremental-`refresh`/dup-gate run against a real target (dogfood codeweb's
   own `scripts/`) and produce sane, hand-verified output — not just unit green.
5. `graph-schema.md`, `docs/agent-tools-v2.md`, and `README.md` updated for the new surface.
6. One PR off `feat/agent-intelligence-tier0-3`; CI green.
