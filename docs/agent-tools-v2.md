# codeweb agent-capability suite (v2) — spec

Eleven features that make an agent more **capable, efficient, and effective at writing, reviewing,
and optimizing code**, built on the existing deterministic engine and its contract: *move work off
the stochastic LLM into the graph, precision over recall, never guess.*

Each feature states **success criteria (SC)** and **properties**. For every feature the property
marked **★ANTI-CHEAT** is pinned to an *independent oracle* — a second, obviously-correct computation
the test runs separately, ideally over **randomized inputs** (the SE-FAITHFUL discipline already used
for `simulate-edit`). A property that merely re-calls the same primitive the feature uses is a
*wiring check*, not an anti-cheat: where that's unavoidable (e.g. `fileCycles` on both sides) the
★ is placed on the property that is genuinely hard to satisfy trivially, and the wiring check is
demoted to a companion.

> **This spec was revised after two pre-build reviews** (an architect feasibility pass and an
> adversarial property-test audit). Their must-fixes are folded in below and called out inline as
> **[rev]**. The most important: anti-cheat properties run over randomized inputs with inline
> independent oracles, never fixed fixtures alone.

Conventions (v1): read-only unless stated; `--json` → deterministic (sorted) output; exit `0`
success (even when empty), `1` not-found/advisory-fail, `2` usage/IO. Shared logic lives once in
`scripts/lib/`.

## Build order (reviewer-driven)

Lead with the low-risk lift that unblocks others; group the three extractor-touching features
(F3, F4, F0) so they're gated together behind `tests/golden-ecc-scripts.test.mjs`; respect real
dependencies (**F2→F1, F10→F4, F8→{optimize, simulate-edit, applyEdit}**):

**F1 → F2 → F3 → F4 → F0 → F10 → F5 → F6 → F7 → F8 → F9.**

(The conceptual grouping is unchanged — write-time, then review-time, then optimize-time tools, on a
freshness substrate — only the *implementation* sequence is risk-ordered.)

---

## F1 — `find_similar` (reuse at write-time)

Before an agent writes a function, ask *"does something already do this?"* — turning codeweb's
**post-hoc** duplication detection into **write-time prevention**.

- `node scripts/find-similar.mjs <graph.json> (--body <file> | --stdin | --signature "<text>") [--k N] [--json]`
- **Refactor first:** lift `tokenize` / `shingles` / `jaccard` out of `overlap.mjs` into
  `scripts/lib/shingles.mjs`; rewire `overlap.mjs` onto it (one truth). **[rev]** The lifted module
  carries **overlap's** `KW` stop-list (`overlap.mjs:29`), which is deliberately *different* from the
  extractor's `KEYWORDS` (`extract-symbols.mjs:35`) — do **not** unify the two.

### Success criteria
- **SC1** Reads the candidate body (file/stdin/inline), shingles it with the **same** K=3 token
  shingling as `overlap.mjs`, scores Jaccard vs every existing **non-test** function body (source via
  `graph.meta.root`).
- **SC2** Returns top-`K` (default 10) `{id, file, sim, tier}` sorted by `sim` desc then `id`; tiers
  use overlap's exact bands (`high` ≥0.6, `medium` 0.35–0.6, `low` 0.15–0.35; `<0.15` excluded).
- **SC3** Source absent → exit 2 with an explicit reason (never a silent empty). Exit 0 on zero matches.
- **SC4 [rev]** The self-match contract: a candidate read from the **exact `loc`-slice** of a node's
  source (`lines[line-1 .. line-1+loc-1]`) tokenizes identically to that node, so its `sim` is 1.0.
  (Whole-file candidates may exceed a node's slice and score <1 — that's correct, not a bug.)

### Properties
- **★ANTI-CHEAT · FS-ORACLE [rev, was FS-SELF]** Over **20+ randomized function-body strings**
  spanning a spectrum of overlap, each reported `sim(candidate, node)` equals
  `jaccard(shingles(candidate), shingles(node))` recomputed **inline in the test** (the test owns its
  copy of the K=3 shingler), and the result **ranking** matches the oracle's ranking. Not fittable —
  it must implement the real similarity over arbitrary inputs.
