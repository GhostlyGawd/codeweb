import { readFileSync, writeFileSync } from 'node:fs';
const frag = JSON.parse(readFileSync(`${process.env.CODEWEB_WS || '.live'}/fragment.json`, 'utf8'));
const nodes = frag.nodes, edges = frag.edges;
const id2i = new Map(nodes.map((n, i) => [n.id, i]));
const adj = nodes.map(() => []);
for (const e of edges) { const a = id2i.get(e.from), b = id2i.get(e.to); if (a == null || b == null || a === b) continue; adj[a].push(b); adj[b].push(a); }
const isolated = adj.filter(a => a.length === 0).length;
// label propagation
let label = nodes.map((_, i) => i);
for (let p = 0; p < 12; p++) { let ch = 0; for (let i = 0; i < nodes.length; i++) { if (!adj[i].length) continue; const c = new Map(); for (const j of adj[i]) c.set(label[j], (c.get(label[j]) || 0) + 1); let best = label[i], bc = -1; for (const [l, k] of c) if (k > bc || (k === bc && l < best)) { best = l; bc = k; } if (best !== label[i]) { label[i] = best; ch++; } } if (!ch) break; }
const groups = new Map();
nodes.forEach((n, i) => { const l = adj[i].length ? 'c' + label[i] : 'iso:' + n.file.split('/')[0]; if (!groups.has(l)) groups.set(l, []); groups.get(l).push(i); });
const MIN = 12;
const big = [...groups.values()].filter(g => g.length >= MIN).sort((a,b)=>b.length-a.length);
const areaOf = new Array(nodes.length).fill('misc');
let an = 0; for (const idxs of big) { const nm = 'area' + (++an); idxs.forEach(i => areaOf[i] = nm); }
nodes.forEach((n, i) => n.domain = areaOf[i]);
// file-affinity refine
const byFile = new Map(); nodes.forEach(n => { if (!byFile.has(n.file)) byFile.set(n.file, []); byFile.get(n.file).push(n); });
const fileArea = new Map();
for (const [file, ns] of byFile) { const c = {}; ns.forEach(n => { if (n.domain !== 'misc') c[n.domain] = (c[n.domain] || 0) + 1; }); const t = Object.entries(c).sort((a, b) => b[1] - a[1])[0]; if (t) fileArea.set(file, t[0]); }
nodes.forEach(n => { if (n.domain === 'misc' && fileArea.has(n.file)) n.domain = fileArea.get(n.file); });
const looseFinal = nodes.filter(n => n.domain === 'misc').length;
const tot = nodes.length;
console.log('--- connectivity ---');
console.log('symbols           : ' + tot);
console.log('edges             : ' + edges.length);
console.log('isolated (deg 0)  : ' + isolated + ' (' + Math.round(isolated/tot*100) + '%)');
console.log('--- clustering ---');
console.log('clusters (>=' + MIN + ')   : ' + big.length);
console.log('loose after refine: ' + looseFinal + ' (' + Math.round(looseFinal/tot*100) + '%)');
