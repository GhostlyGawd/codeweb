#!/usr/bin/env node
// codeweb structural query CLI: answer graph questions an agent needs to ground itself in a repo
// BEFORE/while editing — who calls X, what X calls, the blast-radius of changing X, dependency
// cycles, and dead-code orphans. Read-only over graph.json (see references/graph-schema.md); never
// writes, never executes target code. Graph primitives live in ./lib/graph-ops.mjs.
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
import { normalizeGraph, buildIndex, resolveSymbol, callersOf, calleesOf, testersOf, importersOf, dependentsOf, impactOf, fileCycles, orphans } from './lib/graph-ops.mjs';

const USAGE = `usage: query.mjs [graph.json] <--callers|--callees|--tests|--dependents|--impact <symbol> | --cycles | --orphans> [--json]`;
function die(msg, code) { console.error(msg); process.exit(code); }

function parseArgs(argv) {
  const o = { graph: null, query: null, symbol: null, json: false, help: false, queries: 0 };
  const withVal = { '--callers': 'callers', '--callees': 'callees', '--tests': 'tests', '--dependents': 'dependents', '--impact': 'impact' };
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
const needsSymbol = ['callers', 'callees', 'tests', 'dependents', 'impact'].includes(opts.query);
if (opts.help || opts.queries !== 1 || (needsSymbol && !opts.symbol)) die(USAGE, 2);

const graphPath = resolve(opts.graph || join('.codeweb', 'graph.json'));
if (!existsSync(graphPath)) die(`graph not found: ${graphPath}`, 2);
let raw;
try { raw = JSON.parse(readFileSync(graphPath, 'utf8')); }
catch (e) { die(`invalid JSON in ${graphPath}: ${e.message}`, 2); }

const graph = normalizeGraph(raw);
const index = buildIndex(graph);

let payload, code = 0;
if (opts.query === 'callers' || opts.query === 'callees' || opts.query === 'tests') {
  const matched = resolveSymbol(graph, opts.symbol);
  if (!matched.length) { payload = { query: opts.query, symbol: opts.symbol, found: false }; code = 1; }
  else {
    const results = opts.query === 'callers' ? callersOf(index, matched) : opts.query === 'callees' ? calleesOf(index, matched) : testersOf(index, matched);
    payload = { query: opts.query, symbol: opts.symbol, matched, results, count: results.length };
  }
} else if (opts.query === 'dependents') {
  const matched = resolveSymbol(graph, opts.symbol);
  if (!matched.length) { payload = { query: 'dependents', symbol: opts.symbol, found: false }; code = 1; }
  else {
    const results = dependentsOf(index, matched);
    const inheritIn = [...new Set(matched.flatMap((id) => [...(index.inheritIn.get(id) || [])]))].sort();
    const byKind = { call: callersOf(index, matched), import: importersOf(index, matched), inherit: inheritIn, test: testersOf(index, matched) };
    payload = { query: 'dependents', symbol: opts.symbol, matched, results, byKind, count: results.length };
  }
} else if (opts.query === 'impact') {
  const matched = resolveSymbol(graph, opts.symbol);
  if (!matched.length) { payload = { query: 'impact', symbol: opts.symbol, found: false }; code = 1; }
  else {
    const results = impactOf(index, matched);
    const domains = [...new Set(results.map((id) => index.byId.get(id)?.domain || 'unassigned'))].sort();
    payload = { query: 'impact', symbol: opts.symbol, matched, results, domains, count: results.length };
  }
} else if (opts.query === 'cycles') {
  const cycles = fileCycles(graph);
  payload = { query: 'cycles', cycles, count: cycles.length };
} else if (opts.query === 'orphans') {
  const results = orphans(graph, index);
  payload = { query: 'orphans', results, count: results.length };
}

if (opts.json) {
  process.stdout.write(JSON.stringify(payload) + '\n');
  process.exit(code);
}

if (payload.found === false) die(`symbol not found: ${opts.symbol}`, 1);
const p = payload;
if (p.query === 'callers' || p.query === 'callees' || p.query === 'tests') {
  const extra = p.matched.length > 1 ? ` (${p.matched.length} matches: ${p.matched.join(', ')})` : '';
  console.log(`${p.query} of ${p.symbol}${extra}: ${p.count}`);
  for (const r of p.results) console.log(`  ${r}`);
} else if (p.query === 'dependents') {
  const extra = p.matched.length > 1 ? ` (${p.matched.length} matches)` : '';
  console.log(`dependents of ${p.symbol}${extra}: ${p.count} (call ${p.byKind.call.length}, import ${p.byKind.import.length}, inherit ${p.byKind.inherit.length}, test ${p.byKind.test.length})`);
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
