#!/usr/bin/env node
// codeweb optimize — report-only consolidation advisor. Reads a graph.json whose overlaps[] were
// already computed by overlap.mjs, ranks the body-confirmed duplicate-logic findings into
// consolidation OPPORTUNITIES, and PRE-FLIGHTS each proposed merge against the regression gate's
// own file-cycle check — WITHOUT editing any source. This is the "gate -> optimizer" step 1: it
// turns the pass/fail gate (diff.mjs) into a periodic advisor that says WHAT to consolidate and
// whether the gate would accept it. No code is written. Built on ./lib/graph-ops.mjs so the
// call/cycle primitives live ONCE (codeweb dogfooding its own anti-duplication mission).
//
// Usage: node optimize.mjs <graph.json> [--json] [--out <optimize.md>]   (or set CODEWEB_WS)
//
// Tiers (per finding):
//   ready   — body-confirmed high (bodySim >= 0.6), not drifted, kind duplicate-logic, AND the
//             simulated merge adds NO new file cycle: the gate would pass (exit 0), duplication -1.
//   blocked — the simulated naive merge WOULD introduce a new file-level dependency cycle: the gate
//             would reject it (exit 1). Needs a neutral consolidation home, not a blind merge.
//   review  — drifted copies, merely-structural confidence (bodySim null), or a non-duplicate-logic
//             finding (parallel-impl / shared-responsibility): needs human or agent judgement.
//
// Precision over recall: low/refuted findings are excluded outright. Advisory only — exits 0 on a
// clean read regardless of how many opportunities exist (it ADVISES; diff.mjs is the gate). Exit:
// 0 ok, 2 usage/IO.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeGraph, buildIndex, callersOf, impactOf, fileCycles, applyEdit, chooseCanonical } from './lib/graph-ops.mjs';

const USAGE = 'usage: optimize.mjs <graph.json> [--json] [--out <optimize.md>]   (or set CODEWEB_WS)';
const READY_BODYSIM = 0.6; // body-confirmed "high" floor — must match overlap.mjs's confidence band
import { die, emitJson, finish, loadGraph } from './lib/cli.mjs';

const argv = process.argv.slice(2);
let json = false, outMd = null; const paths = [];
for (let i = 0; i < argv.length; i++) {
  const t = argv[i];
  if (t === '--json') json = true;
  else if (t === '--out') outMd = argv[++i];
  else if (!t.startsWith('-')) paths.push(t);
}
const graphPath = paths[0] || (process.env.CODEWEB_WS ? `${process.env.CODEWEB_WS}/graph.json` : null);
if (!graphPath) die(USAGE, 2);

const { graph, abs } = loadGraph(graphPath, { usage: USAGE });

const index = buildIndex(graph);
const cycKey = (c) => c.join('|');
const beforeCycles = new Set(fileCycles(graph).map(cycKey));

// ---- merge simulation (Spec O-1, docs/specs/incremental-stages.md amendment) ------------------
// The historical path cloned the entire graph per candidate (applyEdit) and re-ran full file-SCC
// on the clone (fileCycles) — O(candidates × graph): 28.8s cold / 60.5s on the edit re-map at 16k
// symbols, 83% of the downstream cost. The delta path computes the merged FILE-graph directly:
// a merge only changes file-pairs witnessed by loser-incident edges (some witnesses redirect to
// the canonical's file, possibly emptying a pair; redirected pairs get added), so we adjust a
// prebuilt pair-witness table and hand the resulting adjacency to the SAME fileCycles as a
// pseudo-graph (one node per file) — same SCC code, same ordering, byte-identical verdicts,
// no clone. CODEWEB_OPT_SIM=clone forces the historical path (the equivalence tests run both).
const SIM_MODE = process.env.CODEWEB_OPT_SIM === 'clone' ? 'clone' : 'delta';
const CYCLE_KINDS = new Set(['call', 'import', 'inherit', 'ref']);
const PAIR_SEP = '\0';
const fileOfId = new Map(graph.nodes.map((n) => [n.id, n.file]));
const pairKey = (f, t) => f + PAIR_SEP + t;
const pairCount = new Map(); // file-pair -> number of witnessing edges
const incident = new Map();  // node id -> cycle-kind edges touching it
if (SIM_MODE === 'delta') {
  for (const e of graph.edges) {
    if (!CYCLE_KINDS.has(e.kind)) continue;
    if (!incident.has(e.from)) incident.set(e.from, []);
    incident.get(e.from).push(e);
    if (e.to !== e.from) {
      if (!incident.has(e.to)) incident.set(e.to, []);
      incident.get(e.to).push(e);
    }
    const f = fileOfId.get(e.from), t = fileOfId.get(e.to);
    if (!f || !t || f === t) continue;
    pairCount.set(pairKey(f, t), (pairCount.get(pairKey(f, t)) || 0) + 1);
  }
}

