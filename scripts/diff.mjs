#!/usr/bin/env node
// codeweb diff: compare two graph.json snapshots (before vs after an agent edit) and flag
// structural REGRESSIONS, so a PostToolUse hook / CI step can gate on the exit code. Read-only,
// deterministic. Built on ./lib/graph-ops.mjs.
//
// Usage: node diff.mjs <before.json> <after.json> [--json]
//
// Regression (exit 1) = a NEW dependency cycle, a NEW duplication finding, or an EXISTING symbol
// that lost all its callers. A brand-new uncalled node is reported but is NOT a gate failure
// (agents legitimately add functions before wiring them). Exit: 0 ok, 1 regressions, 2 usage/IO.
//
// Schema note (finding #28): rename detection is O(removed × added), so it is skipped when either
// side exceeds RENAME_CAP nodes. When BOTH sides are non-empty AND one exceeds the cap, an additive
// `nodes.renameCheck = { skipped:true, removed, added, cap }` field records the skip (absent
// otherwise; `renamed` stays []) and one text-mode line names it — so a capped run is honest, not
// silently rename-blind. An empty side is not a skipped detection (nothing was skippable), so it gets
// no marker. The MCP `codeweb_diff` tool is a graphless passthrough and hooks gate via graph-ops'
// structuralRegressions, not this payload — the additive field breaks neither consumer.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { normalizeGraph, buildIndex, fileCycles, orphans, edgeKey } from './lib/graph-ops.mjs';
import { jaccard, capBody } from './lib/shingles.mjs'; // finding #28: body cap for long-body rename shingling
import { structuralShingles } from './lib/skeleton.mjs'; // rename detection: a rename IS a Type-2 clone (identifier-normalized match)

const USAGE = 'usage: diff.mjs <before.json> <after.json> [--json]';
if (process.argv.includes('--help') || process.argv.includes('-h')) { console.log(USAGE); process.exit(0); } // #5: every CLI answers --help
import { die, emitJson, finish, sign, sourceReader, loadGraph } from './lib/cli.mjs';

const RENAME_CAP = 200; // rename detection is O(removed × added); skip (with a surfaced renameCheck) above this

