// codeweb — clustering v3 (directory-anchored, dir-seeded label propagation + light de-hub)
// Names domains after the repo's own module structure (directories) instead of utility symbols
// (the old "lib · log" failure). Mechanism: (1) seed each node's label with its 2-level
// directory, (2) run label-propagation that migrates a node across dirs only where call-cohesion
// clearly pulls it (ties keep the current dir, so the directory prior wins), (3) name each
// domain by its dominant member directory.
//
// De-hub (HUB_INDEG): exclude high-in-degree nodes from the clustering adjacency. This began as
// a workaround for false super-hubs the extractor used to fabricate (unresolved `log()`/`get()`
// wired to the first global def — e.g. discord/ecc-bot.mjs:log at in-degree 127). That bug is
// fixed at extraction now, so de-hub no longer changes the domain COUNT (17 either way). But it
// still does real work: the surviving GENUINE utility hubs (utils.log, utils.readFile,
// state-store.get) otherwise bridge their callers' home directory into lib — measured at ~20
// nodes (mostly hooks/* calling lib utils) pulled out of their home dir when de-hub is removed.
// Keeping it makes domain assignment track directory structure, so it stays.

import { readFileSync } from 'node:fs';
import { atomicWrite } from './lib/cli.mjs'; // finding 3: graph writes are rename-atomic

const WS = process.env.CODEWEB_WS || '.live';   // per-target workspace dir (orchestrator sets this)
const FRAG = `${WS}/fragment.json`;
const GRAPH = `${WS}/graph.json`;
// exclude genuine utility hubs from clustering adjacency (keeps callers in their home dir; see header).
// CODEWEB_HUB_INDEG overrides the threshold for A/B regression testing of the de-hub decision
// (mirrors extract-symbols' CODEWEB_LEGACY_FALLBACK lever): set it absurdly high to disable de-hub
// and watch callers bleed into their hubs' home dir. Default 12 — the shipped behavior is unchanged.
const hubOverride = Number(process.env.CODEWEB_HUB_INDEG);
const HUB_INDEG = Number.isFinite(hubOverride) ? hubOverride : 12; // honor any finite override (incl. 0); unset -> 12
const PASSES = 12;

const dir2 = (file) => {
  const p = file.split('/');
  if (p.length === 1) return '(root)';
  return p.slice(0, Math.min(2, p.length - 1)).join('/');
};
const pretty = (label) => (label === '(root)' ? 'CLI scripts (root)' : label);

const frag = JSON.parse(readFileSync(FRAG, 'utf8'));
const nodes = frag.nodes, edges = frag.edges;
const fragMeta = frag.meta || {};
const id2i = new Map(nodes.map((n, i) => [n.id, i]));

// in-degree -> identify hubs to exclude from the clustering adjacency (also reused for summaries)
const indeg = nodes.map(() => 0);
for (const e of edges) { const b = id2i.get(e.to); if (b != null) indeg[b]++; }
const isHub = indeg.map((d) => d >= HUB_INDEG);

// de-hubbed undirected adjacency (drop self-loops and any edge touching a hub)
const adj = nodes.map(() => []);
for (const e of edges) {
  const a = id2i.get(e.from), b = id2i.get(e.to);
  if (a == null || b == null || a === b) continue;
  if (isHub[a] || isHub[b]) continue;
  adj[a].push(b); adj[b].push(a);
}

// seed labels with directory, then propagate (ties keep current => directory prior wins)
let label = nodes.map((n) => dir2(n.file));
for (let pass = 0; pass < PASSES; pass++) {
  let changed = 0;
  for (let i = 0; i < nodes.length; i++) {
    if (isHub[i] || !adj[i].length) continue;
    const cnt = new Map();
    for (const j of adj[i]) cnt.set(label[j], (cnt.get(label[j]) || 0) + 1);
    let best = label[i], bc = cnt.get(label[i]) || 0;
    for (const [l, c] of cnt) if (c > bc) { best = l; bc = c; }
    if (best !== label[i]) { label[i] = best; changed++; }
  }
  if (!changed) break;
}

// assign domains; name each cluster by its dominant member directory (robust if a label migrated)
const groups = new Map();
nodes.forEach((n, i) => { if (!groups.has(label[i])) groups.set(label[i], []); groups.get(label[i]).push(i); });
const nameOf = new Map();
for (const [lbl, idxs] of groups) {
  const dc = {}; idxs.forEach((i) => { const d = dir2(nodes[i].file); dc[d] = (dc[d] || 0) + 1; });
  const domDir = Object.entries(dc).sort((a, b) => b[1] - a[1])[0][0];
  nameOf.set(lbl, pretty(domDir));
}
nodes.forEach((n, i) => { n.domain = nameOf.get(label[i]); });

// domain summaries — deterministic DESCRIPTIVE labels: size, file count, the key symbols (exported
// preferred, then fan-in), and the role composition when a domain is mostly supporting code. This is
// the "what does this area do" one-liner the report + reading-order surface.
const byDomain = new Map();
nodes.forEach((n, i) => { if (!byDomain.has(n.domain)) byDomain.set(n.domain, []); byDomain.get(n.domain).push(i); });
const domains = [...byDomain.entries()].map(([name, idxs]) => {
  const top = idxs.slice()
    .sort((a, b) => (nodes[b].exports === true) - (nodes[a].exports === true) || indeg[b] - indeg[a])
    .slice(0, 5).map((i) => nodes[i].label).filter((l) => l !== '<module>');
  const files = new Set(idxs.map((i) => nodes[i].file)).size;
  const roles = {};
  idxs.forEach((i) => { const r = nodes[i].role || 'product'; roles[r] = (roles[r] || 0) + 1; });
  const domRole = Object.entries(roles).sort((a, b) => b[1] - a[1])[0][0];
  const roleNote = domRole !== 'product' ? ` (mostly ${domRole} code)` : '';
  return { name, nodes: idxs.length, role: domRole, summary: `${idxs.length} symbols across ${files} file(s)${roleNote}; key: ${top.join(', ')}.` };
}).sort((a, b) => b.nodes - a.nodes);

const graph = {
  meta: { ...fragMeta, mode: 'internal', depth: 'symbol', engine: `${fragMeta.engine || 'regex'} + de-hubbed dir-seeded call-cohesion clustering` },
  nodes, edges, domains, overlaps: [],
};
atomicWrite(GRAPH, JSON.stringify(graph));

// stats
const isolated = adj.filter((a) => a.length === 0).length;
const hubCount = isHub.filter(Boolean).length;
console.log(`hubs stripped (indeg>=${HUB_INDEG}): ${hubCount}`);
console.log(`domains: ${domains.length}  (was 32, hub-named)`);
console.log(`isolated-after-dehub: ${isolated} (${Math.round(isolated / nodes.length * 100)}%)`);
console.log('--- top 18 domains ---');
for (const d of domains.slice(0, 18)) console.log(String(d.nodes).padStart(4), d.name);
