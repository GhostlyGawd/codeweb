# Round-2 WS-D — engine performance (findings #20, #21, #19, #17, #18a)

Parent: `docs/specs/round2-plan.md` (Theme C). Build order: **#20 → #21 → #19 → #17 → #18a** — smallest/verified first;
#19's cache format lands before #17 so name-delta fields ride one format. **#18b (in-process extraction) → WS-H** (needs
#40): only the sidecar half ships here. Shared files: `extract-symbols.mjs` is also edited by WS-B/C (before D — start
from their landed truth) and WS-H (after D — keep new logic in cohesive functions so #40 can move them whole);
`lib/masking.mjs` is shared with WS-B (#8/#13/#14/#15): rebase #20 on B-final masking. Bench corpus for all numbers
(`bench/lib/loaded-corpus.mjs`): `writeLoadedCorpus(dir, {files: 800})` = 16.8k syms/800 files; `{files: 1400}` = 29.4k.
**Bench discipline (· hardened): every perf gate is a RATIO of min-of-3 runs, one session, one box (4-core CI class);
absolute ms are evidence, never the gate — sole absolute: the hook's < 1.5 s, `hook-fastpath-floor.md`'s own threshold.**

## #20 — maskJs throughput (masking.mjs:80-165)

### T-20.1 charCode word-class test (the audit-verified two-line patch)
Files: `scripts/lib/masking.mjs`. Add `isWordCode = (c) => (c>=97&&c<=122)||(c>=65&&c<=90)||(c>=48&&c<=57)||c===36||
c===95` — exactly `[A-Za-z0-9_$]`. Use it in `note()` (:93) and `regexCanFollow()`'s `lastSig` test (:97); replace
`scanRegex`'s flag loop `/[a-z]/i` (:109) with 65–90 | 97–122 only.

### T-20.2 span-copy (scan-to-next-special-char)
Files: `scripts/lib/masking.mjs`. Replace the per-char `note(ch); res += ch` loop with runs — scan to the next *special*
char, append the run with one slice. Special sets per state — **normal code**: `/` `"` `'` `` ` `` (openers of
comment/regex/string/template); **`${}` interior** (`exprDepth > 0`): `"` `'` `/` `{` `}`; **template text**
(`inTemplate`, `exprDepth === 0`): `` ` `` `$` — that run is *blanked* (`keepValues ? slice : ' '.repeat(len)`), no
lastSig/lastWord update (as per-char today); **block comment**: already spanned via `indexOf('*/')`, unchanged.
`keepValues` only switches copy-vs-blank of value spans, never the special sets. **lastSig/lastWord from the run tail**
must reproduce `note()`'s exact accumulation, including its across-spaces quirk (`foo bar` → lastWord `foobar`): walk
backward from the run end skipping spaces/tabs; the first other char is the new `lastSig` (none → both unchanged); if
non-word, `lastWord = ''`, else `lastWord` = word chars collected walking further back (skipping spaces/tabs, stopping
at the first other char), prefixed by the incoming `lastWord` if the walk exhausts the run.

### T-20.3 byte-identity property + bench (test-first: land BEFORE T-20.1)
Files: new `tests/maskjs-identity.test.mjs`. Embed the current `maskJs` verbatim as the frozen reference oracle; assert
`maskJs(text) === reference(text)`, both `keepValues` modes, over (a) **every mask-eligible repo file** (`SRC_RE`
js-family — the audit's 874-file check, as a test) and (b) a `writeLoadedCorpus` tree. Lands green pre-patch, then gates
T-20.1/T-20.2; `maskjs-regex-literals.test.mjs` stays untouched and green.
**Criteria**: ≥ 1.4× MB/s on the 800-file corpus, zero byte diffs (audit: charCode alone 1.50–1.56×; span-copy est.
3–5×). Byte-identity ⇒ NO `SCANNER_VERSION` bump for #20 — the oracle is the proof; T-19.1's ladder rule owns any
future non-identical mask change. · hardened

## #21 — enclosing() quadratic scan (extract-symbols.mjs:689, :422)

### T-21.1 innermost-range-per-line precompute
Files: `scripts/extract-symbols.mjs` (`deriveFileEdges`). Replace the per-call linear scan (:689 — max-`start` range
covering the line) with a per-file precompute. **Data shape**: `innermost` — array of length `lines.length + 1`
(1-indexed), `innermost[l]` = the range covering line `l` with the largest `start`, else `undefined`. **Build sweep**
(O(lines + R log R)): sort `ranges` by `start` ascending (a copy — ranges order is cached/emitted elsewhere); walk
`l = 1..lines.length` with a stack: push ranges as `start === l` arrives, lazily pop while `top.end < l` (a popped
range never covers a later line), then `innermost[l] = top` (stack is start-ascending → top = max start among
still-open; an ended buried range surfaces later and the lazy pop discards it — the linear scan's exact semantics).
**Lookup**: `enclosing = (l) => (l <= lines.length && innermost[l]) || null` — O(1). Built once at `deriveFileEdges`
entry; zero behavior change (`addEdge`/`addResolved` untouched).

### T-21.2 the :422 method-owner hoist
Files: `scripts/extract-symbols.mjs` (node-build loop). The per-method scan at :422 (`kind === 'class' && start >
rg.start && start <= rg.end`, max start wins) runs over ranges-so-far per symbol. Since `syms` is line-sorted (classes
precede their methods), keep a live **open-class stack** across the loop: push each class range as it lands in
`ranges`; per method, pop while `top.end < s.line`, owner = deepest entry with `rg.start < s.line` (strict, preserving
:422's `start > rg.start` — a class starting on the method's own line never owns it). O(syms) total.

### T-21.3 tests + bench
Files: new `tests/enclosing-index.test.mjs`, bench row. **Property**: random range sets (nested, overlapping,
adjacent, duplicate starts, empty) × every line — precompute lookup equals a reference linear-scan `enclosing` (the
old loop, embedded in the test); same for the class-owner stack vs the :422 reference scan. **Fixture**: big-file —
`writeLoadedCorpus(dir, {files: 1, fnsPerFile: 8000})` (the finding's shape); extract before/after the patch:
**byte-identical `fragment.json`**; IE suite green.
**Criteria**: big-file extract ≥ 2× (min-of-3; finding: 1,446 → ~579 ms class); 800-file corpus ±5 %.

## #19 — warm no-change floor (cache size, fragment write, run.mjs belt)

### T-19.1 edge-tuple interning + drop `syms` — SCANNER_VERSION ladder · hardened
Files: `scripts/extract-symbols.mjs`. Cache format change ⇒ bump `SCANNER_VERSION` (:45, read-gated :266). **One
ladder, not two**: ws-c.md's planned `rev: 'ws-c-1'` rests on a false premise — the cache IS version-stamped today.
Orchestrator: WS-C bumps 13→14 *instead of* adding `rev` (amend round2-ws-c.md); D bumps whatever C landed +1 (14→15).
Standing rule: any cache-format OR masking/derivation-semantics change bumps this one constant (v13 precedent).
- **Interning schema**: per cache-file entry, replace `edges: [{from,to,kind,weight}]` with `ids: [...]` (distinct
  endpoint ids, first-use order) + `edges: [[fromIdx, toIdx, kindIdx]]`, `kindIdx` into const `EDGE_KINDS =
  ['call','ref','inherit','test']` (the closed set the derive emits). Encode at record (:825); replay (:816-817)
  decodes fresh `{from,to,kind,weight:1}` objects.
- **Drop `syms`** (symbols stored 3×: syms+nodes+ranges): remove `syms` from entries and from the :311 stamp-gate
  conjuncts. The content-hash-hit path (:360-367) replays the FULL stamp-tier product set — nodes/ranges/dyn/ast
  dispatch/typed intents, entry carried forward as at :331 — with text read and a refreshed stamp, **iff
  `oldCache.rulesSig === rulesSig`** (roles baked into cached nodes) and :312's ast/cx conjuncts hold — else `scanFile`. · hardened
- **Migration**: `:266` discards any version mismatch — a v13/v14 cache means one cold rebuild, never a crash. Test:
  plant an old-shape cache; extract exits 0, cold banner (`scanned N/N`), output byte-equal to no-cache, cache at new version.
**Criteria**: cache ≥ 40 % smaller @16.8k (18.8 → ≤ ~11 MB), shrinking the parse + rewrite terms.

### T-19.2 fragment sha1 skip-write + compact fragment · hardened
Files: `scripts/extract-symbols.mjs` (:967). `--out` writes `JSON.stringify(fragment)` — compact, folding the tracked
pretty-print note (22.7 → 13.5 MB). Consumer audit (· hardened): all fragment readers `JSON.parse`; the hook already
receives compact stdout (:968, unchanged); run.mjs memoKey hashes raw bytes → exactly one stage recompute on the first
post-upgrade run, then stable; no test/receipt pins pretty bytes; IE's `edged N/M` regex tolerates a banner tail.
Skip-write: out-file exists ∧ sizes equal ∧ sha1 old === sha1 new → skip (⇔ identical bytes — determinism invariant
holds), banner gains `(unchanged)`. Stdout path unchanged.

### T-19.3 per-output content hashes in `.stages.json` (run.mjs corruption belt) · hardened
Files: `scripts/run.mjs`, `tests/stage-memo.test.mjs`. Memo record → `{key, at, outputs: {<name>: {s: byteLen, h:
sha1}}}` for all five `STAGE_OUTPUTS`, hashed from each output's bytes right after the stage run (post-rename, bytes
final), before the memo write.
- **Staleness/corruption matrix (complete · hardened)** — reuse requires `prevKey === memoKey` AND per output exists +
  size + sha1 (size first; truncation never hashes); any miss → recompute all (all-or-nothing, as today). Cells: memo
  absent/corrupt/old-shape (no `outputs`) → recompute, one run upgrades; output missing → exists; truncated → size;
  tampered — parseable or NOT — → sha (replaces `graphParses()`'s 167 ms parse AND extends cover: the old belt guarded
  only graph.json, the other four had none); crash between output rename and memo write → key/hash mismatch → recompute.
- **`SOURCE_DATE_EPOCH` (· hardened)**: append it (when set) to the lever string (:91-93) — else a changed epoch reuses
  old-epoch bytes and the hashes fossilize that; `generatedAt` rides the hashed bytes (reuse semantics unchanged).
- `memoKey`'s fragment read+hash (:94-96) stays (a read, not a parse); the 5-output read-back must cost less than the
  parse it replaces — the bench row records both numbers.
**Criteria** (with T-19.2): warm no-change `run.mjs` 1,190 → ≤ ~1,000 ms @16.8k; S1–S4 green untouched (**S4 = lever
change ALREADY EXISTS**, stage-memo.test.mjs:82 — the tamper case lands as **S5**: byte-tampered-but-parseable
graph.json forces recompute; S6: tampered report.md ditto).

### #19 proof — IE property harness
`tests/incremental-edges.test.mjs` must pass unchanged *before* #17 lands (same assertions, new cache format), and
IE-EQUIVALENCE gains a **fragment byte-equality** assertion — warm vs cold `--out` files compared as buffers
(sorted-set compare stays for diagnostics). This assertion is the shared oracle #17 reuses.

## #17 — name-delta invalidation (the round's riskiest change)

`:645` symbolSig (node-id set + pkg boundaries) gates `reuseEdges` (:809) and `bindSig` (:653-655): one added export
flips both → 800/800 re-derive + full re-read. Replace with per-file re-derive on the *name delta*, provably
byte-identical. **Dirty domain (· hardened)**: labels = `byName`'s keys = `n.label` (bare method names — :531-532);
old map rebuilt from `oldCache.files[*].nodes`, new from live nodes, both at the :645 point — module nodes are not yet
pushed on either side and cached entry nodes never contain them: the two domains match by construction.

### T-17.1 candidate collection + cache fields · hardened
Files: `scripts/extract-symbols.mjs`. Collect the file's **candidate set**: every `name` reaching `addEdge`, recorded
INSIDE it after the `KEYWORDS` return and *before* the `aliased`/`byName` gate (:696-698) — alias locals and decl-line
self-captures included; qualified-name regexes contribute exactly what addEdge receives (csBase/pyBases pass the split
tail). Collected from the SAME masked lines the edges derive from, so cand and edges cannot skew across mask versions
(#20's oracle + T-19.1's ladder own mask evolution). Store per entry as sorted `cand: [...]` (30–200 names/file); cache
top gains `pkgSig` = sha1(sorted `pkgBoundaries`). Storage ≈ 0.5–2 MB (+5–10 % on the post-#19 cache; net vs today
still ≥ 35 % smaller). No stored label table — the old label→sorted-def-id map rebuilds from `oldCache.files[*].nodes`.

### T-17.2 delta computation + re-derive rule + kill-switch · hardened
Files: `scripts/extract-symbols.mjs`. `symbolSig` match → today's path untouched. Else, when the delta path is
eligible: **dirty labels** = labels whose sorted def-id lists differ (added/removed label; a rename dirties BOTH old
and new — bidirectional by construction; an owner-rename/`@line`-shift/file-move id change also differs the list).
**Re-derive rule — three conjuncts; the third is the hardening**: F's cached edges replay iff F's content hash is
unchanged AND `cand(F) ∩ dirty = ∅` AND **F's bind replayed this run (T-17.3's rule held)**. The pair alone is unsound:
(i) `import { foo as bar }` — cand holds `bar`, dirty holds `foo`; a moved/deleted `foo` replays a stale embedded id;
(ii) member calls `u.merge()` never reach addEdge (:767-789 `continue`) — `merge` added to the aliased target never
intersects. The bind loop precedes the edge loop (flag available); no-import files hold vacuously (empty deps/cand).
The rule covers every byName use: the `has()` gate, the pkg-scoped unique fallback, and **ambiguity transitions**
(0→1, 1→2 unique→ambiguous, 2→1, 1→1′ retarget) — each is a def-list change on that label, so intersecting files
re-derive, including files that only *gain* an `ambiguous++`.
**Wholesale-flip transitions (delta ineligible)**: (a) **pkg-boundary changes** (`pkgSig` moved — `pkgOf` repartitions
`inPkg` with zero label delta); (b) `fileSig` changed (add/delete — specifier + `<module>` landscape); (c) old cache
lacks `cand`/bind fields (migration — additive, no extra bump); (d) `--full`/`CODEWEB_VERIFY_FRESHNESS`; (e) **·
hardened: any CHANGED file whose JS re-export table (cached `entry.rex`) or Py from-import table (recomputed from
old+new masked text, changed files only) differs** — forwarding flips (`export { shared } from './util2.js'`) retarget
OTHER files' chains with zero label delta, and Py chains are also walked at EDGE time via `resolveFileMember`, invisible
to deep consumers' cand and bindDeps; (f) **kill-switch `CODEWEB_NAME_DELTA=0`** — wholesale for edges *and* binds
(rollback lever; both paths emit identical bytes, only wall-time moves).

### T-17.3 the bindSig analogue — resolver API change owned here · hardened
Files: `scripts/extract-symbols.mjs`, `scripts/lib/import-resolve.mjs`. Cached binds embed resolved ids (:653).
Per-file rule — replay F's `bind` iff: stamp/hash unchanged, `fileSig` + `pkgSig` unchanged, `bindCand(F) ∩ dirty = ∅`,
and every rel path in `bindDeps(F)` has an unchanged content hash. **`bindFileImports` returns `{amap, nsmap, classmap,
edges}` today (import-resolve.mjs:224-310) — no deps are recorded; this task ADDS that API**: thread a `deps` Set
through resolveImport / resolveReExport / the py re-export walk and return it — every RESOLVED target file
(named/ns/default/class/side; ns targets included even though bind only existence-checks them, because `deriveFileEdges`
later resolves members against their live symbol tables), plus every file VISITED by `resolveReExport` (its cycle-guard
`seen` walk, dead ends included) and by `pyReExportResolve`/`pyReExportTableOf`. `bindCand` = original imported names.
Both stored on the bind entry. Ineligible/intersecting → re-bind that file only (lazy `textOf` read).

### T-17.4 property proof (test-first; the workstream's gate) · hardened
Files: `tests/incremental-edges.test.mjs`. Extend generator ops (`body`/`addsym`/`addfile`/`delfile` today) with
**`delsym`** (strip one added function), **`rensym`** (rename a def — incl. a colliding rename onto an existing name,
forcing 1→2), **`pkg`** (add/remove a nested `package.json` → pkgSig wholesale), and **`rex`** (add/flip an `export
{ x } from` barrel — proves ineligibility (e)). Land the extended generator FIRST (green under wholesale semantics),
then the delta under it. `addfile`/`delfile` flip fileSig → those steps stay wholesale by design; only addsym/delsym/
rensym-class steps may show `edged < total`. IE-EQUIVALENCE asserts sorted node/edge equality AND warm-vs-cold
fragment byte-equality (per #19) at every step.
**IE-INCREMENTALITY adjudication (:80 `edged == total`; the plan forbids weakening)**: that assertion pins the
wholesale MECHANISM, not the user-visible guarantee. Verdict — replacement is accepted ONLY as this strict superset:
(1) a `CODEWEB_NAME_DELTA=0` leg re-runs the SAME scenario (BASE tree, the same add-`a3` step) keeping the :80
assertion **verbatim**; (2) the default-env leg replaces it with strictly stronger checks — add-one-function re-edges
the edited file plus candidate-intersecting files while a crafted disjoint file does NOT re-edge (`edged < total`),
byte-equal to cold. Nothing is deleted; one assertion moves under the env that pins its semantics, scenario intact.
Plus a bind-coupling witness the corpus can't give: `rensym` of an IMPORTED name (BASE's `a1`) must re-edge `c.js`.
**CI criterion: IE-EQUIVALENCE runs at the full 40 trials** — WS-A's #6 split may parallelize, but trial
count/semantics are pinned this round; #17's risk budget is spent here.

### T-17.5 bench evidence · hardened
@16.8k (min-of-3 ratios per header): noop, body-edit, **add-one-unique-function** (gate ≤ ~1.3× same-session noop; the
~950 ms absolute recorded, not gated), **add-colliding-function** (`anchor0` — honesty row: mass cand intersection,
near-wholesale expected, recorded, no gate), delete, rename; @29.4k add-one-function; hook end-to-end add-one-function.
Caveat (· hardened): `loaded-corpus` emits NO import statements — bindDeps is empty everywhere, so the bench exercises
only the bare-name path; bind-coupling correctness evidence is IE's (T-17.4). Commands + `edged N/M` banners in evidence.

## #18a — baseline sidecar for the post-edit hook (#18b → WS-H)

### T-18.1 summary split + sidecar lib · hardened
Files: `scripts/lib/graph-ops.mjs`, new `scripts/lib/hook-baseline.mjs`. Split `structuralRegressions` (:440-452) into
`baselineSummary(graph)` → `{cycles: [cycleKey...], callIn: {id: count}}` (only ids with ≥ 1 caller — what :448
consults; computed on the `normalizeGraph`'d graph so cycle keys match the composition) and `regressionsAgainstSummary(
summary, after)`; `structuralRegressions(b, a)` becomes their composition (one truth, existing tests untouched).
Sidecar **`hook-baseline.json`** beside `graph.json` (the `brief.json` convention): `{version: 1, graph: {s, m, h},
cycles, callIn}` — size, rounded mtimeMs, sha1 of graph.json's bytes; stamp checked first, sha1 only on stamp mismatch
(an identical-bytes rewrite re-validates via `h`). Atomic write.

### T-18.2 write points — map + refresh · hardened
Files: `scripts/run.mjs` (after the stage run; on the reuse path only when the sidecar is missing/stale — one graph
parse, amortized) and `scripts/refresh.mjs` (after :63's `atomicWrite`: `h`/`s` from the in-memory JSON string just
written — free — `m` from a post-rename stat). Both writes best-effort try/catch — a sidecar failure must never fail a
map/refresh. WS-F #25 coordinates here: land D's write first, F rebases.

### T-18.3 hook consumption + fallback — full seam matrix · hardened
Files: `hooks/post-edit-diff.mjs`. In `check()`: load sidecar; version + stamp/hash match →
`regressionsAgainstSummary(sidecar, after)` — no baseline `JSON.parse`, no before-side normalizeGraph/fileCycles/
buildIndex (the ~151 + ~173 ms terms). Seam matrix: graph.json MISSING → `findTarget` (cli.mjs:182) already returns
null — hook inert before any sidecar read (no new seam); sidecar missing/stale/corrupt × graph valid → today's path
exactly (share the bytes read for the hash check with the fallback parse — one read); sidecar valid × graph tampered
under a matching stamp → sidecar consumed — CORRECT: it snapshots map-time truth where today's path would parse the
tampered baseline; sidecar valid × graph corrupt with stamp mismatch → fallback → parse fails → null; **both corrupt
→ silent exit 0 — right for the contract**: hooks.json registers an advisory PostToolUse hook, always exit 0,
`additionalContext` only on a finding (:79-88) — silence IS today's fail-open. Stats bumps (:72-76) live outside
`check()` — keep them firing on every path. BDD (`tests/post-edit-diff.test.mjs` / `hook-sidecar.test.mjs`): given map
→ sidecar exists + stamp-matches; valid sidecar → verdict equals the legacy path's on the same payload; sidecar with
one baseline cycle key removed → that cycle reported as new (proves the sidecar, not the graph, was consumed);
stale/corrupt sidecar → correct fallback verdict; both corrupt → silent exit 0.
**Criteria**: hook no-change fire < 1.5 s at the 16k class (from 1,624 ms; the sidecar removes ~325 ms — the residual
is #18b/WS-H; add that pointer to `hook-fastpath-floor.md`'s revisit triggers).

## Workstream exit bar (plan WS-D)

Add-one-function warm extract @16.8k ≤ ~1.3× noop (byte-identity via IE-EQUIVALENCE, full 40 trials, extended ops
incl. `rex`/`pkg`); hook no-change < 1.5 s @16k-class; mask ≥ 1.4× byte-identical over repo + corpus; #21 big-file
≥ 2× with identical fragment — all min-of-3 ratios on `writeLoadedCorpus` trees, commands + shas in `round2-evidence.md`.
Risks: #17 carries the kill-switch (`CODEWEB_NAME_DELTA=0`) and lands as its own commit for clean revert; the version
ladder (C 13→14, D 14→15) cold-rebuilds stale caches by construction; #18a is fail-open at every new seam, both write
points try/catch.
