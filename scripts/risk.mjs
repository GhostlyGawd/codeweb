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
import { resolve, dirname } from 'node:path';
import { buildIndex, scopeNote } from './lib/graph-ops.mjs';
import { RISK_WEIGHTS, rankRisk } from './lib/risk.mjs';
import { churnFromGit } from './lib/churn.mjs'; // finding 27: ONE bounded, HEAD-cached git-churn parser (shared with hotspots)

const USAGE = 'usage: risk.mjs <graph.json> [--changed <file,...>] [--limit N] [--offset N] [--churn <map.json> | --git] [--all] [--json]'; // F10: --limit was real but hidden
import { die, emitJson, finish, capList, loadGraph, parseArgs } from './lib/cli.mjs';

// finding 24: THE flag loop (lib/cli.mjs parseArgs) — one unknown-flag policy, --help included.
const { opts, pos } = parseArgs(process.argv.slice(2), {
  usage: USAGE,
  flags: {
    json: { type: 'bool', default: false },
    limit: { type: 'number', default: null, min: 0 },  // API F3: one pagination dialect (limit/offset)
    offset: { type: 'number', default: 0, min: 0 },
    changed: { type: 'string', default: null },
    churn: { type: 'string', default: null },
    git: { type: 'bool', default: false },
    all: { type: 'bool', default: false }, // #6: include non-product roles
  },
});
const { json, limit, offset, changed, all } = opts, churnPath = opts.churn, useGit = opts.git;
const { graph, abs } = loadGraph(pos[0], { usage: USAGE });

// churn map: file -> commit count
let churn = {};
if (churnPath) { try { churn = JSON.parse(readFileSync(resolve(churnPath), 'utf8')); } catch (e) { die(`invalid churn JSON: ${e.message}`, 2); } }
else if (useGit) churn = churnFromGit(graph.meta?.root, { cacheDir: dirname(abs) }); // finding 27: bounded window + HEAD-keyed cache beside the graph

const index = buildIndex(graph);
// D4a (SIMPLIFY §2.4): the assembly lives in lib/risk.mjs (rankRisk) — one truth shared with
// the (future) MCP fast path; this file keeps IO, flags, and churn sourcing. The #6 product
// scope, the finding-9 single-SCC blast pass, and the changed-filter all ride along unchanged.
const { ranked, maxes, scope: riskScope } = rankRisk(graph, index, { churn, all, changed });

// API F3: one pagination dialect — `count` stays the true total, `more` carries nextOffset so the
// advertised remainder is actually reachable (it used to name a remainder no offset could fetch).
const capped = capList(ranked, limit, offset);
const payload = { target: graph.meta?.target || 'target', summary: `${ranked.length} symbol(s) ranked by change-risk${changed != null ? ' (changed only)' : ''}`, weights: RISK_WEIGHTS, maxes, count: ranked.length, ranked: capped.items, excluded: riskScope.excluded, excludedByRole: riskScope.excludedByRole };
if (riskScope.excluded) payload.summary += ` — ${scopeNote(riskScope)}`;
if (capped.truncated) payload.more = { remaining: capped.remaining, nextOffset: capped.offset + capped.items.length };

if (json) { emitJson(payload); } else {

console.log(`codeweb risk: ${payload.target} — ${ranked.length} symbol(s) ranked by change-risk${changed != null ? ' (changed only)' : ''}`);
console.log(`  weights: ${Object.entries(RISK_WEIGHTS).map(([k, v]) => `${k} ${v}`).join(', ')}`);
if (riskScope.excluded) console.log(`  scope: product — ${scopeNote(riskScope)}`); // #6: counted, never silent
// CLI.md 5.2: text mode printed a hard-coded top-15 of the UNCAPPED list — --limit was accepted
// and silently ignored. Render the capped page; the classic top-15 stays the no-flag default.
for (const r of (limit != null ? payload.ranked : payload.ranked.slice(0, 15))) {
  const c = r.components;
  console.log(`  ${r.risk.toFixed(3)}  ${r.id}  [in ${c.fanIn} out ${c.fanOut} loc ${c.loc} blast ${c.blast} churn ${c.churn}]`);
}
if (payload.more) console.log(`  … +${payload.more.remaining} more (rerun with --offset ${payload.more.nextOffset})`);
finish();
}
