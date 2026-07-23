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

import { buildIndex } from './lib/graph-ops.mjs';
import { runQuery } from './lib/query-core.mjs'; // payload assembly lives once (CLI + in-process MCP)

const USAGE = `usage: query.mjs [graph.json] <--callers|--callees|--tests|--dependents|--impact <symbol> | --cycles | --orphans> [--limit N] [--offset N] [--json]`;
import { die, emitJson, finish, capList, checkStaleness, loadGraph, parseArgs } from './lib/cli.mjs';
import { bump } from './lib/stats.mjs'; // #10: CLI queries count toward the receipt too

// finding 24: THE flag loop (lib/cli.mjs parseArgs); the query-mode flags stay a thin post-pass —
// exactly one of the mode flags must be present, and a symbol-taking mode needs a real symbol
// (a missing value dies in parseArgs; an empty/flag-shaped one dies here, as before).
const { opts: f, pos } = parseArgs(process.argv.slice(2), {
  usage: USAGE,
  flags: {
    json: { type: 'bool', default: false },
    limit: { type: 'number', default: null, min: 0 },  // F14c: a negative limit minted empty pages
    offset: { type: 'number', default: 0, min: 0 },
    callers: { type: 'string', default: null },
    callees: { type: 'string', default: null },
    tests: { type: 'string', default: null },
    dependents: { type: 'string', default: null },
    impact: { type: 'string', default: null },
    cycles: { type: 'bool', default: false },
    orphans: { type: 'bool', default: false },
  },
});
const opts = { graph: pos[0] ?? null, json: f.json, limit: f.limit, offset: Math.max(0, f.offset), query: null, symbol: undefined, queries: 0 };
for (const q of ['callers', 'callees', 'tests', 'dependents', 'impact']) if (f[q] != null) { opts.query = q; opts.symbol = f[q]; opts.queries++; }
for (const q of ['cycles', 'orphans']) if (f[q]) { opts.query = q; opts.queries++; }
if (opts.queries !== 1 || (opts.symbol !== undefined && (!opts.symbol || opts.symbol.startsWith('-')))) die(USAGE, 2);

// #5: one loader (arg -> CODEWEB_WS -> nearest .codeweb above cwd), one error message, one
// normalization — the hand-rolled copy this replaced was the dogfood finding, applied here.
const { graph, abs } = loadGraph(opts.graph, { usage: USAGE });
const index = buildIndex(graph);

const { payload, code } = runQuery(graph, index, { query: opts.query, symbol: opts.symbol, limit: opts.limit, offset: opts.offset });
if (payload && payload.found !== false) bump(abs, 'queriesServed');

// awareness: annotate (never block) when the graph no longer matches disk
const staleInfo = checkStaleness(graph);
if (staleInfo && payload && payload.found !== false) {
  payload.stale = staleInfo;
  if (payload.summary) payload.summary += ` — graph is stale for ${staleInfo.count}+ file(s); run codeweb_refresh`;
}

if (opts.json) { emitJson(payload, code); } else {

if (payload.found === false) {
  // #2: surface the payload's near-matches + next step on the text transport too.
  const near = payload.suggestions?.length ? ` — near matches: ${payload.suggestions.join(', ')}` : '';
  die(`symbol not found: ${opts.symbol}${near} (concept search: find.mjs "<free text>")`, 1);
}
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