- **FS-SELF** (companion) An exact `loc`-slice candidate self-matches at `sim == 1.0`, ranked first.
- **FS-NEGATIVE [rev]** Every pair whose independent jaccard is `<0.15` is **absent** from results
  (verifies exclusion happens, not just that returned items clear the bar).
- **FS-BOUNDED-K** ≤ `K` results; **FS-DETERMINISTIC** identical output for identical input.
- **FS-DOGFOOD** `overlap.mjs` emits byte-identical `overlaps[]` before vs after the lift (golden).

---

## F2 — `placement`

Where should a *new* symbol live, and does it duplicate something?

- `node scripts/placement.mjs <graph.json> --calls <id|label,...> [--name <label>] [--body <file>] [--json]`

### Success criteria
- **SC1** Resolves `--calls` to ids; suggested **domain** = plurality domain among resolved callees
  (tie → higher count, then **lexicographically smallest domain name**); suggested **file** = the
  most-called file in that domain (counts from `buildIndex().callIn` — **[rev]** not a local recount),
  tie → lexicographic.
- **SC2** `reuseWarnings`: with `--body`, every `find_similar` match at ≥`medium`; else/also every
  node whose label `==` `--name`.
- **SC3** Unresolved `--calls` reported in `unresolved`, never dropped.
- **SC4** No resolved callees → `domain:"unassigned"`, `file:null`, explicit rationale (never guesses).

### Properties
- **★ANTI-CHEAT · PL-GRAVITY** Suggested domain == the plurality domain of resolved callees,
  recomputed by an **inline group-count** over `graph.nodes` (no library call), over random graphs.
- **PL-TIE [rev]** A fixture with two domains at equal callee-count asserts the lexicographically
  smallest domain wins (pins the tiebreak the random cases rarely hit).
- **PL-REUSE-SOUND** Every name-warning shares the exact `--name` label and is a real node; every
  body-warning has `sim ≥ 0.35`.
- **PL-DETERMINISTIC**.

---

## F3 — signature enrichment

Give nodes their call **contract** so an agent writes a correct call site without opening the callee.

- The extractor adds `signature: { params:[...], returns:<string|null>, raw:"<text>" }` to each
  `function`/`method` node; `context-pack` callees carry `signature`.

### Success criteria
- **SC1** Single-line declarations: JS/TS `function f(a,b)`, `const f=(a,b)=>…`, methods → `params:["a","b"]`;
  Python `def f(a,b=1,*args,**kw)` → `["a","b","args","kw"]`.
- **SC2** `signature.raw` = verbatim param-list text; `returns` = the annotated/`->` return if present, else `null`.
- **SC3 [rev]** The extractor is **line-oriented**, so a **multi-line parameter list yields
  `signature: null`** (documented limitation, consistent with `bodyEnd`'s best-effort ethos — never a
  guess). Unparseable / no parens → `null`; graph stays schema-valid; existing consumers unaffected.
- **SC4** `context-pack` `callees[]` each include `signature` identical to the graph node's.

### Properties
- **★ANTI-CHEAT · SIG-FIDELITY [rev]** Over **randomly generated single-line declarations** (random
  param names, defaults, rest/`*`/`**`), each node's extracted `params` equals the list produced by
  an **inline, independently-written** param parser in the test (its own regex — **no import from
  `scripts/lib/`**). Randomized + independent ⇒ not fittable to a fixture.
- **SIG-NULL-SAFE [rev]** ≥3 negative cases (no parens, multi-line params, template-literal noise) →
  `null`, never a throw, and the inline oracle agrees on `null`.
- **SIG-CONTEXT-PACK** `context-pack` callee signatures equal the graph node signatures (no drift).
- **SIG-DETERMINISTIC**.

---

## F4 — `test` edges + `codeweb_tests`

Separate **test-driven** references from production ones; let an agent run exactly the tests guarding
a symbol.

- New edge kind **`test`**: an edge from a node in a **test file** (`*.test.*`, `*_test.*`, `*.spec.*`,
  or under `tests/`) to a non-test symbol it calls/imports is classified `test`, resolved under the
  **same** unambiguous precision gate as calls.
