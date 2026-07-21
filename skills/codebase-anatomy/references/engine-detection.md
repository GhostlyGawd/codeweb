# Hybrid engine — tool detection & fallback

codeweb prefers **precise edges from static-analysis tools** when they are installed, and falls
back to **agent reading** otherwise. Per subsystem, detect what's available, use it, and record
the chosen engine in `meta.engine`.

> **Native fast path (no tools required):** eleven languages — JavaScript, TypeScript, Python,
> Rust, Go, Java, C#, Ruby, PHP, Kotlin, and Swift — are parsed directly by the bundled extractor
> (`scripts/extract-symbols.mjs`). When the optional `web-tree-sitter` dependency is installed, a
> **bundled AST tier** (vendored grammars under `scripts/grammars/`) additionally resolves
> dynamic-dispatch call edges and exact complexity for JS/TS, Java, C#, Python, Go, and Rust —
> default-on, per-file regex fallback, byte-identical nodes either way. The table below is the
> *optional* sharpening / agent-fallback path — for native languages it only refines edges, and
> for everything else it is the primary route.

## Detection order (per language)

| Language | Preferred tool(s) | Detect with | Emits |
|---|---|---|---|
| JS/TS | `madge` (imports), `ts-morph`/`tsc --listFiles` | `npx --no-install madge -V`; `tsconfig.json` present | import graph, modules |
| Python | `pydeps`, `pyan3`, stdlib `ast` via a one-off script | `python -c "import ast"`; `pip show pydeps` | import + call graph |
| Go | `go list -deps`, `callgraph` (golang.org/x/tools) | `go version` | package + call graph |
| Rust | `cargo modules`, `cargo-call-stack` | `cargo --version` | module tree, calls |
| Java/Kotlin | `jdeps` (JDK), tree-sitter | `jdeps -version` | class/package deps |
| C/C++ | `clangd`/`clang -emit-ast`, `cscope`, `ctags` | `clang --version`; `ctags --version` | symbols, includes |
| Any | **universal-ctags** (symbols), **tree-sitter** (AST), `ripgrep` (call sites) | `ctags --version`; `tree-sitter --version` | symbol index |

`universal-ctags` + `ripgrep` is the broad fallback spine: ctags gives the symbol list with
locations; ripgrep finds call sites to draw edges. Both are read-only and cross-language.

## Rules

- **Probe, don't install.** Check for a tool with a version/`--help` call. If it's missing,
  do **not** `npm install` / `pip install` / `cargo install` it — drop to reading. (Especially
  for external repos: installing their toolchain can execute their code.)
- **Tool output is the spine, reading fills the flesh.** Even with a tool, read representative
  files to populate `summary`, `kind`, `loc`, and to confirm call edges the tool can't resolve
  (dynamic dispatch, reflection, DI).
- **Record per-subsystem engine.** A repo can be `tools` for its Go service and `read` for its
  shell scripts. Set `meta.engine` to the dominant mode, and note mixed coverage in the report.
- **Never execute the target.** No build, no run, no test, no entrypoint. Only invoke analysis
  tools that statically inspect files already on disk.

## Scaling / depth

- `module` depth: stop at file/module nodes and import edges — fast, good for first pass and
  huge repos. Default top-level view.
- `symbol` depth: expand to function/class/method nodes and call edges — run it on the densest
  or most-overlapping subsystems rather than the whole repo when node counts get large.
- `auto`: module-level everywhere, then symbol-level on the top subsystems by size and by
  cross-domain edge density (where overlap is most likely).
- If total nodes would exceed ~2000, cap symbol expansion to the focus area and say so in the
  report — never silently truncate.
