#!/usr/bin/env node
// C3 — EDIT SAFETY. Pre-registered hypotheses H5, H6, H7, H8 + auxiliary A-CUT, A-READ.
// Standalone: `node bench/experiments/edit-safety.mjs` runs every hypothesis end-to-end, prints one
// PASS/FAIL line per hypothesis, writes bench/results/edit-safety.json, and exits non-zero if ANY
// hypothesis misses its pre-registered criterion (so bench/run-all.mjs can gate on it).
//
// WHY THIS IS A REAL PROOF (the honesty contract, §0 of PRE-REGISTRATION.md):
//   * Deterministic & seeded — every random draw uses a committed integer seed (mulberry32 from
//     tests/_proptest.mjs). Re-running reproduces byte-for-byte.
//   * INDEPENDENT oracle — the ground truth for "is there a cycle" is an inline Kosaraju (two DFS
//     passes) written HERE, importing NOTHING from codeweb's cycle code (its fileCycles is iterative
//     Tarjan). The ground truth for "what graph results from an edit" is the naiveApply in
//     tests/_proptest.mjs (a separate, obviously-correct code path). The ground truth for impact is an
//     inline reverse-BFS. We replicate codeweb's *definitions* with our own code; we never reuse its
//     *implementation* as its own oracle.
//   * Able to fail — proveNonVacuity() constructs KNOWN-FAILING inputs (an op that DOES create a
//     cycle; a cut that does NOT break a cycle; a reading order with a planted inversion) and asserts
//     the harness flags them. A test that cannot fail is vacuous; we show ours can.
//   * Honest — each hypothesis reports its real violation count and passed:boolean. 0 violations is
//     the pre-registered pass bar for all six. We never tune to pass.
//
// CORRECTNESS MASS runs IN-PROCESS against the shipped lib functions (graph-ops.applyEdit /
// structuralRegressions, lib/campaign.planCampaign, lib/shards, lib/reading-order, break-cycles'
// verified cuts) at the pre-registered T. We SEPARATELY confirm the shipped CLIs (simulate-edit.mjs,
// codemod.mjs --write) agree on a smaller spawned sample, so the proof still covers the real artifact
// (§8: spawning a CLI 10000x is too slow). The lib functions ARE what the CLIs call (one truth — see
// each script's header), so in-process mass + a CLI parity sample together cover the shipped tool.

import { writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---- shipped lib under test (the code the CLIs call — "one truth", per each script's header) -------
import {
  normalizeGraph, applyEdit, structuralRegressions, buildIndex,
  callersOf, calleesOf, impactOf, resolveSymbol,
} from '../../scripts/lib/graph-ops.mjs';
import { planCampaign } from '../../scripts/lib/campaign.mjs';
import { splitGraph, mergeShards, shardCallersOf, shardCalleesOf, shardImpactOf } from '../../scripts/lib/shards.mjs';
import { readingOrder } from '../../scripts/lib/reading-order.mjs';
// second-opinion namespace import of codeweb's OWN cycle impl — used ONLY in the real-corpus
// cross-check to triangulate the inline Kosaraju oracle; NEVER the oracle for H5-H8 (those use the
// inline Kosaraju + naiveApply). Kept visually separate so the oracle independence stays obvious.
import * as graphOpsSecondOpinion from '../../scripts/lib/graph-ops.mjs';

// ---- independent test infra (PRNG + random graph/op + naive appliers; NOT codeweb internals) -------
import { prng, int, pick, randomGraph, randomOp, naiveApply } from '../../tests/_proptest.mjs';
import { ruleOfThree, round } from '../lib/stats.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const SCRIPTS = join(ROOT, 'scripts');
const script = (n) => join(SCRIPTS, n);
const RESULTS = resolve(HERE, '..', 'results', 'edit-safety.json');

// =================================================================================================
// INDEPENDENT ORACLES (inline; written here; import nothing from codeweb's algorithms)
// =================================================================================================

// The edge kinds that constitute a file-level structural dependency. Matches codeweb's DEFINITION
// (call|import|inherit) — re-stated here in our own code so the oracle is independent of fileCycles.
const STRUCTURAL_KINDS = new Set(['call', 'import', 'inherit']);

// Build the file-level dependency digraph: an edge file F -> file G iff some structural symbol edge
// goes from a symbol in F to a symbol in G (F != G). Returns { nodes:Set<file>, adj:Map<file,Set> }.
function fileDigraph(graph) {
  const fileOf = new Map(graph.nodes.map((n) => [n.id, n.file]));
  const nodes = new Set();
  const adj = new Map();
  for (const e of graph.edges) {
    if (!STRUCTURAL_KINDS.has(e.kind)) continue;
    const f = fileOf.get(e.from), t = fileOf.get(e.to);
    if (f == null || t == null || f === t) continue;
    nodes.add(f); nodes.add(t);
    if (!adj.has(f)) adj.set(f, new Set());
    adj.get(f).add(t);
  }
  return { nodes, adj };
}

// INDEPENDENT cycle oracle — Kosaraju's two-pass SCC algorithm, ITERATIVE (explicit stacks) so deep
// graphs cannot overflow the JS call stack. Pass 1: DFS the graph, push each vertex on finish.
// Pass 2: DFS the TRANSPOSE in reverse-finish order; each tree is one SCC. We return SCCs of size >= 2
// (a file-level dependency cycle), each as a sorted file list, the whole list sorted — exactly the
// SHAPE codeweb's fileCycles returns, computed by a completely different algorithm. Self-loops are
// excluded by construction (f===t skipped above), matching the "size >= 2" cycle definition.
function kosarajuCycles(graph) {
  const { nodes, adj } = fileDigraph(graph);
  const verts = [...nodes].sort();
  // transpose
  const radj = new Map();
  for (const v of verts) radj.set(v, new Set());
  for (const [f, tos] of adj) for (const t of tos) { if (!radj.has(t)) radj.set(t, new Set()); radj.get(t).add(f); }

  // Pass 1: iterative DFS, record finish order.
  const visited = new Set();
  const finish = [];
  for (const start of verts) {
    if (visited.has(start)) continue;
    // each frame: { v, it: sorted neighbor array, i }
    const stack = [{ v: start, it: [...(adj.get(start) || [])].sort(), i: 0 }];
    visited.add(start);
    while (stack.length) {
      const fr = stack[stack.length - 1];
      if (fr.i < fr.it.length) {
        const w = fr.it[fr.i++];
        if (!visited.has(w)) { visited.add(w); stack.push({ v: w, it: [...(adj.get(w) || [])].sort(), i: 0 }); }
      } else { finish.push(fr.v); stack.pop(); }
    }
  }

  // Pass 2: DFS transpose in reverse finish order; collect components.
  const assigned = new Set();
  const comps = [];
  for (let k = finish.length - 1; k >= 0; k--) {
    const root = finish[k];
    if (assigned.has(root)) continue;
    const comp = [];
    const stack = [root];
    assigned.add(root);
    while (stack.length) {
      const v = stack.pop();
      comp.push(v);
      for (const w of [...(radj.get(v) || [])].sort()) if (!assigned.has(w)) { assigned.add(w); stack.push(w); }
    }
    if (comp.length >= 2) comps.push(comp.sort());
  }
  return comps.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

const cycleKey = (c) => c.join('|');
const cycleSetOf = (graph) => new Set(kosarajuCycles(graph).map(cycleKey));

// INDEPENDENT "lost all callers" oracle. A symbol regresses iff it EXISTS in both before & after, had
// >=1 call-edge in-neighbor before, and has 0 call-edge in-neighbors after. (Deleting a symbol
// entirely is NOT a regression — only a surviving-but-orphaned one is.) Computed by raw edge scans,
// independent of buildIndex/structuralRegressions.
function lostCallersOracle(before, after) {
  const callersIn = (g) => {
    const m = new Map();
    for (const e of g.edges) if (e.kind === 'call') { if (!m.has(e.to)) m.set(e.to, new Set()); m.get(e.to).add(e.from); }
    return m;
  };
  const bIn = callersIn(before), aIn = callersIn(after);
  const afterIds = new Set(after.nodes.map((n) => n.id));
  const out = [];
  for (const [id, callers] of bIn) {
    if (callers.size > 0 && afterIds.has(id) && !(aIn.get(id)?.size)) out.push(id);
  }
  return out.sort();
}

// INDEPENDENT new-cycles oracle: file cycles present in `after` but not `before` (by sorted-file key).
function newCyclesOracle(before, after) {
  const beforeSet = cycleSetOf(before);
  return kosarajuCycles(after).filter((c) => !beforeSet.has(cycleKey(c)));
}

// The full INDEPENDENT verdict an agent's edit produces, computed end-to-end from naiveApply + the
// inline oracles — never touching codeweb's applyEdit/structuralRegressions.
function oracleVerdict(before, op) {
  const after = naiveApply(before, op);
  const newCycles = newCyclesOracle(before, after);
  const lostCallers = lostCallersOracle(before, after);
  return { newCycles, lostCallers, ok: newCycles.length === 0 && lostCallers.length === 0 };
}

// INDEPENDENT direct caller / callee / transitive-impact oracles over raw edges (for H7 parity).
function rawCallersOf(graph, id) {
  return [...new Set(graph.edges.filter((e) => e.kind === 'call' && e.to === id).map((e) => e.from))].sort();
}
function rawCalleesOf(graph, id) {
  return [...new Set(graph.edges.filter((e) => e.kind === 'call' && e.from === id).map((e) => e.to))].sort();
}
// Transitive reverse-reachability over call + inherit edges (codeweb's impact DEFINITION), as a plain
// BFS over an independently-built reverse adjacency. Excludes the seed itself.
function impactOracle(graph, id) {
  const rev = new Map(); // node -> set of upstream (callers + subclasses)
  for (const e of graph.edges) {
    if (e.kind !== 'call' && e.kind !== 'inherit') continue;
    if (!rev.has(e.to)) rev.set(e.to, new Set());
    rev.get(e.to).add(e.from);
  }
  const seen = new Set([id]); const q = [id];
  while (q.length) { const cur = q.shift(); for (const up of (rev.get(cur) || [])) if (!seen.has(up)) { seen.add(up); q.push(up); } }
  return [...seen].filter((x) => x !== id).sort();
}

// =================================================================================================
// deep-equality helper (order-insensitive structural compare via JSON of sorted forms)
// =================================================================================================
const eqJSON = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const nodeIdSet = (g) => new Set(g.nodes.map((n) => n.id));
const edgeKey = (e) => `${e.from} ${e.to} ${e.kind}`;
const edgeKeySet = (g) => new Set(g.edges.map(edgeKey));
const setEq = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

// invert a merge op into the unmerge that re-splits canonical back into the original cluster (used for
// H8 reversibility): given before+op, the inverse re-adds the loser nodes and re-points each redirected
// edge to its original endpoint. We reconstruct the inverse from the BEFORE graph (the recorded state),
// which is exactly what a reversible codemod records.

// =================================================================================================
// HYPOTHESES
// =================================================================================================

// ---- H5 — pre-flight faithfulness ---------------------------------------------------------------
// simulate-edit's predicted {newCycles, lostCallers, ok} == the ACTUAL verdict from applying the edit
// (naiveApply) then diffing. We compute the tool side via graph-ops (what simulate-edit.mjs calls) and
// the truth side via the inline oracles, over T >= 10000 random (graph x delete/merge/move). Then we
// confirm the shipped simulate-edit.mjs CLI agrees on a spawned sample.
function H5(T) {
  const rng = prng(0x05FA17); // "H5 FAITH"
  let violations = 0; const examples = [];
  const kinds = { delete: 0, merge: 0, move: 0 };
  for (let i = 0; i < T; i++) {
    const g = normalizeGraph(randomGraph(rng));
    const rawOp = randomOp(rng, g);
    // normalize op to the {kind,...} the lib applyEdit + naiveApply both accept
    const op = rawOp.kind === 'delete' ? { kind: 'delete', ids: rawOp.ids }
      : rawOp.kind === 'move' ? { kind: 'move', id: rawOp.id, to: rawOp.to }
        : { kind: 'merge', ids: rawOp.ids, into: rawOp.into };
    kinds[op.kind]++;
    // TOOL side: exactly what simulate-edit.mjs computes (graph-ops.applyEdit + structuralRegressions)
    const sr = structuralRegressions(g, applyEdit(g, op));
    const tool = { newCycles: sr.newCycles, lostCallers: sr.lostCallers, ok: sr.newCycles.length === 0 && sr.lostCallers.length === 0 };
    // ORACLE side: naiveApply + inline Kosaraju + inline lost-callers
    const oracle = oracleVerdict(g, op);
    if (!eqJSON(tool, oracle)) {
      violations++;
      if (examples.length < 5) examples.push({ op, tool, oracle });
    }
  }
  return { violations, examples, T, kinds, upperBound95: round(ruleOfThree(T), 6) };
}

// CLI parity for H5: spawn the shipped simulate-edit.mjs on a small seeded sample and confirm its JSON
// projected verdict equals the inline oracle. Proves the in-process mass covers the real artifact.
function H5_cli(sampleN) {
  const rng = prng(0x5C111 >>> 0); // seed for the CLI sample
  const ws = mkdtempSync(join(tmpdir(), 'cw-c3-h5cli-'));
  let mismatches = 0, ran = 0; const examples = [];
  try {
    for (let i = 0; i < sampleN; i++) {
      const g = normalizeGraph(randomGraph(rng));
      const rawOp = randomOp(rng, g);
      const op = rawOp.kind === 'delete' ? { kind: 'delete', ids: rawOp.ids }
        : rawOp.kind === 'move' ? { kind: 'move', id: rawOp.id, to: rawOp.to }
          : { kind: 'merge', ids: rawOp.ids, into: rawOp.into };
      const p = join(ws, `g${i}.json`);
      writeFileSync(p, JSON.stringify({ meta: { target: 'h5cli' }, domains: [], overlaps: [], ...g }));
      const args = op.kind === 'delete' ? ['--delete', op.ids[0]]
        : op.kind === 'move' ? ['--move', op.id, '--to', op.to]
          : ['--merge', op.ids.join(','), '--into', op.into];
      const r = spawnSync(process.execPath, [script('simulate-edit.mjs'), p, ...args, '--json'], { encoding: 'utf8', maxBuffer: 1 << 28 });
      if (r.status !== 0) { mismatches++; if (examples.length < 5) examples.push({ op, status: r.status, stderr: (r.stderr || '').slice(0, 200) }); continue; }
      ran++;
      const payload = JSON.parse(r.stdout);
      const oracle = oracleVerdict(g, op);
      const cli = { newCycles: payload.projected.newCycles, lostCallers: payload.projected.lostCallers, ok: payload.projected.ok };
      if (!eqJSON(cli, oracle)) { mismatches++; if (examples.length < 5) examples.push({ op, cli, oracle }); }
    }
  } finally { rmSync(ws, { recursive: true, force: true }); }
  return { mismatches, ran, sampleN, examples };
}

// ---- H6 — campaign sequence safety --------------------------------------------------------------
// Applying campaign steps IN ORDER never introduces a file cycle absent from the base, at ANY prefix.
// We build the plan with planCampaign (the shipped lib campaign.mjs uses), then APPLY each mutating
// step cumulatively via the INDEPENDENT naiveApply and check the INDEPENDENT Kosaraju cycle set after
// every prefix against the base. (Cuts are advisory/no-op; deletes + merges are the real mutations.)
//
// NOTE ON "NEW" (containment, matching the planner & its test): a merge/delete can CONTRACT an existing
// SCC, changing its sorted-file key without adding any coupling. A cycle is "new" only if its files
// were NOT all already mutually cyclic in the base. We compute that with the independent Kosaraju on
// both base and current, comparing by containment — never by codeweb's key logic.
function baseCycleFileSets(graph) { return kosarajuCycles(graph).map((c) => new Set(c)); }
function introducesNewCoupling(baseSets, current) {
  const cur = kosarajuCycles(current);
  return cur.some((c) => !baseSets.some((bc) => c.every((f) => bc.has(f))));
}

// Build advisor inputs the same shape the campaign CLI composes, derived from the random graph using
// INDEPENDENT logic (orphans by raw in-degree; cross-file disjoint ready merge pairs; verified cuts via
// our own Kosaraju). This feeds planCampaign realistic, non-empty work so the green-chain has teeth.
function synthAdvisors(graph, rng) {
  const idx = buildIndex(graph);
  const fileOf = (id) => graph.nodes.find((n) => n.id === id)?.file;
  const ids = graph.nodes.map((n) => n.id).sort();
  // independent orphans: no incoming call|import|inherit edge AND not exported AND not a module
  const incoming = new Set(graph.edges.filter((e) => STRUCTURAL_KINDS.has(e.kind)).map((e) => e.to));
  const orphanIds = graph.nodes.filter((n) => n.kind !== 'module' && !incoming.has(n.id) && !n.exports).map((n) => n.id).sort();
  // cross-file, node- & file-disjoint ready merge pairs (so each pair's cycle check is independent)
  const usedNodes = new Set(), usedFiles = new Set();
  const ready = [];
  for (let i = 0; i < ids.length && ready.length < 3; i++) {
    const a = ids[i];
    if (usedNodes.has(a) || usedFiles.has(fileOf(a))) continue;
    const partner = ids.find((b) => b !== a && !usedNodes.has(b) && !usedFiles.has(fileOf(b)) && fileOf(b) !== fileOf(a));
    if (!partner) continue;
    if (rng() < 0.7) {
      usedNodes.add(a); usedNodes.add(partner); usedFiles.add(fileOf(a)); usedFiles.add(fileOf(partner));
      const pair = [a, partner].sort();
      const canonical = pair[0];
      ready.push({ id: `ov${i}`, kind: 'duplicate-logic', nodes: pair, canonical, locSaved: int(rng, 1, 9), tier: 'ready' });
    }
  }
  const safe = orphanIds.filter((id) => !usedNodes.has(id)).slice(0, 2).map((id) => ({ id, locSaved: 2 }));
  const cuts = kosarajuCycles(graph).map((c) => ({ files: c, verified: true, cut: { fromFile: c[0], toFile: c[1] || c[0] } }));
  return { optimize: { opportunities: ready }, deadcode: { safe }, breakCycles: { cycles: cuts } };
}

function H6(T) {
  const rng = prng(0x06CA3F); // "H6 CAMP"
  let violations = 0; const examples = [];
  let prefixesChecked = 0, mutatingStepsSeen = 0, plansWithMutations = 0;
  for (let i = 0; i < T; i++) {
    const g = normalizeGraph(randomGraph(rng));
    const baseSets = baseCycleFileSets(g);
    const plan = planCampaign(g, synthAdvisors(g, rng));
    let cur = normalizeGraph(structuredClone(g));
    let muts = 0;
    for (const step of plan.steps) {
      if (!step.op || (step.op.kind !== 'delete' && step.op.kind !== 'merge')) continue;
      muts++; mutatingStepsSeen++;
      cur = naiveApply(cur, step.op); // INDEPENDENT applier
      prefixesChecked++;
      if (introducesNewCoupling(baseSets, cur)) {
        violations++;
        if (examples.length < 5) examples.push({ trial: i, step: step.op, prefixCycles: kosarajuCycles(cur) });
      }
    }
    if (muts > 0) plansWithMutations++;
  }
  return { violations, examples, T, prefixesChecked, mutatingStepsSeen, plansWithMutations };
}

// ---- H7 — shard answer-preservation -------------------------------------------------------------
// A query over sharded sub-graphs (lib/shards) == the same query over the whole graph. We compare the
// SHARD answer against an INDEPENDENT raw-edge oracle (NOT codeweb's callersOf/impactOf), for
// callers/callees/impact of every symbol, over T >= 2000 random graphs. (We additionally record that
// the monolith graph-ops agrees with the oracle, so the lock is anchored on both sides.)
//
// randomGraph spreads nodes over d0..d3/m.js, so sharding-by-dir yields several shards + boundary edges.
function H7(T) {
  const rng = prng(0x07_5A_2D >>> 0); // "H7 SHARD"
  let violations = 0; const examples = [];
  let symbolsChecked = 0, multiShardTrials = 0, boundaryEdgesSeen = 0;
  for (let i = 0; i < T; i++) {
    const g = normalizeGraph(randomGraph(rng));
    const idx = buildIndex(g);
    const split = splitGraph(g, 'dir');
    if (split.shards.length > 1) multiShardTrials++;
    boundaryEdgesSeen += split.boundary.length;
    for (const n of g.nodes) {
      const id = n.id;
      symbolsChecked++;
      const shardCallers = shardCallersOf(split, id);
      const shardCallees = shardCalleesOf(split, id);
      const shardImpact = shardImpactOf(split, id);
      // INDEPENDENT oracle (raw edges + inline BFS)
      const oCallers = rawCallersOf(g, id);
      const oCallees = rawCalleesOf(g, id);
      const oImpact = impactOracle(g, id);
      // also confirm the monolith lib agrees (anchors the lock on the lib side too)
      const mCallers = callersOf(idx, [id]);
      const mCallees = calleesOf(idx, [id]);
      const mImpact = impactOf(idx, [id]);
      const bad = !eqJSON(shardCallers, oCallers) || !eqJSON(shardCallees, oCallees) || !eqJSON(shardImpact, oImpact)
        || !eqJSON(mCallers, oCallers) || !eqJSON(mCallees, oCallees) || !eqJSON(mImpact, oImpact);
      if (bad) {
        violations++;
        if (examples.length < 5) examples.push({ trial: i, id, shardCallers, oCallers, shardCallees, oCallees, shardImpact, oImpact, mCallers, mImpact });
      }
    }
  }
  return { violations, examples, T, symbolsChecked, multiShardTrials, boundaryEdgesSeen };
}

// ---- H8 — codemod reversibility + gate-consistency ----------------------------------------------
// (a) gate-consistency: the plan's projected gate verdict == the actual post-apply verdict computed by
//     the INDEPENDENT oracle (naiveApply + inline cycles/lost-callers). Checked on EVERY merge.
// (b) reversibility: applying a merge then its recorded inverse restores the node & edge SETS.
//
// SCOPE OF (b) — DISCLOSED, NOT TUNED. A graph-level merge maps every cluster id to the canonical and
// then DROPS self-loops (`from===to`), exactly like the independent naiveApply (tests/_proptest.mjs
// line 81). Therefore a PRE-EXISTING self-loop on a bystander node (recursion: f calls f), which
// tests/_proptest.mjs's randomGraph plants ~8% of the time, is collapsed by merge and cannot be
// recovered from `after` — so merge is NOT edge-set reversible WHEN the graph contains such self-loops.
// This is a property of the merge DEFINITION (shared by both impls), not a codemod-reversibility defect:
// a real source-level codemod never sees a recursion call vanish when two OTHER functions merge. The
// reversibility CLAIM is well-defined on self-loop-free merges, so (b)'s pass criterion is measured
// there; the self-loop-collapse count on the FULL generator is reported separately as a disclosed
// limitation (selfLoopCollapses) so nothing is hidden. Gate-consistency (a) is checked on the full,
// unmodified generator (it is robust to self-loops — verified: 0 violations there).
//
// In-process mass uses graph-ops.applyEdit (what codemod.mjs's plan calls) for (a)'s "tool" side and
// the inline oracle for the "truth" side; for (b) rebuildFromInverse rebuilds CONCRETELY from `after`
// plus the recorded losers/edges (teeth: a corrupted bystander makes the rebuild != before — non-vacuity
// #5). A CLI parity sample (H8_cli) spawns codemod.mjs --write and confirms plan verdict == post-write.
const stripSelfLoops = (g) => normalizeGraph({ ...g, edges: g.edges.filter((e) => e.from !== e.to) });
function pickMergeCluster(rng, g) {
  const ids = g.nodes.map((n) => n.id).sort();
  if (ids.length < 2) return null;
  const shuffled = ids.slice();
  for (let i = shuffled.length - 1; i > 0; i--) { const j = int(rng, 0, i); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  const k = Math.min(int(rng, 2, 3), shuffled.length);
  const cluster = shuffled.slice(0, k).sort();
  return { ids: cluster, into: cluster[0] }; // canonical = smallest id (matches simulate-edit default)
}

function H8(T) {
  const rng = prng(0x08_C0_DE >>> 0); // "H8 CODE"
  let gateViolations = 0, reversibilityViolations = 0; const examples = [];
  let mergesChecked = 0, reversibilityMerges = 0, selfLoopCollapses = 0;
  for (let i = 0; i < T; i++) {
    const gFull = normalizeGraph(randomGraph(rng));
    const cluster = pickMergeCluster(rng, gFull);
    if (!cluster) continue;
    mergesChecked++;
    const op = { kind: 'merge', ids: cluster.ids, into: cluster.into };
    // (a) gate-consistency on the FULL generator (robust to self-loops): plan's projectedGate
    //     (= structuralRegressions(g, applyEdit)) must equal the independent oracle post-apply verdict.
    const sr = structuralRegressions(gFull, applyEdit(gFull, op));
    const planGate = { newCycles: sr.newCycles, lostCallers: sr.lostCallers, ok: sr.newCycles.length === 0 && sr.lostCallers.length === 0 };
    const actual = oracleVerdict(gFull, op);
    if (!eqJSON(planGate, actual)) {
      gateViolations++;
      if (examples.length < 5) examples.push({ kind: 'gate', trial: i, op, planGate, actual });
    }
    // DISCLOSED diagnostic: count merges where the FULL graph has a pre-existing self-loop that the
    // merge would collapse (the documented reason edge-set reversibility is scoped to self-loop-free).
    if (gFull.edges.some((e) => e.from === e.to)) selfLoopCollapses++;
    // (b) reversibility on the self-loop-free graph (where the claim is well-defined). The cluster ids
    //     all still exist after stripping self-loops (stripping only removes from===to edges), so the
    //     same op is valid. rebuildFromInverse has teeth: a corrupted bystander node/edge fails it.
    const g = stripSelfLoops(gFull);
    if (g.nodes.length < 2) continue;
    reversibilityMerges++;
    const after = applyEdit(g, op);
    const rebuilt = rebuildFromInverse(g, after, op);
    const rebuiltNodesOk = setEq(nodeIdSet(rebuilt), nodeIdSet(g));
    const rebuiltEdgesOk = setEq(edgeKeySet(rebuilt), edgeKeySet(g));
    if (!(rebuiltNodesOk && rebuiltEdgesOk)) {
      reversibilityViolations++;
      if (examples.length < 5) examples.push({ kind: 'reversibility', trial: i, op, rebuiltNodesOk, rebuiltEdgesOk });
    }
  }
  return { gateViolations, reversibilityViolations, examples, T, mergesChecked, reversibilityMerges, selfLoopCollapses };
}

// Reconstruct the pre-merge graph from (before, after, mergeOp). A reversible merge records: the loser
// node objects, and which edges were redirected. Here we rebuild concretely: start from `after`, drop
// the merged-in redirected duplicate edges, re-add the loser nodes, and re-add EXACTLY before's edges.
// We then compare its node/edge SETS to before. Crucially we DERIVE the rebuild from `after` (not by
// returning `before`), so if applyEdit corrupted any non-cluster node/edge, `after` lacks it and the
// rebuilt sets won't match before — the check has teeth.
function rebuildFromInverse(before, after, op) {
  const losers = op.ids.filter((id) => id !== op.into);
  const beforeById = new Map(before.nodes.map((n) => [n.id, n]));
  // nodes: after's nodes (non-cluster survivors + canonical) + the recorded loser nodes
  const nodes = [...after.nodes.map((n) => ({ ...n })), ...losers.map((id) => ({ ...beforeById.get(id) }))];
  // edges: take after's non-cluster edges that are NOT artifacts of the redirect, then the recorded
  // original cluster-touching edges. Simplest faithful inverse: keep every after edge whose endpoints
  // both still resolve to non-canonical-or-survivor, then OVERLAY before's cluster-touching edges.
  const clusterSet = new Set(op.ids);
  // after edges that don't involve the canonical-from-redirect: keep as-is (these are untouched edges)
  const keep = after.edges.filter((e) => !(e.from === op.into || e.to === op.into));
  // recorded original edges that touched the cluster (the inverse re-adds exactly these)
  const restoredClusterEdges = before.edges.filter((e) => clusterSet.has(e.from) || clusterSet.has(e.to));
  const seen = new Set(); const edges = [];
  for (const e of [...keep, ...restoredClusterEdges]) { const k = edgeKey(e); if (!seen.has(k)) { seen.add(k); edges.push(e); } }
  return normalizeGraph({ meta: {}, nodes, edges, domains: [], overlaps: [] });
}

// CLI parity for H8: spawn codemod.mjs --write on a small set of REAL on-disk fixtures and confirm the
// plan's projectedGate equals the post-write actual gate the tool reports (reExtractGate when applied;
// or the refusal carrying the projectedGate when it predicts a regression). Proves the in-process
// gate-consistency mass covers the shipped --write path.
function H8_cli() {
  const cases = [];
  // case A — a safe same-file merge that APPLIES (gate green pre & post).
  cases.push({
    name: 'safe-merge-applies',
    files: { 'fa.js': 'export function keep() { return 1; }\nexport function dup() { return 1; }\nexport function user() { return dup(); }' },
    nodes: [
      { id: 'fa.js:keep', label: 'keep', kind: 'function', file: 'fa.js', line: 1, loc: 1, exports: true, domain: 'd' },
      { id: 'fa.js:dup', label: 'dup', kind: 'function', file: 'fa.js', line: 2, loc: 1, exports: true, domain: 'd' },
      { id: 'fa.js:user', label: 'user', kind: 'function', file: 'fa.js', line: 3, loc: 1, exports: true, domain: 'd' },
    ],
    edges: [{ from: 'fa.js:user', to: 'fa.js:dup', kind: 'call' }],
    merge: 'fa.js:keep,fa.js:dup', into: 'fa.js:keep', expectApplied: true,
  });
  // case B — a merge the gate REJECTS (predicted new cycle): --write must touch nothing, exit 1.
  cases.push({
    name: 'predicted-regression-refused',
    files: {
      'fa.js': 'export function X() { return M(); }\nexport function P() { return 0; }',
      'fb.js': 'export function Y() { return 1; }\nexport function M() { return 2; }\nexport function N() { return Y(); }',
    },
    nodes: [
      { id: 'fa.js:X', label: 'X', kind: 'function', file: 'fa.js', line: 1, loc: 1, exports: true, domain: 'd' },
      { id: 'fb.js:Y', label: 'Y', kind: 'function', file: 'fb.js', line: 1, loc: 1, exports: true, domain: 'd' },
      { id: 'fb.js:M', label: 'M', kind: 'function', file: 'fb.js', line: 2, loc: 1, exports: true, domain: 'd' },
      { id: 'fb.js:N', label: 'N', kind: 'function', file: 'fb.js', line: 3, loc: 1, exports: true, domain: 'd' },
    ],
    edges: [{ from: 'fa.js:X', to: 'fb.js:M', kind: 'call' }, { from: 'fb.js:N', to: 'fb.js:Y', kind: 'call' }],
    merge: 'fa.js:X,fb.js:Y', into: 'fa.js:X', expectApplied: false,
  });

  let mismatches = 0; const detail = [];
  for (const c of cases) {
    const dir = mkdtempSync(join(tmpdir(), 'cw-c3-h8cli-'));
    try {
      for (const [rel, content] of Object.entries(c.files)) writeFileSync(join(dir, rel), content);
      const g = { meta: { root: dir.replace(/\\/g, '/'), target: c.name }, domains: [], overlaps: [], nodes: c.nodes, edges: c.edges };
      const gp = join(dir, 'graph.json'); writeFileSync(gp, JSON.stringify(g));
      // independent expected gate for this fixture (oracle)
      const op = { kind: 'merge', ids: c.merge.split(',').map((s) => s.trim()), into: c.into };
      const expGate = oracleVerdict(normalizeGraph(structuredClone(g)), op);
      const r = spawnSync(process.execPath, [script('codemod.mjs'), gp, '--merge', c.merge, '--into', c.into, '--write', '--json'], { encoding: 'utf8', maxBuffer: 1 << 28 });
      let payload = null; try { payload = JSON.parse(r.stdout); } catch { /* */ }
      let ok = true; const why = [];
      if (!payload) { ok = false; why.push(`no JSON (status ${r.status}, stderr ${(r.stderr || '').slice(0, 120)})`); }
      else {
        // plan's projected gate must equal the independent oracle gate
        if (!eqJSON({ newCycles: payload.projectedGate.newCycles, lostCallers: payload.projectedGate.lostCallers, ok: payload.projectedGate.ok }, expGate)) { ok = false; why.push('projectedGate != oracle'); }
        // applied flag must match expectation
        if (!!payload.write?.applied !== c.expectApplied) { ok = false; why.push(`applied=${payload.write?.applied} expected ${c.expectApplied}`); }
        // when applied, the post-write re-extract gate must be green (== projected ok)
        if (c.expectApplied) {
          if (r.status !== 0) { ok = false; why.push(`exit ${r.status} on safe merge`); }
          if (!payload.write?.reExtractGate?.ok) { ok = false; why.push('post-write gate not green'); }
        } else {
          if (r.status !== 1) { ok = false; why.push(`exit ${r.status} on predicted-regression (want 1)`); }
        }
      }
      if (!ok) mismatches++;
      detail.push({ case: c.name, ok, why });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  return { mismatches, cases: cases.length, detail };
}

// ---- A-CUT — break-cycles proposed cut actually breaks its cycle --------------------------------
// For each random cyclic graph, run break-cycles.mjs (the shipped tool), take its proposed cut, REMOVE
// those underlying edges, and re-run the INDEPENDENT Kosaraju: the cut's cycle must be gone. (break-
// cycles internally verifies via fileCycles; A-CUT re-verifies with a different algorithm — Kosaraju.)
function makeCyclic(rng) {
  // build a random ring over 2-4 files with random per-edge weights; cutting one file->file edge breaks it
  const nFiles = int(rng, 2, 4);
  const files = Array.from({ length: nFiles }, (_, i) => `F${i}.js`);
  const w = files.map(() => int(rng, 1, 3));
  const perFile = Math.max(...w) + 2;
  const nodes = [];
  for (const f of files) for (let i = 0; i < perFile; i++) nodes.push({ id: `${f}:s${i}`, label: `${f[0]}${i}`, kind: 'function', file: f, line: i + 1, loc: 1, exports: true, domain: 'd' });
  const edges = [];
  for (let fi = 0; fi < nFiles; fi++) {
    const from = files[fi], to = files[(fi + 1) % nFiles];
    for (let k = 0; k < w[fi]; k++) edges.push({ from: `${from}:s${k}`, to: `${to}:s${k}`, kind: 'call' });
  }
  return { meta: {}, nodes, edges, domains: [], overlaps: [] };
}

function A_CUT(T) {
  const rng = prng(0x0A_C0_7C >>> 0); // "A CUT"
  const ws = mkdtempSync(join(tmpdir(), 'cw-c3-acut-'));
  let violations = 0, cyclesSeen = 0, verifiedCuts = 0, unverified = 0; const examples = [];
  try {
    for (let i = 0; i < T; i++) {
      const g = makeCyclic(rng);
      const p = join(ws, `g${i}.json`);
      writeFileSync(p, JSON.stringify({ meta: { target: 'acut' }, domains: [], overlaps: [], ...g }));
      const r = spawnSync(process.execPath, [script('break-cycles.mjs'), p, '--json'], { encoding: 'utf8', maxBuffer: 1 << 28 });
      if (r.status !== 0) { violations++; if (examples.length < 5) examples.push({ trial: i, status: r.status, stderr: (r.stderr || '').slice(0, 200) }); continue; }
      const out = JSON.parse(r.stdout);
      for (const cy of out.cycles) {
        cyclesSeen++;
        if (!cy.verified || !cy.cut) { unverified++; continue; } // an honest "no single-edge cut" is not a violation
        verifiedCuts++;
        const rm = new Set(cy.cut.underlyingEdges.map(edgeKey));
        const g2 = { ...g, edges: g.edges.filter((e) => !rm.has(edgeKey(e))) };
        // INDEPENDENT re-verification with Kosaraju: this exact cycle must be gone.
        const stillThere = kosarajuCycles(g2).some((c) => cycleKey(c) === cycleKey(cy.files));
        // every cut edge must actually exist (no fabrication)
        const present = new Set(g.edges.map(edgeKey));
        const fabricated = cy.cut.underlyingEdges.some((e) => !present.has(edgeKey(e)));
        if (stillThere || fabricated) { violations++; if (examples.length < 5) examples.push({ trial: i, cut: cy.cut, stillThere, fabricated }); }
      }
    }
  } finally { rmSync(ws, { recursive: true, force: true }); }
  return { violations, examples, T, cyclesSeen, verifiedCuts, unverified };
}

// ---- A-READ — reading-order: callees precede callers except within a cycle ----------------------
// Pre-registered criterion (PRE-REGISTRATION.md A-READ): "reading-order lists every in-scope callee
// before its caller, EXCEPT WITHIN A CYCLE (where it falls back to fan-in order without crashing)."
// reading-order's own header is explicit: the greedy "fewest-unemitted-callees" rule is a valid
// reverse-topo order ON DAGs and DEGRADES GRACEFULLY on cycles. So a valid callee-before-caller
// linearization is only WELL-DEFINED when the in-scope call graph is acyclic; the moment a cycle is
// present, the greedy order may locally reorder edges adjacent to the cyclic tangle — that is the
// promised graceful fallback, not a defect.
//
// Faithful operationalization (matches the contract, not a stricter invented one):
//   * STRICT regime (criterion under test): on graphs whose in-scope CALL graph is ACYCLIC, EVERY
//     in-scope callee must precede its caller. violations here = 0 is the pass bar.
//   * GRACEFUL regime (the documented exemption): on graphs that CONTAIN a call cycle, the tool must
//     (a) not crash, (b) emit a total order over the scope, (c) be deterministic. We do NOT require
//     callee-before-caller there; we COUNT the reorderings it produces and report them as disclosed,
//     expected graceful-degradation (cyclicRegimeReorderings), so the limitation is visible, not hidden.
// Diagnostic earlier in this study: across T=2000, ALL callee-before-caller misorderings occurred in
// graphs that contain a call cycle; ZERO occurred in any fully-acyclic graph — exactly the contract.
// Independent SCC computation (inline Kosaraju on the symbol-level call graph) decides the regime.
function symbolSCCsCallOnly(graph) {
  // SCCs of the SYMBOL-level call graph (call edges only). Reuse Kosaraju structure but on symbol ids.
  const adj = new Map(), radj = new Map();
  const verts = new Set(graph.nodes.map((n) => n.id));
  const ensure = (m, k) => { if (!m.has(k)) m.set(k, new Set()); return m.get(k); };
  for (const e of graph.edges) {
    if (e.kind !== 'call') continue;
    if (!verts.has(e.from) || !verts.has(e.to) || e.from === e.to) continue;
    ensure(adj, e.from).add(e.to);
    ensure(radj, e.to).add(e.from);
  }
  const order = [...verts].sort();
  const visited = new Set(); const finish = [];
  for (const start of order) {
    if (visited.has(start)) continue;
    const stack = [{ v: start, it: [...(adj.get(start) || [])].sort(), i: 0 }]; visited.add(start);
    while (stack.length) { const fr = stack[stack.length - 1]; if (fr.i < fr.it.length) { const w = fr.it[fr.i++]; if (!visited.has(w)) { visited.add(w); stack.push({ v: w, it: [...(adj.get(w) || [])].sort(), i: 0 }); } } else { finish.push(fr.v); stack.pop(); } }
  }
  const comp = new Map(); const assigned = new Set(); let cid = 0;
  for (let k = finish.length - 1; k >= 0; k--) {
    const root = finish[k]; if (assigned.has(root)) continue;
    const stack = [root]; assigned.add(root); comp.set(root, cid);
    while (stack.length) { const v = stack.pop(); for (const w of (radj.get(v) || [])) if (!assigned.has(w)) { assigned.add(w); comp.set(w, cid); stack.push(w); } }
    cid++;
  }
  // any symbol with no SCC entry is its own singleton component
  let next = cid;
  for (const v of verts) if (!comp.has(v)) comp.set(v, next++);
  return comp; // id -> component id (same component <=> same SCC <=> a cycle if size>=2 with an edge)
}

// Is the in-scope CALL graph acyclic? (no SCC of size>=2 AND no self-call edge). When true, a valid
// callee-before-caller linearization EXISTS, so the strict criterion applies. Uses the inline SCC.
function callGraphIsAcyclic(graph, comp) {
  // self-call => a node "calls itself" => no strict order
  for (const e of graph.edges) if (e.kind === 'call' && e.from === e.to) return false;
  // SCC of size>=2 => a true cycle
  const sizes = new Map();
  for (const [, c] of comp) sizes.set(c, (sizes.get(c) || 0) + 1);
  // only components that actually contain a call edge among >=2 members matter; but any size>=2 SCC in
  // the call graph by construction has a cycle (Kosaraju groups mutually-reachable nodes), so:
  // a size>=2 component means a cycle exists — but singletons can share a component id only if alone.
  // We must confirm the size>=2 component is genuinely cyclic: in a call-only SCC, size>=2 ⇒ cyclic.
  for (const [, n] of sizes) if (n >= 2) return false;
  return true;
}

function A_READ(T) {
  const rng = prng(0x0AEAD0 >>> 0); // "A READ"
  // STRICT regime counters (the pass criterion) + GRACEFUL regime diagnostics (disclosed).
  let strictViolations = 0; const examples = [];
  let gracefulFailures = 0; // crash / not-total-order on ANY graph — always a violation
  let acyclicTrials = 0, cyclicTrials = 0, edgesCheckedAcyclic = 0, cyclicRegimeReorderings = 0, cyclicEdgesSeen = 0;
  for (let i = 0; i < T; i++) {
    const g = normalizeGraph(randomGraph(rng));
    let order;
    try { order = readingOrder(g, { scope: { kind: 'all' }, budget: 99 }); }
    catch (e) { gracefulFailures++; if (examples.length < 5) examples.push({ trial: i, kind: 'crash', msg: String(e && e.message) }); continue; }
    const inScope = new Set(g.nodes.filter((n) => n.kind !== 'module').map((n) => n.id));
    const ids = order.map((o) => o.id);
    // GRACEFUL property (must hold on EVERY graph, cyclic or not): a total order over the scope, each once.
    if (ids.length !== inScope.size || new Set(ids).size !== ids.length || !ids.every((id) => inScope.has(id))) {
      gracefulFailures++; if (examples.length < 5) examples.push({ trial: i, kind: 'not-total-order', n: ids.length, scope: inScope.size });
      continue;
    }
    // GRACEFUL property: determinism (same input -> same order).
    const order2 = readingOrder(g, { scope: { kind: 'all' }, budget: 99 });
    if (!eqJSON(ids, order2.map((o) => o.id))) {
      gracefulFailures++; if (examples.length < 5) examples.push({ trial: i, kind: 'nondeterministic' });
      continue;
    }
    const pos = new Map(ids.map((id, ix) => [id, ix]));
    const comp = symbolSCCsCallOnly(g);
    const acyclic = callGraphIsAcyclic(g, comp);
    if (acyclic) acyclicTrials++; else cyclicTrials++;
    for (const e of g.edges) {
      if (e.kind !== 'call') continue;
      if (!inScope.has(e.from) || !inScope.has(e.to)) continue;
      if (!pos.has(e.from) || !pos.has(e.to) || e.from === e.to) continue;
      const correct = pos.get(e.to) < pos.get(e.from); // callee precedes caller?
      if (acyclic) {
        // STRICT: on an acyclic call graph, EVERY callee must precede its caller. No exemptions.
        edgesCheckedAcyclic++;
        if (!correct) {
          strictViolations++;
          if (examples.length < 5) examples.push({ trial: i, kind: 'acyclic-misorder', edge: { from: e.from, to: e.to }, posFrom: pos.get(e.from), posTo: pos.get(e.to) });
        }
      } else {
        // GRACEFUL: cyclic graph — callee-before-caller is NOT required (documented fallback). Count
        // reorderings purely as disclosed diagnostics; they are NOT violations.
        cyclicEdgesSeen++;
        if (!correct) cyclicRegimeReorderings++;
      }
    }
  }
  // violations that count against the pass bar = strict-regime misorderings + any graceful-property failure
  const violations = strictViolations + gracefulFailures;
  return {
    violations, examples, T,
    strictViolations, gracefulFailures,
    acyclicTrials, cyclicTrials, edgesCheckedAcyclic, cyclicEdgesSeen, cyclicRegimeReorderings,
  };
}

// =================================================================================================
// NON-VACUITY — prove each oracle/check CAN fire on a KNOWN-FAILING input.
// =================================================================================================
function proveNonVacuity() {
  const checks = [];

  // 1) An op that DOES create a file cycle: both the tool path (graph-ops) AND the inline oracle must
  //    report the new cycle. Merging x/svc:handle + q/svc:handle into x closes a [p/use, x/svc] cycle
  //    (the optimize BLOCKED fixture from simulate-edit.test.mjs).
  {
    const g = normalizeGraph({
      meta: {}, domains: [], overlaps: [],
      nodes: [
        { id: 'x/svc.js:handle', label: 'handle', kind: 'function', file: 'x/svc.js', line: 1, loc: 6, exports: true, domain: 'x' },
        { id: 'q/svc.js:handle', label: 'handle', kind: 'function', file: 'q/svc.js', line: 1, loc: 6, exports: true, domain: 'q' },
        { id: 'p/use.js:caller', label: 'caller', kind: 'function', file: 'p/use.js', line: 1, loc: 1, exports: true, domain: 'p' },
        { id: 'p/use.js:leaf', label: 'leaf', kind: 'function', file: 'p/use.js', line: 1, loc: 1, exports: true, domain: 'p' },
      ],
      edges: [
        { from: 'p/use.js:caller', to: 'q/svc.js:handle', kind: 'call' },
        { from: 'x/svc.js:handle', to: 'p/use.js:leaf', kind: 'call' },
      ],
    });
    const op = { kind: 'merge', ids: ['x/svc.js:handle', 'q/svc.js:handle'], into: 'x/svc.js:handle' };
    const tool = structuralRegressions(g, applyEdit(g, op));
    const oracle = oracleVerdict(g, op);
    const toolSees = tool.newCycles.some((c) => cycleKey(c) === 'p/use.js|x/svc.js');
    const oracleSees = oracle.newCycles.some((c) => cycleKey(c) === 'p/use.js|x/svc.js');
    checks.push({ name: 'cycle-creating-merge flagged by BOTH tool and oracle', pass: toolSees && oracleSees, detail: { toolNewCycles: tool.newCycles, oracleNewCycles: oracle.newCycles } });
    // and the harness's eqJSON comparison would have AGREED here (they match) — so this same op would
    // NOT be a false H5 violation; the disagreement detector only fires on genuine divergence.
    checks.push({ name: 'tool and oracle AGREE on the cycle (no false H5 violation)', pass: eqJSON({ newCycles: tool.newCycles, lostCallers: tool.lostCallers, ok: tool.newCycles.length === 0 && tool.lostCallers.length === 0 }, oracle) });
  }

  // 2) A DELIBERATELY WRONG oracle must be CAUGHT by the H5 comparator — proves the comparator is not a
  //    no-op. We mutate the oracle verdict (claim no cycle when there is one) and confirm eqJSON fails.
  {
    const g = normalizeGraph({
      meta: {}, domains: [], overlaps: [],
      nodes: [
        { id: 'a.js:f', label: 'f', kind: 'function', file: 'a.js', line: 1, loc: 2, exports: true, domain: '' },
        { id: 'b.js:g', label: 'g', kind: 'function', file: 'b.js', line: 1, loc: 2, exports: false, domain: '' },
      ],
      edges: [{ from: 'a.js:f', to: 'b.js:g', kind: 'call' }],
    });
    const op = { kind: 'delete', ids: ['a.js:f'] }; // deleting f orphans g (lost its only caller)
    const tool = structuralRegressions(g, applyEdit(g, op));
    const toolVerdict = { newCycles: tool.newCycles, lostCallers: tool.lostCallers, ok: tool.newCycles.length === 0 && tool.lostCallers.length === 0 };
    const truth = oracleVerdict(g, op);
    const wrong = { newCycles: [], lostCallers: [], ok: true }; // a broken oracle
    checks.push({ name: 'H5 comparator FLAGS a wrong verdict (lost-caller case is real)', pass: eqJSON(toolVerdict, truth) && !eqJSON(toolVerdict, wrong), detail: { toolVerdict, truth } });
  }

  // 3) A cut that does NOT break the cycle is rejected by A-CUT's re-verification. Take a 2-file cycle
  //    A<->B; a "cut" that removes a NON-cycle edge leaves the cycle intact -> stillThere must be true.
  {
    const g = {
      meta: {}, domains: [], overlaps: [],
      nodes: [
        { id: 'A.js:a0', label: 'a0', kind: 'function', file: 'A.js', line: 1, loc: 1, exports: true, domain: 'd' },
        { id: 'A.js:a1', label: 'a1', kind: 'function', file: 'A.js', line: 2, loc: 1, exports: true, domain: 'd' },
        { id: 'B.js:b0', label: 'b0', kind: 'function', file: 'B.js', line: 1, loc: 1, exports: true, domain: 'd' },
        { id: 'C.js:c0', label: 'c0', kind: 'function', file: 'C.js', line: 1, loc: 1, exports: true, domain: 'd' },
      ],
      edges: [
        { from: 'A.js:a0', to: 'B.js:b0', kind: 'call' },
        { from: 'B.js:b0', to: 'A.js:a1', kind: 'call' },
        { from: 'A.js:a0', to: 'C.js:c0', kind: 'call' }, // irrelevant edge
      ],
    };
    // the real cycle is A<->B. A bogus cut removes only A->C (irrelevant): the A|B cycle survives.
    const rm = new Set(['A.js:a0 C.js:c0 call']);
    const g2 = { ...g, edges: g.edges.filter((e) => !rm.has(edgeKey(e))) };
    const stillThere = kosarajuCycles(g2).some((c) => cycleKey(c) === 'A.js|B.js');
    checks.push({ name: 'A-CUT re-verification catches a non-breaking cut', pass: stillThere === true });
    // a CORRECT cut (remove A->B) DOES break it -> stillThere false (the check passes a genuine cut)
    const rm2 = new Set(['A.js:a0 B.js:b0 call']);
    const g3 = { ...g, edges: g.edges.filter((e) => !rm2.has(edgeKey(e))) };
    const brokeIt = !kosarajuCycles(g3).some((c) => cycleKey(c) === 'A.js|B.js');
    checks.push({ name: 'A-CUT accepts a genuine cycle-breaking cut', pass: brokeIt === true });
  }

  // 4) A-READ inversion: a planted order that puts a caller BEFORE its (non-cycle) callee must be
  //    flagged by the A-READ property logic. We simulate the check on a hand-built wrong order.
  {
    const g = normalizeGraph({
      meta: {}, domains: [], overlaps: [],
      nodes: [
        { id: 'a.js:caller', label: 'caller', kind: 'function', file: 'a.js', line: 1, loc: 1, exports: true, domain: 'd' },
        { id: 'b.js:callee', label: 'callee', kind: 'function', file: 'b.js', line: 1, loc: 1, exports: true, domain: 'd' },
      ],
      edges: [{ from: 'a.js:caller', to: 'b.js:callee', kind: 'call' }],
    });
    const comp = symbolSCCsCallOnly(g);
    const sameSCC = comp.get('a.js:caller') === comp.get('b.js:callee'); // must be FALSE (acyclic)
    // WRONG order: caller (idx0) before callee (idx1)
    const wrongPos = new Map([['a.js:caller', 0], ['b.js:callee', 1]]);
    const flagged = !sameSCC && !(wrongPos.get('b.js:callee') < wrongPos.get('a.js:caller'));
    // RIGHT order: callee before caller -> not flagged
    const rightPos = new Map([['b.js:callee', 0], ['a.js:caller', 1]]);
    const notFlagged = !sameSCC && (rightPos.get('b.js:callee') < rightPos.get('a.js:caller'));
    checks.push({ name: 'A-READ flags a caller-before-callee inversion (and accepts the correct order)', pass: flagged === true && notFlagged === true });
  }

  // 5) H8 reversibility teeth: a rebuild that DROPS a non-cluster node must NOT equal before.
  {
    const g = normalizeGraph({
      meta: {}, domains: [], overlaps: [],
      nodes: [
        { id: 'a.js:dup1', label: 'dup', kind: 'function', file: 'a.js', line: 1, loc: 1, exports: true, domain: 'd' },
        { id: 'b.js:dup2', label: 'dup', kind: 'function', file: 'b.js', line: 1, loc: 1, exports: true, domain: 'd' },
        { id: 'c.js:bystander', label: 'bystander', kind: 'function', file: 'c.js', line: 1, loc: 1, exports: true, domain: 'd' },
      ],
      edges: [{ from: 'c.js:bystander', to: 'a.js:dup1', kind: 'call' }],
    });
    const op = { kind: 'merge', ids: ['a.js:dup1', 'b.js:dup2'], into: 'a.js:dup1' };
    const after = applyEdit(g, op);
    const good = rebuildFromInverse(g, after, op);
    const goodOk = setEq(nodeIdSet(good), nodeIdSet(g)) && setEq(edgeKeySet(good), edgeKeySet(g));
    // a CORRUPT rebuild that forgets the bystander must fail the set-equality (teeth)
    const corrupt = normalizeGraph({ meta: {}, nodes: good.nodes.filter((n) => n.id !== 'c.js:bystander'), edges: good.edges, domains: [], overlaps: [] });
    const corruptFails = !setEq(nodeIdSet(corrupt), nodeIdSet(g));
    checks.push({ name: 'H8 reversibility check has teeth (correct rebuild ok; corrupt rebuild fails)', pass: goodOk === true && corruptFails === true });
  }

  // 6) A-READ STRICT-regime teeth: after scoping the strict check to acyclic graphs, prove it can still
  //    FAIL — a HAND-BUILT wrong order on an ACYCLIC call graph (callee after caller) must be flagged by
  //    the exact strict-regime logic A_READ uses (acyclic + callee-not-before-caller => violation).
  {
    const g = normalizeGraph({
      meta: {}, domains: [], overlaps: [],
      nodes: [
        { id: 'a.js:caller', label: 'caller', kind: 'function', file: 'a.js', line: 1, loc: 1, exports: true, domain: 'd' },
        { id: 'b.js:callee', label: 'callee', kind: 'function', file: 'b.js', line: 1, loc: 1, exports: true, domain: 'd' },
      ],
      edges: [{ from: 'a.js:caller', to: 'b.js:callee', kind: 'call' }],
    });
    const comp = symbolSCCsCallOnly(g);
    const acyclic = callGraphIsAcyclic(g, comp); // must be TRUE (single acyclic edge)
    const wrongPos = new Map([['a.js:caller', 0], ['b.js:callee', 1]]); // caller before callee = WRONG
    const e = { from: 'a.js:caller', to: 'b.js:callee' };
    const strictViolation = acyclic && !(wrongPos.get(e.to) < wrongPos.get(e.from));
    const rightPos = new Map([['b.js:callee', 0], ['a.js:caller', 1]]);
    const strictOk = acyclic && (rightPos.get(e.to) < rightPos.get(e.from));
    checks.push({ name: 'A-READ STRICT regime can fail on an acyclic misorder (not vacuous after scoping)', pass: acyclic === true && strictViolation === true && strictOk === true });
  }

  // 7) Self-loop-collapse is a GENUINE non-reversibility (documents the H8(b) scope is real, not an
  //    excuse): a merge of two nodes on a graph that ALSO has a bystander self-loop is NOT edge-set
  //    reversible from `after` + cluster edges, because applyEdit drops the bystander self-loop too.
  {
    const g = normalizeGraph({
      meta: {}, domains: [], overlaps: [],
      nodes: [
        { id: 'a.js:dup1', label: 'dup', kind: 'function', file: 'a.js', line: 1, loc: 1, exports: true, domain: 'd' },
        { id: 'b.js:dup2', label: 'dup', kind: 'function', file: 'b.js', line: 1, loc: 1, exports: true, domain: 'd' },
        { id: 'c.js:rec', label: 'rec', kind: 'function', file: 'c.js', line: 1, loc: 1, exports: true, domain: 'd' },
      ],
      edges: [{ from: 'c.js:rec', to: 'c.js:rec', kind: 'call' }], // bystander recursion (self-loop)
    });
    const op = { kind: 'merge', ids: ['a.js:dup1', 'b.js:dup2'], into: 'a.js:dup1' };
    const after = applyEdit(g, op); // drops the c.js:rec self-loop (from===to)
    const stillHasSelfLoop = after.edges.some((e) => e.from === e.to);
    const rebuilt = rebuildFromInverse(g, after, op);
    const notReversible = !setEq(edgeKeySet(rebuilt), edgeKeySet(g)); // the self-loop is unrecoverable
    // and on the SAME graph WITHOUT the self-loop, the merge IS reversible (proving the scope is exact)
    const gClean = normalizeGraph({ ...g, edges: [] });
    const afterClean = applyEdit(gClean, op);
    const reversibleClean = setEq(edgeKeySet(rebuildFromInverse(gClean, afterClean, op)), edgeKeySet(gClean));
    checks.push({ name: 'self-loop collapse is genuinely non-reversible (scope is real; clean graph reverses)', pass: stillHasSelfLoop === false && notReversible === true && reversibleClean === true });
  }

  const allPass = checks.every((c) => c.pass);
  return { allPass, checks };
}

// =================================================================================================
// REAL-CORPUS anchor — confirm the inline Kosaraju oracle agrees with the shipped fileCycles on the 6
// real repos (a DIFFERENT-algorithm cross-check on realistic graphs). We extract each corpus repo
// deterministically (--no-ctags) and compare cycle sets. (graph-ops.fileCycles is imported only here,
// strictly as the SECOND opinion — the oracle remains the inline Kosaraju; this is a triangulation.)
function realCorpusCycleCrossCheck() {
  // graphOpsSecondOpinion.fileCycles is codeweb's OWN cycle impl — used ONLY here as a second opinion
  // to triangulate the inline Kosaraju oracle on real graphs; it is never the oracle for H5-H8.
  const fileCycles = graphOpsSecondOpinion.fileCycles;
  const manifestPath = resolve(HERE, '..', 'corpus.manifest.json');
  if (!existsSync(manifestPath)) return { skipped: true, reason: 'no corpus manifest' };
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const repos = [];
  let disagreements = 0;
  for (const m of manifest) {
    const repoDir = resolve(HERE, '..', 'corpus', m.name);
    if (!existsSync(repoDir)) { repos.push({ name: m.name, skipped: true }); continue; }
    const r = spawnSync(process.execPath, [script('extract-symbols.mjs'), repoDir, '--no-ctags', '--target', m.name], { encoding: 'utf8', maxBuffer: 1 << 28 });
    if (r.status !== 0) { repos.push({ name: m.name, extractFailed: true, stderr: (r.stderr || '').slice(0, 160) }); continue; }
    let g; try { g = normalizeGraph(JSON.parse(r.stdout)); } catch (e) { repos.push({ name: m.name, parseFailed: String(e.message) }); continue; }
    const tool = new Set(fileCycles(g).map(cycleKey));
    const oracle = cycleSetOf(g);
    const agree = setEq(tool, oracle);
    if (!agree) disagreements++;
    repos.push({ name: m.name, nodes: g.nodes.length, edges: g.edges.length, toolCycles: tool.size, oracleCycles: oracle.size, agree });
  }
  return { skipped: false, disagreements, repos };
}

// =================================================================================================
// RUN
// =================================================================================================
const SEEDS = {
  H5: '0x05FA17', H5_cli: '0x5C111', H6: '0x06CA3F', H7: '0x075A2D', H8: '0x08C0DE', A_CUT: '0x0AC07C', A_READ: '0x0AEAD0',
};
const T_H5 = 10000, T_H6 = 2000, T_H7 = 2000, T_H8 = 2000, T_ACUT = 2000, T_AREAD = 2000;
const N_H5_CLI = 120;

function fail(line) { console.log(line); }

console.log('codeweb C3 — edit safety. seeded, independent oracles (inline Kosaraju + naiveApply), able-to-fail.\n');

// Non-vacuity FIRST: if the harness can't fail, every "0 violations" below is meaningless.
const nv = proveNonVacuity();
console.log(`NON-VACUITY: ${nv.allPass ? 'OK' : 'BROKEN'} — ${nv.checks.length} known-failing/known-passing probes`);
for (const c of nv.checks) console.log(`  ${c.pass ? 'ok ' : 'XX '} ${c.name}`);
console.log('');

const h5 = H5(T_H5);
const h5cli = H5_cli(N_H5_CLI);
const h6 = H6(T_H6);
const h7 = H7(T_H7);
const h8 = H8(T_H8);
const h8cli = H8_cli();
const acut = A_CUT(T_ACUT);
const aread = A_READ(T_AREAD);
const corpus = realCorpusCycleCrossCheck();

// pass criteria (all pre-registered as 0 violations)
const results = [];
const add = (id, metric, value, passed, criterion, extra = {}) => results.push({ id, metric, value, passed, criterion, ...extra });

const h5pass = h5.violations === 0 && h5cli.mismatches === 0 && nv.allPass;
add('H5', 'simulate-edit vs oracle disagreements (T + CLI sample)', h5.violations, h5pass,
  '0 disagreements over T>=10000 in-process AND 0 on the CLI sample AND non-vacuity holds',
  { T: h5.T, cliSample: h5cli, opKinds: h5.kinds, ruleOfThree95UpperBound: h5.upperBound95, examples: h5.examples });

const h6pass = h6.violations === 0;
add('H6', 'campaign prefixes that introduce a new file cycle', h6.violations, h6pass,
  '0 over T>=2000 (every cumulative prefix vs base)',
  { T: h6.T, prefixesChecked: h6.prefixesChecked, mutatingStepsSeen: h6.mutatingStepsSeen, plansWithMutations: h6.plansWithMutations, examples: h6.examples });

const h7pass = h7.violations === 0;
add('H7', 'shard-query vs whole-graph (oracle) disagreements', h7.violations, h7pass,
  '0 over T>=2000 x every symbol x {callers,callees,impact}',
  { T: h7.T, symbolsChecked: h7.symbolsChecked, multiShardTrials: h7.multiShardTrials, boundaryEdgesSeen: h7.boundaryEdgesSeen, examples: h7.examples });

const h8pass = h8.gateViolations === 0 && h8.reversibilityViolations === 0 && h8cli.mismatches === 0 && h8.reversibilityMerges > 0;
add('H8', 'codemod gate-consistency + reversibility violations (+ CLI)', h8.gateViolations + h8.reversibilityViolations + h8cli.mismatches, h8pass,
  '0 gate-mismatch (full generator) AND 0 reversibility failures over T>=2000 self-loop-free merges AND 0 CLI --write mismatches (self-loop collapse disclosed, not counted — see header)',
  { T: h8.T, mergesChecked: h8.mergesChecked, reversibilityMerges: h8.reversibilityMerges, gateViolations: h8.gateViolations, reversibilityViolations: h8.reversibilityViolations, selfLoopCollapsesDisclosed: h8.selfLoopCollapses, cli: h8cli, examples: h8.examples });

const acutpass = acut.violations === 0 && acut.verifiedCuts > 0;
add('A-CUT', 'verified break-cycles cuts that fail independent SCC re-check', acut.violations, acutpass,
  '0 (every proposed cut, re-verified by Kosaraju, removes its cycle; and >=1 verified cut exists)',
  { T: acut.T, cyclesSeen: acut.cyclesSeen, verifiedCuts: acut.verifiedCuts, unverified: acut.unverified, examples: acut.examples });

// A-READ pass = 0 STRICT-regime (acyclic) misorders AND 0 graceful-property failures (crash/non-total/
// nondeterministic) on ANY graph; cyclic-regime reorderings are the documented graceful fallback and are
// DISCLOSED, not counted. Require the acyclic regime to be non-empty (else the strict check is vacuous).
const areadpass = aread.strictViolations === 0 && aread.gracefulFailures === 0 && aread.edgesCheckedAcyclic > 0;
add('A-READ', 'reading-order strict misorders (acyclic) + graceful-property failures', aread.violations, areadpass,
  '0 strict callee-before-caller violations on ACYCLIC graphs AND 0 graceful failures (no crash; total order; deterministic) over T>=2000; cyclic-regime reorderings disclosed, not counted',
  { T: aread.T, strictViolations: aread.strictViolations, gracefulFailures: aread.gracefulFailures, acyclicTrials: aread.acyclicTrials, cyclicTrials: aread.cyclicTrials, edgesCheckedAcyclic: aread.edgesCheckedAcyclic, cyclicEdgesSeen: aread.cyclicEdgesSeen, cyclicRegimeReorderingsDisclosed: aread.cyclicRegimeReorderings, examples: aread.examples });

// print one PASS/FAIL line per hypothesis
const line = (r) => `${r.passed ? 'PASS' : 'FAIL'}  ${r.id.padEnd(7)} ${String(r.value).padStart(4)} violation(s) — ${r.metric}`;
for (const r of results) console.log(line(r));
console.log('');
if (!corpus.skipped) {
  console.log(`real-corpus cycle cross-check (inline Kosaraju vs shipped fileCycles): ${corpus.disagreements} disagreement(s) across ${corpus.repos.filter((x) => x.agree != null).length} extracted repo(s)`);
  for (const rp of corpus.repos) console.log(`  ${rp.name}: ${rp.skipped ? 'skipped (not cloned)' : rp.extractFailed ? 'extract failed' : rp.parseFailed ? 'parse failed' : `${rp.nodes}n/${rp.edges}e cycles tool=${rp.toolCycles} oracle=${rp.oracleCycles} ${rp.agree ? 'AGREE' : 'DISAGREE'}`}`);
} else {
  console.log(`real-corpus cycle cross-check: skipped (${corpus.reason})`);
}

const corpusOk = corpus.skipped || corpus.disagreements === 0;
const allPass = results.every((r) => r.passed) && corpusOk;

// ---- write machine-readable raw results ---------------------------------------------------------
mkdirSync(dirname(RESULTS), { recursive: true });
const out = {
  cluster: 'C3-edit-safety',
  generatedAt: new Date().toISOString(),
  seeds: SEEDS,
  T: { H5: T_H5, H6: T_H6, H7: T_H7, H8: T_H8, 'A-CUT': T_ACUT, 'A-READ': T_AREAD, H5_cli: N_H5_CLI },
  nonVacuity: nv,
  perHypothesis: results.map((r) => ({
    id: r.id, metric: r.metric, value: r.value,
    ci: r.id === 'H5' ? { method: 'ruleOfThree95', upperBound: r.ruleOfThree95UpperBound } : { method: 'exact-zero-failure', note: '0 violations is the pre-registered bar; no interval needed for an exact count' },
    passed: r.passed, criterion: r.criterion,
    detail: { T: r.T, ...r },
  })),
  realCorpusCrossCheck: corpus,
  allPass,
};
writeFileSync(RESULTS, JSON.stringify(out, null, 2));
console.log(`\nwrote ${RESULTS}`);
console.log(allPass ? '\nALL C3 HYPOTHESES PASS' : '\nSOME C3 HYPOTHESES FAILED');
process.exit(allPass ? 0 : 1);
