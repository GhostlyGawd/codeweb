// codeweb shared graph primitives — pure functions over a graph.json object (see graph-schema.md).
// Imported by scripts/query.mjs and scripts/diff.mjs so the call/cycle/orphan logic lives ONCE
// (codeweb dogfooding its own anti-duplication mission). No I/O, no process.exit — callers own
// those. Deterministic: every returned list is sorted.

const asArray = (x) => (Array.isArray(x) ? x : []);
const byIdLt = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// Test-file predicate (shared by find-similar, the extractor's test-edge classification, and the
// dead-code workflow — one truth). Matches `*.test.*`, `*.spec.*`, `*_test.*`, or a path segment
// `tests/` | `test/` | `__tests__/`. Forward-slashed relative paths.
export const isTestFile = (file) =>
  /(?:^|\/)(?:tests?|__tests__)\//.test(file || '') || /(?:\.test\.|\.spec\.|_test\.)/.test(file || '');

// Fill the same defaults build-report.mjs applies, so every consumer sees a well-formed graph.
export function normalizeGraph(graph) {
  const g = graph || {};
  g.meta = g.meta || {};
  g.nodes = asArray(g.nodes);
  g.edges = asArray(g.edges);
  g.domains = asArray(g.domains);
  g.overlaps = asArray(g.overlaps);
  for (const n of g.nodes) {
    if (n.domain == null || n.domain === '') n.domain = 'unassigned';
    if (typeof n.exports !== 'boolean') n.exports = false;
    if (n.file == null) n.file = '';
  }
  return g;
}

// Adjacency indexes. callIn/callOut are CALL edges only; hasIncoming tracks any call|import in-edge.
export function buildIndex(graph) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const callIn = new Map();
  const callOut = new Map();
  const inheritIn = new Map(); // reverse inherit: base -> {subclasses}, for impact reachability
  const hasIncoming = new Set();
  for (const e of graph.edges) {
    if (e.kind === 'call') {
      if (!callIn.has(e.to)) callIn.set(e.to, new Set());
      callIn.get(e.to).add(e.from);
      if (!callOut.has(e.from)) callOut.set(e.from, new Set());
      callOut.get(e.from).add(e.to);
    }
    if (e.kind === 'inherit') {
      if (!inheritIn.has(e.to)) inheritIn.set(e.to, new Set());
      inheritIn.get(e.to).add(e.from);
    }
    if (e.kind === 'call' || e.kind === 'import' || e.kind === 'inherit') hasIncoming.add(e.to);
  }
  return { byId, callIn, callOut, inheritIn, hasIncoming };
}

// Resolve a symbol to node ids: exact id wins; else every node whose label matches (sorted).
export function resolveSymbol(graph, sym) {
  if (graph.nodes.some((n) => n.id === sym)) return [sym];
  return graph.nodes.filter((n) => n.label === sym).map((n) => n.id).sort();
}

const unionSorted = (ids, adj) => {
  const out = new Set();
  for (const id of ids) for (const x of (adj.get(id) || [])) out.add(x);
  return [...out].sort();
};
export const callersOf = (index, ids) => unionSorted(ids, index.callIn);
export const calleesOf = (index, ids) => unionSorted(ids, index.callOut);

// Transitive reverse-call closure (blast radius) from all seeds, excluding the seeds themselves.
export function impactOf(index, seedIds) {
  const seeds = new Set(seedIds);
  const visited = new Set(seedIds);
  const queue = [...seedIds];
  while (queue.length) {
    const cur = queue.shift();
    // reverse-reachability over callers AND subclasses: changing a node affects what calls it and
    // what inherits from it.
    const upstream = [...(index.callIn.get(cur) || []), ...(index.inheritIn?.get(cur) || [])];
    for (const dep of upstream) {
      if (!visited.has(dep)) { visited.add(dep); queue.push(dep); }
    }
  }
  return [...visited].filter((id) => !seeds.has(id)).sort();
}

