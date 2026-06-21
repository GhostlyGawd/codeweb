#!/usr/bin/env node
// codeweb structural query CLI: answer graph questions an agent needs to ground itself in a repo
// BEFORE/while editing — who calls X, what X calls, the blast-radius of changing X, dependency
// cycles, and dead-code orphans. Read-only over graph.json (see references/graph-schema.md); never
// writes, never executes target code.
//
// Usage:
//   node query.mjs [graph.json] --callers <symbol>
//   node query.mjs [graph.json] --callees <symbol>
//   node query.mjs [graph.json] --impact  <symbol>     # transitive reverse-call closure
//   node query.mjs [graph.json] --cycles               # file-level dependency cycles (SCC >= 2)
//   node query.mjs [graph.json] --orphans              # no callers AND not exported
//   ... add --json for machine-readable, deterministic (sorted) output.
//
// <symbol> is a node id (`file:label`) or a bare label; a bare label matching multiple nodes
// operates on the union of all matches (reported in `matched`).
// Exit codes: 0 = success (even if empty), 1 = symbol not found, 2 = usage / IO error.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const USAGE = `usage: query.mjs [graph.json] <--callers|--callees|--impact <symbol> | --cycles | --orphans> [--json]`;

function die(msg, code) { console.error(msg); process.exit(code); }

// --- parse args ---
function parseArgs(argv) {
  const o = { graph: null, query: null, symbol: null, json: false, help: false, queries: 0 };
  const withVal = { '--callers': 'callers', '--callees': 'callees', '--impact': 'impact' };
  const noVal = { '--cycles': 'cycles', '--orphans': 'orphans' };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--json') o.json = true;
    else if (t === '--help' || t === '-h') o.help = true;
    else if (t in withVal) {
      o.query = withVal[t]; o.queries++;
      o.symbol = (argv[i + 1] && !argv[i + 1].startsWith('-')) ? argv[++i] : undefined;
    } else if (t in noVal) { o.query = noVal[t]; o.queries++; }
    else if (!t.startsWith('-') && o.graph === null) o.graph = t;
  }
  return o;
}

const opts = parseArgs(process.argv.slice(2));
const needsSymbol = ['callers', 'callees', 'impact'].includes(opts.query);
if (opts.help || opts.queries !== 1 || (needsSymbol && !opts.symbol)) die(USAGE, 2);

// --- load + normalize graph (mirror build-report.mjs's defaults) ---
const graphPath = resolve(opts.graph || join('.codeweb', 'graph.json'));
if (!existsSync(graphPath)) die(`graph not found: ${graphPath}`, 2);
let graph;
try { graph = JSON.parse(readFileSync(graphPath, 'utf8')); }
catch (e) { die(`invalid JSON in ${graphPath}: ${e.message}`, 2); }

const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
const edges = Array.isArray(graph.edges) ? graph.edges : [];
for (const n of nodes) {
  if (n.domain == null || n.domain === '') n.domain = 'unassigned';
  if (typeof n.exports !== 'boolean') n.exports = false;
  if (n.file == null) n.file = '';
}

// --- indexes ---
const byId = new Map(nodes.map((n) => [n.id, n]));
const callIn = new Map();   // to   -> Set(from)   (call edges only)
const callOut = new Map();  // from -> Set(to)     (call edges only)
const hasIncoming = new Set(); // any call|import in-edge
for (const e of edges) {
  if (e.kind === 'call') {
    if (!callIn.has(e.to)) callIn.set(e.to, new Set());
    callIn.get(e.to).add(e.from);
    if (!callOut.has(e.from)) callOut.set(e.from, new Set());
    callOut.get(e.from).add(e.to);
  }
  if (e.kind === 'call' || e.kind === 'import') hasIncoming.add(e.to);
}

const sortedUnique = (iter) => [...new Set(iter)].sort();
// resolve a symbol to node ids: exact id wins; else every node whose label matches.
const resolveSymbol = (sym) =>
  byId.has(sym) ? [sym] : nodes.filter((n) => n.label === sym).map((n) => n.id).sort();

// neighbors across all matched seeds, unioned (used by callers/callees)
function neighbors(matched, adj) {
  const out = new Set();
  for (const id of matched) for (const x of (adj.get(id) || [])) out.add(x);
  return [...out].sort();
}

