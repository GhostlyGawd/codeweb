# Round-2 WS-G — report & editor (#36, #38, #37, #35)

Findings: IMPROVEMENTS.md Theme F. Build order **#36 → #38 → #37 → #35**: #36 and #38 are isolated
big wins (embed strip; lens BFS); #37 makes the draw loop cheap so #35's sim work is measurable
without draw noise; #35 last because it carries genuine research risk plus the receipt re-run.
Shared files with A–F: **none except `bench/results/`** — coordinate any `bench/results/*` commit
with WS-E (#42 also refreshes receipts there). Standing invariant for every task: rebuild-twice
byte-identity of `report.html` (tests/build-report.test.mjs:55) stays green.

## Ground truth (verified by grep/read at spec time — re-verify before building)

- **Template read-set** (scripts/report-template.html): nodes → `id,label,domain,kind,role,file,
  line,loc,exports,summary`; edges → `from,to,weight` (matrix `:532` reads `e.weight||1`); meta →
  `target,mode,engine`. **Never read:** node `t3,signature,complexity,maxDepth`; edge `kind`.
  (Node `kind` IS read at :248/:269/:424/:427 — strip is per-EDGE kind only.)
- **`domSummary` is dead in the TEMPLATE**, not build-report: `report-template.html:228` builds it;
  zero other references. (Finding text points at build-report.mjs — the code says otherwise.)
- Theme flips notify canvas via `applyTheme()` → `setTimeout(gDraw)` (template:307), so a
  once-per-gDraw `cvColors()` hoist is sufficient — no extra event hook needed.
- The fixed BFS shape to mirror for #38: `scripts/lib/graph-ops.mjs:232-244 impactCountOf`
  (indexed `for (i=0; i<queue.length; i++)` pointer queue; iterate the `callIn`/`inheritIn` Sets
  directly; no per-visit `[...a, ...b]` merge). lens-core must stay dependency-free (its header
  contract) — copy the shape, do not import.
- `bench/results/report-scale.json` is stale exactly as #35 says: no `expandAll` row, verdict
  still "GREEN at 16k … no fix needed". `tests/report-scale-bench.test.mjs:52` pins the
  `simMsPerFrame` field name — the metric change must update that pin in the same commit.
- `bench/results/scale-typescript.json` has NO in-repo writer under that name; it is produced by
  `node bench/experiments/scale.mjs --repo <TypeScript checkout> --out …`. The 16.8k report run
  below uses the synthetic loaded corpus and does NOT regenerate it → it stays WS-E #42's item.
  If a TS checkout is available during T-35.6, run scale.mjs too and commit both; else say so in
  evidence so #42's note stays honest.
- Template-inline functions are node-testable via the brace-balancing `extractFn` pattern in
  `tests/treemap-bisect.test.mjs` — use it for every sim/draw helper below ("what ships is
  what's tested").

## #36 — strip the unread embed (High/S) — files: scripts/build-report.mjs, scripts/report-template.html, tests/build-report.test.mjs

- **T-36.1** Extend the embed strip (build-report.mjs:103-116). Build the embed with **new**
  node/edge objects (no mutation of `graph` — sidecars at :77-88 and graph.json at :72 are
  written from the same objects earlier; non-mutating map keeps future reorders safe): per node
  delete `t3`, `signature`, `complexity`, `maxDepth`; per edge delete `kind`. Explicit delete-list
  only — everything in the read-set above stays. `graph.json` on disk keeps ALL fields (editor
  lens, MCP, hooks read it; strip is embed-only). TDD: failing test first in build-report.test.mjs
  — report.html contains none of `"t3":`, `"signature":`, `"complexity":`, `"maxDepth":`, and no
  `"kind":` inside the edges array (probe an edge fixture value), while graph.json keeps all five;
  detail panel parity: node `kind` still renders (fixture assertion on the embedded nodes).
- **T-36.2** Delete dead `domSummary` (template:228). Grep-proof zero remaining references.
- **T-36.3** Byte-determinism re-check: existing rebuild-twice + SOURCE_DATE_EPOCH assertions
  (build-report.test.mjs:55-87) green unchanged; add the stripped-field probes to that test so a
  regression re-embedding 4 MB of fingerprints fails loudly. Size claim (−≥40 %) is measured at
  16.8k in T-35.6's run (record embed bytes before/after in evidence).

## #38 — lens BFS + memo + activation (Medium/S) — files: editor/vscode-codeweb/{lens-core.js,extension.js,package.json}, tests/vscode-lens.test.mjs, bench/experiments/lens-bench.mjs (new)

- **T-38.1** Rewrite `blastOf` (lens-core.js:29-42) to the impactCountOf shape: pointer-index
  queue, direct Set iteration, no spread merge. TDD: existing semantics tests must pass unchanged
  (same numbers — callers/blast parity with MCP is the contract); add a factor-based budget test
  (CI-noise-safe): on a synthetic 20k-node deep-chain graph, full-file lens pass ≤ K× a single
  linear index build (pick K empirically ≈3–5, assert factor not absolute ms). Add
  `bench/experiments/lens-bench.mjs` (dev-side, ~40 lines): load a graph.json, time
  `lensesForFile` for the worst file cold + warm, print ms — the <40 ms evidence tool.
- **T-38.2** `blastMemo` persistence across refreshes. `buildLensIndex(graph, prevIndex)` carries
  memo entries whose ids are provably unaffected. **Invalidation key**: diff old vs new
  `callIn`/`inheritIn` maps into an edge delta (added+removed `from→to` per kind, plus edges of
  added/removed nodes); seeds = the `to` endpoints of every delta edge; invalid set =
  forward-closure of seeds over the NEW graph's call+inherit forward adjacency (`from→to`
  direction). Carry `memo[id]` iff id ∉ invalid and id still exists. Soundness note for the code
  comment: a delta edge (A→B) changes `blast(Y)` only for Y ∈ forward-closure(B); the path suffix
  past the LAST delta edge always exists in the new graph, so new-graph closure suffices.
  `extension.js:48 refresh()` stops clearing `graphCache`; `loadIndex` passes the previous index
  when mtime/size changed. TDD: property test — for randomized graph pairs (mutate 1–5 edges),
  memo-carried results === cold-rebuild results for every id; plus a counting test proving
  untouched-subgraph ids did NOT recompute (instrument via a seeded memo sentinel).
- **T-38.3** `package.json` activationEvents: `["workspaceContains:**/.codeweb/graph.json",
  "onCommand:codeweb.refreshLenses", "onCommand:codeweb.openReport"]` (engine ^1.85 auto-derives
  onCommand from contributes; keep them explicit as the fallback the finding asks for — commands
  still work in never-mapped workspaces). Test: shape assertion in vscode-lens.test.mjs — no
  `onStartupFinished`, workspaceContains present.

## #37 — draw loop (High/M) — files: scripts/report-template.html, tests/report-draw.test.mjs (new), tests/report-scale-bench.test.mjs

- **T-37.1** Hoist `cvColors()` to one call at the top of `gDraw` (template:800 → :756), pass/close
  over the result in the label branch. Correct across theme flips because applyTheme redraws
  (ground truth above). −16.8k getComputedStyle per draw.
- **T-37.2** Screen-space label LOD with a per-frame cap. Candidate rule replaces world-space
  `nd.r > 7.5` (:796) with screen radius `nd.r * cam.k`; collect candidates during the node pass,
  draw labels in a second pass capped at `LABEL_CAP = 300`, priority order (deterministic):
  bubbles > selectedNode + its lit neighbors > search hits (when `hl.size < 40`) > screen radius
  desc, tie-break by id. Extract the pure ranking fn (`labelPick(nodes, cam, hl, cap)`) so
  extractFn can pin it in node: cap respected, priority order, determinism (same input → same
  output array).
- **T-37.3** Edge batching by quantized style bucket. Bucket key = `state|alphaQ|widthQ` with
  state ∈ {dim, tangle, norm}, `alphaQ = Math.round(alpha*32)`, `widthQ = Math.round(width*2)`
  (alpha from the existing wgt formulas :775-782). One `beginPath` + one `stroke` per bucket;
  per-edge `moveTo` + `quadraticCurveTo`. Low-zoom fast path: when `cam.k < 0.35`, weight-1
  non-bubble-pair edges use straight `lineTo` (no curve). Extract `edgeBucketKey(e, A, B, on)` as
  a pure fn; test: bucket count on a synthetic 50k-edge set is ≤ ~200 (bounded styles), keys
  stable, dimmed/tangle/norm never share a bucket.
- **T-37.4** Reuse `refreshHits`: have `refreshHits()` (template:824) also store `hitIds:Set` +
  `hitDomains:Set`; `gDraw`'s search branch (:760-763) uses them instead of re-scanning AN per
  frame. Re-run `refreshHits()` where the active set changes (role-filter toggle path calling
  computeDerived). Test: extractFn-pin that gDraw's source no longer contains the
  `AN.forEach`+`toLowerCase` rescMatch in the search branch (source-level guard), plus a behavior
  test that hit sets equal the old computation on a fixture.
- **T-37.5** Draw instrumentation + Playwright verification. Add `__codewebStage.drawOnce()`
  returning ms for one full `gDraw` at current camera (fitted). Playwright
  (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers, Chromium preinstalled): real click path — open
  report, click graph tab, click `#gToggle` (Expand all), type in `#gsearch`, wheel-zoom, assert
  no pageerror and `drawOnce()` at fit < 100 ms at 16.8k (evidence, not CI — CI runs the fixture
  scale via report-scale-bench.test.mjs, which gains a drawOnce schema pin).

## #35 — expand-all sim (High/M, research risk) — files: scripts/report-template.html, bench/experiments/report-sim-lab.mjs (new), bench/experiments/report-scale.mjs, bench/results/report-scale.json, tests/report-sim.test.mjs (new), tests/report-scale-bench.test.mjs

Order inside #35 is load-bearing. The audit's adversarial result: **velocity clamp + spiral hatch
ALONE measured 542 ms/step — worse than the 205 ms baseline** — because the ±185k px explosion was
accidentally load-bearing: it was the only mechanism spreading nodes apart, and with only 3×3
near-field forces a compact spiral seed keeps everything inside CUT forever (density self-adapts
to any CUT). Therefore the far-field monopole (the new spreader) lands FIRST and is proven in the
lab before any seeding change; the spiral may never ship without it.

- **T-35.1** Node-runnable sim lab (TDD instrument, before any physics change). Extract `gStep`
  (and later the chunker) via the extractFn pattern into `bench/experiments/report-sim-lab.mjs`:
  builds a synthetic expanded W at any scale (`--domains 20 --per-domain 840` ≈ 16.8k, edges
  sampled with the loaded-corpus LCG — seeded, no Math.random), runs to settle, reports
  `settledMsPerStep` (mean of last 10 logical steps), `maxSingleTaskMs`, step count, spread stats
  (cell-occupancy p95). First run reproduces the finding's ~205 ms/step baseline (record it).
  tests/report-sim.test.mjs pins: extraction works; small-scale settle terminates; determinism —
  two runs, bitwise-equal final positions.
- **T-35.2** Far-field monopole (Barnes-Hut-lite) in `gStep`. After the grid build (:722-727):
  per cell accumulate mass `m_c = Σ(900/2 + r_i·55)` (mirrors repK's terms) and centroid; per node,
  loop all cells EXCLUDING its 3×3 neighborhood, add `f = K_FAR·m_c/max(d²,CUT²)` along
  (node−centroid). Structure is fixed; constants (K_FAR, and the exact mass split) are lab-tuned
  in T-35.1 against the acceptance below. **Determinism requirement (spell in code): cells
  iterated in grid-Map insertion order (a pure function of node-array order), forces accumulated
  in node-array order, no Math.random, no wall-clock in physics.** Escape hatch if live-cell count
  C explodes at settle spread: coarsen the far-field aggregation to 2×CUT cells when C > 4096
  (still deterministic). Lab acceptance before proceeding: settled ms/step at 16.8k strictly below
  the 205 baseline AND occupancy p95 falls (equilibrium spreads).
- **T-35.3** Golden-spiral hatch seeding — only on top of T-35.2 (gate: T-35.2's lab acceptance
  met; the task MUST NOT land in a commit that precedes the monopole). Replace the radius-14
  hatch (:677-678): per-domain sequence k, `rad = SP·√k`, angle `k·2.39996`, centered on the
  domain bubble's last position; SP ∈ [30,50] px chosen by lab sweep (target: near-equilibrium
  spacing, no explosion). A velocity clamp is now safe — add only if the lab shows no settled-ms
  regression. Lab acceptance: first logical step's max task collapses (no explosion) and settle
  converges faster than T-35.2 alone.
- **T-35.4** Chunkable gStep. Restructure into `gStepChunk(deadline)` with a cursor
  `{phase: zero|grid|far-aggregate|pairs|springs|far|integrate, i}`; forces accumulate across
  slices into fx/fy; grid + monopole aggregates snapshot at logical-step start; ONE integrate pass
  and ONE alpha decay per completed logical step. `gTick` (:705-713) and the reduced-motion slice
  loop (:694-701) drive the chunker against their budgets — the first post-expand frame does at
  most one budget slice at any n. Determinism: slicing must not change arithmetic — lab test:
  bitwise-equal final positions for budget=∞ vs budget=2 ms runs.
- **T-35.5** Reduced-motion feedback: in the REDUCED slice loop, `gFit()+gDraw()` at most once per
  ~1 s wall (every N slices) plus the final draw — discrete progress stills, not animation; keep
  the "newer layout supersedes" seq guard. Expose a stage counter (`__codewebStage._settleDraws`)
  and verify via Playwright `page.emulateMedia({reducedMotion:'reduce'})`: counter > 1 during a
  16.8k expand-all settle.
- **T-35.6** Metric fix + receipt re-run + COMMIT. Replace `__codewebStage.expandAll`'s 10-frame
  sample (:889-898 — unstable by construction: it straddles the explosion, 508→116→37 ms across
  back-to-back calls) with: run to settle (alpha ≤ 0.02, hard step cap), return `{nodes, edges,
  settledMsPerFrame (mean of last 10 logical steps), maxSingleStepMs (max uninterruptible task),
  totalSettleMs, steps}`. report-scale.mjs verdict gates on BOTH: `expandAllOk =
  settledMsPerFrame ≤ 50 && maxSingleStepMs ≤ 250`; green includes it. Update the
  report-scale-bench.test.mjs:52 schema pin in the same commit (deliberate schema change, not
  test-weakening). Re-run fixture row + 16.8k row (commands below), rewrite
  `bench/results/report-scale.json` — rows, thresholds incl. the two new gates, and an honest
  verdict header (the "GREEN … no fix needed" claim goes). Committing this receipt also closes
  the report-scale half of WS-E #42's stale-receipt note; scale-typescript.json per ground truth.

## Success criteria — the plan's WS-G bar, with measurement commands

Corpus (once): `node --input-type=module -e 'const m=await import("./bench/lib/loaded-corpus.mjs");
console.log(m.writeLoadedCorpus("/tmp/cw16k",{files:800}))'` (800×21 = 16.8k fns), then
`node scripts/run.mjs /tmp/cw16k --out-dir /tmp/cw16k-ws`.

- **#36**: report.html ≥ 40 % smaller at 16.8k with template feature-parity — compare
  `stat -c%s /tmp/cw16k-ws/report.html` pre/post; DCL and heap from the T-35.6 row improve;
  byte-determinism tests green.
- **#38**: lens per-file < 40 ms at 16.8k —
  `node bench/experiments/lens-bench.mjs /tmp/cw16k-ws/graph.json`; memo equivalence property
  test green.
- **#37**: fitted draw < 100 ms at 16.8k — `drawOnce()` via the T-37.5 Playwright run.
- **#35**: no single frame > 250 ms and settled sim ≤ ~50 ms/frame at 16.8k — 
  `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node bench/experiments/report-scale.mjs --report
  /tmp/cw16k-ws/report.html --out /tmp/row16k.json --label "loaded corpus 16.8k"`; refreshed
  `bench/results/report-scale.json` committed.
- Suite: `node --test tests/` green ×2; evidence (commands, numbers, shas) appended to
  `docs/specs/round2-evidence.md`.

## Determinism invariants

- `report.html` byte-determinism across rebuilds holds after every task (canvas LAYOUT positions
  are runtime state, not gated artifact bytes — no golden-pixel tests).
- Sim determinism (same input → same layout) is a code invariant: seeded/no-random, insertion-order
  iteration, slice-independent arithmetic — asserted in the lab tests, not a bench gate.
- `graph.json` on disk keeps every field; only the embedded copy slims.

## Risk & fallback (#35 must not wedge)

Genuine research risk: monopole constants may not reach ≤ 50 ms settled at 16.8k. Timebox the
T-35.1 lab sweep (~half a day). **Fallback acceptance** if the target is out of reach: ship
T-35.2/3/4/5 at their best measured settle, gate only `maxSingleStepMs ≤ 250` (the chunker
guarantees it), require interaction ≥ 15 fps during the anneal (with #37 landed; verify via the
Playwright run), and commit the receipt with the HONEST settled number + a threshold note naming
it a floor, not a pass. Rollback: one commit per task; #35 physics lives in small extracted
functions so revert = restore `gStep`/hatch verbatim.
