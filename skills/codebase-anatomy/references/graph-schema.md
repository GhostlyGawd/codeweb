# codeweb graph schema (`graph.json`)

The single source of truth that flows between dissectors, the domain-mapper, and the HTML
renderer. All examples below use synthetic values.

```json
{
  "meta": {
    "target": "src/ or https://github.com/owner/repo",
    "mode": "internal | external",
    "engine": "hybrid | tools | read",
    "depth": "module | symbol | auto",
    "languages": ["typescript", "python"],
    "generatedAt": "ISO-8601 string, stamped by the renderer (not by agents)",
    "stats": { "files": 0, "nodes": 0, "edges": 0, "domains": 0, "overlaps": 0 }
  },

  "nodes": [
    {
      "id": "src/auth/login.ts:loginUser",   // <repo-relative-path>:<symbol>  (path alone for file/module nodes)
      "label": "loginUser",
      "kind": "function",                     // function | class | method | module | file
      "file": "src/auth/login.ts",
      "line": 42,
      "loc": 120,                              // size of the symbol body, for node radius
      "exports": true,
      "domain": "auth",                        // assigned by domain-mapper (empty from dissectors)
      "summary": "Authenticates a user and issues a session token.",
      "complexity": 7,                         // F4: approximate cyclomatic complexity (function|method only; absent on class/module)
      "maxDepth": 3                            // F4: max control-flow nesting depth (function|method only)
    }
  ],

  "edges": [
    {
      "from": "src/auth/login.ts:loginUser",
      "to": "src/db/query.ts:runQuery",
      "kind": "call",                          // call | import | inherit | ref | test (emitted) · dataflow (reserved)
      "weight": 1                              // number of occurrences; optional, default 1
    }
  ],

  "domains": [
    {
      "name": "auth",
      "nodes": 12,
      "summary": "Authentication, session issuance, and authorization checks.",
      "files": ["src/auth/"]                   // optional, representative paths
    }
  ],

  "overlaps": [
    {
      "id": "ov1",
      "title": "User validation duplicated across auth, billing, and api",
      "kind": "duplicate-logic",               // duplicate-logic | parallel-impl | shared-responsibility | tangled-domain
      "severity": "high",                      // high | medium | low
      "domains": ["auth", "billing", "api"],
      "nodes": [
        "src/auth/login.ts:validateUser",
        "src/billing/charge.ts:checkUser",
        "src/api/guard.ts:assertUser"
      ],
      "evidence": "All three re-implement the same email + password + active-role check.",
      "recommendation": "Extract a single auth.validateUser; have billing and api depend on it."
    }
  ]
}
```

## Edge kinds

- **`call`** — a function/method invokes another, OR passes it by name as a higher-order argument
  (`arr.map(fn)`, `rl.on('x', fn)`). The deterministic extractor resolves the target by import alias,
  same-file definition, or a unique global definition, and DROPS ambiguous multi-definition names
  rather than guess (precision over recall). A method call `obj.fn()` is NOT wired to a top-level `fn`.
- **`import`** — a module imports a symbol from another module.
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

## Minimum viable graph

A graph is renderable with just `nodes` and `edges`. `domains` and `overlaps` enrich the
report; if absent, the renderer treats every node as domain `"unassigned"` and shows an empty
overlap tab.
