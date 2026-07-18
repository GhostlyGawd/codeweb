// F5 — properties + units for lib/campaign.mjs (the optimization campaign planner) + the campaign.mjs
// CLI, written BEFORE the implementation (RED).
//
// planCampaign(graph, { optimize, deadcode, breakCycles, budget }) composes the THREE existing
// advisors' outputs (the advisors stay authoritative — one truth) into a single ordered, cumulatively
// pre-flighted worklist. Headline lock CMP-GREEN-CHAIN: applying the plan's mutating ops (deletes then
// merges) IN ORDER never introduces a file cycle absent at the start — each merge is re-simulated
// against the graph WITH all prior steps applied. Hardened after review: synthAdvisors now makes
// CROSS-FILE, node-DISJOINT merge pairs (so the green-chain has teeth and CMP-INCLUDES-MERGES is a
// clean equality), deletes never touch a merge pair, and CMP-INCLUDES-MERGES stops a planner that
// silently drops every merge.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planCampaign } from '../scripts/lib/campaign.mjs';
import { normalizeGraph, buildIndex, orphans, fileCycles, applyEdit, chooseCanonical } from '../scripts/lib/graph-ops.mjs';
import { runNode, script, tmpDir, cleanup } from './helpers.mjs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { prng, randomGraph, int } from './_proptest.mjs';

const fileOf = (g, id) => g.nodes.find((n) => n.id === id)?.file;
// "New coupling" = an after-cycle whose files were NOT all already mutually cyclic (containment, not
// the sorted-file key — a contracted SCC changes its key but adds no coupling). Same as the planner.
const baseSetsOf = (g) => fileCycles(g).map((c) => new Set(c));
const introducesCoupling = (g, after) => { const base = baseSetsOf(g); return fileCycles(after).some((c) => !base.some((bc) => c.every((f) => bc.has(f)))); };

// FILE-disjoint mergeable pairs (each pair's two files are unique across all pairs) + orphan deletes
// that avoid the pair nodes + the real cuts. File-disjointness means merges can't interfere with each
// other's cycle check, and orphan deletes are cycle-neutral (an orphan has no incoming edge, so it is
// in no SCC) — therefore a pair that is base-safe stays safe under the whole plan, so the planner's
// cumulative pre-flight selects EXACTLY the base-safe pairs (CMP-INCLUDES-MERGES is a clean equality).
function synthAdvisors(graph, rng) {
  const idx = buildIndex(graph);
  const ids = graph.nodes.map((n) => n.id).sort();
  const usedNodes = new Set(), usedFiles = new Set();
  const ready = [];
  for (let i = 0; i < ids.length && ready.length < 3; i++) {
    const a = ids[i];
    if (usedNodes.has(a) || usedFiles.has(fileOf(graph, a))) continue;
    const partner = ids.find((b) => b !== a && !usedNodes.has(b) && !usedFiles.has(fileOf(graph, b)) && fileOf(graph, b) !== fileOf(graph, a));
    if (!partner) continue;
    if (rng() < 0.7) {
      usedNodes.add(a); usedNodes.add(partner); usedFiles.add(fileOf(graph, a)); usedFiles.add(fileOf(graph, partner));
      const pair = [a, partner].sort();
      ready.push({ id: `ov${i}`, kind: 'duplicate-logic', nodes: pair, canonical: chooseCanonical(idx, pair), locSaved: int(rng, 1, 9), tier: 'ready' });
    }
  }
  // Mirror the REAL deadcode.mjs output shape ({id,file,domain,loc,reason,fingerprint} — `loc`, not
  // `locSaved`), so this synthetic advisor can't drift from the producer again (the drift previously
  // masked campaign delete-ROI always ranking 0).
  const safe = orphans(graph, idx).filter((o) => !usedNodes.has(o.id)).slice(0, 2).map((o) => ({ ...o, loc: 2, reason: 'synthetic' }));
  const cuts = fileCycles(graph).map((c) => ({ files: c, verified: true, cut: { fromFile: c[0], toFile: c[1] || c[0] } }));
  return { optimize: { opportunities: ready }, deadcode: { safe }, breakCycles: { cycles: cuts } };
}

// individually-safe cross-file ready pairs (merge introduces no new cycle on the base graph). Because
// pairs are disjoint and deletes avoid them, base-safe == includable, so the planner MUST include them.
function safeReadyPairs(graph, advisors) {
  return advisors.optimize.opportunities.filter((o) => {
    const after = applyEdit(graph, { kind: 'merge', ids: o.nodes, into: o.canonical });
    return !introducesCoupling(graph, after);
  });
}

test('CMP-GREEN-CHAIN: applying the plan in order introduces no file cycle absent at the start', () => {
  const rng = prng(1);
  for (let i = 0; i < 200; i++) {
    const g = normalizeGraph(randomGraph(rng));
    const plan = planCampaign(g, synthAdvisors(g, rng));
    let cur = normalizeGraph(structuredClone(g));
    for (const step of plan.steps) {
      if (!step.op || (step.op.kind !== 'delete' && step.op.kind !== 'merge')) continue;
      cur = applyEdit(cur, step.op);
      assert.ok(!introducesCoupling(g, cur), `step ${step.op.kind} introduced new coupling vs the start (case ${i})`);
    }
  }
});

