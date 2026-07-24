#!/usr/bin/env node
// codeweb break-cycles (F9) — for each file-level dependency cycle, propose the CHEAPEST file->file
// dependency to sever (fewest underlying symbol edges) and PROVE it works by recomputing fileCycles
// on the graph with that edge removed. Never proposes a cut that doesn't break the cycle, and never
// a fabricated edge. Read-only, deterministic. Built on ./lib/graph-ops.mjs (fileCycles +
// cheapestCuts — one truth; round 2 #23 hoisted the cut logic there: this file is argv/IO/render).
//
// Usage: node break-cycles.mjs <graph.json> [--json]   (or set CODEWEB_WS)
// Exit: 0 ok, 2 usage/IO.

import { cheapestCuts } from './lib/graph-ops.mjs';

const USAGE = 'usage: break-cycles.mjs <graph.json> [--limit N] [--offset N] [--json]   (or set CODEWEB_WS)';
import { emitJson, finish, loadGraph, capList, parseArgs } from './lib/cli.mjs';

// finding 24: THE flag loop (lib/cli.mjs parseArgs) — one unknown-flag policy, --help included.
const { opts, pos } = parseArgs(process.argv.slice(2), {
  usage: USAGE,
  flags: {
    json: { type: 'bool', default: false },
    limit: { type: 'number', default: null, min: 0 },  // API F3: one pagination dialect (limit/offset)
    offset: { type: 'number', default: 0, min: 0 },
  },
});
const { json, limit, offset } = opts;
const { graph } = loadGraph(pos[0], { usage: USAGE });

const cycles = cheapestCuts(graph);

// API F3: `count` stays the true total, `more` carries nextOffset so the remainder is reachable.
const capped = capList(cycles, limit, offset);
const payload = { target: graph.meta?.target || 'target', summary: `${cycles.length} file dependency cycle(s), ${cycles.filter((c) => c.verified).length} with a verified cheapest cut`, count: cycles.length, cycles: capped.items };
if (capped.truncated) payload.more = { remaining: capped.remaining, nextOffset: capped.offset + capped.items.length };
if (json) { emitJson(payload); } else {

console.log(`codeweb break-cycles: ${cycles.length} file dependency cycle(s)`);
for (const c of payload.cycles) {
  console.log(`\n  cycle: ${c.files.join(' <-> ')}`);
  if (c.verified) {
    console.log(`  -> cut ${c.cut.fromFile} -> ${c.cut.toFile} (${c.cut.weight} edge(s), cheapest; mean ${c.meanWeight.toFixed(1)}) — VERIFIED to break the cycle`);
    for (const e of c.cut.underlyingEdges.slice(0, 8)) console.log(`       ${e.from} -> ${e.to}`);
    console.log(`     invert this dependency (extract the needed symbol to a neutral module, or use DI).`);
  } else console.log(`  -> ${c.note}`);
}
if (payload.more) console.log(`  … +${payload.more.remaining} more`);
finish();
}