function deltaNewCycles(ids, into) {
  const losers = new Set(ids.filter((x) => x !== into));
  const mapId = (id) => (losers.has(id) ? into : id);
  const touched = new Set();
  for (const id of losers) for (const e of incident.get(id) || []) touched.add(e);
  const removed = new Map(); // pair -> witnesses redirected away
  const added = new Set();
  for (const e of touched) {
    const f = fileOfId.get(e.from), t = fileOfId.get(e.to);
    if (f && t && f !== t) removed.set(pairKey(f, t), (removed.get(pairKey(f, t)) || 0) + 1);
    const from2 = mapId(e.from), to2 = mapId(e.to);
    if (from2 === to2) continue; // self-loop after redirect — applyEdit drops these
    const f2 = fileOfId.get(from2), t2 = fileOfId.get(to2);
    if (!f2 || !t2 || f2 === t2) continue;
    added.add(pairKey(f2, t2));
  }
  const after = new Set();
  for (const [key, c] of pairCount) if ((removed.get(key) || 0) < c) after.add(key);
  for (const key of added) after.add(key);
  // pseudo-graph: one node per file, one call edge per surviving pair — fileCycles sees exactly
  // the adjacency the merged full graph would produce, through the same code path.
  const files = new Set();
  const edges = [];
  for (const key of after) {
    const [f, t] = key.split(PAIR_SEP);
    files.add(f); files.add(t);
    edges.push({ from: f, to: t, kind: 'call' });
  }
  const pseudo = { nodes: [...files].map((f) => ({ id: f, file: f })), edges };
  return fileCycles(pseudo).filter((c) => !beforeCycles.has(cycKey(c)));
}

// chooseCanonical now lives in ./lib/graph-ops.mjs (shared with codemod.mjs — one truth).

// actionable findings only: precision gate drops low/refuted (overlap.mjs's own "findings" set).
const candidates = graph.overlaps.filter((o) => o.confidence === 'high' || o.confidence === 'medium');

const SEV = { low: 1, medium: 2, high: 3 };
const opportunities = candidates.map((o) => {
  const bodyHigh = o.bodySim != null && o.bodySim >= READY_BODYSIM && !o.drifted;
  const mergeable = o.kind === 'duplicate-logic';

  let canonical = null, projectedNewCycles = [], removesNodes = 0, callersRewired = 0, blastRadius = 0, locSaved = 0;
  if (mergeable && o.nodes.length >= 2) {
    canonical = chooseCanonical(index, o.nodes);
    const losers = o.nodes.filter((id) => id !== canonical);
    projectedNewCycles = SIM_MODE === 'clone'
      ? fileCycles(applyEdit(graph, { kind: 'merge', ids: o.nodes, into: canonical })).filter((c) => !beforeCycles.has(cycKey(c)))
      : deltaNewCycles(o.nodes, canonical);
    removesNodes = losers.length;
    callersRewired = callersOf(index, losers).length;
    blastRadius = impactOf(index, o.nodes).length;
    locSaved = losers.reduce((s, id) => s + (index.byId.get(id)?.loc || 0), 0);
  }

  let tier;
  if (!mergeable || !bodyHigh) tier = 'review';
  else if (projectedNewCycles.length) tier = 'blocked';
  else tier = 'ready';

  const gate = tier === 'ready' ? 'would pass (exit 0) — duplication -1'
    : tier === 'blocked' ? 'would block (exit 1) — merge introduces a new file cycle'
      : 'needs review before the gate can judge';
  const recommendation = tier === 'blocked'
    ? `Naive merge cycles via ${projectedNewCycles.map((c) => c.join('+')).join(', ')}. Host the canonical \`${o.title.match(/`([^`]+)`/)?.[1] || 'symbol'}\` in a neutral module that neither side depends on, then route both there. ${o.recommendation}`
    : o.recommendation;

  return {
    id: o.id, kind: o.kind, title: o.title, severity: o.severity, confidence: o.confidence,
    bodySim: o.bodySim, drifted: !!o.drifted, tier, gate,
    canonical, nodes: o.nodes, removesNodes, callersRewired, blastRadius, locSaved,
    projectedNewCycles, recommendation,
  };
});

