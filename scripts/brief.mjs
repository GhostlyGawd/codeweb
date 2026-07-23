#!/usr/bin/env node
// codeweb brief — the day-one page: what this repo is, where things live, what everything
// hangs off, where the tests are, what's already known to be wrong. The first call of a
// session (or injected automatically by hooks/session-brief.mjs), replacing the exploratory
// token burn with ~2KB of pre-computed orientation.
//
//   node scripts/brief.mjs <graph.json> [--json]

import { emitJson, emitText, loadGraph, checkStaleness, parseArgs } from './lib/cli.mjs';
import { buildIndex } from './lib/graph-ops.mjs';
import { buildBrief, renderBrief } from './lib/brief-core.mjs';
import { attachActivity } from './lib/stats.mjs';
import { readHistory } from './lib/history.mjs'; // RETENTION R1/R8: the progression tail (hook/MCP parity)

const USAGE = 'usage: brief.mjs <graph.json> [--json]';
// finding #39: THE flag loop (lib/cli.mjs parseArgs) — one unknown-flag policy (reject with usage, exit 2).
const { opts: { json }, pos } = parseArgs(process.argv.slice(2), {
  usage: USAGE,
  flags: { json: { type: 'bool', default: false } },
});

const { graph, abs } = loadGraph(pos[0], { usage: USAGE });
const brief = attachActivity(buildBrief(graph, buildIndex(graph)), abs);
const stale = checkStaleness(graph);
if (stale) brief.stale = stale;
try { const h = readHistory(abs, 4); if (h.length >= 2) brief.history = h; } catch { /* best-effort */ }

if (json) { emitJson(brief); } else {
  let text = renderBrief(brief);
  if (stale) text += `\nnote: graph is stale for ${stale.count}+ file(s) — run codeweb_refresh for current numbers.`;
  emitText(text);
}
