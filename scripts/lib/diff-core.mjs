// lib/diff-core.mjs — the structural delta + regression verdict between two PARSED graph snapshots.
// Lifted from diff.mjs (finding #33) so the MCP codeweb_diff fast path can serve it IN-PROCESS from
// cachedGraph (the after side) instead of booting node + parsing two graphs per call (131–136 ms
// @1.2k; ~500 ms at 16k) in the refresh→diff loop the INSTRUCTIONS prescribe per edit. detectRenames
// is #28's ambient-state-free matcher, moved here VERBATIM (byId maps, hoisted/memoized/capped
// shingles, the renameCheck cap marker) — not re-derived. diffGraphs takes two normalized graphs plus
// optional prebuilt indexes (the after side's index is already cached) and names, and returns
// { payload, code } — the exact payload/exit diff.mjs --json emits (0 ok / 1 regressions).

import { buildIndex, fileCycles, orphans, edgeKey } from './graph-ops.mjs';
import { jaccard, capBody } from './shingles.mjs'; // finding #28: body cap for long-body rename shingling
import { structuralShingles } from './skeleton.mjs'; // rename detection: a rename IS a Type-2 clone
import { sourceReader } from './cli.mjs';

export const RENAME_CAP = 200; // rename detection is O(removed × added); skip (with a surfaced renameCheck) above this

/**
 * finding #28: pure, ambient-state-free rename matcher (lifted here VERBATIM by #33). A removed node
 * and an added node that are the same code (rename-in-place = same file, or move-with-name = same
 * label) confirm as one rename at ≥0.85 identifier-normalized body similarity, or — when a body is
 * unreadable — a same-file span-shape (|Δloc|≤1) fallback. Uses the already-built byId indexes (no
 * g.nodes.find), hoists each OLD body's skeleton out of the inner loop, and memoizes each NEW body's
 * skeleton once for the whole pass (null bodies memoized too). Returns renamed[] sorted by `from`.
 */
export function detectRenames({ before, after, bIx, aIx, nodesRemoved, nodesAdded, bReader, aReader }) {
  const skelOf = (reader, n) => { const b = reader.bodyOf(n); return b == null ? null : structuralShingles(capBody(b), 3); };
  const newSkelMemo = new Map(); // newId -> skeleton | null (each new body shingled at most once)
  const skelOfNew = (newN) => { if (!newSkelMemo.has(newN.id)) newSkelMemo.set(newN.id, skelOf(aReader, newN)); return newSkelMemo.get(newN.id); };
  const renamed = [];
  const addedPool = new Set(nodesAdded);
  for (const oldId of nodesRemoved) {
    const oldN = bIx.byId.get(oldId);
    if (!oldN || oldN.kind === 'module') continue;
    const oldSkel = skelOf(bReader, oldN); // hoisted: shingled once per removed node, not once per pair
    let best = null;
    for (const newId of addedPool) {
      const newN = aIx.byId.get(newId);
      if (!newN || newN.kind !== oldN.kind) continue;
      const sameFile = newN.file === oldN.file;
      const sameLabel = newN.label === oldN.label;
      if (!sameFile && !sameLabel) continue; // rename-in-place or move-with-name — not both changed
      const newSkel = skelOfNew(newN);
      const sim = (oldSkel != null && newSkel != null) ? jaccard(oldSkel, newSkel) : null;
      const isMatch = sim != null ? sim >= 0.85 : (sameFile && Math.abs((newN.loc || 0) - (oldN.loc || 0)) <= 1);
      if (isMatch && (!best || (sim || 0) > (best.sim || 0))) best = { from: oldId, to: newId, sim: sim != null ? +sim.toFixed(3) : null };
    }
    if (best) { renamed.push(best); addedPool.delete(best.to); }
  }
  renamed.sort((x, y) => (x.from < y.from ? -1 : 1));
  return renamed;
}

/**
 * Compare two normalized graphs → { payload, code }. `opts.bIx`/`opts.aIx` accept prebuilt indexes
 * (the MCP fast path passes the cached after-index); `opts.names` supplies the {before,after} basename
 * fallbacks used only when a graph has no meta.target. Readers are built inside from each graph's
 * meta.root (rename detection). Regression = a NEW cycle, a NEW confirmed duplication, or an EXISTING
 * symbol that lost all callers; a brand-new uncalled node is reported but is NOT a gate failure.
 */
