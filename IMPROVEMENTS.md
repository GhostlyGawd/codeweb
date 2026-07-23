# codeweb — Performance & Quality Review, Round 2

**Date:** 2026-07-21 · **Scope:** performance and internal quality across every executing surface, one implementation round after the first perf/quality review (archived to `docs/perf-quality-review-2026-07-21.md`) shipped.

**Method:** seven parallel read-only audits (extract engine · advisors · MCP/hooks/CLI · report+site+editor · code quality/dogfood · truth/robustness/determinism · tests/CI/packaging), each required to first read the prior rounds, validate that the fixes they cover actually landed, and verify every new claim against this working tree — via micro-benchmarks on 5k/15.7k/16.8k-node corpora built with the real pipeline, a scripted MCP stdio client, adversarial masking/import fixtures run through the real extractor, Playwright/Chromium runs against a 13 MB report, two full test-suite runs diffed for flakes, an `npm pack`+install smoke test, and hand-verified dogfood (codeweb's own advisors on codeweb). The orchestrator then independently spot-verified the load-bearing mechanisms at file:line before synthesis. Absolute times are from this container (Node 22.22.2, 4 cores, audits running concurrently — min of 2-3 runs reported); treat ratios as the signal. Three clusters were discovered **independently by two or more audits** (the refresh-kills-sidecars bug, the stale `docs/changelog.html` + tests-mutate-tracked-docs pair, the `package.json` "24 MCP tools" drift) — treat those as high-confidence.

---

## What actually shipped last round — the validation ledger

The implementation commit (`bfc6b92`) claims "all 32 findings". The audits re-verified each one in scope. Two ledgers:

**Held, verified working** — the machine is genuinely better:
- **#1 masker regex-literal state**: holds for its shipped scope (quote/quantifier regexes, division chains, JSX all mask correctly; `lib/complexity.mjs` self-extracts with edges again).
- **#3 atomic writes**: 8× SIGKILL mid-extract + 2 concurrent extracts on one workspace → never a torn artifact, zero tmp litter.
- **#5 byte-determinism**: full self-map ×2 under `SOURCE_DATE_EPOCH` + TZ/locale shake → all six artifacts byte-identical.
- **#6/#7 AST tier**: 11 MB corpus now 10.2 s / 299 MB peak (was 34.2 s / 1,312 MB) — 3.3× faster, 4.4× less memory; profile is parse-bound, walk residuals small.
- **#8 python memo**: 220-file re-export corpus extracts in 347 ms (was the 70 %-of-1 s class).
- **#9 blast radius**: risk at 15.7k nodes/93k edges = **0.88 s** (was 82.2 s at comparable scale), near-linear growth.
- **#10/#17/#18 incremental floor**: warm no-change reads zero source bytes, cold-vs-warm fragments byte-identical (`cmp`), one shared `.scan-cache.json`, first-hook-after-map is warm (352–566 ms, was 28.7 s cold-class).
- **#19/#20 MCP async + fast paths**: fast query behind a concurrent campaign = 1.1 ms (was 527.6 ms); stale query answers in 9.5 ms stale-annotated (was 807 ms inline-refresh block); explain/context 1.1 ms warm.
- **#22 tmp leaks**: zero `codeweb-*` tmpdir entries after two suite runs + real hook fires; tripwire present.
- **#23 brief prerender**: session-brief serves `brief.json` at 63–70 ms — *at map time* (see #25 below for how it dies).
- **#24–#28 refactors**: parseArgs adopted (25 scripts), extract-symbols decomposition landed its pure-module half, ts-engine dedup clean, one-truth constants clean, spike/.live retired clean.
- **Suite health**: 589 tests, 0 fail, 5 skips, **zero flakes** across two full runs diffed test-by-test; packed tarball (1.3 MB) installs and maps green with all 27 tools listed.

**Did not land, despite the claim** — discovered independently by the delivery and quality audits:
- **#29 release gate, #30 test split, #31 CI matrix/skip guards, #32 consistency-gate coverage**: `git show bfc6b92 --name-only` touches none of `.github/`, `package.json`, `scripts/release-utils.mjs`, `tests/incremental-edges.test.mjs`. CHANGELOG documents findings 1–28 only. The npm listing still says "24 MCP tools" while 27 ship, and `check-consistency` prints OK over it — live drift, right now, on the most public surface.
- Most of the prior round's "smaller notes": NUL bytes still in `break-cycles.mjs`/`diff.mjs` (both grep-invisible today), `fragment.json` still pretty-printed, `cluster3.mjs`/`overlap.mjs` still parse workspace JSON unguarded.

The pattern is exact: **the four un-landed findings are the gates that would have caught un-landed findings.** That closes into finding #1.

---

## 1. State snapshot (measured)

| Surface | Today | After the named fix |
|---|---|---|
| `reading_order` @15.7k nodes | **75.9 s** (O(n²) greedy, exponent ≈2.3) | **0.33 s**, first-40 byte-identical (#22 prototype) |
| `break-cycles` on one dense 60-file SCC @15.7k | **22.8 s**; campaign inherits 25.2 s | **0.16 s**, output identical (#23 prototype) |
| overlap Signal-B @15.7k | 5.1 s (99.3 % of 948k LSH buckets are singletons) | ~0.6 s, identical pair set (#24 prototype) |
| warm extract, add one function @16.8k syms | **1,698 ms** (`edged 800/800` — full re-derive) vs 733 ms noop | noop-class via name-delta invalidation (#17) |
| post-edit hook @17.6k nodes | 1,624 ms no-change (spec threshold: 1.5 s) | −~325 ms via baseline sidecar (#18), then in-process extract |
| session/pre-edit hooks after the **first** refresh | 106–135 ms @1.2k, 310–350 ms class @16k — sidecars dead until next full map | 63–81 ms floor, always (#25) |
| MCP server: tool child dies early with 1 MB stdin pending | **entire server crashes** (unhandled EPIPE, exit 1) | answers normally, one-line guard (#29) |
| MCP prescribed per-edit loop (refresh+diff) | 407–434 ms spawned, diff can read the **pre-refresh** graph when parallelized | in-process + correctly queued (#30, #33) |
| report.html @16.8k | 13.13 MB (47 % never read); expand-all **3.6 fps for 15 s**, max frame 3.6 s; 382–439 ms/draw | 6.96 MB embed (#36); bounded frames (#35); tens-of-ms draws (#37) |
| Editor CodeLens @16.8k graph | 389 ms/file, sync on extension host, recomputed per edit | ~10–40× via the #9-style BFS fix (#38) |
| Test suite | 93.6 s wall, 0 flakes; **one test is 59.8 s solo** | ~45–50 s by splitting its 40 trials (#6) |
| A tag push | publishes with **zero tests run**, unpinned vsce | gated release (#2) |
| Self-map advice | 2/2 "safe to delete" are **false**; campaign's top action cuts a **phantom** cycle | truthful after #9-class lexing fixes (#8–#10) |

## 2. Opportunity map (impact × effort)

| | **S — hours→a day** | **M — days** | **L — a week+** |
|---|---|---|---|
| **High impact** | #2 release gate · #5 site freshness · #9 spread/IIFE lexing · #11 NodeNext imports · #22 reading-order · #23 break-cycles · #25 refresh sidecars · #29 EPIPE guard · #36 slim embed | #1 process closer · #8 masker templates · #10 bare-ref magnets · #17 name-delta invalidation · #18 hook floor · #24 LSH buckets · #35 expand-all completion · #37 draw loop | — |
| **Medium impact** | #4 consistency gate · #6 test split · #15 huge-line crash · #16 Signal-B roles · #19 warm-floor terms · #20 maskJs speed · #21 enclosing() · #27 campaign parallel · #30 diff queue key · #31 queue bypass · #38 editor lens · #39 stray parsers · #41 NUL bytes | #3 CI breadth · #12 accessor/overload truth · #13 heredoc/PHP · #14 f-strings · #26 dup-check index · #32 reader concurrency · #33 in-process diff/stats | #40 orchestrator residual |
| **Low impact** | #7 docs drift · #28 diff internals · #34 cancellation/batch · #42 leftovers | — | — |

---

## 3. Findings

### A · Delivery integrity — the un-landed remainder

#### #1 · "All 32 findings implemented" is false — the delivery cluster silently didn't ship, and nothing could catch that — **CI** · release
Commit `bfc6b92` ("implementation (all 32 findings)") touches 96 files but none of `.github/workflows/*`, `package.json`, `scripts/release-utils.mjs`, or `tests/incremental-edges.test.mjs`; CHANGELOG's Unreleased section documents findings 1–28 only. The four dropped items (#29–#32, reinstated below as #2/#6/#3/#4) are precisely the gates that verify shipping claims — the review process has no closer, and the surfaces that would have caught the drop are the drop.
**Fix:** land #2–#6; amend the CHANGELOG claim to what actually shipped; add a closer to the review skill/process — an implementation round ends with a checklist diff of claim vs `git show --name-only` reality, and the consistency gate (#4) makes the most public drift self-catching. **High / M** (mostly the sub-items).

#### #2 · A tag (or workflow_dispatch on any branch) still publishes with zero tests, via an unpinned toolchain — **CI** · release *(reinstates #29)*
`release.yml` has a single `publish` job — no test job, no `needs:`; `ci.yml` never triggers on tags, so the release path runs 0 of the 589 tests. The dispatch path checks out whatever ref it was given and creates the tag server-side with no is-ancestor-of-main check. `npx --yes @vscode/vsce@latest` (:117, :139) executes whatever npm serves that day in a pipeline that otherwise touts `npm publish --provenance`. (npm/Marketplace steps are secret-gated no-ops today; the GitHub Release + .vsix ship ungated, and the npm step arms itself the day `NPM_TOKEN` lands.)
**Fix:** `test` job (checkout, node 22, `npm ci`, `npm test`, `check-consistency`) with `publish: needs: test`; `git merge-base --is-ancestor HEAD origin/main` on dispatch; pin vsce exactly. **High / S.**

#### #3 · CI is still single-OS/single-Node; the AST tier can silently un-test itself; the self-gate maps regex-only — **CI** · ci *(reinstates #31, extended)*
`ci.yml`: ubuntu + node 22 only, no matrix, no `cache: 'npm'`, while `engines` claims `>=20` (whose glob-broken `npm test` the file's own comment admits). 28 engine-availability skip guards across tests/, zero `process.env.CI` references, no skip-count ceiling — an optionalDependency install hiccup turns CI green with the whole AST tier untested (today's true skip count is 5). Two new blind spots this round: the regex/tree-sitter fallback-equivalence test *inverse-skips* wherever deps are installed — i.e. always in CI; and `codeweb-gate.yml` runs `ci-gate.mjs` with **no `npm ci` at all**, so the structural self-gate analyzes every PR regex-only — an AST-dispatch regression in `scripts/**` is invisible to the gate built to catch structural regressions in `scripts/**`.
**Fix:** matrix `os × node` (or bump engines honestly); assert `# skipped <= 2` from the TAP tail or `node -e "await import('web-tree-sitter')"` post-install; `npm ci` in codeweb-gate.yml; run fallback-equivalence via `CODEWEB_ENGINE=regex` on one job; add npm cache. **Medium / M.**

#### #4 · The consistency gate still skips package.json — the npm listing says "24 MCP tools" while 27 ship — **FIX** · release *(reinstates #32; found independently by two audits)*
`package.json:5` says "24 MCP tools"; `mcp-server.mjs` ships 27 (README and plugin.json agree on 27; `tools/list` from a packed install returns 27). `node scripts/check-consistency.mjs` prints "OK — v0.9.0, 27 tools, all surfaces aligned" over it because `release-utils.mjs:49-58 PROSE_FILES` omits package.json, and `syncTargets` has no package.json sub either — the drift can't even self-heal at the next version roll.
**Fix:** scan package.json's `description` in `scanProseCounts`; add a `(\d+) MCP tools` sub to `syncTargets`; correct 24→27 now; regression case in `tests/release-tooling.test.mjs`. **Medium / S.**

#### #5 · `npm test` mutates tracked docs/, and the committed website is stale at HEAD right now — **FIX** · site *(found independently by two audits)*
`site/build.mjs:20,242` writes into tracked `docs/`, and all 7 tests in `tests/site-build.test.mjs` run the real builder against it — every suite run rewrites tracked files (measured: clean tree → `npm test` → ` M docs/changelog.html`). The committed `docs/changelog.html` is missing the finding-28 "Removed" section that HEAD's CHANGELOG contains — the published GitHub Pages changelog doesn't match the shipped CHANGELOG. CI runs the site build but never asserts the tree stayed clean, so the gap is structural, not a one-off.
**Fix:** `--out <dir>` on site/build.mjs and point tests at a temp dir; CI step after the build: `git diff --exit-code docs/`; rebuild and commit the current stale page. **High / S.**

#### #6 · The suite's floor is still one 60-second sequential property test — and the seam to fix it now exists — **CI·PERF** · tests *(reinstates #30)*
`tests/incremental-edges.test.mjs:98-131` — IE-EQUIVALENCE remains one `test()` with 40 sequential trials (~360 child extracts): 61.3 s in-suite, 59.8 s solo (slightly worse than the 48.9 s it was flagged at); nothing else exceeds 13.3 s, so no schedule brings the suite under ~60 s. New since last round: `tests/lang-rules.test.mjs` proves the in-process pattern the fix wants (10 cases, 137 ms, zero spawns).
**Fix:** per-trial `test()`s (node:test runs them concurrently) + env-gated trial count (10 local / 40 CI): suite ~93 s → ~45–50 s. The deeper unlock stays #40. **Medium / S.**

#### #7 · Shipped-docs drift: a documented engine mode that doesn't exist, a runbook off by 189 tests, a release prep that succeeds over its own failed audit — **FIX** · docs
(a) `README.md:497` documents `--engine read`; real values are `regex|tree-sitter`, and `extract-symbols.mjs:223` treats any non-"regex" string — including `read` — as *enabling* the AST tier, the opposite of the documented intent, with no validation. (b) `.claude/skills/release-tag/SKILL.md:33` says "expect ~400 tests; skips are tree-sitter-absence" — actual: 589, and 3 of 5 skips are the `D:/` golden-path. (c) `scripts/release.mjs:55-57` prints `consistency: N problem(s)` and exits 0 regardless.
**Fix:** correct README; make extract-symbols reject unknown `--engine` (exit 2, the #24 policy); refresh SKILL.md numbers; `process.exit(1)` when `!audit.ok`. **Low / S.**

### B · Map truth

#### #8 · The masker has no nested-template state — fabricated AND dropped edges on ordinary modern JS, deadcode corrupted again — **FIX** · masking
`lib/masking.mjs:123-141`: the `${…}` branch handles `"` `'` and regex but not a nested `` ` `` — nested-template *text* stays live (`` `Usage: ${xs.map((n) => `fabricateMe(${n})`).join('; ')}` `` fabricates a `docs → fabricateMe` call edge); a `}` inside that nested text closes the interpolation and inverts template state, blanking the rest of the file (edges lost, extents run to EOF); an escaped `` \` `` in template text (:123-127, no `\` handling) does the same; and `${}`-interior strings are kept verbatim even in blank-values mode (:133 ignores `keepValues`), so string *content* fabricates edges. Downstream repro'd end-to-end: a genuinely-called helper is listed by deadcode as "safe to delete — high-confidence"; a genuinely-dead function is hidden by its phantom caller — the exact corruption chain prior-#1 shipped to end, one idiom over. Both tiers affected (the edge scan shares the mask).
**Fix:** a small stack of `{inTemplate, exprDepth}` frames replaces the two scalars (nested `` ` `` pushes); `\` escapes in template text; route `${}`-interior strings through `value()`. Regression fixtures beside `tests/maskjs-regex-literals.test.mjs`. **High / M.**

#### #9 · Spread-call and arrow-IIFE mis-lexing make both of the self-map's "safe to delete" verdicts false — campaign would break the product — **FIX** · engine
(a) `extract-symbols.mjs:767` treats `(`-preceded-by-`.` as a member call; for spread `...metrics(` (`trend.mjs:109`) the backward identifier match fails on the dots and the call edge is *dropped* — `trend.mjs:metrics` shows 0 callers. (b) `lang-rules.mjs:162`'s const-arrow pattern matches `const PERM_SEEDS = (() => {…})()` — an IIFE-initialized **value** becomes a `function` node whose only use is subscript, invisible to callRe/refRe. Dogfood: deadcode's entire safe tier on this repo is these two false positives, and `campaign` emits `DELETE scripts/trend.mjs:metrics` / `DELETE scripts/lib/minhash.mjs:PERM_SEEDS` — executing its own advice would break trend and minhash at runtime.
**Fix:** treat `..` before a member match as spread → fall through to `addEdge`; reject `=\s*\(\(` in the const-arrow rule; self-map regression asserting `trend.mjs:metrics` has ≥1 caller. **High / S.**

#### #10 · Bare-ref resolution fabricates cross-role edges at scale — 24 % of all self-map ref edges point at 8 single-letter test/bench symbols — **FIX** · engine
`refRe` (extract-symbols.mjs:741, applied :794) scans definition lines too, so `function metrics(g) {` emits a ref from `metrics` to a test file's global `g`; the package-scope fallback (:709-718) has no role boundary or identifier-quality guard, so short test/bench names become magnets: **125 product→test ref edges; 267 of 1,121 ref edges (24 %) target 8 single-letter symbols** (`g`×74, `f`×70, `p`×66). Campaign's #1 self-action cuts a "cycle" closed entirely by these fabricated edges; blast radii and coupling inflate. The codebase currently *renames its own parameters* to dodge this (`cli.mjs:197-199`, `import-resolve.mjs:28-34` — comments admitting it).
**Fix:** skip the ref scan on the enclosing symbol's own signature line; role-gate the unique-global fallback (product never resolves into test/bench for ref kinds — mirror of the :721 reclassification); optionally require ≥3-char names for the bare fallback. Then delete the two rename-workaround comments. **High / M.**

#### #11 · Import resolution can't map NodeNext `.js` specifiers to `.ts/.tsx` sources — alias, namespace, and re-export edges silently vanish in modern TS repos — **FIX** · imports
`lib/import-resolve.mjs:41`'s candidate list never maps `.js/.mjs/.cjs` specifiers back to their TS sources — the spelling TypeScript **requires** under `moduleResolution: node16/nodenext` — and lacks `/index.tsx|jsx|cjs`. Repro'd: two same-named functions each import-disambiguated via `./x-parse.js` → **0 edges** (`query --callers` answers 0 for a function its caller names in an import); `import * as u from './util.js'` → nsmap empty → **0 edges**; `export { shared } from './util.js'` re-export chains break. Unique-bare-name rescue masks the hole just often enough to look random. Same stale list duplicated in the pub-entrypoint walk (`extract-symbols.mjs:602`).
**Fix:** on miss, retry `.js→.ts/.tsx`, `.mjs→.mts`, `.cjs→.cts`; add the missing index candidates; mirror in the pub-walk; a NodeNext package in the recall suite. **High / S.**

#### #12 · Declaration lines fabricate class→member call edges; getter/setter pairs collapse; the regex tier can't see annotated methods — **FIX** · engine
AST tier: getter+setter both emit `Widget.value` and the setter is silently dropped (`extract-symbols.mjs:477` dedupe without the regex tier's `@line` disambiguator); the self-definition guard (:700) covers only the node's *start* line, so setter lines and TS overload stubs are scanned as calls with the **class** as scope → fabricated `Widget → Widget.value`/`Widget.render` edges give every accessor/overloaded member a phantom caller (hiding them from deadcode). Regex tier: the method matcher (`lang-rules.mjs:164`) fails on any return annotation or default param — `get value(): number {`, `compute(n: number): number {` are invisible and their bodies' calls re-attribute to the class node.
**Fix:** suffix accessor ids (`#get`/`#set` or reuse `@line`); extend the self-definition guard to any same-named member's declaration span; allow `(?:\s*:\s*[^{;=]+)?` + stacked modifiers in the regex matcher. **Medium / M.**

#### #13 · Ruby heredocs and PHP `#` comments fabricate symbols and edges — two languages feed unmasked text to the scanners — **FIX** · masking
Ruby's symbol scan runs on **raw text** (`lang-rules.mjs:20` — only `.py` uses the mask) and `maskRuby` has no heredoc state: a `<<~SQL` body containing `helper(1)` and `def phantom_method` produces a **phantom node** and a **fabricated call edge** (repro'd). PHP routes through `maskJs`, which doesn't know `#` comments: `# legacy note: helper(1)` fabricates a module→helper call.
**Fix:** heredoc state in maskRuby (track `<<[~-]?IDENT`…terminator) + pass `masked('rb')` to the Ruby scan; a language flag on maskJs treating `#` as to-EOL comment for `.php`. **Medium / M.**

#### #14 · maskPy blanks f-string interpolations — real call edges inside `f"…{expr}…"` are dropped — **FIX** · masking
`lib/masking.mjs:35-47` treats f-strings as plain strings; `{compute(x)}` is executing code (the exact analogue of the JS `${}` the JS masker deliberately keeps live). Repro'd: `return f"total={compute(x)}"` → `report → compute` edge missing; functions invoked only from f-strings (logging/formatting — idiomatic Python) show 0 callers, poisoning caller counts and blast radii. Undocumented — the maskPy header enumerates limits and omits this.
**Fix:** detect `f`/`F` (and `rf`/`fr`) prefixes; keep `{…}` interiors verbatim (`{{`/`}}` literal), blank only text — for single-line and triple-quoted forms. **Medium / M.**

#### #15 · One ≥8.4 MB single-line string crashes the entire extract, both tiers — catastrophic regex in complexity strip and maskRuby — **FIX** · robustness
`lib/complexity.mjs:23`'s `/"(?:\\.|[^"\\])*"/g` (and twins) recurses per character in V8 — binary-searched first crash at string length 8,388,574. A `src/generated/data.js` with a 10 MB inlined string (base64 asset, dataset — SKIP excludes only `dist/build/...`) throws an uncaught RangeError from `cyclomatic` in **both** tiers → the whole map, post-edit hook, and MCP refresh die with it. Same pattern class in `maskRuby`; `maskJs`/`maskPy` (char loops) survive.
**Fix:** unrolled-loop form (`"[^"\\]*(?:\\[\s\S][^"\\]*)*"`) or a char scan; belt: try/catch around `cyclomatic`/`nestingDepth` degrading that node to `1`/`0` instead of killing the run. **Medium / S.**

#### #16 · Overlap's Signal B bypasses the product-role scope its own header advertises — 11 of 13 self-findings are the "merge the test helpers" advice role-scoping was built to kill — **FIX** · advisors
The role filter is applied to `defs` (overlap.mjs:117-118), feeding Signals A and C — but Signal B's candidates come from `outLabels` built over **all** graph edges (:125-126, :224), and the twin loop never consults roles. Self-run: header says "602 test/fixture/example/bench symbols excluded" while ov3–ov19 pair `tests/*` helpers — contradicting the module's own motivation comment and Spec E's "everything downstream honors role". Both prior rounds missed it.
**Fix:** filter `cand` to product-role nodes (one line), symmetric with `CODEWEB_ALL_ROLES=1`; Signal-B case in `tests/overlap-roles.test.mjs`. **Medium / S.**

### C · Engine performance

#### #17 · Any symbol-set-changing edit collapses the incremental floor — the whole repo is re-read, re-masked, re-derived — **PERF** · engine
`extract-symbols.mjs:645` gates edge/binding caches on a signature over the **global** symbol set (`:653-655` likewise for bindings), so adding/removing/renaming one export fails `reuseEdges` for *every* file (`:809`): measured @16.8k syms — noop 733 ms, body-edit 1,018 ms (`edged 1/800`), **add-one-function 1,698 ms (`edged 800/800`)**; @29.4k — 1,733 vs 3,217 ms; hook end-to-end 2,534 vs 1,624 ms. Adding a function is *the* canonical agent edit — the stamp tier's O(changed bytes) promise doesn't apply to the case hooks/refresh hit most.
**Fix:** name-delta invalidation — store each file's candidate identifier set (pre-`byName` filter, 30–200 names) in the cache; on symbol-set change, re-derive only files whose candidates intersect the delta (pkg-boundary changes keep the wholesale flip); same rule for `bindSig`. Byte-identity stays provable via IE-EQUIVALENCE. **High / M.**

#### #18 · The hook-fastpath spec's own revisit triggers are breached at its benchmark — and half the residual re-verifies an unchanged baseline — **PERF** · engine/hooks
`docs/specs/hook-fastpath-floor.md` sets "hook > 1.5 s at 16k → in-process extraction" and "`structuralRegressions` > 500 ms → incremental check". Measured: no-change hook fire = **1,624 ms** at 17.6k nodes; `structuralRegressions` = 433 ms @16.8k, **892–988 ms @29.4k**. Decomposition @16.8k: child extract 867+, structuralRegressions 433, baseline JSON.parse 151, fragment parse 105 ms — and the *before*-side `normalizeGraph` + `fileCycles` + `buildIndex` (~173 ms) recompute per edit an artifact that cannot have changed since map time.
**Fix:** persist a baseline sidecar (fileCycles keys + callIn counts) at map/refresh time — hook skips the before-side recompute and the 14 MB parse (S); then the spec's named in-process extraction (kills child boot + cache re-parse + fragment round-trip ≈ another 500 ms; #40 is the precondition). **High / S→M.**

#### #19 · The warm no-change floor is O(all cached products), with four avoidable terms — **PERF** · engine
(a) The scan cache stores every symbol ~3× (`syms`+`nodes`+`ranges` = 44 % of bytes) and edges as verbose objects (46 %): 18.8 MB @16.8k, ~265 ms parse — the floor's largest term. (b) The fragment is re-stringified and re-written even when byte-identical (`extract-symbols.mjs:967` unconditional; pretty for `--out`): 22.7 vs 13.5 MB compact, 831 vs 733 ms. (c) Any 1-file edit rewrites the whole cache (~200 ms @18.8 MB). (d) `run.mjs:94-106` re-reads the fragment for memoKey and full-parses graph.json as its corruption belt (167 ms @13.9 MB) on every warm re-map — warm `run.mjs` = 1,190 ms of which only 733 is extract.
**Fix:** intern edge tuples + drop `syms` (cache ≈ −40-50 %); store the fragment's sha1 and skip unchanged writes (also lands the tracked compact-fragment note); per-output content hashes in `.stages.json` instead of the full parse. **Medium / S.**

#### #20 · maskJs lexes at ~15 MB/s — a per-char closure with a regex test per character — **PERF** · masking
`lib/masking.mjs:93`: `note(ch)` runs `/[A-Za-z0-9_$]/.test(ch)` per char plus `res += ch` per char. A two-line charCode patch measured **1.50–1.56× faster, byte-identical across 874 files**. Masking runs on every cold/changed file and on the whole repo under #17's re-derive.
**Fix:** land the charCode test; then span-copy (scan runs of plain code to the next special char, slice whole runs) — est. 3–5× total, same state machine; `parseSignature` already demonstrates the idiom in-repo. **Medium / S.**

#### #21 · Per-file edge derivation is quadratic in symbols-per-file — big generated/hub files pay 2.5× — **PERF** · engine
`extract-symbols.mjs:689` `enclosing()` linearly scans all ranges per call-site match. One 8,000-fn file: 1,446 ms vs 579 ms for the identical code split across 400 files; profile: `addEdge` 50.8 % self. Real-world exposure: monorepo hub files (2k+ symbols).
**Fix:** precompute an innermost-range-per-line array per file in one O(lines+ranges) sweep — `enclosing` becomes O(1); hoists the same scan at `:422`. **Medium / S.**

### D · Advisors

#### #22 · reading-order computes the full O(n²) greedy order, then slices to the budget — 76 s at 15.7k for a 40-item answer — **PERF** · advisors
`lib/reading-order.mjs:34-43`: per emitted item, a full scan of `remaining` recomputing unemitted-callee counts plus `splice(indexOf(...))`; the budget applies only at `:52` after the complete order exists (and `scopeIdsOf` still uses the `q.shift()` idiom #9 killed elsewhere). Measured: 6.0 s @5.3k → **75.9 s @15.7k** (exponent ≈ 2.3). This is MCP's `codeweb_reading_order` ("understand a codebase fast", scope defaults to the whole graph) — at ~30k nodes it will hit the server's 120 s spawn timeout and fail outright. No bench times it.
**Fix:** early-exit at `budget` is byte-identical (the greedy choice depends only on the emitted set — prototype: first-40 identical, **84 / 331 ms**); live `un` counters via a reverse-caller map + swap-pop set; bench row. **High / S.**

#### #23 · break-cycles re-runs whole-graph fileCycles per candidate cut — 23 s for one dense 60-file SCC; campaign inherits it — **PERF** · advisors
`break-cycles.mjs:31-33` filters all 93k edges + full Tarjan per candidate inside the `:51-54` loop; dense SCCs (no single-pair cut) try every candidate: measured 30 files/120 pair-deps = 11.8 s, **60/240 = 22.8 s**; campaign on the same graph 25.2 s. Gate-invisible: break-cycles is absent from `bench/all.mjs`'s advisor list and the bench corpus is acyclic by construction.
**Fix:** verify cuts on the SCC-induced file pseudo-graph (an outside router would itself be in the SCC) — prototype byte-identical verdicts, **0.16 s (~144×)**. Subtlety: build pair-witness counts from all four cycle kinds (`STRUCTURAL` omits `ref` while `fileCycles` counts it) so a ref-alive pair survives the cut exactly as today. Add break-cycles + a cyclic corpus to the bench gates. **High / S-M.**

#### #24 · Overlap's LSH spends ~85 % of Signal B building, sorting, and walking ~950k singleton buckets — **PERF** · advisors
`overlap.mjs:248-263`: 64 bands × 15.7k candidates → 1.0 M ~25-char string keys in one Map ending at **948,262 buckets, 99.3 % singletons**; decomposition of the 5.1 s stage: key-build+insert 2,250 ms, sorting 948k keys 1,410 ms, walk ~700 ms — actual jaccard confirmations ≈ 30 ms. Signal C repeats the pattern. Invisible to gates (self-map never engages LSH; the loaded corpus records `stageMs` un-gated).
**Fix:** minimal — sort/visit only multi-occupancy keys (kills the 1.4 s sort). Full — numeric band-hash keys (prototype: **identical candidate pair set**, banding+enum 437+135 ms, ~8×), verifying the row triplet on first-insert collision. Apply to B and C. **High / S-M.**

#### #25 · One refresh permanently kills every sidecar until the next full map — hooks, brief, and find_similar all pay 3–10× for the rest of the session — **PERF** · hooks/advisors *(found independently by two audits)*
`refresh.mjs:63` rewrites graph.json but never regenerates `brief.json`, `index-lite.json`, or `similar-index.json` (only `build-report.mjs:82-88` does), and all three stamp on graph mtime+size. Measured: after one refresh — session-brief 63–70 → 106–127 ms, pre-edit 73–81 → 98–135 ms (@1.2k; the 16k-class fallbacks are 310–350 ms + a subprocess), `find_similar --body` 605 → **1,104 ms** (`index: sidecar→live`). Since auto-refresh fires on the first stale query and the server's INSTRUCTIONS prescribe `codeweb_refresh` after every edit, **every real session loses the sidecar floor within minutes** and never gets it back.
**Fix:** refresh already holds the updated graph — rebuild and atomically write brief + index-lite with the new stamp (pure functions of the graph); regenerate or explicitly delete similar-index (or stamp sidecars against `meta.sources` content hashes so irrelevant rewrites keep them valid). **High / S.**

#### #26 · dup-check shingles the entire pool before its size prefilter can act — ~0.5 s floor per changed symbol in the review gate — **PERF** · advisors
`lib/dup-check.mjs:49-53`: `shingleOf(other)` (file read + tokenize + Set) runs for every pool member *before* the `RATIO_FLOOR` check (sizes are only known after shingling) — prior-#15's precut skips only the jaccard. Measured @15.7k pool: 1 changed = 505 ms, 50 = 2,784 ms; this is `review.mjs:86`, the PR/edit gate, scaling with repo bytes rather than the change.
**Fix:** serve the pool from `similar-index.json` (it stores exact shingle sets *and sizes* for the same predicate): ratio-precut on stored sizes, shingle only survivors, fall back when stale. Resolve the 400-line body-cap asymmetry between the two builders first. **Medium / S-M.**

#### #27 · campaign spawns its three advisors sequentially, each re-parsing the same graph, plus a defensive clone — **PERF** · advisors
`campaign.mjs:36-43`: three sequential `spawnSync`s (optimize/deadcode/break-cycles), each a node boot + independent parse of the 13 MB graph — children 715+415+408 = 1,538 ms of campaign's 2,618 ms @15.7k, graph parsed 4× per run; `lib/campaign.mjs:18`'s `structuredClone` adds 260 ms cloning a graph the caller owns.
**Fix:** spawn the three concurrently (independent readers; wall → ~max(child)); `{clone:false}` hint for owning callers. In-process composition stays the deeper option if the artifact-boundary tradeoff is ever accepted. **Medium / S.**

#### #28 · diff.mjs rename detection does O(removed × added × N) linear scans with indexes already in scope — and goes silent above its cap — **FIX** · advisors
`diff.mjs:74-75` `nOf`/`bodyOf` use `g.nodes.find(...)` inside the removed×added loop while `bIx.byId`/`aIx.byId` sit unused at `:30`; old-node bodies are re-shingled per candidate pair with no line cap. Measured @15.7k: 195 scattered renames = +498 ms. Above the 200-node cap detection is skipped **silently** — pure add/remove churn with no `renamed` note.
**Fix:** use the byId maps; hoist/memoize shingles; cap shingled lines like overlap; say so in the payload when the cap trips. **Low-Med / S.**

### E · MCP server & agent loop

#### #29 · Unhandled EPIPE on child stdin crashes the whole MCP server — a regression introduced by the async conversion — **FIX** · mcp
`mcp-server.mjs:484` — `child.stdin.end(tool.input(args))` with no `'error'` listener. When input exceeds the 64 KB pipe buffer and the child exits before draining (bad graph path, arg-validation `die(2)`, the 120 s SIGKILL), the flush EPIPEs and **Node kills the server**: repro'd with `codeweb_find_similar` + 1 MB `body` + bad graph → exit 1 at 241 ms, request unanswered, all 27 tools dead. Triggers are realistic — find_similar-with-body is the tool the INSTRUCTIONS prescribe *before writing every new function*. The pre-conversion `spawnSync({input})` contained stdin errors; this crash is new.
**Fix:** `child.stdin.on('error', () => {})` + try/catch around `end()`; regression test mirroring the repro. **High / S.**

#### #30 · The refresh→diff ordering the queue comment promises does not hold — diff can gate against the pre-refresh graph — **FIX** · mcp
`mcp-server.mjs:469-473` claims per-workspace serialization keeps "refresh then diff" ordered — but `codeweb_diff` is `graphless: true` (:170), so it queues under `'(graphless)'` while refresh queues under the graph path. Measured: fired together, diff completed at 145 ms *before* refresh (301 ms) — the regression-gate verdict computed against stale bytes (can silently pass a regression or report a phantom no-op). Claude Code parallelizes tool calls routinely, and the server's own INSTRUCTIONS prescribe exactly this pair per edit. Secondary: all diffs across different workspaces serialize with each other through the shared key.
**Fix:** `queueFrom: (a) => a.after` on the tool entry — diff joins the workspace queue its args resolve to. **Medium / S.**

#### #31 · codeweb_map and autoRefresh bypass the per-workspace queue — concurrent pipelines interleave on one workspace — **FIX** · mcp
`handleMap` (:291-328) and `autoRefresh` (:122-144) spawn outside `spawnQueues` (the `refreshInFlight` set and the queue don't know about each other). Measured: two `codeweb_map` on one `out` dir ran fully interleaved, stage by stage. Individual writes are rename-atomic, but the artifact *set* is not transactional — with non-identical args the surviving workspace can mix stage outputs and a `.stages.json` memo from different runs; autoRefresh racing a queued `codeweb_refresh` = two concurrent extracts on one scan cache.
**Fix:** route handleMap through `spawnQueues` keyed by resolved `out`; enqueue autoRefresh on the graph's queue or skip it when that queue tail is non-empty. **Medium / S.**

#### #32 · Read-only spawned tools still head-of-line-block each other per workspace — **PERF** · mcp
`:473-497` chains every spawned tool on one graph onto a single tail promise. Measured: hotspots solo 100 ms; behind risk 203–225 ms ≈ sum, 3/3 runs. Only refresh/annotate (and map, per #31) mutate state; the 12 read-only spawned tools inherit write-ordering they don't need — behind one slow advisor every other spawned tool on that graph queues (the same head-of-line shape prior-#19 fixed for fast-path tools, surviving inside the spawned class).
**Fix:** writer/reader classification on TOOLS entries — writers keep the chain; readers order after any queued writer, then run under a small global concurrency cap (3–4 children). **Medium / M.**

#### #33 · The prescribed per-edit loop is still all-spawn: diff never got its promised cache reuse, and stats spawns a child to read 200 bytes — **PERF** · mcp
Prior-#20's fix text said "diff reuses the cache for the after side" — not implemented: `codeweb_diff` boots node and parses **two** graphs per call (131–136 ms @1.2k; ~500 ms class at 16k), in the refresh+diff sequence the INSTRUCTIONS prescribe per edit. `codeweb_stats` (:234) spawns a child (92–95 ms) to read a ~200-byte stats.json whose lib functions the server already imports for its brief fast path.
**Fix:** stats in-process now (a few lines); hoist diff's comparison into a lib (its structural core already lives in graph-ops), serve `codeweb_diff` from `cachedGraph` for the after side with spawn fallback — after which refresh is the loop's only child. **Medium / M.**

#### #34 · Cancellation is ignored (a wrong codeweb_map burns up to 300 s unstoppable) and JSON-RPC batches hang the client silently — **FIX** · mcp
`handle()` (:506) drops every id-less message, so `notifications/cancelled` is never processed (measured: reply arrives anyway; child runs to completion — up to 300 s for map). A JSON-RPC batch array destructures to `id === undefined` and is dropped with no response — yet the server negotiates protocol `2024-11-05`, where batching is in-spec — a conforming older client hangs forever. Non-object frames are likewise dropped instead of `-32600`.
**Fix:** id→child map; kill + suppress reply on cancel; answer arrays/non-objects with `-32600`. **Low / S.**

### F · Report & editor

#### #35 · The expand-all fix is half-landed: the grid degenerates at its own benchmark, the first frame is an un-preemptable 2.6–3.4 s task, and the committed receipt still claims pre-fix GREEN — **PERF** · report
The prior-#21 fix (uniform grid CUT=220, 8 ms frame budget, sliced reduced-motion) landed and bought a real 6.9× (expand-all sim ≈331 s → 48.4 s @16.8k) — but its "must stay flat under the grid" contract is false at scale: settled cost is **~205 ms/step (12.8× the 16 ms gate)**, growing ~O(n^1.34) as settled cells hold up to 235 nodes (5–9 M pair-checks/step). The first post-expand frame is a **2.6–3.4 s single task** the budget can't preempt (it checks only *between* gSteps) because all ~840 symbols/domain hatch onto a radius-14 circle (:677) then explode to ±185k px. Browser-measured: 3.6 fps for ~15 s, max frame 3,617 ms; reduced-motion "slices" (:697) each run ~205 ms with zero pixels of feedback for the ~50 s settle. Meanwhile `bench/results/report-scale.json` has **no expandAll row** and still says "GREEN at 16k with no fix needed", and the Spec-L metric itself is unstable by construction (it samples the 10 frames straddling the explosion: 508.7 → 116.8 → 36.9 ms/frame across back-to-back calls). Two adversarial results that shape the right fix: the naive completion (velocity clamp + spiral hatch) makes it *worse* (542 ms/step — the explosion was accidentally load-bearing), and density self-adapts to any CUT.
**Fix:** (1) far-field monopole forces from non-adjacent cells (Barnes-Hut-lite, deterministic) so equilibrium spreads and near-field pairs collapse; (2) seed expand-all near equilibrium (golden-spiral, 30–50 px spacing) — then a velocity clamp is safe and the 2.6 s frame disappears; (3) make gStep chunkable so no single step exceeds the budget at any n; (4) re-run report-scale at 16k, gate on settled ms/frame + max single-step ms, and commit the receipt. **High / M.**

#### #36 · 47 % of the shipped report is JSON the template never reads — t3 fingerprints alone are 4.1 MB at 16k — **PERF** · report
`build-report.mjs:103-116` strips meta but embeds every node's `t3` (4.08 MB), `signature` (0.89), `complexity` (0.24), `maxDepth` (0.20) and every edge's `kind` (~0.6) — grep proves the template reads none of them (`domSummary` is built and never used). Measured: slim embed 6.96 vs 13.13 MB (−47 %), JSON.parse 88 → 39 ms, retained heap 27.7 → 11.4 MB; DCL today is 1,047 ms.
**Fix:** extend the existing embed-strip (embedded copy only — graph.json on disk keeps all fields); delete dead `domSummary`. Byte-determinism re-verified unaffected. **High / S.**

#### #37 · The draw loop is the next 400 ms: 10k labels each calling getComputedStyle, 50k per-style bezier strokes, on every pointermove — **PERF** · report
`report-template.html:800` calls `cvColors()` (getComputedStyle + 3 getPropertyValue) *inside the per-node label branch*: measured **16,800 calls per draw, 924k during one 15 s expand-all**. `:796` `showLabel` uses world-space `nd.r > 7.5`, so 10,147 of 16,800 nodes stroke halo text at every zoom (all 16,800 during the anneal). 50,311 edges each get `beginPath`+`quadraticCurveTo`+`stroke` with a fresh style string (:772-786). One fitted draw = 382–439 ms, and pan/wheel call gDraw synchronously per event (:812-814) → **~2.5 fps interaction even after the sim settles and after #35**. With a search term active, gDraw re-runs the full 16.8k lowercase match per frame that `refreshHits` just computed.
**Fix:** hoist cvColors to once per draw (one line, −17k calls/frame); screen-aware label LOD with a per-frame cap (~300); batch edges by quantized style bucket (`lineTo` for weight-1 at low zoom); reuse `refreshHits`. Puts fitted redraws in the tens of ms. **High / M.**

#### #38 · The editor CodeLens re-implements the pre-#9 quadratic blast BFS — 389 ms per file, synchronously on the extension host, per edit — **PERF** · editor
`editor/vscode-codeweb/lens-core.js:29-42` `blastOf` uses `queue.shift()` + a fresh `[...set, ...set]` spread per visited node — the exact pattern prior-#9 measured at 67× and fixed in graph-ops; this copy never got it. Measured @16.8k: one file = **388.6 ms** for 21 lenses, 10 files = 2,818 ms — synchronous in `provideCodeLenses`, and `refresh()` clears graph+memo and re-fires all visible lenses on every graph.json rewrite (i.e. per post-edit hook). Also `activationEvents: ["onStartupFinished"]` activates in every VS Code workspace, .codeweb or not.
**Fix:** pointer-index queue + iterate Sets directly (~15 lines, ~10–40×); keep `blastMemo` across refreshes for unchanged ids; `workspaceContains:**/.codeweb/graph.json` activation. **Medium / S.**

### G · Maintainability

#### #39 · The #24 migration left a second, drifted mini-parser — explain and diff silently swallow unknown flags again — **REFACTOR** · cli
Five scripts still hand-roll flag loops: brief/coverage/stats `die` on unknowns, but **explain.mjs:22 and diff.mjs:24 have no else-branch** — `--jsno` is silently ignored, the drifted-policy class #24 declared ended. `bench-ts-engine.mjs:17-20` still swallows unknown flags into positionals (`--engine` becomes the target path — the original bug shape).
**Fix:** convert the six to parseArgs specs (~6 lines each; the shared loop exists). **Medium / S.**

#### #40 · The extractor orchestrator is still a 968-line script/module hybrid — edge derivation remains untestable in-process, and spawn sites grew — **REFACTOR** · engine
Prior-#25's landed half (pure masking/lang-rules/import-resolve with in-process tests) proves the pattern; the orchestrator still parses argv and exits at import (:54-67), holds run state as module globals (`files`, `nodes`, `byName`, `maskCache`), and keeps `deriveFileEdges` (:685-799), the pub-API walk, and typed-intent resolution inline — with shadowing smells (`rel` fn vs `rel` string; `files` global vs local). Suite `runNode(` sites rose 253 → 276. This is the precondition for #18's in-process extraction and the deep fix for #6.
**Fix:** `createEdgeDeriver({byName, pkgOf, aliasMaps…})` in a lib (import-resolve's factory is the proven template); orchestrator keeps argv/IO/cache plumbing. Track it as the explicit residual of #25 rather than calling #25 done. **Medium / L.**

#### #41 · break-cycles.mjs and diff.mjs still contain literal NUL bytes — two product files are invisible to grep/ripgrep — **CHORE** · repo *(reported by three audits)*
`break-cycles.mjs:38,42,45` and `diff.mjs:44` embed raw `\0` in template-literal key separators; `file`/`grep`/ripgrep classify both as binary (multiple audits' searches hit it this round). The safe idiom is one import away (`graph-ops.mjs:13`; `extract-symbols.mjs:190` uses `'\x00'`). Tracked as a smaller note last round; break-cycles was edited in bfc6b92 yet stayed binary.
**Fix:** replace the 4 raw NULs with `'\x00'`; add the lint test asserting no tracked `.mjs` contains bytes < 0x09. **Medium / S.**

#### #42 · Migration leftovers cluster — **CHORE** · lib/repo
Dead `writeFileSync` imports in overlap/build-report/coverage/refresh (all writes went atomic); `coverage.mjs:47` is the last pretty-printer of graph.json (20.6 vs 13.0 MB, 1.59×); `fragment.json` still pretty-printed for machine-only consumers (22.7 vs 13.5 MB — folds into #19); `cli.mjs:130-136`'s jsdoc stranded above the wrong function; import-resolve's mixed 0/2-space indentation from the verbatim move; `lib/stats.mjs`/`lib/annotations.mjs` are the last plain-`writeFileSync` sidecar writers; `bench/results/scale-typescript.json` still carries pre-fix v0.9.0 numbers (extract 47.4 s) as the committed evidence for the current engine; `trend.mjs` runs the full pipeline (report included) per commit into a fresh workspace, paying ~7 s/commit for artifacts `metrics()` never reads.
**Fix:** drop dead imports; compact writes; move the doc block; re-indent once; atomicWrite the two sidecars; refresh the bench receipt (with #35's re-run); give trend a `--stages through-overlap` path + one reused workspace. **Low / S.**

---

## 4. Smaller verified notes (tracked, not counted)

- **BOM Python files** classify their line-1 `def` as `method` (`﻿` matches `\s`, `/^\S/` fails); **non-ASCII identifiers** truncate to their ASCII prefix (`español` → node `espa`, edges lost) — both repro'd, low-frequency.
- **Dead `spawnSync` import** remains at `mcp-server.mjs:18` after the async conversion.
- `codeweb_callers` with a wrong-*type* `symbol` arg reports "missing required argument" — present-but-wrong-type would read better.
- `staleOnce`'s 1 s TTL can serve one unannotated stale burst immediately after an edit (documented tradeoff, self-corrects).
- `screenshot.mjs` relies on fixed waits (800/3200/2600 ms) — timing-fragile at scale, dev-only.
- MCP `send()` ignores stdout backpressure — a multi-MB `full:true` reply to a slow reader buffers unboundedly (theoretical under the local stdio trust model).
- Treemap and matrix views are healthy at 16.8k (31.6 / 29.2 ms); a11y basics present; no listener leaks found — recorded so the next round doesn't re-audit them.

## 5. Sequence — if only 3 ship first

1. **#2 + #4 + #5 — the gates.** One day of CI work ends releases-without-tests, makes the "24 tools" class of drift self-catching, and stops `npm test` from dirtying tracked docs. This round's headline finding (#1) happened because these were skipped; they are the difference between "the claim was wrong" and "the claim couldn't have shipped wrong."
2. **#9 + #10 + #8 — the map tells the truth again.** The self-map's only two "safe to delete" verdicts are false today, campaign's top action cuts a phantom cycle, and the masker fabricates edges on nested template literals — everything codeweb sells inherits from these. Two are S, one is M, and the regression-fixture pattern to lock them in already exists.
3. **#29 + #25 — the agent loop stays alive and fast.** A one-line EPIPE guard stops the prescribed find_similar-with-body call from being able to kill all 27 tools; regenerating sidecars on refresh returns every hook and find_similar to their floor for the whole session instead of only until the first edit.

One deliberate echo of last round: #22 and #23 (reading-order, break-cycles) are the same shape as the old #9 — advisors with super-linear cores that no bench times. When they land, land their bench rows with them (#22/#23 fixes name this), or the next 76-second advisor will ship invisibly too.
