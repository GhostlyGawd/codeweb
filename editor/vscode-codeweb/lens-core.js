'use strict';
// codeweb CodeLens — pure logic, kept free of the vscode API so node:test can pin it, and
// self-contained (no imports from scripts/lib) so the extension folder installs on its own.
// Semantics mirror the product tools exactly: `callers` = reverse `call` edges (what
// codeweb_callers counts), `blast` = the codeweb_impact closure (transitive callers +
// subclasses, seed excluded). A different number in the editor than over MCP would be a bug.

const EMPTY = new Set();

/**
 * Parse a graph object into the per-file lens index.
 * `prevIndex` (finding #38): the index from the pre-refresh graph. When present, blastMemo entries
 * whose blast provably cannot have changed are carried across the rebuild instead of recomputed —
 * a refresh usually touches a few edges, and recomputing every symbol's transitive closure from
 * scratch is the wasted work the old `refresh()`-clears-everything path paid every save.
 */
function buildLensIndex(graph, prevIndex) {
  const byFile = new Map();
  for (const n of graph.nodes || []) {
    if (n.kind !== 'function' && n.kind !== 'class' && n.kind !== 'method') continue;
    if (!n.file || !n.line) continue;
    if (!byFile.has(n.file)) byFile.set(n.file, []);
    byFile.get(n.file).push(n);
  }
  for (const arr of byFile.values()) arr.sort((a, b) => a.line - b.line);
  const callIn = new Map(), inheritIn = new Map();
  for (const e of graph.edges || []) {
    const m = e.kind === 'call' ? callIn : e.kind === 'inherit' ? inheritIn : null;
    if (!m) continue;
    if (!m.has(e.to)) m.set(e.to, new Set());
    m.get(e.to).add(e.from);
  }
  const index = { root: (graph.meta && graph.meta.root) || null, byFile, callIn, inheritIn, blastMemo: new Map() };
  if (prevIndex) carryMemo(index, prevIndex, graph);
  return index;
}

/**
 * Blast radius (codeweb_impact): transitive reverse reachability over callers + subclasses.
 * finding #38: mirrors graph-ops's impactCountOf shape — an index-pointer queue (never `shift()`,
 * which re-indexes the whole array per pop → O(frontier²) on deep radii) and direct Set iteration
 * (never `[...callIn, ...inheritIn]`, which allocates a merged array per visit). Same numbers as
 * before; the walk is the only thing that changed. blastMemo dedups repeat queries for one id.
 */
function blastOf(index, id) {
  if (index.blastMemo.has(id)) return index.blastMemo.get(id);
  const visited = new Set([id]);
  const queue = [id];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    const callers = index.callIn.get(cur);
    if (callers) for (const dep of callers) if (!visited.has(dep)) { visited.add(dep); queue.push(dep); }
    const subs = index.inheritIn.get(cur);
    if (subs) for (const dep of subs) if (!visited.has(dep)) { visited.add(dep); queue.push(dep); }
  }
  const n = visited.size - 1; // the seed is not its own blast
  index.blastMemo.set(id, n);
  return n;
}

/** from→to call+inherit adjacency, inverted from the reverse-edge maps the index already holds. */
function forwardAdj(callIn, inheritIn) {
  const fwd = new Map();
  for (const m of [callIn, inheritIn]) {
    for (const [to, froms] of m) {
      for (const from of froms) {
        let s = fwd.get(from);
        if (!s) { s = new Set(); fwd.set(from, s); }
        s.add(to);
      }
    }
  }
  return fwd;
}

/**
 * Carry the still-valid blastMemo entries from `prev` into the freshly built `index` (finding #38).
 *
 * Invalidation key. A blast value blast(Y) is |{X : X reaches Y over forward call+inherit edges}|;
 * it can only change if some forward edge on some path INTO Y was added or removed. Compute the edge
 * delta by diffing the reverse-edge in-sets (callIn/inheritIn) old↔new — this subsumes "edges of
 * added/removed nodes": a new node's in-edges surface as a fresh `to` key, its out-edges as new
 * `from`s under existing `to` keys, and removals symmetrically. The seed of each delta edge (A→B)
 * is its `to` endpoint B, because adding/removing A→B moves blast(Y) only for Y reachable FORWARD
 * from B. The invalid set is the forward closure of all seeds over the NEW graph's call+inherit
 * from→to adjacency.
 *
 * Soundness (why the new-graph closure suffices, incl. removals): take any path witnessing a changed
 * blast; its suffix past the LAST delta edge contains no delta edges, so that suffix exists in the
 * new graph, and its start (the last delta edge's `to`) is a seed — hence every Y whose blast could
 * move is in the new-graph forward closure of the seeds. Carry memo[id] iff id ∉ invalid and id
 * still exists as a node.
 */
function carryMemo(index, prev, graph) {
  const prevMemo = prev && prev.blastMemo;
  if (!prevMemo || prevMemo.size === 0) return;
  const seeds = new Set();
  for (const [now, was] of [[index.callIn, prev.callIn || EMPTY], [index.inheritIn, prev.inheritIn || EMPTY]]) {
    for (const to of new Set([...now.keys(), ...was.keys()])) {
      const a = now.get(to) || EMPTY, b = was.get(to) || EMPTY;
      if (a.size !== b.size) { seeds.add(to); continue; }
      for (const f of a) if (!b.has(f)) { seeds.add(to); break; }
    }
  }
  const invalid = new Set(seeds);
  if (seeds.size) {
    const fwd = forwardAdj(index.callIn, index.inheritIn);
    const q = [...seeds];
    for (let i = 0; i < q.length; i++) {
      const outs = fwd.get(q[i]);
      if (outs) for (const nxt of outs) if (!invalid.has(nxt)) { invalid.add(nxt); q.push(nxt); }
    }
  }
  const alive = new Set((graph.nodes || []).map((n) => n.id));
  for (const [id, v] of prevMemo) if (!invalid.has(id) && alive.has(id)) index.blastMemo.set(id, v);
}

/**
 * Lenses for one repo-relative file: [{id, label, line, callers, blast}], line-sorted.
 * opts.minCallers hides sub-threshold symbols (0 = show everything mapped).
 */
function lensesForFile(index, rel, opts = {}) {
  const min = opts.minCallers || 0;
  const out = [];
  for (const n of index.byFile.get(rel) || []) {
    const callers = (index.callIn.get(n.id) || new Set()).size;
    if (callers < min) continue;
    out.push({ id: n.id, label: n.label, line: n.line, callers, blast: blastOf(index, n.id) });
  }
  return out;
}

module.exports = { buildLensIndex, blastOf, lensesForFile };
