# Changelog

All notable changes to **codeweb** are recorded here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Beyond the usual change groups, releases also carry **Research** and **Capabilities**
notes so validated results, papers, and new tools never get lost in commit history.

## [Unreleased]

### Fixed
- **The JS masker now lexes regex literals.** `maskJs` tracked strings/templates/comments but not
  regex literals, so a quote inside the ubiquitous escaping-helper pattern (`replace(/…/g)` with a
  quote in the regex) desynced its string state — bodies ran to EOF, absorbing neighbors and
  fabricating call edges from the absorbed code — and a backtick inside a regex flipped template
  state (an odd count blanked the rest of the file: codeweb's own `lib/complexity.mjs` extracted
  as 5 nodes / 0 edges, and 13 of 25 deadcode "safe" items on the self-map were false positives).
  Regex literals are now recognized with the standard prev-significant-token heuristic (escape-
  and char-class-aware; division and JSX close tags unaffected) and their interiors blanked like
  strings — including inside `${}` interpolations, where a `{2}` quantifier corrupted brace
  matching. The `String.fromCharCode` authoring convention that worked around the blind spot is
  deleted (ts-engine.mjs string regexes, Ruby mask regexes) and now serves as a live self-test;
  `tests/maskjs-regex-literals.test.mjs` pins the two reproduced corruptions plus a self-map
  regression on complexity.mjs. (perf-quality finding 1)
