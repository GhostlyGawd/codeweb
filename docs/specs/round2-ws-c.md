# WS-C spec — resolution truth (#11, #10, #16)

Build order: **#11 → #10 → #16**. #11 is isolated (import-resolve + one mirrored list); #10 rewrites ref/fallback
semantics in `deriveFileEdges`; #16 is a one-line scope fix in overlap. All numbers below re-measured on this tree
(self-extract: 1,214 symbols, 4,345 edges, 1,121 ref edges; fixture counts from `--out` fragments).

Standing rules: TDD (failing test lands in the same commit, first); never weaken an existing assertion; determinism
(`SOURCE_DATE_EPOCH` byte-identity) holds for every artifact writer touched.

**Cache invalidation (both #11 and #10 change derivation) · hardened:** the original premise here was wrong —
`.scan-cache.json` ALREADY has a version stamp: `SCANNER_VERSION = 13` (extract-symbols.mjs:45), checked at :266
(mismatch ⇒ cache discarded, cold rebuild). No new `rev` field: **bump `SCANNER_VERSION` 14 → 15** once for the
workstream (else a warm cache replays pre-fix rex tables (`rexReuse`, fileSig-only), bindings (`bindSig`), edges
(`symbolSig`)). **Ladder (orchestrator-reconciled, monotonic by build order):** WS-B T-0 takes 13 → **14**
(mask/lexing changes land first); this workstream takes 14 → **15**; round2-ws-d.md T-19.1 takes 15 → **16**
(orchestrator edits WS-D post-review). IE-EQUIVALENCE unaffected (same version both sides of every comparison).

## #11 — NodeNext `.js` specifiers can't reach `.ts/.tsx` sources

### T-11.1 — failing recall fixtures (tests/import-nodenext.test.mjs)
One fixture package per case, `writeTree` + `runNode(script('extract-symbols.mjs'), [dir,'--no-ctags','--out',…])`
+ `hasEdge` (pattern: tests/reference-edges.test.mjs). All fail today (resolveImport returns null → alias miss →
bare-name path ambiguous/absent).
- **i1 ext-remap disambiguation** — `src/x-parse.ts`: `export function parse(s: string) { return s.trim(); }`;
  `src/y-parse.ts`: second `export function parse(...)`; `src/main.ts`: `import { parse } from './x-parse.js';`
  `export function run(s: string) { return parse(s); }`. Expect call `src/main.ts:run → src/x-parse.ts:parse`,
  0 ambiguous-dropped.
- **i2 namespace member** — `src/util.ts`: `export function merge(a, b) { return b; }`; `src/app.ts`:
  `import * as u from './util.js';` `export function boot() { return u.merge(1, 2); }`. Expect call
  `src/app.ts:boot → src/util.ts:merge` (nsmap no longer empty).
- **i3 re-export chain** — `src/util.ts`: `export function shared() { return 1; }`; `src/index.ts`:
  `export { shared } from './util.js';`; `src/consumer.ts`: `import { shared } from './index.js';`
  `export function use() { return shared(); }`. Expect call `src/consumer.ts:use → src/util.ts:shared` and the
  barrel dependent edge `src/index.ts:<module> → src/util.ts:shared`.
- **i4 mts/cts + index candidates** — `src/helper.mts`: `export function help() { return 1; }`; `src/lib/index.tsx`:
  `export function widget() { return 2; }`; `src/page.mts`: `import { help } from './helper.mjs'; import { widget }
  from './lib/index.js'; import { widget as w2 } from './lib'; export function draw() { return help() + widget(); }`.
  Expect `draw → helper.mts:help` and `draw → lib/index.tsx:widget` (`.mjs→.mts`, `.js→[.ts,.tsx]`, `/index.tsx`).
- **i5 pub-walk mirror** — package.json `{"name":"p","main":"./src/index.js"}` with only `src/index.ts` on disk
  (`export function api() { return 1; }`). Expect node `src/index.ts:api` has `pub: true`.
- **i6 both-exist precedence · hardened** — `src/dual.js` AND `src/dual.ts` each `export function f()`; `src/main.ts`
  imports `'./dual.js'` + calls. Expect the edge into `src/dual.js:f`, NONE into `src/dual.ts:f` (rule in T-11.2).

### T-11.2 — shared candidate list + retry table (scripts/lib/import-resolve.mjs)
Export from import-resolve (decision: **yes, extract** — extract-symbols already imports this module, so one exported
helper is free and the two lists provably can't drift; today the pub-walk copy at extract-symbols.mjs:602 is already
missing `.tsx/.jsx/index.mjs`):
- `export const EXT_REMAP = { '.js': ['.ts', '.tsx'], '.mjs': ['.mts'], '.cjs': ['.cts'], '.jsx': ['.tsx'] };`
- `export function importCandidates(base)` returning, in order: `base`; `base + e` for the existing direct exts
  (`.js .mjs .cjs .ts .tsx .jsx`); **remaps** — for each EXT_REMAP key `base` ends with, `base` with the suffix
  replaced by each mapped ext; then index candidates on `base.replace(/\/+$/,'')`:
  `/index.js /index.ts /index.mjs /index.tsx /index.jsx /index.cjs /index.mts /index.cts`.
  Existing candidates keep their exact relative order (byte-identity on current corpora); new entries only append
  after the group they extend. `resolveImport` (:41) becomes `for (const c of importCandidates(r)) if (relSet.has(c))
  return c;`. Direct exts stay before remaps: an on-disk `x.js` still wins over `x.ts`.
  **Both-exist rule · hardened:** tsc under node16/nodenext does the OPPOSITE — it probes substituted `x.ts`/`x.tsx`/
  `x.d.ts` BEFORE the literal `x.js` (presuming `.js` is its own emit; never claim "TS prefers the literal file").
  codeweb deliberately diverges: **the literal on-disk file wins** — Node runtime semantics, and remaps stay pure
  recall additions (no currently-resolving specifier can flip target), which is what lets criterion 1's byte-identity
  claim hold at full strength. Documented divergence, pinned by i6; within a key, tsc's order (`.ts` before `.tsx`).
  **Helper scope · hardened:** `importCandidates` returns candidate STRINGS only; membership stays caller-owned
  (`relSet.has(c)` :535 vs pub-walk `norm` + `sources[norm]` :604, spanning all statted files :315/:353), and
  addEntry keeps its `.d.ts`/`.json` skip + `./` strip. Sites share the LIST, not the lookup; today's lists differ
  only by the pub-walk's missing `.tsx/.jsx//index.mjs` (verified — no dir-set drift).

### T-11.3 — mirror in the pub-entrypoint walk (scripts/extract-symbols.mjs:599-606)
`addEntry` iterates `importCandidates(base)` with its existing `norm = cand.replace(/\/{2,}/g,'/')` +
`sources[norm]` membership. Behavior superset note: pub-walk gains `.tsx/.jsx` before index candidates — a package
whose main names `x` with both `x.tsx` and `x/index.js` present now prefers `x.tsx` (matches TS resolution; assert
nothing regresses in tests/package-shape.test.mjs and the pub assertions in extract-v7).

## #10 — bare-ref magnets: decl-line refs + role-blind unique-global fallback

Measured today (self-map): 1,121 ref edges; **234 target 8 symbols of ≤2 chars** (`g`×74, `f`×52, `p`×51, `d`×38,
`w`×11, `q`×4, `G`×3, `C`×1 — all test/bench); **193 product→non-product ref edges** (plus 2 calls, out of ref
scope — record them in evidence). Fabrication source is parameters: decl lines (`function metrics(g) {`) and body
uses of params. Only **4 product symbols have ≤2-char labels** (`bench.mjs:kb`, `graph-ops.mjs:pk`, `overlap.mjs:cv`,
`run.mjs:S`) and every current in-edge to them resolves same-file, never via the bare fallback.

### T-10.1 — failing fixtures + property test
- tests/extract-refscope.test.mjs (new), fixtures inline: **(a) decl-line magnet** — `src/prod.mjs`:
  `export function metrics(g) {\n  return g;\n}`; `tests/util.test.mjs`: `export function g() { return 1; }`.
  Today fabricates ref `src/prod.mjs:metrics → tests/util.test.mjs:g`; expect absent. **(b) body param shadow** —
  `src/a.mjs`: `export function walk(rel) {\n  return probe(rel);\n}`; `src/b.mjs`: `export function rel() { return 0; }`.
  Expect no `walk → src/b.mjs:rel` ref. **(c) short-name guard** — `src/c.mjs`: `export function h(q) {\n  return probe(q);\n}`
  spelled so `q` is NOT in c's param list… use `src/c.mjs`: `export function h() {\n  return probe(q);\n}` with
  `src/q.mjs`: `export function q() { return 0; }` — a free-floating 1-char bare ref; expect dropped by the guard.
  **(a-inv) test→product survives · hardened** — mirror of (a): `tests/t.test.mjs` body-line `return metrics(1);`
  against product `src/prod.mjs:metrics`; expect the edge PRESENT, relabeled kind `test` (:721) — the gate is
  one-directional; test→product feeds graph-ops `testIn` (F4 coverage, graph-ops.mjs:118) and is never gated.
  **(d) param named like a called sibling · hardened** — `src/f.mjs`: `export function f(map) {\n  return map();\n}`
  + `export function h() {\n  return map();\n}`; `src/map.mjs`: `export function map() { return 0; }`. Expect NO
  `f → map` edge, YES `h → map` (positive control — suppression is per-binding, not per-name-per-file).
- tests/self-map-roles.test.mjs (new, the claimed **property test**): extract the repo root (`--no-ctags`), assert
  for every `kind==='ref'` edge: `roleOf(fromFile)==='product' ⇒ roleOf(toFile)==='product'`, modulo an exported
  `ALLOWLIST = []` (grows only with a justifying comment). ~4-5 s; single test, runs concurrently. Expect ~0
  violations post-fix (193 today).

### T-10.2 — signature-line + continuation ref-scan skip (deriveFileEdges, :747-797 loop)
Skip `refRe` on line `i` when `i+1` is the **start line of any range** (the decl line — not just when the matched
name equals the caller, which is all :700 guards). Multi-line signatures: `parseSignature` returns `null` when the
param list spills (lang-rules.mjs:284) — so on a decl line, if the param `(` opened at/after the name never balances
on that line, enter continuation mode: keep skipping `refRe` (and keep collecting param tokens, T-10.4) on following
lines until cumulative paren balance ≤ 0. `callRe`/inherit/instanceof scans are untouched. Accepted recall loss:
a ref argument inside a single-line decl+body (`const f = () => emit(handler)`) — decl lines are where the 24%
fabrication lives; tests/reference-edges.test.mjs refs sit on body lines and stay green.

### T-10.3 — role-gate the unique-global fallback, ref kinds (addEdge, :704-719)
**Reject-form, not filter-form**: after `inPkg.length === 1`, if `kind === 'ref'` and `roleFor(r) === 'product'`
and `roleFor(idFile(inPkg[0])) !== 'product'` ⇒ `ambiguous++; return`. Measured trap forbidding filter-form,
verified on-tree (· hardened): `byName['rel']` = exactly {extract-symbols.mjs:105 (product),
tests/lang-rules.test.mjs:96 (test)}, one root package — today: 2 defs ⇒ ambiguous-drop; filter-form: 1 product def
⇒ fabricated product→product edge; reject-form: 2 ⇒ drop stands. Role source is `roleFor` (roleOf + rules-file
overrides, extract-symbols.mjs:78) — the same truth stamped on nodes — not :721's `isTestFile`; :721 (test→product
relabels `test`) is unchanged, this gate is its missing mirror. The asymmetry is BY CONSTRUCTION (· hardened):
never add the mirror gate on test/bench→product — those edges become kind `test` and power testIn/coverage
(graph-ops.mjs:118; deadcode excludes them from `hasIncoming` deliberately); fixture (a-inv) pins that direction.

