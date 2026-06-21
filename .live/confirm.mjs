// codeweb — body-level confirmation of overlap findings
// When the target source is on disk (graph.meta.root), ground-truth each duplicate-logic finding
// by reading the actual function bodies (via node.line + node.loc), token-shingling them, and
// computing pairwise Jaccard similarity. Confirms real duplicates vs coincidental name
// collisions. Read-only; never executes target code. Console report only.

import { readFileSync } from 'node:fs';

const WS = process.env.CODEWEB_WS || '.live';
const GRAPH = `${WS}/graph.json`;
const graph = JSON.parse(readFileSync(GRAPH, 'utf8'));
const ROOT = graph.meta?.root || '.'; // target root recorded at extraction
const K = 3;                 // shingle size (token k-grams)
const KW = new Set(['if','for','while','switch','catch','return','function','typeof','await','new','const','let','var','async','else','try','finally','class','case','of','in','throw']);

const fileCache = new Map();
const readLines = (rel) => {
  if (!fileCache.has(rel)) { try { fileCache.set(rel, readFileSync(ROOT + '/' + rel, 'utf8').split(/\r?\n/)); } catch { fileCache.set(rel, null); } }
  return fileCache.get(rel);
};
const bodyOf = (n) => {
  const lines = readLines(n.file); if (!lines) return null;
  return lines.slice(n.line - 1, n.line - 1 + (n.loc || 1)).join('\n');
};
const tokenize = (src) => src
  .replace(/\/\/[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')   // strip comments
  .replace(/(['"`])(?:\\.|(?!\1).)*\1/g, ' STR ')                  // collapse string literals
  .toLowerCase().match(/[a-z_$][\w$]*|[{}();=><!+\-*/%]/g)?.filter((t) => !KW.has(t)) || [];
const shingles = (toks) => { const s = new Set(); for (let i = 0; i + K <= toks.length; i++) s.add(toks.slice(i, i + K).join(' ')); return s; };
const jaccard = (a, b) => { if (!a.size || !b.size) return 0; let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i); };

const byId = new Map(graph.nodes.map((n) => [n.id, n]));
const dup = graph.overlaps.filter((o) => o.kind === 'duplicate-logic');

const verdict = (m) => (m >= 0.6 ? 'CONFIRMED dup' : m >= 0.35 ? 'PARTIAL/drifted' : m >= 0.15 ? 'WEAK' : 'COINCIDENTAL');
console.log(`confirming ${dup.length} duplicate-logic findings against ${ROOT}`);
console.log('mean | min  | verdict          | finding');
let confirmed = 0, coincidental = 0, missing = 0;
const rows = [];
for (const o of dup) {
  const bodies = o.nodes.map((id) => byId.get(id)).filter(Boolean).map(bodyOf).filter(Boolean).map((b) => shingles(tokenize(b))).filter((s) => s.size);
  if (bodies.length < 2) { missing++; continue; }
  const sims = [];
  for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) sims.push(jaccard(bodies[i], bodies[j]));
  const mean = sims.reduce((a, b) => a + b, 0) / sims.length;
  const min = Math.min(...sims);
  const v = verdict(mean);
  if (v.startsWith('CONFIRMED')) confirmed++; if (v === 'COINCIDENTAL') coincidental++;
  rows.push({ mean, min, v, title: o.title.replace(/`/g, ''), conf: o.confidence });
}
rows.sort((a, b) => b.mean - a.mean);
for (const r of rows) console.log(`${r.mean.toFixed(2)} | ${r.min.toFixed(2)} | ${r.v.padEnd(16)} | ${r.title}  (struct-conf: ${r.conf})`);
console.log(`\nsummary: ${confirmed} confirmed · ${coincidental} coincidental · ${missing} unreadable (of ${dup.length})`);
