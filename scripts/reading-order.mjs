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
function die(msg, code) { console.error(msg); process.exit(code); }

const argv = process.argv.slice(2);
let json = false, budget = 40, scopeKind = 'all', scopeValue = null; const pos = [];
for (let i = 0; i < argv.length; i++) {
  const t = argv[i];
  if (t === '--json') json = true;
  else if (t === '--budget') budget = Math.max(1, parseInt(argv[++i], 10) || 40);
  else if (t === '--scope') { scopeKind = argv[++i]; scopeValue = argv[++i]; }
  else if (!t.startsWith('-')) pos.push(t);
}
const graphPath = pos[0] || (process.env.CODEWEB_WS ? `${process.env.CODEWEB_WS}/graph.json` : null);
if (!graphPath) die(USAGE, 2);

const abs = resolve(graphPath);
if (!existsSync(abs)) die(`graph not found: ${abs}`, 2);
let graph;
try { graph = normalizeGraph(JSON.parse(readFileSync(abs, 'utf8'))); }
catch (e) { die(`invalid JSON in ${abs}: ${e.message}`, 2); }

const scope = { kind: scopeKind, value: scopeValue };
const order = readingOrder(graph, { scope, budget });
const payload = { target: graph.meta?.target || 'target', scope, budget, count: order.length, order };

if (json) { process.stdout.write(JSON.stringify(payload) + '\n'); process.exit(0); }

console.log(`codeweb reading-order: ${order.length} symbol(s)${scopeKind !== 'all' ? ` in ${scopeKind} ${scopeValue}` : ''} — read top-down (foundations first):`);
order.forEach((o, i) => console.log(`  ${String(i + 1).padStart(3)}. ${o.id}\n        ${o.why}`));
process.exit(0);
