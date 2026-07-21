# Round-2 WS-D — engine performance (findings #20, #21, #19, #17, #18a)

Parent: `docs/specs/round2-plan.md` (Theme C). Build order: **#20 → #21 → #19 → #17 → #18a** —
smallest/verified first; #19's cache format lands before #17 so name-delta fields ride one format.
**#18b (in-process extraction) is deferred to WS-H** (needs #40): only the sidecar half ships here.

Shared files: `extract-symbols.mjs` is also edited by WS-B/C (before D — start from their landed
truth) and WS-H (after D — keep new logic in cohesive functions so #40 can move them whole);
`lib/masking.mjs` is shared with WS-B (#8/#13/#14/#15): rebase #20 on B-final masking.

Bench corpus for all numbers: `bench/lib/loaded-corpus.mjs` — `writeLoadedCorpus(dir, {files:
800})` = 16.8k syms/800 files (the findings' benchmark), `{files: 1400}` = 29.4k.

## #20 — maskJs throughput (masking.mjs:80-165)

### T-20.1 charCode word-class test (the audit-verified two-line patch)
Files: `scripts/lib/masking.mjs`. Add `isWordCode = (c) => (c>=97&&c<=122)||(c>=65&&c<=90)||
(c>=48&&c<=57)||c===36||c===95` — exactly `[A-Za-z0-9_$]`: a-z 97–122, A-Z 65–90, 0-9 48–57, `$`
36, `_` 95. Use it in `note()` (:93) and `regexCanFollow()`'s `lastSig` test (:97); replace
`scanRegex`'s flag loop `/[a-z]/i` (:109) with 65–90 | 97–122 only.

### T-20.2 span-copy (scan-to-next-special-char)
Files: `scripts/lib/masking.mjs`. Replace the per-char `note(ch); res += ch` loop with runs — scan
to the next *special* char, append the run with one slice. Special sets per state:
- **normal code**: `/`, `"`, `'`, `` ` `` (chars that can open a comment/regex/string/template);
- **`${}` interior** (`exprDepth > 0`): `"`, `'`, `/`, `{`, `}`;
- **template text** (`inTemplate`, `exprDepth === 0`): `` ` ``, `$` — the run is *blanked*
  (`keepValues ? slice : ' '.repeat(len)`), no lastSig/lastWord update (as per-char does today);
- **block comment**: already spanned via `indexOf('*/')` — unchanged.
`keepValues` only switches copy-vs-blank of value spans, never the special sets.
**lastSig/lastWord from the run tail** — must reproduce `note()`'s exact accumulation, including
its across-spaces quirk (`foo bar` → lastWord `foobar`): walk backward from the run end skipping
spaces/tabs; the first other char is the new `lastSig` (none → both unchanged); if non-word,
`lastWord = ''`, else `lastWord` = word chars collected walking further back (skipping spaces/tabs,
stopping at the first other char), prefixed by the incoming `lastWord` if the walk exhausts the run.

### T-20.3 byte-identity property + bench (test-first: land BEFORE T-20.1)
Files: new `tests/maskjs-identity.test.mjs`. Embed the current `maskJs` verbatim as the frozen
reference oracle; assert `maskJs(text) === reference(text)`, both `keepValues` modes, over (a)
**every mask-eligible repo file** (`SRC_RE` js-family — the audit's 874-file check, as a test) and
(b) a `writeLoadedCorpus` tree. Lands green pre-patch, then gates T-20.1/T-20.2;
`maskjs-regex-literals.test.mjs` stays untouched and green.
**Criteria**: ≥ 1.4× MB/s on the 800-file corpus, zero byte diffs (audit: charCode alone
1.50–1.56×; span-copy est. 3–5×). Bench command recorded.

## #21 — enclosing() quadratic scan (extract-symbols.mjs:689, :422)

### T-21.1 innermost-range-per-line precompute
Files: `scripts/extract-symbols.mjs` (`deriveFileEdges`). Replace the per-call linear scan (:689 —
max-`start` range covering the line) with a per-file precompute:
- **Data shape**: `innermost` — array of length `lines.length + 1` (1-indexed), `innermost[l]` =
  the range object covering line `l` with the largest `start`, else `undefined`.
- **Build sweep** (O(lines + R log R)): sort `ranges` by `start` ascending (a copy — ranges order
  is cached/emitted elsewhere); walk `l = 1..lines.length` with a stack: push ranges as `start ===
  l` arrives, lazily pop while `top.end < l` (a popped range never covers a later line), then
  `innermost[l] = top` (stack is start-ascending → top = max start among still-open; an ended
  buried range surfaces later and the lazy pop discards it — the linear scan's exact semantics).
- **Lookup**: `enclosing = (l) => (l <= lines.length && innermost[l]) || null` — O(1). Built once
  at `deriveFileEdges` entry; zero behavior change (`addEdge`/`addResolved` untouched).

### T-21.2 the :422 method-owner hoist
Files: `scripts/extract-symbols.mjs` (node-build loop). The per-method scan at :422 (`kind ===
'class' && start > rg.start && start <= rg.end`, max start wins) runs over ranges-so-far per
symbol. Since `syms` is line-sorted (classes precede their methods), keep a live **open-class
stack** across the loop: push each class range as it lands in `ranges`; per method, pop while
`top.end < s.line`, owner = deepest entry with `rg.start < s.line` (strict, preserving :422's
`start > rg.start` — a class starting on the method's own line never owns it). O(syms) total.

### T-21.3 tests + bench
Files: new `tests/enclosing-index.test.mjs`, bench row.
- **Property**: random range sets (nested, overlapping, adjacent, duplicate starts, empty) × every
  line — precompute lookup equals a reference linear-scan `enclosing` (the old loop, embedded in
  the test); same for the class-owner stack vs the :422 reference scan.
- **Fixture**: big-file — `writeLoadedCorpus(dir, {files: 1, fnsPerFile: 8000})` (the finding's
  shape). Extract before/after the patch: **byte-identical `fragment.json`**; IE suite green.
**Criteria**: big-file extract ≥ 2× faster (finding: 1,446 → ~579 ms class); 800-file corpus ±5 %.

## #19 — warm no-change floor (cache size, fragment write, run.mjs belt)

### T-19.1 edge-tuple interning + drop `syms` — SCANNER_VERSION 14
Files: `scripts/extract-symbols.mjs`. Cache format change, so bump `SCANNER_VERSION` 13 → 14.
- **Interning schema**: per cache-file entry, replace `edges: [{from,to,kind,weight}]` with
  `ids: [...]` (distinct endpoint ids, first-use order) + `edges: [[fromIdx, toIdx, kindIdx]]`,
  `kindIdx` into const `EDGE_KINDS = ['call','ref','inherit','test']` (the closed set the derive
  emits). Encode at record (:825); replay (:816-817) decodes fresh `{from,to,kind,weight:1}` objects.
- **Drop `syms`** (symbols stored 3×: syms+nodes+ranges): remove `syms` from entries and the stamp
  gate (:311). The content-hash-hit path (:360-367) replays cached `nodes`/`ranges` directly (the
  stamp tier's replay, with text already read and a refreshed stamp) **iff `oldCache.rulesSig ===
  rulesSig`** (roles are baked into cached nodes; today's path rebuilds them) — else `scanFile`.
- **Migration**: `:266` discards any cache with `version !== SCANNER_VERSION` — a v13 cache means
  one cold rebuild, never a crash (hook/refresh/run share that reader). Test: plant a v13-shaped
  cache; extract exits 0, cold banner (`scanned N/N`), output byte-equal to no-cache, cache now v14.
**Criteria**: cache ≥ 40 % smaller @16.8k (18.8 → ≤ ~11 MB), shrinking the (a) parse + (c) rewrite terms.

### T-19.2 fragment sha1 skip-write + compact fragment
Files: `scripts/extract-symbols.mjs` (:967). `--out` writes `JSON.stringify(fragment)` — compact,
folding the tracked pretty-print note (22.7 → 13.5 MB; machine-only consumers, all `JSON.parse`).
Before writing: if the out-file exists and its size equals the new string's byte length, compare
sha1 of old bytes vs new — identical → skip the write (⇔ identical bytes, so the determinism
invariant holds), banner gains `(unchanged)`. Stdout path (:968) unchanged.

### T-19.3 per-output content hashes in `.stages.json` (run.mjs corruption belt)
Files: `scripts/run.mjs`, `tests/stage-memo.test.mjs`. Extend the memo record to
`{key, at, outputs: {<name>: {s: byteLen, h: sha1}}}` for all five `STAGE_OUTPUTS`.
- **Hash source**: run.mjs hashes each output's bytes right after the stage run (post-rename, so
  bytes are final), before the memo write.
- **Staleness semantics**: reuse requires `prevKey === memoKey` AND per output: exists + size +
  sha1 match (size gate first — truncation fails without hashing). Any mismatch → recompute all
  stages (all-or-nothing, as today). This *replaces* `graphParses()`'s 167 ms full JSON.parse and
  is stronger (catches valid-JSON tampering). Old-shape `.stages.json` (no `outputs`) → not
  reusable; one recompute upgrades it. `memoKey`'s fragment read+hash (:94-96) stays (a read, not a parse).
**Criteria** (with T-19.2): warm no-change `run.mjs` 1,190 → ≤ ~1,000 ms @16.8k; S1–S3 green, new
S4: a byte-tampered-but-parseable graph.json forces recompute.

### #19 proof — IE property harness
`tests/incremental-edges.test.mjs` must pass unchanged *before* #17 lands (same assertions, new
cache format), and IE-EQUIVALENCE gains a **fragment byte-equality** assertion — warm vs cold
`--out` files compared as buffers (round-1's `cmp` proof; sorted-set compare stays for
diagnostics). This assertion is the shared oracle #17 reuses.

## #17 — name-delta invalidation (the round's riskiest change)

`:645` symbolSig (node-id set + pkg boundaries) gates `reuseEdges` (:809) and `bindSig` (:653-655):
one added export flips both → 800/800 re-derive + full re-read. Replace the wholesale flip with
per-file re-derive on the *name delta*, provably byte-identical.

### T-17.1 candidate collection + cache fields
Files: `scripts/extract-symbols.mjs`. In `deriveFileEdges`, collect the file's **candidate
identifier set** — every `name` passed to `addEdge` (all five regexes' captures), recorded
*before* the `byName.has(name)` gate (pre-byName-filter), excluding only `KEYWORDS` — return it,
and store it per entry as sorted `cand: [...]` (finding: 30–200 names/file). Cache top gains
`pkgSig` = sha1 of the sorted `pkgBoundaries` list (symbolSig mixes it in; the delta needs it
alone). **Storage cost**: ~800 files × ~80 names × ~12 B ≈ 0.5–2 MB JSON (+5–10 % on the post-#19
cache; net vs today still ≥ 35 % smaller). No stored label table — the old run's
label→sorted-def-id map is rebuilt from `oldCache.files[*].nodes`, zero extra bytes.

### T-17.2 delta computation + re-derive rule + kill-switch
Files: `scripts/extract-symbols.mjs`. When `symbolSig` matches → today's path untouched. When it
differs and the delta path is eligible: build old/new `label → sorted def-id list` maps; **dirty
labels** = labels whose lists differ (added/removed label; a rename dirties both old and new; an id
change from file-move/owner-rename/`@line` shift also differs the list). **Re-derive rule**: file
F's cached edges replay iff F's content hash is unchanged AND `cand(F) ∩ dirty = ∅`; else derive.
This covers every byName use: the `has()` gate, the pkg-scoped unique fallback, and **ambiguity
transitions** (0→1, 1→2 unique→ambiguous, 2→1, 1→1′ retarget) — each is a def-list change on that
label, so intersecting files re-derive, including files that only *gain* an `ambiguous++`.
**Transitions that keep the wholesale flip** (delta ineligible): (a) **pkg-boundary changes**
(`pkgSig` moved — `pkgOf` repartitions `inPkg` for *unchanged* def lists, invisible to any label
delta); (b) `fileSig` changed (file add/delete — specifier + `<module>` landscape); (c) old cache
lacks `cand` (migration — additive fields, no version bump); (d) `--full`/`CODEWEB_VERIFY_FRESHNESS`;
(e) **kill-switch `CODEWEB_NAME_DELTA=0`** — forces the wholesale flip for edges *and* binds
(rollback lever; both paths emit identical bytes, only wall-time moves).

### T-17.3 the bindSig analogue
Files: `scripts/extract-symbols.mjs`, `scripts/lib/import-resolve.mjs`. Cached binds embed resolved
ids, gated today by global `bindSig` (:653). Per-file rule — replay F's `bind` iff: stamp/hash
unchanged, `fileSig` + `pkgSig` unchanged, `bindCand(F) ∩ dirty = ∅`, and every rel path in
`bindDeps(F)` has an unchanged content hash. `bindCand` = original imported names; `bindDeps` =
target modules consulted during `bindFileImports` *including re-export hops* (the resolver records
and returns them — default-export/member/kind lookups are all functions of those files' text); both
stored on the bind entry. Ineligible/intersecting → re-bind that file only (lazy `textOf` read).

### T-17.4 property proof (test-first; the workstream's gate)
Files: `tests/incremental-edges.test.mjs`. The generator emits `body`/`addsym`/`addfile`/`delfile`
— it does **not** emit remove- or rename-symbol: extend ops with **`delsym`** (strip one
previously-added function block), **`rensym`** (rename a def — including a colliding rename onto
an existing name, forcing the 1→2 ambiguity transition), and **`pkg`** (add/remove a nested
`package.json`, forcing the wholesale-flip path). Land the extended generator FIRST (green under
wholesale semantics), then the delta under it. IE-EQUIVALENCE asserts sorted node/edge equality
AND warm-vs-cold fragment byte-equality (per #19) at every step. IE-INCREMENTALITY's `edged ==
total` assertion (:80) encodes the old fallback contract — **replace it with a stricter pair**
(not a weakening): add-one-function re-edges only the edited file + candidate-intersecting files
(`edged < total` on a crafted tree where a disjoint file must NOT re-edge) with byte-equality to
cold; plus a `CODEWEB_NAME_DELTA=0` case asserting `edged == total` (kill-switch → wholesale).
**CI criterion: IE-EQUIVALENCE runs at the full 40 trials** — WS-A's #6 split may parallelize,
but trial count/semantics are pinned this round; #17's risk budget is spent here.

### T-17.5 bench evidence
@16.8k: noop, body-edit, **add-one-function** (target ≤ ~1.3× noop: ≤ ~950 ms vs 1,698 today),
delete, rename; @29.4k add-one-function (vs 3,217 ms); hook end-to-end add-one-function (vs
2,534 ms). Commands + `edged N/M` banners recorded in evidence.

## #18a — baseline sidecar for the post-edit hook (#18b → WS-H)

### T-18.1 summary split + sidecar lib
Files: `scripts/lib/graph-ops.mjs`, new `scripts/lib/hook-baseline.mjs`. Split
`structuralRegressions` (:440-452) into `baselineSummary(graph)` → `{cycles: [cycleKey...],
callIn: {id: count}}` (only ids with ≥ 1 caller — what :448 consults) and
`regressionsAgainstSummary(summary, after)`; `structuralRegressions(b, a)` becomes their
composition (one truth, existing tests untouched). Sidecar **`hook-baseline.json`** beside
`graph.json` (the `brief.json` convention): `{version: 1, graph: {s, m, h}, cycles, callIn}` —
size, rounded mtimeMs, sha1 of the summarized graph.json bytes (stamp checked first, hash only on
stamp mismatch). Atomic write.

### T-18.2 write points — map + refresh
Files: `scripts/run.mjs` (after the stage run, and on the reuse path when the sidecar is
missing/stale — one graph parse at map time, amortized) and `scripts/refresh.mjs` (after the
updated graph's `atomicWrite` :63 — graph already in memory, the summary is free). WS-F #25
coordinates here: land D's write first, F rebases.

### T-18.3 hook consumption + fallback
Files: `hooks/post-edit-diff.mjs`. In `check()`: load `hook-baseline.json`; if version + stamp/hash
match the baseline file → `regressionsAgainstSummary(sidecar, after)` — **no baseline `JSON.parse`,
no before-side normalizeGraph/fileCycles/buildIndex** (the ~151 + ~173 ms terms). Missing/stale/
corrupt sidecar → today's path exactly (parse + `structuralRegressions`); fail-open untouched.
BDD scenarios (`tests/post-edit-diff.test.mjs` / `hook-sidecar.test.mjs`): given map → sidecar
exists + stamp-matches; given valid sidecar → verdict equals the legacy path's on the same payload;
given a sidecar with one baseline cycle key removed → that cycle reported as new (proves the
sidecar, not the graph, was consumed); given stale/corrupt sidecar → correct fallback verdict;
given sidecar and graph both corrupt → silent exit 0.
**Criteria**: hook no-change fire < 1.5 s at the 16k class (from 1,624 ms; the sidecar removes
~325 ms — the residual is #18b/WS-H; add that pointer to `hook-fastpath-floor.md`'s revisit triggers).

## Workstream exit bar (plan WS-D)

Add-one-function warm extract @16.8k ≤ ~1.3× noop (byte-identity via IE-EQUIVALENCE, full 40
trials, extended ops); hook no-change < 1.5 s @16k-class; mask ≥ 1.4× byte-identical over repo +
corpus; #21 big-file ≥ 2× with identical fragment — all measured on `writeLoadedCorpus` trees,
commands + shas in `round2-evidence.md`. Risks: #17 carries the kill-switch (`CODEWEB_NAME_DELTA=0`)
and lands as its own commit for clean revert; #19's version bump cold-rebuilds v13 caches by
construction; #18a is fail-open at every new seam.
