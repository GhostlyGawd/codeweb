# Round-2 WS-B spec — truth: lexing/masking (#15, #8, #9, #12, #13, #14)

Scope: `docs/specs/round2-plan.md` workstream B. Build order **#15 → #8 → #9 → #12 → #13 → #14**: #15 first because it is the smallest change and removes the crash that could kill later findings' fixture extracts (a big fixture or self-map run must never die in `cyclomatic`). Every task is TDD: land the failing fixture test first (exact sources below), then the fix. Fixture tests follow `tests/maskjs-regex-literals.test.mjs` (spawn `extract-symbols.mjs --no-ctags` on a `writeTree` tmpdir, assert nodes/edges); pure-function tests follow `tests/lang-rules.test.mjs` (in-process import, no spawn). **BDD is not applicable to this workstream** (no MCP/hook/flow surfaces — all findings are pure lexing/extraction truth); stated once here.

**Shared property test** (new `tests/masking-properties.test.mjs`, in-process): over a corpus = every fixture in this spec + all tracked `scripts/lib/*.mjs`, assert for `maskJs`/`maskPy` in both modes: per-line `masked.length === input.length` (column preservation); and in default (blank) mode: `mask(mask(t)) === mask(t)` (idempotence — note: today `maskJs` is NOT idempotent when a `${}` holds a string; T-8.1 is what makes this property true, so it lands red-then-green with #8). For `maskRuby`: idempotence + line-count preservation only (documented non-column-preserving). Workstream exit bar (plan §B/C): every fixture below extracts to its documented symbols/edges; self-map deadcode safe tier has zero false positives (`trend.mjs:metrics` ≥1 caller, `PERM_SEEDS` no longer a flagged node — T-9.3); no regression in existing masking/extract/recall suites.

---

## #15 — huge-line crash (crash safety first)

**T-15.1 — unrolled string regexes.** Files: `scripts/lib/complexity.mjs:23` (the template/double/single trio in `strip`), `scripts/lib/masking.mjs:58-59` (`RB_DQ`, `RB_SQ`), and the same pattern class in `scripts/lib/ts-engine.mjs:156` (`TPL_STR_RE`/`SQ_STR_RE`/`DQ_STR_RE` in `stmtHash`). Replace each `X(?:\\.|[^X\\])*X` / `X(?:[^X\\]|\\[^])*X` alternation with the unrolled-loop form, e.g. `"[^"\\]*(?:\\[\s\S][^"\\]*)*"` (analogues for `'` and `` ` ``) — V8 iterates the inner `[^"\\]*` without per-char recursion, so an 8.4 MB literal no longer overflows the stack.
TDD: (a) in-process crash repro — `cyclomatic('const s = "' + 'a'.repeat(9_000_000) + '";', 'js')` and `maskRuby('x = "' + 'a'.repeat(9_000_000) + '"')` currently throw RangeError; assert they return (`complexity === 1`, mask succeeds). (b) equivalence property: seeded-random 5,000 strings (length ≤ 24, alphabet `" ' \` \\ a {`) — old regex (inlined in the test only) and new regex produce identical `.replace` output. (c) `tests/complexity.test.mjs` stays green unchanged.
Success: crash repros pass; equivalence property passes; zero diffs in existing complexity/masking tests.

**T-15.2 — degradation belt.** File: `scripts/lib/complexity.mjs`. Wrap the bodies of `cyclomatic` and `nestingDepth` in try/catch; on any throw degrade to `1` / `0` respectively (per audit) — covers every caller (both tiers at `extract-symbols.mjs:457,461,485`, hooks, MCP refresh) without touching call sites.
TDD fixture (spawn; path is real-world-shaped and NOT in `extract-symbols.mjs:82`'s SKIP set):
```
src/generated/data.js:  export const BLOB = "<9,000,000 × 'a'>";
                        export function tail() { return BLOB.length; }
```
Assert (pre-T-15.1 this exits non-zero in both `CODEWEB_ENGINE=regex` and default engine): exit 0, node `src/generated/data.js:tail` exists with numeric `complexity`/`maxDepth`.
Success: fixture green in both tiers; degradation values are exactly 1/0 (unit-assert by feeding a deliberately-throwing input while T-15.1 is unlanded, then keep the test as a belt check via a mock throw or oversized input).

## #8 — maskJs nested-template state (frame stack)

**T-8.1 — replace the two scalars with a frame stack.** File: `scripts/lib/masking.mjs:85-165`. `inTemplate:boolean` + `exprDepth:int` (:89-90) become `const tpl = []` — one frame `{depth}` per open template literal; invariants: "in template TEXT" ⇔ `tpl.length && top.depth === 0`; "in `${}` expr" ⇔ `top.depth > 0`. Transitions: normal code or expr sees `` ` `` → **push** `{depth:0}` (this is the nested-template case the scalars cannot represent — its text must blank and its `}`s must not decrement the outer expr depth); template TEXT sees `` ` `` → **pop** + `noteValue()`; TEXT sees `${` → `top.depth = 1`; expr sees `{`/`}` → `top.depth ± 1`, reaching 0 → back to TEXT of the same frame. New in TEXT: `\` consumes 2 chars as text (blanked) — fixes escaped `` \` `` and `\$` (:123-127 today has no escape handling). New in expr (:131-133): string literals route through `value(...)` for the whole quoted slice (same shape as :157) instead of unconditional verbatim — `keepValues:true` still keeps them (codemod's two-view diff now correctly classifies a name inside `${'…'}` as inside-a-value); default mode blanks them, ending the string-content fabrication. Stack is carried across lines exactly like `inBlock`.
TDD fixtures (one file per repro, beside `tests/maskjs-regex-literals.test.mjs`, new `tests/maskjs-nested-templates.test.mjs`):
```
n1.mjs:  export function fabricateMe(n) { return n; }
         export function docs(xs) {
           return `Usage: ${xs.map((n) => `fabricateMe(${n})`).join('; ')}`;
         }
         export function realUser(x) { return fabricateMe(x); }
n2.mjs:  export function helper() { return 1; }
         export function fmt(cond, alt) {
           return `v: ${cond ? `has } brace` : alt} tail`;
         }
         export function later() { return helper(); }
n3.mjs:  export function helper() { return 1; }
         const T = `an escaped \` backtick`;
         export function afterEsc() { return helper(); }
n4.mjs:  export function phantom(n) { return n; }
         export function host() { return `${'phantom(1)'} ok`; }
```
Assert: no `docs → fabricateMe` edge, `realUser → fabricateMe` survives (n1); the nested `}` does not invert state — `later → helper` survives and `fmt` loc stays ≤ 3 (n2); `afterEsc → helper` survives (n3); no `host → phantom` edge (n4). Plus: existing JM-TEMPLATE (`tests/test-edges.test.mjs`) and all of `tests/maskjs-regex-literals.test.mjs` stay green — `${}` code stays live.
Success: 4 fixtures green both tiers; shared idempotence property flips green; no regression in existing masking tests.

## #9 — spread calls + arrow-IIFE (the false "safe to delete" pair)

**T-9.1 — spread is not a member call.** File: `scripts/extract-symbols.mjs:767`. In `deriveFileEdges`, the member branch `if (ln[m.index - 1] === '.')` gains a spread guard: when `ln[m.index - 2] === '.'` (the match is preceded by `..`, i.e. `...fn(`), the backward identifier match can never succeed — fall through to `addEdge(i, m[1])` instead of `continue`. (`?.` keeps `[m.index-2] === '?'` → member branch unchanged.)
TDD fixture: `sp.mjs: export function metrics(g) { return { n: 1 }; }` + `export function report(ws) { return { label: 1, ...metrics(ws) }; }` → assert call edge `sp.mjs:report → sp.mjs:metrics` (fails today).
**T-9.2 — reject IIFE initializers in the const-arrow rule.** File: `scripts/lib/lang-rules.mjs:162`. Insert negative lookahead after `=\s*`: `…\s*=\s*(?!\(\()(?:async\s*)?…` — `const PERM_SEEDS = (() => {…})()` (matched today via the `\*?\s*\([^)]*\)\s*=>` alternative eating the inner paren) stops becoming a `function` node. Residual (document in code comment): a space-separated `= ( (` IIFE still matches — accepted, matches the audit's exact `=\s*\(\(` prescription.
TDD (in-process, `tests/lang-rules.test.mjs` style): `scanSymbols` on `const PERM_SEEDS = (() => {\n  return [];\n})();` yields no symbol; `const real = (x) => x;` still yields `function`.
**T-9.3 — self-map dogfood regression** (the WS-B bar's proof). New test copying the maskjs self-map pattern (`tests/maskjs-regex-literals.test.mjs:107`): `writeTree` the **real** `scripts/trend.mjs` and `scripts/lib/minhash.mjs` texts into a tmpdir, extract, assert: ≥1 call edge with `to === 'trend.mjs:metrics'` (the `:109` spread site resolves same-file); no node `minhash.mjs:PERM_SEEDS` of kind `function` — hence neither can ever appear in deadcode's safe tier again (deadcode only tiers existing nodes). This is the plan's "`trend.mjs:metrics` ≥1 caller; `PERM_SEEDS` referenced" criterion made mechanical.
Success: all three green; full self-map `deadcode` run shows an empty (or false-positive-free) safe tier — record in evidence ledger.

## #12 — accessors, overload stubs, annotated methods

**Id scheme decision: reuse `@line`, not `#get`/`#set`.** Read of the id flow: deadcode prints `o.id` verbatim (`scripts/deadcode.mjs:119`), report embeds ids opaquely, diff keys on them, and `scripts/lib/graph-ops.mjs:154` tail-matches a query after the last `:`. The regex tier already ships `@line` ids on collision (`extract-symbols.mjs:427`, comment: "e.g. TS overload stubs"), so every consumer already tolerates that grammar in real graphs. `@line` is also collision-triggered — the getter keeps the plain `file:Class.name` id, so existing queries/fingerprints don't churn — whereas `#get`/`#set` would rename **both** accessors and introduce a third id grammar no consumer has seen. Cost accepted: the setter's id shifts when lines shift above it (same as today's overload-stub ids). Tier consistency requirement: both tiers must emit identical ids for the same source (A/B equivalence) — both suffix `'@' + startLine`, first occurrence bare.

**T-12.1 — emit the setter.** Files: `scripts/lib/ts-engine.mjs:243-246` — the **actual** drop point: `methodIds` dedupe ("overloads collapse to one node") discards the second `method_definition` with the same `mid`. Since TS overload *signatures* are `method_signature` nodes (not in `FN_LIKE`, never framed), a `mid` collision here is always two real bodies (get/set pair): on collision, suffix `mid += '@' + (row + 1)` and push. `scripts/extract-symbols.mjs:477`'s cross-tier defensive dedupe changes from `continue` (silent drop) to the same `'@' + start` suffix. (Note: the audit cites only `:477`; fixing only that line is a no-op for accessors — the collapse happens in ts-engine first. Flagged to the spec reviewer.)
**T-12.2 — self-definition guard covers every same-named declaration line.** File: `scripts/extract-symbols.mjs` (`deriveFileEdges`, guard at `:700`). Build once per file `declStarts = Map(name → Set(range.start))` over all `ranges`; in `addEdge`, skip when `declStarts.get(name)?.has(lineIdx + 1)` — kills class-scoped fabrications from getter/setter/impl declaration lines. For body-less TS overload stubs (which have no range): additionally skip a `call` match when the masked line matches `^\s*(?:(?:public|private|protected|static|readonly|abstract|override|async)\s+)*name\s*\([^;{]*\)\s*(?::[^{;]*)?;\s*$` (a member/function signature ending in `;` with no body).
**T-12.3 — regex method matcher sees modern TS.** File: `scripts/lib/lang-rules.mjs:164`. Three widenings: stack the modifiers — `(?:(?:public|private|protected|static|readonly|async|get|set|\*)\s+)*`; allow default params — `[^;=]*` → `[^;{}]*`; allow a return annotation — insert `(?:\s*:\s*[^{;=]+)?` between `\)` and `\s*\{`. KEYWORDS filtering in `push()` still rejects `if (…) {` shapes.
TDD fixtures (`tests/accessor-overload-truth.test.mjs`; run once default-engine with the existing tree-sitter skip-guard convention, once `CODEWEB_ENGINE=regex`):
```
w.ts:  export function normalize(v: number): number { return v | 0; }
       export class Widget {
         private v = 0;
         get value(): number { return this.v; }
         set value(v: number) { this.v = normalize(v); }
         compute(n: number): number;
         compute(n: string): number;
         compute(n: any): number { return normalize(n); }
         render(x = 1) { return this.value + x; }
       }
```
Assert: nodes `w.ts:Widget.value` **and** `w.ts:Widget.value@5` both exist (AST tier; regex tier same ids); no edge `w.ts:Widget → w.ts:Widget.value` / `→ w.ts:Widget.compute` / `→ w.ts:Widget.render` (declaration/stub lines fabricate nothing); setter's `normalize` call attributes to the `@5` id; regex tier discovers `value`/`compute`/`render` as methods (fails today: all three invisible at :164).
Success: fixture green in both tiers with identical id sets (extend the existing engine A/B comparison to this fixture); no `class → own member` edges anywhere in the self-map (spot-check in evidence).

## #13 — Ruby heredocs + PHP `#`

**T-13.1 — heredoc state machine + masked Ruby scan.** Files: `scripts/lib/masking.mjs:60-65` (`maskRuby`), `scripts/lib/lang-rules.mjs:20`. `maskRuby` becomes a stateful line loop with a FIFO queue of pending heredoc tags: per line, first apply the existing string/comment replaces, then scan the masked line for openers `/<<([~-]?)(["'`]?)([A-Za-z_]\w*)\2/g` (no space after `<<`, not `<<=`; queue supports stacked `f(<<~A, <<~B)`), replacing each opener token with `''`; while the queue is non-empty, body lines emit `''` and a line whose trimmed content (`~`/`-` forms; exact column-0 match for plain `<<TAG`) equals the front tag closes it (terminator line also emits `''`). Opener-token blanking is what keeps `maskRuby` idempotent (re-mask sees no opener). Line count preserved; column preservation stays explicitly not promised. Then `lang-rules.mjs:20` routes `.rb` through the mask: `ext === '.py' ? masked('py') : ext === '.rb' ? masked('rb') : text` — `extract-symbols.mjs:280` already plumbs `masked('rb')` via `maskedOnce`, and the edge scan (`:821`) already consumes `maskedOnce(r,'rb',…)`, so it inherits heredoc blanking for free.
TDD fixture (`tests/ruby-heredoc-php-hash.test.mjs`):
```
db.rb:   def helper(x)
           x
         end
         SQL = <<~SQL
           SELECT helper(1) FROM t
           def phantom_method
         SQL
         def real_caller
           helper(2)
         end
```
Assert: no node `phantom_method`; no `db.rb:<module> → db.rb:helper` edge (heredoc body fabricates nothing); `real_caller → helper` survives.
**T-13.2 — PHP `#` comments.** Files: `scripts/lib/masking.mjs` (`maskJs` + `maskAligned:173`), `scripts/extract-symbols.mjs:145` (`maskedOnce`). `maskJs` gains `{hashComment:false}`: in the normal-code branch (beside `//` at :144), `#` blanks to EOL when the flag is set (never inside strings/templates — the branch order already guarantees that; JS private fields `#x` are unaffected because the flag is php-only). `maskAligned` and `maskedOnce` set the flag when the rel path ends `.php`.
TDD fixture: `x.php: <?php\nfunction helper($x) { return $x; }\n# legacy note: helper(1)\nfunction real() { return helper(2); }` → assert exactly one call edge to `x.php:helper`, from `real` (module-scope fabrication gone).
Success: both fixtures green; `tests/lang-ruby-php-kotlin-swift.test.mjs` + `tests/lang-dispatch-ruby-php.test.mjs` stay green (their fixtures contain no heredocs/`#`-call comments — verified by grep).

## #14 — Python f-strings keep their `{…}` code

**T-14.1.** File: `scripts/lib/masking.mjs:20-54` (`maskPy`). At each quote sighting (single-line and triple), inspect the immediately-preceding identifier run: if it is 1–3 chars, all in `[rRbBuUfF]`, contains `f`/`F`, and is word-boundary-clean on its left → f-string (covers `f`, `F`, `rf`, `fr`, `Rf`, …). In f-string TEXT: `{{`/`}}` blank as 2-char text; `{` enters expr mode — kept **verbatim in both modes** (it is code, the exact analogue of the JS `${}` rule), with a brace-depth counter for nested `{}` and a quote-skip (a quoted run inside the expr is consumed verbatim so a `}` inside it can't close early); depth-0 `}` returns to text. The `triple` state (:23) becomes `{delim, isF, exprDepth}` so triple-quoted f-strings carry expr state across lines. Columns preserved (verbatim spans preserve length trivially); `keepValues` output is byte-identical to today (everything already verbatim).
TDD fixture (`tests/python-fstring-edges.test.mjs`):
```
rep.py:  def compute(x):
             return x * 2
         def report(x):
             return f"total={compute(x)}"
         def multi(x):
             return f"""
             header {compute(x)} not{{code}}
             """
         def prefixed(x):
             return rf"raw {compute(x)}"
         def decoy(x):
             return "compute(x)"
```
Assert: call edges `report → compute`, `multi → compute`, `prefixed → compute` all exist (all missing today); **no** `decoy → compute` edge (plain strings stay blanked). Existing `tests/python-docstring-mask.test.mjs` / `tests/python-imports.test.mjs` stay green.
Success: fixture green; maskPy properties (length + idempotence) hold over the new fixture; documented in the maskPy header (the audit notes the limit list omits f-strings — remove the omission).

---

## Risk notes — existing tests that may legitimately change

Read of `tests/`: **no existing test encodes the wrong behaviors fixed here** (no heredoc/f-string/accessor/spread expectations exist — verified by grep), so no assertion legitimately *flips*; the risk class is exact-set assertions gaining nodes/edges that are newly true:
- `tests/ts-engine.test.mjs`, `tests/extract-engine.test.mjs`, `tests/extract-v7.test.mjs` — method-set/count assertions may gain a setter node (`@line`, T-12.1) or newly-visible annotated methods (T-12.3). `tests/fixtures/ts-engine/sample.ts` contains neither (verified), so expected green; if a count trips, update the expectation with the new truth — never weaken the fix (plan constraint).
- `tests/lang-ruby-php-kotlin-swift.test.mjs`, `tests/lang-dispatch-ruby-php.test.mjs` — Ruby scan moves raw→masked (T-13.1): any fixture symbol whose `def` sits inside a string would vanish; none do today.
- Must stay green unchanged (regression bars, not expected changes): `tests/maskjs-regex-literals.test.mjs`, JM-* in `tests/test-edges.test.mjs`, `tests/complexity.test.mjs`, `tests/python-docstring-mask.test.mjs`, IE-EQUIVALENCE in `tests/incremental-edges.test.mjs`, `tests/type3-clones.test.mjs` (engine A/B) — the last two require each finding to land tier-symmetric in a single commit (especially #12).
Rollback: every task is a small, independent diff; reverting any single finding's commit restores prior behavior without touching the others (only #12 spans two files that must revert together).

## Shared-files note

`scripts/extract-symbols.mjs` (T-9.1, T-12.1/12.2, T-13.2 touch it) and `scripts/lib/lang-rules.mjs` (T-9.2, T-12.3, T-13.1) are also edited by **WS-C** (#10 `refRe`/fallback at `:709-741`, #11 pub-walk `:602`) and later **WS-D** (#17 `:645-655` cache signatures, #20 maskJs perf, #21 `enclosing()` `:689`). Per the plan's ordering, WS-B lands and is verified **before** C/D start; C/D rebase on B's tree. Inside WS-B, tasks touching the same region (#9.1 and #12.2 both edit `deriveFileEdges`) land in build order to keep diffs reviewable. `scripts/lib/masking.mjs` is WS-B-exclusive this round except #20 (WS-D perf) — #20's charCode/span-copy patch must be benchmarked against the **post-#8** frame-stack masker, not today's.