- **[rev]** `buildIndex` gains a `testIn` adjacency (the shared primitive — so `query.mjs` and F10
  share one truth, no inline edge-filtering). `query.mjs --tests <symbol>` → the `test`-edge in-neighbors.

### Success criteria
- **SC1** Edges from a test-file node to a non-test symbol get `kind:"test"`; `call`/`import`/`inherit`
  are otherwise unaffected. Exactly one `test` edge (and **zero** `call`/`import`) per resolved
  test→prod reference (no double-counting).
- **SC2** `--tests <symbol>` = exactly the `test`-edge in-neighbors of the resolved symbol (union over
  a bare label); `--json` deterministic; unknown symbol → exit 1.
- **SC3 [rev]** `test` edges are excluded from `hasIncoming`/`callIn`/`callOut` in `buildIndex`. The
  `orphans()` *function* is untouched, but its *output on real graphs changes*: **a symbol referenced
  only by tests is now reported as an orphan** — this is the intended refinement and precisely the
  signal F10 consumes. Affected golden/regression fixtures are updated, not worked around.

### Properties
- **★ANTI-CHEAT · TE-PRECISION** A `rawTestEdges` inline resolver in the test (mirroring
  `rawCallers`: same alias/same-file/unique-global rules, ambiguous dropped) reproduces exactly the
  emitted `test` edge set over fixtures — none fabricated, none missed.
- **TE-PRESERVE [rev]** For a test→prod reference, the graph shows exactly one `test` edge and zero
  `call`/`import` edges for that ordered pair (reclassification, not duplication).
- **TE-FROM-TESTS** every `test` edge's `from` is in a test file, `to` is non-test.
- **TE-QUERY-COMPLETE** `--tests X` == test-edge in-neighbors of `X` from the raw edge list.
- **TE-DETERMINISTIC**.

---

## F0 — Graph freshness (incremental re-extraction)

Make refresh cheap and correct so an agent can trust `impact`/`context-pack`/`callers` mid-task.

- A per-file **scan cache** in `extract-symbols.mjs` (`--cache <path>`): a re-run re-runs
  *symbol-discovery* only for files whose cache key changed and reuses cached scans otherwise.
  **[rev]** Cache key = `hash(content) + engineMode + scannerVersion` — engine-inclusive, so a
  ctags-vs-regex change correctly misses the cache.
