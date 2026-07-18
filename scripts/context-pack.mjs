#!/usr/bin/env node
// codeweb context-pack — blast-radius-scoped context for a symbol. Returns the target body, the
// direct callers (the call sites that break if the contract changes — as CALL-SITE WINDOWS, a few
// lines around each use, not whole function bodies), the direct callees (dependencies —
// location-only to stay bounded), and the transitive impact set (ids only). Lets an agent edit with
// a minimal window instead of grepping and reading whole files. Read-only, deterministic.
//
// The window default is the token budget made real: whole caller bodies blew a single "bounded"
// pack past 300KB on a busy symbol (88 callers x full functions); the agent needs the call sites.
// --full-bodies restores the old shape when a consumer genuinely wants every caller in full.
//
// Usage: node context-pack.mjs <graph.json> <symbol> [--window N] [--full-bodies] [--limit N] [--json]
// Exit: 0 ok, 1 symbol not found, 2 usage/IO.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeGraph, buildIndex, resolveSymbol, callersOf, calleesOf, impactOf } from './lib/graph-ops.mjs';

const USAGE = 'usage: context-pack.mjs <graph.json> <symbol> [--window N] [--full-bodies] [--limit N] [--json]   (or set CODEWEB_WS)';
import { die, emitJson, finish, capList } from './lib/cli.mjs';

const argv = process.argv.slice(2);
let json = false, windowN = 3, fullBodies = false, limit = null; const pos = [];
for (let i = 0; i < argv.length; i++) {
  const t = argv[i];
  if (t === '--json') json = true;
  else if (t === '--window') windowN = Math.max(0, parseInt(argv[++i], 10) || 3);
  else if (t === '--full-bodies') fullBodies = true;
  else if (t === '--limit') limit = Math.max(0, parseInt(argv[++i], 10) || 0);
  else if (!t.startsWith('-')) pos.push(t);
}
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
  const o = { id: n.id, label: n.label, kind: n.kind, file: n.file, line: n.line, loc: n.loc, domain: n.domain, exports: n.exports, signature: n.signature ?? null };
  if (withBody) o.body = bodyOf(n);
  return o;
};
// CALL-SITE WINDOWS: inside the caller's recorded span, every line that references the target label,
// each with ±windowN lines of context. Windows overlapping-adjacent are merged. This is the part of
// the caller an agent actually needs to update; the full body stays one --full-bodies away.
const targetLabels = [...new Set(ids.map((id) => index.byId.get(id)?.label).filter(Boolean))];
const labelRe = targetLabels.length ? new RegExp(`\\b(${targetLabels.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`) : null;
const windowsOf = (n) => {
  if (!sourceAvailable || !labelRe) return [];
  const lines = readLines(n.file);
  if (!lines) return [];
  const start = n.line, end = Math.min(n.line + (n.loc || 1) - 1, lines.length);
  const hits = [];
  for (let ln = start; ln <= end; ln++) if (labelRe.test(lines[ln - 1] || '')) hits.push(ln);
  const windows = [];
  for (const h of hits.slice(0, 8)) { // a caller with >8 call sites: the first 8 windows tell the story
    const s = Math.max(start, h - windowN), e = Math.min(end, h + windowN);
    const last = windows[windows.length - 1];
    if (last && s <= last.endLine + 1) { last.endLine = e; last.callLines.push(h); }
    else windows.push({ startLine: s, endLine: e, callLines: [h] });
  }
  for (const w of windows) w.text = lines.slice(w.startLine - 1, w.endLine).join('\n');
  return windows;
};
const callerView = (id) => {
  const n = byId.get(id);
  const o = view(n, fullBodies);
  if (!fullBodies) o.windows = windowsOf(n);
  return o;
};
const byId = index.byId;
const cappedCallers = capList(callerIds, limit);
const cappedCallees = capList(calleeIds, limit);
const cappedBlast = capList(blast, limit != null ? Math.max(limit, 25) : null);
const payload = {
  symbol, matched: ids, sourceAvailable,
  summary: `${symbol}: ${callerIds.length} caller(s), ${calleeIds.length} callee(s), blast radius ${blast.length}`,
  mode: fullBodies ? 'full-bodies' : `call-site windows (±${windowN} lines)`,
  target: ids.map((id) => view(byId.get(id), true)),
  callers: cappedCallers.items.map(callerView),               // call sites that may need updating
  callees: cappedCallees.items.map((id) => view(byId.get(id), false)),  // dependencies: location-only (bounded)
  blastRadius: { count: blast.length, ids: cappedBlast.items }, // transitive impact: ids only
};
if (cappedCallers.truncated) payload.moreCallers = { remaining: cappedCallers.remaining };
if (cappedCallees.truncated) payload.moreCallees = { remaining: cappedCallees.remaining };

if (json) { emitJson(payload); } else {

console.log(`context-pack: ${symbol} -> ${ids.join(', ')}`);
console.log(`source: ${sourceAvailable ? `available — ${payload.mode}` : 'absent — bodies null'}`);
for (const t of payload.target) {
  console.log(`\n# target ${t.id}  (${t.file}:${t.line}, ${t.loc} loc, ${t.domain})`);
  if (t.body) console.log(t.body);
}
console.log(`\ncallers (${payload.callers.length}) — call sites that may need updating:`);
for (const c of payload.callers) console.log(`  ${c.id}  (${c.file}:${c.line})`);
console.log(`callees (${payload.callees.length}) — dependencies:`);
for (const c of payload.callees) console.log(`  ${c.id}`);
console.log(`blast radius: ${payload.blastRadius.count} transitive caller(s)`);
finish();
}
