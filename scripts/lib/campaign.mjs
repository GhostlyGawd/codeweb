// codeweb optimization campaign planner (F5) — compose the three existing advisors (optimize /
// deadcode / break-cycles; each stays authoritative — one truth) into ONE ordered, cumulatively
// pre-flighted worklist with projected cumulative deltas. This is the "auto-optimize at any scale"
// deliverable: a big repo becomes a verified, conflict-free, prioritized refactor backlog the agent
// executes step by step. Read-only PLAN — execution stays with the agent + the gate. Pure.
//
// Phase order (CMP-ORDER): cuts -> deletes -> merges. Cuts are advisory (a manual dependency
// inversion, not a node op) and go first so a merge blocked by a cycle is unblocked first. Deletes of
// dead code only remove edges, so they can never introduce a cycle. Merges are pre-flighted against
// the graph WITH all prior steps applied (CMP-GREEN-CHAIN) — a merge that would introduce a file cycle
// is dropped, so applying the whole plan in order never creates a cycle absent at the start.

import { normalizeGraph, fileCycles, buildIndex, chooseCanonical, createMergeSimulator } from './graph-ops.mjs';

const byRoiThenId = (a, b) => b.roi - a.roi || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function planCampaign(graph, { optimize = { opportunities: [] }, deadcode = { safe: [] }, breakCycles = { cycles: [] }, budget = Infinity } = {}) {
  const g0 = normalizeGraph(structuredClone(graph));
  // "New coupling" is judged by CONTAINMENT, not by the cycle's sorted-file key: an after-cycle is new
  // only if its files were NOT all already mutually cyclic. (A merge/delete that contracts an existing
  // SCC changes its key but introduces no new coupling — the same subtlety apply-edit.test pins.)
  const baseSets = fileCycles(g0).map((c) => new Set(c));
  const introducesCoupling = (cycles) => cycles.some((c) => !baseSets.some((bc) => c.every((f) => bc.has(f))));

  // Phase 1 — cuts (advisory; each verified cut breaks one cycle). Step ids stay COMPACT: SCCs are
  // disjoint, so the first (sorted) file names the cycle uniquely — a 60-file SCC must not put a
  // multi-KB file list into every step id.
  const cutSteps = (breakCycles.cycles || []).filter((c) => c.verified).map((c) => {
    const files = c.files || [];
    return {
      id: `cut:${files[0] || '?'}${files.length > 1 ? `(+${files.length - 1})` : ''}`, type: 'cut', op: null, roi: 10,
      gate: { ok: true }, delta: { locReclaimed: 0, cyclesBroken: 1 }, detail: c.cut || null, files,
    };
  }).sort(byRoiThenId);

  // Phase 2 — safe dead-code deletes (cycle-neutral: an orphan is in no SCC). ROI = the symbol's
  // span: deadcode emits `loc` (locSaved kept as a legacy alias so older advisor output still ranks).
  const delSteps = (deadcode.safe || []).map((o) => {
    const saved = o.locSaved ?? o.loc ?? 0;
    return {
      id: `del:${o.id}`, type: 'delete', op: { kind: 'delete', ids: [o.id] }, roi: saved,
      gate: { ok: true }, delta: { locReclaimed: saved, cyclesBroken: 0 },
    };
  }).sort(byRoiThenId);

  // Phase 3 — ready merges, cumulatively pre-flighted from the graph-with-prior-steps-applied.
  // finding 14: the chain rides graph-ops' createMergeSimulator (the Spec O-1 pair-witness table
  // optimize already used) instead of applyEdit's whole-graph structuredClone + full file-SCC per
  // candidate — measured 289ms/candidate at 20k nodes, ~29s for 100 candidates, on the exact
  // pattern optimize had already replaced. Deletes advance the same table first (an orphan's
  // edges stop witnessing pairs), then each accepted merge commits — identical verdicts to the
  // clone chain (pinned by the property oracle in campaign.test.mjs), O(edges touched) end to end.
  const delIds = delSteps.map((s) => s.op.ids[0]);
  const chain = createMergeSimulator(g0);
  if (delIds.length) chain.commitDelete(delIds);
  const idx0 = buildIndex(g0);
  const cands = (optimize.opportunities || [])
    .filter((o) => o.tier === 'ready' && o.kind === 'duplicate-logic' && Array.isArray(o.nodes) && o.nodes.length >= 2)
    .map((o) => ({ o, canonical: o.canonical || chooseCanonical(idx0, o.nodes), loc: o.locSaved || 0 }))
    .sort((a, b) => b.loc - a.loc || (a.o.id < b.o.id ? -1 : a.o.id > b.o.id ? 1 : 0));
  const mergeSteps = [];
  for (const m of cands) {
    if (introducesCoupling(chain.simulate(m.o.nodes, m.canonical).cycles)) continue; // NEW coupling -> drop (gate would block)
    mergeSteps.push({
      id: `merge:${m.canonical}`, type: 'merge', op: { kind: 'merge', ids: m.o.nodes.slice().sort(), into: m.canonical },
      roi: m.loc, gate: { ok: true }, delta: { locReclaimed: m.loc, cyclesBroken: 0 },
    });
    chain.commit(m.o.nodes, m.canonical);
  }

  const ordered = [...cutSteps, ...delSteps, ...mergeSteps];
  const steps = Number.isFinite(budget) ? ordered.slice(0, Math.max(0, budget)) : ordered;
  let loc = 0, cyc = 0;
  for (const s of steps) { loc += s.delta.locReclaimed; cyc += s.delta.cyclesBroken; s.cumulative = { locReclaimed: loc, cyclesBroken: cyc }; }
  return { steps, totals: { steps: steps.length, cuts: steps.filter((s) => s.type === 'cut').length, deletes: steps.filter((s) => s.type === 'delete').length, merges: steps.filter((s) => s.type === 'merge').length, locReclaimed: loc, cyclesBroken: cyc } };
}
