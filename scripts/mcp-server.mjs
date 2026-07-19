#!/usr/bin/env node
// codeweb MCP server — stdio transport, newline-delimited JSON-RPC 2.0, zero-dependency. Exposes
// codeweb's structural queries as MCP tools an agent can call mid-task. Each tools/call shells out
// to the tested CLI artifact (what ships is what's tested).
//
// Agent-efficiency contract (the token flip):
//   - `graph` is OPTIONAL everywhere: explicit arg > CODEWEB_WS > nearest `.codeweb/graph.json`
//     walking up from cwd. A missing graph returns an ACTIONABLE error naming codeweb_map.
//   - Responses are BUDGETED by default: list-heavy tools get a per-tool default limit (top-N by
//     relevance + explicit `more.remaining`); pass `full: true` (or an explicit limit) to override.
//     A budgeted call answers in ~1-2k tokens where the old behavior could exceed an entire context.
//   - codeweb_map builds/rebuilds the graph so the loop never dead-ends on "graph not found".
//
// CRITICAL: stdout carries ONLY JSON-RPC messages (one per line). Any stray write to stdout
// corrupts the stream for the client, so all diagnostics go to stderr (here: none).

import { createInterface } from 'node:readline';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeGraph, buildIndex } from './lib/graph-ops.mjs';
import { runQuery } from './lib/query-core.mjs';
import { findSymbols } from './lib/find-core.mjs';
import { buildBrief } from './lib/brief-core.mjs';
import { bump, attachActivity } from './lib/stats.mjs';
import { checkStaleness } from './lib/cli.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const scriptOf = (f) => join(HERE, f);

// serverInfo.version derives from package.json at startup — the ONE version truth — so the MCP
// handshake can never drift from the shipped release again (it sat at 0.1.0 while the product was
// 0.2.0, uncaught because check-consistency didn't look here; it now does).
const PKG_VERSION = (() => {
  try { return JSON.parse(readFileSync(join(HERE, '..', 'package.json'), 'utf8')).version || '0.0.0'; }
  catch { return '0.0.0'; }
})();
const SERVER = { name: 'codeweb', version: PKG_VERSION };
// Protocol negotiation: echo a version we actually support; otherwise answer with our latest.
const PROTOCOLS = new Set(['2024-11-05', '2025-03-26', '2025-06-18']);
const DEFAULT_PROTOCOL = '2025-06-18';
const SPAWN_TIMEOUT_MS = 120_000; // a wedged child must not wedge the whole session

const INSTRUCTIONS = [
  'codeweb answers structural questions about a mapped repo (graph.json) deterministically — no LLM, ~100ms.',
  'Loop: BEFORE editing a symbol call codeweb_context (bounded edit window) or codeweb_impact (blast radius).',
  'AFTER editing call codeweb_refresh, then codeweb_diff (before vs after) to gate the edit.',
  'Before WRITING a new function call codeweb_find_similar (does this exist?) and codeweb_placement (where does it belong?).',
  'No symbol name yet? codeweb_find turns a concept ("retry backoff") into ranked starting symbols.',
  '`graph` is optional — the server finds the nearest .codeweb/graph.json from cwd. No graph yet? codeweb_map builds one (~3s for 3k symbols).',
  'Responses are budgeted (top-N + more.remaining). Pass full:true for the unabridged list, or limit/offset to page.',
].join('\n');

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });
const errResult = (id, text) => reply(id, { content: [{ type: 'text', text }], isError: true });