/**
 * finding #28: pure, ambient-state-free rename matcher (WS-F #33 lifts it verbatim into a lib). A
 * removed node and an added node that are the same code (rename-in-place = same file, or
 * move-with-name = same label) confirm as one rename at ≥0.85 identifier-normalized body similarity,
 * or — when a body is unreadable — a same-file span-shape (|Δloc|≤1) fallback. Byte-identical results
 * to the prior inline O(removed × added × g.nodes.find) version; the only behavior change is that
 * bodies over BODY_LINE_CAP lines shingle their first 400 (the overlap/dup-check answer, sanctioned).
 * Perf: uses the already-built byId indexes (no g.nodes.find), hoists each OLD body's skeleton out of
 * the inner loop, and memoizes each NEW body's skeleton once for the whole pass — null bodies memoized
 * too, so an unreadable body is not re-read per removed node and still routes to the span-shape path.
 * Returns renamed[] sorted by `from`; the caller withdraws the pairs from added/removed.
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
      // identifier-NORMALIZED skeletons: the renamed identifier itself must not count against the
      // match (on a short function the name dominates lexical shingles and sinks the score).
      const newSkel = skelOfNew(newN);
      const sim = (oldSkel != null && newSkel != null) ? jaccard(oldSkel, newSkel) : null;
      // with readable bodies demand real structural similarity; without, fall back to span-shape
      const isMatch = sim != null ? sim >= 0.85 : (sameFile && Math.abs((newN.loc || 0) - (oldN.loc || 0)) <= 1);
      if (isMatch && (!best || (sim || 0) > (best.sim || 0))) best = { from: oldId, to: newId, sim: sim != null ? +sim.toFixed(3) : null };
    }
    if (best) { renamed.push(best); addedPool.delete(best.to); }
  }
  renamed.sort((x, y) => (x.from < y.from ? -1 : 1));
  return renamed;
}

const argv = process.argv.slice(2);
let json = false; const paths = [];
for (const t of argv) { if (t === '--json') json = true; else if (!t.startsWith('-')) paths.push(t); }
if (paths.length < 2) die(USAGE, 2);

const load = (p) => loadGraph(p).graph; // Spec E: one truth with every other CLI (was a duplicated pre-loadGraph copy)
const before = load(paths[0]);
const after = load(paths[1]);
const bIx = buildIndex(before), aIx = buildIndex(after);

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
// Only CONFIRMED findings (high/medium — the tiers overlap.md reports as findings) participate in
// the delta: a low (unverified) or refuted (body-dismissed) candidate must never block a gate.
const CONFIRMED = new Set(['high', 'medium']);
const ovMap = (g) => new Map(g.overlaps.filter((o) => o.confidence == null || CONFIRMED.has(o.confidence)).map((o) => [ovSig(o), o]));
const bOv = ovMap(before), aOv = ovMap(after);
const ovDiff = (from, to) => [...from.keys()].filter((k) => !to.has(k))
  .map((k) => ({ kind: from.get(k).kind, title: from.get(k).title || '' }))
  .sort((x, y) => (x.title < y.title ? -1 : x.title > y.title ? 1 : 0));

// cycles keyed by sorted file list
const cycSig = (c) => c.join('|');
const bCyc = fileCycles(before), aCyc = fileCycles(after);
const bCycSet = new Set(bCyc.map(cycSig)), aCycSet = new Set(aCyc.map(cycSig));
const cycDiff = (list, otherSet) => list.filter((c) => !otherSet.has(cycSig(c)));

const bOrph = new Set(orphans(before, bIx).map((o) => o.id));
const aOrph = new Set(orphans(after, aIx).map((o) => o.id));

let nodesAdded = sortedDiff(aIds, bIds);
let nodesRemoved = sortedDiff(bIds, aIds);

// RENAME DETECTION: a removed node and an added node that are the same code (same file + same
// span-shape, or same label elsewhere, with ≥85% body-shingle similarity when source is readable)
// are ONE rename, not delete+add noise. Reported as `renamed[]` and withdrawn from added/removed so
// an agent (or a reviewer) sees intent instead of churn. Regression logic is untouched. finding #28:
// detection runs in a pure top-level detectRenames() (indexed + memoized); above RENAME_CAP nodes on
// either side it is skipped and surfaced via renameCheck.
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
  before: before.meta.target || basename(paths[0]),
  after: after.meta.target || basename(paths[1]),
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
const code = payload.ok ? 0 : 1;

if (json) { emitJson(payload, code); } else {

console.log(`codeweb diff: ${payload.before} -> ${payload.after}`);
console.log(`  nodes +${nodesAdded.length} -${nodesRemoved.length}${renamed.length ? ` ~${renamed.length} renamed` : ''}   edges +${payload.edges.added} -${payload.edges.removed}   cross-domain Δ${sign(payload.crossDomainEdges.delta)}`);
if (renamed.length) for (const r of renamed) console.log(`  renamed: ${r.from} -> ${r.to}${r.sim != null ? ` (body ${(r.sim * 100).toFixed(0)}%)` : ''}`);
if (renameCheck) console.log(`  rename detection skipped: ${renameCheck.removed} removed / ${renameCheck.added} added exceed the ${renameCheck.cap}-node cap`);
console.log(`  cycles +${cyclesAdded.length} -${cyclesRemoved.length}   overlaps +${overlapsAdded.length} -${overlapsRemoved.length}   orphans +${orphansAdded.length} -${orphansRemoved.length}`);
if (regressions.length) { console.log('REGRESSIONS (a gate would block):'); for (const r of regressions) console.log(`  x ${r}`); }
else console.log('  ok — no structural regressions');
finish(code);
}
