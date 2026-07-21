// codeweb incremental duplication check (F3) — closes the hole where a post-edit / refreshed graph
// (overlaps:[]) can't see a freshly-introduced clone. For each CHANGED symbol, body-confirm against
// every other non-test function body and report it if it duplicates one at the same "high" bar
// overlap.mjs uses (Jaccard >= 0.6). Reuses the ONE shingle/Jaccard truth (lib/shingles.mjs) and
// rounds to 6 dp like find-similar.mjs — no second similarity formula. Pure; bodies come from a
// `bodyOf` injector (tests) or are read from `root` by line range (the same read overlap.mjs uses).

import { readFileSync } from 'node:fs';
import { isTestFile } from './graph-ops.mjs';
import { shingles, jaccard, K, BANDS } from './shingles.mjs'; // THE size + bands (finding 27)

const HIGH = BANDS.high;
// finding 15: overlap.mjs's Spec-B body cap, mirrored — thousand-line bodies yielded 10k-element
// shingle sets here while overlap confirmed the same pair on its first 400 lines (two answers for
// one question, and the uncapped one is the slow one).
const BODY_LINE_CAP = 400;
// finding 15: exact size-ratio bound — J(A,B) = |∩|/|∪| ≤ min/max, so a pair whose set sizes
// can't reach the bar skips the intersection entirely (measured: 78% of 37,350 pairs skipped on
// the self-map, byte-identical output). The 5e-7 slack keeps knife-edge pairs that round6 would
// lift to exactly 0.6 — the reported set cannot change.
const RATIO_FLOOR = HIGH - 5e-7;
const round6 = (x) => +x.toFixed(6);
const isFn = (n) => n && (n.kind === 'function' || n.kind === 'method');

export function incrementalOverlap(graph, changedIds, { root = null, bodyOf = null } = {}) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const fileCache = new Map();
  const readLines = (rel) => {
    if (!fileCache.has(rel)) { try { fileCache.set(rel, readFileSync(root + '/' + rel, 'utf8').split(/\r?\n/)); } catch { fileCache.set(rel, null); } }
    return fileCache.get(rel);
  };
  const getBody = (n) => {
    if (bodyOf) return bodyOf(n);
    if (!root) return null;
    const lines = readLines(n.file);
    return lines ? lines.slice(n.line - 1, n.line - 1 + Math.min(n.loc || 1, BODY_LINE_CAP)).join('\n') : null;
  };
  const shOf = new Map();
  const shingleOf = (n) => { if (!shOf.has(n.id)) { const b = getBody(n); shOf.set(n.id, b ? shingles(b, K) : null); } return shOf.get(n.id); };

  const pool = graph.nodes.filter((n) => isFn(n) && !isTestFile(n.file));
  const out = [];
  for (const id of changedIds.filter((x) => byId.has(x))) {
    const n = byId.get(id);
    if (!isFn(n) || isTestFile(n.file)) continue;
    const cand = shingleOf(n);
    if (!cand || !cand.size) continue;
    let best = null;
    for (const other of pool) {
      if (other.id === id) continue;                          // never report a symbol as duplicating itself
      const osh = shingleOf(other);
      if (!osh || !osh.size) continue;
      if (Math.min(cand.size, osh.size) / Math.max(cand.size, osh.size) < RATIO_FLOOR) continue; // exact bound: J can't reach the bar
      const sim = round6(jaccard(cand, osh));
      if (sim < HIGH) continue;                                // precision over recall: only the confirmed bar
      if (!best || sim > best.sim || (sim === best.sim && other.id < best.dupOf)) best = { dupOf: other.id, sim };
    }
    if (best) out.push({ id, dupOf: best.dupOf, sim: best.sim });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