### T-10.4 — param-shadow suppression + ≥3-char guard + cache version bump
The three named mechanisms alone do NOT make T-10.5 safe (verified against the fragment): restoring `textOf`/
`maskedOnce` in import-resolve makes body calls hit the unique-global fallback → false product→product **call**
edges re-closing the extract-symbols cycle. So:
- **Param shadow**: per range, once per file, `parseSignature(lines[rg.start-1], rg.name, isPy)` → token-sweep
  `sig.raw` with `/[A-Za-z_$][\w$]*/g` into `rg.params` (destructured `{ rel: relPathOf }` contributes both tokens —
  over-suppression is precision-safe); continuation lines from T-10.2 sweep too. In `addEdge`, on the fallback path
  only (alias/same-file already missed): if any range containing the line has `name` in its params ⇒
  `ambiguous++; return`. Kills body-use magnets for calls AND refs; alias/same-file resolution untouched.
  **Precise rule · hardened:** suppress a bare `name` — `callRe` and `refRe` hits equally — iff it is token-bound
  by the signature of ANY enclosing range. That is shadowing semantics, correct by construction, not a precision
  trade: a bare use under a binding IS the binding; a call through a param (`function f(map) { map(); }`) invokes
  the param's value, never the global (`globalThis.map` is member access, already skipped). Fixture (d) pins both
  directions. Over-collection in `sig.raw` (destructure keys, default-value exprs, TS annotations) suppresses only
  fallback edges — accepted. Verified on-tree: parseSignature's `raw` is the full paren interior (lang-rules:285),
  so the restored `createImportResolver({ rel, …, textOf, maskedOnce, … })` destructure sweeps all three names;
  nested const-arrows (cli.mjs `linesOf`) are ranges themselves (lang-rules:162 permits indent) — their sigs bind.
