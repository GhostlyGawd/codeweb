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
import { normalizeGraph, buildIndex, callersOf, impactOf, fileCycles } from './lib/graph-ops.mjs';

const USAGE = 'usage: optimize.mjs <graph.json> [--json] [--out <optimize.md>]   (or set CODEWEB_WS)';
const READY_BODYSIM = 0.6; // body-confirmed "high" floor — must match overlap.mjs's confidence band
function die(msg, code) { console.error(msg); process.exit(code); }

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

const abs = resolve(graphPath);
if (!existsSync(abs)) die(`graph not found: ${abs}`, 2);
let graph;
try { graph = normalizeGraph(JSON.parse(readFileSync(abs, 'utf8'))); }
catch (e) { die(`invalid JSON in ${abs}: ${e.message}`, 2); }

const index = buildIndex(graph);
const cycKey = (c) => c.join('|');
const beforeCycles = new Set(fileCycles(graph).map(cycKey));

// Pick the canonical survivor for a duplicate cluster: most callers wins (least disruptive to keep),
// tie -> smallest body (LOC), tie -> lexicographically smallest id. Deterministic.
function chooseCanonical(ids) {
  return ids.slice().sort((a, b) => {
    const ca = index.callIn.get(a)?.size || 0, cb = index.callIn.get(b)?.size || 0;
    if (cb !== ca) return cb - ca;
    const la = index.byId.get(a)?.loc || 0, lb = index.byId.get(b)?.loc || 0;
    if (la !== lb) return la - lb;
    return a < b ? -1 : a > b ? 1 : 0;
  })[0];
}

// Model "delete the duplicate definitions, route every reference at the canonical": drop the
// non-canonical copies, redirect any edge touching a copy to the canonical, de-dup, drop self-loops.
// Returns the simulated graph so we can recompute file cycles on it. Never mutates `graph`.
function simulateMerge(ids, canonical) {
  const copies = new Set(ids);
  const keptNodes = graph.nodes.filter((n) => !(copies.has(n.id) && n.id !== canonical));
  const seen = new Set(); const edges = [];
  for (const e of graph.edges) {
    const from = copies.has(e.from) ? canonical : e.from;
    const to = copies.has(e.to) ? canonical : e.to;
    if (from === to) continue;
    const k = `${from} ${to} ${e.kind}`;
    if (seen.has(k)) continue; seen.add(k);
    edges.push({ from, to, kind: e.kind });
  }
  return normalizeGraph({ meta: graph.meta, nodes: keptNodes, edges, domains: graph.domains, overlaps: [] });
}

// actionable findings only: precision gate drops low/refuted (overlap.mjs's own "findings" set).
const candidates = graph.overlaps.filter((o) => o.confidence === 'high' || o.confidence === 'medium');

const SEV = { low: 1, medium: 2, high: 3 };
const opportunities = candidates.map((o) => {
  const bodyHigh = o.bodySim != null && o.bodySim >= READY_BODYSIM && !o.drifted;
  const mergeable = o.kind === 'duplicate-logic';

  let canonical = null, projectedNewCycles = [], removesNodes = 0, callersRewired = 0, blastRadius = 0, locSaved = 0;
  if (mergeable && o.nodes.length >= 2) {
    canonical = chooseCanonical(o.nodes);
    const losers = o.nodes.filter((id) => id !== canonical);
    const sim = simulateMerge(o.nodes, canonical);
    projectedNewCycles = fileCycles(sim).filter((c) => !beforeCycles.has(cycKey(c)));
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
    canonical, removesNodes, callersRewired, blastRadius, locSaved,
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

if (json) { process.stdout.write(JSON.stringify(payload) + '\n'); process.exit(0); }

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
process.exit(0);
