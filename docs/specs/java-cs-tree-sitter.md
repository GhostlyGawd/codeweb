# Spec: Java/C# tree-sitter tier

## Problem
The regex tier precision-gates `obj.Method()` dispatch for Java/C# (documented since the
language expansion: "a tree-sitter tier for Java/C# is the next increment"). The JS/TS AST
tier already exists (`scripts/lib/ts-engine.mjs` + vendored `scripts/grammars/*.wasm`);
Java/C# should ride the same machinery.

## Behavior
- With `web-tree-sitter` installed AND a vendored grammar present for the language, `.java` /
  `.cs` files get the AST tier: exact method spans, and **dispatch edges** for `receiver.m(...)`
  when `m` resolves to exactly ONE owner-qualified method in the graph (the same
  unique-target precision gate the JS tier uses — ambiguous names are dropped, counted,
  never guessed).
- Grammar or dependency absent → regex tier output **byte-identical** to today (the standing
  degradation contract).
- `meta.engine` / `complexityEngine` record the tier actually used, per the existing pattern.

## Feasibility gate (first step — may end this spec honestly)
Prebuilt wasm grammars must be obtainable and license-compatible (`tree-sitter-java`,
`tree-sitter-c-sharp` — e.g. the `tree-sitter-wasms` npm distribution) and must load in the
pinned `web-tree-sitter`. If not obtainable from this environment, commit the blocker note
here and stop — no hand-rolled grammar builds.

## Tests (TDD)
- **T1 dispatch recall (Java)**: fixture where `helper.compute()` has a unique
  `Helper.compute` target → AST tier emits the call edge; regex tier does not (pins the
  delta the tier exists for).
- **T2 precision gate**: two classes both define `compute()` → NO dispatch edge (ambiguity
  dropped), counted in the banner.
- **T3 degradation**: `--engine regex` (and grammar-absent path) byte-identical nodes/edges
  to the current pins; existing extract-java-cs tests stay green.
- **T4 real-corpus sanity**: javapoet + RestSharp extractions gain dispatch edges (> regex
  tier count), zero phantom endpoints.

## Done when
Feasibility resolved (either wired + tests green on both real corpora, or blocker documented);
suite + gate green.
