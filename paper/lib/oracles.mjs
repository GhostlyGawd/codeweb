import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// codeweb effectiveness study — INDEPENDENT correctness oracles (Theme 2 / C2-query-correctness).
//
// These functions are a *second, from-scratch* implementation of the structural definitions codeweb
// ships in scripts/lib/graph-ops.mjs. They DELIBERATELY DO NOT import graph-ops — the whole point of
// an oracle is that a bug in graph-ops cannot hide behind the same code computing "truth". We
// replicate codeweb's *definitions* (which edge kinds build the file graph, self-loop handling, which
// reverse edges form the blast radius) with our own algorithms (Kosaraju instead of Tarjan; a plain
// BFS written here). Replicating the definition is correct and required; reusing the implementation
// is forbidden.
//
// Definitions, read off the graph-ops SOURCE (not its stale "call+import" comments):
//   * file-level cycle  = strongly-connected component of size >= 2 in the FILE graph whose directed
//     edges are { fileOf(e.from) -> fileOf(e.to) } for every edge of kind call | import | inherit,
//     dropping intra-file edges (fileOf(from) === fileOf(to)). (graph-ops.fileCycles, lines ~134-179.)
//   * impact(seeds)     = transitive REVERSE reachability over call-in AND inherit-in edges
//     (changing a node affects what CALLS it and what INHERITS from it), excluding the seeds
//     themselves. (graph-ops.impactOf, lines ~89-103.)
//
// Self-test: `node paper/lib/oracles.mjs` checks these against 3 tiny hand-verified graphs (including
// a known-FAILING perturbation, to prove the oracle can distinguish right from wrong) and exits
// non-zero on any mismatch — the oracle cannot silently drift.

const asArray = (x) => (Array.isArray(x) ? x : []);

// File of a node, from its `file` field (matches graph-ops, which keys on n.file, NOT the id prefix).
function fileOfMap(graph) {
  const m = new Map();
  for (const n of asArray(graph.nodes)) m.set(n.id, n.file == null ? '' : n.file);
  return m;
}