- `scripts/refresh.mjs <graph.json>` re-extracts (cached) from `graph.meta.root`, writes fresh
  `nodes`+`edges` back, re-attaches each surviving node's `domain` by id. **[rev]** Edge derivation
  is **inherently whole-graph** (global `byName`/alias/call passes), so refresh always re-resolves all
  edges; only *symbol discovery* is cached. `<module>` synthetics and `overlaps` are recomputed/dropped
  (matching `applyEdit`'s documented stance); absent `meta.root` → exit 2.

### Success criteria
- **SC1** `--cache <f>` yields a fragment **byte-identical** to a no-cache run, on first and every run.
- **SC2 [rev]** A cached re-run re-runs **symbol-discovery** only for files whose key changed
  (observable via a stderr counter); the counter measures *scans*, not total files touched (edge
  derivation is whole-graph by design).
- **SC3** `refresh.mjs` updates `nodes`+`edges` to current disk, preserves `meta`, re-attaches
  `domain` for surviving ids; absent `meta.root` → exit 2 with a reason.
- **SC4** Edges are globally re-resolved (a rename in file A reflected in file B's edges).

### Properties
- **★ANTI-CHEAT · F0-EQUIV** From an initial tree (full extract `F_full0` + its cache), apply an
  arbitrary edit set, then (a) full-extract → `F_full1`, (b) cache-extract from the F0 cache →
  `F_incr1`. **`F_incr1 ≡ F_full1`** (identical node + edge sets). Oracle = the no-cache full
  extractor (a subprocess run **without** `--cache`), genuinely independent of the cache path.
- **F0-ONLY-CHANGED [rev — must be asserted in the SAME test as F0-EQUIV]** After editing exactly the
  files in set `C`, the scan counter == `|C|`. Pairing the two in one test defeats the "disable the
  cache, always rescan" cheat (which would pass F0-EQUIV alone): correctness *and* efficiency are
  pinned together.
- **F0-CACHE-NEUTRAL** same tree, `--cache` vs not → identical bytes. **F0-DETERMINISTIC**.

---

## F10 — confidence-tiered dead-code workflow

Turn the `orphans` candidate list into a safe action plan, using `test` edges (F4) as a signal.

- `node scripts/deadcode.mjs <graph.json> [--json]`

### Success criteria
- **SC1** Partition `orphans(graph)`: `safe` = orphan **and** no incoming `test` edge **and** label not
  an entrypoint; `review` = orphan with a `test` edge (tests are its only user) **or** entrypoint-ish/ambiguous.
- **SC2** Each entry carries a `reason`; the `orphans` caveat (ambiguous dropped edges → possible false
  positives) is surfaced in `review` reasons, never silently deleted. Exit 0.

### Properties
- **★ANTI-CHEAT · DC-MEMBERSHIP [rev, replaces DC-PARTITION as ★]** `safe` equals, exactly, the
  **inline-recomputed** set `orphans(graph).filter(o => !testTargets.has(o.id) && !isEntrypoint(o.label))`
  where `testTargets = {e.to | e.kind==='test'}` — computed independently in the test over random
  graphs+test-edges. Pins **positive membership**, so the "everything in `review`, `safe` empty" cheat
  fails.
- **DC-REVIEW-NEGATIVE [rev]** Every orphan that **is** a `test`-edge target appears in `review`, not
  `safe`.
- **DC-PARTITION** (companion) `safe ∪ review == orphans` and `safe ∩ review == ∅`.
- **DC-FIXTURE [rev]** A 3-orphan fixture (one test-edge-targeted → review, one entrypoint-named →
  review, one neither → safe) asserts all three placements.
- **DC-DETERMINISTIC**.

---

## F5 — `review` (git-range structural review)

Promote codeweb from a *gate* to a *reviewer*.

- `node scripts/review.mjs <graph.json> (--changed <file[:s-e,...]>,... | --range <gitref>) [--before <graph.json>] [--gate] [--json]`
- **Pure core** `reviewImpact(graph, hunks)` (`hunks=[{file, ranges:[[s,e]]}]`, whole file = all its
  symbols); the `--range` git path is a thin shell deriving hunks via `git diff --unified=0`. Tests
  target the pure core + one git smoke.

### Success criteria
- **SC1 [rev]** A node is a **changed symbol** iff its recorded span `[line, line+loc-1]` intersects a
  changed range. This span inherits `bodyEnd`'s best-effort + `loc`-clamp limits (it can *under*-select
  on truncated/clamped bodies) — documented, not presented as exact.
- **SC2** Reports `changedSymbols`, `blastRadius` (union `impactOf`), `domainsTouched`, per-symbol
  caller counts.
- **SC3 [rev]** With `--before`, also reports the **structural** delta via `structuralRegressions`
  (new cycles + lost-callers) — **not** the overlap delta, which a refreshed (`overlaps:[]`) graph
  can't populate. `--gate` → exit 1 on any structural regression; else exit 0.

### Properties
- **★ANTI-CHEAT · RV-HUNK-MAP** Over random graphs + random hunks, a node ∈ `changedSymbols` **iff**
  an **inline interval-overlap** oracle (`!(line+loc-1 < s || line > e)`) says so. Exactly the overlap
  relation.
- **RV-BLAST-EXACT [rev, was RV-BLAST-SUPERSET]** `blastRadius == impactOf(changedSymbols)` (sorted
  equality — **not** a superset, which the whole-graph return would satisfy trivially), excluding the
  changed symbols.
- **RV-WHOLE-FILE** a files-only change selects exactly the nodes in those files. **RV-DETERMINISTIC**.

---

## F6 — architectural fitness rules

Declare invariants; fail review on violation. Architecture-as-code.

- `node scripts/fitness.mjs <graph.json> [--rules codeweb.rules.json] [--json]`
- Rules: `forbidden-dependency {from,to}` (domain match), `no-cycles`, `max-fan-in {limit}`,
  `max-symbol-loc {limit}`, `layer {order:[...]}` (a domain may depend only on domains at/below it).

### Success criteria
- **SC1** Rules from JSON `{rules:[{id,type,severity,...}]}`; each violation
  `{ruleId,severity,message,subjects:[ids/edges]}`.
- **SC2** Exit `1` iff ≥1 `severity:"error"` violation; else `0`; `--json` lists all.
- **SC3** Unknown rule `type` → exit 2 (never silently ignored).

### Properties
- **★ANTI-CHEAT · FR-FORBIDDEN-SOUND** `forbidden-dependency` (and `layer`) violations equal exactly
  the edges whose from/to **node domains** match, recomputed by an **inline edge filter** in the test
  (no shared library) over random graphs.
- **FR-FANIN** `max-fan-in` violations == nodes with `callIn` size `> limit` (independent count).
- **FR-CYCLE-AGREE** (companion / wiring) `no-cycles` violations correspond to `fileCycles(graph)`
  (itself independently pinned in `graph-ops.test.mjs`); **[rev]** add a no-cycle negative case and
  assert `subjects` names the participating files, not just the count.
- **FR-EXIT** exit `1` iff an error-level violation exists. **FR-DETERMINISTIC**.

---

## F7 — risk scoring

Rank symbols by change-risk so a reviewer triages the dangerous ones first.

- `node scripts/risk.mjs <graph.json> [--changed <files>] [--churn <map.json> | --git] [--json]`
- **[rev]** `risk = Σ wᵢ·normᵢ(componentᵢ)` over `{fanIn,fanOut,loc,blast,churn}`, with **named
  constant weights exported from one place**, and a **precisely-defined normalizer**: divide by the
  graph-max of each component; an all-zero / single-node component normalizes to 0 (no divide-by-zero).
  Churn from `--churn` (a `{file:commits}` map; deterministic) or `--git` (integration).

### Success criteria
- **SC1** Per node `{id, risk, components:{fanIn,fanOut,loc,blast,churn}}`, ranked by `risk` desc then
  `id`; `--changed` restricts to changed symbols.
- **SC2** Components are the raw metrics; score is the documented weighted sum of their normalizations.

### Properties
- **★ANTI-CHEAT · RK-COMPONENTS** Each component == its independent metric (`fanIn==callIn.size`,
  `fanOut==callOut.size`, `loc==node.loc`, `blast==impactOf(seed).length` with the **test** supplying
  the seed id, `churn==provided`), and `risk` == the formula re-applied in the test using the
  **imported** weight constants (not re-hardcoded). Over random graphs.
- **RK-MONOTONE [rev]** Over **100 random component vectors**, increasing any single component (others
  fixed) never decreases `risk` (catches weight-sign errors a fixture would miss).
- **RK-DETERMINISTIC / RK-RANK-STABLE**.

---

## F8 — consolidation codemod

Close the loop from `optimize` *advises* to a concrete, gate-checked **edit plan** (apply optional).

- `node scripts/codemod.mjs <graph.json> (--opportunity <ovId> | --merge <ids> --into <id>) [--json] [--write]`
- **Default plan-only.** Pure planner `consolidationPlan(graph,{ids,into})` →
  `{canonical, deletions:[{id,file,range}], rewrites:[{callerId,file,line}], projectedGate, locReclaimed}`.
- **SC for `--write` [rev — the one contract-risk feature]:** `--write` may touch **only** (a) the
  loser **definitions** (deletions) and (b) reference edits it can make **provably unambiguously**
  (the loser label resolves to a single global definition). **Call-site token rewriting in the
  ambiguous case is out of scope and refused** — codeweb never re-introduces the `byName` guessing the
  extractor rejects. It re-extracts, runs `diff.mjs`, and **restores from backup + exits 1** if the
  gate regresses. Reversibility ≠ correctness — the byte-scope above is the correctness boundary.

### Success criteria
- **SC1** `projectedGate` == the `simulate-edit --merge` verdict for the same op.
- **SC2** `deletions` == losers' `{file,[line,line+loc-1]}`; `locReclaimed` == Σ loser `loc` (matches `optimize`).
- **SC3** `rewrites` covers every caller with a `call` edge to a loser; no caller of only the canonical.
- **SC4** Plan-only is **pure** (graph + source byte-identical after). A gate-rejected `--write`
  restores every touched file byte-identical and exits 1.

### Properties
- **★ANTI-CHEAT · CM-GATE-AGREE** `plan.projectedGate` == `structuralRegressions(before,
  applyEdit(before,{merge}))` — the exact trusted oracle `simulate-edit` is pinned to, called
  **independently** in the test. One truth.
- **CM-DELETIONS-EXACT** deletions == losers' source ranges (independent of internal bookkeeping).
- **CM-REWRITES-COVER** rewrite caller-set == call-edge in-neighbors of the losers (inline edge oracle);
  canonical-exclusive callers absent.
- **CM-PLAN-PURE** plan-only never writes.
- **CM-WRITE-REVERSIBLE [rev — dedicated scenario test, real on-disk files]** a gate-rejected `--write`
  leaves every touched file's bytes == the pre-run snapshot.

---

## F9 — cycle-breaking advisor

For each dependency cycle, propose the cheapest edge to sever — and **prove** it works.

- `node scripts/break-cycles.mjs <graph.json> [--json]`
- **[rev]** `fileCycles` ignores edge weight, so F9 aggregates underlying symbol-edge counts into the
  file→file graph **separately** to rank "cheapest."

### Success criteria
- **SC1** For each `fileCycles` SCC, propose a candidate cut: the file→file dependency in the cycle
  backed by the **fewest underlying symbol edges** (lowest aggregate weight).
- **SC2** Each proposal is **verified**: `fileCycles(graph − cut)` no longer contains that cycle.
- **SC3** Every cycle gets a proposal or an explicit "no single-edge cut found" note (no silent drop).

### Properties
- **★ANTI-CHEAT · CB-CHEAP [rev — promoted to ★]** The proposed cut's aggregate weight ≤ the **mean**
  cross-file edge weight within the cycle, verified over random cyclic graphs by an **inline**
  weight-aggregation oracle. (The non-trivial guarantee — picking a *cheap* cut, not any cut.)
- **★ANTI-CHEAT · CB-NO-FABRICATE [rev — added]** Every proposed cut edge **exists** in the original
  graph's edge list (an implementation can't "break" a cycle by removing a fictitious edge).
