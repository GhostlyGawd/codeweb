# Phase 1 — deterministic pre-check findings (2026-06-27)

Before any agent A/B spend, we graded codeweb's `--dependents` against **independently constructed,
hand-adjudicated frozen truth sets** (built by agents working only from source, blind to codeweb) for
a Go and a Rust target. Truth sets: `truth.go-route.json`, `truth.rust-escape.json`. Grader:
`grade.mjs`. Engine @ extraction time = regex (default).

## Results (engine-frozen, deterministic)

| target | truthN | cwN | symbol recall | symbol prec | file recall | file prec |
|---|---|---|---|---|---|---|
| Rust `crates/cli/src/escape.rs:escape` | 16 | 13 | **0.75** | 0.92 | **0.33** | 1.00 |
| Go `route.go:Route` (raw) | 45 | 15 | 0.29 | 0.87 | 0.50 | 0.67 |

## The finding (gates Phase 1 cross-file discovery)

**codeweb does not extract Go `import` or Rust `use` edges.** Extraction reported `0 import edges`
for both gorilla-mux and ripgrep. Consequences, measured against independent truth:

1. **Rust:** codeweb finds every *same-file* caller (all 12 unit tests) — symbol recall 0.75,
   precision 0.92 — but misses every *cross-file* dependent: the `use crate::escape::escape` import
   in `pattern.rs`, the `pub use` re-export in `lib.rs`, and the real cross-file call in
   `pattern_from_bytes`. File recall collapses to 0.33. The wall is cross-file, and it is the missing
   import/use edge.

2. **Go:** the raw `Route` miss-set is dominated by two things: (a) builder methods that only *return*
   `*Route` in their signature (`Get`/`Path`/`Headers`/…), which are a **target-selection confound**
   — a method returning a type is not a call/import/inherit/test dependent and is excluded from the
   JS class targets' truth convention too; (b) cross-file refs, again import-edge-limited.

## Implications for H19 (the honesty contract)

- The Rust same-file recall (0.75) shows the *query* is sound; the cross-file gap is an **extraction**
  limitation, not a query limitation — exactly the JS-pilot pattern (find→fix→prove).
- Two honest paths: **(A)** fix Go/Rust import/use edge extraction (product-valuable: cross-file
  discovery is the core value prop) and re-prove on the frozen truth; **(B)** scope H19 to what holds
  today. We take **(A)** — it makes codeweb genuinely better on an independently-measured recall gap,
  verified by before/after recall on the same frozen truth (not a reward hack).
- The Go `Route` target is **replaced** by a clean function target `mux.go:NewRouter` (call-site
  dependents only — no return-type-signature confound), comparable to the JS function targets.

## Update — clean Go function target `NewRouter` (frozen graph)

| target | truthN | cwN | symbol recall | symbol prec | file recall | file prec |
|---|---|---|---|---|---|---|
| Go `mux.go:NewRouter` | 58 | 54 | **0.91** | 0.98 | 0.56 | 1.00 |

codeweb resolves **same-package bare `NewRouter()` calls almost perfectly** (symbol recall 0.91,
precision 0.98). The only files it misses are the four `example_*_test.go` files in `package mux_test`,
which call it **qualified** as `mux.NewRouter()` — a cross-package call needing Go import resolution.

## Consolidated Phase 1 characterization (deterministic, engine-frozen)

| layer | Go (NewRouter) | Rust (escape) | verdict |
|---|---|---|---|
| same-file / same-package | recall 0.91 | recall 0.75 | **codeweb strong** |
| cross-file / cross-package | misses qualified `mux.NewRouter()` | misses `use`-imported callers | **recall-capped: missing import/use edges** |

The query is sound; the ceiling is **extraction of cross-module import edges**. Rust `use`-edge fix is
the first increment (verified by re-grading the frozen `escape` target). Go qualified-call resolution
(`pkg.Symbol()` via imported `pkg`) is the analogous increment. H19's confirmatory set (JS proven,
Python supporting, Rust post-fix) reaches ≥3 languages; Go is a strong supporting fourth.

## Engine-fix results (find → fix → prove, deterministic on frozen truth)

| increment | target | recall (sym) before → after | file recall before → after | precision | commit |
|---|---|---|---|---|---|
| Rust `use`-import edges | `escape.rs:escape` | 0.75 → **0.94** | 0.33 → **1.00** | 0.88 | `4095e9f` |
| Go qualified-call edges | `mux.go:NewRouter` | 0.91 → _(pending verify)_ | 0.56 → _(target 1.00)_ | — | _(staged)_ |

Rust: ripgrep import edges **0 → 311**; the lone remaining miss is a `mod tests` node (mod discovery
out of scope). Suite 363 → 367 (4 new tests), ci-gate green, JS/Python paths byte-stable. This is the
same find→fix→prove pattern the JS pilot used (§9.1) — the recall gain is measured against the *same
frozen, codeweb-blind truth set*, so it is a genuine capability gain, not a reward hack.

## What remains for H19 (the actual north-star test)

The above proves the **engine's** recall improved. H19 is an **agent** claim: an agent equipped with
codeweb out-discovers a grep-only agent (recall delta > 0, ≥8 frozen-engine reps, ≥3 languages). The
engine fixes raise codeweb's ceiling so the agent *can* win cross-file (the JS pilot showed engine
quality decides the agent outcome). The agent A/B reps over {JS, Python, Rust(+Go)} targets are the
next step and the confirmatory test.

## Validation pilot (reps=2, run wf_13055407-3c2) — a USEFUL null (validate-small worked)

Ran the agent A/B at reps=2 on the two new targets before scaling. Result: paired recall delta
**+0.035 ± 0.049 (null)**, steps delta +1.25 (treatment slower). Per target:

| target | control recall | treatment recall | Δ | why |
|---|---|---|---|---|
| Go `NewRouter` | **1.00** | 1.00 | 0 | grep SATURATES — distinctive name, every caller writes `NewRouter(` |
| Rust `escape` | 0.81 | 0.875 | +0.065 (noise) | codeweb's cross-file `use` callers helped marginally; grep `escape(` also found most |

**This is the H18 floor effect one level up — a TARGET-SELECTION problem, not a codeweb failure:**
- Harness integrity clean (no control used codeweb; both treatments used it); grading correct.
- codeweb **never regressed** recall (treatment ≥ control on both targets).
- The null is because I picked **distinctive-name** targets — exactly where grep already wins. The
  prior JS pilot's win (recall +0.265) came from **grep-HOSTILE** targets: common ambiguous names
  (`merge`) and import/test-mediated callers (`AxiosError`, 76 deps) that grep buries or misses.
- **Decision: do NOT scale these targets to 8 reps** (would only confirm a null). H19's
  cross-language test needs grep-hostile targets: aliased imports (grep on the original name misses
  the aliased call sites — codeweb's alias edges find them), common method names with multiple
  receiver types (dispatch edges disambiguate), and re-export chains.

**Refined H19 (honest, forming):** codeweb's discovery advantage is **conditional on grep-hostility**
— it wins where discovery is import/alias/dispatch-mediated, and ties grep on distinctive names while
never regressing recall. Proving "generalizes across ≥3 languages" therefore means proving it on
grep-hostile targets in JS (done), Rust, and Go — the next cycle.