// Kills the "compose two advisors, silently drop every merge" degenerate planner. Exact equality with
// base-safe is NOT the right lock: merging Q into a canonical redirects edges from OTHER files (an
// R->Q edge becomes R->canonical), so a cumulatively-pre-flighted merge can legitimately differ from a
// base-only check. The robust locks: (1) every emitted merge is a REAL ready opportunity (no fabricated
// merges); (2) when at least one ready pair is base-safe the planner does NOT drop every merge — the
// first base-safe candidate is always includable (deletes are cycle-neutral, so cur == base for it).
test('CMP-INCLUDES-MERGES: emitted merges are real opportunities; not all merges are dropped', () => {
  const rng = prng(11);
  let trialsWithMerges = 0;
  for (let i = 0; i < 200; i++) {
    const g = normalizeGraph(randomGraph(rng));
    const advisors = synthAdvisors(g, rng);
    const plan = planCampaign(g, advisors);
    const mergeSteps = plan.steps.filter((s) => s.op && s.op.kind === 'merge');
    const readyCanon = new Set(advisors.optimize.opportunities.map((o) => o.canonical));
    for (const s of mergeSteps) assert.ok(readyCanon.has(s.op.into), `case ${i}: merge into ${s.op.into} is not a ready opportunity (fabricated)`);
    if (safeReadyPairs(g, advisors).length >= 1) assert.ok(mergeSteps.length >= 1, `case ${i}: a base-safe merge exists but the planner emitted none`);
    if (mergeSteps.length) trialsWithMerges++;
  }
  assert.ok(trialsWithMerges > 5, 'the generator must actually produce includable merges across trials (else the test is vacuous)');
});

test('CMP-ORDER: cuts precede deletes precede merges; within a phase ROI is non-increasing', () => {
  const rng = prng(2);
  for (let i = 0; i < 100; i++) {
    const g = normalizeGraph(randomGraph(rng));
    const plan = planCampaign(g, synthAdvisors(g, rng));
    const phase = { cut: 0, delete: 1, merge: 2 };
    let last = -1, lastRoiInPhase = Infinity, lastPhase = -1;
    for (const s of plan.steps) {
      const p = phase[s.type];
      assert.ok(p >= last, `phase order violated at ${s.type}`);
      if (p !== lastPhase) { lastRoiInPhase = Infinity; lastPhase = p; }
      assert.ok(s.roi <= lastRoiInPhase + 1e-9, 'ROI non-increasing within a phase');
      lastRoiInPhase = s.roi; last = p;
    }
  }
});

test('CMP-MONOTONE-DELTAS: cumulative locReclaimed AND cyclesBroken non-decreasing; totals == sum', () => {
  const rng = prng(3);
  for (let i = 0; i < 100; i++) {
    const g = normalizeGraph(randomGraph(rng));
    const plan = planCampaign(g, synthAdvisors(g, rng));
    let loc = 0, cyc = 0;
    for (const s of plan.steps) {
      loc += s.delta.locReclaimed || 0; cyc += s.delta.cyclesBroken || 0;
      assert.ok(s.cumulative.locReclaimed >= loc - 1e-9, 'cumulative loc tracks the running sum');
      assert.ok(s.cumulative.cyclesBroken >= cyc - 1e-9, 'cumulative cyclesBroken tracks the running sum');
    }
    assert.equal(plan.totals.locReclaimed, loc);
    assert.equal(plan.totals.cyclesBroken, cyc);
  }
});

test('CMP-BUDGET: --budget N yields the first-N prefix of the full ordered plan, at several lengths', () => {
  const rng = prng(4);
  let sawLong = false;
  for (let i = 0; i < 120; i++) {
    const g = normalizeGraph(randomGraph(rng));
    const advisors = synthAdvisors(g, rng);
    const full = planCampaign(g, advisors);
    if (full.steps.length >= 3) sawLong = true;
    for (const N of [0, 1, 2, full.steps.length]) {
      const budgeted = planCampaign(g, { ...advisors, budget: N });
      assert.ok(budgeted.steps.length <= N, `budget ${N} respected`);
      assert.deepEqual(budgeted.steps.map((s) => s.id), full.steps.slice(0, N).map((s) => s.id), `budget ${N} is a prefix, not a reshuffle`);
    }
  }
  assert.ok(sawLong, 'the generator must produce a plan of length >= 3 so the prefix relation is non-trivial');
});

