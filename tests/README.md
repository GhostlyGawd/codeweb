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
