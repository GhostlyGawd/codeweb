#!/usr/bin/env node
// codeweb risk (F7) — rank symbols by change-risk so a reviewer triages the dangerous ones first.
// risk = weighted, graph-max-normalized blend of fan-in, fan-out, loc, transitive blast radius, and
// git churn (the formula + weights live in ./lib/risk.mjs — one truth, shared with the tests).
// Read-only, deterministic. Built on ./lib/graph-ops.mjs.
//
// Usage: node risk.mjs <graph.json> [--changed <file,...>] [--churn <map.json> | --git] [--json]
//   --churn map.json: { "<relpath>": <commitCount> }   --git: derive churn from `git log` (integration)
// Exit: 0 ok, 2 usage/IO.

import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { normalizeGraph, buildIndex, impactOf, productScope, scopeNote } from './lib/graph-ops.mjs';
import { RISK_WEIGHTS, riskScore } from './lib/risk.mjs';

const USAGE = 'usage: risk.mjs <graph.json> [--changed <file,...>] [--churn <map.json> | --git] [--all] [--json]';
if (process.argv.includes('--help') || process.argv.includes('-h')) { console.log(USAGE); process.exit(0); } // #5: every CLI answers --help
import { die, emitJson, finish, capList, loadGraph } from './lib/cli.mjs';

const argv = process.argv.slice(2);
let json = false, changed = null, churnPath = null, useGit = false, limit = null, all = false; const pos = [];
for (let i = 0; i < argv.length; i++) {
  const t = argv[i];
  if (t === '--json') json = true;
  else if (t === '--limit') limit = Math.max(0, parseInt(argv[++i], 10) || 0);
  else if (t === '--changed') changed = argv[++i];
  else if (t === '--churn') churnPath = argv[++i];
  else if (t === '--git') useGit = true;
  else if (t === '--all') all = true; // #6: include non-product roles
  else if (!t.startsWith('-')) pos.push(t);
}
const { graph, abs } = loadGraph(pos[0], { usage: USAGE });

// churn map: file -> commit count
let churn = {};
if (churnPath) { try { churn = JSON.parse(readFileSync(resolve(churnPath), 'utf8')); } catch (e) { die(`invalid churn JSON: ${e.message}`, 2); } }
else if (useGit) {
  const root = graph.meta?.root;
  const r = spawnSync('git', ['-C', root || '.', 'log', '--format=', '--name-only'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status === 0) for (const f of r.stdout.split(/\r?\n/)) if (f.trim()) churn[f.trim()] = (churn[f.trim()] || 0) + 1;
}

const index = buildIndex(graph);
// #6: rank product code by default — triage lists led by test scaffolding are unactionable.
const riskScope = productScope(graph.nodes, all);
// components per node (raw structural metrics + churn-by-file)
const comp = riskScope.kept.map((n) => ({
  id: n.id, file: n.file, domain: n.domain,
  fanIn: index.callIn.get(n.id)?.size || 0,
  fanOut: index.callOut.get(n.id)?.size || 0,
  loc: n.loc || 0,
  blast: impactOf(index, [n.id]).length,
  churn: churn[n.file] || 0,
}));
// graph-max per component (normalization denominator)
const maxes = { fanIn: 0, fanOut: 0, loc: 0, blast: 0, churn: 0 };
for (const c of comp) for (const k of Object.keys(maxes)) maxes[k] = Math.max(maxes[k], c[k]);

let ranked = comp.map((c) => ({ id: c.id, file: c.file, domain: c.domain, risk: riskScore(c, maxes), components: { fanIn: c.fanIn, fanOut: c.fanOut, loc: c.loc, blast: c.blast, churn: c.churn } }))
  .sort((a, b) => b.risk - a.risk || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

if (changed != null) {
  const files = new Set(changed.split(',').map((s) => s.trim()).filter(Boolean));
  ranked = ranked.filter((r) => files.has(r.file));
}

const capped = capList(ranked, limit);
const payload = { target: graph.meta?.target || 'target', summary: `${ranked.length} symbol(s) ranked by change-risk${changed != null ? ' (changed only)' : ''}`, weights: RISK_WEIGHTS, maxes, count: ranked.length, ranked: capped.items, excluded: riskScope.excluded, excludedByRole: riskScope.excludedByRole };
if (riskScope.excluded) payload.summary += ` — ${scopeNote(riskScope)}`;
if (capped.truncated) payload.more = { remaining: capped.remaining };

if (json) { emitJson(payload); } else {

console.log(`codeweb risk: ${payload.target} — ${ranked.length} symbol(s) ranked by change-risk${changed != null ? ' (changed only)' : ''}`);
console.log(`  weights: ${Object.entries(RISK_WEIGHTS).map(([k, v]) => `${k} ${v}`).join(', ')}`);
if (riskScope.excluded) console.log(`  scope: product — ${scopeNote(riskScope)}`); // #6: counted, never silent
for (const r of ranked.slice(0, 15)) {
  const c = r.components;
  console.log(`  ${r.risk.toFixed(3)}  ${r.id}  [in ${c.fanIn} out ${c.fanOut} loc ${c.loc} blast ${c.blast} churn ${c.churn}]`);
}
finish();
}
