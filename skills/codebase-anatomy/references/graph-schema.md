# codeweb graph schema (`graph.json`)

`graph.json` connects extraction, domain assignment, overlap analysis and graph consumers.
The format is additive and currently unversioned: preserve unknown fields. A breaking
change requires the versioning decision described in [the artifact reference](../../../docs/reference.md#outputs-under-targetcodeweb).

## Minimum renderable graph

This valid JSON illustrates a renderable node and an empty edge list. It does not claim
the source file exists or that the function has no runtime callers.

```json
{
  "nodes": [
    {
      "id": "greet.js:greet",
      "label": "greet",
      "kind": "function",
      "file": "greet.js",
      "line": 1,
      "loc": 1
    }
  ],
  "edges": []
}
```

`domains` and `overlaps` enrich rendering; absent values become empty collections.
A renderer can display this graph without `meta.root`. Source lookup, refresh and
freshness checks need additional operational fields; rendering success does not establish them.

## Generate an operational example

Run this block from a Codeweb source checkout with Node.js ≥ 22 and a POSIX shell.
It creates a temporary source file, generates real metadata, reads its mapped body, and
refreshes its map. Codeweb analyzes the source without executing it.

<!-- operational-example -->
```sh
schema_demo=$(mktemp -d "${TMPDIR:-/tmp}/codeweb-schema.XXXXXX") || exit 1
printf 'export function greet(name) { return name; }\n' > "$schema_demo/greet.js"
node scripts/run.mjs "$schema_demo" --json
node scripts/context-pack.mjs "$schema_demo/.codeweb/graph.json" greet --full-bodies --json
node scripts/refresh.mjs "$schema_demo/.codeweb/graph.json" --json
```
<!-- /operational-example -->

The context response includes `greet`'s source body and parsed parameter `name`.
Inspect `$schema_demo/.codeweb/graph.json` for actual source stamps. Keep the temporary
directory while inspecting it; remove it when finished.

## Operational fields and ownership

Fields below describe producer output and consumer requirements. They are not all required
for every graph operation. Agents must not invent source stamps, coverage or parser provenance.

`meta.engine` is the map's provenance label. Always stamp the actual extraction path;
agent-generated maps use `hybrid`, `tools` or `read` and remain unverified by the
deterministic pipeline.

| Field | Shape / producer | Consumer behavior when absent |
| --- | --- | --- |
| `meta.root` | Absolute source-directory path, forward slashes; extractor | Source-backed tools cannot resolve files; refresh refuses a missing or unavailable root. |
| `meta.target` | Display label; extractor or orchestrator | Not a filesystem substitute for `root`. |
| `meta.engine` | `regex` or `ctags` from deterministic extraction; `hybrid`, `tools` or `read` from agent dissection | Missing provenance must not be inferred. Agent values trigger the brief's unverified-map caveat. |
| `meta.complexityEngine` | Optional parser-version string, e.g. the actual tree-sitter probe result; extractor | No assertion of tree-sitter complexity support. `meta.engine` can still be `regex` when this field is present. |
| `meta.languages`, `meta.symbols` | Observed language names and symbol count; extractor | Informational, not proof of full language or runtime coverage. |
| `meta.sources` | Object keyed by source-relative paths; extractor | Freshness is unknown without usable stamps; a null staleness result alone is not proof of freshness. |
| `meta.dirs` | Object mapping observed relative directories to rounded modification times; extractor | Consumers using directory stamps lose that change signal. Recorded-file checks alone do not detect every newly added file. |
| `meta.dynamic` | Optional `{files, sample}` of dynamic-dispatch-pattern observations; extractor | Absence does not establish complete call resolution. This is diagnostic evidence, not a numeric confidence score. |
| `meta.stats`, `meta.generatedAt` | Summary counts and timestamp; renderer | Derived display metadata. Do not use rendering time as a source-freshness guarantee. |
| `meta.mode`, `meta.depth` | Orchestration context such as internal/external and symbol/module depth | Descriptive; they do not replace node locations or source stamps. |
| `meta.overlapsDroppedAt` | Timestamp added by refresh when it discards overlap results | Full mapping reconstructs analysis. Its absence alone is not proof that an arbitrary imported graph was analyzed for duplication. |
| `meta.coverage` | Optional recorded-run source and counts; coverage importer | Coverage is unknown. Refresh removes it because source spans may have changed. |

Each `meta.sources[path]` stamp has:

| Key | Meaning |
| --- | --- |
| `s` | File size in bytes; a negative sentinel can record an unavailable mapped file. |
| `m` | Rounded filesystem modification time in milliseconds. |
| `h` | Optional SHA-1 of the UTF-8 source text, as computed by the extractor. |

The default recorded-file freshness check compares size and modification time.
`CODEWEB_VERIFY_FRESHNESS=1` also verifies recorded hashes where available.
Do not copy stamp values from an example; regenerate them from the actual source.

## Nodes, edges and analysis collections

| Node field | Meaning |
| --- | --- |
| `id` | Stable graph identity, usually `<relative file>:<symbol>`. Class-qualified methods and `@<line>` disambiguators may occur; consumers must treat IDs as opaque. |
| `label`, `kind` | Display name and function/class/method/module/file classification. A method label can remain bare while its ID includes its class. |
| `file`, `line`, `loc` | Source-relative file, one-based starting line and line span. Source readers use `[line, line + loc - 1]`. |
| `exports` | Whether the node is marked exported; relevant to orphan gating. |
| `role` | `product`, `test`, `fixture`, `example`, `bench`, `generated`, or `vendored`. Extraction uses path heuristics and `codeweb.rules.json` overrides; missing roles fall back to path classification in role-aware consumers. |
| `signature` | Function/method contract: `{params: string[], returns: string or null, raw: string}`. It can be null when the declaration cannot be parsed; class/module nodes can omit it. |
| `domain`, `summary` | Assigned domain and optional explanatory text. Extraction starts with empty values; later stages or agent workflows enrich them. |
| `complexity`, `maxDepth` | Optional function/method complexity and nesting measurements. Interpret them with their recorded engine; absence is not zero complexity. |
| `covered`, `hits` | Optional recorded coverage: true/false and peak hit count. Missing coverage is unknown; `false` means the recorded report saw the span without execution. |

Additional extractor fields, such as clone-analysis fingerprints, may be present.
Consumers should preserve fields they do not interpret.

Edges contain `from` and `to` node IDs plus `kind`; optional `weight` describes occurrence
weight. Every endpoint must resolve to a node after merging. An empty edge list means
no edges were supplied or resolved, not that no dependencies exist at runtime.

`domains` contains domain descriptors such as `name`, node count, `summary` and optional
representative `files`. `overlaps` contains findings with fields such as `id`, `kind`,
`title`, `nodes`, `domains`, `severity`, `confidence`, `evidence` and `recommendation`.
Interpret each finding's supplied evidence; severity and confidence are separate properties.

## Refresh and missing analysis

Refresh re-extracts nodes and edges, updates source metadata, and reattaches surviving
node domains by ID. It retains domain summaries, drops overlaps, stamps
`meta.overlapsDroppedAt`, and removes stale coverage provenance. Run the full pipeline
to reconstruct overlap analysis.

The unreleased checkout adds response-level `analysis` fields to context and diff outputs.
Those response envelopes are distinct from stored `graph.json`; see
[context status and baseline verification](../../../docs/cli.md#context-analysis-status).
A complete returned list or a clean structural verdict does not establish runtime completeness.

## Edge kinds

- **`call`** — a function/method invokes another, OR passes it by name as a higher-order argument
  (`arr.map(fn)`, `rl.on('x', fn)`). The deterministic extractor resolves the target by import alias,
  same-file definition, or a unique global definition, and DROPS ambiguous multi-definition names
  rather than guess (precision over recall). A method call `obj.fn()` is NOT wired to a top-level `fn`
  by the regex engine. Under `--engine tree-sitter`, dynamic-dispatch calls DO resolve: `this.m()`
  (within a class) and typed-receiver `x.m()` (where `x: T` is a known class) wire to the
  class-qualified method id (`<path>:T.m`); untyped/array/generic receivers are still dropped.
- **`import`** — a module imports a symbol from another module. Imported `.json` files appear as
  file-level `<path>:<module>` nodes (the JSON config tier: no symbols are extracted, content is
  never parsed); every JS/TS import form of a `.json` target — default, named, namespace,
  `require`, extensionless `require` — lands one coarse `import` edge on that node (`test` when
  the importer is a test file).
- **`inherit`** — a class extends/subclasses another (`class X extends Y`, `class X(Y):`), resolved
  with the same precision gate as calls. Counts toward reachability: an extended base is not a
  dead-code orphan, and `--impact` of a base includes its subclasses.
- **`ref`** — a symbol references a CLASS by identity without invoking it directly: `obj instanceof X`
  or a static-method call `X.from(...)` (where `X` is an imported class or a same-file class). The
  `.from()` site ALSO emits a `call` edge to the static method; the `ref` edge records the dependency on
  the class itself so `--dependents <class>` surfaces every user (an `instanceof`/static-factory user is
  not a `call`-edge caller). Precision-safe: an object-default alias (`import utils from './utils'`)
  emits no `ref` — `utils` is not a class. Counts toward `--dependents` and reachability (not an orphan).
- **`test`** — a `call`/`ref` originating in a test file (`*.test.*`, `tests/` …) to a production
  symbol, reclassified so production caller/orphan queries can exclude test-only usage while
  `--dependents`/`--tests` still surface it.
- **`dataflow`** — RESERVED, not emitted by any stage today. Precise value/taint tracking
  (source→sink) needs type/dispatch resolution and alias awareness the deterministic regex extractor
  does not have; a noisy approximation would undermine the precision the other edge kinds guarantee
  (codeweb's whole contract is "don't guess"). Reserved for a future optional type-resolution tier —
  the schema lists it so consumers can forward-handle it, but no code produces it. Use an external
  analyzer (Semgrep/CodeQL) for taint until then.

## Merge rules (orchestrator)

- Dissectors emit `nodes` + `edges` per scope. Deduplicate by node `id`; an edge is unique by
  `(from, to, kind)` — sum `weight` on collision.
- Edges may reference node ids owned by another scope. After merging all dissectors, drop any
  edge whose `from` or `to` id does not exist as a node (dangling reference to skipped code).
- The domain-mapper returns `{nodes:[{id,domain}], domains, overlaps}`. Merge each `domain`
  back onto the matching full node by `id`.
- The renderer (`build-report.mjs`) computes `meta.stats`, stamps `meta.generatedAt`, and persists
  both back into `graph.json` (along with the dangling-edge drop), so the on-disk graph matches the
  rendered report.
