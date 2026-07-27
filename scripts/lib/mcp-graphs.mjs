// The MCP server's graph serving state, extracted whole in D2's split: auto-discovery (which
// graph a call means), the persistent parsed-graph cache, and the per-burst staleness memo.
// Pure of protocol concerns — the server composes these with its queue and dispatch.

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeGraph, buildIndex } from './graph-ops.mjs';
import { checkStaleness, nearestWorkspace } from './cli.mjs';

// ---- graph auto-discovery ----------------------------------------------------------------
// Explicit arg > CODEWEB_WS workspace > nearest `.codeweb/graph.json` walking up from cwd
// (nearestWorkspace — THE walk, lib/cli.mjs).
export function discoverGraph() {
  if (process.env.CODEWEB_WS) {
    const p = join(process.env.CODEWEB_WS, 'graph.json');
    if (existsSync(p)) return p;
  }
  return nearestWorkspace(process.cwd())?.path || null;
}
export const NO_GRAPH = 'no graph found — pass `graph`, or build one for this repo with the codeweb_map tool (or /codeweb). The graph lives at <target>/.codeweb/graph.json.';
// RETENTION R11a: the unsupported-language marker codeweb_map leaves on a no-source failure —
// checked wherever NO_GRAPH would fire, so repeat sessions get routed instead of re-walled.
export function discoverUnsupported() {
  if (process.env.CODEWEB_WS) {
    const p = join(process.env.CODEWEB_WS, 'unsupported.json');
    if (existsSync(p)) return p;
  }
  return nearestWorkspace(process.cwd(), 'unsupported.json')?.path || null;
}

// ---- persistent graph cache (in-process serving) -------------------------------------------
// The stdio server lives for the whole session, so structural queries answer from a PARSED,
// INDEXED graph kept in memory — sub-ms after the first call instead of spawn+parse (~100ms)
// every time. Keyed by (path, mtime, size): a rebuilt/refreshed graph reloads transparently.
// The payloads come from the same lib/query-core.mjs the CLI ships — one truth, two transports.
const graphCache = new Map(); // abs path -> { m, s, graph, index }
export function cachedGraph(absPath) {
  const st = statSync(absPath);
  const hit = graphCache.get(absPath);
  if (hit && hit.m === st.mtimeMs && hit.s === st.size) return hit;
  const graph = normalizeGraph(JSON.parse(readFileSync(absPath, 'utf8')));
  const entry = { m: st.mtimeMs, s: st.size, graph, index: buildIndex(graph) };
  graphCache.set(absPath, entry);
  if (graphCache.size > 8) graphCache.delete(graphCache.keys().next().value); // a session touches few graphs
  return entry;
}

// finding 23: ONE staleness verdict per request burst. autoRefresh stat-swept every meta.sources
// entry and the payload's stale annotation swept them all AGAIN — 2 x 12-17ms at 5k files against
// answers that take 3-13ms. Memoized per (path, graph identity) with a 1s TTL: one sweep per
// burst, and a refreshed graph (new mtime/size) re-checks immediately.
const staleCache = new Map(); // abs -> { atMs, m, s, verdict }
export function staleOnce(absPath, entry) {
  const hit = staleCache.get(absPath);
  if (hit && hit.m === entry.m && hit.s === entry.s && Date.now() - hit.atMs < 1000) return hit.verdict;
  const verdict = checkStaleness(entry.graph);
  staleCache.set(absPath, { atMs: Date.now(), m: entry.m, s: entry.s, verdict });
  return verdict;
}