- **`codemod --write` can no longer corrupt source while reporting success.** Three reproduced
  failure modes closed: (a) an unresolvable/ambiguous `--into` is a hard exit 2 instead of being
  used verbatim (pre-fix, `canonLabel` became `undefined`, BOTH definitions were deleted, and loser
  tokens — including a string literal — were rewritten to the literal text `undefined`, with exit 0
  and `applied: true`); (b) token rewrites are now gated on the column-preserving mask — comment
  mentions are left as stale prose and counted, and a label inside a string/regex literal refuses
  the whole write (a name in a value can be load-bearing); (c) imports that named a loser are
  repointed at the canonical's file (pre-fix `import { canon } from './loser.mjs'` survived —
  valid-looking, broken at runtime, invisible to the structural gate), importers-without-calls are
  now part of the rewrite set, and the post-write gate additionally asserts the canonical itself
  survived re-extraction. The maskers moved to `scripts/lib/masking.mjs` (importable — the start of
  finding 25's decomposition) with a `keepValues` mode for the live/value/comment classification.
  (perf-quality finding 2)
- **Workspace artifacts are crash-safe, and the stage memo validates before reusing.** Every
  graph/fragment/sidecar/report writer now goes through `atomicWrite` (same-dir temp + rename —
  readers see old bytes or new bytes, never a truncated half-write; the reproduced kill window was
  the MCP server SIGTERM-ing its refresh child at 60s mid-`writeFileSync`), and `run.mjs`'s stage
  memo refuses to reuse outputs whose graph.json no longer parses (pre-fix, a corrupt workspace
  got "stages reused (fragment unchanged)" forever — the natural recovery path preserved the
  corruption). `tests/atomic-writes.test.mjs` pins both. (perf-quality finding 3)
- **Freshness stamps can no longer be false-fresh.** The extractor stats each file BEFORE reading
  and re-stats after (re-reading on mismatch; a file that won't hold still gets a never-fresh
  stamp) — pre-fix a file modified between read and stat carried a fresh stamp over stale bytes,
  permanently. Stamps now carry the content sha1 (`meta.sources: {s,m,h}`), and `checkStaleness`
  gained a verify tier — `CODEWEB_VERIFY_FRESHNESS=1` (or `{verify:true}`) sha1-compares content
  where stats match, catching the reproduced mtime-preserving bypass (`rsync -a`, `tar -x`,
  `git-restore-mtime`, `SOURCE_DATE_EPOCH` builds) across every consumer: MCP auto-refresh, query
  stale-annotations, hooks. Stat-only stays the default fast path. (perf-quality finding 4)
- **Byte-determinism, delivered.** `generatedAt` was the sole byte-difference between two
  identical runs; the report embed also carried per-file/dir mtime stamps its template never
  reads. report.html now strips `generatedAt`/`sources`/`dirs` alongside `root` (byte-identical
  across runs and across fresh checkouts, no pinning needed), and graph.json honors
  `SOURCE_DATE_EPOCH` so CI can byte-compare complete workspaces. graph.json keeps all three
  fields (brief reads generatedAt; staleness reads the stamps). (perf-quality finding 5)

### Performance
- **The post-edit hook stops re-verifying an unchanged baseline (hook-baseline sidecar).** On
  every edit the hook JSON.parsed the multi-MB baseline graph and recomputed its file cycles and
  caller index — map-time artifacts that cannot have changed since map time. `run.mjs` (after
  the stage run; on the reuse path only when missing/stale) and `refresh.mjs` (from the JSON
  string it just wrote — free) now persist `hook-baseline.json` beside graph.json: version,
  graph stamp (size + mtime) + byte sha1, cycle keys, and caller counts, via the new
  `baselineSummary`/`regressionsAgainstSummary` split in graph-ops (`structuralRegressions` is
  their composition — one truth, existing callers untouched). The hook consumes it when the
  stamp — or, on stamp mismatch, the hash (identical-bytes rewrites re-validate; the bytes read
  are shared with the fallback parse, one read) — matches, and falls back to today's path
  otherwise. Fail-open at every seam, pinned by five BDD scenarios including the
  poisoned-sidecar proof (a baseline cycle key removed from the sidecar is reported as new —
  only the sidecar could say that) and both-corrupt silent-exit-0. Both write points are
  best-effort try/catch. Measured min-of-3 at the 16.8k corpus: no-change hook fire 1,167 →
  889 ms (the < 1.5 s floor holds with margin); the in-process-extraction residual is #18b,
  deferred to WS-H and pointed to from hook-fastpath-floor.md's revisit triggers. (round 2,
  finding #18a)
- **Adding one function no longer re-derives the whole repo (name-delta invalidation).** A
  symbol-set change used to fail the edge/binding caches for EVERY file — the canonical agent
  edit (add a function) cost a full re-read + re-mask + re-derive (2.1× the no-change floor
  measured at the 16.8k-symbol corpus). The caches now compute the NAME DELTA — labels whose
  sorted definition-id lists differ between the cached and live symbol tables — and re-derive
  only files that could see it: a file's cached edges replay iff its content hash is unchanged,
  its candidate-name set (every identifier reaching the edge resolver, recorded pre-resolution)
  is disjoint from the delta, and its import BINDING replayed (the hardening conjunct: aliased
  imports and namespace member calls ride the bind rule — original imported names plus a
  content-hash check over every file the bind consulted, re-export walks and dead ends
  included). Wholesale transitions stay wholesale: package-boundary changes, file add/delete,
  re-export-landscape moves (rexSig, with a Python (module, name)-membership belt for edge-time
  chains), rules changes, migration, `--full`/verify mode — and the kill-switch
  `CODEWEB_NAME_DELTA=0` restores the old wholesale mechanism outright (identical bytes, only
  wall-time moves). Proven by the extended IE-EQUIVALENCE property harness at full CI depth (40
  trials, both env legs) with warm-vs-cold fragment BYTE equality at every mutation step, plus
  new incrementality assertions: add-one-function re-edges only the edited file + its
  bind-coupled importer while a crafted disjoint file replays; a def rename of an imported name
  re-edges the importer. Measured min-of-3 @16.8k: add-one-function 1,326 → 710 ms — 1.27× the
  same-session noop floor (bar ≤ ~1.3×, was 2.12×); body-edit unchanged (771 → 759 ms); delete
  1,279 → 703 ms; rename 1,329 → 708 ms; the colliding-name add (a name every file calls) stays
  honestly near-wholesale at 1,127 ms. @29.4k: add-one-function 2,294 → 1,277 ms (1.22× noop,
  was 2.14×). Hook add-one-function end-to-end 1,909 → 1,027 ms. (round 2, finding #17)
- **The warm no-change floor sheds its four avoidable terms.** (a) The scan cache no longer
  stores `syms` (symbols sat in it three times over) and interns per-file edges as an id table +
  `[from,to,kind]` triples instead of verbose objects — the edge term shrank 57 %, the whole
  cache 32–38 % depending on engine tier (measured 18.9 → 12.8 MB at the 16.8k-symbol bench
  corpus; the spec's ≥ 40 % estimate assumed `syms` was a full third of the symbol bytes — the
  measured decomposition shows 6 %, with `nodes` dominating). A content-hash hit now replays the
  FULL cached product set (nodes/ranges/dyn/ast/typed intents, entry carried forward with a
  refreshed stamp) instead of rebuilding nodes from cached syms, gated on rulesSig like the stamp
  tier. Cache format change ⇒ SCANNER_VERSION 15 → 16 (the WS-B/C/D ladder); any older cache is
  discarded for one cold rebuild — pinned by a planted-poison migration test proving byte-equal
  output to no-cache. (b) `--out` fragments are written compact (22.7 → 14.2 MB at 16.8k; every
  reader JSON.parses) and an unchanged fragment is never rewritten — size + sha1 equality skips
  the write and the banner says `(unchanged)`. (c) `run.mjs`'s stage memo now records
  `{size, sha1}` per output and validates all five before reuse (size first, so truncation never
  hashes) — replacing the old graph.json-only full-parse belt (330 ms at 13.9 MB) with a 36 ms
  read-back that also catches parseable byte-tampering and guards the four outputs that had no
  belt at all (new S5/S6 scenarios); `SOURCE_DATE_EPOCH` joins the memo key so a changed epoch is
  never served stale bytes. Warm no-change pipeline at the 16.8k corpus: 825 → 677 ms min-of-3.
  IE-EQUIVALENCE now additionally asserts warm-vs-cold fragment BYTE equality at every mutation
  step — the shared oracle the name-delta work (#17) reuses. (round 2, finding #19)
- **Per-file edge derivation is no longer quadratic in symbols-per-file.** `enclosing()` linearly
  scanned ALL of a file's ranges on every call-site match (profiled: `addEdge` 50.8 % self on an
  8,000-function file — the monorepo hub-file shape), and the method-owner attribution re-scanned
  ranges-so-far per method. Both are now index lookups: an innermost-range-per-line array built in
  one O(lines + R log R) stack sweep (lookup O(1)), and a live open-class stack across the
  line-sorted build loop (amortized O(1) per method). Behavior-identical by construction and by
  proof: a 300-trial property suite embeds the old linear scans verbatim as oracles — duplicate
  starts, overlaps, degenerate ranges included — and the 8k-fn fixture extract is byte-identical
  before/after in both engine tiers. Measured min-of-3 against the workstream-entry tree: the
  8k-fn single-file extract 1,514 → 734 ms (2.06×) on the regex tier (3,210 → 2,393 ms with the
  AST tier, which is parse-dominated); the 800-file corpus is unchanged-to-faster (1,257 →
  1,162 ms). (round 2, finding #21)
- **`maskJs` lexes ~3–5× faster, byte-identically.** The masker ran a compiled-regex `.test()`
  per character (word-class tracking) plus a one-char string append per character — ~27–30 MB/s
  on real mixes, on the hottest path in the engine (every cold/changed file, and the whole repo
  after any symbol-set change until the name-delta work lands). Two changes, zero byte diffs:
  the word-class test is a charCode range check, and each lexer state now span-copies whole runs
  of plain text up to its next special character (special sets re-derived from the post-WS-B
  state machine and documented in place), folding the run into the significant-char state with
  one backward walk that reproduces the old per-char accumulation exactly. Measured min-of-3:
  26.8 → 135.8 MB/s (5.1×) on the 800-file bench corpus, 30.2 → 95.0 MB/s (3.2×) on this repo's
  own 229 mask-eligible files. Byte-identity is pinned by a committed oracle test that embeds
  the pre-change masker verbatim and compares outputs over every mask-eligible repo file, a
  loaded bench-corpus tree, and adversarial fixtures, in all mode combinations — which is also
  why this ships with NO scanner-version bump. (round 2, finding #20)
- **Tree-sitter parse trees are freed.** web-tree-sitter has no FinalizationRegistry, and none of
  the engine's 8 parse sites called `tree.delete()` — every cold/changed-file extract on a default
  install leaked WASM pages for the process lifetime (measured: 1,312MB vs 217MB peak RSS on an
  11MB corpus; large-file repos risked OOM). All sites now free in `try/finally`; output is
  byte-identical and ~9% faster from reduced GC pressure. A static tripwire test pins parse-site
  count == delete-site count so a new parse can't quietly reintroduce the leak. (perf-quality
  finding 6)
- **The JS/TS AST tier extracts in ONE cursor traversal.** `extractJsTs` walked the full tree
  three times (methods, Type-3 fingerprints, dispatch) via per-child JS↔WASM crossings — profiled
  at 62% of AST extract self-time — and `cyclomaticExact` re-parsed every regex-owned body slice
  from scratch for exact complexity (28%). One TreeCursor pass now collects everything: ancestor
  stacks replace upward parent-walks, dispatch candidates resolve after the walk against the
  complete method tables, and decisions are tallied per start row so a symbol's exact complexity
  is `1 + sum(extent rows)` — the identical decision set the slice re-parse counted, with zero
  re-parses. Verified output-identical on a full corpus (393 nodes, 983 edges, every node field
  equal); ~1.5x wall on a small corpus where WASM init dominates, larger on big ones. `atomicWrite`
  also learned to write through non-regular files instead of renaming over them. (perf-quality
  finding 7)
- **Python re-export resolution is a table lookup, and every file is masked once.**
  `pyReExportResolve` re-masked the whole module and re-scanned its from-imports on EVERY
  invocation — once per unresolved `pkg.member(...)` call site and per imported name, measured at
  70% of a Python-corpus extract — and `maskPy`/`maskJs` ran up to 4x/2x per file across the
  symbol/extent/import/edge scans. Each module's re-export table and each `(module, name)`
  resolution are now memoized (first-valid-binding-wins preserves the old scan order; nulls cache
  only from depth-0 calls so a depth-truncated null can't mask a resolvable chain), and a shared
  per-file mask cache serves all five scan sites. Byte-identical fragments on a 261-file
  re-export corpus (1,460 edges, zero field diffs). (perf-quality finding 8)
- **Blast radius de-quadratic'd — `risk` is 31x faster at 20k nodes.** `impactOf` dequeued with
  `shift()` (O(frontier) per pop) and materialized+sorted closures its biggest caller threw away;
  `risk` then ran it once per node — measured 19.8s at 20k nodes/60k edges, scaling ~quadratically.
  Now: index-pointer BFS in `impactOf` (and the extractor's pub-API walk), a count-only
  `impactCountOf`, and `allBlastCounts` — Tarjan-condense the dependents graph, then propagate 64
  source-components per pass with word masks (O(V·E/64) time, O(V) memory, dangling edge sources
  participate exactly as in the BFS). risk: 19,784ms → 630ms with byte-identical payloads
  (blast sums equal); a property test pins all three implementations to each other on random
  graphs. (perf-quality finding 9)
- **The STAMP TIER: a no-change warm extract reads zero files.** Even on 100% cache hits, warm
  extraction re-read, re-hashed, re-split and re-masked every byte (the cache recovered ~15%; at
  16k symbols a no-change re-map spent ~3.7s on pure re-verification — the floor under the
  post-edit hook and MCP auto-refresh). The scan cache now stores every per-file product — nodes
  with extents/signatures/complexity, ranges, dynamic flag, raw re-export table, import bindings —
  and an mtime+size stamp: a matching stamp reuses all of it with ONE stat and NO read (measured:
  760ms cold → ~125ms warm on a 63-file corpus, banner `scanned 0/63 … ast: idle`). Correctness
  gates: role-override changes invalidate the tier (rulesSig); re-export tables gate on the file
  list (fileSig); bindings gate on symbol set + file list (bindSig) and lazily re-read exactly the
  files a landscape change invalidates. The tier trusts the same stamps `checkStaleness` trusts;
  `CODEWEB_VERIFY_FRESHNESS=1` or `--full` forces the read+hash path. Verified byte-identical
  against the no-cache oracle and the 40-trial incremental-equivalence property suite.
  (perf-quality finding 10)
- **`parseSignature` compiles zero regexes.** It built a fresh `RegExp` from the (mostly unique)
  symbol name for every function/method node — 717ms self / 27% of a 2.9s regex-path extract in
  profile; V8's regex cache never helps unique sources (micro: 8,400 unique-name constructions =
  527ms vs 1.6ms for the scan floor). Replaced with an `indexOf` scan performing the identical
  match — same left boundary, same optional `= [async] [function[*] [id]]` group semantics
  (async still requires trailing whitespace, exactly as `async\s+` did), first completing
  occurrence wins. Zero fragment diffs on the A/B corpus. (perf-quality finding 11)
- **ctags runs once per cold extract, not once per file.** The ctags engine spawned one
  `execFileSync` per file inside the main loop (≥0.9s of pure spawn floor per 600 files measured
  with a no-op shim; ~10x with real ctags option parsing — minutes of process churn at repo
  scale). Cold runs now tag the whole list through ONE process (`-L -`, list on stdin, bucketed by
  the JSON `path` field); warm runs keep the per-file spawn (misses are few, and one small spawn
  beats re-tagging the repo); an untouched warm run spawns nothing (stamp tier). Same graceful
  ladder on failure: batch → per-file → regex scanner. Shim-verified: exactly one batch on cold,
  zero on no-change warm, exactly one per-file on a one-file edit. (perf-quality finding 12)
- **The bench gate now guards every stage and every advisor, under real load.** The only timing
  gate used to measure the stage-REUSE path (which skips overlap/optimize entirely) — a 10x
  regression in any post-graph stage passed CI, which is exactly how the quadratic risk loop
  shipped. Now: (a) per-stage wall times parse from `run.mjs`'s own stderr and each gates as a
  factor of the regex-extract baseline (budgets note observed values so headroom stays honest);
  (b) a pinned deterministic loaded corpus (`bench/lib/loaded-corpus.mjs`: every function a twin
  candidate, 15 planted same-name clusters, ~1,260 candidates so LSH engages on its own — the old
  synthetic corpus produced 0 candidates and timed an idle engine) with gates that the planted
  clusters are FOUND and the LSH banner fired; (c) risk/deadcode/hotspots/campaign each timed and
  factor-gated, and a crashed advisor is itself a violation (observed: risk 0.18x — the
  pre-finding-9 loop would have measured ~20x and failed on arrival). The report expand-all bench
  row (d) lands with the finding-21 layout rewrite it measures. (perf-quality finding 13)
- **campaign's merge chain stopped cloning the graph per candidate.** The cumulative pre-flight
  ran `applyEdit` (a whole-graph `structuredClone`) plus full file-SCC for every ready merge —
  289ms/candidate at 20k nodes, the exact pattern optimize's Spec O-1 had already replaced. The
  pair-witness delta simulator now lives in graph-ops (`createMergeSimulator`, one truth) with
  chaining commits (`commit`/`commitDelete`) so deletes and accepted merges advance the same
  table; optimize rides it too (its `CODEWEB_OPT_SIM=clone` escape and equivalence tests intact).
  Measured: 100 candidates at 20k nodes/60k edges = 20,757ms → 729ms (28.5x) with identical
  accept decisions; a 120-case property oracle replays the historical clone chain verbatim and
  requires step-for-step plan equality. (perf-quality finding 14)
- **The edit/PR duplication gate prefilters by set size and caps bodies like overlap does.**
  `incrementalOverlap` ran full Jaccard intersections for every changed×pool pair (the dominant
  gate term on big PRs) and shingled thousand-line bodies in full while overlap confirmed the
  same pair on its first 400 lines. Now: an exact size-ratio early-exit (`J ≤ min/max` — measured
  78% of 37,350 self-map pairs skipped, with 5e-7 slack so knife-edge pairs that round to the bar
  survive) plus overlap's `BODY_LINE_CAP`. A 40-case property test pins prefiltered results to a
  filterless oracle. (perf-quality finding 15)
- **`find_similar` stops re-shingling the repo on every call.** The MCP server prescribes it
  before every new function an agent writes, and each call re-read and re-shingled every non-test
  body from disk. The report stage now persists each candidate's exact K=3 shingle SET (sorted,
  deterministic — sets, not sketches, so there is no probabilistic cut) in a stamped
  `similar-index.json` beside the graph; find-similar serves from it with zero source reads plus
  an exact size-ratio precut, and reuses the scoring pass for `scanned`. Stale/absent sidecar or
  `--structural` falls back to the live path; a regression test pins byte-identical matches
  across sidecar, live, stale-fallback, and removed-sidecar paths. (perf-quality finding 16)
- **One scan cache per workspace — the first hook fire after a map is no longer cold.** run.mjs,
  the post-edit hook, and refresh each used a DIFFERENT cache filename for the same workspace
  (`.scan-cache.json` / `scan-cache.json` / `extract-cache.json`), so the first post-edit hook
  after every map ran a cold full re-scan (28.7s at 16k symbols against the hook's 30s timeout)
  and the first MCP auto-refresh was cold too. All three now share `SCAN_CACHE_NAME` from
  lib/cli.mjs — and the hook dropped its lone `--no-ctags`, which on ctags machines both thrashed
  the engine-namespaced cache AND diffed a regex fragment against a ctags baseline (phantom
  regressions). With finding 10, a no-change hook/refresh now scans zero files. (perf-quality
  finding 17)
- **The post-edit hook's fast-path floor, specified and landed** (`docs/specs/hook-fastpath-floor.md`
  — the "baseline-fragment reuse" spec `fastpath-daemon.md` called for, in its landed form: the
  reuse rides the stamp tier's per-file products, serving every extract consumer). The hook's
  fragment now streams back on stdout — the pid-named temp file (~1.2MB, never unlinked, leaked
  per edit forever) is gone entirely, along with a full serialize+write+read cycle — and the
  extractor skips its multi-MB cache write-back when no entry changed (`cacheDirty`). Measured at
  8,804 nodes/52k edges: hook end-to-end ~800ms warm (was ~4s-class; full re-extract alone was
  3,350ms), decomposed in the spec with revisit triggers pointing at finding 25's in-process
  extraction. (perf-quality finding 18)
- **The MCP server no longer head-of-line-blocks, and stale graphs heal in the background.**
  Every non-fast-path tool ran through `spawnSync` on the readline loop — a 2.5ms structural
  query measured at 527.6ms behind a concurrent campaign, and a stale graph stalled the current
  call behind an inline synchronous refresh (up to 4–28s at the 16k benchmark; 120s behind a
  wedged child). Children now spawn async (the `handleMap` pattern generalized), serialized per
  workspace so stateful sequences keep their order while fast paths and other workspaces never
  wait; auto-refresh is fire-and-forget, serving the stale-but-ANNOTATED answer immediately —
  and because the server drains in-flight work before exit, the next call is fresh. Measured:
  callers behind a concurrent campaign 527.6ms → 2.4ms. (perf-quality finding 19)
- **The tools the server prescribes per edit answer in-process.** `codeweb_explain` and
  `codeweb_context` — the INSTRUCTIONS' before-every-edit calls — took the spawn path (node boot
  + a fresh multi-MB graph parse per call, ~256ms measured back-to-back) while structural queries
  answered from the cache in ~3–13ms. context-pack's payload assembly moved to
  `lib/context-core.mjs` (one truth, two transports — byte-identical JSON, field order included);
  explain rides `buildCards` as the sidecar already did; and context-pack's `--json` miss now
  emits the same `found:false` + suggestions contract explain adopted in #2 (the old stderr
  `die()` made MCP reply an empty string). Measured, even while a campaign runs: explain 9.3ms,
  context 12.3ms. (perf-quality finding 20)
- **The report's graph sim is grid-based, frame-budgeted, and freeze-free.** `gStep` computed
  all-pairs repulsion per animation frame — 1,174ms/frame measured at 16.3k nodes (×~259 anneal
  frames ≈ 5 minutes of sim CPU for one "Expand all" click), and the `prefers-reduced-motion`
  branch ran the whole anneal in ONE synchronous task (a hard freeze, not jank). Now: a uniform
  spatial grid (only 3×3-neighborhood pairs interact — deterministic, 11.5x on the dense
  micro-bench and far more on real spread-out layouts), a wall-clock frame budget (8ms of sim per
  frame — small graphs settle in a blink, huge ones stay responsive), and the reduced-motion
  settle chunked into ≤12ms slices with a single final draw. Spec L's harness gained the
  expand-all row (finding 13(d)): `simMsPerFrame` recorded and judged in the verdict, so the
  cliff that sat one click past the old green can never regress unmeasured. (perf-quality
  finding 21)
- **Temp hygiene: nothing leaks into the OS tmpdir.** The post-edit hook's per-edit ~1.2MB leak
  died with finding 18 (no temp file exists at all); the two test files that leaked
  (`stdout-flush`'s three `codeweb-flush-*` dirs, `efficiency-pilot-usage`'s `cw-usage-*` dir)
  now clean up in `finally`; and a tripwire in `post-edit-diff.test.mjs` runs the hook end-to-end
  and asserts no `codeweb-hook-*.json` appears — the leak signature can't return silently.
  (perf-quality finding 22)
- **SessionStart serves a pre-rendered brief; MCP sweeps staleness once per burst.** The
  session-brief hook re-parsed and re-indexed the whole graph every session start (97–100ms on
  this repo, 310–328ms at 17k nodes) for a payload that is a pure function of the graph — the
  report stage now pre-renders `brief.json` (Spec P stamp pattern) and the hook serves it at the
  boot floor, byte-identical output pinned across sidecar/parse/stale-fallback paths. The MCP
  server also stat-swept every `meta.sources` entry TWICE per fast-path request (auto-refresh
  check + payload annotation — 2×12–17ms at 5k files against 3–13ms answers); one memoized
  verdict per (graph identity, 1s TTL) now serves both, threaded through context-core so the CLI
  path is untouched. (perf-quality finding 23)

### Added
- **Specs K–P, landed on main after v0.9.0** (previously missing from this section — the release
  script would have refused to roll an "empty" release over real work):
  - **K — the scale bench is runnable** (`bench/experiments/scale.mjs` portable + pre-flighted);
    it found the next wall, which N then removed.
  - **L — report.html measured at 16k symbols** (`bench/results/report-scale.json`): cold load,
    interaction, and heap all green at TypeScript-compiler scale — no fix needed, receipt kept.
  - **M — the efficiency pilot re-ran budgeted on v0.9.0** (5 engine-frozen reps,
    `bench/experiments/efficiency-pilot.reps5-v090.json`): recall **+0.31 ± 0.04** at equal token
    cost — the earlier ">90% fewer tokens" prediction was wrong and is recorded as such; the win
    moved from cost to completeness. One per-task loss (flask) opened Spec Q.
  - **N — LSH/MinHash banding in overlap** (`CODEWEB_LSH`, auto at scale): the quadratic
    same-name/twin passes band first, making the scale caps true backstops; identical findings on
    small inputs, byte-stable.
  - **O — incremental stages, O-1** (extract rides the scan cache inside `run.mjs`; downstream
    stages memoize on the fragment hash). O-2 (incremental cluster/overlap) measured under the
    pre-registered rule and **deliberately not built** — the override is recorded in the spec.
  - **P — resident daemon: NO-GO** (`docs/decisions/fastpath-daemon.md`): the per-edit surface is
    already at the ~52ms node-boot floor via the **pre-edit sidecar** (`index-lite.json`), and a
    resident graph risks stale-serving; revisit triggers documented.
- **A symbol miss is never a dead end.** Every `found:false` answer (query/dependents/impact
  over CLI and MCP, `explain`, `context-pack`) now carries a hint pointing at `codeweb_find`
  concept search plus up to 3 deterministic near-match ids (case-fix, prefix, substring,
  shared-name-token tiers) — the most frequent agent mistake now teaches the recovery path
  instead of sending the agent back to grep. (IMPROVEMENTS.md #2)

### Added
- **Every ranked surface now honors the role model — and deadcode knows what a host invokes.**
  The vite-playground precision lesson (rankings drowned by non-product code) was applied to
  overlap only; hotspots, risk, deadcode, and campaign still ranked test helpers, bench scaffolding,
  and the generated site bundle first on codeweb's own map. All four now default to **product
  scope** with a counted exclusion line (`--all` / MCP `all:true` restores the everything view).
  `deadcode` additionally learns **manifest-declared entrypoints** — files named by any
  `package.json` `main`/`bin`/`exports`, `hooks/hooks.json`, or `.claude-plugin/plugin.json` are
  review-tier, never "safe to delete" (the safe tier used to list the VS Code extension's
  `activate`/`deactivate`) — and demotes **closure-scoped** functions (defined inside a reachable
  parent's span) to review. Dogfood receipts on the self-map: hotspots' top-10 went from five test
  helpers + the generated site bundle to all product code; campaign's plan dropped from 55 steps
  (-730 claimed LOC, mostly false orphans) to 26 grounded ones. (IMPROVEMENTS.md #6)
- **The report now shows the pipeline's own findings — and every view is a link.** The
  interactive report loaded `graph.overlaps` and never rendered it: the Findings tab showed only
  a client-side name-match heuristic, so the body-confirmed, tiered findings in
  `overlap.md`/`optimize.md` never reached the report's audience. A new **Consolidation
  findings** section now leads the tab (confidence badges, evidence, recommendation, clickable
  symbols; body-refuted candidates counted). The URL hash grew from node-only `#s=` to the whole
  view — `#tab=…&roles=…&s=…` — restored on load (legacy links keep working), with a
  **copy link** button in the header; hosted reports carry `og:title`/`og:description` built
  from the target label and counts only (the meta.root privacy invariant holds, re-pinned by
  test). (IMPROVEMENTS.md #8)
- **The report meets people where they are: light mode, print, full keyboard reach.** A light
  theme follows the OS preference (`prefers-color-scheme`) with an explicit auto → light → dark
  toggle (persisted; the canvas graph re-reads its label/halo colors from the theme tokens); a
  print stylesheet makes the report paper-able; every hover affordance gained a
  `:focus-visible` twin; matrix cells and treemap blocks are keyboard-reachable
  (tabindex + Enter/Space + `aria-label`); the tablist has real `tabpanel`/`aria-controls`
  wiring and roving arrow keys. Also: the undefined `--hi` token (the "duplicated" tag silently
  lost its color) now uses `--stCritical`; the treemap caches its render like sibling tabs; the
  mobile search-count no longer collides with the input; the editor-root picker is an inline
  form instead of a blocking `prompt()`; and the whole-panel `aria-live` (which re-read the
  entire inspector on every click) became a scoped one-line announcer. (IMPROVEMENTS.md #9)
- **The value receipt is felt, not buried.** The session brief's activity line used to render
  only the current calendar month's bucket and vanish when it was empty — every new user and
  every 1st-of-the-month saw silence. It now leads with **lifetime totals** ("codeweb here since
  2026-06: …", current month in parentheses), the brief warns when the map is a week old
  ("built N day(s) ago — refresh with codeweb_refresh"), a successful `run.mjs` map ends with
  the receipt line, and CLI queries (`query`/`explain`/`context-pack`) now count toward
  `queriesServed` — the denominator stops undercounting non-MCP use. (IMPROVEMENTS.md #10)
- **The agent loop closes over MCP — 27 tools — and codeweb_map reports progress.** Three
  capabilities that existed only as CLIs join the MCP surface: **`codeweb_simulate`** (the
  regression gate's verdict for a hypothetical delete/merge/move — pre-flight a refactor for the
  cost of one call), **`codeweb_annotate`** (false-positive suppression memory, written beside
  the graph, never to source), and **`codeweb_stats`** (the local value receipt). `codeweb_map`
  is now async and, when the client sends a `progressToken`, emits `notifications/progress` per
  pipeline stage — a big first map is no longer a silent black box (in-flight work drains before
  the server exits). The MCP/CLI **parity receipt is re-measured at the full surface**
  (`bench/results/auxiliary.json`): 26/26 parity pairs + JSON-RPC conformance at 27 listed tools,
  11/11 auxiliary checks green — the old receipt covered the 20-tool era and its harness had the
  count hardcoded (now derived). The handshake instructions teach the new loop steps.
  (IMPROVEMENTS.md #11)
- **Coverage→symbol mapping — "is this symbol actually tested?" is now a measured fact.**
  (ROADMAP Phase 4's named-missing mechanism.) `scripts/coverage.mjs` (`npm run coverage`)
  ingests a coverage report — lcov text (Node's own
  `--test --experimental-test-coverage --test-reporter=lcov` output works directly) or a
  c8/istanbul JSON — and stamps every instrumented symbol with `covered`/`hits` (declaration-line
  hits don't count as body execution; unknown ≠ uncovered; ambiguous path suffixes dropped).
  `explain`, `query --tests`, and `context-pack` answers then carry the facts — loudest one:
  `⚠ NOT covered by the recorded test run` on the edit window of an unguarded symbol.
  Optional + explicit like `--churn` (absent input leaves graphs byte-identical);
  `run.mjs --coverage <report>` annotates right after mapping; `codeweb_refresh` drops stale
  annotations and says how to restore them. Pinned end-to-end by `tests/coverage.test.mjs`,
  including a real Node-runner dogfood. (IMPROVEMENTS.md #13)
- **Ruby and PHP join the dispatch tier; Kotlin/Swift's blocker is recorded, not papered over.**
  Two new vendored grammars (same pinned trusted source, `@vscode/tree-sitter-wasm@0.3.1`; Ruby
  ABI 14, PHP ABI 15) power Spec-F-pattern walkers: Ruby wires `self.`/implicit-receiver calls
  inside a class (the parser has already disambiguated a call from a bare identifier, so wiring
  to a sibling method is precision-safe); PHP wires `$this->m()` plus `Type $p` typed-receiver
  intents under the one-owner rule. The regex tier's bare-name resolution simultaneously got
  STRICTER for both languages — a bare name can never reach another file's owner-qualified
  method on a name coincidence anymore (that attribution now belongs to the dispatch tier, which
  has receiver evidence). Kotlin/Swift stay regex-only with the blocker recorded in
  `PROVENANCE.md`: no trusted wasm exists at our pinned ABI (upstream ships C sources and native
  prebuilds only) — revisit when `@vscode/tree-sitter-wasm` grows them. (IMPROVEMENTS.md #14)
- **The gate is a reviewer for adopters, not just a red ✗.** codeweb's own PRs already got the
  sticky structural-review comment (delta, renames, findings); the reusable composite action
  third parties consume ran the gate silently. The action now takes `comment: true` and posts
  (and updates in place) the same digest via the calling workflow's `GITHUB_TOKEN` — the comment
  lands **before** the verdict can fail the job, fork PRs with read-only tokens degrade
  gracefully to the check verdict, and `docs/ci-gate.md` documents the
  `pull-requests: write` requirement. Reviewers who never installed codeweb now see the blast
  radius of every gated PR where they already look. (IMPROVEMENTS.md #15)
- **The CLI grew a front door.** Every CLI answers `--help`/`-h` (exit 0) — including the
  `codeweb` bin, where `--help` previously errored with `target not found: --help`; `run.mjs`
  documents all its flags, rejects unknown ones with usage (exit 2), and ends a successful map
  with `open <ws>/report.html in your browser`. Graph resolution now walks up to the nearest
  `.codeweb/graph.json` above the cwd when no path/`CODEWEB_WS` is given (the same discovery the
  hooks and MCP server already used) and announces which graph it picked — so bare
  `npm run stats`, `query.mjs --callers X`, and `context-pack.mjs <symbol>` work from anywhere
  inside a mapped repo. Exit codes on the first-touch scripts (`run`, `extract-symbols`,
  `build-report`) now follow the documented 0/1/2 convention. (IMPROVEMENTS.md #5)

### Fixed
- **Spec Q closed: the flask Python import-edge regression was real, and it's fixed.** The
  spec's bisect contract was executed first: the reps8-era engine (`c892f50`) resolved 14
  `render_template` dependents, v0.9.0 resolved 7 — the package-boundary precision rule had also
  killed calls backed by an explicit `from flask import render_template`. Three Python
  resolution gaps fixed (each pinned by `tests/python-src-layout.test.mjs`): single-segment
  absolute imports now resolve the repo's OWN top-level package (rooted, src-layout aware —
  `import json` still can't grab a nested in-repo package); `__init__.py` re-exports are
  followed (bounded chain) on both the from-import and the `pkg.member()` paths; an explicit
  import binds bare calls across package boundaries (the import is evidence — unimported bare
  names still respect the boundary); module-level import sites attribute to `<module>` (site
  granularity). Flask pre-flight: **7 → 48 dependents, 26/26 truth sites** under id
  normalization. `SCANNER_VERSION` 11→12 (cached edges invalidate); the research-page caveat now
  records the closure. (IMPROVEMENTS.md #12)
- **The VS Code lens is truthful again — and covers all 11 languages.** The extension README
  promised "the lens re-reads the graph on change," but no watcher or change-event existed:
  lenses showed stale numbers until a file was reopened. A `FileSystemWatcher` on
  `**/.codeweb/graph.json` now fires `onDidChangeCodeLenses` (debounced), a manual
  `codeweb: Refresh CodeLens from the graph` command exists, and the language selector grew from
  9 to the engine's 11 (Ruby/PHP/Kotlin/Swift files finally get lenses). Extension v0.2.0.
  (IMPROVEMENTS.md #7)
- **The public prose can no longer understate the product — and what it said is fixed.** The
  homepage, product page, start page, and og-descriptions said "20 tools" (24 ship); the /codeweb
  command steered agents off the fast path for 8 of the 11 native languages; the engine-detection
  reference said five; README's axios headline carried pre-regeneration numbers (334/11 vs the
  real 274/8); the site still promised the deleted sharding layer; the tree-sitter backlog doc
  claimed "nothing wired" about a tier that shipped two releases ago. All fixed at the source —
  site prose now derives counts (`{{toolCount}}`/`{{langCount}}`), and `check-consistency` gained
  **prose scans** (digit and word forms) plus a claim-ledger "N / N tools" check, so this class of
  rot now fails the build. Site prose counts are template-derived (toolCount/langCount
  placeholders filled at build time). The 2026-07-18 product review is archived to
  `docs/product-review-2026-07-18.md` with a historical header. (IMPROVEMENTS.md #3)
- **`npm test` is green again on a fresh zero-dependency clone.** The Spec-N LSH suite's N6 case
  asserts a Type-3 (AST-tier-only) finding but was missing the `tree-sitter unavailable` skip
  guard every other AST test carries — so the suite failed 1 test exactly on the "just Node"
  install path the README celebrates (CI never saw it because CI installs the optional
  dependency). Verified both ways: runs with the engine, skips without. (IMPROVEMENTS.md #4)
- **An empty scan no longer masquerades as a successful map.** Pointing codeweb at an empty
  directory, an unsupported-language tree, or a typo'd path used to print a green `[run] done`
  and write a blank report. The extractor now stops with an actionable message — the path it
  scanned, the supported extensions, and "is this the right directory?" — and `run.mjs` aborts
  before writing artifacts. `--allow-empty` (both CLIs) keeps intentionally-sparse targets
  workable. (IMPROVEMENTS.md #1)

### Removed
- **spike/ and .live/ are out of the tree — the self-map stops counting prototypes.**
  `spike/tree-sitter/` was a graduated prototype (the engine shipped as `lib/ts-engine.mjs` in
  PR #17) still tracked with its own package.json and drifted copies of production functions;
  `.live/` tracked five dev scripts nothing referenced, every one superseded by shipped code
  (confirm.mjs → overlap's body confirmation, rust-dissect.mjs → the native Rust tier,
  cli-sketch/ → finding 24's `parseArgs`, measure.mjs → cluster3). Both deleted — git history
  keeps them; prose references now say so. `.live/` is fully gitignored (it stays run.mjs's
  default workspace target, generated artifacts only), and `codeweb.rules.json` gains standing
  `spike/** → example` and `.live/** → generated` role overrides so a future prototype tree can
  never pollute the self-metrics again. Self-map effect: 13 → 12 domains (spike/tree-sitter
  gone), 33 → 28 self-overlap findings (all five spike-only findings gone), 1,240 → 1,215 nodes.
  (perf-quality finding 28)

### Changed
- **THE similarity thresholds live once — and churn is bounded and cached.** The 0.6
  high-confidence floor (with the 0.35/0.15 bands) was independently hardcoded in four files and
  the K=3 shingle size in five, each copy documenting the coupling in a "must match overlap.mjs"
  comment instead of importing it. `lib/shingles.mjs` now exports `BANDS`/`K`; overlap's
  confidence tiers, optimize's READY floor, find-similar's tiers + low-band cutoff, dup-check's
  HIGH gate, similar-index's SIMILAR_K, and skeleton's default all import them (values unchanged
  — pipeline outputs byte-identical). Same disease, different organ: the full-history `git log`
  churn parser was byte-near-identical in risk.mjs and hotspots.mjs, unbounded (whole history
  per advisory run) and uncached (campaign ran it twice back-to-back). `lib/churn.mjs` now owns
  it: windowed to the last 5,000 commits (deterministic per HEAD, unlike a `--since` that drifts
  with the clock) and cached beside the graph keyed by `rev-parse HEAD` + window — on this repo,
  hotspots `--git` after risk `--git` serves from the cache in ~97ms with zero git spawns.
  `tests/churn.test.mjs` pins counts, the poison-proved cache hit, HEAD invalidation, the window
  bound, and the not-a-repo `{}` degradation. (perf-quality finding 27)
- **One dispatch skeleton, seven language tables.** `ts-engine.mjs` repeated its per-language
  dispatch walker seven times (Java/C# via a shape closure; Ruby/PHP/Python/Go/Rust as five
  hand-copied closures), with `up()` defined five times in two drifted signatures,
  `typedParamsOf` four times plus a renamed `paramTypesOf`, and the owner-index + dedupe + sort
  epilogue cloned per language — the same-name copies were also why deadcode showed @-suffixed
  orphan ids for this file. Now `makeDispatchWalker(parser, table)` owns THE skeleton (ancestor
  climb `upTo`, `typedParamsFrom`, seen-key dedupe, sorted `{thisCalls, typedIntents}` return,
  try/finally `tree.delete()`), and each language declares only its genuine tree shape:
  `collectOwners` / `callSite` / `enclosingOf` / `isSelf` / `identName` / `typedParams` —
  ~25 declarative lines per language, 762→735 total with seven walkers collapsed to one.
  Verified byte-identical on a purpose-built 7-language dispatch corpus (this-calls AND typed
  intents wired in every language, incl. Go receiver-variable "self", Rust `&`-ref stripping,
  PHP nullable-type params) plus pycorp and corpus7; language/AST suites and the full 582-test
  run green. (perf-quality finding 26)
- **The extractor is decomposed — and testable in-process.** `extract-symbols.mjs` was a
  1,500-line script/module hybrid: per-language scan rules, body extents, signatures, import/
  re-export/member resolution, and the caches all interleaved, with `byName`/`files` as module
  globals — so every extractor test shelled out (253 `runNode(` spawn sites across the suite).
  Two pure modules now hold the substance: `lib/lang-rules.mjs` (the 11-language regex symbol
  scan, `bodyEnd` brace/dedent extents, `parseSignature`, KEYWORDS/DYNAMIC_RE/langOf — functions
  of their arguments, no IO) and `lib/import-resolve.mjs` (`createImportResolver(ctx)` — relative
  and Python module resolution, JS/TS re-export chains incl. `export *`, Python from-import
  re-export tables, unique-member lookup, and per-file import binding, all over injected context
  with no module-global state). The orchestrator keeps enumeration, caching (stamp/hash/bind/rex
  replay), engines, and edge derivation — 968 lines, down from 1,506 — and the extractor's own
  `SRC` extension list is now the shared `SRC_RE` from `lib/common.mjs` (the hand-mirrored copy
  the file itself warned could drift). Bodies moved verbatim; proof: fragments byte-identical
  old-vs-new on four corpora × both engine tiers × cold/warm/replayed-cache paths, including an
  old-engine scan cache replayed by the new engine, plus a same-tree self-map A/B. The first
  in-process extractor tests land with it (`tests/lang-rules.test.mjs`: 10 cases, 137ms, zero
  spawns — the seam #30's spawn-collapse needs). (perf-quality finding 25)
- **One flag loop.** 25 scripts carried the identical hand-rolled `for (…argv…)` parse with three
  drifting policies — `run.mjs` rejected unknown flags (the documented #5 convention) while
  `trend`/`build-report`/`extract-symbols` still swallowed them as positional paths (the exact bug
  class #5 fixed: `--help` becoming the target path), and several CLIs answered no `--help` at all
  (ci-gate, screenshot, extract-symbols). `lib/cli.mjs` now owns THE loop — declarative
  `parseArgs(argv, spec)` with one policy: unknown flag → exit 2 with usage, `--help`/`-h` → usage
  and exit 0, typed values (`bool`/`string`/`number`/`float`/`pair`) with missing/non-numeric
  values rejected by name. All 25 scripts migrated to ~10-line specs (hand-written usage strings
  kept — they're part of tested contracts); `build-report` also drops its near-verbatim copy of
  the graph-load error handling and rides `loadGraph` like every other tool. The pure helpers
  (`SRC_RE`, `SCAN_CACHE_NAME`, `sign`, `capList`) moved to side-effect-free `lib/common.mjs`
  (re-exported from cli.mjs) so stage scripts can import constants without cli.mjs's module-level
  EPIPE handler. Dogfood: this was codeweb's only HIGH-confidence self-finding, now zero
  hand-rolled loops remain (`grep` proof: the one flag loop left is parseArgs itself).
  (perf-quality finding 24)

### Fixed
- **Releases are gated.** Tag-push and workflow-dispatch publishing both flow through a `test` job
  first — `publish` now `needs:` the full suite plus the consistency check, so a failing suite
  blocks the release instead of shipping past it. Dispatched refs must be ancestors of `origin/main`
  (checked before the tag is created; a stray branch can no longer become a tagged release), and
  `@vscode/vsce` is exact-pinned to 3.9.2 at both call sites instead of executing whatever npm
  serves as `@latest` that day. `tests/workflows.test.mjs` pins the gates as text invariants —
  the round-1 regression class was gates silently dropped from these files.
  (perf-quality round 2, finding #2)

### Changed
- **CI got breadth, and the AST tier can no longer silently un-test itself.** The test job runs an
  os x node matrix (ubuntu/windows x Node 22/24, npm cache on every setup-node block); after
  `npm ci` a probe (`node -e "await import('web-tree-sitter')"`) fails the job when the
  optionalDependency install hiccuped, and the skip count is bounded (ceiling 8 = a named runner
  census of 7 environment skips — 3 golden-target, 1 TS_MODULE bench, 1 inverse fallback, 2
  playwright report-scale — + 1 headroom; windows runs its own ceiling 11, its leg adding exactly
  the 3 named ctags-shim platform skips; the tier-wide failure mode adds ~38 skips and trips
  either ceiling hard; both node 22's TAP and node 24's spec-style summaries are parsed). A new
  `test-no-ast` job installs with
  `--omit=optional` and proves the regex fallback green stand-alone, asserting the
  fallback-equivalence test ran UN-skipped (it inverse-skips wherever the engine is installed —
  i.e. always in the matrix job). `codeweb-gate.yml` now runs `npm ci`, so the structural self-gate
  analyzes PRs with the same engine tier the product ships instead of regex-blind. `engines` says
  `>=22` honestly — Node 20's `npm test` glob is broken and the matrix never tested it. The
  matrix's first real windows catch: `bench/all.mjs` dynamic-imported a bare absolute path — an
  unsupported ESM scheme on windows (`D:\...`) that crashed the whole bench; it imports via
  `file://` URL now. (perf-quality round 2, finding #3)
- **The suite's 60-second floor is gone.** IE-EQUIVALENCE ran its 40 property trials sequentially
  in one `test()` (59.8 s solo — nothing else exceeded 13.3 s); the trials now run as concurrent
  subtests (cap 4) over the new async spawn helper `runNodeAsync`, with the depth env-gated as
  `CODEWEB_IE_TRIALS` (40 in CI — unchanged depth — / 10 local; a typo'd value throws instead of
  passing vacuously). Per-trial seeds make trials independent and concurrency-safe: fixture bytes
  differ from the serial version, the semantics class (random 2–6-step mutation sequences, warm ≡
  cold assert per step) does not. 40 trials: 58.0 s → 15.3 s; full suite ~93 s → ~55 s class.
  (perf-quality round 2, finding #6)
- **Correction to the round-1 claim.** Commit `bfc6b92` ("implementation (all 32 findings)") did
  NOT land findings 29–32 — the release gate, the test split, the CI matrix/skip guards, and the
  consistency-gate coverage; this changelog documented findings 1–28 only. They ship in this round
  as findings #2/#6/#3/#4. The four dropped items were precisely the gates that would have caught
  the drop, so the honest closer is structural, not narrative: per-finding changelog entries land
  WITH each finding (an empty [Unreleased] can no longer be rolled over shipped work), and the
  package.json prose scan (finding #4) plus its regression tests make the surface where the drop
  was publicly visible fail the build by itself. (perf-quality round 2, finding #1)

### Fixed
- **The consistency gate scans package.json — and the npm listing stops lying.** The description
  said "24 MCP tools" while 27 shipped, and `check-consistency` printed OK over it because
  package.json was in neither the prose scans nor the sync targets. The gate now scans the
  description (description-only — keywords/scripts can't false-positive), version-sync repairs the
  count at every roll, the live drift is corrected to 27, and the drifted-fixture round-trip in
  `tests/release-tooling.test.mjs` pins the class. Mid-change, the scan alone turned the real-repo
  consistency tests red on the live drift — the gate catching, in-repo, exactly what it was built
  for. (perf-quality round 2, finding #4)
- **`npm test` no longer rewrites tracked docs/ — and the published site can't go stale again.**
  `site/build.mjs` gained `--out <dir>` (the shared parseArgs loop; unknown flags die), the whole
  site-build suite builds into a temp dir, CI asserts docs/ is byte-fresh after the build
  (`git diff --exit-code -- docs` plus an untracked-outputs check), and the stale committed
  `docs/changelog.html` — the published Pages changelog was missing the round-1 "Removed" section
  at HEAD — is rebuilt and committed. Argv-less callers (release.mjs, `npm run build:site`, CI)
  keep the docs/ default. (perf-quality round 2, finding #5)
- **The docs drift trio.** (a) `--engine` now validates its value — unknown engines (including a
  typo'd `CODEWEB_ENGINE`, which feeds the same default) exit 2 with the valid set instead of
  silently ENABLING the AST tier, and README's nonexistent `--engine read` mode is gone (`ts`
  stays a valid tree-sitter alias). (b) The release-tag skill's runbook numbers match reality
  (~590 tests, up to ~5 environment skips — it said "~400, tree-sitter-absence"). (c)
  `scripts/release.mjs` exits 1 when its own consistency audit fails, BEFORE printing the gated
  git commands — release prep can no longer end in "consistency: N problem(s)" followed by the
  exact commands to ship anyway. (perf-quality round 2, finding #7)
- **One huge single-line string can no longer kill the entire extract.** The string regexes in
  `complexity.mjs`'s strip, `maskRuby`'s RB_DQ/RB_SQ, and ts-engine's `stmtHash` used the
  alternation form V8 recurses per character — a >=8.4 MB inlined string (base64 asset, dataset)
  threw an uncaught RangeError from `cyclomatic` in BOTH tiers, taking the whole map, post-edit
  hook, and MCP refresh with it. All three sites now use the unrolled-loop form, preserving each
  site's escape atom (`\\.` vs `\\[^]` — they differ on backslash-newline in templates; a seeded
  5,000-case per-site equivalence property pins each), and `cyclomatic`/`nestingDepth` are belted:
  any internal throw degrades that node to 1/0 instead of killing the run — combined with
  ts-engine's existing null-on-throw per-file fallback, no single file can kill an extract in
  either tier. `SCANNER_VERSION` 13 -> 14 so warm caches can't replay pre-fix products.
  (perf-quality round 2, finding #15)
- **The JS masker learned nested templates.** `maskJs`'s two scalars (inTemplate, exprDepth) could
  not represent a template inside `${}` on ordinary modern JS: nested-template TEXT stayed live
  (`` `Usage: ${xs.map((n) => `fabricateMe(${n})`)}` `` fabricated a call edge), a `}` inside that
  nested text closed the interpolation and INVERTED template state (edges lost, extents run to
  EOF), an escaped `` \` `` did the same (no `\` handling in text), and `${}`-interior strings were
  kept verbatim even in blank-values mode (string content fabricated edges — deadcode's safe tier
  corrupted again, one idiom over from round 1's regex-literal fix). Template state is now a stack
  of frames (nested backticks push; text `\` consumes escapes; expr strings route through the
  keepValues gate, so codemod's two-view diff classifies a name inside `${'…'}` as inside-a-value),
  every delimiter backtick blanks in default mode, and default-mode `maskJs` is now IDEMPOTENT over
  the corpus — pinned with per-line length preservation by the new shared property suite
  (`tests/masking-properties.test.mjs`, corpus-scoped with the value-then-division counterexample
  documented). Five repro fixtures run under both engine tiers in
  `tests/maskjs-nested-templates.test.mjs`. (perf-quality round 2, finding #8)
- **Spread calls edge; IIFE-initialized consts are values, not functions.** The two mis-lexings
  that made BOTH of the self-map's deadcode "safe to delete" verdicts false: (a) `...metrics(` was
  routed into the member-call branch by the `.` before the match, where the backward identifier
  match can never succeed on dots — the call edge was silently DROPPED and `trend.mjs:metrics`
  showed 0 callers; a `..`-preceded match now falls through to `addEdge` (`a?.b(` and `...obj.fn(`
  verified unchanged). (b) The const-arrow rule matched `const PERM_SEEDS = (() => {…})()` — an
  IIFE-initialized VALUE became a `function` node invisible to callRe/refRe, a guaranteed deadcode
  false positive; `=(?!\s*\(\()` now rejects it (the accepted loss — a genuinely function-valued,
  non-invoked `const g = ((a) => a)` — is pinned in the test so re-widening is a conscious flip).
  Dogfood re-run: `trend.mjs:metrics` has 2 call edges in, `PERM_SEEDS` is no node, and the
  self-map deadcode safe tier is EMPTY (was: exactly these two false positives — campaign would
  have emitted DELETEs that break trend and minhash at runtime). The self-map regression is now a
  test (`tests/spread-iife-selfmap.test.mjs` extracts the real trend.mjs + minhash.mjs texts).
  (perf-quality round 2, finding #9)
- **Accessors both exist, declaration lines fabricate nothing, and the regex tier sees modern TS
  methods.** Three related truths: (a) the AST tier's method dedupe silently DROPPED the second
  body with a colliding id — always a real get/set pair or static/instance same-name (TS overload
  signatures are never framed); the second now suffixes `@` + its 1-based start line — the scheme
  the regex tier's file-level disambiguator already used, so both tiers emit byte-identical ids
  (getter keeps the bare id: no query/fingerprint churn) — and the cross-tier defensive dedupe
  suffixes instead of dropping. (b) The self-definition guard covered only a node's own start
  line, so setter/impl declaration lines were scanned as calls with the CLASS as scope —
  fabricated `Widget -> Widget.value` phantom callers hid every accessor/overloaded member from
  deadcode; a per-file declStarts map now skips any same-named declaration line, and body-less
  overload stubs (which have no range) are covered by a class-enclosed stub-line guard over both
  callRe and refRe (class-gated — narrowed from the audit's unconditional line guard, which would
  have suppressed 112 ordinary `finish(code);`-shaped statement lines in this repo alone).
  (c) The regex method matcher stacks modifiers, admits default params (`[^;]*` interior — not
  `[^;{}]*`, which would regress destructured params) and `: Type` return annotations —
  `get value(): number {`, `compute(n: any): number {`, `render(x = 1) {` were all invisible, their
  bodies' calls re-attributed to the class. Self-map after: zero class->own-member edges.
  `tests/accessor-overload-truth.test.mjs` runs the fixture in BOTH tiers and asserts identical id
  sets. (perf-quality round 2, finding #12)
- **Ruby heredocs and PHP `#` comments stop fabricating symbols and edges.** Ruby's symbol scan ran
  on RAW text and `maskRuby` had no heredoc state, so a `<<~SQL` body containing `helper(1)` and
  `def phantom_method` produced a phantom node and a fabricated module->helper call edge.
  `maskRuby` is now a stateful line loop with a FIFO queue of pending heredoc tags: body and
  terminator lines mask to empty lines (nothing inside a body can queue, scan, or edge), the
  opener TOKEN masks to the literal `''` so `sql = <<~SQL.strip` stays live code, `a << b` shift
  and `<<=` never match, stacked `f(<<~A, <<~B)` queues in order, and `~`/`-` tags terminate by
  trimmed equality while plain tags need column 0 — and the Ruby scan now consumes `masked('rb')`
  (the edge scan already did). PHP routes through `maskJs`, which now takes `{hashComment:true}`
  (.php only — JS private fields unaffected): `# legacy note: helper(1)` no longer fabricates a
  module->helper call. Accepted limits documented in the mask header: heredoc-interior `#{…}`
  interpolation blanks with the body (the pre-existing Ruby interpolation gap), and quoted-tag
  `<<~"TAG"` openers are eaten by the string replaces first (backtick-quoted tags still open).
  (perf-quality round 2, finding #13)
- **Python f-strings keep their `{…}` code.** `maskPy` treated f-strings as plain strings, so
  `return f"total={compute(x)}"` dropped the `report -> compute` edge — functions invoked only
  from f-strings (logging/formatting, idiomatic Python) showed 0 callers, poisoning caller counts
  and blast radii; the maskPy limit list didn't even mention it. A quote preceded by a 1-3 char
  `[rRbBuUfF]` run containing `f`/`F` (covers `f`, `rf`, `fr`, `Rf`, …) is now an f-string: `{…}`
  interpolation code is kept verbatim in both modes (the exact analogue of the JS `${}` rule) with
  a brace-depth counter for nested `{}` (dicts, `f"{x:{w}}"` format specs), `{{`/`}}` blank as
  text, triple-quoted f-strings carry expr state across lines, and a quoted run INSIDE the expr
  blanks through the keepValues gate as one slice — NOT verbatim, which would fabricate edges from
  string content (`f"{'compute(1)'}"`, the #8 n4 analogue — pinned by the decoy2 fixture) and
  break the shared idempotence property. keepValues output stays byte-identical to before
  (differentially verified). Limits documented in the header (nested same-quote f-strings are
  best-effort). (perf-quality round 2, finding #14)
- **NodeNext `.js` specifiers reach their `.ts/.tsx` sources.** Under
  `moduleResolution: node16/nodenext` TypeScript REQUIRES relative imports spelled with the
  emitted extension (`./x.js` for `./x.ts`) — the resolver's candidate list never mapped those
  back, so alias, namespace (`import * as u` → empty nsmap), and re-export edges silently
  vanished in modern TS repos, with the unique-bare-name rescue masking the hole just often
  enough to look random. One exported candidate builder (`importCandidates` + `EXT_REMAP`:
  `.js→.ts/.tsx`, `.mjs→.mts`, `.cjs→.cts`, `.jsx→.tsx`, plus the missing
  `/index.tsx|jsx|cjs|mts|cts` candidates) now serves both `resolveImport` and the
  pub-entrypoint walk — the walk's stale duplicate list (already missing `.tsx/.jsx//index.mjs`,
  so a `main: "./src/index.js"` backed by `src/index.ts` never marked anything `pub`) is gone.
  Direct extensions stay before remaps: the literal on-disk file wins (Node runtime semantics —
  a deliberate, documented divergence from tsc's substitute-first probe order), so every remap is
  a pure recall addition and existing corpora extract byte-identically (A/B-verified against the
  pre-fix resolver). `.mts/.cts` join `SRC_RE` and the JS/TS dispatch points — the remap table
  only means something if those sources are enumerated. Six fixture packages in
  `tests/import-nodenext.test.mjs` (disambiguation, namespace member, re-export chain + barrel
  dependent, `.mjs→.mts` + `/index.tsx`, pub-walk mirror, both-exist precedence pin).
  (perf-quality round 2, finding #11)
- **Bare-ref magnets are gone — parameters stop fabricating cross-role edges.** Measured on the
  self-map: 234 of 1,180 ref edges targeted 8 single-letter test/bench symbols and 209 ref edges
  ran product → non-product, all fabricated from PARAMETERS — refRe scanned declaration lines
  (`function metrics(g) {` emitted a ref from metrics to a test file's global `g`) and body uses
  of params hit the role-blind unique-global fallback. The codebase renamed its own parameters to
  dodge this (`sourceReader`'s `relPath`, import-resolve's `relPathOf/recTextOf/maskTextOf` —
  comments admitting it). Four mechanisms now close the class: (1) refRe skips declaration lines
  (with paren-balance continuation for multi-line signatures; callRe/inherit/instanceof scans
  untouched); (2) a bare name token-bound by the signature of ANY enclosing range never reaches
  the fallback — shadowing semantics, per binding (a call through a param invokes the param's
  value, never the global; `sig.raw` over-collection only ever suppresses fallback edges);
  (3) the unique-global fallback rejects 1–2-char names, counted and surfaced in the banner as
  `(N short-name)` — never silent (the 4 short product symbols all resolve same-file; nothing
  legitimate is lost); (4) ref kinds are role-gated in REJECT form — a product caller whose
  unique in-package def is non-product code drops as ambiguous (filter-form would fabricate a
  product→product edge from a name collision); the gate is deliberately one-directional, the
  missing mirror of the test→product relabel that feeds testIn/coverage. Self-map after: refs
  into ≤2-char symbols 234 → 2 (both same-file refs to a real one-letter bench formatter),
  product→non-product refs 209 → 0, and both rename workarounds are deleted with the natural
  names restored — `tests/self-map-roles.test.mjs` re-extracts the repo and pins the invariant
  plus the exact cycle class the renames dodged; `tests/extract-refscope.test.mjs` isolates each
  mechanism (including the test→product survival pin and the per-binding positive control).
  `SCANNER_VERSION` 14 → 15 so warm caches can't replay pre-fix edges.
  (perf-quality round 2, finding #10)
- **Overlap's Signal B honors the product-role scope its header advertises.** The role filter fed
  Signals A and C (via `defs`), but Signal B's twin candidates came from `outLabels` built over
  ALL graph edges and the twin loop never consulted roles — on the self-map every emitted
  `parallel-impl` finding paired test helpers ("merge the test helpers", the flagship bad advice
  role-scoping was built to kill) while the header claimed those symbols were excluded. One
  caller-side filter on `cand` closes it: both members of every pair come from `cand`, so the
  twin loop, LSH and exact paths are all covered; `considerPair`/jaccard judging is untouched;
  `CODEWEB_ALL_ROLES=1` short-circuits before the role lookup and restores the old scope exactly
  (byte-identical findings, A/B-verified against the pre-fix overlap on the same map — 16
  test-helper pairings on the post-#10/#11 self-map, all excluded by default, ONLY they).
  Signal-B case in `tests/overlap-roles.test.mjs` writes `call`-kind edges directly to exercise
  the caller-side filter. (perf-quality round 2, finding #16)

## [0.9.0] - 2026-07-19

### Added
- **Warm refreshes stop paying the AST tax (Spec A).** The tree-sitter engine now initializes
  lazily — a cheap availability probe decides cache namespaces and meta stamps up front, and
  the WASM runtime loads only at the first file that actually needs a parse. AST products
  (qualified methods, dispatch edges, exact per-node complexity) ride the scan cache, so a
  warm cached extraction on codeweb itself dropped **1.89s → 0.38s (5×)** with byte-identical
  fragments — felt directly by the MCP auto-refresh, the post-edit hook, and every staleness
  check. The banner now reports the tier's state (`ast: loaded|idle|off`).
- **The AST performance gate finally has a committed verdict**
  (`bench/results/ts-engine-bench.json`): cold extraction costs 3.6–4.3× regex
  (~+1.35 ms/symbol, axios + self) — paid once per changed file — and the warm path is
  engine-free, so default-on stands. Also fixes the bench's regex arm, which had silently
  benchmarked tree-sitter against itself ever since the tier went default-on.
- **The pipeline memoizes its downstream stages (Spec B).** cluster/overlap/optimize/report
  are pure functions of the extracted fragment (+ `CODEWEB_*` levers), so a re-run whose
  fragment is byte-identical reuses their outputs — wall-time changes, never a byte
  (property-tested modulo the `generatedAt` stamp). Extract itself now rides the scan cache
  inside `run.mjs`, making a no-change re-map of codeweb **~0.4s end to end**. `--full`
  forces a recompute.
- **Overlap survives monorepo scale — with declared caps.** Mapping TypeScript's `src/`
  exposed two quadratic passes (overlap sat at 100% CPU for 8+ minutes): all-pairs body
  confirmation inside huge same-name groups, and twin seeding through hub labels with
  thousands of callers. Same-name groups now body-confirm on a deterministic 12-node sample
  (the finding's evidence says so), >50-caller hub labels are excluded from twin seeding, a
  200k global pair budget seeds smallest groups first, and 400+-line bodies shingle their
  first 400 lines — every cap counted in the md header. Deterministic, reported, never silent.
- **Fixed: an input-dependent HANG in the shared tokenizer.** The string-literal regex in
  `lib/shingles.mjs` (`(?:\\.|(?!\1).)*`) backtracked exponentially on unterminated-quote
  content — one lone apostrophe in a big real-world body (TypeScript's testRunner fixtures)
  pinned the whole overlap stage at 100% CPU for 15+ minutes. Replaced with a linear-time
  matcher (each char consumed exactly one way) + a regression test; identical semantics.
  Found by the Spec B scale test; this also protects `find_similar` and the edit-time
  duplication check, which share the tokenizer.
- **The scale verdict is committed** (`bench/results/scale-typescript.json`): TypeScript
  `src/` — 16,286 symbols, 44,640 edges, 709 files including `checker.ts` — maps in **43s
  cold, 4s memoized re-run**, queries answer in ~200ms on the 13.5MB graph, and the top
  findings are real compiler duplication (`substituteExpression` ×9, drifted). On that
  evidence `lib/shards.mjs` is **deleted**: monolithic graphs hold with 10× headroom, the
  sharding layer had zero consumers, and git history keeps it if a 100k-symbol case ever
  materializes.
- **codeweb consolidated itself** (`bench/results/self-campaign.json`): the campaign's three
  product-true merges are executed — `findTarget` (both hooks; the duplication had hidden
  REAL drift, one hook's language list was seven languages stale), `load()` (diff/review →
  the canonical `loadGraph`, with better errors), and `edgeKey` (break-cycles/diff →
  graph-ops, NUL-separated collision-safe variant). Before/after gate: −22 nodes, −2
  duplication findings, coupling −25, **zero structural regressions**. The 65 DELETE steps
  are honestly skipped as false orphans (walker closures dispatched through function tables —
  exactly the `--orphans` cross-check caveat, applied to ourselves).
- **`npm run bench:all` — the standing benchmark suite behind every published number**
  (Spec C): pipeline timings, a representative 12-call MCP session (bytes/≈tokens/validity),
  per-tool response budgets, and the ts-engine gate, written to `bench/results/benchmarks.json`
  (+ a site mirror). A new CI job runs it with `--gate`: budgets live in `bench/budgets.json`,
  and breaking one fails the build. `check-consistency` now also audits that every evidence
  source cited by the ledger and README exists — claims physically can't rot.
- **Replay A/B gains cost-to-coverage (Spec D).** The workflow runs cells sequentially and
  records each cell's true token cost from the harness's own `budget.spent()` deltas (never
  solver self-report); the analyzer reports per-condition means and `costToFullCoverageTokens`
  — the discriminator when both arms hit the coverage ceiling. Old cells without cost report
  null and are counted, not fabricated. **Corpus v3 is frozen** after nine mining runs across
  six repos (funnels committed as `bench/results/replay-mine-*.json`): the miner re-derived
  the v2 task independently at a wider follow-up window (identical answer key — the instrument
  reproduces its own ground truth), one new 4-caller candidate was rejected under
  hand-verification (a feature-PR rewrite mentioning the symbol, not a caller fix), and the
  corpus stays at one fully-verified task — honestly. True-breakage tasks are rare; that is
  the finding.
- **Role overrides (Spec E).** `codeweb.rules.json` gains `roles: [{glob, role}]` — heuristics
  can't know a repo's private layout, so the repo says it once and extraction honors it (first
  match wins, invalid roles fail loudly, absent config is byte-identical to before). codeweb's
  own config marks `docs/**` as `generated` (it's the built website), completing the
  vite-playground precision lesson on our own map.
- **Python, Go, and Rust join the dispatch tier (Spec F).** Three vendored pinned grammars +
  dedicated tree walkers wire the calls regex precision-gates away: `self.m()`/`cls.m()`,
  Go receiver methods, Rust `self.m()`, and typed-receiver calls (`p: Pipe`, `q Pipe`,
  `p: &Pipe`) resolved globally under the one-owner rule — ambiguity drops and is counted,
  never guessed. Nodes stay byte-identical between engines; products ride the scan cache.
- **Caller-reliance contracts v2 (Spec G).** The explain card (and the ambient pre-edit card)
  now also reports: callers that try/catch or `.catch()` the symbol ("thrown types are
  contract"), callees that mutate a named parameter ("callers share that object"), and callers
  that null-check the result ("keep null/undefined returns possible"). Same conservatism as
  v1 — line-visible evidence or no claim.
- **Type-3 (near-miss) clone detection (Spec H).** The AST tier fingerprints each function's
  statements (identifier/literal-normalized, order-independent multiset); overlap pairs bodies
  sharing ≥70% of them — reordered or lightly-edited copies the exact and Type-2 passes cannot
  see. A distinct `near-miss-clone` finding kind, REVIEW-only by construction, bounded and
  deterministic.
- **Ruby, PHP, Kotlin, and Swift on the deterministic fast path (Spec I)** — eleven native
  languages. Discovery with owner-qualified methods (Ruby `def self.`, Kotlin extension
  `fun Type.name`, Swift `extension` members), visibility-as-export per language's own rules,
  comment/string masking, precision-gated calls, test-role detection (`spec/`, `_spec.rb`,
  `*Test.php`, `*Tests.swift`), and package manifests (Gemfile, composer.json, Package.swift).
  Verified on sinatra (1,173 symbols), monolog (1,622), okio (3,874, mixed Kotlin+Java),
  and Alamofire (2,616) — zero keyword phantoms, deterministic.
- **The report closes the loop to the editor (Spec J).** The inspector shows `Open in editor`
  (`vscode://file/...`) once the viewer supplies their project root — stored in localStorage,
  client-side only, because the shipped report still never embeds the absolute source path
  (the standing privacy invariant, now pinned by a second test).
- **npm + VS Code distribution, prepared (Spec J).** The package is publish-ready (`codeweb` +
  `codeweb-mcp` bins with shebangs, files whitelist, LICENSE, zero runtime deps — verified by
  an `npm pack` test); the release workflow builds and attaches the `.vsix` to every GitHub
  Release and carries npm/Marketplace publish steps that no-op until `NPM_TOKEN`/`VSCE_PAT`
  are configured. Publishing stays a human decision; the prep is done.

### Changed
- **The paper program is archived; the receipts stay.** `paper/` is retired from `main`:
  the runnable instruments and every frozen result (nulls and the discarded pilot included)
  now live in **`bench/`** as the product's benchmark suite (`bench/README.md`,
  `node bench/run-all.mjs`), and the site's Paper page is gone — the evidence ledger on the
  Research page (now including the 2026 blind replay A/B null) plus the CHANGELOG's Research
  notes are the public record. The manuscript, pre-registration (H1–H18), and figure
  apparatus remain in git history, last present at tag `v0.8.0`. README and ROADMAP
  rewritten to point at receipts instead of the manuscript.

## [0.8.0] - 2026-07-19

### Added
- **Java and C# call wiring (tree-sitter dispatch tier).** The regex engine still finds every
  symbol; for Java/C# files an optional AST pass now adds the call edges regex could never
  claim safely: `this.helper()` calls inside a class, and `receiver.method()` calls where the
  receiver's declared type names exactly one class in the repo (two classes with the same name
  → the edge is dropped and counted in the banner, never guessed). Nodes are untouched —
  identical between engines — so determinism holds. Grammars vendored from
  `@vscode/tree-sitter-wasm@0.3.1` (`scripts/grammars/PROVENANCE.md` records the ABI trap that
  rules out the older grammar package). Spec: `docs/specs/java-cs-tree-sitter.md`.
- **The ledger now counts whether advice was FOLLOWED, not just delivered.** When a pre-edit
  card names caller files and a later edit in the same session touches one of them (30-minute
  window, once per file, the changed symbol's own file excluded), the ledger bumps
  `cardCallersFollowed` and the session brief reports "N card-named caller(s) followed" —
  the difference between "we showed advice" and "the advice changed what happened."
  Spec: `docs/specs/card-correlation.md`.

### Research
- **The replay miner is tested and honest about its funnel.** `paper/experiments/replay-mine.mjs`
  (mines real commits that changed a function's definition and — per the repo's own later
  fixes — missed caller files) gained a TDD suite on synthetic git histories
  (`tests/replay-mine.test.mjs`, P1–P5) and a stage-by-stage funnel report. The tests + a
  hand-audit of the first frozen corpus exposed and fixed three miner bugs: a prefilter that
  silently zeroed every Java/C# candidate, a raw def-line comparison that read a prettier
  reformat as a "signature change" (which had produced 2 invalid tasks), and instructions
  truncated mid-hunk at 4KB (now: complete-or-rejected). Spec: `docs/specs/replay-corpus.md`.
- **The replay A/B protocol went blind before spending.** The v1 pilot leaked its own answer
  key three ways (the grading list pasted into solver prompts, self-reported coverage, and
  full-history isolation that let solvers read the historical fix commit). It is preserved —
  discarded — in `paper/results/replay-ab-pilot.json`; the v2 harness solves in a
  history-free export of the base revision and the workflow itself computes coverage as
  `filesChanged ∩ missedByChange`. Spec amendments: `docs/specs/replay-run.md`.
- **Replay A/B result: both arms at ceiling (honest null).** The v2 corpus froze at ONE
  fully-verified task — axios `buildFullPath` gaining `allowAbsoluteUrls`, where the real 2025
  change missed 2 of its 3 caller files and axios needed two follow-up PRs (#6810, #6814).
  Blind-replayed 4× per arm: all 8 cells covered both missed files with 0 structural
  regressions — with or without codeweb. On a 3-caller single-package change, a capable
  agent's grep saturates; the historical miss does not reproduce, so ambient context is
  bounded near zero **on this task shape**. The run proves the instrument (leak-free,
  fixed-function grading, ambient engagement verified in every treatment cell — the card's
  caller list matched ground truth exactly) and shows guarded mining makes true breakage
  tasks RARE: 2 of 3 v1 tasks and the only new candidate died under scrutiny. Discriminating
  between the arms needs many-caller cross-package tasks or cost-to-coverage metrics —
  recorded as the corpus growth path. Full data: `paper/results/replay-ab{,-raw}.json`.

## [0.7.1] - 2026-07-19

### Fixed
- **README screenshots crop to content.** The regenerated shots were uniform full-page
  frames — squeezed into README boxes, the matrix rendered ~170px wide and the blast
  shot's inspector was unreadable. `scripts/screenshot.mjs` now crops each frame to what
  it shows: the graph to its drawn bounding box, the blast shot to the LIT selection
  (tracked from the draw pass) + inspector at a tighter zoom, the matrix to its table +
  legend. README display sizes and the stale corpus line ("274 symbols across 8
  domains" → the real 334/11) synced; shots remain one-command regenerable.

## [0.7.0] - 2026-07-19

### Changed (the report finally looks like the product it is)
- **A validated color system replaces generated hues.** Area colors were `hsl(i × 137.5°)` —
  unbounded spun hues; the treemap ramped green→red at full saturation (measured deutan
  ΔE 2.2 — invisible to red-green-deficient viewers). Now: a fixed-order 8-slot categorical
  palette validated against the actual dark surface (worst adjacent ΔE 8.4 protan / 19.3
  normal, all ≥3:1; 9th+ areas fold to neutral), a single-hue slate→red lightness ramp for
  duplication density (with an on-canvas legend), reserved status colors for finding
  severity, and the brand lime demoted to what it should be: UI accent (selection, focus),
  never a data series.
- **The graph is drawn like a product.** Focus + context replaces expand-everything: every
  area starts as a bubble and clicking one expands ITS symbols in place — the all-at-once
  hairball is impossible unless explicitly asked for. Curved weight-scaled edges; node fills
  with darker same-hue rings; halo labels in the real UI font (the canvas font stack fell
  back to a serif before); the tangle color only appears where it means something; search
  reveals a hidden symbol's area instead of saying "no matches"; positions persist across
  expansions; layout is seeded — the same repo always draws the same map.
- **Treemap/matrix polish**: cell gaps + rounded corners, styled area headers with color
  chips, readable in-cell numbers (they were dark-on-dark), chip legends instead of prose.
- **First paint earns its pixels**: the inspector opens with the repo overview (largest
  areas, findings counts, how-to-read) instead of "Pick an item"; engine jargon moved out
  of the masthead into a tooltip; a logomark anchors the header.
- **Deterministic demo shots** (`scripts/screenshot.mjs`): staged states (top hotspot
  selected, its area expanded, inspector populated) at 2× retina with fixed framing — every
  committed screenshot (`assets/screens/`) regenerates from the real report in one command.
  The live demo (`docs/demo/`) rebuilt on the new template.

## [0.6.0] - 2026-07-19

### Added
- **The local outcome ledger** (`scripts/stats.mjs`, `npm run stats`): codeweb now counts what
  it actually does during real work — session briefs injected, pre-edit cards delivered,
  post-edit checks run, regressions flagged before landing, queries served, auto-refreshes —
  written by the hooks and the MCP server beside the graph (`stats.json`). Strictly local
  (never transmitted; counter names + integers only; `CODEWEB_NO_STATS=1` disables), fail-open
  by construction. The brief carries a one-line receipt ("codeweb this month: …") — the value
  made visible where it accrued.

### Research
- **Evidence program moves into the product** (`paper/STATUS.md`): the manuscript is frozen as
  a reproducible artifact; claims live in the site's evidence ledger + these Research notes.
- **Replay benchmark** (`paper/experiments/replay-mine.mjs` + `replay-ab.workflow.js`): mine
  git history for commits that changed a depended-on signature and provably missed caller
  files a later commit had to fix — each hit is a task with a built-in answer key (no invented
  tasks, no floor effect). First verified mining run on axios (1,647 commits, funnel reported
  at every stage): 2 ground-truth tasks, e.g. `forEach` — 9 caller files, 8 missed, fixed in a
  follow-up. The replay workflow runs control vs ambient codeweb over the mined set, graded on
  historical-miss coverage + the deterministic gate.

## [0.5.0] - 2026-07-19

### Added (fewer mistakes per token)
- **Day-one briefing** (`codeweb_brief`, 24th MCP tool + `scripts/brief.mjs` + a SessionStart
  hook): one ~2KB page — areas with summaries, the most depended-on symbols, entry points
  (heuristic), test layout, known issues — injected automatically when a session starts in a
  mapped repo. Replaces the first 20-50k tokens of exploratory orientation with pre-computed
  answers; served in-process from the cached graph.
- **Caller-reliance contracts** (`lib/reliance.mjs`): the explain card (and therefore the
  pre-edit hook, which embeds its summary) now reads the actual call sites and says what
  callers depend on — destructured/member-accessed result fields ("callers use {timeout,
  retries} — keep those"), awaited fraction, and the argument-count range in use. Targets the
  most common breaking edit: changing a return shape a caller still destructures.
  Conservative: only call-site-line patterns count; no sites → no claim.
- **Confidence calibration** (extractor v10): symbols reachable from a package entrypoint
  (package.json main/module/browser/bin/exports, followed through named + star re-export
  chains) are stamped `pub` — "0 in-repo callers" on a public symbol now answers with
  "⚠ public API — external callers likely; renames are breaking" instead of false confidence.
  Files using dynamic dispatch (computed member calls, getattr, non-literal require, emitters)
  are recorded in `meta.dynamic`, and empty callers/dependents answers cite them ("absence of
  callers is weaker evidence"). Confident answers stay caveat-free — no noise.

### Research
- **H18-v2 prepped** (`paper/experiments/agent-ab2-ambient.workflow.js` + `agent-ab2.README.md`):
  the agent A/B rerun as one funded command — v1's null was a floor effect (both arms ~0
  regressions on easy tasks), so v2 pre-registers hard tasks (graph-verified fan-in ≥ 5 /
  shape changes) and an AMBIENT treatment arm mirroring what the hooks now inject (brief +
  explain cards with reliance/caveats — context delivered, not offered). The analyzer takes
  raw/out paths so v1 results stay frozen.

## [0.4.0] - 2026-07-19

### Added
- **Java + C# on the deterministic fast path** (extractor v8): class/interface/enum/
  record/struct discovery with visibility-as-export, owner-qualified method ids
  (constructors included), Allman-brace + expression-bodied members (C#), `extends` /
  base-list inheritance edges, control-flow phantom guards, Maven/Gradle test-layout
  and `*Test.java` / `*Tests.cs` role detection, and pom.xml / build.gradle / .csproj
  package boundaries. Verified on square/javapoet (497 symbols, 0 phantoms, 0.7s) and
  restsharp/RestSharp (1,542 symbols, Allman style, 0.9s). Method-dispatch recall
  (`obj.Method()`) stays precision-gated as in the JS regex tier — a tree-sitter tier
  for Java/C# is the next increment.

### Added (recall ceiling + ambient loop)
- **Tree-sitter tier default-on** when web-tree-sitter is installed (`--engine regex`
  opts out; absent dependency degrades to regex byte-identically). Class-field arrow
  methods survive the AST handoff.
- **Barrels are dependents** (the measured recall gap): `export { X } from` edges the
  barrel's `<module>` to the resolved symbol; `export * from` chains resolve
  transitively AND edge the barrel to the target module. Oracle A/B moved from
  recall 0.94 to **1.00** (precision 0.94 vs grep 0.87) on both the fixed and a
  fresh-seeded 30-task sample.
- **Ambient loop**: the pre-edit hook now injects the ~1KB explain card (identity, top
  callers, tests) instead of a pointer — blast radius arrives with zero agent
  discipline; the MCP server **auto-refreshes a stale graph inline** (~1s incremental,
  throttled, CODEWEB_NO_AUTOREFRESH=1 opts out) before structural queries, and
  per-DIRECTORY mtime stamps make brand-new files trip the staleness check (per-file
  stamps cannot see a file that didn't exist).

### Added (the proof, the surfaces, the last query family)
- **`codeweb bench`** (`scripts/bench.mjs`, `npm run bench`): the oracle A/B packaged as a
  one-command benchmark on YOUR repo — context cost per dependents task + blast-radius cost
  always; recall/precision graded by the TypeScript LanguageService when `typescript` is
  resolvable; ripgrep optional. The engine moved verbatim into `scripts/lib/bench-core.mjs`
  (the paper experiment is now a thin wrapper over it — reproduction against the committed
  canonical run is byte-identical), so published numbers and user-generated numbers can
  never measure different things.
- **The gate now posts its review**: `ci-gate --md` renders the structural delta (blocking
  regressions, new cycles/duplications, symbols that lost all callers, renames-not-churn)
  as a budgeted digest and the `codeweb gate` workflow posts/updates it as a sticky PR
  comment on pass AND fail — visible where reviewers already look, verdict unchanged.
- **Editor CodeLens** (`editor/vscode-codeweb`): zero-dependency VS Code extension showing
  `N callers · blast M` above every mapped symbol from the nearest `.codeweb/graph.json`
  (identical semantics to `codeweb_callers`/`codeweb_impact`), click-through to
  `report.html#s=<id>`.
- **`codeweb_find` — concept search** (23rd MCP tool + `scripts/find.mjs`): free text
  ("where is retry handled?") → ranked symbols, deterministically — camelCase/snake_case
  token match with light stemming over identifiers/files/domains, weighted by exports,
  role (tests only when asked for), and fan-in. Served in-process from the cached graph,
  budgeted, staleness-annotated. Closes the last gap: every other query tool needs a name;
  this one turns an idea into the right starting symbol.

### Research
- **Oracle A/B** (`paper/experiments/oracle-ab.mjs`, results in
  `paper/results/oracle-ab.json`): dependents-discovery graded by the TypeScript
  compiler's own reference finder over 30 seeded vite symbols — codeweb recall 0.94 /
  precision 0.89 at **1/3 of an idealized grep's context cost** (0.8KB vs 2.5KB per
  task); blast-radius ("what transitively breaks") in one ~1KB call vs a recursive
  grep loop's ~130KB (**126× on the canonical run**, simulated generously for grep). Mechanical and
  reproducible — complements (does not replace) the frozen frontier-agent pilot,
  whose run stays the evidence for agent-loop behavior (+0.27 recall, ~44% fewer
  tokens). The 6/30 under-recalled symbols are the known dispatch/re-export gap.

## [0.3.0] - 2026-07-18

The agent-efficiency release: outputs that can't corrupt, answers that fit a context
window, and a map that tells you when it's stale. Driven by the measured product review
(`PRODUCT-REVIEW.md`).

### Fixed
- **Flush-safe output everywhere**: `process.exit()` after a large stdout write silently
  truncated anything past the 64KB pipe buffer (piped CLI JSON cut at exactly 65,536
  bytes; MCP responses clipped mid-string). All CLIs now end naturally via
  `lib/cli.mjs` emitters; `| head` (EPIPE) exits cleanly.
- `run.mjs` resolves a relative `<SRC>` against the caller's cwd (it resolved against the
  plugin root while `--out-dir` used the cwd) and reports stage failures in one clean
  line instead of a raw `execFileSync` stack. `--open` is parsed and forwarded (it was
  documented but inert).
- Campaign delete steps ranked ROI 0: `deadcode` now emits `loc` per item and the
  planner reads it (`locSaved` stays as a legacy alias).
- Same-file same-name methods collided into one node id: v6/v7 extraction emits
  owner-qualified ids (`file:Type.method`) in every tier (Python classes, Rust impls,
  Go receivers, JS/TS classes), with member-access resolution following.
- Body spans no longer desync on multi-line template literals / block comments (bodies
  swallowed whole neighboring functions — a 5-line helper recorded as 550 loc on vite,
  poisoning complexity, context-pack, and body-confirmation). Extents are measured on
  masked lines.
- `mcp-server` advertised version 0.1.0 on a 0.2.0 product; `serverInfo.version` now
  derives from package.json and `check-consistency` audits it.
- Signal-B twins de-duplicate by label pair (several `<module>` nodes produced N
  byte-identical findings).

### Added
- **Budgeted MCP responses**: list-heavy tools default to a one-line `summary` + top-N
  most-relevant items + TRUE totals + explicit `more.remaining`; `full: true` or
  `limit`/`offset` override. `codeweb_context` returns call-site windows (±3 lines)
  instead of whole caller bodies (~300KB → ~10KB on a busy vite symbol).
- **`codeweb_map`**: build/rebuild the graph over MCP; `graph` becomes
  optional on every tool (nearest `.codeweb/graph.json` above cwd, or `CODEWEB_WS`),
  and a missing graph returns an actionable error naming the fix.
- **`codeweb_explain`**: one ~1KB card (identity, contract, dependents, blast radius,
  findings) answering "tell me about X" — previously 3-4 calls. 22 tools total.
- **Plugin auto-registration**: `.claude-plugin/plugin.json` now carries `mcpServers`,
  so `/plugin install codeweb` delivers the tools without a manual `claude mcp add`.
- **Code roles**: every node carries `role` (product|test|fixture|example|bench|
  generated). Overlap findings, deadcode tiers, and the report's default view scope to
  product code (`CODEWEB_ALL_ROLES=1` / an in-report toggle widen it).
- **Interface-pattern detection**: ≥4 same-named implementations that nothing in-repo
  calls demote from "merge these" to an informational `interface-pattern` finding
  (framework hooks like a bundler plugin's `resolveId()`).
- **Workspace scoping**: bare-name call resolution never crosses a package (manifest)
  boundary — cross-package name collisions no longer fabricate edges in monorepos.
- **Staleness awareness**: the extractor stamps per-file size+mtime into
  `meta.sources`; query/context results annotate when the graph no longer matches disk
  and point at `codeweb_refresh`.
- **Pre-edit hook**: one advisory line of blast radius before an edit lands in a mapped
  target (PreToolUse; fail-open). The post-edit hook re-extracts incrementally
  (`--cache`) instead of full-scanning per edit.
- Bare-identifier arguments become `ref` edges (a callback passed is a reference, not an
  invocation); class-field arrow methods (`handleClick = () => {}`) are discovered and
  owner-qualified.
- Report: product-only filter, interface-pattern section, search that navigates
  (Enter cycles + selects matches), `#s=<id>` deep links, keyboard/ARIA support, and
  `prefers-reduced-motion` (layout settles without animation).
- `lib/cli.mjs`: the shared CLI harness (die/emit/loadGraph/capList/staleness) —
  deleting the die()×16 / graph-load×13 duplication codeweb's own overlap report flagged.

- **In-process query serving**: the MCP server answers structural queries from a
  cached parsed graph (4–6ms vs 75–122ms spawn+parse), via the same
  `lib/query-core.mjs` the CLI ships — one truth, two transports.
- **Rename-aware diff**: a removed+added pair with an identifier-normalized
  (Type-2) body match ≥85% reports as `renamed[]` instead of delete+add churn.
- Domain summaries are genuinely descriptive: size, file count, exported-first
  key symbols, and role composition ("mostly test code").

### Changed
- `campaign` batches its delete simulation (one clone instead of one per step):
  8.9s → 1.25s on a 3k-symbol monorepo.
- MCP `initialize` returns workflow `instructions` and negotiates a SUPPORTED protocol
  version instead of echoing arbitrary client strings; tool calls get a 120s timeout.
- `codeweb_find_similar` accepts `body` (stdin plumbing) + `structural` over MCP;
  `codeweb_review` accepts `before` + `gate`; `codeweb_reading_order` accepts
  scope/value/budget — previously CLI-only capability, now agent-reachable.

## [0.2.0] - 2026-06-23

The first managed release: codeweb gets a real public front and the machinery to keep
product, marketing, and research in lock-step.

### Added

- **Public website** built from a zero-dependency Node builder (`site/build.mjs`) into
  `docs/` — Home, Product, Research, Get Started, and Changelog pages, all self-contained
  with zero third-party requests, served by GitHub Pages.
- **Design system** (`site/tokens.css` + `site/styles.css`): the engine's palette codified
  into reusable tokens and components, plus a polished animated hero.
- **Evidence ledger** on the Research page — every claim tagged `Validated`,
  `Preliminary`, or `Null` with its exact number, sample size, and source file.
- **Single source of truth** (`site/data/product.json`) for the tagline, the 20 MCP tools,
  the Tier 0–3 map, supported languages, and the claim ledger.
- **Release ecosystem**: this `CHANGELOG.md`, plus `scripts/version-sync.mjs`,
  `scripts/check-consistency.mjs`, and `scripts/release.mjs`.
- Shared navigation injected into the existing interactive demo and research paper, so
  they are no longer orphaned pages.

### Changed

- Corrected the Claude Code plugin manifest, which advertised **15** query tools; the real
  surface is **20**. The tool count is now derived from the MCP server and verified in CI.
- README updated for the new site, version, and a `Versioning & Releases` section.

### Fixed

- Per-page Open Graph metadata and favicon (the Pages root previously 404'd — there was no
  landing page at all).

### Research

- Surfaced the **efficiency pilot**: frontier-agent caller discovery improves by
  **+0.265 ± 0.045** recall and **~34% fewer steps** vs grep over 8 engine-frozen reps
  (`paper/experiments/efficiency-pilot.reps8.json`). Labelled preliminary.

## [0.1.0] - 2026-06-22

The deterministic engine and its evidence base.

### Added

- **Core pipeline** — extract → cluster → overlap → render: a parse-free, zero-dependency
  code-structure graph with a self-contained interactive `report.html`.
- **Ten features across four tiers** (F1–F10): scoped context, live refresh, the
  duplication-delta gate, hotspots, campaign planning, structural clone detection,
  suppression memory, reading order, incremental edge derivation, and sharded subgraphs.
- **20 deterministic MCP tools** spanning structural queries, write-time, review-time,
  optimize-time, freshness, and comparison.
- **Five-language fast path**: JavaScript, TypeScript, Python, Rust, and Go.
- **CI gate** — a GitHub Action that fails a PR on a new cycle, a new duplication, or a
  symbol that loses all callers.

### Research

- **Pre-registered effectiveness study** — 32 of 33 checks pass; 0 disagreements across
  ~490k oracle comparisons; the study found and fixed two real engine bugs the 286-test
  suite had missed (`paper/`).

[Unreleased]: https://github.com/GhostlyGawd/codeweb/compare/v0.9.0...HEAD
[0.9.0]: https://github.com/GhostlyGawd/codeweb/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/GhostlyGawd/codeweb/compare/v0.7.1...v0.8.0
[0.7.1]: https://github.com/GhostlyGawd/codeweb/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/GhostlyGawd/codeweb/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/GhostlyGawd/codeweb/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/GhostlyGawd/codeweb/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/GhostlyGawd/codeweb/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/GhostlyGawd/codeweb/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/GhostlyGawd/codeweb/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/GhostlyGawd/codeweb/releases/tag/v0.1.0
