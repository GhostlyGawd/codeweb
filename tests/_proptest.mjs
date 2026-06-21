// Property-test infrastructure — dependency-free (matches the harness ethos). A seeded PRNG makes
// every property run reproducible (a failing seed reproduces exactly), a small random-graph
// generator feeds structural properties, and INDEPENDENT naive edit-appliers give the SE-FAITHFUL
// property a second, obviously-correct code path to cross-check the feature against (composed with
// the pre-tested structuralRegressions oracle from graph-ops).

// mulberry32 — tiny deterministic PRNG. Seeded so a property failure is reproducible by seed.
export function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const int = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

// A small random graph: 3-8 function nodes spread over 2-4 files, random call/import/inherit edges.
// Deterministic given the rng. Node ids are unique by index.
export function randomGraph(rng) {
  const nNodes = int(rng, 3, 8);
  const nFiles = int(rng, 2, 4);
  const files = Array.from({ length: nFiles }, (_, i) => `d${i}/m.js`);
  const nodes = [];
  for (let i = 0; i < nNodes; i++) {
    const file = pick(rng, files);
    nodes.push({ id: `n${i}@${file}`, label: `s${i}`, kind: 'function', file, line: 1, loc: int(rng, 1, 9), exports: rng() < 0.5, domain: '' });
  }
  const ids = nodes.map((n) => n.id);
  const edges = []; const seen = new Set();
  for (const from of ids) for (const to of ids) {
    if (from === to) { // recursion: emit a self-call sometimes so merge/regression self-loop handling is exercised
      if (rng() < 0.08) { const k = `${from} ${to} call`; if (!seen.has(k)) { seen.add(k); edges.push({ from, to, kind: 'call' }); } }
      continue;
    }
    if (rng() < 0.22) {
      const kind = rng() < 0.8 ? 'call' : (rng() < 0.5 ? 'import' : 'inherit');
      const k = `${from} ${to} ${kind}`;
      if (seen.has(k)) continue; seen.add(k);
      edges.push({ from, to, kind });
    }
  }
  return { meta: {}, nodes, edges, domains: [], overlaps: [] };
}

// A random edit op over a graph. delete=1 node, merge=2-3 nodes (canonical=smallest id),
// move=1 node to an existing-or-new file.
export function randomOp(rng, graph) {
  const ids = graph.nodes.map((n) => n.id).sort();
  const files = [...new Set(graph.nodes.map((n) => n.file)), 'dNEW/x.js'];
  const kind = pick(rng, ['delete', 'merge', 'move']);
  if (kind === 'delete') return { kind: 'delete', ids: [pick(rng, ids)] };
  if (kind === 'move') return { kind: 'move', id: pick(rng, ids), to: pick(rng, files) };
  // merge: distinct 2-3 ids
  const shuffled = ids.slice();
  for (let i = shuffled.length - 1; i > 0; i--) { const j = int(rng, 0, i); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  const chosen = shuffled.slice(0, Math.min(int(rng, 2, 3), shuffled.length)).sort();
  return { kind: 'merge', ids: chosen, into: chosen[0] };
}

// ---- INDEPENDENT naive edit-appliers (the cross-check side of SE-FAITHFUL) -----------------
// Deliberately written the simplest possible way, separate from the feature's applyEdit, so a bug
// in the feature shows up as a structuralRegressions mismatch. Pure: never mutate the input.
export function naiveApply(graph, op) {
  if (op.kind === 'delete') {
    const s = new Set(op.ids);
    return { ...graph, nodes: graph.nodes.filter((n) => !s.has(n.id)), edges: graph.edges.filter((e) => !s.has(e.from) && !s.has(e.to)) };
  }
  if (op.kind === 'move') {
    return { ...graph, nodes: graph.nodes.map((n) => (n.id === op.id ? { ...n, file: op.to } : n)) };
  }
  // merge
  const s = new Set(op.ids); const map = (id) => (s.has(id) ? op.into : id);
  const nodes = graph.nodes.filter((n) => !(s.has(n.id) && n.id !== op.into));
  const seen = new Set(); const edges = [];
  for (const e of graph.edges) {
    const from = map(e.from), to = map(e.to);
    if (from === to) continue;
    const k = `${from} ${to} ${e.kind}`;
    if (seen.has(k)) continue; seen.add(k);
    edges.push({ from, to, kind: e.kind });
  }
  return { ...graph, nodes, edges };
}

// Independent raw-edge derivation of call in/out neighbors (the cross-check side of CP-COMPLETE).
export function rawCallers(graph, targetIds) {
  const t = new Set(targetIds);
  return [...new Set(graph.edges.filter((e) => e.kind === 'call' && t.has(e.to)).map((e) => e.from))].sort();
}
export function rawCallees(graph, targetIds) {
  const t = new Set(targetIds);
  return [...new Set(graph.edges.filter((e) => e.kind === 'call' && t.has(e.from)).map((e) => e.to))].sort();
}
