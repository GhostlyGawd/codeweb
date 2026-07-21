# Round-2 WS-H — deep refactor finale: #40 orchestrator decomposition + #18b in-process hook extraction

Effort **L**. Runs **last** (per round2-plan build order). Shared-file locks: `scripts/extract-symbols.mjs` may be touched only after WS-D lands; `hooks/post-edit-diff.mjs` only after WS-F lands. Prior art: prior-#25 (docs/perf-quality-review-2026-07-21.md:169) extracted the pure halves — `lib/masking.mjs`, `lib/lang-rules.mjs`, `lib/import-resolve.mjs` (the factory template) with in-process tests (`tests/lang-rules.test.mjs`). #40 is prior-#25's tracked residual; #18b consumes it.

## H0 · Ground rules

- **Rebase gate (mandatory first step):** every line ref below is spec-time (commit 17a8225, pre-B..G). B/C/D edit this exact file (#8/#9/#12–#15 lang truth, #17 name-delta invalidation, #19 cache slimming, #21 enclosing() per-line index). Before coding each task, re-read `extract-symbols.mjs` at HEAD and re-run the free-variable audit; the METHOD below binds, not the spec-time line numbers. Expected D-era drift: `deriveFileEdges` likely gains #21's per-line innermost-range index (new param or ctx) and #17's candidate-identifier recording (extra return field) — both carry over verbatim into the factory.
- **Always green:** each task is one commit; full suite green before each; never weaken an existing test (converted tests keep identical assertions — only the transport changes).
- **Proof harness P1 — frozen-tree self-map byte-cmp (run after EVERY stage):**
  1. Once per workstream: `cp -a` the repo (minus `.git`, `.codeweb`, `node_modules`) to a scratch dir — `cp -a` preserves mtimes; `meta.sources`/`meta.dirs` embed size+mtime, so the tree must be bit- and stamp-frozen.
  2. Pre-stage commit: `node scripts/extract-symbols.mjs <frozen> --out base.json`; post-stage: same command → `cand.json`; **`cmp base.json cand.json` must be silent** (byte identity, ordering included — not just sorted-set equality).
  3. Warm variant post-stage: extract twice with `--cache` into the same cache, `cmp` run2 vs the `--full` output.
- **Proof harness P2 — IE-EQUIVALENCE at full depth:** run `tests/incremental-edges.test.mjs` at the #6 CI trial depth (40 trials, whatever env knob WS-A landed) after stages 1 and 5; local depth suffices for stages 2–4.
- **Proof harness P3 — spawn accounting:** record `grep -rc "runNode(" tests/` at pre-H HEAD (spec-time: 276) and after stage 4; plus one measured dynamic count (child launches during the converted tests, via a counting wrapper) for the ledger.

## T-40.1 · Stage 1: `createEdgeDeriver(ctx)` → `scripts/lib/edge-derive.mjs`

**Files:** new `scripts/lib/edge-derive.mjs`; `scripts/extract-symbols.mjs`; new `tests/edge-derive.test.mjs`.

**Approach.** Move `deriveFileEdges` (spec-time :685-799) verbatim into a factory, import-resolve style (`createImportResolver`, import-resolve.mjs:27, is the proven template — explicit injected ctx, renamed-at-destructure to dodge self-map bare-name false edges). Free-variable audit of the function body at spec time — **every** identifier resolving outside its params/locals:

| free identifier | today (spec-time) | in the factory |
|---|---|---|
| `KEYWORDS` | import from lang-rules (:22) | lib imports directly |
| `byName` | module-global Map (:531) | `ctx.byName` |
| `pkgOf` | module fn closing over root+memos (:125) | `ctx.pkgOf` |
| `idFile` | module const (:49) | defined+exported by edge-derive.mjs; orchestrator imports it back (deletes :49) |
| `isTestFile` | import from graph-ops (:19) | lib imports directly |
| `LEGACY_FALLBACK` | env-derived const (:679) | `ctx.legacyFallback` (orchestrator keeps the env read) |
| `resolveFileMember` | resolver method (:546) | `ctx.resolveFileMember` |

Audited **not** free (briefing guesses that don't hold at spec time): `files`; the alias/ns/class maps (per-call params, :685); the masked-text accessor (call-site concern — masking happens in the edge loop, :821). The edge loop with its cache replay (`reuseEdges`, :808-832) **stays in the orchestrator** — cache plumbing is orchestration per #40's fix text. Rule: every free identifier is either a lib-local import of a pure module or an explicit ctx field; zero reach-back into orchestrator module scope. Signature and return shape (`{edges, hasModule, ambiguous}` + any D-era fields) preserved exactly.

**Criteria:** P1 silent; P2 full-depth green; `deriveFileEdges` callable in-process with a hand-built ctx.
**Tests:** `tests/edge-derive.test.mjs` (lang-rules.test.mjs pattern — no spawn, no tmpdir): alias > same-file > unique-in-package precedence; ambiguous drop; KEYWORDS skip; test-kind reclassification; rb/php cross-file-method bare-name filter (:715); `legacyFallback` flag behavior; self-call/self-definition suppression.
**Commit:** `refactor(engine): edge derivation behind createEdgeDeriver(ctx) in lib — finding #40`.

## T-40.2 · Stage 2: pub-API walk + typed-intent resolution join edge-derive.mjs

**Cohesion decision:** same lib, not new files — all three are global-resolution passes over the assembled node universe, each ~30-45 lines; import-resolve stays the import-binding home. Two pure functions:

- `markPublicApi({ nodes, relFiles, pkgOf, sources, reExportEdges, readPkg })` (from :595-634): `readPkg(dir) → string|null` is injected so the lib does no fs; returns the **Set of node ids to stamp** — the orchestrator applies `n.pub = true` (order-safe: the walk never reads `pub`).
- `resolveTypedIntents({ intentsByFile, nodeIdSet, existingTriKeys })` (from :886-908): returns `{ edges, wired, dropped }`, appending keys to the caller-owned `existingTriKeys` (today's semantics); lib uses its own `idFile` + imported `isTestFile`. This mechanically eliminates #40's named shadowing smells (`rel` loop var vs `rel()` fn at :894; `files` local vs global at :896).

**Criteria:** P1 silent; IE local-depth green; both functions in-process-tested (deterministic iteration order pinned — the `[...keys].sort()` at :894 moves with the code).
**Commit:** `refactor(engine): pub-API walk + typed-intent resolution into lib/edge-derive — finding #40`.

## T-40.3 · Stage 3: main guard + `runExtract(opts)` — import becomes side-effect-free

**Files:** `scripts/extract-symbols.mjs`; new tests in `tests/extract-engine.test.mjs` (or a new `tests/run-extract.test.mjs`).

**Approach.** Repo idiom check done: run.mjs has no guard; the three hooks do — use **their** idiom verbatim: `if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url)))` (post-edit-diff.mjs:63, pre-edit-impact.mjs:109, session-brief.mjs:47). Restructure:
- `export async function runExtract(opts)` (async — engine loads await) wraps everything from root resolution through cache write-back + banner; returns `{ fragment, banner }`. Cache write (incl. dirty-skip, `pub`-strip) stays **inside** runExtract — it is engine semantics the hook depends on. `--out`/stdout writes move to `main()`.
- Defaults of `opts` equal today's CLI defaults (`ctags: true`, `engine: process.env.CODEWEB_ENGINE || null`, rest null/false) so `engineMode`/cache namespace match — warm caches survive; SCANNER_VERSION and cache format untouched.
- All exits become `throw new ExtractError(code, message)` with **byte-identical message text** (usage :67 / rules :77 / not-found :79 / empty tree :203-208 / zero symbols :939-943 — empty-target.test.mjs pins wording); `main()` prints and exits.
- Module globals → runExtract locals: `files, nodes, byName, fileSyms, maskCache, oldCache/newCache/stampTier/cacheDirty/scanCount, manifestMemo/pkgMemo, ctagsBatch, sources, dynamicFiles, dispatchByFile, typedIntentsByFile/typedLangsSeen, alias tables, importEdges/edges + counters, astProbe/astLoadFailed, roleOverride`. Deliberate process-wide survivors, documented in a comment: `_tsEngineState`/`langEngines` (WASM parser memo — stateless; reloading per call would forfeit T-18b's win; the once-failed=null memo keeps per-process semantics).

**Criteria (all three):** (a) side-effect-free import — `node -e "import('<fileURL>').then(()=>process.stdout.write('clean'))"` in an empty cwd: exit 0, stdout exactly `clean`, empty stderr, no files created (cli.mjs's pre-existing import-time EPIPE handler is accepted — hooks already carry it); (b) reentrancy — new test IE-TWO-RUNS: two `runExtract` calls in one process on two different trees, each byte-equal (`JSON.stringify` compare) to a fresh CLI run; (c) P1 silent + CLI stderr/exit-code parity on the guard paths.
**Commit:** `refactor(engine): extract-symbols main guard + runExtract(opts); import is side-effect-free — finding #40`.

## T-40.4 · Stage 4a: starter trio of spawn→in-process test conversions

Chosen by reading which tests exercise only extraction/edge derivation (justifications):
1. **tests/incremental-edges.test.mjs** — the trial inner loop (`extract`/`coldFull`, 2 static sites, ~330-490 child launches at CI depth; the suite's dominant wall term pre-#6 at 48.9 s). Converts to `runExtract` **and gains IE-INPROC-PARITY**: once per run, `JSON.stringify(runExtract(...).fragment)` byte-equals the spawned CLI's stdout on the same tree — the CLI surface stays pinned while the loops go in-process. Convert whatever per-trial shape WS-A's #6 left.
2. **tests/call-apply-chain.test.mjs** — pure edge-derivation semantics (member-chain resolution), 1 site/3 launches; the template for the family batch (writeTree → extract → hasEdge shape).
3. **tests/test-edges.test.mjs** — 6 sites, the most of any extractor test; test-kind reclassification lives inside `deriveFileEdges` (:721), so it doubles as seam coverage for T-40.1.

**Rejected candidate:** dup-check.test.mjs (briefing suggestion) — zero `extract-symbols` references (it spawns dup-check/review); nothing for `runExtract` to replace.

**Criteria:** all converted assertions identical; IE-EQUIVALENCE wall at CI depth drops ≥5× vs the post-#6 baseline (record actual); `cli-front-door`/`empty-target` stay spawn-based (CLI surface owners).
**Commit:** `test(extract): incremental-edges/call-apply-chain/test-edges run in-process — finding #40`.

## T-40.5 · Stage 4b: mechanical family batch — clears the plan's ≥20-site bar

Convert the import/edge-precision family (identical shape to call-apply-chain): `import-member-edges` (3 sites), `class-usage-ref` (2), `import-default-export` (2), `import-anchor-precision` (2), `import-object-alias-precision` (1), `reference-edges` (1), `module-scope` (1), `inherit-edges` (1) = **13 sites**. Any assertion on banner text/exit codes keeps one spawn or moves to cli-front-door — strength unchanged.

**Bar accounting (P3):** static `runNode(` sites converted/obsoleted = 9 (trio) + 13 (family) = **22 ≥ 20** (plan §H bar), i.e. suite count drops by 22 from the measured pre-H HEAD (spec-time 276); dynamic child launches drop by ~350+ per CI-depth run (measured once, ledgered).
**Commit:** `test(extract): import/edge-precision family in-process (22 spawn sites retired) — finding #40`.

## T-18b.1 · Stage 5: in-process extraction in the post-edit hook

**Files:** `hooks/post-edit-diff.mjs`; `tests/post-edit-diff.test.mjs`. Starts only after WS-F lands (shared-file lock) and T-40.3 is merged.

**Approach.** Per hook-fastpath-floor.md's named design, "baseline-fragment reuse rides the scan cache's stamp tier" — the splice against the baseline fragment IS calling the extractor with the warm `SCAN_CACHE_NAME` cache; no new splice code. Replace the child spawn (:46-47) with: **lazy** `await import('../scripts/extract-symbols.mjs')` inside `check()` *after* the `findTarget` guard (a static import would tax every inert fire; #18a's sidecar boot floor must not regress), then `after = (await runExtract({ path: t.root, cache, ...defaults })).fragment`. `check()` becomes async; the main guard awaits it. Fail-open holds: any throw (incl. ExtractError) → `return null`. Everything downstream (structuralRegressions with WS-D's #18a baseline sidecar, stats bump, additionalContext emit) unchanged. Eliminated terms: child node boot, fragment stringify (child) + `JSON.parse` (hook, ~105 ms @16.8k), duplicate argv/probe.

**Criteria:**
- **Perf:** no-change fire at the 16k-class corpus **< 700 ms** median-of-5 — same corpus, payload, and method as WS-D's #18a evidence row (cite it for comparability). Spec-time chain: 1,624 ms → −~325 (#18a) → −child-boundary terms.
- **Verdict parity:** existing hook corpus — `post-edit-diff.test.mjs`, `hook-sidecar.test.mjs` (WS-D), `cache-unification.test.mjs` — passes with assertions unmodified (mechanical `await check(...)` only); byte-identical additionalContext/stderr on the regression fixtures; no-temp-file tripwire and "exactly SCAN_CACHE_NAME exists" still hold; dirty-skip still leaves cache bytes untouched on no-change (in-process write-back path).
- **New BDD scenario:** "given a mapped target with a warm cache, when a no-change PostToolUse fires, then check() returns null and the cache file bytes are unchanged" (perf numbers live in the ledger, not flaky test asserts).
**Commit:** `perf(hooks): post-edit extraction in-process via runExtract (warm-cache splice) — finding #18b`.

## T-18b.2 · Evidence + floor-spec closure

Run P2 (IE full depth) + P1 once more at the final sha. Append to `docs/specs/round2-evidence.md` § WS-H: P1 cmp transcript per stage, IE wall before/after, P3 spawn counts, hook median timings + corpus + sha. Update `docs/specs/hook-fastpath-floor.md`: the "> 1.5 s → in-process extraction" revisit trigger is consumed — record the new measured floor and set the next trigger (structuralRegressions residual stays WS-D's). CHANGELOG entries for #40 and #18b (plan constraint: entries land with the finding, and #40's entry names prior-#25 as now actually closed).
**Commit:** `docs(specs): WS-H evidence + hook-floor spec closure — findings #40 #18b`.

## Kill criterion & rollback

If stage 1 cannot produce a silent P1 cmp within a **day-class effort** (one focused day): revert T-40.1 WIP, abandon T-40.2, and land **stages 3-4 only** (T-40.3/4/5 — still delivers side-effect-free import, in-process testing, and the ≥20-site bar; note T-40.4's edge tests then call `runExtract`, not the factory). T-18b.1 proceeds on stage 3 alone **iff** IE-INPROC-PARITY holds at CI depth; if that also fails, it joins the residual. Record the honest residual (edge-deriver factory ± #18b) in the evidence ledger and CHANGELOG — the #25 lesson: track the residual explicitly, never call the finding done. Rollback unit is one commit per task; libs are additive files, so reverts are clean.
