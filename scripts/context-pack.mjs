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

import { buildIndex, resolveSymbol, suggestSymbols } from './lib/graph-ops.mjs';
import { buildContextPack } from './lib/context-core.mjs'; // finding 20: one payload assembler, two transports (CLI + MCP fast path)

const USAGE = 'usage: context-pack.mjs <graph.json> <symbol> [--window N] [--full-bodies] [--limit N] [--json]   (or set CODEWEB_WS)';
if (process.argv.includes('--help') || process.argv.includes('-h')) { console.log(USAGE); process.exit(0); } // #5: every CLI answers --help
import { die, emitJson, finish, loadGraph, sourceReader } from './lib/cli.mjs';
import { bump } from './lib/stats.mjs'; // #10: CLI queries count toward the receipt too

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
else if (pos.length === 1) { graphPath = null; symbol = pos[0]; } // #5: loadGraph discovers (env or nearest .codeweb)
else die(USAGE, 2);

const { graph, abs } = loadGraph(graphPath, { usage: USAGE });

const ids = resolveSymbol(graph, symbol);
if (!ids.length) {
  const suggestions = suggestSymbols(graph, symbol); // #2: offer the nearest labels, not a dead end
  if (json) {
    // finding 20: --json now emits the same found:false contract explain.mjs adopted in #2 — the
    // old stderr die() left MCP parity replying an EMPTY string on a miss.
    const payload = { symbol, found: false, hint: `no symbol matches "${symbol}" — try codeweb_find "<free text>" (concept search, no name needed)${suggestions.length ? ' or a near-match below' : ''}` };
    if (suggestions.length) payload.suggestions = suggestions;
    emitJson(payload, 1);
  } else {
    die(`symbol not found: ${symbol}${suggestions.length ? ` — near matches: ${suggestions.join(', ')}` : ''} (concept search: find.mjs "<free text>")`, 1);
  }
} else {

bump(abs, 'queriesServed');
const index = buildIndex(graph);
// finding 20: the whole payload assembles in lib/context-core.mjs — the same code the MCP fast
// path serves, so the two transports cannot drift (byte-identical JSON, field order included).
const payload = buildContextPack(graph, index, sourceReader(graph.meta?.root || null), ids, { symbol, windowN, fullBodies, limit });
const sourceAvailable = payload.sourceAvailable;

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
}
