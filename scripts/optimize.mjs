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
import { normalizeGraph, buildIndex, callersOf, impactOf, fileCycles, applyEdit, chooseCanonical, createMergeSimulator } from './lib/graph-ops.mjs';

const USAGE = 'usage: optimize.mjs <graph.json> [--json] [--out <optimize.md>]   (or set CODEWEB_WS)';
import { BANDS } from './lib/shingles.mjs';
import { die, emitJson, finish, loadGraph, atomicWrite, parseArgs } from './lib/cli.mjs';
const READY_BODYSIM = BANDS.high; // body-confirmed "high" floor — THE band (lib/shingles.mjs, finding 27)

// finding 24: THE flag loop (lib/cli.mjs parseArgs) — one unknown-flag policy, --help included.
const { opts, pos } = parseArgs(process.argv.slice(2), {
  usage: USAGE,
  flags: { json: { type: 'bool', default: false }, out: { type: 'string', default: null } },
});
const { json } = opts, outMd = opts.out;
const graphPath = pos[0] || (process.env.CODEWEB_WS ? `${process.env.CODEWEB_WS}/graph.json` : null);
if (!graphPath) die(USAGE, 2);

const { graph, abs } = loadGraph(graphPath, { usage: USAGE });

const index = buildIndex(graph);
const cycKey = (c) => c.join('|');
const beforeCycles = new Set(fileCycles(graph).map(cycKey));

// ---- merge simulation (Spec O-1, docs/specs/incremental-stages.md amendment) ------------------
// The historical path cloned the entire graph per candidate (applyEdit) and re-ran full file-SCC
// on the clone (fileCycles) — O(candidates × graph): 28.8s cold / 60.5s on the edit re-map at 16k
// symbols, 83% of the downstream cost. The delta path adjusts a pair-witness table instead —
// byte-identical verdicts, no clone. finding 14: the table now lives in graph-ops'
// createMergeSimulator (one truth, shared with campaign's cumulative chain).
// CODEWEB_OPT_SIM=clone forces the historical path (the equivalence tests run both).
const SIM_MODE = process.env.CODEWEB_OPT_SIM === 'clone' ? 'clone' : 'delta';
const mergeSim = SIM_MODE === 'delta' ? createMergeSimulator(graph) : null;
const deltaNewCycles = (ids, into) => mergeSim.simulate(ids, into).cycles.filter((c) => !beforeCycles.has(cycKey(c)));

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
    const keep = o.canonical ? `\nKeep \`${o.canonical}\` · removes ${o.removesNodes} copy(ies) · rewires ${o.callersRewired} caller(s) · blast radius ${o.blastRadius} · ~${o.locSaved} LOC` : '';
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
    `> **${t0.findings} actionable findings** · ${t0.ready} ready · ${t0.blocked} blocked · ${t0.review} judgement call(s) on **${payload.target}**.`,
    `> Applying all **ready** merges would remove ${t0.duplicationRemovable} duplication finding(s) and reclaim ~${t0.locReclaimable} LOC while keeping the gate green. Advisory only — no code is written; each merge stays a human + gate decision.`,
    '',
    section('Ready — the gate would accept these', 'Body-confirmed ≥60%, not drifted, and the simulated merge stays acyclic. Each is a checklist item.', 'ready'),
    section('Blocked — the gate would reject a naive merge', 'The simulated merge introduces a new file-level dependency cycle. Host the canonical in a neutral module first, then route both sides there.', 'blocked'),
    section('Judgement calls — read before acting', 'Drifted copies, merely-structural confidence, or non-duplicate-logic findings (the tier the JSON calls `review`).', 'review'),
  ].join('\n');
  atomicWrite(resolve(outMd), md);
}

if (json) { emitJson(payload); } else {

const t = payload.totals;
console.log(`codeweb optimize: ${payload.target}`);
// ACTIVATION A4: the tier the JSON calls `review` DISPLAYS as "judgement call(s)" — "N review"
// next to the findings triple's "needs review M" read as the same number disagreeing.
console.log(`  ${t.findings} actionable findings · ${t.ready} ready · ${t.blocked} blocked · ${t.review} judgement call(s)`);
console.log(`  if all ready merges applied: -${t.duplicationRemovable} duplication finding(s), ~${t.locReclaimable} LOC reclaimed (gate would stay green)`);
const TAG = { ready: 'READY    ', blocked: 'BLOCKED  ', review: 'JUDGEMENT' };
for (const o of opportunities) {
  console.log(`\n[${TAG[o.tier]} ${o.severity.toUpperCase().padEnd(6)} ${o.confidence.padEnd(6)}${o.bodySim != null ? ` ${(o.bodySim * 100).toFixed(0).padStart(3)}%` : '     '}] ${o.id} ${o.title.replace(/`/g, '')}`);
  console.log(`  gate: ${o.gate}`);
  if (o.canonical) console.log(`  keep \`${o.canonical}\` · removes ${o.removesNodes} copy(ies) · rewires ${o.callersRewired} caller(s) · blast radius ${o.blastRadius} · ~${o.locSaved} LOC`);
  console.log(`  -> ${o.recommendation}`);
}
finish();
}
