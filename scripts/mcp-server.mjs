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
import { spawnSync, spawn } from 'node:child_process';
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
  'Before a refactor, codeweb_simulate pre-flights a delete/merge/move; after verifying a finding is wrong, codeweb_annotate suppresses it so it stops resurfacing.',
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
const refreshInFlight = new Set();
function autoRefresh(absGraph) {
  if (process.env.CODEWEB_NO_AUTOREFRESH === '1') return;
  try {
    const { graph } = cachedGraph(absGraph);
    if (!checkStaleness(graph)) return;
    const last = refreshAttempt.get(absGraph) || 0;
    if (Date.now() - last < 15_000 || refreshInFlight.has(absGraph)) return; // one attempt per 15s per graph
    refreshAttempt.set(absGraph, Date.now());
    refreshInFlight.add(absGraph);
    // finding 19: fire-and-forget — the CURRENT call serves its stale-but-ANNOTATED answer
    // immediately (the standing philosophy: stale-but-annotated beats broken) instead of stalling
    // this call AND every queued request behind an inline synchronous refresh (807ms measured on
    // a one-file touch; a 4–28s stall at the 16k benchmark). The refresh writes atomically, so
    // the next cachedGraph() reloads and serves fresh.
    pendingAsync++;
    let settled = false;
    const child = spawn(process.execPath, [scriptOf('refresh.mjs'), absGraph], { stdio: 'ignore' });
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* raced exit */ } }, 60_000);
    const done = (ok) => { if (settled) return; settled = true; clearTimeout(timer); refreshInFlight.delete(absGraph); if (ok) { try { bump(absGraph, 'autoRefreshes'); } catch { /* receipt only */ } } asyncDone(); };
    child.on('error', () => done(false));
    child.on('close', (code) => done(code === 0));
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
  { name: 'codeweb_risk', need: [], opt: ['graph', 'changed', 'limit', 'full', 'all'], budget: { arg: 'limit', flag: '--limit', value: 15 }, bin: scriptOf('risk.mjs'),
    argv: (a) => [...(a.changed ? ['--changed', a.changed] : []), ...(a.all ? ['--all'] : [])],
    description: 'Rank symbols by change-risk (fan-in, fan-out, loc, blast radius, churn); `changed` scopes to a comma-separated file list. Budgeted: top 15 by default.' },
  { name: 'codeweb_break_cycles', need: [], opt: ['graph', 'limit', 'full'], budget: { arg: 'limit', flag: '--limit', value: 10 }, bin: scriptOf('break-cycles.mjs'), argv: () => [],
    description: 'For each file dependency cycle, the cheapest dependency edge to sever — verified to actually break the cycle. Budgeted: top 10 cycles by default.' },
  { name: 'codeweb_deadcode', need: [], opt: ['graph', 'limit', 'full', 'all'], budget: { arg: 'limit', flag: '--limit', value: 20 }, bin: scriptOf('deadcode.mjs'), argv: (a) => (a.all ? ['--all'] : []),
    description: 'Confidence-tiered dead-code: safe-to-delete vs review-first (test-guarded or entrypoint-like), each with its loc span. Budgeted: top 20 per tier by span (totals stay true; full:true for everything).' },
  { name: 'codeweb_codemod', need: ['merge', 'into'], opt: ['graph'], bin: scriptOf('codemod.mjs'),
    argv: (a) => ['--merge', a.merge, '--into', a.into],
    description: 'Plan a consolidation merge (report-only): canonical survivor, exact deletions + caller rewrites, LOC reclaimed, and the projected regression-gate verdict. Read-only — does NOT modify source.' },
  { name: 'codeweb_hotspots', need: [], opt: ['graph', 'limit', 'full', 'all'], budget: { arg: 'limit', flag: '--limit', value: 15 }, bin: scriptOf('hotspots.mjs'), argv: (a) => (a.all ? ['--all'] : []),
    description: 'Rank symbols by refactoring priority (complexity x fan-in x churn): where to focus first. Budgeted: top 15 with raw components.' },
  { name: 'codeweb_campaign', need: [], opt: ['graph', 'budget', 'full', 'all'], budget: { arg: 'budget', flag: '--budget', value: 25 }, bin: scriptOf('campaign.mjs'), argv: (a) => (a.all ? ['--all'] : []),
    description: 'One ordered, gated optimization worklist (dead-code deletes + verified cycle cuts + duplicate merges), pre-flighted so applying in order never introduces a cycle. Budgeted: top 25 ROI steps by default (`budget` N or full:true for the whole plan).' },
  { name: 'codeweb_reading_order', need: [], opt: ['graph', 'scope', 'value', 'budget'], bin: scriptOf('reading-order.mjs'),
    budget: { arg: 'budget', flag: '--budget', value: 20 },
    argv: (a) => (a.scope && a.value ? ['--scope', a.scope, a.value] : []),
    description: 'A foundations-first reading path (depended-upon leaves before orchestrators) to understand a codebase or one scope fast. scope: domain|file|symbol + value narrows it; budget bounds the list (default 20).' },
  { name: 'codeweb_simulate', need: [], opt: ['graph', 'delete', 'merge', 'into', 'move', 'to'], bin: scriptOf('simulate-edit.mjs'),
    valid: (a) => {
      const modes = ['delete', 'merge', 'move'].filter((k) => a[k]);
      if (modes.length !== 1) return 'pass exactly one of `delete` (symbol), `merge` (id1,id2,…), or `move` (symbol, with `to`: target file)';
      if (a.move && !a.to) return '`move` needs `to` (the destination file)';
      return null;
    },
    argv: (a) => a.delete ? ['--delete', a.delete] : a.merge ? ['--merge', a.merge, ...(a.into ? ['--into', a.into] : [])] : ['--move', a.move, '--to', a.to],
    description: 'PRE-FLIGHT an edit without performing it: predicts the regression gate\'s structural verdict ({newCycles, lostCallers, ok}) for a hypothetical delete / merge / move. Call BEFORE committing to a refactor plan — a doomed edit is discarded for the cost of one call.' },
  { name: 'codeweb_annotate', need: [], opt: ['graph', 'suppress', 'note', 'list'], bin: scriptOf('annotate.mjs'), dirFromGraph: true,
    valid: (a) => (a.suppress || a.list) ? null : 'pass `suppress` (a finding fingerprint, from codeweb_deadcode/overlap output) or list:true',
    argv: (a) => a.list ? ['--list'] : ['--suppress', a.suppress, ...(a.note ? ['--note', a.note] : [])],
    description: 'Record a FALSE-POSITIVE suppression for a finding (never touches source — writes .codeweb/annotations.json): after you verify a deadcode/duplication finding is wrong, suppress its fingerprint so it stops resurfacing; the finding count reports suppressed separately. list:true shows current suppressions.' },
  { name: 'codeweb_stats', need: [], opt: ['graph'], bin: scriptOf('stats.mjs'), argv: () => [],
    description: 'The local value receipt: what codeweb actually did in this workspace (pre-edit cards, regressions flagged before landing, queries served), month by month plus lifetime. Local-only counters; nothing leaves the machine.' },
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
  all: { type: 'boolean', description: 'Include non-product roles (tests/fixtures/bench/generated) in the ranking; default is product scope with a counted exclusion' },
  delete: { type: 'string', description: 'Symbol id/label to hypothetically delete' },
  move: { type: 'string', description: 'Symbol id/label to hypothetically move' },
  to: { type: 'string', description: 'Destination file for a hypothetical move' },
  suppress: { type: 'string', description: 'The finding fingerprint to suppress (from deadcode/overlap output)' },
  note: { type: 'string', description: 'Why this finding is a false positive (stored with the suppression)' },
  list: { type: 'boolean', description: 'List current suppressions instead of adding one' },
};
const schema = (t) => ({
  type: 'object',
  properties: Object.fromEntries([...t.need, ...(t.opt || [])].map((k) => [k, PROP[k]])),
  required: t.need,
});

