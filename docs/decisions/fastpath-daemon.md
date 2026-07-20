# Decision: no resident daemon — sidecar for the hook, subprocess floor for the rest

**Status: NO-GO on the daemon. SHIPPED: the pre-edit sidecar (Spec P). Date: 2026-07-20, from
the Spec K/N/O-1 measurement set at 16k symbols (TypeScript src, bench/results/scale-typescript.json).**

## The per-call costs the daemon was supposed to fix (measured, 16k symbols)

| surface | cost per call | what it is |
|---|---|---|
| CLI query (impact/callers/cycles/orphans) | 155–192ms | node boot + 13.5MB graph parse + query |
| pre-edit hook (graph path) | ~350ms | node boot + graph parse + explain subprocess (parses again) |
| pre-edit hook (sidecar path, shipped) | **~52ms** | node boot + 213KB sidecar read |
| post-edit hook | ~4.2s | full-target re-extract (scan-cache-riding) + regression compare |
| PR gate | 2 × pipeline | dominated by extract + (pre-O-1) optimize; not per-call parse |
| MCP tools | ~6.5ms | already in-process, graph cached — the daemon already exists here |

Node boot alone is ~45–50ms of every subprocess number above.

## Why NO-GO

1. **The wrong-answer risk is asymmetric.** A resident daemon serving impact/gate answers
   against a stale graph is *wrong*, not slow — and staleness windows are exactly when agents
   edit. codeweb's whole contract is that structural answers are trustworthy; the daemon's
   failure mode attacks the contract to save ~150–300ms on surfaces that are per-command, not
   per-edit.
2. **The only per-edit surface is already at the floor.** The pre-edit hook was the one
   per-edit consumer, and the sidecar takes it to ~52ms, of which ~50ms is node boot — a daemon
   cannot beat the boot cost of the hook process that would talk to it.
3. **The remaining hot path is not parse-bound.** Post-O-1, re-map is 6.7s (63% extract);
   queries are 155–192ms each and used a few times per session, not per edit. The daemon's
   savings ceiling across a whole session is well under one re-map.
4. **Zero-dependency, zero-state ethos.** Socket lifecycle, cross-platform paths, orphaned
   daemons, and version skew between daemon and CLI are permanent costs against a bounded win.

**Revisit triggers:** a measured surface that calls ≥10×/edit; graphs ≥100MB where parse alone
exceeds ~1s; or an editor integration that needs sub-50ms interactive queries (that consumer
should embed the lib in-process — the MCP server's pattern — not spawn a daemon).

## What shipped instead (Spec P)

`index-lite.json`, written by the report stage next to graph.json, stamped with the graph's
mtime+size. Per file with in-repo dependents: symbol count, dependent-edge total, top symbol,
and the top symbol's pre-built explain card (assembled by `lib/explain-core.mjs` — the same
code the explain CLI runs, so hook output is byte-identical either path; pinned by
tests/hook-sidecar.test.mjs). The hook stats graph.json (never parses it) to validate the
stamp and falls back to the graph path on any mismatch — stale always means slower, never
wrong. 16k receipt: 213KB sidecar, hook ~350ms → ~52ms.

## Named, deliberately out of scope

The **post-edit hook's ~4.2s** at 16k is a full-target re-extract — inherent to its regression
check, not a parse tax a daemon or sidecar addresses. If it needs to shrink, the honest fix is
an extract-side one (baseline-fragment reuse: diff only the edited file's symbols against the
baseline fragment slice), specced separately with the same byte-identity discipline.