- **≥3-char guard: ADOPT** for the bare fallback (both kinds). Measured cost: the 4 short product symbols above
  have zero cross-file bare-fallback in-edges — nothing legitimate is lost; revisit only if a recall suite ever
  shows a real 1-2-char cross-file bare call (none exist; Ruby caveat noted in the test). **Not silent · hardened:**
  a FUTURE 1–2-char product symbol bare-called cross-file is dropped by this guard — count those drops in a distinct
  `shortDropped` surfaced in the stderr banner (`dropped K ambiguous (S short-name)`; stdout-flush greps presence
  only, format extension safe); fixture (c) asserts S ≥ 1; document the guard in the precision-gate comment.
- Cache invalidation = `SCANNER_VERSION` 14 → 15 (header note · hardened — ladder: B=14, C=15, D=16) lands here.

### T-10.5 — restore natural names, delete workaround comments (the finding's own success proof)
- scripts/lib/cli.mjs:197-199: delete the comment; rename `relPath` → `rel` in `sourceReader`'s `linesOf`.
- scripts/lib/import-resolve.mjs:28-34: delete the comment; destructure without renames (`rel`, `textOf`,
  `maskedOnce`) and rename `relPathOf/recTextOf/maskTextOf` uses back throughout.
- Proof: re-extract the self-map; assert (in tests/self-map-roles.test.mjs, second test) **no edge from
  `scripts/lib/import-resolve.mjs:*` or `scripts/lib/cli.mjs:*` into `scripts/extract-symbols.mjs:{rel,textOf,maskedOnce}`**
  — the exact cycle class the renames dodged. If it ever reappears, extend the shadow set — never re-rename.

