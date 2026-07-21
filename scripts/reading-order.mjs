#!/usr/bin/env node
// codeweb reading-order CLI (F8) — emit a foundations-first reading path for a scope, bounded to a
// budget. Read-only, deterministic. Built on ./lib/reading-order.mjs.
//
// Usage: node reading-order.mjs <graph.json> [--scope domain|file|symbol <value>] [--budget N] [--json]
// Exit: 0 ok, 2 usage/IO.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeGraph } from './lib/graph-ops.mjs';
import { readingOrder } from './lib/reading-order.mjs';

const USAGE = 'usage: reading-order.mjs <graph.json> [--scope domain|file|symbol <value>] [--budget N] [--json]';
import { die, emitJson, finish, loadGraph, parseArgs } from './lib/cli.mjs';

// finding 24: THE flag loop (lib/cli.mjs parseArgs); --scope is the one two-token flag ('pair').
const { opts, pos } = parseArgs(process.argv.slice(2), {
  usage: USAGE,
  flags: {
    json: { type: 'bool', default: false },
    budget: { type: 'number', default: 40 },
    scope: { type: 'pair', default: null },
  },
});
const { json } = opts, budget = Math.max(1, opts.budget);
const scopeKind = opts.scope ? opts.scope[0] : 'all', scopeValue = opts.scope ? opts.scope[1] : null;
const { graph, abs } = loadGraph(pos[0], { usage: USAGE });

const scope = { kind: scopeKind, value: scopeValue };
const order = readingOrder(graph, { scope, budget });
const payload = { target: graph.meta?.target || 'target', scope, budget, count: order.length, order };

if (json) { emitJson(payload); } else {

console.log(`codeweb reading-order: ${order.length} symbol(s)${scopeKind !== 'all' ? ` in ${scopeKind} ${scopeValue}` : ''} — read top-down (foundations first):`);
order.forEach((o, i) => console.log(`  ${String(i + 1).padStart(3)}. ${o.id}\n        ${o.why}`));
finish();
}
