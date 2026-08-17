# Vendored tree-sitter grammars

These `.wasm` grammar files are **vendored on purpose** (committed to the repo) so the optional
tree-sitter engine is offline-reproducible and **determinism is pinned to an exact grammar version** —
the same input always yields the same graph. Recorded in `meta.engine` when the tree-sitter engine runs.

| File | Language | Source package | Version | ABI | sha256 |
|------|----------|----------------|---------|-----|--------|
| `tree-sitter-typescript.wasm` | TypeScript / TSX-free TS | `@vscode/tree-sitter-wasm` | 0.3.1 | 14 | `778025db5a8be0e70f8ccc3671e486dfeddd048c25d9e8a70c26de2e1bf6f97d` |
| `tree-sitter-java.wasm` | Java (dispatch tier) | `@vscode/tree-sitter-wasm` | 0.3.1 | 14 | `4fdeac4ca6ca089f06c6f7e562abcac1733cd465728cc7031ebb73c2019122c4` |
| `tree-sitter-c-sharp.wasm` | C# (dispatch tier) | `@vscode/tree-sitter-wasm` | 0.3.1 | 15 | `d12d85996c25957b4c1b71e26db2d7cc8a294997b60642e9c2a3b031b2c66dd3` |
| `tree-sitter-python.wasm` | Python (dispatch tier, Spec F) | `@vscode/tree-sitter-wasm` | 0.3.1 | 14 | `16108b50df4ee9a30168794252ab55e7c93bfc5765d7fa0aa3e335752c515f47` |
| `tree-sitter-go.wasm` | Go (dispatch tier, Spec F) | `@vscode/tree-sitter-wasm` | 0.3.1 | 14 | `9504573f352b20be7f2f1911754d710622aedc15afff16d5ed8fb5645681aee7` |
| `tree-sitter-rust.wasm` | Rust (dispatch tier, Spec F) | `@vscode/tree-sitter-wasm` | 0.3.1 | 14 | `0dac14947cb04d94466e3df659f80a4e264c216a60b3eda175eae4cf12ed7a8d` |
| `tree-sitter-ruby.wasm` | Ruby (dispatch tier, IMPROVEMENTS.md #14) | `@vscode/tree-sitter-wasm` | 0.3.1 | 14 | `09a96427d7c72f0613ed470cd9812223fc4a91d6a9c025c0235cc6bd59ff96f4` |
| `tree-sitter-php.wasm` | PHP (dispatch tier, IMPROVEMENTS.md #14) | `@vscode/tree-sitter-wasm` | 0.3.1 | 15 | `d4df6a6ff08c87c3ec4f9cbb785fe09998a0cb570e03f57d7b19b3acfb146aa7` |

The digests are load-bearing, not decorative: `tests/grammar-provenance.test.mjs` recomputes each
file's sha256 against this table, so a swapped or tampered grammar fails the gate — "pinned and
verified" is machine-checked, never a claim on faith (LNG-F2; the determinism suite proves
same-input-same-output, which says nothing about grammar identity).

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

## JSON — no grammar, by design (2026-07-27)

The JSON config tier maps imported `.json` files as file-level `<module>` nodes: membership in
the import-resolution universe plus a stat/hash staleness stamp. File **content is never
parsed** — no symbols are extracted, so there is no parser in the loop and nothing to vendor or
pin; the determinism guarantee holds trivially. If per-key symbols ever become a goal, that
upgrade re-enters this file's discipline (a pinned parser with recorded provenance) before it
ships. (Charter note: whether data formats fall under non-goal 8 at all is an open operator
question, recorded in `CHARTER.md` Open questions.)

## Refreshing a grammar

```sh
npm i -D @vscode/tree-sitter-wasm@<version>
cp node_modules/@vscode/tree-sitter-wasm/wasm/tree-sitter-typescript.wasm scripts/grammars/
# 1. update the version/ABI/sha256 row above (sha256sum scripts/grammars/*.wasm)
# 2. update the meta.engine version stamp in scripts/lib/ts-engine.mjs (it names the grammar
#    package version + ABI — a bump without this stamps a lie into every graph)
# 3. bump web-tree-sitter if the ABI moved; re-run the determinism + grammar-provenance tests
```

Each release, the prep checklist re-inventories `@vscode/tree-sitter-wasm@latest`'s wasm list —
the recorded Kotlin/Swift blocker (above) and the C/C++ readiness question (charter Next
candidate) both resolve the moment the trusted source ships those grammars, and a checklist
line is what notices (LNG-F7).
