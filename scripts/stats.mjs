#!/usr/bin/env node
// codeweb stats — the value receipt: what codeweb actually did in this workspace, month by
// month, counted at the moment it happened (hooks + MCP server). Local-only by construction;
// see lib/stats.mjs. Empty ledger -> says so and explains how counters accrue.
//
//   node scripts/stats.mjs <graph.json> [--json]

import { die, emitJson, emitText, loadGraph } from './lib/cli.mjs';
import { readStats, monthLine, receiptPayload } from './lib/stats.mjs';

const USAGE = 'usage: stats.mjs <graph.json> [--json]';
if (process.argv.includes('--help') || process.argv.includes('-h')) { console.log(USAGE); process.exit(0); } // #5: every CLI answers --help
const argv = process.argv.slice(2);
let json = false; const pos = [];
for (const t of argv) { if (t === '--json') json = true; else if (!t.startsWith('-')) pos.push(t); else die(USAGE, 2); }

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
