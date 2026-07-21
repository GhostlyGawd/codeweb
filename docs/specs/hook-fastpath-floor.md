# Spec R: the post-edit hook's fast-path floor (baseline-fragment reuse, landed form)

**Status: SHIPPED with the perf-quality round (findings 10, 17, 18). Date: 2026-07-21.
This is the "baseline-fragment reuse" spec `docs/decisions/fastpath-daemon.md` called for —
in its final shape the reuse rides the scan cache's stamp tier rather than a bespoke
fragment-splice, which turned out to serve every extract consumer, not just the hook.**

## Problem

The PostToolUse hook ran a full-target re-extract on every edit: 4.2s per edit at the 16k-symbol
benchmark, 744–815ms on codeweb itself — the single largest recurring latency in the product.
Three separable causes, three fixes:

1. **The first run after every map was fully COLD** — run.mjs, the hook, and refresh each used a
   different scan-cache filename (and the hook alone passed `--no-ctags`, flipping the cache's
   engine namespace on ctags machines and diffing a regex fragment against a ctags baseline).
   *Fix (finding 17): one `SCAN_CACHE_NAME`, one engine-flag policy.*
2. **A warm extract still read, hashed, split, and masked every byte** — the cache only skipped
   symbol discovery; "warm" recovered ~15%.
   *Fix (finding 10): the stamp tier. The cache stores every per-file product (nodes with
   extents/signatures/complexity, ranges, dynamic flag, re-export table, bindings, edges) under
   an mtime+size stamp; a matching stamp reuses everything with one stat and no read. This IS
   baseline-fragment reuse — per-file fragments, spliced by the cache, for every consumer.*
3. **The hook round-tripped the fragment through a pid-named temp file** it never deleted
   (~1.2MB leaked to the OS tmpdir per edit, forever), and every run — changed or not —
   re-stringified and re-wrote the multi-MB cache.
   *Fix (finding 18): the fragment streams back on stdout (no temp file at all), and the cache
   write-back is skipped when no entry changed (`cacheDirty`).*

## Measured (loaded corpus: 400 files / 8,804 nodes / 52k edges, this container)

| step | cost | note |
|---|---|---|
| cold map extract | 3,350ms | populates the cache |
| hook child extract, body-only edit | ~520–600ms | stat sweep + 1 file scan + cache parse (9.4MB) + fragment to stdout + cache write |
| hook child extract, no-change | ~510ms → see below | dirty-skip removes the cache write |
| baseline graph parse (hook side) | 88ms | 5.6MB graph.json |
| fragment parse (hook side) | 54ms | stdout capture |
| structuralRegressions | 204ms | buildIndex ×2 + fileCycles ×2 |
| **hook end-to-end (warm, after)** | **~800ms** | was ~4s-class at this scale (full re-extract + compare) |

On codeweb's own map the same path now sits well under the pre-edit sidecar's documented ~52ms
floor multiple: the dominant residual terms at scale are (a) the child-process boundary — node
boot + cache JSON parse + fragment serialize/parse, and (b) `structuralRegressions`' two full
`buildIndex` + `fileCycles` passes.

## Behavior (testable contract)

- One cache file per workspace (`tests/cache-unification.test.mjs`): after map + hook + refresh,
  exactly `SCAN_CACHE_NAME` exists; a no-change refresh reports `scanned: 0`.
- The hook writes NO temp files (`tests/post-edit-diff.test.mjs` tripwire, finding 22).
- A no-change extract leaves the cache bytes untouched (dirty-skip); any read-path file, any
  recomputed per-file product, or any signature drift restores the write.
- Same-engine diffing: the hook extracts with run.mjs's flags, so baseline and fragment always
  come from the same engine.

## Revisit triggers

- Hook end-to-end > 1.5s at the 16k benchmark → implement in-process extraction (finding 25's
  decomposition makes the extractor importable; kills node boot + cache parse + fragment
  serialize/parse ≈ half the residual).
- `structuralRegressions` > 500ms at scale → incremental regression check (persist the baseline's
  file-pair table via `createMergeSimulator`'s shape and diff pairs, not graphs).
- Anything here regresses → `bench/all.mjs` stage factors (finding 13) catch extract; the hook
  path itself is exercised by `tests/post-edit-diff.test.mjs` + `tests/cache-unification.test.mjs`.
