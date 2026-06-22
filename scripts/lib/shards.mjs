// codeweb graph sharding (F10) — split a graph into per-shard subgraphs + a cross-shard boundary edge
// index, for monorepo-scale graphs too big to hold in memory at once. The contract: sharding changes
// only WHAT must be loaded, never the ANSWER. callers/callees of a symbol are LOCAL (its shard +
// boundary edges touching it); transitive impact walks the boundary across shards. Pure, deterministic.
//
// SH-ANSWER-PRESERVING: shardCallersOf/shardCalleesOf/shardImpactOf equal the monolithic graph-ops
// answers. SH-LOSSLESS: mergeShards(splitGraph(g)) restores g exactly. SH-PARTITION: every node in one
// shard; every edge intra-shard XOR boundary.

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const edgeKey = (e) => `${e.from} ${e.to} ${e.kind}`;
const byEdge = (a, b) => (edgeKey(a) < edgeKey(b) ? -1 : edgeKey(a) > edgeKey(b) ? 1 : 0);

// Shard key for a node: by domain (node.domain), or by the first path segment of its file (dir/package).
function keyFn(by) {
  if (by === 'domain') return (n) => (n.domain && n.domain !== '' ? n.domain : 'unassigned');
  return (n) => { const f = n.file || ''; const i = f.indexOf('/'); return i === -1 ? '(root)' : f.slice(0, i); };
}

export function splitGraph(graph, by = 'dir') {
  const key = keyFn(by);
  const shardOf = new Map(graph.nodes.map((n) => [n.id, key(n)]));
  const shardMap = new Map();
  const ensure = (k) => { if (!shardMap.has(k)) shardMap.set(k, { key: k, nodes: [], edges: [] }); return shardMap.get(k); };
  for (const n of graph.nodes) ensure(shardOf.get(n.id)).nodes.push(n);
  const boundary = [];
  for (const e of graph.edges) {
    const sf = shardOf.get(e.from), st = shardOf.get(e.to);
    if (sf != null && st != null && sf === st) ensure(sf).edges.push(e); // intra-shard
    else boundary.push(e);                                                // cross-shard (or dangling)
  }
  const shards = [...shardMap.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  for (const s of shards) { s.nodes.sort(byId); s.edges.sort(byEdge); }
  boundary.sort(byEdge);
  return { by, shards, boundary };
}

export function mergeShards(split) {
  const seenN = new Set(), nodes = [];
  for (const s of split.shards) for (const n of s.nodes) if (!seenN.has(n.id)) { seenN.add(n.id); nodes.push(n); }
  const seenE = new Set(), edges = [];
  const add = (e) => { const k = edgeKey(e); if (!seenE.has(k)) { seenE.add(k); edges.push(e); } };
  for (const s of split.shards) for (const e of s.edges) add(e);
  for (const e of split.boundary) add(e);
  nodes.sort(byId); edges.sort(byEdge);
  return { meta: {}, nodes, edges, domains: [], overlaps: [] };
}

// id -> its shard (built once per query; shard-scale graphs make this cheap).
const indexShards = (split) => { const m = new Map(); for (const s of split.shards) for (const n of s.nodes) m.set(n.id, s); return m; };

// Direct call-edge in-neighbors: id's own shard intra edges + boundary edges into id. LOCAL load.
export function shardCallersOf(split, id) {
  const s = indexShards(split).get(id);
  const out = new Set();
  if (s) for (const e of s.edges) if (e.kind === 'call' && e.to === id) out.add(e.from);
  for (const e of split.boundary) if (e.kind === 'call' && e.to === id) out.add(e.from);
  return [...out].sort();
}

export function shardCalleesOf(split, id) {
  const s = indexShards(split).get(id);
  const out = new Set();
  if (s) for (const e of s.edges) if (e.kind === 'call' && e.from === id) out.add(e.to);
  for (const e of split.boundary) if (e.kind === 'call' && e.from === id) out.add(e.to);
  return [...out].sort();
}

// Transitive reverse-call + inherit closure (blast radius), walking boundary edges across shards.
// A production loader would lazy-load only the shards reached; the answer is identical to the monolith
// graph-ops.impactOf either way (that equivalence is the SH-ANSWER-PRESERVING lock).
export function shardImpactOf(split, id) {
  const callIn = new Map(), inheritIn = new Map();
  const add = (m, to, from) => { if (!m.has(to)) m.set(to, new Set()); m.get(to).add(from); };
  const consume = (e) => { if (e.kind === 'call') add(callIn, e.to, e.from); else if (e.kind === 'inherit') add(inheritIn, e.to, e.from); };
  for (const s of split.shards) for (const e of s.edges) consume(e);
  for (const e of split.boundary) consume(e);
  const seen = new Set([id]); const q = [id];
  while (q.length) {
    const cur = q.shift();
    for (const dep of [...(callIn.get(cur) || []), ...(inheritIn.get(cur) || [])]) if (!seen.has(dep)) { seen.add(dep); q.push(dep); }
  }
  return [...seen].filter((x) => x !== id).sort();
}