export function diffGraphs(before, after, { names = {}, bIx, aIx } = {}) {
  bIx = bIx || buildIndex(before);
  aIx = aIx || buildIndex(after);

  const idsOf = (g) => new Set(g.nodes.map((n) => n.id));
  const bIds = idsOf(before), aIds = idsOf(after);
  const sortedDiff = (a, b) => [...a].filter((x) => !b.has(x)).sort();

  const bEdges = new Set(before.edges.map(edgeKey)), aEdges = new Set(after.edges.map(edgeKey));
  const crossCount = (g, ix) => g.edges.filter((e) => {
    const f = ix.byId.get(e.from), t = ix.byId.get(e.to);
    return f && t && f.domain !== t.domain;
  }).length;

  // overlaps keyed by content signature (kind + sorted node set) — stable across id/title churn
  const ovSig = (o) => `${o.kind}\x00${[...(o.nodes || [])].sort().join(',')}`;
  // Only CONFIRMED findings (high/medium) participate — a low/refuted candidate must never block a gate.
  const CONFIRMED = new Set(['high', 'medium']);
  const ovMap = (g) => new Map(g.overlaps.filter((o) => o.confidence == null || CONFIRMED.has(o.confidence)).map((o) => [ovSig(o), o]));
  const bOv = ovMap(before), aOv = ovMap(after);
  const ovDiff = (from, to) => [...from.keys()].filter((k) => !to.has(k))
    .map((k) => ({ kind: from.get(k).kind, title: from.get(k).title || '' }))
    .sort((x, y) => (x.title < y.title ? -1 : x.title > y.title ? 1 : 0));

  const cycSig = (c) => c.join('|');
  const bCyc = fileCycles(before), aCyc = fileCycles(after);
  const bCycSet = new Set(bCyc.map(cycSig)), aCycSet = new Set(aCyc.map(cycSig));
  const cycDiff = (list, otherSet) => list.filter((c) => !otherSet.has(cycSig(c)));

  const bOrph = new Set(orphans(before, bIx).map((o) => o.id));
  const aOrph = new Set(orphans(after, aIx).map((o) => o.id));

  let nodesAdded = sortedDiff(aIds, bIds);
  let nodesRemoved = sortedDiff(bIds, aIds);

  // RENAME DETECTION (finding #28): a removed + an added node that are the same code are ONE rename,
  // withdrawn from added/removed. Above RENAME_CAP nodes on either side it is skipped, surfaced via
  // renameCheck. Regression logic is untouched.
  let renamed = [];
  let renameCheck; // additive: present only when detection was CAPPED (both sides non-empty, one > cap)
  if (nodesRemoved.length && nodesAdded.length) {
    if (nodesRemoved.length <= RENAME_CAP && nodesAdded.length <= RENAME_CAP) {
      const aReader = sourceReader(after.meta && after.meta.root);
      const bReader = sourceReader(before.meta && before.meta.root);
      renamed = detectRenames({ before, after, bIx, aIx, nodesRemoved, nodesAdded, bReader, aReader });
      if (renamed.length) {
        const renamedFrom = new Set(renamed.map((r) => r.from)), renamedTo = new Set(renamed.map((r) => r.to));
        nodesRemoved = nodesRemoved.filter((id) => !renamedFrom.has(id));
        nodesAdded = nodesAdded.filter((id) => !renamedTo.has(id));
      }
    } else {
      renameCheck = { skipped: true, removed: nodesRemoved.length, added: nodesAdded.length, cap: RENAME_CAP };
    }
  }
  const orphansAdded = sortedDiff(aOrph, bOrph);
  const orphansRemoved = sortedDiff(bOrph, aOrph);
  const cyclesAdded = cycDiff(aCyc, bCycSet);
  const cyclesRemoved = cycDiff(bCyc, aCycSet);
  const overlapsAdded = ovDiff(aOv, bOv);
  const overlapsRemoved = ovDiff(bOv, aOv);
  // regressed orphans = newly-orphaned nodes that EXISTED before (lost their callers), not brand-new
  const regressedOrphans = orphansAdded.filter((id) => bIds.has(id));

  const regressions = [];
  if (cyclesAdded.length) regressions.push(`${cyclesAdded.length} new dependency cycle(s)`);
  if (overlapsAdded.length) regressions.push(`${overlapsAdded.length} new duplication finding(s)`);
  if (regressedOrphans.length) regressions.push(`${regressedOrphans.length} symbol(s) lost all callers`);

  const cdBefore = crossCount(before, bIx), cdAfter = crossCount(after, aIx);
  const payload = {
    before: before.meta.target || names.before,
    after: after.meta.target || names.after,
    nodes: { added: nodesAdded, removed: nodesRemoved, renamed, ...(renameCheck ? { renameCheck } : {}) },
    edges: { added: [...aEdges].filter((k) => !bEdges.has(k)).length, removed: [...bEdges].filter((k) => !aEdges.has(k)).length },
    domains: { before: new Set(before.nodes.map((n) => n.domain)).size, after: new Set(after.nodes.map((n) => n.domain)).size },
    crossDomainEdges: { before: cdBefore, after: cdAfter, delta: cdAfter - cdBefore },
    overlaps: { added: overlapsAdded, removed: overlapsRemoved },
    cycles: { added: cyclesAdded, removed: cyclesRemoved },
    orphans: { added: orphansAdded, removed: orphansRemoved },
    regressions,
    ok: regressions.length === 0,
  };
  return { payload, code: payload.ok ? 0 : 1 };
}
