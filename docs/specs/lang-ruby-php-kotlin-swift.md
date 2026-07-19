# Spec I: Ruby, PHP, Kotlin, Swift on the regex fast path

## Problem
The next language tier (README roadmap) still routes through the agent fallback. The regex
extractor's per-language pattern (discovery + imports + precision-gated calls + roles +
package boundaries) is proven across seven languages; extend it to four more.

## Behavior (testable contract)
Per language, at the same precision bar (drop-ambiguous-over-fabricate, phantom guards, masked
scanning):

1. **Ruby:** `def m` / `def self.m`, `class`/`module` (owner-qualified ids `file:Class.m`),
   `require`/`require_relative` imports, `Gemfile`/`*.gemspec` package boundary, `spec/`+
   `_spec.rb` test role.
2. **PHP:** `function f`, `class`/`interface`/`trait` + methods (visibility-as-export),
   `use`/`require`/`include` imports, `composer.json` boundary, `tests/`+`*Test.php` role.
3. **Kotlin:** `fun f`, `class`/`object`/`interface` + members, `import` lines,
   `build.gradle.kts`/`settings.gradle.kts` boundary, `src/test/` role; expression-bodied
   (`fun f() = ...`) extents handled.
4. **Swift:** `func f`, `class`/`struct`/`enum`/`extension` members (extension methods
   qualified by the extended type), `import` lines, `Package.swift` boundary,
   `Tests/`+`*Tests.swift` role.
5. **Calls:** unique-global + same-file + member-access resolution as in existing languages;
   control-flow keywords phantom-guarded per language (e.g. Ruby `if/unless/case`, Swift
   `guard`, Kotlin `when`).
6. **Determinism** and byte-stable re-runs, as everywhere.

## Tests (TDD — tests/lang-<lang>.test.mjs ×4, pattern of the Java/C# suites)
Per language: discovery fixture (every symbol kind found, owner-qualified, exports right);
phantom guard fixture (keywords produce zero nodes); call-edge fixture (unambiguous wired,
ambiguous dropped + counted); role/package fixture; determinism (two runs byte-identical).

## Done when
All four language suites pass; full suite green; a small pinned real repo per language maps
with counts + 0 phantoms recorded in the PR (candidates: sinatra, monolog, okio, Alamofire);
README/site language lists + version-sync surfaces updated.
