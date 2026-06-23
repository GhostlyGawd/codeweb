# Vendored tree-sitter grammars

These `.wasm` grammar files are **vendored on purpose** (committed to the repo) so the optional
tree-sitter engine is offline-reproducible and **determinism is pinned to an exact grammar version** —
the same input always yields the same graph. Recorded in `meta.engine` when the tree-sitter engine runs.

| File | Language | Source package | Version | ABI |
|------|----------|----------------|---------|-----|
| `tree-sitter-typescript.wasm` | TypeScript / TSX-free TS | `@vscode/tree-sitter-wasm` | 0.3.1 | 14 |

## Runtime

The WASM runtime is `web-tree-sitter@0.26.9`, declared in the root `package.json` as an
**optionalDependency** — the regex engine (the default) needs zero dependencies; the tree-sitter tier
is opt-in. If the runtime is not installed, the engine reports unavailable and the extractor falls back
to the regex path per-file.

## The ABI rule (do not skip)

A grammar `.wasm` must sit inside the runtime's ABI window. `tree-sitter-wasms@0.1.13` ships ABI-13
grammars (built with `tree-sitter-cli@0.20.x`) that **fail to load** against `web-tree-sitter@0.26.9`
with a `dylink` metadata error. Always vendor a grammar whose ABI matches the pinned runtime, and bump
both together. The spike that established this is at `spike/tree-sitter/` (PR #17).

## Refreshing a grammar

```sh
npm i -D @vscode/tree-sitter-wasm@<version>
cp node_modules/@vscode/tree-sitter-wasm/wasm/tree-sitter-typescript.wasm scripts/grammars/
# update the version/ABI row above, bump web-tree-sitter if the ABI moved, re-run the determinism test
```