// ---- codeweb_map -----------------------------------------------------------------------------
// #11: async with PROGRESS — a big first map used to be a silent black box for its whole
// duration. When the client sends a progressToken (params._meta), each pipeline stage line
// becomes a notifications/progress; the reply lands when the child exits. Other requests keep
// being served meanwhile (JSON-RPC responses may arrive out of order).
const MAP_STAGES = ['extract', 'cluster', 'overlap', 'optimize', 'report'];
// stdin close used to exit(0) immediately; with map now ASYNC that would kill an in-flight
// pipeline (spawnSync clients like the test harness close stdin right after writing). Track
// pending async work and drain it before exiting.
let pendingAsync = 0;
let stdinClosed = false;
const asyncDone = () => { pendingAsync--; if (stdinClosed && pendingAsync <= 0) process.exit(0); };
const spawnQueues = new Map(); // finding 19: workspace key -> tail promise (per-graph child serialization)
function handleMap(id, args, meta) {
  const target = resolve(args.target || process.cwd());
  if (!existsSync(target)) return errResult(id, `target not found: ${target}`);
  const out = resolve(args.out || join(target, '.codeweb'));
  const token = meta && meta.progressToken;
  pendingAsync++;
  const child = spawn(process.execPath, [scriptOf('run.mjs'), target, '--out-dir', out], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderrBuf = '';
  child.stderr.on('data', (d) => {
    stderrBuf += d;
    if (stderrBuf.length > 65536) stderrBuf = stderrBuf.slice(-32768);
    if (token === undefined || token === null) return;
    for (const line of String(d).split('\n')) {
      const m = /^\[run\] ([a-z-]+)$/.exec(line.trim());
      if (m && MAP_STAGES.includes(m[1])) {
        send({ jsonrpc: '2.0', method: 'notifications/progress', params: { progressToken: token, progress: MAP_STAGES.indexOf(m[1]), total: MAP_STAGES.length, message: `stage: ${m[1]}` } });
      }
    }
  });
  const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* raced exit */ } }, 300_000);
  child.on('error', (e) => { clearTimeout(timer); errResult(id, `codeweb_map failed: ${e.message}`); asyncDone(); });
  child.on('close', (code) => {
    clearTimeout(timer);
    if (code !== 0) {
      errResult(id, `codeweb_map failed (exit ${code}): ${stderrBuf.trim().split('\n').slice(-3).join('\n')}`);
      return asyncDone();
    }
    if (token !== undefined && token !== null) send({ jsonrpc: '2.0', method: 'notifications/progress', params: { progressToken: token, progress: MAP_STAGES.length, total: MAP_STAGES.length, message: 'done' } });
    const graphPath = join(out, 'graph.json');
    let stats = '';
    try {
      const g = JSON.parse(readFileSync(graphPath, 'utf8'));
      stats = `${(g.nodes || []).length} symbols, ${(g.edges || []).length} edges, ${(g.domains || []).length} domains, ${(g.overlaps || []).length} overlap findings`;
    } catch { stats = 'built (stats unreadable)'; }
    reply(id, { content: [{ type: 'text', text: JSON.stringify({ ok: true, graph: graphPath, summary: `mapped ${target}: ${stats}`, artifacts: { report: join(out, 'report.html'), optimize: join(out, 'optimize.md') } }) }] });
    asyncDone();
  });
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
  if (tool.map) return handleMap(id, args, params && params._meta);

  const cliArgs = [];
  let graphPath = null;
  if (!tool.graphless) {
    graphPath = args.graph || discoverGraph();
    if (!graphPath) return errResult(id, NO_GRAPH);
    // #11: annotate's CLI addresses the WORKSPACE (--dir beside the graph), not the graph file.
    if (tool.dirFromGraph) cliArgs.push('--dir', dirname(resolve(graphPath)));
    else cliArgs.push(graphPath);
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
  // finding 19: children are ASYNC — the handleMap pattern, generalized to every spawned tool.
  // spawnSync blocked the readline loop, so ONE slow advisor head-of-line-blocked every queued
  // request (a 2.5ms structural query measured at 527.6ms behind a concurrent campaign; a wedged
  // child could freeze the whole server for 120s). Fast-path tools answer in-process ABOVE and
  // never wait; spawned children serialize PER WORKSPACE so stateful sequences on one graph
  // (annotate then list; refresh then diff) keep their order while other workspaces run
  // concurrently. JSON-RPC replies may land out of order — the protocol (and every driver in
  // this repo) correlates by id; pendingAsync keeps stdin-close from killing in-flight work.
  const queueKey = graphPath ? resolve(graphPath) : '(graphless)';
  pendingAsync++;
  const prev = spawnQueues.get(queueKey) || Promise.resolve();
  const job = prev.then(() => new Promise((release) => {
    let settled = false;
    const child = spawn(process.execPath, [bin, ...cliArgs, '--json'], { stdio: [tool.input ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    let out = '', errBuf = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; try { child.kill('SIGKILL'); } catch { /* raced exit */ } }, SPAWN_TIMEOUT_MS);
    const settle = (fn) => { if (settled) return; settled = true; clearTimeout(timer); fn(); release(); asyncDone(); };
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { errBuf += d; if (errBuf.length > 65536) errBuf = errBuf.slice(-32768); });
    if (tool.input) child.stdin.end(tool.input(args) || '');
    child.on('error', (e) => settle(() => errResult(id, (e && e.message) || 'spawn failed')));
    child.on('close', (code) => settle(() => {
      if (timedOut) return errResult(id, `tool timed out after ${SPAWN_TIMEOUT_MS / 1000}s`);
      if (code === 2 || code == null) {
        const text = (errBuf || 'query failed').trim() || 'query failed';
        // the CLIs' graph-not-found message gains the MCP-native next step
        return errResult(id, /graph not found/.test(text) ? `${text}\n${NO_GRAPH}` : text);
      }
      // exit 0 (results) or 1 (found:false / gate-fail) both emit valid JSON on stdout — pass through.
      reply(id, { content: [{ type: 'text', text: (out || '').trim() }] });
    }));
  }));
  spawnQueues.set(queueKey, job);
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
rl.on('close', () => { stdinClosed = true; if (pendingAsync <= 0) process.exit(0); });