- **CB-VERIFIED** (companion) The test **independently reconstructs** the cut graph
  (`{...graph, edges: edges.filter(e => !cut(e))}`) and asserts `fileCycles` no longer contains the
  cycle — checking the *final result*, not the feature's internal bookkeeping.
- **CB-ADVERSARIAL [rev]** A fixture where both a cheap and a non-cheap cut break the cycle asserts the
  cheaper is chosen. **CB-COVERS** every cycle addressed. **CB-DETERMINISTIC**.

---

## Delivery

- Every new **read-only** agent tool (`find_similar`, `placement`, `tests`, `review`, `fitness`,
  `risk`, `codemod` plan, `break-cycles`, `deadcode`) is exposed via `mcp-server.mjs`. `codemod --write`
  is **not** exposed over MCP (mutating + risky); only its plan is.
- Shared primitives live in `scripts/lib/` (`shingles.mjs` new; `graph-ops.mjs` extended with `testIn`
  in `buildIndex`, `reviewImpact`, etc.) so no logic is duplicated.
- The three extractor-touching features (F3, F4, F0) are gated together behind
  `tests/golden-ecc-scripts.test.mjs` and the `LEGACY_FALLBACK` A/B, since all change `nodes`/`edges`/`loc`.
- Each feature ships failing tests + properties **written and reviewed before** implementation, driven
  to green; the full suite stays green throughout; then each tool is verified in practice against a
  real generated graph end-to-end.
