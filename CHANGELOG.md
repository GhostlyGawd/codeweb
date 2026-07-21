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
