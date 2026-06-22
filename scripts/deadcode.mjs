#!/usr/bin/env node
// codeweb deadcode (F10) — turn the orphans candidate list into a confidence-tiered action plan.
// Partitions orphans (no production caller, not exported) into `safe` (no test edge, not an
// entrypoint-like name — high-confidence dead) and `review` (referenced only by tests, or an
// entrypoint-like name that a framework/CLI may invoke without a code edge). Honestly surfaces the
// orphans caveat (extraction drops ambiguous call edges, so cross-check). Read-only, advisory,
// deterministic. Built on ./lib/graph-ops.mjs (uses the SAME orphans + testIn as query.mjs — one truth).
//
// Usage: node deadcode.mjs <graph.json> [--json]   (or set CODEWEB_WS)
// Exit: 0 (advisory), 2 usage/IO.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeGraph, buildIndex, orphans } from './lib/graph-ops.mjs';

// Entrypoint-like names that may be invoked by a framework / CLI / test runner rather than via a
// code edge — so an uncalled one is "review", not "safe to delete". (Mirrored by the test oracle.)
const ENTRYPOINTS = new Set(['main', 'default', 'index', 'setup', 'teardown', 'init']);
const USAGE = 'usage: deadcode.mjs <graph.json> [--json]   (or set CODEWEB_WS)';
function die(msg, code) { console.error(msg); process.exit(code); }

const argv = process.argv.slice(2);
let json = false; const pos = [];
for (const t of argv) { if (t === '--json') json = true; else if (!t.startsWith('-')) pos.push(t); }
const graphPath = pos[0] || (process.env.CODEWEB_WS ? `${process.env.CODEWEB_WS}/graph.json` : null);
if (!graphPath) die(USAGE, 2);

const abs = resolve(graphPath);
if (!existsSync(abs)) die(`graph not found: ${abs}`, 2);
let graph;
try { graph = normalizeGraph(JSON.parse(readFileSync(abs, 'utf8'))); }
catch (e) { die(`invalid JSON in ${abs}: ${e.message}`, 2); }

const index = buildIndex(graph);
const CAVEAT = 'extraction drops ambiguous call edges (precision over recall), so a genuinely-called symbol can surface here — cross-check before deleting';

const safe = [], review = [];
for (const o of orphans(graph, index)) {           // orphans = no call|import|inherit incoming, not exported
  const label = index.byId.get(o.id)?.label || o.id;
  const testers = index.testIn.get(o.id)?.size || 0;
  if (testers > 0) review.push({ ...o, reason: `referenced only by ${testers} test(s) — the test may be its only user; remove the test too, or it is genuinely used` });
  else if (ENTRYPOINTS.has(label)) review.push({ ...o, reason: `entrypoint-like name '${label}' — may be invoked by a framework/CLI/test runner, not via a code edge` });
  else safe.push({ ...o, reason: `no production caller, not exported, no test edge — high-confidence dead (${CAVEAT})` });
}

const payload = { target: graph.meta?.target || 'target', totals: { orphans: safe.length + review.length, safe: safe.length, review: review.length }, safe, review };

if (json) { process.stdout.write(JSON.stringify(payload) + '\n'); process.exit(0); }

const t = payload.totals;
console.log(`codeweb deadcode: ${payload.target} — ${t.orphans} orphan(s): ${t.safe} safe, ${t.review} review`);
console.log(`\nsafe to delete (no caller, not exported, no test):`);
for (const o of safe) console.log(`  ${o.id}  [${o.domain}]`);
if (!safe.length) console.log('  (none)');
console.log(`\nreview first (tests reference it, or entrypoint-like):`);
for (const o of review) console.log(`  ${o.id}  — ${o.reason}`);
if (!review.length) console.log('  (none)');
console.log(`\nnote: ${CAVEAT}.`);
process.exit(0);
