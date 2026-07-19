# Spec F: Python/Go/Rust dispatch tiers (tree-sitter)

## Problem
The oracle A/B's known under-recall class is dynamic dispatch. Java/C# got an AST dispatch tier
in 0.8.0; Python, Go, and Rust — all on the fast path for nodes — still drop every
`receiver.method()` call the regex tier precision-gates away.

## Behavior (testable contract)
Extends the `loadLangEngine` pattern (`scripts/lib/ts-engine.mjs`) with three grammars,
vendored pinned from `@vscode/tree-sitter-wasm@0.3.1` (provenance recorded in
`scripts/grammars/PROVENANCE.md`). Regex keeps owning nodes; the AST contributes ONLY dispatch
edges regex cannot claim:

1. **Python:** `self.m()` / `cls.m()` inside a class → edge to `file:Class.m` when that method
   exists on the class; `obj.m()` where `obj`'s annotated type (`obj: Foo`, `def f(x: Foo)`)
   names exactly one in-repo class defining `m`.
2. **Go:** method calls on a receiver whose declared type (`var x Foo`, `x := Foo{...}`,
   parameter `x Foo` / `x *Foo`) names exactly one in-repo type with that method.
3. **Rust:** `self.m()` inside `impl Type` → `file:Type.m`; `x.m()` where `x: Type` (binding or
   parameter, `&`/`&mut` stripped) names exactly one in-repo `impl` with that method.
4. **Precision contract everywhere:** two candidate owners → edge dropped and counted in the
   banner's dispatch note; never guessed. Nodes byte-identical between engines.
5. **Fallback:** grammar absent → per-language regex output, byte-identical to today
   (`--engine regex` forces it globally).

## Tests (TDD — tests/lang-dispatch-py-go-rust.test.mjs, pattern of the Java/C# suite)
Per language: **(a)** self/receiver-typed positive cases wire the expected edges; **(b)** an
ambiguous receiver type (two same-named classes) wires nothing and increments the dropped
count; **(c)** untyped/expression receivers wire nothing; **(d)** node sets byte-identical
between regex and AST engines; **(e)** determinism — two runs, identical fragments; **(f)**
absent-grammar fallback byte-identical to `--engine regex`.

## Done when
All three languages pass a–f; full suite green; a real-repo smoke per language (pinned clones:
flask, gorilla/mux, ripgrep) records wired/dropped dispatch counts in the PR.
