#!/usr/bin/env node
// codeweb brief — the day-one page: what this repo is, where things live, what everything
// hangs off, where the tests are, what's already known to be wrong. The first call of a
// session (or injected automatically by hooks/session-brief.mjs), replacing the exploratory
// token burn with ~2KB of pre-computed orientation.
//
//   node scripts/brief.mjs <graph.json> [--json]

import { die, emitJson, emitText, loadGraph, checkStaleness } from './lib/cli.mjs';
import { buildIndex } from './lib/graph-ops.mjs';
import { buildBrief, renderBrief } from './lib/brief-core.mjs';
import { attachActivity } from './lib/stats.mjs';

const USAGE = 'usage: brief.mjs <graph.json> [--json]';
const argv = process.argv.slice(2);
let json = false; const pos = [];
for (const t of argv) { if (t === '--json') json = true; else if (!t.startsWith('-')) pos.push(t); else die(USAGE, 2); }

const { graph, abs } = loadGraph(pos[0], { usage: USAGE });
const brief = attachActivity(buildBrief(graph, buildIndex(graph)), abs);
const stale = checkStaleness(graph);
if (stale) brief.stale = stale;

if (json) { emitJson(brief); } else {
  let text = renderBrief(brief);
  if (stale) text += `\nnote: graph is stale for ${stale.count}+ file(s) — run codeweb_refresh for current numbers.`;
  emitText(text);
}
