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
