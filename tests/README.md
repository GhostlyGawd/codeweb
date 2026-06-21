# codeweb engine — regression suite

Characterization tests that lock in the hard-won invariants of the deterministic engine
(`scripts/extract-symbols.mjs` → `cluster3.mjs` → `overlap.mjs` → `build-report.mjs`, wrapped by
`run.mjs`). The engine scripts are monolithic run-on-import CLIs, so each suite runs the **real
shipped artifact** as a child process against a crafted fixture and asserts on its output — no
mocks, no engine refactor. What ships is exactly what's tested.

## Run

```bash
npm test                          # = node --test "tests/**/*.test.mjs"
node --test tests/overlap.test.mjs   # a single suite
```

Requires Node 18+ (uses the built-in `node:test` runner). Zero dependencies. All extractor runs
force `--no-ctags` so symbol discovery is deterministic regardless of the host.

## What each suite locks in

| Suite | Invariant protected |
|-------|---------------------|
| `extract-symbols.test.mjs` | **The ambiguous-call fix.** A bare call (`log()`) to a name with ≥2 definitions and no import/same-file resolution is **dropped**, not wired to `byName[0]` (which fabricated the false `discord:log` super-hub, indeg 127→2). Single-def names still fall back; imports/same-file defs resolve authoritatively; the `meta` block is correct. |
| `cluster3.test.mjs` | **The de-hub decision.** Stripping high-in-degree hubs (indeg ≥ 12) from the clustering adjacency keeps callers in their **home directory** — a genuine utility hub otherwise bridges its callers into `lib`. Also: directory-derived domain names, meta carry-forward. |
| `overlap.test.mjs` | **Body-confirmed precision.** Same-name clusters are banded by token-shingle Jaccard of the real bodies: identical → `high`, partially diverged → `medium`/`drifted`, disjoint → `refuted`. CLI-scaffold names fold into one `shared-responsibility` finding. Structural fallback when source is absent. |
| `golden-ecc-scripts.test.mjs` | **The fix stays fixed on the real target** (`plugins/marketplaces/ecc/scripts`). Drift-robust (the target is a living tree): the max `log` in-degree stays genuine (<60), `discord/ecc-bot.mjs:log` sits at its real indeg of 2, and the legacy toggle resurrects the super-hub (≥100). |
| `pipeline.test.mjs` | **End-to-end orchestration.** `run.mjs` emits all five artifacts into an isolated workspace, carries the target label through every stage, surfaces the cross-domain duplicate, and renders a self-contained `report.html`. |
| `query.test.mjs` | **Structural query CLI** (`scripts/query.mjs`). `--callers`/`--callees` (direct call edges, import edges excluded), `--impact` (transitive reverse-call blast radius + domains; terminates on recursion/multi-seed), `--cycles` (file-level SCCs, deterministically ordered), `--orphans` (uncalled + unexported). Symbol resolves by id or bare label (multi-match → union); `--json` is byte-stable; exit codes 0/1/2 = success/not-found/usage; robust to missing fields + edgeless graphs. |
| `graph-ops.test.mjs` | **Shared graph primitives** (`scripts/lib/graph-ops.mjs`, imported by query + diff). Direct unit tests (not subprocess) pinning the pure functions: normalize defaults, call-vs-any-incoming index, symbol resolution, callers/callees, recursion-safe `impactOf`, iterative-Tarjan `fileCycles`, `orphans`. |
| `diff.test.mjs` | **Graph-delta / post-edit gate** (`scripts/diff.mjs`). nodes/edges/overlaps/cycles/orphans added+removed. Regression = new cycle ∨ new duplication ∨ existing-symbol-lost-all-callers (brand-new uncalled nodes are reported, not regressions; pure removals are not regressions). Overlap identity is content-keyed (stable across id/title churn). Exit 0/1/2. |
| `mcp.test.mjs` | **MCP stdio server** (`scripts/mcp-server.mjs`). JSON-RPC 2.0 over newline-delimited stdio: `initialize`/`tools/list`/`tools/call` shapes, the 5 tools + required-arg schemas, stdout purity, notifications get no response, unknown tool → -32602, unknown method → -32601, malformed JSON → -32700 + recovery, missing-arg → `isError`, clean exit on stdin close. |

## A/B regression levers (env toggles)

Two behavior-preserving env switches exist purely so the two load-bearing decisions can be tested
both ways. Both default to the shipped behavior:

- **`CODEWEB_LEGACY_FALLBACK=1`** (`extract-symbols.mjs`) — restore the pre-fix `byName[0]` wiring
  for unresolved multi-def bare calls. Proves the ambiguous-drop fix is load-bearing.
- **`CODEWEB_HUB_INDEG=<n>`** (`cluster3.mjs`) — override the de-hub threshold (default 12). Set it
  absurdly high to disable de-hub and watch callers bleed into their hubs' home dir.

## Golden test target

`golden-ecc-scripts.test.mjs` runs against a real on-disk tree. If that tree is absent the suite
**skips with a logged reason** (it never silently passes). Point it elsewhere with
`CODEWEB_GOLDEN_TARGET=/path/to/some/repo`.

> Note: the canonical `.live/` snapshot (1796 nodes / 2524 edges) is a point-in-time capture of a
> living target (`ecc/scripts`); a later extract drifts as that tree changes. That's why the golden
> test pins **invariants** (the super-hub stays dead), not snapshot counts.
