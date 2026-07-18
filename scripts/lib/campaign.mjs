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

import { normalizeGraph, fileCycles, applyEdit, buildIndex, chooseCanonical } from './graph-ops.mjs';

const byRoiThenId = (a, b) => b.roi - a.roi || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function planCampaign(graph, { optimize = { opportunities: [] }, deadcode = { safe: [] }, breakCycles = { cycles: [] }, budget = Infinity } = {}) {
  const g0 = normalizeGraph(structuredClone(graph));
  // "New coupling" is judged by CONTAINMENT, not by the cycle's sorted-file key: an after-cycle is new
  // only if its files were NOT all already mutually cyclic. (A merge/delete that contracts an existing
  // SCC changes its key but introduces no new coupling — the same subtlety apply-edit.test pins.)
  const baseSets = fileCycles(g0).map((c) => new Set(c));
  const introducesCoupling = (cycles) => cycles.some((c) => !baseSets.some((bc) => c.every((f) => bc.has(f))));

  // Phase 1 — cuts (advisory; each verified cut breaks one cycle).
  const cutSteps = (breakCycles.cycles || []).filter((c) => c.verified).map((c) => ({
    id: `cut:${(c.files || []).join('+')}`, type: 'cut', op: null, roi: 10,
    gate: { ok: true }, delta: { locReclaimed: 0, cyclesBroken: 1 }, detail: c.cut || null, files: c.files || [],
  })).sort(byRoiThenId);

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
  let cur = g0;
  for (const s of delSteps) cur = applyEdit(cur, s.op);
  const idx0 = buildIndex(g0);
  const cands = (optimize.opportunities || [])
    .filter((o) => o.tier === 'ready' && o.kind === 'duplicate-logic' && Array.isArray(o.nodes) && o.nodes.length >= 2)
    .map((o) => ({ o, canonical: o.canonical || chooseCanonical(idx0, o.nodes), loc: o.locSaved || 0 }))
    .sort((a, b) => b.loc - a.loc || (a.o.id < b.o.id ? -1 : a.o.id > b.o.id ? 1 : 0));
  const mergeSteps = [];
  for (const m of cands) {
    const sim = applyEdit(cur, { kind: 'merge', ids: m.o.nodes, into: m.canonical });
    if (introducesCoupling(fileCycles(sim))) continue; // would introduce NEW coupling -> drop (gate would block)
    mergeSteps.push({
      id: `merge:${m.canonical}`, type: 'merge', op: { kind: 'merge', ids: m.o.nodes.slice().sort(), into: m.canonical },
      roi: m.loc, gate: { ok: true }, delta: { locReclaimed: m.loc, cyclesBroken: 0 },
    });
    cur = sim;
  }

  const ordered = [...cutSteps, ...delSteps, ...mergeSteps];
  const steps = Number.isFinite(budget) ? ordered.slice(0, Math.max(0, budget)) : ordered;
  let loc = 0, cyc = 0;
  for (const s of steps) { loc += s.delta.locReclaimed; cyc += s.delta.cyclesBroken; s.cumulative = { locReclaimed: loc, cyclesBroken: cyc }; }
  return { steps, totals: { steps: steps.length, cuts: steps.filter((s) => s.type === 'cut').length, deletes: steps.filter((s) => s.type === 'delete').length, merges: steps.filter((s) => s.type === 'merge').length, locReclaimed: loc, cyclesBroken: cyc } };
}