// ---- graph auto-discovery -------------------------------------------------------------------
// Explicit arg > CODEWEB_WS workspace > nearest `.codeweb/graph.json` walking up from cwd.
function discoverGraph() {
  if (process.env.CODEWEB_WS) {
    const p = join(process.env.CODEWEB_WS, 'graph.json');
    if (existsSync(p)) return p;
  }
  let dir = process.cwd();
  for (let i = 0; i < 40; i++) {
    const p = join(dir, '.codeweb', 'graph.json');
    if (existsSync(p)) return p;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}
const NO_GRAPH = 'no graph found — pass `graph`, or build one for this repo with the codeweb_map tool (or /codeweb). The graph lives at <target>/.codeweb/graph.json.';

// ---- persistent graph cache (in-process serving) ---------------------------------------------
// The stdio server lives for the whole session, so structural queries answer from a PARSED,
// INDEXED graph kept in memory — sub-ms after the first call instead of spawn+parse (~100ms)
// every time. Keyed by (path, mtime, size): a rebuilt/refreshed graph reloads transparently.
// The payloads come from the same lib/query-core.mjs the CLI ships — one truth, two transports.
const graphCache = new Map(); // abs path -> { m, s, graph, index }
function cachedGraph(absPath) {
  const st = statSync(absPath);
  const hit = graphCache.get(absPath);
  if (hit && hit.m === st.mtimeMs && hit.s === st.size) return hit;
  const graph = normalizeGraph(JSON.parse(readFileSync(absPath, 'utf8')));
  const entry = { m: st.mtimeMs, s: st.size, graph, index: buildIndex(graph) };
  graphCache.set(absPath, entry);
  if (graphCache.size > 8) graphCache.delete(graphCache.keys().next().value); // a session touches few graphs
  return entry;
}
const QUERY_KIND = { codeweb_callers: 'callers', codeweb_callees: 'callees', codeweb_tests: 'tests', codeweb_impact: 'impact', codeweb_cycles: 'cycles', codeweb_orphans: 'orphans' };

// ---- self-healing freshness -------------------------------------------------------------------
// Structural queries answered from a stale map are the trap an agent can't see; annotating helped,
// but the ambient fix is to REFRESH inline (incremental, ~1s) before answering. Scoped to the
// structural tools (refresh preserves domains but drops overlaps, so overlap-consuming advisors
// keep their input). Throttled per graph; CODEWEB_NO_AUTOREFRESH=1 disables; failure -> serve the
// stale answer WITH its stale annotation (never a dead end).
const AUTOREFRESH_TOOLS = new Set([...Object.keys(QUERY_KIND), 'codeweb_context', 'codeweb_explain', 'codeweb_find', 'codeweb_brief']);
const refreshAttempt = new Map(); // abs graph path -> last attempt ms
function autoRefresh(absGraph) {
  if (process.env.CODEWEB_NO_AUTOREFRESH === '1') return;
  try {
    const { graph } = cachedGraph(absGraph);
    if (!checkStaleness(graph)) return;
    const last = refreshAttempt.get(absGraph) || 0;
    if (Date.now() - last < 15_000) return; // one attempt per 15s per graph
    refreshAttempt.set(absGraph, Date.now());
    spawnSync(process.execPath, [scriptOf('refresh.mjs'), absGraph], { encoding: 'utf8', timeout: 60_000, maxBuffer: 1 << 24 });
    bump(absGraph, 'autoRefreshes');
    // the rewrite changed mtime/size — the next cachedGraph() reloads and serves fresh
  } catch { /* stale-but-annotated beats broken */ }
}

// ---- tool table ------------------------------------------------------------------------------
// need: required args (validated). opt: optional args (schema only). budget: {arg, flag, value} —
// when the caller passes neither that arg nor full:true, `flag value` is injected (default top-N).
// argv(a): CLI argv AFTER the graph path. bin defaults to query.mjs. input(a): child stdin.
const QUERY = scriptOf('query.mjs');
const TOOLS = [
  { name: 'codeweb_callers', need: ['symbol'], opt: ['graph', 'limit', 'offset', 'full'], budget: { arg: 'limit', flag: '--limit', value: 20 },
    argv: (a) => ['--callers', a.symbol],
    description: 'Direct callers (call-edge in-neighbors) of a symbol. Budgeted: top 20 by default (full:true for all).' },
  { name: 'codeweb_callees', need: ['symbol'], opt: ['graph', 'limit', 'offset', 'full'], budget: { arg: 'limit', flag: '--limit', value: 20 },
    argv: (a) => ['--callees', a.symbol],
    description: 'Direct callees (the functions a symbol calls). Budgeted: top 20 by default.' },
  { name: 'codeweb_impact', need: ['symbol'], opt: ['graph', 'limit', 'offset', 'full'], budget: { arg: 'limit', flag: '--limit', value: 20 },
    argv: (a) => ['--impact', a.symbol],
    description: 'Blast radius: every function transitively affected by changing a symbol, plus the domains touched. Call this BEFORE editing a symbol. Budgeted: summary + top 20 by fan-in (count is the true total; full:true for every id).' },
  { name: 'codeweb_cycles', need: [], opt: ['graph', 'limit', 'offset', 'full'], budget: { arg: 'limit', flag: '--limit', value: 15 },
    argv: () => ['--cycles'],
    description: 'File-level dependency cycles (circular imports/calls). Budgeted: top 15 by default.' },
  { name: 'codeweb_orphans', need: [], opt: ['graph', 'limit', 'offset', 'full'], budget: { arg: 'limit', flag: '--limit', value: 25 },
    argv: () => ['--orphans'],
    description: 'Uncalled and unexported symbols (dead-code candidates). Budgeted: top 25 by default; prefer codeweb_deadcode for a confidence-tiered plan.' },
  { name: 'codeweb_tests', need: ['symbol'], opt: ['graph', 'limit', 'offset', 'full'], budget: { arg: 'limit', flag: '--limit', value: 20 },
    argv: (a) => ['--tests', a.symbol],
    description: 'The tests that exercise a symbol (test-edge in-neighbors). Run the right subset after editing a symbol.' },
  { name: 'codeweb_diff', need: ['before', 'after'], opt: [], bin: scriptOf('diff.mjs'), graphless: true,
    argv: (a) => [a.before, a.after],
    description: 'Structural delta + regression verdict between two graph.json snapshots (before vs after an edit): nodes/edges/cycles/overlaps/orphans added & removed, coupling delta, and ok:false with reasons on a regression (new cycle, new duplication, a symbol that lost all callers). Call AFTER an edit to gate it.' },
  { name: 'codeweb_explain', need: ['symbol'], opt: ['graph'], bin: scriptOf('explain.mjs'),
    argv: (a) => [a.symbol],
    description: '"Tell me about X before I touch it" in ONE ~1KB card: identity, role, signature, complexity, fan-in/out, tests, blast radius + domains, top-5 callers/callees, and any duplication/pattern findings it belongs to. Start here; drill down with impact/context/callers.' },
  { name: 'codeweb_brief', need: [], opt: ['graph'], bin: scriptOf('brief.mjs'),
    argv: () => [],
    description: 'The day-one page for a mapped repo (~2KB): areas with summaries, the most depended-on symbols, entry points, test layout, and known issues (duplications/cycles/orphans). Call FIRST in a new session instead of exploring; then codeweb_find/explain to go deeper.' },
  { name: 'codeweb_find', need: ['query'], opt: ['graph', 'limit', 'offset', 'full'], budget: { arg: 'limit', flag: '--limit', value: 10 },
    bin: scriptOf('find.mjs'),
    argv: (a) => [a.query],
    description: 'Concept search when you do NOT know the symbol name: free text ("retry handling") -> ranked symbols (identifier/file/domain token match, stemmed, weighted by exports/role/fan-in). Deterministic, no embeddings. Start here when orienting; feed the top id to codeweb_explain.' },
  { name: 'codeweb_context', need: ['symbol'], opt: ['graph', 'limit', 'window', 'full'], budget: { arg: 'limit', flag: '--limit', value: 12 },
    bin: scriptOf('context-pack.mjs'),
    argv: (a) => [a.symbol, ...(a.full ? ['--full-bodies'] : []), ...(a.window != null ? ['--window', String(a.window)] : [])],
    description: 'Bounded edit window for a symbol in ONE call: its body, direct callers as CALL-SITE WINDOWS (±3 lines around each use — the lines that break if the contract changes), callees (location-only), and the impact set. Budgeted: 12 callers by default; full:true returns whole caller bodies (large).' },
  { name: 'codeweb_refresh', need: [], opt: ['graph'], bin: scriptOf('refresh.mjs'), argv: () => [],
    description: 'Re-extract the graph from disk (meta.root) so mid-task queries reflect your edits, not a stale snapshot. Incremental; preserves domains, drops stale overlaps. Call AFTER you edit source and BEFORE re-querying impact/callers/context.' },
  { name: 'codeweb_find_similar', need: [], opt: ['graph', 'signature', 'body', 'structural'], bin: scriptOf('find-similar.mjs'),
    valid: (a) => (a.signature || a.body) ? null : 'pass `signature` (a candidate signature) or `body` (a code snippet)',
    argv: (a) => a.body ? ['--stdin', ...(a.structural ? ['--structural'] : [])] : ['--signature', a.signature, ...(a.structural ? ['--structural'] : [])],
    input: (a) => a.body || undefined,
    description: 'Before writing a function, ask "does something already do this?": ranks existing bodies by similarity to a candidate `signature` or `body` snippet. structural:true matches identifier-renamed (Type-2) clones. Call to AVOID re-implementing existing logic.' },
  { name: 'codeweb_placement', need: ['calls'], opt: ['graph'], bin: scriptOf('placement.mjs'),
    argv: (a) => ['--calls', a.calls],
    description: 'Where a NEW symbol belongs: given the comma-separated ids/labels it will call, suggests the domain + file by callee gravity, and warns if it duplicates an existing symbol.' },
  { name: 'codeweb_review', need: ['changed'], opt: ['graph', 'before', 'gate', 'limit', 'full'], bin: scriptOf('review.mjs'),
    argv: (a) => ['--changed', a.changed, ...(a.before ? ['--before', a.before] : []), ...(a.gate ? ['--gate'] : [])],
    description: 'Structural review of a change: changed files (comma-separated, optionally file:start-end) -> changed symbols, blast radius, domains, fan-in-ranked review order. With `before` (a prior graph.json) + gate:true it FAILS on a structural regression — the full review gate, agent-reachable.' },
  { name: 'codeweb_fitness', need: ['rules'], opt: ['graph'], bin: scriptOf('fitness.mjs'),
    argv: (a) => ['--rules', a.rules],
    description: 'Check the graph against architectural fitness rules (codeweb.rules.json): forbidden-dependency, layering, no-cycles, max-fan-in, max-symbol-loc. Reports violations.' },
  { name: 'codeweb_risk', need: [], opt: ['graph', 'changed', 'limit', 'full'], budget: { arg: 'limit', flag: '--limit', value: 15 }, bin: scriptOf('risk.mjs'),
    argv: (a) => (a.changed ? ['--changed', a.changed] : []),
    description: 'Rank symbols by change-risk (fan-in, fan-out, loc, blast radius, churn); `changed` scopes to a comma-separated file list. Budgeted: top 15 by default.' },
  { name: 'codeweb_break_cycles', need: [], opt: ['graph', 'limit', 'full'], budget: { arg: 'limit', flag: '--limit', value: 10 }, bin: scriptOf('break-cycles.mjs'), argv: () => [],
    description: 'For each file dependency cycle, the cheapest dependency edge to sever — verified to actually break the cycle. Budgeted: top 10 cycles by default.' },
  { name: 'codeweb_deadcode', need: [], opt: ['graph', 'limit', 'full'], budget: { arg: 'limit', flag: '--limit', value: 20 }, bin: scriptOf('deadcode.mjs'), argv: () => [],
    description: 'Confidence-tiered dead-code: safe-to-delete vs review-first (test-guarded or entrypoint-like), each with its loc span. Budgeted: top 20 per tier by span (totals stay true; full:true for everything).' },
  { name: 'codeweb_codemod', need: ['merge', 'into'], opt: ['graph'], bin: scriptOf('codemod.mjs'),
    argv: (a) => ['--merge', a.merge, '--into', a.into],
    description: 'Plan a consolidation merge (report-only): canonical survivor, exact deletions + caller rewrites, LOC reclaimed, and the projected regression-gate verdict. Read-only — does NOT modify source.' },
  { name: 'codeweb_hotspots', need: [], opt: ['graph', 'limit', 'full'], budget: { arg: 'limit', flag: '--limit', value: 15 }, bin: scriptOf('hotspots.mjs'), argv: () => [],
    description: 'Rank symbols by refactoring priority (complexity x fan-in x churn): where to focus first. Budgeted: top 15 with raw components.' },
  { name: 'codeweb_campaign', need: [], opt: ['graph', 'budget', 'full'], budget: { arg: 'budget', flag: '--budget', value: 25 }, bin: scriptOf('campaign.mjs'), argv: () => [],
    description: 'One ordered, gated optimization worklist (dead-code deletes + verified cycle cuts + duplicate merges), pre-flighted so applying in order never introduces a cycle. Budgeted: top 25 ROI steps by default (`budget` N or full:true for the whole plan).' },
  { name: 'codeweb_reading_order', need: [], opt: ['graph', 'scope', 'value', 'budget'], bin: scriptOf('reading-order.mjs'),
    budget: { arg: 'budget', flag: '--budget', value: 20 },
    argv: (a) => (a.scope && a.value ? ['--scope', a.scope, a.value] : []),
    description: 'A foundations-first reading path (depended-upon leaves before orchestrators) to understand a codebase or one scope fast. scope: domain|file|symbol + value narrows it; budget bounds the list (default 20).' },
  { name: 'codeweb_map', need: [], opt: ['target', 'out'], graphless: true, map: true,
    description: 'Build (or rebuild) the codeweb graph for a repo: runs the deterministic pipeline (extract -> cluster -> overlap -> optimize -> report) into <target>/.codeweb. ~3s for a 3k-symbol repo. Call when a query reports "no graph found", or after large changes. Returns the graph path + stats; artifacts include report.html and graph.json.' },
];

const PROP = {
  graph: { type: 'string', description: 'Path to graph.json. OPTIONAL — defaults to CODEWEB_WS or the nearest .codeweb/graph.json above cwd' },
  symbol: { type: 'string', description: 'A node id (file:label) or a bare label' },
  query: { type: 'string', description: 'Free-text concept ("retry backoff", "where is config parsed") — no symbol name needed' },
  before: { type: 'string', description: 'Path to the BEFORE graph.json snapshot' },
  after: { type: 'string', description: 'Path to the AFTER graph.json snapshot' },
  signature: { type: 'string', description: 'A candidate function signature to check for existing implementations' },
  body: { type: 'string', description: 'A candidate code snippet (function body) to check for existing implementations' },
  structural: { type: 'boolean', description: 'Match identifier-normalized skeletons (catches renamed/Type-2 clones)' },
  calls: { type: 'string', description: 'Comma-separated ids/labels the new symbol will call (its intended callees)' },
  changed: { type: 'string', description: 'Comma-separated changed files, each optionally file:start-end (whole file if no range)' },
  rules: { type: 'string', description: 'Path to a codeweb.rules.json fitness-rules file' },
  merge: { type: 'string', description: 'Comma-separated symbol ids/labels to consolidate (merge)' },
  into: { type: 'string', description: 'The id/label to keep as the canonical survivor of the merge' },
  gate: { type: 'boolean', description: 'Fail (isError-style exit) on a structural regression vs `before`' },
  limit: { type: 'number', description: 'Max items to return (each tool has a sensible default; full:true disables)' },
  offset: { type: 'number', description: 'Skip N items (page through a budgeted list via more.nextOffset)' },
  full: { type: 'boolean', description: 'Return the unabridged result (disables the default budget). Large on big repos.' },
  window: { type: 'number', description: 'Context lines around each call site (default 3)' },
  scope: { type: 'string', description: 'Scope kind: domain | file | symbol' },
  value: { type: 'string', description: 'The scope value (domain name, file path, or symbol)' },
  budget: { type: 'number', description: 'Max steps/symbols to return' },
  target: { type: 'string', description: 'Repo/subdir to map (default: the server cwd)' },
  out: { type: 'string', description: 'Output workspace (default: <target>/.codeweb)' },
};
const schema = (t) => ({
  type: 'object',
  properties: Object.fromEntries([...t.need, ...(t.opt || [])].map((k) => [k, PROP[k]])),
  required: t.need,
});

// ---- codeweb_map -----------------------------------------------------------------------------
function handleMap(id, args) {
  const target = resolve(args.target || process.cwd());
  if (!existsSync(target)) return errResult(id, `target not found: ${target}`);
  const out = resolve(args.out || join(target, '.codeweb'));
  const r = spawnSync(process.execPath, [scriptOf('run.mjs'), target, '--out-dir', out], { encoding: 'utf8', maxBuffer: 1 << 28, timeout: 300_000 });
  if (r.status !== 0) {
    return errResult(id, `codeweb_map failed (exit ${r.status}): ${(r.stderr || '').trim().split('\n').slice(-3).join('\n')}`);
  }
  const graphPath = join(out, 'graph.json');
  let stats = '';
  try {
    const g = JSON.parse(readFileSync(graphPath, 'utf8'));
    stats = `${(g.nodes || []).length} symbols, ${(g.edges || []).length} edges, ${(g.domains || []).length} domains, ${(g.overlaps || []).length} overlap findings`;
  } catch { stats = 'built (stats unreadable)'; }
  return reply(id, { content: [{ type: 'text', text: JSON.stringify({ ok: true, graph: graphPath, summary: `mapped ${target}: ${stats}`, artifacts: { report: join(out, 'report.html'), optimize: join(out, 'optimize.md') } }) }] });
}

// ---- tools/call ------------------------------------------------------------------------------
function handleToolCall(id, params) {
  const name = params && params.name;
  const args = (params && params.arguments) || {};
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return fail(id, -32602, `unknown tool: ${name}`);
  for (const k of tool.need) {
    if (typeof args[k] !== 'string' || args[k] === '') {
      return errResult(id, `missing required argument: ${k}`);
    }
  }
  if (tool.valid) { const problem = tool.valid(args); if (problem) return errResult(id, problem); }
  if (tool.map) return handleMap(id, args);

  const cliArgs = [];
  let graphPath = null;
  if (!tool.graphless) {
    graphPath = args.graph || discoverGraph();
    if (!graphPath) return errResult(id, NO_GRAPH);
    cliArgs.push(graphPath);
  }

  if (graphPath) bump(resolve(graphPath), 'queriesServed'); // the receipt's denominator
  if (graphPath && AUTOREFRESH_TOOLS.has(tool.name)) autoRefresh(resolve(graphPath));

  // Fast path: the briefing assembles in-process from the cached graph (same object as the CLI
  // via brief-core). Any surprise falls back to the spawned artifact.
  if (tool.name === 'codeweb_brief') {
    try {
      const { graph, index } = cachedGraph(resolve(graphPath));
      const payload = attachActivity(buildBrief(graph, index), resolve(graphPath));
      const stale = checkStaleness(graph);
      if (stale) payload.stale = stale;
      return reply(id, { content: [{ type: 'text', text: JSON.stringify(payload) }] });
    } catch { /* fall through to the spawned artifact */ }
  }
  // Fast path: concept search answers in-process from the cached graph (same ranking as the CLI
  // via find-core; budget applied identically). Any surprise falls back to the spawned artifact.
  if (tool.name === 'codeweb_find') {
    try {
      const { graph, index } = cachedGraph(resolve(graphPath));
      const { qtoks, results } = findSymbols(graph, index, String(args.query || ''));
      if (qtoks.length) {
        const limit = args.limit != null ? Number(args.limit) : (args.full ? Infinity : tool.budget.value);
        const offset = args.offset != null ? Math.max(0, Number(args.offset)) : 0;
        const items = results.slice(offset, Number.isFinite(limit) ? offset + limit : undefined);
        const domains = [...new Set(results.map((r) => r.domain))];
        const payload = {
          query: args.query, terms: qtoks,
          summary: `"${args.query}": ${results.length} match(es) across ${domains.length} domain(s)${results.length ? ` — top: ${results[0].id}` : ''}`,
          results: items, count: results.length, domains: domains.slice(0, 8),
        };
        const remaining = results.length - offset - items.length;
        if (remaining > 0) payload.more = { remaining, nextOffset: offset + items.length };
        const stale = checkStaleness(graph);
        if (stale) { payload.stale = stale; payload.summary += ` — graph is stale for ${stale.count}+ file(s); run codeweb_refresh`; }
        return reply(id, { content: [{ type: 'text', text: JSON.stringify(payload) }] });
      }
    } catch { /* fall through to the spawned artifact */ }
  }
  // Fast path: structural queries answer in-process from the cached graph (same payloads as the
  // CLI via query-core). Any surprise falls back to the spawned, tested artifact.
  const qkind = QUERY_KIND[tool.name];
  if (qkind) {
    try {
      const { graph, index } = cachedGraph(resolve(graphPath));
      const limit = args.limit != null ? Number(args.limit) : (args.full ? null : tool.budget.value);
      const offset = args.offset != null ? Number(args.offset) : 0;
      const { payload, code } = runQuery(graph, index, { query: qkind, symbol: args.symbol, limit, offset });
      if (code === 0 || payload) {
        const stale = payload.found === false ? null : checkStaleness(graph);
        if (stale) {
          payload.stale = stale;
          if (payload.summary) payload.summary += ` — graph is stale for ${stale.count}+ file(s); run codeweb_refresh`;
        }
        return reply(id, { content: [{ type: 'text', text: JSON.stringify(payload) }] });
      }
    } catch { /* fall through to the spawned artifact */ }
  }
  cliArgs.push(...tool.argv(args));
  // budget injection: default top-N unless the caller set the budget arg explicitly or asked full
  if (tool.budget) {
    const explicit = args[tool.budget.arg];
    if (explicit != null) cliArgs.push(tool.budget.flag, String(explicit));
    else if (!args.full) cliArgs.push(tool.budget.flag, String(tool.budget.value));
    if (args.offset != null && (tool.opt || []).includes('offset')) cliArgs.push('--offset', String(args.offset));
  }
  const bin = tool.bin || QUERY;
  const r = spawnSync(process.execPath, [bin, ...cliArgs, '--json'], { encoding: 'utf8', maxBuffer: 1 << 28, timeout: SPAWN_TIMEOUT_MS, input: tool.input ? tool.input(args) : undefined });
  if (r.error && r.error.code === 'ETIMEDOUT') return errResult(id, `tool timed out after ${SPAWN_TIMEOUT_MS / 1000}s`);
  if (r.status === 2 || r.error) {
    const text = (r.stderr || (r.error && r.error.message) || 'query failed').trim();
    // the CLIs' graph-not-found message gains the MCP-native next step
    return errResult(id, /graph not found/.test(text) ? `${text}\n${NO_GRAPH}` : text);
  }
  // exit 0 (results) or 1 (found:false / gate-fail) both emit valid JSON on stdout — pass through.
  return reply(id, { content: [{ type: 'text', text: (r.stdout || '').trim() }] });
}

function handle(line) {
  const s = line.trim();
  if (!s) return;
  let msg;
  try { msg = JSON.parse(s); } catch { return fail(null, -32700, 'Parse error'); }
  const { id, method, params } = msg;
  if (id === undefined || id === null) return; // JSON-RPC notification: never responded to
  if (method === 'initialize') {
    const wanted = params && params.protocolVersion;
    return reply(id, {
      protocolVersion: PROTOCOLS.has(wanted) ? wanted : DEFAULT_PROTOCOL,
      capabilities: { tools: {} },
      serverInfo: SERVER,
      instructions: INSTRUCTIONS,
    });
  }
  if (method === 'ping') return reply(id, {});
  if (method === 'tools/list') return reply(id, { tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: schema(t) })) });
  if (method === 'tools/call') return handleToolCall(id, params);
  return fail(id, -32601, `method not found: ${method}`);
}

const rl = createInterface({ input: process.stdin });
rl.on('line', handle);
rl.on('close', () => process.exit(0));