// transitive reverse-call closure from all seeds, excluding the seeds themselves
function impactOf(matched) {
  const seeds = new Set(matched);
  const visited = new Set(matched);
  const queue = [...matched];
  while (queue.length) {
    const cur = queue.shift();
    for (const caller of (callIn.get(cur) || [])) {
      if (!visited.has(caller)) { visited.add(caller); queue.push(caller); }
    }
  }
  const results = [...visited].filter((id) => !seeds.has(id)).sort();
  const domains = sortedUnique(results.map((id) => byId.get(id)?.domain || 'unassigned'));
  return { results, domains };
}

// file-level dependency cycles: SCCs (size >= 2) over the file graph built from call+import edges
function fileCycles() {
  const adj = new Map(); const fileNodes = new Set();
  for (const e of edges) {
    if (e.kind !== 'call' && e.kind !== 'import') continue;
    const f = byId.get(e.from)?.file, t = byId.get(e.to)?.file;
    if (!f || !t || f === t) continue;
    fileNodes.add(f); fileNodes.add(t);
    if (!adj.has(f)) adj.set(f, new Set());
    adj.get(f).add(t);
  }
  // Tarjan's SCC (iterative-safe depth for repo-sized file graphs); deterministic via sorted order.
  let index = 0; const idx = new Map(), low = new Map(), onStack = new Set(), stack = [], out = [];
  const neigh = (v) => [...(adj.get(v) || [])].sort();
  function strongconnect(v) {
    idx.set(v, index); low.set(v, index); index++; stack.push(v); onStack.add(v);
    for (const w of neigh(v)) {
      if (!idx.has(w)) { strongconnect(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (onStack.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
    }
    if (low.get(v) === idx.get(v)) {
      const comp = []; let w;
      do { w = stack.pop(); onStack.delete(w); comp.push(w); } while (w !== v);
      out.push(comp);
    }
  }
  for (const v of [...fileNodes].sort()) if (!idx.has(v)) strongconnect(v);
  return out.filter((c) => c.length >= 2).map((c) => c.sort())
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

// --- run the query ---
let payload, code = 0;
if (opts.query === 'callers' || opts.query === 'callees') {
  const matched = resolveSymbol(opts.symbol);
  if (!matched.length) { payload = { query: opts.query, symbol: opts.symbol, found: false }; code = 1; }
  else {
    const results = neighbors(matched, opts.query === 'callers' ? callIn : callOut);
    payload = { query: opts.query, symbol: opts.symbol, matched, results, count: results.length };
  }
} else if (opts.query === 'impact') {
  const matched = resolveSymbol(opts.symbol);
  if (!matched.length) { payload = { query: 'impact', symbol: opts.symbol, found: false }; code = 1; }
  else {
    const { results, domains } = impactOf(matched);
    payload = { query: 'impact', symbol: opts.symbol, matched, results, domains, count: results.length };
  }
} else if (opts.query === 'cycles') {
  const cycles = fileCycles();
  payload = { query: 'cycles', cycles, count: cycles.length };
} else if (opts.query === 'orphans') {
  const results = nodes
    .filter((n) => !hasIncoming.has(n.id) && !n.exports)
    .map((n) => ({ id: n.id, file: n.file, domain: n.domain }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  payload = { query: 'orphans', results, count: results.length };
}

// --- emit ---
if (opts.json) {
  process.stdout.write(JSON.stringify(payload) + '\n');
  process.exit(code);
}

if (payload.found === false) die(`symbol not found: ${opts.symbol}`, 1);
const p = payload;
if (p.query === 'callers' || p.query === 'callees') {
  const extra = p.matched.length > 1 ? ` (${p.matched.length} matches: ${p.matched.join(', ')})` : '';
  console.log(`${p.query} of ${p.symbol}${extra}: ${p.count}`);
  for (const r of p.results) console.log(`  ${r}`);
} else if (p.query === 'impact') {
  console.log(`impact of ${p.symbol}: ${p.count} functions across ${p.domains.length} domains`);
  if (p.domains.length) console.log(`  domains: ${p.domains.join(', ')}`);
  for (const r of p.results) console.log(`  ${r}`);
} else if (p.query === 'cycles') {
  console.log(`${p.count} file-level dependency cycle(s):`);
  for (const c of p.cycles) console.log(`  ${c.join(' <-> ')}`);
} else if (p.query === 'orphans') {
  console.log(`${p.count} orphan(s) — no callers and not exported:`);
  for (const o of p.results) console.log(`  ${o.id}  [${o.domain}]`);
}
process.exit(code);
