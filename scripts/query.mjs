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
import { normalizeGraph, buildIndex } from './lib/graph-ops.mjs';
import { runQuery } from './lib/query-core.mjs'; // payload assembly lives once (CLI + in-process MCP)

const USAGE = `usage: query.mjs [graph.json] <--callers|--callees|--tests|--dependents|--impact <symbol> | --cycles | --orphans> [--limit N] [--offset N] [--json]`;
import { die, emitJson, finish, capList, checkStaleness } from './lib/cli.mjs';

function parseArgs(argv) {
  const o = { graph: null, query: null, symbol: null, json: false, help: false, queries: 0, limit: null, offset: 0 };
  const withVal = { '--callers': 'callers', '--callees': 'callees', '--tests': 'tests', '--dependents': 'dependents', '--impact': 'impact' };
  const noVal = { '--cycles': 'cycles', '--orphans': 'orphans' };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--json') o.json = true;
    else if (t === '--limit') o.limit = Math.max(0, parseInt(argv[++i], 10) || 0);
    else if (t === '--offset') o.offset = Math.max(0, parseInt(argv[++i], 10) || 0);
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

const { payload, code } = runQuery(graph, index, { query: opts.query, symbol: opts.symbol, limit: opts.limit, offset: opts.offset });

// awareness: annotate (never block) when the graph no longer matches disk
const staleInfo = checkStaleness(graph);
if (staleInfo && payload && payload.found !== false) {
  payload.stale = staleInfo;
  if (payload.summary) payload.summary += ` — graph is stale for ${staleInfo.count}+ file(s); run codeweb_refresh`;
}

if (opts.json) { emitJson(payload, code); } else {

if (payload.found === false) die(`symbol not found: ${opts.symbol}`, 1);
const p = payload;
if (p.query === 'callers' || p.query === 'callees' || p.query === 'tests') {
  const extra = p.matched.length > 1 ? ` (${p.matched.length} matches: ${p.matched.join(', ')})` : '';
  console.log(`${p.query} of ${p.symbol}${extra}: ${p.count}`);
  for (const r of p.results) console.log(`  ${r}`);
} else if (p.query === 'dependents') {
  const extra = p.matched.length > 1 ? ` (${p.matched.length} matches)` : '';
  console.log(`dependents of ${p.symbol}${extra}: ${p.count} (call ${p.byKind.call.length}, import ${p.byKind.import.length}, inherit ${p.byKind.inherit.length}, test ${p.byKind.test.length}, ref ${p.byKind.ref.length})`);
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
if (p.more) console.log(`  … +${p.more.remaining} more (rerun with --offset ${p.more.nextOffset})`);
if (p.stale) console.log(`  ⚠ graph is stale for ${p.stale.count}+ file(s) (${p.stale.files.slice(0, 3).join(', ')}…) — run codeweb_refresh`);
finish(code);
}