// ---- INDEPENDENT file-level SCC via Kosaraju (two-pass DFS) -------------------------------------
// Step 1: DFS the forward graph, pushing each vertex on a stack at finish time.
// Step 2: DFS the TRANSPOSE graph in reverse-finish order; each DFS tree is one SCC.
// Then keep SCCs of size >= 2 (a singleton is a cycle in graph-ops's model only if self-looping, and
// self-file edges are dropped, so singletons never qualify). Deterministic: sorted everywhere.
// Iterative DFS (explicit stacks) so a deep file graph can't overflow — independent of graph-ops's
// own iterative trick, but the same hazard, handled separately.
export function oracleFileCycles(graph) {
  const fileOf = fileOfMap(graph);
  const fwd = new Map();   // file -> Set(file) forward edges
  const rev = new Map();   // file -> Set(file) transpose edges
  const files = new Set();
  const addEdge = (adj, a, b) => { if (!adj.has(a)) adj.set(a, new Set()); adj.get(a).add(b); };
  for (const e of asArray(graph.edges)) {
    if (e.kind !== 'call' && e.kind !== 'import' && e.kind !== 'inherit') continue;
    const f = fileOf.get(e.from), t = fileOf.get(e.to);
    if (!f || !t || f === t) continue; // intra-file and edges to unknown nodes are ignored
    files.add(f); files.add(t);
    addEdge(fwd, f, t);
    addEdge(rev, t, f);
  }
  const order = [];            // finish-time order from pass 1
  const seen1 = new Set();
  const neigh = (adj, v) => [...(adj.get(v) || [])].sort();
  // Pass 1: iterative post-order DFS over the forward graph.
  for (const root of [...files].sort()) {
    if (seen1.has(root)) continue;
    const stack = [{ v: root, ns: neigh(fwd, root), i: 0 }];
    seen1.add(root);
    while (stack.length) {
      const fr = stack[stack.length - 1];
      if (fr.i < fr.ns.length) {
        const w = fr.ns[fr.i++];
        if (!seen1.has(w)) { seen1.add(w); stack.push({ v: w, ns: neigh(fwd, w), i: 0 }); }
      } else { order.push(fr.v); stack.pop(); } // finished -> record
    }
  }
  // Pass 2: DFS the transpose in reverse finish order; each tree = one SCC.
  const seen2 = new Set();
  const comps = [];
  for (let k = order.length - 1; k >= 0; k--) {
    const root = order[k];
    if (seen2.has(root)) continue;
    const comp = [];
    const stack = [root];
    seen2.add(root);
    while (stack.length) {
      const v = stack.pop();
      comp.push(v);
      for (const w of neigh(rev, v)) if (!seen2.has(w)) { seen2.add(w); stack.push(w); }
    }
    if (comp.length >= 2) comps.push(comp.sort());
  }
  return comps.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

// ---- INDEPENDENT reverse-reachability BFS (impact / blast radius) -------------------------------
// Build reverse adjacency over call AND inherit edges (predecessor sets), then BFS out from all
// seeds at once. Return everything reached MINUS the seeds, sorted. (Matches graph-ops.impactOf.)
export function oracleImpact(graph, seedIds) {
  const pred = new Map(); // node -> Set(nodes that call-or-inherit-from it) i.e. reverse call+inherit
  const addPred = (to, from) => { if (!pred.has(to)) pred.set(to, new Set()); pred.get(to).add(from); };
  for (const e of asArray(graph.edges)) {
    if (e.kind === 'call' || e.kind === 'inherit') addPred(e.to, e.from);
  }
  const seeds = new Set(seedIds);
  const visited = new Set(seedIds);
  const queue = [...seedIds];
  while (queue.length) {
    const cur = queue.shift();
    for (const up of (pred.get(cur) || [])) {
      if (!visited.has(up)) { visited.add(up); queue.push(up); }
    }
  }
  return [...visited].filter((id) => !seeds.has(id)).sort();
}

// ---- INDEPENDENT raw call-edge neighbor sets (A-CALL) -------------------------------------------
// codeweb's callers/callees are call-edge in/out neighbors. These mirror _proptest.rawCallers/
// rawCallees exactly; kept here too so the oracle file is self-contained, and cross-checked against
// _proptest in the self-test (any divergence between the two independent derivations fails loudly).
export function oracleCallers(graph, targetIds) {
  const t = new Set(targetIds);
  return [...new Set(asArray(graph.edges).filter((e) => e.kind === 'call' && t.has(e.to)).map((e) => e.from))].sort();
}
export function oracleCallees(graph, targetIds) {
  const t = new Set(targetIds);
  return [...new Set(asArray(graph.edges).filter((e) => e.kind === 'call' && t.has(e.from)).map((e) => e.to))].sort();
}

// ---- INDEPENDENT test-edge in-neighbors (A-TESTS) -----------------------------------------------
// `query --tests X` returns the test-file nodes that reference X (the reverse `test` edges). The
// extractor reclassifies a call from a test file to a non-test symbol as a `test` edge; here we just
// read those edges back, independently of graph-ops.testersOf.
export function oracleTesters(graph, targetIds) {
  const t = new Set(targetIds);
  return [...new Set(asArray(graph.edges).filter((e) => e.kind === 'test' && t.has(e.to)).map((e) => e.from))].sort();
}

// ---- INDEPENDENT symbol resolution (bare label -> ids) ------------------------------------------
// Mirrors graph-ops.resolveSymbol: exact id wins, else every node whose label matches, sorted. Used
// so the oracle seeds impact/callers from the SAME node set the CLI would, isolating the algorithm
// under test rather than re-testing resolution.
export function oracleResolve(graph, sym) {
  const nodes = asArray(graph.nodes);
  if (nodes.some((n) => n.id === sym)) return [sym];
  return nodes.filter((n) => n.label === sym).map((n) => n.id).sort();
}

// ---- self-test ----------------------------------------------------------------------------------
const isMain = (() => { try { return fileURLToPath(import.meta.url) === resolve(process.argv[1] || ''); } catch { return false; } })();
if (isMain) {
  const fail = [];
  const eq = (a, b, msg) => { const sa = JSON.stringify(a), sb = JSON.stringify(b); if (sa !== sb) fail.push(`${msg}: got ${sa} want ${sb}`); };

  // --- Tiny graph 1: a 3-file cycle A->B->C->A plus a non-cyclic spur, hand-verified. -----------
  // files: a.js, b.js, c.js, d.js. Edges chain a->b->c->a (cycle) and d->a (spur, not in cycle).
  const g1 = {
    nodes: [
      { id: 'a.js:fa', label: 'fa', file: 'a.js' },
      { id: 'b.js:fb', label: 'fb', file: 'b.js' },
      { id: 'c.js:fc', label: 'fc', file: 'c.js' },
      { id: 'd.js:fd', label: 'fd', file: 'd.js' },
    ],
    edges: [
      { from: 'a.js:fa', to: 'b.js:fb', kind: 'call' },
      { from: 'b.js:fb', to: 'c.js:fc', kind: 'import' },
      { from: 'c.js:fc', to: 'a.js:fa', kind: 'inherit' },
      { from: 'd.js:fd', to: 'a.js:fa', kind: 'call' },
    ],
  };
  eq(oracleFileCycles(g1), [['a.js', 'b.js', 'c.js']], 'cycle1 3-file SCC across mixed edge kinds');
  // impact of fa = reverse reachability over call+inherit ONLY (import is excluded by the definition).
  // Reverse from fa: preds(fa)={c.js:fc (inherit), d.js:fd (call)}. The only in-edge to fc is the
  // IMPORT fb->fc, which is NOT a call/inherit edge, so fc has no reverse predecessor and fb is NOT
  // reached. preds(fd)={}. So impact(fa) = {fc, fd}. (Confirms import edges don't carry impact.)
  eq(oracleImpact(g1, ['a.js:fa']), ['c.js:fc', 'd.js:fd'], 'impact1 reverse call+inherit closure (import excluded)');

  // --- KNOWN-FAILING control: the SAME graph but with the closing edge REMOVED breaks the cycle. -
  // This proves the oracle can FAIL — it must report no cycle here, distinct from g1's one cycle.
  const g1broken = { nodes: g1.nodes, edges: g1.edges.filter((e) => e.from !== 'c.js:fc') };
  eq(oracleFileCycles(g1broken), [], 'cycle1-broken: removing the back-edge yields NO cycle (falsifiable)');
  if (JSON.stringify(oracleFileCycles(g1)) === JSON.stringify(oracleFileCycles(g1broken))) {
    fail.push('oracle is VACUOUS: cyclic and acyclic graphs are indistinguishable');
  }

  // --- Tiny graph 2: self-file edge must be ignored; only cross-file import cycle counts. --------
  const g2 = {
    nodes: [
      { id: 'x.js:fx', label: 'fx', file: 'x.js' },
      { id: 'x.js:gx', label: 'gx', file: 'x.js' }, // same file as fx
      { id: 'y.js:fy', label: 'fy', file: 'y.js' },
    ],
    edges: [
      { from: 'x.js:fx', to: 'x.js:gx', kind: 'call' },  // intra-file: dropped from file graph
      { from: 'x.js:fx', to: 'y.js:fy', kind: 'import' },
      { from: 'y.js:fy', to: 'x.js:fx', kind: 'import' }, // x<->y cycle
    ],
  };
  eq(oracleFileCycles(g2), [['x.js', 'y.js']], 'cycle2 self-file edge ignored, x<->y kept');

  // --- Tiny graph 3: a self-CALL (recursion) must not hang impact BFS, and the seed is excluded. -
  const g3 = {
    nodes: [
      { id: 'r.js:loop', label: 'loop', file: 'r.js' },
      { id: 'r.js:caller', label: 'caller', file: 'r.js' },
    ],
    edges: [
      { from: 'r.js:loop', to: 'r.js:loop', kind: 'call' },   // self-loop
      { from: 'r.js:caller', to: 'r.js:loop', kind: 'call' },
    ],
  };
  eq(oracleImpact(g3, ['r.js:loop']), ['r.js:caller'], 'impact3 self-loop terminates, seed excluded');
  // a self-call is intra-file -> no file cycle.
  eq(oracleFileCycles(g3), [], 'cycle3 self-call is intra-file -> no cycle');

  // --- callers/callees/testers/resolve on g1+a test edge ---------------------------------------
  const g4 = {
    nodes: [
      { id: 'p.js:target', label: 'target', file: 'p.js' },
      { id: 'p.js:caller', label: 'caller', file: 'p.js' },
      { id: 't.test.js:t', label: 't', file: 't.test.js' },
      { id: 'q.js:target', label: 'target', file: 'q.js' }, // ambiguous label "target"
    ],
    edges: [
      { from: 'p.js:caller', to: 'p.js:target', kind: 'call' },
      { from: 't.test.js:t', to: 'p.js:target', kind: 'test' },
    ],
  };
  eq(oracleCallers(g4, ['p.js:target']), ['p.js:caller'], 'callers raw call in-neighbors');
  eq(oracleCallees(g4, ['p.js:caller']), ['p.js:target'], 'callees raw call out-neighbors');
  eq(oracleTesters(g4, ['p.js:target']), ['t.test.js:t'], 'testers raw test in-neighbors');
  eq(oracleResolve(g4, 'target'), ['p.js:target', 'q.js:target'], 'resolve ambiguous label -> all, sorted');
  eq(oracleResolve(g4, 'p.js:target'), ['p.js:target'], 'resolve exact id -> just it');

  // Cross-check our raw-edge derivations against _proptest's independent ones (defense in depth):
  // any divergence between two independently written oracles is itself a bug.
  const { rawCallers, rawCallees } = await import('../../tests/_proptest.mjs');
  if (JSON.stringify(oracleCallers(g4, ['p.js:target'])) !== JSON.stringify(rawCallers(g4, ['p.js:target']))) fail.push('oracleCallers != _proptest.rawCallers');
  if (JSON.stringify(oracleCallees(g4, ['p.js:caller'])) !== JSON.stringify(rawCallees(g4, ['p.js:caller']))) fail.push('oracleCallees != _proptest.rawCallees');

  if (fail.length) { console.error('ORACLES SELF-TEST FAILED:\n  ' + fail.join('\n  ')); process.exit(1); }
  console.log('oracles self-test: OK (Kosaraju SCC, reverse-reach BFS, callers/callees/testers/resolve; falsifiable control passed)');
}
