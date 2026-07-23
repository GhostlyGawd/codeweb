#!/usr/bin/env node
// codeweb stats — the value receipt: what codeweb actually did in this workspace, month by
// month, counted at the moment it happened (hooks + MCP server). Local-only by construction;
// see lib/stats.mjs. Empty ledger -> says so and explains how counters accrue.
//
//   node scripts/stats.mjs <graph.json> [--json]

import { emitJson, emitText, loadGraph, parseArgs } from './lib/cli.mjs';
import { readStats, monthLine, receiptPayload } from './lib/stats.mjs';

const USAGE = 'usage: stats.mjs <graph.json> [--json]';
// finding #39: THE flag loop (lib/cli.mjs parseArgs) — one unknown-flag policy (reject with usage, exit 2).
const { opts: { json }, pos } = parseArgs(process.argv.slice(2), {
  usage: USAGE,
  flags: { json: { type: 'bool', default: false } },
});

const { graph, abs } = loadGraph(pos[0], { usage: USAGE });

if (json) { emitJson(receiptPayload(abs)); } // #33: THE one receipt payload (MCP fast path serves the same)
else {
  const s = readStats(abs);
  const L = [`codeweb activity — ${graph.meta?.target || abs}`];
  const months = s ? Object.keys(s.months || {}).sort() : [];
  const lines = months.map((m) => ({ m, line: monthLine(s.months[m]) })).filter((x) => x.line);
  if (!lines.length) {
    L.push('  no activity recorded yet — counters accrue as the hooks and MCP server run.');
    L.push('  (local-only: stats.json lives beside the graph and never leaves this machine; CODEWEB_NO_STATS=1 disables)');
  } else {
    for (const { m, line } of lines) L.push(`  ${m}: ${line}`);
  }
  emitText(L.join('\n'));
}