const tierRank = { ready: 0, blocked: 1, review: 2 };
opportunities.sort((a, b) =>
  tierRank[a.tier] - tierRank[b.tier]
  || SEV[b.severity] - SEV[a.severity]
  || (b.bodySim ?? -1) - (a.bodySim ?? -1)
  || b.blastRadius - a.blastRadius
  || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

const count = (t) => opportunities.filter((o) => o.tier === t).length;
const ready = opportunities.filter((o) => o.tier === 'ready');
const payload = {
  target: graph.meta?.target || 'target',
  simulation: SIM_MODE,
  totals: {
    findings: opportunities.length,
    ready: count('ready'), blocked: count('blocked'), review: count('review'),
    duplicationRemovable: ready.length,
    locReclaimable: ready.reduce((s, o) => s + o.locSaved, 0),
  },
  opportunities,
};

// ---- markdown artifact (written alongside overlap.md when --out is given) ----------
if (outMd) {
  const t0 = payload.totals;
  const item = (o) => {
    const body = o.bodySim != null ? `  ·  **Body:** ${(o.bodySim * 100).toFixed(0)}%` : '';
    const keep = o.canonical ? `\nKeep \`${o.canonical}\` · removes ${o.removesNodes} copy(ies) · rewires ${o.callersRewired} caller(s) · blast ${o.blastRadius} · ~${o.locSaved} LOC` : '';
    return [`### ${o.id} · [${o.severity.toUpperCase()}] ${o.title}`,
      `**Gate:** ${o.gate}${body}  ·  **Confidence:** ${o.confidence}`, keep, ``, `**→ ${o.recommendation}**`, ``].join('\n');
  };
  const section = (title, blurb, tier) => {
    const items = opportunities.filter((o) => o.tier === tier);
    return [`## ${title}`, '', `_${blurb}_`, '', ...(items.length ? items.map(item) : ['_none_', ''])].join('\n');
  };
  const md = [
    '# codeweb — consolidation advisory',
    '',
    `> **${t0.findings} actionable findings** · ${t0.ready} ready · ${t0.blocked} blocked · ${t0.review} review on **${payload.target}**.`,
    `> Applying all **ready** merges would remove ${t0.duplicationRemovable} duplication finding(s) and reclaim ~${t0.locReclaimable} LOC while keeping the gate green. Advisory only — no code is written; each merge stays a human + gate decision.`,
    '',
    section('Ready — the gate would accept these', 'Body-confirmed ≥60%, not drifted, and the simulated merge stays acyclic. Each is a checklist item.', 'ready'),
    section('Blocked — the gate would reject a naive merge', 'The simulated merge introduces a new file-level dependency cycle. Host the canonical in a neutral module first, then route both sides there.', 'blocked'),
    section('Review — needs human or agent judgement', 'Drifted copies, merely-structural confidence, or non-duplicate-logic findings. Read before acting.', 'review'),
  ].join('\n');
  writeFileSync(resolve(outMd), md);
}

if (json) { emitJson(payload); } else {

const t = payload.totals;
console.log(`codeweb optimize: ${payload.target}`);
console.log(`  ${t.findings} actionable findings · ${t.ready} ready · ${t.blocked} blocked · ${t.review} review`);
console.log(`  if all ready merges applied: -${t.duplicationRemovable} duplication finding(s), ~${t.locReclaimable} LOC reclaimed (gate would stay green)`);
const TAG = { ready: 'READY  ', blocked: 'BLOCKED', review: 'REVIEW ' };
for (const o of opportunities) {
  console.log(`\n[${TAG[o.tier]} ${o.severity.toUpperCase().padEnd(6)} ${o.confidence.padEnd(6)}${o.bodySim != null ? ` ${(o.bodySim * 100).toFixed(0).padStart(3)}%` : '     '}] ${o.id} ${o.title.replace(/`/g, '')}`);
  console.log(`  gate: ${o.gate}`);
  if (o.canonical) console.log(`  keep \`${o.canonical}\` · removes ${o.removesNodes} copy(ies) · rewires ${o.callersRewired} caller(s) · blast ${o.blastRadius} · ~${o.locSaved} LOC`);
  console.log(`  -> ${o.recommendation}`);
}
finish();
}
