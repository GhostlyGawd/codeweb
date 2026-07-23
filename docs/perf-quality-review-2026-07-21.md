# codeweb — Performance & Quality Review

**Date:** 2026-07-21 · **Scope:** performance and internal quality across every executing surface — extract engine (regex + AST tiers), post-graph advisors (overlap/risk/optimize/campaign/deadcode), hooks, MCP server, report.html, tests, CI, release tooling.

**Method:** six parallel read-only audits (engine perf · analysis perf · interactive latency · code quality · robustness/determinism · tests/CI/packaging), each required to verify claims against this working tree before reporting. Evidence includes CPU profiles, micro-benchmarks on synthetic 10k–20k-node corpora, a scripted MCP stdio client, reproduced corruption cases, one full test-suite run, and dogfood self-maps (codeweb's own overlap/deadcode output on codeweb, machine findings hand-verified before use). Absolute times are from this container (Node 22.22.2, 4 cores) — treat ratios as the signal, not the milliseconds. Three findings were discovered **independently by two audits each** (the masker's regex-literal blind spot, the three-way scan-cache split, the quadratic blast-radius loop) — treat those as high-confidence.

---

## What changed since the last review

The 2026-07-20 product round (archived to `docs/product-review-2026-07-20.md`, precedent `docs/product-review-2026-07-18.md`) shipped all 15 of its findings — the product surfaces are even now. What it deliberately deferred is exactly what this round hunts: **how fast the machine is, and how sound it is inside**. Three framing facts:

1. **The one perf debt already on the books is real and decomposable.** `docs/decisions/fastpath-daemon.md` records the 4.2 s post-edit hook at 16k symbols and names "baseline-fragment reuse" as the honest fix. This round found the debt is actually three separable problems — a cache-filename split that makes the first hook run *cold* (#17), a warm-extract floor that re-reads every byte on 100 % cache hits (#10), and only then the fragment-reuse spec (#18). Two of the three are cheap.
2. **The determinism story is one field away from byte-exact, but the map itself has a truth bug.** Two identical runs differ only in `generatedAt` (#5) — yet regex literals containing quotes desync the JS masker and fabricate call edges (#1), which corrupted codeweb's own self-analysis: 13 of 25 "safe to delete" deadcode items on this repo are false positives.
3. **The bench culture guards the pipeline, not the advisors.** A ~quadratic blast-radius loop (#9) shipped invisibly because no timed harness covers `risk`/`optimize`/`campaign`/`deadcode`, and the CI gate's only timing check measures the stage-*reuse* path (#13).

---

## 1. State snapshot (measured)

| Surface | Today | After the named fix |
|---|---|---|
| AST-tier extract, 11 MB JS corpus | 34.2 s · **1,312 MB peak RSS** | ~3× faster projected (#7); **217 MB** with two `tree.delete()` calls (#6, byte-identical output, −9 % wall) |
| Python extract, 261-file corpus with `__init__` re-exports | 1,078 ms (70 % in one uncached resolver) | 268 ms — 4× — with a validated 12-line memo (#8) |
| Warm no-change re-extract, this repo | 537 ms vs 635 ms cold — cache recovers ~15 % | O(changed bytes) + one stat sweep (#10) |
| `risk` blast radii, 15k nodes/44k edges | 82.2 s | 28.8 s count-only BFS; **0.75 s** SCC-closure prototype @20k, byte-identical sums (#9) |
| Post-edit hook | 744–815 ms on this repo; 4,200 ms @16k; **first run after a map: 28.7 s cold vs the hook's 30 s timeout** | warm-cache ride-along via one shared cache constant (#17), then #10/#18 |
| MCP query behind a concurrent tool call | 2.5 ms → **527.6 ms** (head-of-line block); 807 ms when auto-refresh fires inline | async children + background refresh (#19) |
| report.html "Expand all symbols" @16.3k nodes | 1,278 ms *per animation frame* × ~259 frames ≈ 5.5 min of sim CPU; reduced-motion path is one synchronous task | neighbor-approximated forces + frame budget (#21) |
| Test suite | 73.3 s wall — 509 pass / 0 fail / 43 skip; one property test is 48.9 s of it | concurrent trials (#30); in-process extractor longer-term (#25) |
| `/tmp` after one suite run | 12 leaked entries, 3.5 MB — and every real edit-hook fire leaks ~1.2 MB forever | `try/finally` unlink + tripwire (#22) |

---

## 2. Opportunity map (impact × effort)

| | **S — hours→a day** | **M — days** | **L — a week+** |
|---|---|---|---|
| **High impact** | #3 atomic writes · #6 tree.delete · #8 python memo · #17 one scan cache · #22 tmp leaks · #29 release gate | #1 masker truth · #2 codemod safety · #7 single-walk AST · #9 blast radius · #10 stamp tier · #13 advisor bench gates · #18 hook fragment reuse · #19 MCP async · #21 report layout · #24 declarative CLI args | #25 extract-symbols decomposition |
| **Medium impact** | #5 byte-determinism · #11 parseSignature · #12 ctags batch · #15 dup-check prefilter · #27 one-truth constants · #28 spike/.live retirement · #32 npm-description drift | #4 freshness integrity · #14 campaign delta · #16 find-similar signatures · #20 MCP fast-path widening · #26 ts-engine tables · #30 IE-EQUIVALENCE · #31 CI breadth | — |
| **Lower impact** | #23 session-brief sidecar · smaller notes | — | — |

---

## 3. Top 5 quick wins (~a day each, most much less)

1. **#6 Free the tree-sitter trees** — two `tree.delete()` calls take an 11 MB extract from 1,312 MB peak RSS to 217 MB and shave ~9 % wall time. Byte-identical output, verified.
2. **#17 One scan-cache filename** — `run.mjs`, the post-edit hook, and `refresh.mjs` each use a *different* cache file for the same workspace, so the first hook fire after every map is a full cold re-scan (28.7 s at 16k, against a 30 s hook timeout). Two one-line edits plus aligning one flag.
3. **#3 Atomic graph writes** — every multi-MB artifact is written in place; a SIGTERM'd auto-refresh leaves a corrupt workspace that the stage-reuse memo then *preserves*. One `atomicWrite()` helper + a memo that validates.
4. **#29 Gate the release on tests** — today a tag push publishes to npm and the Marketplace without running a single test, using an unpinned `vsce@latest`.
5. **#15 Duplication-gate prefilter** — a 2-line exact size-ratio bound skips 78 % of Jaccard pairs in `review --gate` with byte-identical output (278 ms → 110 ms on this repo; scales linearly from there).

## Top 3 big bets

1. **Make the map correct by construction (#1 + #25).** Teach `maskJs`/`stripSC` real regex-literal state — ending fabricated edges, inflated extents, and the 13 false "safe to delete" items on codeweb's own self-map — and split the 1,384-line extractor into pure lib modules so the fix (and everything after it) is testable in-process instead of through ~360 child-process spawns.
2. **The O(changed bytes) incremental floor (#17 → #10 → #18, with #4).** Unify the caches, add an mtime+size stamp tier so a one-file edit stops re-reading the whole repo, then write the baseline-fragment-reuse spec `fastpath-daemon.md` already names. Target: post-edit hook from 4.2 s to the pre-edit sidecar's ~52 ms class at 16k symbols. `docs/specs/incremental-stages.md`'s own revisit trigger ("extract drops below ~2 s") comes within reach.
3. **Responsive at scale, and provably so (#19 + #21 + #13).** Async-ify the MCP server (the `handleMap` pattern, generalized) so one slow tool can't stall every queued request; replace the report's all-pairs O(n²) force step with a neighbor approximation and a frame budget; and add advisor timings + an expand-all row to the bench gates so neither can regress unmeasured again.

---

## 4. Full list

### A · Correctness of the map

#### #1 · maskJs has no regex-literal state — fabricated edges, corrupted self-analysis — **FIX** · engine correctness
Found independently by two audits; reproduced three ways. `maskJs` (`scripts/extract-symbols.mjs:148-197`) tracks strings/templates/comments but not regex literals, and the codebase *knows*: `extract-symbols.mjs:88-94` documents the desync and adopts a convention — build quote-bearing regexes via `String.fromCharCode(39)` contortions (also `scripts/lib/ts-engine.mjs:169`) — instead of a fix. The convention isn't followed: `scripts/lib/complexity.mjs:21` carries three backticks inside regex literals, so `inTemplate` sticks open and the rest of the file is blanked — extracting `complexity.mjs` alone yields 5 nodes, 0 edges despite ~8 same-file calls. Reproduced consequences: `return s.replace(/"/g, '&quot;')` desyncs the string state, `bodyEnd`'s paren-gate (`extract-symbols.mjs:451-461`) never closes, the symbol absorbs the rest of the module → **fabricated call edge from the wrong owner**; a regex containing a backtick flips template state so *prose inside a later template literal became live code and produced an edge*; codeweb's own `build-report.mjs:escAttr` gets a wrong 2-line extent on the self-map. Downstream: 13 of 25 deadcode "safe to delete" items on this repo are false positives (verified individually — `complexity.mjs count/strip`, `minhash.mjs PERM_SEEDS`, `optimize.mjs count/section`, `trend.mjs metrics`, `site/build.mjs renderStats/renderLedger`, ts-engine `up/typedParamsOf`). `stripSC` (`extract-symbols.mjs:427-432`) shares the blindness.
**Fix:** the standard prev-significant-token heuristic (after `= ( , : return [ && || !` a `/` opens a regex; else division), honoring `\` escapes and `[...]` classes, in both `maskJs` and `stripSC`; delete the `fromCharCode` workarounds; add the two repro fixtures plus a self-map regression test asserting `complexity.mjs`'s known same-file edges. **High / M.**

#### #2 · `codemod --write` can corrupt user source and report success — **FIX** · robustness
Reproduced end-to-end, three modes. (a) `scripts/codemod.mjs:53` uses an unresolvable `--into` **verbatim** (`resolveSymbol(...)[0] || into`), so `canonLabel` (line 66) becomes `undefined` — with a root-prefixed spelling of a real id, BOTH definitions were deleted and every loser token (import specifier, call site, a string literal) was rewritten to the literal text `undefined`; exit 0, `applied: true`. (b) The `\b`-token replace (line 103) runs over raw text, rewriting string literals (`"fmtMoney renders totals"` → `"formatMoney renders totals"`). (c) The rewrite left `import { formatMoney } from './dup1.mjs'` pointing at a file that no longer defines it — broken at runtime — and the re-extract gate passed anyway, because bare-name package-scoped resolution (`extract-symbols.mjs:1131-1145`) still finds the name elsewhere and `structuralRegressions` (`scripts/lib/graph-ops.mjs:318-330`) treats a fully-deleted node as a non-regression by design.
**Fix:** `die(2)` when `--into` doesn't resolve to a node id; restrict token rewrites to positions live under `maskJs` (refuse, with a count, when the label appears in strings/comments); re-resolve import specifiers that named a loser and flag/patch unresolved ones before declaring success. **High / M.**

#### #3 · Non-atomic multi-MB writes; the stage memo trusts `existsSync` — **FIX** · robustness
Reproduced: truncate `graph.json` → `query.mjs` and `refresh.mjs` both die (`refresh` needs `meta.root` from the corrupt file itself, so no self-heal), and a `run.mjs` re-map on unchanged sources prints *"stages reused (fragment unchanged) — skipping downstream recompute"* and **keeps the corruption** — the memo (`scripts/run.mjs:92-105`) checks only that outputs exist. Kill windows are real: `mcp-server.mjs:114` SIGTERMs its refresh child at 60 s, and `refresh.mjs:66`, `build-report.mjs:84`, `cluster3.mjs:103`, `overlap.mjs:429`, `coverage.mjs:47` all `writeFileSync` the graph in place — the whole multi-MB serialize+write is a destroy window; concurrent hook reads during it parse partial bytes.
**Fix:** one `atomicWrite(path, data)` (same-dir temp + `renameSync`) in `scripts/lib/cli.mjs`, used by every graph/fragment/sidecar writer; make the memo's reuse conditional on the artifact actually parsing (or store output hashes in `.stages.json`). **High / S.**

#### #4 · Freshness stamps can be false-fresh — **FIX** · robustness
Reproduced: a same-length content change with `utimesSync`-restored mtime makes `checkStaleness` (`scripts/lib/cli.mjs:152-172`) return `null` while the graph no longer matches the source — so MCP auto-refresh never fires and agents get confidently wrong answers marked fresh (`rsync -a`, `tar -x`, `git-restore-mtime`, `SOURCE_DATE_EPOCH` workflows all hit this). Separately, `extract-symbols.mjs:597-599` stats **after** reading, so a file modified between read and stat is stamped with the new mtime while nodes describe the old bytes — permanently false-fresh with no exotic tooling involved.
**Fix:** the extractor already computes `sha1(text)` for the scan cache — persist it in `meta.sources` (`{s, m, h}`); keep the stat fast path, but compare hashes in refresh (and a `--verify` mode) when stats match; stat before read and re-stat after, re-reading on mismatch. Pairs naturally with #10. **Medium / M.**

#### #5 · `generatedAt` is the sole nondeterminism — and the "shareable" report carries dead weight — **FIX** · determinism
Reproduced: two `--full` runs on identical input produce byte-identical `fragment.json`, `report.md`, `overlap.md`, `optimize.md`; `graph.json` and `report.html` differ **only** in `meta.generatedAt` (`build-report.mjs:71`, persisted :84, embedded :107-124). The embed strips `meta.root` for shareability but keeps `generatedAt` plus per-file `meta.sources`/`meta.dirs` mtime stamps — which `report-template.html` never reads (only `brief-core.mjs:52` uses `generatedAt`).
**Fix:** strip `generatedAt`/`sources`/`dirs` from the embed alongside `root` (report.html becomes byte-deterministic for free); honor `SOURCE_DATE_EPOCH` for `graph.json` so CI runs reproduce exactly. The README's marquee "deterministic" claim becomes byte-true. **Medium / S.**

### B · Engine performance

#### #6 · Tree-sitter trees are never freed — ~6× peak RSS — **PERF** · engine
web-tree-sitter 0.26.9 has no FinalizationRegistry; every `parser.parse()` result needs `.delete()`, and none get it: `scripts/lib/ts-engine.mjs:156` (`cyclomaticExact`, one throwaway parse per function body) and the whole-file parse at :188 (dropped after three walks; the `extractDispatch` walkers share the pattern). Measured: 300 parses of a 48 KB source → 963 MB RSS; an 11 MB/200-file corpus peaks at **1,312 MB vs 217 MB** with two `tree.delete()` calls (regex engine: 161 MB). Output byte-identical; wall time −9 % from reduced GC pressure. This hits every default install — the optionalDependency makes the AST tier the normal path.
**Fix:** `try/finally { tree.delete() }` in `cyclomaticExact`; delete at the end of `extractJsTs` and the dispatch walkers. **High / S.**

#### #7 · The AST tier re-traverses and re-parses what one pass provides — 5–11× slower than regex — **PERF** · engine
Two compounding issues. (a) `extractJsTs` walks the full tree **three times** (methods :195, t3 fingerprints :228, dispatch :253) via `walkTree` (:59-66), whose `n.child(i)`/`n.childCount` calls each cross the JS↔WASM boundary — profile self-time on the self-map: `setValue` 232 ms + `childCount` 137 ms + `marshalNode` 120 ms + `child` 100 ms. (b) For every regex-owned function, `extract-symbols.mjs:696` calls `cyclomaticExact(body)`, which **re-parses the body slice from scratch** (ts-engine.mjs:156) though the file was just parsed whole. Measured, 11 MB corpus: stock 34.2 s vs regex 3.0 s; skipping `cyclomaticExact` saves 8.6 s (28 %); of the remainder, `walkTree` is 14.3 s (62 %) vs `parser.parse` 4.4 s (19 %). Self-map: 3.44 s vs 0.64 s.
**Fix:** fuse the three walks into one TreeCursor traversal (`walk()` + gotoFirstChild/NextSibling — no per-child marshalling), and record decision counts per function-like node keyed by start row during that same walk (the existing `t3ByLine` pattern), so complexity is a line lookup instead of a re-parse. Projected ≈3× on top of #6. **High / M.**

#### #8 · Python re-export resolution re-masks the module per call site — 70 % of Python extract — **PERF** · engine
`pyReExportResolve` (`extract-symbols.mjs:958-978`) runs `maskPy(rec.text)` (:967) plus a full-text scan on **every invocation**, and it's invoked per unresolved `pkg.member(...)` call site (`resolveFileMember` :986 ← `deriveFileEdges` :1202/:1211) and per imported name (`addPyFrom` :1033) — no memo of the masked text, the re-export table, or the result. Measured (261 files/1.1 MB, 60-name `__init__`, 200 consumers): 763 ms of a 1,085 ms extract (70 %). A validated 12-line memo (per-module table + `(module,name)→id` map) took it to 268 ms — 4× — with byte-identical fragments. Related: `maskPy` runs 4× per Python file regardless (:253, :633, :1079, :1240), `maskJs` 2× per JS file — half of that 481 ms (17 % of the regex-path profile) is redundant.
**Fix:** land the memo; then cache the masked line array in `fileSyms` so the four mask sites share one mask per file. **High / S.**

#### #9 · Blast radius is O(n²)-flavored twice over — `risk` takes minutes on mid-size graphs — **PERF** · graph ops
Found independently by two audits. `impactOf` (`scripts/lib/graph-ops.mjs:213-227`) dequeues with `queue.shift()` (O(frontier) per pop), allocates a merged upstream array per visited node, then materializes+sorts the full closure — and `risk.mjs:48-55` calls it **once per product node**, using only `.length` (the MCP `--limit 15` truncates *after* the full ranking, `risk.mjs:68`). Measured: a 240k-node radius takes 19.9 s vs 0.3 s with an index-pointer queue (67×); risk on 15k nodes/44k edges = **82.2 s** shipped, 28.8 s with pointer+count-only; an SCC-condensation + reverse-topo bitset closure computes all 20k blast counts in **0.75 s** — 26× — with byte-identical sums (15,127,001 all three ways). Scaling exponent of the shipped loop ≈ 2.05. The `shift()` pattern repeats in the pub-API BFS at `extract-symbols.mjs:913`; `impactOf` consumers include query-core, explain-core, context-pack, optimize, codemod, review.
**Fix:** pointer-queue BFS everywhere (S); a count-only `impactCountOf` for risk (S); SCC condensation + reverse-topo accumulation for all-nodes blast (M; bitset ≤~30k nodes, 64-seed word blocks beyond). **High / S→M.**

#### #10 · Warm extract re-reads and re-hashes every byte on 100 % cache hits — **PERF** · engine
`extract-symbols.mjs:597-618`: for every file, every run — `readFileSync`, `sha1(text)`, `DYNAMIC_RE.test`, `split`, per-line masking for extents; a cache hit skips only symbol discovery and AST products. Measured: warm 537–539 ms vs 635 ms cold on this repo — the cache recovers ~15 %. At 16k symbols the committed numbers show the same shape: one-file edit = 4,218 ms extract; a no-change re-map is 3,779 ms with all stages memo-skipped — i.e. ~3.7 s of pure re-verification (`bench/results/scale-typescript.json`). The per-file mtime+size stamps needed for a cheap pre-check already exist (`meta.sources`, :588-599), and the codebase already trusts mtime+size elsewhere (index-lite stamp, checkStaleness).
**Fix:** a stamp tier in the scan cache — stat sweep first; files whose mtime+size match reuse cached per-file products without being read; changed files fall back to today's hash path (byte-identity contract intact, and #4's stored hash gives a `--verify` escape hatch). Warm extract goes from O(repo bytes) to O(changed bytes + one stat sweep) — the floor under the hook (#18), MCP refresh, and re-maps. **High / M.**

#### #11 · `parseSignature` compiles a fresh RegExp per symbol — up to 27 % of regex-path extract — **PERF** · engine
`extract-symbols.mjs:492-509` builds `new RegExp(escapedName…)` at :496 once per function/method node (also per tree-sitter method at :724); names are mostly unique, so V8's regex cache never helps. Profile: 717 ms self = **27 % of a 2.9 s extract** on an 8,400-symbol corpus (150 ms on the self-map). Micro-bench: 8,400 unique-name construct+exec = 527.9 ms vs 0.7 ms for an `indexOf` prefilter.
**Fix:** `line.indexOf(name)` + preceding-char boundary check (`[^\w$]`), then the existing hand-rolled paren matcher from that position; a small token check covers the `=`/`function`-expression forms. No behavior change. **Medium / S.**

#### #12 · ctags engine spawns one child per file — **PERF** · engine
`ctagsSymbols` (`extract-symbols.mjs:409-418`) runs `execFileSync('ctags', …, file)` per file inside the main loop (:579) — and ctags re-reads from disk what `text` already holds. Measured with a no-op shim on 600 files: 2,041 ms vs 1,112 ms for the regex path doing strictly more work — ≥0.9 s of pure spawn overhead at the floor; real ctags option parsing multiplies it ~10×. On ctags-installed machines this is the silently-selected path.
**Fix:** one invocation for all files (`ctags --output-format=json -f - -L <filelist>`), bucketed by file from the stream. Cache semantics unchanged (engine-namespaced already). **Medium / S.**

### C · Advisor performance — and the bench gates that should guard it

#### #13 · No benchmark guards any post-graph stage, and the CI corpus can't trigger the machinery — **GUARD** · bench
The quadratic risk loop (#9) shipped invisible to every gate, and it isn't special: CI runs `bench/all.mjs --gate` (`.github/workflows/ci.yml:29-39`) whose only timing gate, `warmFactorVsRegexBaseline` (`bench/all.mjs:64,136`), measures the WARM rerun — which *skips overlap/optimize entirely* (:50-51); `coldMs` is recorded, never gated; `bench/budgets.json` holds only token/byte budgets. The offline harness times extract→cluster3→overlap and seven queries (`bench/experiments/performance.mjs:81-88,377-385`) — risk, hotspots, deadcode, optimize, campaign appear in **no timed harness**. Worse, what is timed runs at ~zero load: the synthetic generator emits 0–3 calls/fn with unique names (`performance.mjs:124`) — verified on a 10k-fn corpus: **0 twin candidates, 0 same-name groups, overlap = 21 ms**; the LSH path never runs in CI (`overlap.mjs:54` `LSH_MIN_NODES=800`; the self-graph has 237 candidates); Signal C needs AST-only `n.t3`. The report bench validates the collapsed view and single-domain expand only — expand-all (the #21 cliff) is one click past the green verdict (`bench/experiments/report-scale.mjs:134`).
**Fix:** (a) parse `run.mjs`'s per-stage `done in Xms` stderr in `bench/all.mjs` and gate each stage as a factor of the regex-extract baseline; (b) pin a synthetic corpus that triggers the machinery — 4–8 distinct callees/fn, planted same-name clusters, ≥800 twin candidates; (c) add risk/campaign/deadcode timings to the pipeline section and H14's scaling fit so a super-linear regression fails the slope criterion; (d) an expand-all row for Spec L. **High / M.**

#### #14 · campaign still clones the whole graph + full SCC per candidate — the pattern Spec O-1 already fixed in optimize — **PERF** · advisors
`scripts/lib/campaign.mjs:57-66`: every ready merge runs `applyEdit` (which `structuredClone`s the entire graph, `graph-ops.mjs:338`) plus a full file-SCC pass, cumulatively — 289 ms per candidate at 20k nodes (20 merges = 5.8 s; ~100 ≈ 29 s). `optimize.mjs:50-111` documents this exact cost ("28.8 s cold … 83 % of the downstream cost") and replaced it with `deltaNewCycles` — campaign never adopted it, though the batched-delete comment at `campaign.mjs:47-51` shows the cost was recognized here once. Campaign also spawns optimize/deadcode/break-cycles as children that each re-parse `graph.json` (:36-43).
**Fix:** hoist `deltaNewCycles` + its pair-witness table into `graph-ops.mjs` (one truth), maintain the running table across accepted steps — same verdicts, no clones. **Medium / M.**

#### #15 · Incremental dup-check: full Jaccard per changed×pool pair, no prefilter, no body cap — **PERF** · advisors
`scripts/lib/dup-check.mjs:40-47` runs `jaccard(cand, osh)` against every pool function per changed symbol, plus a `toFixed(6)` allocation per pair; unlike overlap (`BODY_LINE_CAP=400`, `overlap.mjs:79`), `getBody` (:23-27) shingles full bodies. Measured (748-fn pool, 50 changed): 278 ms → 110 ms with an exact size-ratio early-exit (`min/max < 0.6 ⇒ J < 0.6`) — **78 % of 37,350 pairs skipped, byte-identical output**.
**Fix:** the 2-line prefilter, the same body cap overlap uses, and `round6` moved after the `< HIGH` rejection. This is the edit/PR gate's dominant term on big PRs. **Medium / S.**

#### #16 · `find_similar` re-shingles the entire repo on every call — the advertised before-every-write check — **PERF** · advisors
`scripts/find-similar.mjs:62-70`: per invocation, shingle every non-test function body from disk, zero persisted state (line 76 then re-filters all nodes a second time just to compute `scanned`); no body cap here either. The MCP server *instructs agents to call it before writing each new function* (`mcp-server.mjs:49`). Measured: 0.48 s at 10k small fns — realistic bodies put a repeated multi-second tax inside the agent write loop. The deterministic MinHash module (`scripts/lib/minhash.mjs`) is never used on this path.
**Fix:** persist per-node signatures (or at minimum shingle-set sizes) at map time; prefilter by signature estimate + size ratio; shingle survivors only; reuse the matches pass for `scanned`. **Medium / M.**

### D · Interactive latency — hooks, MCP, report

#### #17 · Three scan-cache filenames for one workspace — first hook and first refresh are always cold — **FIX·PERF** · hooks/MCP
Found independently by two audits. `run.mjs:87` writes `.scan-cache.json`; `hooks/post-edit-diff.mjs:39` uses `scan-cache.json` (no dot); `refresh.mjs:42` (the MCP auto-refresh path — `mcp-server.mjs:114` passes no `--cache`) defaults to `extract-cache.json`. Same format, same target; verified on disk: two identical 492 KB caches after map + one hook run. Consequence: the first post-edit hook after **every** map runs a COLD extract — 28.7 s at 16k (`bench/results/scale-typescript.json` postOptimization.cold.extract) against the hook's 30 s timeout (`hooks/hooks.json:39`) — and the first MCP auto-refresh is cold too. The hook's `--no-ctags` vs run.mjs's ctags-allowed also flips the cache's engine namespace (`extract-symbols.mjs:574-577`) on ctags machines, thrashing even a shared cache.
**Fix:** one cache-filename constant exported from `lib/cli.mjs` (all three already import it), one aligned engine-flag set. Two one-line edits plus a flag. **High / S.**

#### #18 · The post-edit hook re-extracts the whole target on every edit — **PERF** · hooks (big bet, with #10/#17)
`hooks/post-edit-diff.mjs:36-41` spawns a full-target extract per edit: measured 744–815 ms on this repo vs ~52 ms for the sidecar-optimized pre-edit hook; the repo's own number is 4,200 ms at 16k symbols. After #17 (warm cache always available) and #10 (warm extract = stat sweep + changed file), the remaining gap to the ~52 ms class is baseline-fragment reuse — extract only the edited file and splice it against the baseline fragment — which `docs/decisions/fastpath-daemon.md` already names as the honest fix but no spec in `docs/specs/` covers.
**Fix:** write and ship the baseline-fragment-reuse spec. This is the single largest recurring latency in the product. **High / M** (after #10/#17).

#### #19 · MCP server: synchronous children head-of-line-block every request; auto-refresh stalls inline — **PERF** · MCP
`scripts/mcp-server.mjs:393` runs every non-fast-path tool through `spawnSync` (`SPAWN_TIMEOUT_MS = 120_000`, :43), and `autoRefresh` (:106-118) runs `spawnSync(refresh.mjs, timeout: 60_000)` inline before answering any of the 10 AUTOREFRESH_TOOLS (:104) when stale. Both block the readline loop, so all queued JSON-RPC requests stall. Measured with a stdio client: warm `codeweb_callers` = 2.5 ms; fired concurrently with `codeweb_campaign` = **527.6 ms** (exactly the campaign's duration); after touching one file = 807 ms (inline refresh) vs 3.7 ms fresh — 4–28 s at the 16k benchmark, 120 s worst-case behind a wedged child. `handleMap` (:264-301) was already converted to async `spawn` for exactly this reason; the other 18 tools were not.
**Fix:** generalize the `handleMap` pattern — async `spawn` + per-request completion (JSON-RPC tolerates out-of-order replies; `pendingAsync` bookkeeping exists); make autoRefresh fire-and-forget and serve the stale-annotated answer immediately (the code's own philosophy: "stale-but-annotated beats broken"). **High / M.**

#### #20 · The tools the server itself prescribes per edit all take the spawn+reparse path — **PERF** · MCP
The server keeps a parsed+indexed graph cache (:85-95) but serves only 8 tools from it (:332-383). Its INSTRUCTIONS (:46-53) tell agents: before editing call `codeweb_context`, after editing call `codeweb_refresh` then `codeweb_diff` — all three spawn a child that re-boots node (~45-50 ms floor) and re-parses the graph from disk (`codeweb_diff` parses TWO). Measured on a 12 MB/17k-node graph: `codeweb_explain` 255.9/267.3 ms back-to-back, `codeweb_deadcode` 293 ms, vs warm fast-path 12.7 ms. The in-process card assembler already exists and is shared (`lib/explain-core.mjs` powers the index-lite sidecar).
**Fix:** extend the in-process fast path (same lib, spawn fallback on surprise — the established pattern at :332-343) to at least explain and context; diff reuses the cache for the "after" side. **Medium / M.**

#### #21 · Report graph view is O(n²) per animation frame — expand-all freezes the tab for minutes at scale — **PERF** · report
`scripts/report-template.html:695-713` `gStep()` computes all-pairs repulsion per rAF frame (gTick :694) for a ~259-frame anneal, on top of drawing 44k canvas edge curves per frame (gDraw :734-748). Micro-benched (exact loop arithmetic): 35 ms/frame @1.2k nodes, 107 ms @5k, **1,278 ms @16.3k, 4.3 s @30k** — ≈5.5 minutes of sim CPU for one "Expand all symbols" click (:780) at the project's own 16k benchmark. The `prefers-reduced-motion` branch (:687-691) runs up to 260 steps in ONE synchronous task — a hard freeze, not jank. The scale bench deliberately validates only the collapsed view and single-domain expand, so this cliff sits one click past the green verdict.
**Fix:** uniform-grid / Barnes-Hut neighbor approximation (deterministic; canvas positions aren't gated artifacts), a wall-clock budget per frame, chunked reduced-motion settle; the bench row lands via #13. **High / M.**

#### #22 · The post-edit hook leaks a ~1.2 MB temp file on every fire; two test files leak too — **FIX** · hygiene
`hooks/post-edit-diff.mjs:35` writes `join(tmpdir(), 'codeweb-hook-${pid}.json')`, reads it back, never unlinks — every hook fire is a fresh pid, so files accumulate unboundedly on every real user's machine (three at 1,195,934 bytes each observed after one suite run). Same run left `codeweb-flush-*` dirs (`tests/stdout-flush.test.mjs:33,44,56` — zero cleanup calls) and a `cw-usage-*` dir (`tests/efficiency-pilot-usage.test.mjs:86`). All other test files use the `tmpDir()/cleanup()` helpers correctly; `git status` stays clean.
**Fix:** `try/finally { rmSync(tmpOut, {force:true}) }` in the hook (or write beside `scan-cache.json` in the workspace); `finally { cleanup(dir) }` in the three leaking tests; a suite-level tripwire asserting no `codeweb-*` entries remain in `os.tmpdir()`. **High / S.**

#### #23 · session-brief re-parses the full graph every session start; staleness is stat-swept twice per MCP request — **PERF** · hooks/MCP
`hooks/session-brief.mjs:33-35` does `JSON.parse` + `buildIndex` + `buildBrief` per SessionStart: 97–100 ms on this repo, 310–328 ms on a 17k-node graph — the one hook absent from `fastpath-daemon.md`'s cost table, while MCP's `codeweb_brief` serves the identical payload from cache in 8 ms. Separately `checkStaleness` (`cli.mjs:152-172`) stats every `meta.sources` entry and runs **twice** per fast-path request (`mcp-server.mjs:110` + :336/:359/:375) — 2×12-17 ms at 5k files against 3-13 ms answers.
**Fix:** pre-render `brief.json` beside `index-lite.json` at map time (same mtime+size stamp pattern, `build-report.mjs:89-93`); hook serves it at the ~52 ms boot floor with the parse path as fallback. Compute staleness once per request; memoize the verdict per (graph path, mtime) for ~1 s. **Low-Med / S.**

### E · Maintainability

#### #24 · Flag parsing is the one CLI concern still hand-rolled ×25, with drifting policies — **REFACTOR** · CLI
`lib/cli.mjs` centralizes output/exit/graph-loading well (27 scripts + 2 hooks import it) — but 25 scripts carry the identical `for (let i = 0; i < argv.length; i++)` flag loop, and the policies have drifted: `run.mjs:48` rejects unknown flags (the documented convention, fixed there because `--help` once became the target path), while `trend.mjs:39` and `build-report.mjs:30` still treat unknown flags as positional paths — the exact bug class the convention fixed. 11 scripts answer no `--help` (incl. extract-symbols, ci-gate, mcp-server). `build-report.mjs:38-45` re-implements `loadGraph`'s error handling with a near-verbatim copy of `cli.mjs:57`'s message. Dogfood: codeweb's own overlap ranks this its only HIGH self-finding.
**Fix:** declarative `parseArgs(spec)`/`renderHelp(spec)` in `lib/cli.mjs`, one unknown-flag policy, ~10-line specs per script; route build-report through `loadGraph`; split cli.mjs's pure helpers from its process plumbing (module-level EPIPE handler) so stage scripts can import constants without side effects. **High / M.**

#### #25 · extract-symbols.mjs is a 1,384-line script/module hybrid — six concerns, module-global state, untestable in-process — **REFACTOR** · engine
One file interleaves: masking (:82-197), file enumeration/package boundaries (:199-249), the per-language regex scan (:251-408), a ctags adapter (:409-419), bodyEnd/parseSignature (:420-517), tree-sitter loaders (:518-580), node building (:581-752), import/re-export/member resolution (:753-1094), and edge derivation (:1095-1259) — with argv parsed at :47 and `byName`/`files` as module globals closed over by `deriveFileEdges`. Every extractor test therefore shells out: ~20 test files re-implement the same spawn harness (dogfood ov7-ov9), the suite carries 253 `runNode(` spawn sites, and the worst single test (IE-EQUIVALENCE, #30) burns 48.9 s in ~360 sequential node boots. The SRC extension regex is a hand-mirrored duplicate (`:74` vs `cli.mjs:71`, comment admits the drift risk); the header's v2→v12 changelog stands in for structure.
**Fix:** extract `lib/masking.mjs`, `lib/lang-rules.mjs`, `lib/import-resolve.mjs` as pure modules; thin orchestrator; import SRC_RE from one place. Enables in-process testing (#30), makes #1 safely reviewable, and is the precondition for the daemon-free fast paths staying honest. **Med-High / L.**

#### #26 · ts-engine duplicates its per-language dispatch skeleton five times — **REFACTOR** · engine
`scripts/lib/ts-engine.mjs` defines `up()` five times (:328, :367, :422, :475, :546) in two drifted signatures, `typedParamsOf` four times (:377, :432, :500, :557) plus a renamed `paramTypesOf` (:644), and repeats the methodsByClass walk + dedupe/sort epilogue per language closure. Deadcode's @-suffixed orphan ids exist only because of these same-name copies. `spike/tree-sitter/` holds a third generation of some functions (`isDecision` 53 % body-similar, DRIFTED).
**Fix:** hoist `up`/`typedParamsOf` (parameterized by node-type names) and the epilogue; reduce each language to a declarative table of node types + field names. **Medium / M.**

#### #27 · Similarity thresholds duplicated across four files with "must match" comments — **REFACTOR** · advisors
The 0.6 high-confidence floor is independently hardcoded in `overlap.mjs:106-107` (with the 0.35/0.15 bands), `optimize.mjs:30` (`// must match overlap.mjs`), `find-similar.mjs:59`, `dup-check.mjs:12`; shingle size K=3 likewise (`lib/shingles.mjs:26` "must match overlap.mjs's K"). Each copy documents the coupling in prose instead of importing it. Same disease, different organ: the full-history `git log` churn parser is byte-near-identical in `risk.mjs:38-42` and `hotspots.mjs:35-39` — unbounded (no `--since`), uncached, re-spawned per invocation.
**Fix:** export `BANDS`/`K` from `lib/shingles.mjs`; extract one `churnFromGit(root)` into lib, bounded by a commit window and cached keyed by `rev-parse HEAD`. **Medium / S.**

#### #28 · spike/ and .live/ are tracked forks of production code that pollute the tree and the self-metrics — **CHORE** · repo
`spike/tree-sitter/` is a graduated prototype (GO-NO-GO.md present; the engine shipped as `lib/ts-engine.mjs`) still tracked with its own package.json and drifted copies of production functions; `.live/` tracks five dev scripts nothing references. Neither ships via npm, but the self-map counts both as product: 12 domains include `spike/tree-sitter (22 nodes)`, and 3 of 19 self-overlap findings exist only because of spike/ — while `codeweb.rules.json` role overrides cover only `docs/**`.
**Fix:** delete spike/ (history keeps it) or move under bench/experiments; relocate .live tools; add `spike/**`-class role overrides so self-analysis stops counting prototypes. **Medium / S.**

### F · Tests, CI, release

#### #29 · A tag push publishes to npm and the Marketplace without running one test, via an unpinned toolchain — **FIX** · release
`.github/workflows/release.yml` has a single `publish` job (:27-139) with no test/bench/consistency step and no `needs:` on ci.yml; nothing verifies the tagged commit is on main or green. The only validation is tag==package.json version (:48-55). It then runs `npm publish --provenance` (:128) and `npx --yes @vscode/vsce@latest` (:117, :139) — the publisher's version is whatever npm serves that day, in a pipeline that otherwise touts provenance.
**Fix:** a `test` job (setup-node 22, `npm ci`, `npm test`, `check-consistency`) with `publish: needs: test`; pin vsce exactly. **High / S.**

#### #30 · One 49 s property test is the suite's hard floor — 67 % of wall time, sequentially spawned — **CI·PERF** · tests
Measured full run: 73.26 s wall (2 m 28.9 s user), 552 tests — 509 pass / 0 fail / 43 skip. `IE-EQUIVALENCE` (`tests/incremental-edges.test.mjs:98`) alone is 48.88 s: 40 trials × up to 6 steps × 2 extracts ≈ ~360 sequential child `node` spawns in one test (isolated rerun 44.5 s — stable, not flaky). Suite-wide there are 253 `runNode(` spawn sites — deliberate characterization architecture, but a single test that parallelism can't touch owns two-thirds of the wall.
**Fix:** split the 40 trials into concurrent subtests or per-trial tests; gate trial count on an env var (10 local / 40 CI). The real unlock is #25 — an importable extractor turns ~360 boots into in-process calls. **Medium / S→M.**

#### #31 · CI is single-OS single-Node; Node 20 can't even run `npm test`; the AST tier can silently un-test itself — **CI** · coverage
`.github/workflows/ci.yml:10-15`: all jobs ubuntu-latest, node 22, no matrix — while `engines` claims `>=20` and ci.yml:21's own comment admits the test glob needs Node 22, so on Node 20 `npm test` is broken and untested. No Windows/macOS — yet `tests/golden-ecc-scripts.test.mjs:20` defaults to a `D:/GitHub Projects/...` path, proving the primary dev environment is one CI never covers (and those 3 golden tests are permanently dead everywhere else). Of the 43 skips, 39 gate on tree-sitter/grammar presence with no `process.env.CI` guard and no skip-count check — if the optionalDependency ever fails to install (which `npm ci` tolerates), CI stays green with the whole AST tier untested. All setup-node uses omit `cache: 'npm'`.
**Fix:** matrix `os × node [20, 22, 24]` for the test job (or bump engines to `>=22` honestly) with a Node-20-safe glob; assert web-tree-sitter importable in CI or fail when `# skipped` exceeds the known 4; point `CODEWEB_GOLDEN_TARGET` at a small checked-in corpus (bench/corpus exists) so the golden invariants run somewhere; add npm cache. **Medium / M.**

#### #32 · The consistency gate skips package.json — the npm listing is stale right now — **FIX** · release
`release-utils.mjs:49-58` `PROSE_FILES` covers README/site/commands/SKILL — not `package.json` or `.claude-plugin/plugin.json`. Live drift today: package.json says "24 MCP tools" while the derived count is 27 (`tests/release-tooling.test.mjs:21`; plugin.json says 27). Only plugin.json's `version` is checked (:133). The ci consistency job passes green over it — the exact failure mode this gate exists to prevent, on the most public comms surface.
**Fix:** JSON-aware prose scan of both descriptions; fix 24→27 now; regression case in release-tooling.test.mjs. **Medium / S.**

### Smaller notes (tracked, not counted)

- **Literal NUL bytes** in `break-cycles.mjs:41,45,48` and `diff.mjs:44` make both files invisible to grep/ripgrep ("binary file") — hit during this review. Replace with `'\x00'` escapes (`graph-ops.mjs:13` already shows the safe idiom); optionally a lint test asserting no tracked `.mjs` contains bytes < 0x09.
- **fragment.json is pretty-printed** for machine-only consumers (`extract-symbols.mjs:1383`): 13.0 MB vs 7.4 MB compact on the fat corpus — write compact like every other stage; the stage memo self-invalidates cleanly.
- **MinHash re-hashes repeated items per node** (`minhash.mjs:56-67`): 1,358 ms of the 1,523 ms twin stage at 20k candidates. Memoize a per-distinct-item `Uint32Array(K)` row; determinism unchanged (same for Signal C's items, `overlap.mjs:361-367`).
- **cluster3.mjs:37 / overlap.mjs:27** parse workspace JSON unguarded — raw stack instead of `loadGraph`'s actionable one-liner (`cli.mjs:59-60`); corrupt inputs genuinely occur (#3).
- **No self-coverage measurement** anywhere; seven lib modules are reached only through spawned-CLI tests (invisible to node coverage without `NODE_V8_COVERAGE` plumbed through `runNode`), and `screenshot.mjs`/`bench-ts-engine.mjs` are executed by no test. A ratchet-only coverage job would make the blind spots visible.

---

## 5. Sequence — if only 3 ship first

1. **#1 The masker tells the truth.** Everything codeweb sells — edges, extents, deadcode, duplication, the gate — inherits from masking. Today it fabricates edges on the most ordinary JS idiom there is and mis-audits codeweb itself. Ship the regex-literal state machine with the repro fixtures, then delete the `fromCharCode` folklore.
2. **#17 + #10 The incremental floor.** One shared cache constant (a day, kills the 28.7 s cold hook against its own 30 s timeout), then the stamp tier so warm extract is O(changed bytes). This alone moves the 4.2 s post-edit hook most of the way to the sidecar class and de-stalls MCP auto-refresh — the two latencies every agent user feels most.
3. **#29 + #3 The safety nets.** Releases that run tests before publishing, and graph writes that can't half-exist. Both are day-scale, and both convert "it has never bitten us" into "it cannot bite us."

One deliberate omission from the top three: #6 (`tree.delete()`) — not because it can wait, but because it shouldn't wait for sequencing: it's two lines, verified byte-identical, and should land with whatever ships first.
