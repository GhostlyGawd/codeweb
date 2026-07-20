# Spec P: resident-daemon go/no-go — a decision priced by the new numbers

## Problem
Every surface outside MCP (CLI queries, both hooks, the PR gate, CodeLens) pays node boot +
full graph parse per call — ~200ms at 16k symbols in the stale figures. A resident daemon
would make every surface milliseconds, but it adds the exact failure mode codeweb exists to
prevent: a stale server answering impact/gate queries against an old graph is **wrong**, not
just slow. This spec forces the decision to be made from measurements, not taste, and ships
the bounded alternative if that's where the numbers point.

## Behavior (testable contract)
1. **The decision record.** `docs/decisions/fastpath-daemon.md` states, from committed
   measurements (Spec K refresh + Spec O one-file-edit + per-call query ms):
   - per-call cost budget per surface (hook, CLI, gate, CodeLens) at 16k symbols;
   - what a daemon would save per surface vs what it risks (staleness windows, lifecycle,
     socket portability, zero-dependency ethos);
   - GO or NO-GO, with the number that decides it.
2. **If NO-GO (expected): the bounded alternative, only if hooks are measurably hot.**
   Hooks are the only per-edit surface. If the measured hook cost at 16k symbols exceeds
   ~50ms (a real tax on every agent edit), ship a **slim sidecar index**: at map time the
   pipeline writes `index-lite.json` (per-file: symbols, dependent counts, top dependents by
   fan-in — the exact fields the two hooks read), a few hundred KB instead of 13.5MB. Hooks
   load the sidecar when its pipeline stamp matches graph.json's, else fall back to
   graph.json. Identical hook output either path.
3. **If GO:** a session-scoped daemon design (SessionStart-spawned, socket in the workspace,
   graph-mtime-checked per request, dies with the session) gets its own spec before any code.
4. Either way the decision doc cites the measured numbers inline, so the next person can
   re-litigate it when the numbers change.

## Tests (TDD — only if the sidecar ships: tests/hook-sidecar.test.mjs)
- **P1 parity:** on fixtures, pre-edit and post-edit hook outputs are byte-identical whether
  served from index-lite.json or graph.json.
- **P2 staleness:** stamp mismatch (graph rebuilt, sidecar old) → hooks fall back to
  graph.json and say nothing wrong; missing sidecar → same.
- **P3 size/latency receipt:** at the TS-src scale row, sidecar bytes and hook wall-ms
  recorded in scale-typescript.json (hook path measured pre/post).

## Done when
Decision record committed with measured numbers; if sidecar warranted: tests pass, suite
green, hook latency receipt at scale committed; if daemon GO: follow-up spec exists and the
decision doc says why.
