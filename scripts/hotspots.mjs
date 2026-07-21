#!/usr/bin/env node
// codeweb hotspots CLI (F4) — rank symbols by refactoring priority (complexity x fan-in x churn) so an
// agent knows WHERE to optimize first in a large codebase. Read-only, deterministic. Built on
// ./lib/hotspots.mjs (formula one truth, shared with the tests). Churn is optional: --churn <map.json>
// or --git derives commit counts from the recorded meta.root.
//
// Usage: node hotspots.mjs <graph.json> [--churn <map.json> | --git] [--json]
// Exit: 0 ok, 2 usage/IO.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { normalizeGraph, scopeNote } from './lib/graph-ops.mjs';
import { rankHotspots } from './lib/hotspots.mjs';
import { churnFromGit } from './lib/churn.mjs'; // finding 27: ONE bounded, HEAD-cached git-churn parser (shared with risk)

const USAGE = 'usage: hotspots.mjs <graph.json> [--churn <map.json> | --git] [--all] [--json]';
import { die, emitJson, finish, capList, loadGraph, parseArgs } from './lib/cli.mjs';

// finding 24: THE flag loop (lib/cli.mjs parseArgs) — one unknown-flag policy, --help included.
const { opts, pos } = parseArgs(process.argv.slice(2), {
  usage: USAGE,
  flags: {
    json: { type: 'bool', default: false },
    limit: { type: 'number', default: null },
    churn: { type: 'string', default: null },
    git: { type: 'bool', default: false },
    all: { type: 'bool', default: false }, // #6: include non-product roles in the ranking
  },
});
const { json, limit, all } = opts, churnPath = opts.churn, useGit = opts.git;
const { graph, abs } = loadGraph(pos[0], { usage: USAGE });

let churn = {};
if (churnPath) { try { churn = JSON.parse(readFileSync(resolve(churnPath), 'utf8')); } catch (e) { die(`invalid churn JSON: ${e.message}`, 2); } }
else if (useGit) churn = churnFromGit(graph.meta?.root, { cacheDir: dirname(abs) }); // finding 27: bounded window + HEAD-keyed cache beside the graph

const full = rankHotspots(graph, { churn, allRoles: all });
const capped = capList(full.ranked, limit);
const payload = { target: graph.meta?.target || 'target', summary: `${full.count} symbol(s) ranked by complexity x fan-in x churn`, ...full, ranked: capped.items };
if (capped.truncated) payload.more = { remaining: capped.remaining };

if (json) { emitJson(payload); } else {

console.log(`codeweb hotspots: ${payload.target} — ${payload.count} symbol(s) ranked by complexity x fan-in x churn`);
console.log(`  weights: ${Object.entries(payload.weights).map(([k, v]) => `${k} ${v}`).join(', ')}`);
if (payload.excluded) console.log(`  scope: product — ${scopeNote(payload)}`); // #6: counted, never silent
for (const r of payload.ranked.slice(0, 15)) {
  const c = r.components;
  console.log(`  ${r.score.toFixed(3)}  ${r.id}  [cx ${c.complexity} in ${c.fanIn} churn ${c.churn}]`);
}
finish();
}
