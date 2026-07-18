// codeweb query core — the payload assembly behind query.mjs, extracted so the MCP server can
// answer structural queries IN-PROCESS against a cached parsed graph (sub-ms after the first call)
// while the CLI keeps shipping the exact same payloads (one truth, two transports).
// Pure over (graph, index): no I/O, no process, no exit codes — callers own those.

import { buildIndex, resolveSymbol, callersOf, calleesOf, testersOf, importersOf, refsOf, dependentsOf, impactOf, fileCycles, orphans } from './graph-ops.mjs';
import { capList } from './cli.mjs';

// Budgeted list cap: `count` stays the TRUE total, `more` describes the remainder (absent when
// nothing was cut).
function budget(payload, field, limit, offset) {
  if (limit == null && !offset) return payload;
  const c = capList(payload[field], limit, offset);
  payload[field] = c.items;
  if (c.remaining > 0) payload.more = { remaining: c.remaining, nextOffset: c.offset + c.items.length };
  return payload;
}

/**
 * Run one structural query. opts: { query, symbol, limit, offset }.
 * Returns { payload, code } — code 1 = symbol not found (payload carries found:false).
 */
export function runQuery(graph, index, opts) {
  const { query, symbol, limit = null, offset = 0 } = opts;
  index = index || buildIndex(graph);
  let payload, code = 0;
  if (query === 'callers' || query === 'callees' || query === 'tests') {
    const matched = resolveSymbol(graph, symbol);
    if (!matched.length) { payload = { query, symbol, found: false }; code = 1; }
    else {
      const results = query === 'callers' ? callersOf(index, matched) : query === 'callees' ? calleesOf(index, matched) : testersOf(index, matched);
      payload = budget({ query, symbol, summary: `${results.length} ${query === 'tests' ? 'test(s) exercise' : query + ' of'} ${symbol}`, matched, results, count: results.length }, 'results', limit, offset);
    }
  } else if (query === 'dependents') {
    const matched = resolveSymbol(graph, symbol);
    if (!matched.length) { payload = { query: 'dependents', symbol, found: false }; code = 1; }
    else {
      const results = dependentsOf(index, matched);
      const inheritIn = [...new Set(matched.flatMap((id) => [...(index.inheritIn.get(id) || [])]))].sort();
      const byKind = { call: callersOf(index, matched), import: importersOf(index, matched), inherit: inheritIn, test: testersOf(index, matched), ref: refsOf(index, matched) };
      const kindCounts = Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, v.length]));
      // under a budget, byKind collapses to counts (the full per-kind lists are the bulk of the payload)
      payload = { query: 'dependents', symbol, summary: `${results.length} dependent(s) of ${symbol} (${Object.entries(kindCounts).map(([k, v]) => `${k} ${v}`).join(', ')})`, matched, results, byKind: limit != null ? kindCounts : byKind, count: results.length };
      budget(payload, 'results', limit, offset);
    }
  } else if (query === 'impact') {
    const matched = resolveSymbol(graph, symbol);
    if (!matched.length) { payload = { query: 'impact', symbol, found: false }; code = 1; }
    else {
      const results = impactOf(index, matched);
      const domains = [...new Set(results.map((id) => index.byId.get(id)?.domain || 'unassigned'))].sort();
      // under a budget, rank the surviving ids by fan-in — top-N must be the most RELEVANT N.
      const ranked = limit != null
        ? results.slice().sort((a, b) => (index.callIn.get(b)?.size || 0) - (index.callIn.get(a)?.size || 0) || (a < b ? -1 : 1))
        : results;
      payload = budget({ query: 'impact', symbol, summary: `editing ${symbol} touches ${results.length} function(s) across ${domains.length} domain(s)`, matched, results: ranked, domains, count: results.length }, 'results', limit, offset);
    }
  } else if (query === 'cycles') {
    const cycles = fileCycles(graph);
    payload = budget({ query: 'cycles', summary: `${cycles.length} file-level dependency cycle(s)`, cycles, count: cycles.length }, 'cycles', limit, offset);
  } else if (query === 'orphans') {
    const results = orphans(graph, index);
    payload = budget({ query: 'orphans', summary: `${results.length} orphan(s) — no callers and not exported`, results, count: results.length }, 'results', limit, offset);
  }
  return { payload, code };
}
