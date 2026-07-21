# Vendored tree-sitter grammars

These `.wasm` grammar files are **vendored on purpose** (committed to the repo) so the optional
tree-sitter engine is offline-reproducible and **determinism is pinned to an exact grammar version** —
the same input always yields the same graph. Recorded in `meta.engine` when the tree-sitter engine runs.

| File | Language | Source package | Version | ABI |
|------|----------|----------------|---------|-----|
| `tree-sitter-typescript.wasm` | TypeScript / TSX-free TS | `@vscode/tree-sitter-wasm` | 0.3.1 | 14 |
| `tree-sitter-java.wasm` | Java (dispatch tier) | `@vscode/tree-sitter-wasm` | 0.3.1 | 14 |
| `tree-sitter-c-sharp.wasm` | C# (dispatch tier) | `@vscode/tree-sitter-wasm` | 0.3.1 | 15 |
| `tree-sitter-python.wasm` | Python (dispatch tier, Spec F) | `@vscode/tree-sitter-wasm` | 0.3.1 | 14 |
| `tree-sitter-go.wasm` | Go (dispatch tier, Spec F) | `@vscode/tree-sitter-wasm` | 0.3.1 | 14 |
| `tree-sitter-rust.wasm` | Rust (dispatch tier, Spec F) | `@vscode/tree-sitter-wasm` | 0.3.1 | 14 |
| `tree-sitter-ruby.wasm` | Ruby (dispatch tier, IMPROVEMENTS.md #14) | `@vscode/tree-sitter-wasm` | 0.3.1 | 14 |
| `tree-sitter-php.wasm` | PHP (dispatch tier, IMPROVEMENTS.md #14) | `@vscode/tree-sitter-wasm` | 0.3.1 | 15 |

## Runtime

The WASM runtime is `web-tree-sitter@0.26.9`, declared in the root `package.json` as an
**optionalDependency** — the regex engine (the default) needs zero dependencies; the tree-sitter tier
is opt-in. If the runtime is not installed, the engine reports unavailable and the extractor falls back
to the regex path per-file.

## The ABI rule (do not skip)

A grammar `.wasm` must sit inside the runtime's ABI window. `tree-sitter-wasms@0.1.13` ships ABI-13
grammars (built with `tree-sitter-cli@0.20.x`) that **fail to load** against `web-tree-sitter@0.26.9`
with a `dylink` metadata error. Always vendor a grammar whose ABI matches the pinned runtime, and bump
both together. The spike that established this was `spike/tree-sitter/` (PR #17; the graduated
prototype was removed from the tree in the perf-quality round — git history keeps it).

## Kotlin / Swift — recorded blocker (2026-07-21)

Kotlin and Swift stay **regex-only**: no trusted prebuilt wasm exists at our ABI. The upstream
grammar packages (`tree-sitter-kotlin`, `@tree-sitter-grammars/tree-sitter-kotlin`,
`tree-sitter-swift`) ship C sources and native `.node` prebuilds — building wasm requires an
emscripten toolchain this project deliberately doesn't carry, and vendoring a third-party wasm of
unknown provenance would break this file's guarantee. Revisit when `@vscode/tree-sitter-wasm`
grows either language (it added Ruby/PHP in the 0.3.x line) or a maintainer produces a pinned
emscripten build. Until then their dispatch edges are absent, not guessed — the same honesty as
every other gap.

## Refreshing a grammar

```sh
npm i -D @vscode/tree-sitter-wasm@<version>
cp node_modules/@vscode/tree-sitter-wasm/wasm/tree-sitter-typescript.wasm scripts/grammars/
# update the version/ABI row above, bump web-tree-sitter if the ABI moved, re-run the determinism test
```