test('CMP-EMPTY + CMP-DETERMINISTIC: clean graph -> empty plan; deterministic incl. shuffled input', () => {
  const clean = { meta: {}, nodes: [{ id: 'a.js:x', label: 'x', kind: 'function', file: 'a.js', exports: true, loc: 3 }], edges: [], domains: [], overlaps: [] };
  const empty = planCampaign(normalizeGraph(clean), { optimize: { opportunities: [] }, deadcode: { safe: [] }, breakCycles: { cycles: [] } });
  assert.deepEqual(empty.steps, []);
  assert.equal(empty.totals.locReclaimed, 0);
  const rng = prng(5); const g = normalizeGraph(randomGraph(rng)); const adv = synthAdvisors(g, rng);
  assert.deepEqual(planCampaign(g, adv), planCampaign(g, adv), 'deterministic');
  // input-order invariance: shuffling nodes/edges must not change the plan
  const shuffled = normalizeGraph({ ...g, nodes: g.nodes.slice().reverse(), edges: g.edges.slice().reverse() });
  assert.deepEqual(planCampaign(shuffled, adv).steps.map((s) => s.id), planCampaign(g, adv).steps.map((s) => s.id), 'plan independent of input ordering');
});

test('CMP-CLI: campaign.mjs --json composes all three advisors — a delete AND a merge appear', () => {
  const dir = tmpDir('codeweb-camp-');
  try {
    // a deletable orphan (b.js:dead) + a body-confirmed cross-file duplicate pair (overlaps[]) whose
    // merge is acyclic -> optimize tiers it "ready". campaign must surface both a delete and a merge.
    const g = { meta: { target: 't' }, domains: [],
      nodes: [
        { id: 'a.js:used', label: 'used', kind: 'function', file: 'a.js', exports: true, loc: 3 },
        { id: 'b.js:dead', label: 'dead', kind: 'function', file: 'b.js', exports: false, loc: 4 },
        { id: 'c.js:dup', label: 'dup', kind: 'function', file: 'c.js', exports: true, loc: 6 },
        { id: 'd.js:dup', label: 'dup', kind: 'function', file: 'd.js', exports: true, loc: 6 },
      ],
      edges: [],
      overlaps: [{ id: 'ov1', kind: 'duplicate-logic', confidence: 'high', severity: 'high', bodySim: 0.92, drifted: false, nodes: ['c.js:dup', 'd.js:dup'], title: '`dup` re-implemented', domains: ['c', 'd'], evidence: 'x', recommendation: 'merge' }],
    };
    const gp = join(dir, 'graph.json'); writeFileSync(gp, JSON.stringify(g));
    const r = runNode(script('campaign.mjs'), [gp, '--json']);
    assert.equal(r.status, 0, r.stderr);
    const payload = JSON.parse(r.stdout);
    assert.ok(Array.isArray(payload.steps), 'emits an ordered steps[] worklist');
    assert.ok(payload.steps.some((s) => s.op?.kind === 'delete' && s.op.ids.includes('b.js:dead')), 'plans the dead-code delete');
    assert.ok(payload.steps.some((s) => s.op?.kind === 'merge' && s.op.ids.includes('c.js:dup')), 'plans the duplicate merge');
    // ordering: the delete must precede the merge (phase order)
    const di = payload.steps.findIndex((s) => s.op?.kind === 'delete');
    const mi = payload.steps.findIndex((s) => s.op?.kind === 'merge');
    assert.ok(di < mi, 'delete is planned before merge');
  } finally { cleanup(dir); }
});

// CMP-DELETE-ROI: a delete step's ROI is the orphan's real span. deadcode.mjs emits `loc` on every
// safe item (locSaved remains a legacy alias) — before this contract, campaign read a field the
// producer never emitted, so every delete ranked roi 0 and contributed 0 to locReclaimed.
test('CMP-DELETE-ROI: delete steps rank and project by the deadcode `loc` field', () => {
  const g = normalizeGraph({
    meta: {},
    nodes: [
      { id: 'a.js:big', label: 'big', kind: 'function', file: 'a.js', line: 1, loc: 40, exports: false },
      { id: 'b.js:small', label: 'small', kind: 'function', file: 'b.js', line: 1, loc: 3, exports: false },
    ],
    edges: [],
  });
  const plan = planCampaign(g, { deadcode: { safe: [
    { id: 'b.js:small', file: 'b.js', domain: 'unassigned', loc: 3, reason: 'synthetic' },
    { id: 'a.js:big', file: 'a.js', domain: 'unassigned', loc: 40, reason: 'synthetic' },
  ] } });
  assert.equal(plan.steps.length, 2);
  assert.equal(plan.steps[0].op.ids[0], 'a.js:big', 'higher-loc delete ranks first');
  assert.equal(plan.steps[0].roi, 40);
  assert.equal(plan.steps[1].roi, 3);
  assert.equal(plan.totals.locReclaimed, 43, 'projected reclaim sums real spans, not 0');
  // legacy alias still honored
  const legacy = planCampaign(g, { deadcode: { safe: [{ id: 'a.js:big', locSaved: 7 }] } });
  assert.equal(legacy.steps[0].roi, 7);
});
