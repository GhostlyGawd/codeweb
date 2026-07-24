#!/usr/bin/env node
// codeweb reading-order CLI (F8) — emit a foundations-first reading path for a scope, bounded to a
// budget. Read-only, deterministic. Built on ./lib/reading-order.mjs.
//
// Usage: node reading-order.mjs <graph.json> [--scope domain|file|symbol <value>] [--budget N] [--json]
// Exit: 0 ok, 2 usage/IO.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeGraph, buildIndex } from './lib/graph-ops.mjs';
import { readingOrder, scopeIdsOf } from './lib/reading-order.mjs';

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
// FORMS F8: a typo'd scope kind silently answered a DIFFERENT question (the whole repo). Same
// hardening --stages already has: enumerate the valid set, die 2.
if (opts.scope && !['domain', 'file', 'symbol'].includes(scopeKind)) {
  die(`unknown --scope kind "${scopeKind}" (valid: domain | file | symbol)\n${USAGE}`, 2);
}
const { graph, abs } = loadGraph(pos[0], { usage: USAGE });

const scope = { kind: scopeKind, value: scopeValue };
const order = readingOrder(graph, { scope, budget });
const payload = { target: graph.meta?.target || 'target', scope, budget, count: order.length, order };
// API F3: the budget cut was INVISIBLE — a truncated path looked complete. When the order fills
// the budget, report the in-scope remainder as an explicit `more` marker (never a silent cut).
// The lib's return shape is oracle-pinned, so the true total comes from the exported scope
// resolver (index built only for the `symbol` closure — the other kinds are plain node filters).
if (order.length >= budget) {
  const total = new Set(scopeIdsOf(graph, scopeKind === 'symbol' ? buildIndex(graph) : null, scope)).size;
  if (total > order.length) payload.more = { remaining: total - order.length };
}

if (json) { emitJson(payload); } else {

console.log(`codeweb reading-order: ${order.length} symbol(s)${scopeKind !== 'all' ? ` in ${scopeKind} ${scopeValue}` : ''} — read top-down (foundations first):`);
order.forEach((o, i) => console.log(`  ${String(i + 1).padStart(3)}. ${o.id}\n        ${o.why}`));
if (payload.more) console.log(`  … +${payload.more.remaining} more in scope (raise --budget for the full path)`);
finish();
}
