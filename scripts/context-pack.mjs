#!/usr/bin/env node
// codeweb context-pack — blast-radius-scoped context for a symbol. Returns the target body, the
// direct callers (the call sites that break if the contract changes — WITH body), the direct
// callees (dependencies — location-only to stay bounded), and the transitive impact set (ids only).
// Lets an agent edit with a minimal window instead of grepping and reading whole files. Read-only,
// deterministic. Built on ./lib/graph-ops.mjs.
//
// Usage: node context-pack.mjs <graph.json> <symbol> [--json]   (or set CODEWEB_WS and pass <symbol>)
// Exit: 0 ok, 1 symbol not found, 2 usage/IO.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeGraph, buildIndex, resolveSymbol, callersOf, calleesOf, impactOf } from './lib/graph-ops.mjs';

const USAGE = 'usage: context-pack.mjs <graph.json> <symbol> [--json]   (or set CODEWEB_WS)';
function die(msg, code) { console.error(msg); process.exit(code); }

const argv = process.argv.slice(2);
let json = false; const pos = [];
for (const t of argv) { if (t === '--json') json = true; else if (!t.startsWith('-')) pos.push(t); }
let graphPath, symbol;
if (pos.length >= 2) { graphPath = pos[0]; symbol = pos[1]; }
else if (pos.length === 1 && process.env.CODEWEB_WS) { graphPath = `${process.env.CODEWEB_WS}/graph.json`; symbol = pos[0]; }
else die(USAGE, 2);

const abs = resolve(graphPath);
if (!existsSync(abs)) die(`graph not found: ${abs}`, 2);
let graph;
try { graph = normalizeGraph(JSON.parse(readFileSync(abs, 'utf8'))); }
catch (e) { die(`invalid JSON in ${abs}: ${e.message}`, 2); }

const ids = resolveSymbol(graph, symbol);
if (!ids.length) die(`symbol not found: ${symbol}`, 1);

const index = buildIndex(graph);
const callerIds = callersOf(index, ids);
const calleeIds = calleesOf(index, ids);
const blast = impactOf(index, ids);

const root = graph.meta?.root || null;
const sourceAvailable = !!root && existsSync(root);
const fileCache = new Map();
const readLines = (rel) => {
  if (!fileCache.has(rel)) { try { fileCache.set(rel, readFileSync(root + '/' + rel, 'utf8').split(/\r?\n/)); } catch { fileCache.set(rel, null); } }
  return fileCache.get(rel);
};
// CP-BODY-FIDELITY: the exact source lines [line, line+loc-1] joined by \n, no trailing newline.
const bodyOf = (n) => {
  if (!sourceAvailable) return null;
  const lines = readLines(n.file);
  if (!lines) return null;
  return lines.slice(n.line - 1, n.line - 1 + (n.loc || 1)).join('\n');
};
const view = (n, withBody) => {
  const o = { id: n.id, label: n.label, kind: n.kind, file: n.file, line: n.line, loc: n.loc, domain: n.domain, exports: n.exports };
  if (withBody) o.body = bodyOf(n);
  return o;
};
const byId = index.byId;
const payload = {
  symbol, matched: ids, sourceAvailable,
  target: ids.map((id) => view(byId.get(id), true)),
  callers: callerIds.map((id) => view(byId.get(id), true)),   // call sites: body included
  callees: calleeIds.map((id) => view(byId.get(id), false)),  // dependencies: location-only (bounded)
  blastRadius: { count: blast.length, ids: blast },           // transitive impact: ids only
};

if (json) { process.stdout.write(JSON.stringify(payload) + '\n'); process.exit(0); }

console.log(`context-pack: ${symbol} -> ${ids.join(', ')}`);
console.log(`source: ${sourceAvailable ? 'available — bodies included' : 'absent — bodies null'}`);
for (const t of payload.target) {
  console.log(`\n# target ${t.id}  (${t.file}:${t.line}, ${t.loc} loc, ${t.domain})`);
  if (t.body) console.log(t.body);
}
console.log(`\ncallers (${payload.callers.length}) — call sites that may need updating:`);
for (const c of payload.callers) console.log(`  ${c.id}  (${c.file}:${c.line})`);
console.log(`callees (${payload.callees.length}) — dependencies:`);
for (const c of payload.callees) console.log(`  ${c.id}`);
console.log(`blast radius: ${payload.blastRadius.count} transitive caller(s)`);
process.exit(0);