## #16 — overlap Signal B ignores the role scope its header advertises

### T-16.1 — failing Signal-B case (tests/overlap-roles.test.mjs)
Extend `runOverlap`: nodes `tests/h1.test.js:tA`, `tests/h2.test.js:tB` (`role:'test'`), `src/p1.js:pA`,
`src/p2.js:pB` (`role:'product'`), plus 4 product callee fns `c1..c4`; `call` edges from each of tA/tB/pA/pB to all
of c1..c4 (`s.size ≥ TWIN_MIN_OUT=4`, jaccard 1 ≥ 0.5). Assert default run: some `parallel-impl` finding pairs
pA/pB, **none** pairs tA/tB, and **no cross-role pair** (a test node appears in NO twin finding's `nodes`) ·
hardened; with `CODEWEB_ALL_ROLES:'1'`: the tA/tB pairing appears. (Fails today: `cand` is built from all-edge
`outLabels`. Real extracts relabel test→product calls to kind `test`, which Signal B skips — the fixture's
direct-written `call` kinds exercise the caller-side filter, the thing under test.)

### T-16.2 — the one-line cand filter (scripts/overlap.mjs:224)
`const cand = [...outLabels.entries()].filter(([id, s]) => s.size >= TWIN_MIN_OUT && (ALL_ROLES || (byId.get(id) &&
nodeRole(byId.get(id)) === 'product')));` — both members of every pair come from `cand`, so one filter covers the
twin loop, LSH and exact paths alike; `considerPair`/jaccard judging is untouched; `CODEWEB_ALL_ROLES=1` restores
today's scope exactly. Product-role `<module>` nodes stay eligible (the label-pair dedupe already handles them).

## Success criteria (WS-B/C bar, plan §criteria)
1. #11: i1–i5 green; import-anchor-precision / import-default-export / import-member-edges /
   import-object-alias-precision / python-imports / incremental-edges suites green; fragment byte-identical on a
   corpus with no remap-eligible misses (helper preserves candidate order).
2. #10: self-map re-measurement (evidence ledger, exact commands + sha): ref edges into ≤2-char symbols 234 → ~0;
   product→non-product ref edges 193 → 0 (empty allowlist); property test green ×2 runs; `trend.mjs:metrics`/
   `PERM_SEEDS` deadcode assertions (WS-B) still hold; reference-edges + test-edges + extract-symbols +
   extract-v7 + inherit-edges green; both workaround comments gone, natural names restored, no new cycle.
3. #16 · hardened: header's "excluded" claim now true for Signal B — every emitted finding's `nodes` product-role
   only by default. Exact bar, on the POST-#10/#11 self-map (Signal B is call-kind-only; #10's deletions shift twin
   candidacy, so the audit's 11-of-13/ov3–ov19 counts are pre-fix baseline, not acceptance): run overlap twice on
   the SAME map; assert (i) default `parallel-impl` findings ≡ exactly the `CODEWEB_ALL_ROLES=1` findings whose
   node lists are all-product (set equality: the 11-pair excluded class vanishes, ONLY it vanishes); (ii) surviving
   product pairs (ov1/ov2 class) appear in BOTH runs, identical node lists; (iii) under ALL_ROLES the filter
   short-circuits before `byId` — `cand` byte-identical to today's. overlap-roles (old + new) + overlap.test green.
4. Full suite ×2 green; `check-consistency` clean; no artifact-writer determinism regression.

## Risk notes
- **Self-map-derived counts shift**: ~427+ fabricated edges vanish (234 short-magnet + 193 cross-role overlap, plus
  shadow-suppressed product→product). Grepped tests/ for hardcoded totals: none pin whole-map edge counts; the exact
  `ambiguousDropped` assertions (tests/extract-symbols.test.mjs:58,72 — values 1/0) use fixtures with no param
  shadowing (verify after T-10.4 since suppression increments the same counter); stdout-flush only greps the note
  line's presence. Re-check tests/overlap.test.mjs Signal-B fixtures for non-product file paths before landing T-16.2.
- **Stderr edge totals** (`[extract] N symbols, M edges … dropped K ambiguous`) change on every corpus — bench
  receipts and round2-evidence entries must cite post-fix numbers, not the audit's.
- **#12 (WS-B) touches the same :700 decl guard and accessor lines**; #9 touches :767 member-call handling; #21
  (WS-D) rewrites `enclosing()`; #17 rewrites the cache gating T-10.4 salts. Plan order B → C → D holds; rebase
  T-10.2/T-10.4 onto WS-B's landed deriveFileEdges before building.
- **overlap.mjs shared with WS-E (#24 LSH rewrite of the same cand/bucket loop)** — #16 must merge first (plan
  orders C before E); #24's "identical candidate pair set" proof must run against the role-filtered cand.
- Rollback: each finding is one revertable commit group; the cache `rev` string makes downgrade safe too (any
  mismatch ⇒ cold derive).
