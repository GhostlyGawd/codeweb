#!/usr/bin/env node
// codeweb find — concept search: turn an idea ("retry handling", "where is config parsed")
// into ranked symbols, deterministically. The one query family that doesn't need a name.
//
//   node scripts/find.mjs <graph.json> <query words...> [--limit 10] [--offset N] [--json]
//
// Ranking: identifier/file/domain token match (camelCase & snake_case split, light stemming)
// weighted by exports, role (product first — unless the query asks for tests), and fan-in.
// Output is budgeted (top-N + true total + more.remaining), staleness-annotated like query.mjs.

import { die, emitJson, emitText, loadGraph, capList, checkStaleness, parseArgs } from './lib/cli.mjs';
import { buildIndex } from './lib/graph-ops.mjs';
import { findSymbols } from './lib/find-core.mjs';

const USAGE = 'usage: find.mjs <graph.json> <query words...> [--limit 10] [--offset N] [--full] [--json]'; // F10: --full was real but hidden
// finding 24: THE flag loop (lib/cli.mjs parseArgs) — one unknown-flag policy, --help included.
const { opts, pos } = parseArgs(process.argv.slice(2), {
  usage: USAGE,
  flags: {
    json: { type: 'bool', default: false },
    limit: { type: 'number', default: 10, min: 0 },  // F14c: a negative limit minted empty pages
    offset: { type: 'number', default: 0, min: 0 },
    full: { type: 'bool', default: false }, // everything (capList treats a null limit as "no cap")
  },
});
const { json, offset } = opts, limit = opts.full ? NaN : opts.limit;
const { graph } = loadGraph(pos[0], { usage: USAGE });
const query = pos.slice(1).join(' ').trim();
if (!query) die(USAGE, 2);

const index = buildIndex(graph);
const { qtoks, results } = findSymbols(graph, index, query);
if (!qtoks.length) die(`query "${query}" has no searchable terms after stopwords`, 2);

const c = capList(results, Number.isFinite(limit) ? limit : null, offset);
const domains = [...new Set(results.map((r) => r.domain))];
const payload = {
  query, terms: qtoks,
  summary: `"${query}": ${results.length} match(es) across ${domains.length} domain(s)${results.length ? ` — top: ${results[0].id}` : ''}`,
  results: c.items, count: results.length, domains: domains.slice(0, 8),
};
if (c.remaining > 0) payload.more = { remaining: c.remaining, nextOffset: c.offset + c.items.length };
const stale = checkStaleness(graph);
if (stale) { payload.stale = stale; payload.summary += ` — graph is stale for ${stale.count}+ file(s); run codeweb_refresh`; }

if (json) { emitJson(payload); } else {
  const L = [payload.summary];
  for (const r of c.items) L.push(`  ${String(r.score).padStart(6)}  ${r.label}  (${r.kind}${r.role !== 'product' ? `, ${r.role}` : ''})  ${r.file}:${r.line}  [${r.domain}]  ${r.match}`);
  if (payload.more) L.push(`  …+${payload.more.remaining} more (--offset ${payload.more.nextOffset})`);
  emitText(L.join('\n'));
}