// File-level dependency cycles: strongly-connected components of size >= 2 in the file graph built
// from call+import edges. ITERATIVE Tarjan (explicit work stack) so deep graphs can't overflow the
// JS call stack. Deterministic: neighbors and the final list are sorted.
export function fileCycles(graph) {
  const fileOf = new Map(graph.nodes.map((n) => [n.id, n.file]));
  const adj = new Map();
  const files = new Set();
  for (const e of graph.edges) {
    if (e.kind !== 'call' && e.kind !== 'import' && e.kind !== 'inherit') continue;
    const f = fileOf.get(e.from), t = fileOf.get(e.to);
    if (!f || !t || f === t) continue;
    files.add(f); files.add(t);
    if (!adj.has(f)) adj.set(f, new Set());
    adj.get(f).add(t);
  }
  const neigh = (v) => [...(adj.get(v) || [])].sort();
  const idx = new Map(), low = new Map(), onStack = new Set(), sccStack = [];
  const out = [];
  let counter = 0;
  for (const root of [...files].sort()) {
    if (idx.has(root)) continue;
    idx.set(root, counter); low.set(root, counter); counter++; sccStack.push(root); onStack.add(root);
    const work = [{ v: root, ns: neigh(root), i: 0 }];
    while (work.length) {
      const frame = work[work.length - 1];
      if (frame.i < frame.ns.length) {
        const w = frame.ns[frame.i++];
        if (!idx.has(w)) {
          idx.set(w, counter); low.set(w, counter); counter++; sccStack.push(w); onStack.add(w);
          work.push({ v: w, ns: neigh(w), i: 0 });
        } else if (onStack.has(w)) {
          low.set(frame.v, Math.min(low.get(frame.v), idx.get(w)));
        }
      } else {
        if (low.get(frame.v) === idx.get(frame.v)) {
          const comp = []; let w;
          do { w = sccStack.pop(); onStack.delete(w); comp.push(w); } while (w !== frame.v);
          if (comp.length >= 2) out.push(comp.sort());
        }
        work.pop();
        if (work.length) {
          const parent = work[work.length - 1].v;
          low.set(parent, Math.min(low.get(parent), low.get(frame.v)));
        }
      }
    }
  }
  return out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

// Dead-code candidates: no incoming call|import edge AND not exported. Sorted by id.
export function orphans(graph, index) {
  return graph.nodes
    .filter((n) => n.kind !== 'module' && !index.hasIncoming.has(n.id) && !n.exports)
    .map((n) => ({ id: n.id, file: n.file, domain: n.domain }))
    .sort(byIdLt);
}

// Edges-only structural regressions between two snapshots — the fast subset the post-edit hook
// checks (re-extraction gives nodes+edges, not domains/overlaps): a file-level cycle present in
// `after` but not `before`, and a symbol that EXISTS in both but lost ALL its callers (deleting a
// symbol entirely is not a regression — only a surviving-but-orphaned one is). Duplication and
// coupling deltas need the full pipeline; that stays diff.mjs.
export function structuralRegressions(before, after) {
  const b = normalizeGraph(before), a = normalizeGraph(after);
  const cycleKey = (c) => c.join('|');
  const beforeCycles = new Set(fileCycles(b).map(cycleKey));
  const newCycles = fileCycles(a).filter((c) => !beforeCycles.has(cycleKey(c)));
  const bi = buildIndex(b), ai = buildIndex(a);
  const afterIds = new Set(a.nodes.map((n) => n.id));
  const lostCallers = [];
  for (const [id, callers] of bi.callIn) {
    if (callers.size && afterIds.has(id) && !(ai.callIn.get(id)?.size)) lostCallers.push(id);
  }
  return { newCycles, lostCallers: lostCallers.sort() };
}

// Pure structural edit simulation — models delete / merge / move on a DEEP COPY of the graph and
// never mutates its argument, so simulate-edit and optimize build the hypothetical graph through
// ONE path (codeweb dogfooding "logic lives once"). Returns a normalized graph; overlaps are
// dropped (they'd be stale — recompute via the pipeline if needed).
//   op = { kind:'delete', ids:[...] } | { kind:'merge', ids:[...], into } | { kind:'move', id, to }
export function applyEdit(graph, op) {
  const g = normalizeGraph(structuredClone(graph)); // clone first: normalizeGraph mutates, the input must not change
  const base = { meta: g.meta, domains: g.domains, overlaps: [] };
  if (op.kind === 'delete') {
    const drop = new Set(op.ids);
    return normalizeGraph({ ...base,
      nodes: g.nodes.filter((n) => !drop.has(n.id)),
      edges: g.edges.filter((e) => !drop.has(e.from) && !drop.has(e.to)) });
  }
  if (op.kind === 'move') {
    return normalizeGraph({ ...base,
      nodes: g.nodes.map((n) => (n.id === op.id ? { ...n, file: op.to } : n)),
      edges: g.edges });
  }
  if (op.kind === 'merge') {
    const copies = new Set(op.ids);
    const map = (id) => (copies.has(id) ? op.into : id);
    const nodes = g.nodes.filter((n) => !(copies.has(n.id) && n.id !== op.into));
    const seen = new Set(); const edges = [];
    for (const e of g.edges) {
      const from = map(e.from), to = map(e.to);
      if (from === to) continue;               // self-loop (incl. merged-into-itself) -> dropped
      const k = `${from} ${to} ${e.kind}`;
      if (seen.has(k)) continue; seen.add(k);   // de-dup redirected edges
      edges.push({ from, to, kind: e.kind });
    }
    return normalizeGraph({ ...base, nodes, edges });
  }
  throw new Error(`applyEdit: unknown op kind '${op && op.kind}'`);
}
