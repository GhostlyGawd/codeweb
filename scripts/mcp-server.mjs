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
// corrupts the stream for the client, so stdout stays pure. stderr is SILENT by default; the opt-in
// CODEWEB_MCP_TRACE=1 emits one NDJSON queue event per line on stderr (start/end/kill/skip-
// autorefresh) for by-mechanism scenario assertions — free-form on stderr, so it cannot corrupt the
// protocol, and every trace write is try/catch-guarded (a client may close stderr — the #29 lesson).

import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeGraph, buildIndex, resolveSymbol, suggestSymbols, findingBuckets, bucketsLine } from './lib/graph-ops.mjs';
import { readHistory } from './lib/history.mjs'; // RETENTION R1/R8: the brief's progression tail
import { loadNarration } from './lib/narration.mjs'; // AI-IDEAS 3: agent-written notes, provenance-labeled
import { diffGraphs } from './lib/diff-core.mjs'; // #33: the codeweb_diff comparison, served in-process
import { runQuery } from './lib/query-core.mjs';
import { findSymbols } from './lib/find-core.mjs';
import { buildBrief } from './lib/brief-core.mjs';
import { buildCards } from './lib/explain-core.mjs'; // finding 20: explain's card assembler, in-process
import { buildContextPack } from './lib/context-core.mjs'; // finding 20: context-pack's assembler, in-process
import { bump, attachActivity, receiptPayload } from './lib/stats.mjs';
import { checkStaleness, sourceReader } from './lib/cli.mjs';

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

// #29 (T-29.2c): this writes the SERVER's stdout. The mid-session "client closed its read end"
// crash does NOT exist here — the process already inherits lib/cli.mjs:19's process.stdout
// 'error' handler (EPIPE → exit 0) via the :29 import side effect. A second listener would be
// dead code (cli's registers first and exits before a second could run for EPIPE; for non-EPIPE
// errors cli's handler rethrows, masking any later listener). Non-EPIPE stdout errors stay
// fail-fast by design. Scenario S1b pins this guard (and fails if the cli.mjs import is dropped).
const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });
const errResult = (id, text) => reply(id, { content: [{ type: 'text', text }], isError: true });

// #30/#31/#32 observability: opt-in NDJSON queue trace on stderr for BDD-by-mechanism assertions
// (scenario tests assert event INTERLEAVINGS, not wall-clock). Default off with ZERO stderr writes.
const TRACE = process.env.CODEWEB_MCP_TRACE === '1';
function trace(ev, obj) {
  if (!TRACE) return;
  try { process.stderr.write(JSON.stringify({ ev, ...obj }) + '\n'); } catch { /* client closed stderr */ }
}

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
// RETENTION R11a: the unsupported-language marker codeweb_map leaves on a no-source failure —
// checked wherever NO_GRAPH would fire, so repeat sessions get routed instead of re-walled.
function discoverUnsupported() {
  const spots = [];
  if (process.env.CODEWEB_WS) spots.push(join(process.env.CODEWEB_WS, 'unsupported.json'));
  let dir = process.cwd();
  for (let i = 0; i < 40; i++) {
    spots.push(join(dir, '.codeweb', 'unsupported.json'));
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return spots.find(existsSync) || null;
}
const atomicWriteJson = (p, obj) => writeFileSync(p, JSON.stringify(obj)); // marker-sized writes only

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
// ACTIVATION A7: the tools whose answers are ABOUT structure — vacuous on a 0-symbol map.
const STRUCTURAL_TOOLS = new Set([...Object.keys(QUERY_KIND), 'codeweb_find', 'codeweb_explain', 'codeweb_context']);

// finding 23: ONE staleness verdict per request burst. autoRefresh stat-swept every meta.sources
// entry and the payload's stale annotation swept them all AGAIN — 2 x 12-17ms at 5k files against
// answers that take 3-13ms. Memoized per (path, graph identity) with a 1s TTL: one sweep per
// burst, and a refreshed graph (new mtime/size) re-checks immediately.
const staleCache = new Map(); // abs -> { atMs, m, s, verdict }
function staleOnce(absPath, entry) {
  const hit = staleCache.get(absPath);
  if (hit && hit.m === entry.m && hit.s === entry.s && Date.now() - hit.atMs < 1000) return hit.verdict;
  const verdict = checkStaleness(entry.graph);
  staleCache.set(absPath, { atMs: Date.now(), m: entry.m, s: entry.s, verdict });
  return verdict;
}

// ---- self-healing freshness -------------------------------------------------------------------
// Structural queries answered from a stale map are the trap an agent can't see; annotating helped,
// but the ambient fix is to REFRESH inline (incremental, ~1s) before answering. Scoped to the
// structural tools (refresh preserves domains but drops overlaps, so overlap-consuming advisors
// keep their input). Throttled per graph; CODEWEB_NO_AUTOREFRESH=1 disables; failure -> serve the
// stale answer WITH its stale annotation (never a dead end).
const AUTOREFRESH_TOOLS = new Set([...Object.keys(QUERY_KIND), 'codeweb_context', 'codeweb_explain', 'codeweb_find', 'codeweb_brief']);
const refreshAttempt = new Map(); // abs graph path -> last attempt ms
// #31 (T-31.2): autoRefresh joins the workspace queue as a WRITER — SKIP when the workspace already
// has a writer queued or in-flight (writersPending > 0, read race-free per I7, so an explicit
// codeweb_refresh no longer races it into two concurrent extracts on one scan cache); else enqueue.
// The triggering request ALWAYS serves its stale-but-annotated answer immediately (fire-and-forget,
// never awaited); later requests keep the `stale` annotation until the enqueued writer lands and
// cachedGraph's mtime+size stamp reloads. A queued READER never suppresses it (readers can't supply
// freshness). refreshInFlight is gone (subsumed by writersPending).
function autoRefresh(absGraph) {
  if (process.env.CODEWEB_NO_AUTOREFRESH === '1') return;
  try {
    const entry = cachedGraph(absGraph);
    if (!staleOnce(absGraph, entry)) return;
    const key = dirname(absGraph); // workspace dir — the same key graph tools queue under
    if (wsOf(key).writersPending > 0) { trace('skip-autorefresh', { id: null, tool: 'codeweb_refresh', ws: key, pid: null }); return; }
    const last = refreshAttempt.get(absGraph) || 0;
    if (Date.now() - last < 15_000) return; // one attempt per 15s per graph
    refreshAttempt.set(absGraph, Date.now());
    // id:null -> not client-cancellable; onSettle bumps the receipt on success. 60s kill headroom.
    enqueueChild(null, { kind: 'writer', key, tool: 'codeweb_refresh', bin: scriptOf('refresh.mjs'), argv: [absGraph], stdio: 'ignore', timeoutMs: 60_000,
      onSettle: ({ code }) => { if (code === 0) { try { bump(absGraph, 'autoRefreshes'); } catch { /* receipt only */ } } } });
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
  { name: 'codeweb_diff', need: ['before', 'after'], opt: [], bin: scriptOf('diff.mjs'), graphless: true, queueFrom: (a) => a.after,
    argv: (a) => [a.before, a.after],
    description: 'Structural delta + regression verdict between two graph.json snapshots (before vs after an edit): nodes/edges/cycles/overlaps/orphans added & removed, coupling delta, and ok:false with reasons on a regression. The CI gate\'s exact semantics (verdict.check: orphan-gate): a new cycle, a new confirmed duplication, or a NON-EXPORTED symbol newly losing every in-edge — exported ones are listed in verdict, flagged exempt. Call AFTER an edit to gate it.' },
  { name: 'codeweb_explain', need: ['symbol'], opt: ['graph'], bin: scriptOf('explain.mjs'),
    argv: (a) => [a.symbol],
    description: '"Tell me about X before I touch it" in ONE ~1KB card: identity, role, signature, complexity, fan-in/out, tests, blast radius + domains, top-5 callers/callees, and any duplication/pattern findings it belongs to. Start here; drill down with impact/context/callers.' },
  { name: 'codeweb_brief', need: [], opt: ['graph'], bin: scriptOf('brief.mjs'),
    argv: () => [],
    description: 'The day-one page for a mapped repo (~2KB): domains with summaries, the most depended-on symbols, entry points, test layout, and known issues (duplications/cycles/orphans). Call FIRST in a new session instead of exploring; then codeweb_find/explain to go deeper.' },
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
  // FORMS F11: limit/full were advertised here but wired to nothing (no budget entry, no CLI
  // flags) — a schema that lies teaches agents to distrust tools/list.
  { name: 'codeweb_review', need: ['changed'], opt: ['graph', 'before', 'gate'], bin: scriptOf('review.mjs'),
    argv: (a) => ['--changed', a.changed, ...(a.before ? ['--before', a.before] : []), ...(a.gate ? ['--gate'] : [])],
    description: 'Structural review of a change: changed files (comma-separated, optionally file:start-end) -> changed symbols, blast radius, domains, fan-in-ranked review order. With gate:true it FAILS on new body-confirmed duplication even WITHOUT `before`; add `before` (a prior graph.json) to also fail on new cycles / lost call-callers — the full review gate, agent-reachable.' },
  // FORMS F12: `rules` demoted to optional — the CLI already discovers codeweb.rules.json beside
  // the graph or in cwd; requiring it here made the same call fail one transport over.
  { name: 'codeweb_fitness', need: [], opt: ['graph', 'rules'], bin: scriptOf('fitness.mjs'),
    argv: (a) => (a.rules ? ['--rules', a.rules] : []),
    description: 'Check the graph against architectural fitness rules (codeweb.rules.json): forbidden-dependency, layering, no-cycles, max-fan-in, max-symbol-loc. Reports violations. `rules` is optional — defaults to codeweb.rules.json beside the graph or in cwd.' },
  { name: 'codeweb_risk', need: [], opt: ['graph', 'changed', 'limit', 'full', 'all'], budget: { arg: 'limit', flag: '--limit', value: 15 }, bin: scriptOf('risk.mjs'),
    argv: (a) => [...(a.changed ? ['--changed', a.changed] : []), ...(a.all ? ['--all'] : [])],
    description: 'Rank symbols by change-risk (fan-in, fan-out, loc, blast radius, churn); `changed` scopes to a comma-separated file list. Budgeted: top 15 by default.' },
  { name: 'codeweb_break_cycles', need: [], opt: ['graph', 'limit', 'full'], budget: { arg: 'limit', flag: '--limit', value: 10 }, bin: scriptOf('break-cycles.mjs'), argv: () => [],
    description: 'For each file dependency cycle, the cheapest dependency edge to sever — verified to actually break the cycle. Budgeted: top 10 cycles by default.' },
  { name: 'codeweb_deadcode', need: [], opt: ['graph', 'limit', 'full', 'all'], budget: { arg: 'limit', flag: '--limit', value: 20 }, bin: scriptOf('deadcode.mjs'), argv: (a) => (a.all ? ['--all'] : []),
    description: 'Confidence-tiered dead-code: safe-to-delete vs review-first (test-guarded or entrypoint-like), each with its loc span. Budgeted: top 20 per tier by span (totals stay true; full:true for everything).' },
  // FORMS F12: `into` demoted to optional — the CLI picks the canonical survivor itself when
  // --into is omitted; a required field the engine can infer is form friction.
  { name: 'codeweb_codemod', need: ['merge'], opt: ['graph', 'into'], bin: scriptOf('codemod.mjs'),
    argv: (a) => ['--merge', a.merge, ...(a.into ? ['--into', a.into] : [])],
    description: 'Plan a consolidation merge (report-only): canonical survivor, exact deletions + caller rewrites, LOC reclaimed, and the projected regression-gate verdict. `into` is optional — omitted, the engine picks the canonical survivor. Read-only — does NOT modify source.' },
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
    description: 'PRE-FLIGHT an edit without performing it: {newCycles, lostCallers, ok} for a hypothetical delete / merge / move. STRICTER than the CI gate (verdict.check: call-caller-preflight): flags ANY surviving symbol losing its last call-caller, exported or not, and cannot see duplication. Call BEFORE committing to a refactor plan — a doomed edit is discarded for the cost of one call.' },
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
  rules: { type: 'string', description: 'Path to a codeweb.rules.json fitness-rules file. OPTIONAL — defaults to codeweb.rules.json beside the graph or in cwd' },
  merge: { type: 'string', description: 'Comma-separated symbol ids/labels to consolidate (merge)' },
  into: { type: 'string', description: 'The id/label to keep as the canonical survivor of the merge. OPTIONAL — omitted, the engine infers it' },
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
// ---- per-workspace queue (#30/#31/#32) -------------------------------------------------------
// spawnQueues was keyed by the graph FILE path, so refresh (keyed by its graph) and diff (keyed by
// the shared '(graphless)' slot) never collided — the ordering the old comment promised did not
// hold. State is now per-WORKSPACE-DIRECTORY: every graph tool, map, and keyed-graphless tool (diff)
// normalizes to the dir that holds graph.json / the map out dir, so operations on ONE workspace order
// correctly and different workspaces run concurrently. Draining rules = invariants I1–I7 (WS-F spec):
//  I1 writers on one workspace never overlap, FIFO (chain on writerTail);
//  I2 a reader never starts before an earlier-QUEUED writer (awaits the writerTail snapshot at enqueue);
//  I3 a writer also waits for every reader ENQUEUED BEFORE it (join of writerTail + a readersInFlight
//     snapshot) — the CONSERVATIVE rule: a spawned reader makes MULTIPLE workspace reads (graph.json
//     then a sidecar), and a writer landing mid-read hands it a torn old/new state today's full
//     serialization makes impossible; preserving that linearization is the contract;
//  I4 readers run concurrently under a GLOBAL cap of READER_CAP children (FIFO waiters); a reader
//     acquires its slot only AFTER its I2 writerTail wait resolves and holds it only while its child
//     runs, so a reader blocked on a writer holds no slot (no cross-workspace starvation/deadlock);
//  I5 every job settles exactly once and always releases slot + writersPending + inflight + asyncDone;
//  I7 writersPending increments synchronously at enqueue so autoRefresh's same-drain skip is race-free.
// #32's win is reader-reader overlap (two advisors ≈ max, not sum); the aggressive 'writers skip
// readers' variant was reviewed and REJECTED (torn multi-artifact reads) — do not reintroduce it
// without per-result graph-stamp labeling. READER_CAP=1 restores full serialization (the rollback lever).
const workspaces = new Map(); // wsKey -> { writerTail: Promise, writersPending: int, readersInFlight: Set<Promise> }
function wsOf(key) {
  let w = workspaces.get(key);
  if (!w) { w = { writerTail: Promise.resolve(), writersPending: 0, readersInFlight: new Set() }; workspaces.set(key, w); }
  return w;
}
// I4: a global reader concurrency cap with a FIFO waiter queue. A released slot is handed DIRECTLY to
// the next waiter (count unchanged) so ordering is preserved; only an unclaimed release grows the count.
const READER_CAP = 3;
let readerSlots = READER_CAP;
const readerWaiters = [];
const acquireReaderSlot = () => (readerSlots > 0 ? (readerSlots--, Promise.resolve()) : new Promise((res) => readerWaiters.push(res)));
const releaseReaderSlot = () => { const next = readerWaiters.shift(); if (next) next(); else readerSlots++; };
// writers = the tools that MUTATE a workspace (graph consumers must re-read after them) + the
// internal autoRefresh + map; every other spawned tool and fast-path fallback spawn is a reader.
const WRITER_TOOLS = new Set(['codeweb_refresh', 'codeweb_annotate', 'codeweb_map']);
const inflight = new Map(); // request id -> { kill, cancelled } (#34: id→child; runChild owns it)

// THE queue key: graph tools -> dir of graph.json; map -> resolve(out); keyed-graphless (diff) ->
// dir of queueFrom(args). All normalize to one workspace-dir identity (T-30.1). '(graphless)' is a
// defensive fallback, unreachable today (only diff+map are graphless; diff has queueFrom, map is
// keyed by out above) — a unit pins that.
function queueKeyFor(tool, args, graphPath) {
  if (tool.map) return resolve(args.out || join(resolve(args.target || process.cwd()), '.codeweb'));
  if (tool.graphless) {
    const from = tool.queueFrom && tool.queueFrom(args);
    return from ? dirname(resolve(from)) : '(graphless)';
  }
  return dirname(resolve(graphPath));
}

// THE one child wrapper (T-31.1): owns spawn/timeout/settle-once/trace/inflight for map, autoRefresh
// AND every spawned tool — so the settle-once guard, the #34 cancel hook, and the trace hook plug in
// ONCE. handleMap had no settle-once flag (I5: a spawn failure there double-replied + double-
// decremented pendingAsync); routing it here fixes that. Guards the error+close DOUBLE-fire (Node:
// 'close' may or may not follow 'error') with `settled`. onSettle shapes the reply and is NEVER
// called on a cancel (a cancelled request gets no response, MCP). Resolves (never rejects) on settle.
function runChild(id, entry, spec, releaseAll) {
  return new Promise((resolve_) => {
    const key = spec.key, tool = spec.tool;
    if (entry && entry.cancelled) { // cancelled while still queued — never spawn (I5)
      trace('kill', { id, tool, ws: key, pid: null, reason: 'cancel' });
      releaseAll(); return resolve_();
    }
    let settled = false, timedOut = false, child = null, timer = null, out = '', errBuf = '';
    const finish = (code) => {
      if (settled) return; settled = true;
      if (timer) clearTimeout(timer);
      const pid = child ? child.pid : null;
      if (entry && entry.cancelled) trace('kill', { id, tool, ws: key, pid, reason: 'cancel' });
      else if (timedOut) trace('kill', { id, tool, ws: key, pid, reason: 'timeout' });
      else trace('end', { id, tool, ws: key, pid });
      if (!(entry && entry.cancelled)) spec.onSettle({ code, out, errBuf, timedOut }); // cancel suppresses the reply (I5)
      releaseAll(); resolve_();
    };
    try { child = spawn(process.execPath, [spec.bin, ...spec.argv], { stdio: spec.stdio }); }
    catch (e) { errBuf = (e && e.message) || 'spawn failed'; return finish(null); }
    if (entry) entry.kill = () => { try { child.kill('SIGKILL'); } catch { /* raced exit */ } };
    trace('start', { id, tool, ws: key, pid: child.pid });
    timer = setTimeout(() => { timedOut = true; try { child.kill('SIGKILL'); } catch { /* raced exit */ } }, spec.timeoutMs);
    if (child.stdout) child.stdout.on('data', (d) => { out += d; });
    if (child.stderr) child.stderr.on('data', (d) => { errBuf += d; if (errBuf.length > 65536) errBuf = errBuf.slice(-32768); if (spec.onStderr) spec.onStderr(String(d)); });
    if (spec.input != null && child.stdin) {
      // #29: guard the stdin flush (async EPIPE + sync ERR_STREAM_DESTROYED + null stdin).
      try { child.stdin.on('error', () => {}); child.stdin.end(spec.input); }
      catch { /* destroyed/absent — the close/error path settles */ }
    }
    child.on('error', () => finish(null)); // double-fire guarded by `settled`
    child.on('close', (code) => finish(code));
  });
}

// Enqueue a child on its workspace. writersPending increments SYNCHRONOUSLY here (I7), before any
// await. WRITERS chain on the join of writerTail + an enqueue-time readersInFlight snapshot (I1 FIFO
// + I3 conservative) and skip the slot gate. READERS capture writerTail at enqueue (I2), await it,
// THEN acquire one global reader slot (I4) held only while the child runs; a reader is registered in
// readersInFlight from enqueue until settle so a later writer (I3) waits for it. releaseAll runs
// exactly once on every settle path (I5): releases the slot, deletes inflight, decrements
// writersPending / removes from readersInFlight, calls asyncDone().
function enqueueChild(id, spec) {
  const w = wsOf(spec.key);
  const entry = (id != null) ? { kill: () => {}, cancelled: false } : null;
  if (entry) inflight.set(id, entry);
  pendingAsync++;

  if (spec.kind === 'writer') {
    w.writersPending++; // I7: before any await
    const readerSnapshot = [...w.readersInFlight]; // I3: readers enqueued before this writer
    let released = false;
    const releaseAll = () => { if (released) return; released = true; if (entry) inflight.delete(id); w.writersPending--; asyncDone(); };
    const job = Promise.allSettled([w.writerTail, ...readerSnapshot]).then(() => runChild(id, entry, spec, releaseAll));
    w.writerTail = job; // I1: the next writer chains after this one
    return job;
  }

  // reader
  let released = false, slotHeld = false, job;
  const releaseAll = () => {
    if (released) return; released = true;
    if (slotHeld) { releaseReaderSlot(); slotHeld = false; }
    if (entry) inflight.delete(id);
    w.readersInFlight.delete(job);
    asyncDone();
  };
  const tail = w.writerTail; // I2: snapshot the writer tail at enqueue
  job = tail.then(async () => {
    if (entry && entry.cancelled) return; // cancelled while queued behind a writer: acquire no slot
    await acquireReaderSlot();            // I4: only AFTER the I2 wait — a blocked reader holds no slot
    slotHeld = true;
  }).then(() => runChild(id, entry, spec, releaseAll));
  w.readersInFlight.add(job);
  return job;
}

// ---- codeweb_map -----------------------------------------------------------------------------
function handleMap(id, args, meta) {
  const target = resolve(args.target || process.cwd());
  if (!existsSync(target)) return errResult(id, `target not found: ${target}`); // sync validation stays PRE-enqueue
  const out = resolve(args.out || join(target, '.codeweb'));
  const token = meta && meta.progressToken;
  const onStderr = (chunk) => {
    if (token === undefined || token === null) return;
    for (const line of chunk.split('\n')) {
      const m = /^\[run\] ([a-z-]+)$/.exec(line.trim());
      if (m && MAP_STAGES.includes(m[1])) send({ jsonrpc: '2.0', method: 'notifications/progress', params: { progressToken: token, progress: MAP_STAGES.indexOf(m[1]), total: MAP_STAGES.length, message: `stage: ${m[1]}` } });
    }
  };
  const onSettle = ({ code, errBuf }) => {
    if (code !== 0) {
      // RETENTION R11a: an unsupported-language repo fails IDENTICALLY every session with no
      // memory. Leave a marker the NO_GRAPH path reads, so the next session routes straight to
      // the agent fallback instead of hitting the same wall. Best-effort.
      if (/no supported source files/.test(errBuf || '')) {
        try { atomicWriteJson(join(out, 'unsupported.json'), { at: new Date().toISOString(), reason: 'no supported source files', hint: 'use the /codeweb agent fallback (agent-based mapping); delete this file to retry codeweb_map' }); } catch { /* marker only */ }
      }
      return errResult(id, `codeweb_map failed (exit ${code}): ${(errBuf || '').trim().split('\n').slice(-3).join('\n')}`);
    }
    if (token !== undefined && token !== null) send({ jsonrpc: '2.0', method: 'notifications/progress', params: { progressToken: token, progress: MAP_STAGES.length, total: MAP_STAGES.length, message: 'done' } });
    const graphPath = join(out, 'graph.json');
    let stats = '';
    try {
      const g = JSON.parse(readFileSync(graphPath, 'utf8'));
      // ACTIVATION A4: same findings vocabulary as every other surface (raw overlap count read
      // as a contradiction next to the triple).
      stats = `${(g.nodes || []).length} symbols, ${(g.edges || []).length} edges, ${(g.domains || []).length} domains — ${bucketsLine(findingBuckets(g.overlaps))}`;
    } catch { stats = 'built (stats unreadable)'; }
    reply(id, { content: [{ type: 'text', text: JSON.stringify({ ok: true, graph: graphPath, summary: `mapped ${target}: ${stats}`, artifacts: { report: join(out, 'report.html'), optimize: join(out, 'optimize.md') } }) }] });
  };
  // map is a WRITER keyed by resolve(out) — two maps on one out serialize; queued readers wait (I2).
  enqueueChild(id, { kind: 'writer', key: out, tool: 'codeweb_map', bin: scriptOf('run.mjs'), argv: [target, '--out-dir', out], stdio: ['ignore', 'ignore', 'pipe'], timeoutMs: 300_000, onStderr, onSettle });
}

// THE spawned-tool reply shaper (shared by the generic tool path and the #33 diff spawn fallback):
// exit 2 / null → errResult (graph-not-found gains the MCP next step); otherwise the child's JSON.
const spawnedToolReply = (id) => ({ code, out, errBuf, timedOut }) => {
  if (timedOut) return errResult(id, `tool timed out after ${SPAWN_TIMEOUT_MS / 1000}s`);
  if (code === 2 || code == null) {
    const text = (errBuf || 'query failed').trim() || 'query failed';
    return errResult(id, /graph not found/.test(text) ? `${text}\n${NO_GRAPH}` : text);
  }
  // FORMS F1 (belt): an exit-1 child with EMPTY stdout is a die()-style miss, not a result — an
  // empty success here read as "no objections" right before a doomed refactor. Surface stderr.
  if (code === 1 && !(out || '').trim()) return errResult(id, (errBuf || '').trim() || 'tool failed (exit 1, no output)');
  // exit 0 (results) or 1 (found:false / gate-fail) both emit valid JSON on stdout — pass through.
  reply(id, { content: [{ type: 'text', text: (out || '').trim() }] });
};

// ---- codeweb_diff fast path (#33) ------------------------------------------------------------
// The prescribed refresh→diff loop's last child goes IN-PROCESS: the AFTER side comes from
// cachedGraph (re-stat + reload on mtime/size change — disk truth by mechanism), reusing its cached
// index; the BEFORE side is a fresh parse of the caller's snapshot, deliberately NOT inserted into
// graphCache (its FIFO eviction would drop the hot live graph for a one-shot temp snapshot). I6: it
// AWAITS the after-workspace writerTail first (else a concurrent refresh could hand it pre-refresh
// bytes — reopening #30); it is NOT registered in readersInFlight (ONE live read, rename-atomic-
// safe; the before side is a caller snapshot). It registers a SUPPRESS-ONLY inflight entry (T-34.1):
// no child to kill, but a cancel while it awaits suppresses the reply. Any throw → the spawned
// diff.mjs fallback (a reader job), whose stderr/exit-2 becomes the errResult — never invented text.
function handleDiff(id, args, tool) {
  const key = dirname(resolve(args.after)); // == queueKeyFor(diff) — the after-workspace
  const entry = { kill: () => {}, cancelled: false };
  inflight.set(id, entry);
  pendingAsync++;
  const spawnFallback = () => {
    // hand off to the spawned reader path; keep the work COUNTED across the handoff — no asyncDone
    // runs between this -- and enqueueChild's ++, so stdin-close cannot exit in the gap.
    inflight.delete(id);
    pendingAsync--;
    enqueueChild(id, { kind: 'reader', key, tool: tool.name, bin: tool.bin, argv: [args.before, args.after, '--json'], stdio: ['ignore', 'pipe', 'pipe'], timeoutMs: SPAWN_TIMEOUT_MS, onSettle: spawnedToolReply(id) });
  };
  const attempt = () => {
    if (entry.cancelled) { inflight.delete(id); asyncDone(); return; } // cancel while awaiting → suppress reply (I5)
    let payload;
    try {
      const before = normalizeGraph(JSON.parse(readFileSync(resolve(args.before), 'utf8'))); // NOT cached (temp snapshot must not evict the live graph)
      const afterEntry = cachedGraph(resolve(args.after)); // re-stats + reloads on mismatch
      payload = diffGraphs(before, afterEntry.graph, { names: { before: basename(args.before), after: basename(args.after) }, aIx: afterEntry.index }).payload;
    } catch { return spawnFallback(); }
    reply(id, { content: [{ type: 'text', text: JSON.stringify(payload) }] });
    inflight.delete(id); asyncDone();
  };
  wsOf(key).writerTail.then(attempt, attempt); // I6: await the after-workspace writer tail first
}

// ---- tools/call ------------------------------------------------------------------------------
function handleToolCall(id, params) {
  const name = params && params.name;
  const args = (params && params.arguments) || {};
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return fail(id, -32602, `unknown tool: ${name}`);
  // FORMS F2: three distinct verdicts — "missing" for a wrong TYPE invited the model to re-send
  // the same wrong shape (the argument was there all along).
  for (const k of tool.need) {
    const v = args[k];
    if (v === undefined || v === null) return errResult(id, `missing required argument: ${k}`);
    if (typeof v !== 'string') return errResult(id, `argument ${k} must be a string (got ${typeof v})`);
    if (v === '') return errResult(id, `argument ${k} must be non-empty`);
  }
  // FORMS F3: ONE clamp for every numeric param. Garbage ("abc" -> NaN) silently disabled the
  // budget the tool exists to protect; a negative value minted empty pages with a nextOffset:0
  // loop. Normalized in place so fast paths and spawn paths see the same real number.
  for (const k of ['limit', 'offset', 'window', 'budget']) {
    if (args[k] === undefined || args[k] === null) continue;
    const n = Number(args[k]);
    if (typeof args[k] === 'boolean' || String(args[k]).trim() === '' || !Number.isFinite(n) || n < 0) {
      return errResult(id, `argument ${k} must be a non-negative number (got ${JSON.stringify(args[k])})`);
    }
    args[k] = n;
  }
  if (tool.valid) { const problem = tool.valid(args); if (problem) return errResult(id, problem); }
  if (tool.map) return handleMap(id, args, params && params._meta);
  if (tool.name === 'codeweb_diff') return handleDiff(id, args, tool); // #33: in-process from cachedGraph, spawn fallback

  const cliArgs = [];
  let graphPath = null;
  if (!tool.graphless) {
    graphPath = args.graph || discoverGraph();
    if (!graphPath) {
      // R11a: no graph AND a remembered unsupported-language failure -> route, don't re-wall.
      const marker = discoverUnsupported();
      if (marker) return errResult(id, `this repo was previously found to have no natively-supported source (marker: ${marker}) — codeweb's extractor cannot map it. In Claude Code, the /codeweb command's AGENT FALLBACK maps it by reading. Delete the marker file to retry codeweb_map.`);
      return errResult(id, NO_GRAPH);
    }
    // #11: annotate's CLI addresses the WORKSPACE (--dir beside the graph), not the graph file.
    if (tool.dirFromGraph) cliArgs.push('--dir', dirname(resolve(graphPath)));
    else cliArgs.push(graphPath);
  }

  if (graphPath) bump(resolve(graphPath), 'queriesServed'); // the receipt's denominator
  if (graphPath && AUTOREFRESH_TOOLS.has(tool.name)) autoRefresh(resolve(graphPath));

  // ACTIVATION A7: a map built with --allow-empty EXISTS but knows nothing. A normal-looking
  // answer from it ("0 callers", "0 matches") reads as a verdict about the code — it isn't.
  // Structural tools get one honest line instead. brief/stats/refresh/map still run: the brief
  // renders the empty verdict itself, and refresh/map are how the void gets filled.
  if (graphPath && STRUCTURAL_TOOLS.has(tool.name)) {
    try {
      if (cachedGraph(resolve(graphPath)).graph.nodes.length === 0) {
        return errResult(id, `the map at ${graphPath} is EMPTY (built with --allow-empty; no supported source found) — structural answers would be vacuous, not "0 findings". Re-map at the code root, or use the /codeweb agent fallback for non-native languages.`);
      }
    } catch { /* unreadable graph: each tool's own path reports it */ }
  }

  // Fast path: the briefing assembles in-process from the cached graph (same object as the CLI
  // via brief-core). Any surprise falls back to the spawned artifact.
  if (tool.name === 'codeweb_brief') {
    try {
      const entry = cachedGraph(resolve(graphPath));
      const { graph, index } = entry;
      const payload = attachActivity(buildBrief(graph, index), resolve(graphPath));
      const stale = staleOnce(resolve(graphPath), entry);
      if (stale) payload.stale = stale;
      // RETENTION R1/R8: the progression tail rides the brief here too (hook/CLI parity).
      try { const h = readHistory(resolve(graphPath), 4); if (h.length >= 2) payload.history = h; } catch { /* best-effort */ }
      // AI-IDEAS 3: agent-written narration (provenance-labeled downstream); stale -> absent.
      try { const n = loadNarration(resolve(graphPath)); if (n) payload.narration = n; } catch { /* best-effort */ }
      return reply(id, { content: [{ type: 'text', text: JSON.stringify(payload) }] });
    } catch { /* fall through to the spawned artifact */ }
  }
  // Fast path: concept search answers in-process from the cached graph (same ranking as the CLI
  // via find-core; budget applied identically). Any surprise falls back to the spawned artifact.
  if (tool.name === 'codeweb_find') {
    try {
      const entry = cachedGraph(resolve(graphPath));
      const { graph, index } = entry;
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
        const stale = staleOnce(resolve(graphPath), entry);
        if (stale) { payload.stale = stale; payload.summary += ` — graph is stale for ${stale.count}+ file(s); run codeweb_refresh`; }
        return reply(id, { content: [{ type: 'text', text: JSON.stringify(payload) }] });
      }
    } catch { /* fall through to the spawned artifact */ }
  }
  // Fast path (finding 20): explain — the tool the INSTRUCTIONS prescribe before every symbol
  // edit — assembles in-process from the cached graph via the same buildCards the CLI and the
  // pre-edit sidecar use (~256ms spawn+reparse -> cache-warm milliseconds). Payload identical to
  // explain.mjs --json, including the found:false + suggestions contract.
  if (tool.name === 'codeweb_explain') {
    try {
      const entry = cachedGraph(resolve(graphPath));
      const { graph, index } = entry;
      const ids = resolveSymbol(graph, args.symbol);
      if (!ids.length) {
        const suggestions = suggestSymbols(graph, args.symbol);
        const payload = { symbol: args.symbol, found: false, hint: `no symbol matches "${args.symbol}" — try codeweb_find "<free text>" (concept search, no name needed)${suggestions.length ? ' or a near-match below' : ''}` };
        if (suggestions.length) payload.suggestions = suggestions;
        return reply(id, { content: [{ type: 'text', text: JSON.stringify(payload) }] });
      }
      const cards = buildCards(graph, index, sourceReader(graph.meta && graph.meta.root), ids);
      const payload = { symbol: args.symbol, matched: ids, cards, summary: cards.map((c) => c.summary).join(' | ') };
      const stale = staleOnce(resolve(graphPath), entry);
      if (stale) { payload.stale = stale; payload.summary += ` — graph is stale for ${stale.count}+ file(s); run codeweb_refresh`; }
      return reply(id, { content: [{ type: 'text', text: JSON.stringify(payload) }] });
    } catch { /* fall through to the spawned artifact */ }
  }
  // Fast path (finding 20): context-pack — the other prescribed-per-edit tool — assembles
  // in-process via lib/context-core.mjs (the CLI's own assembler; byte-identical JSON). The
  // spawned path parsed the multi-MB graph fresh on every call.
  if (tool.name === 'codeweb_context') {
    try {
      const entry = cachedGraph(resolve(graphPath));
      const { graph, index } = entry;
      const ids = resolveSymbol(graph, args.symbol);
      if (!ids.length) {
        const suggestions = suggestSymbols(graph, args.symbol);
        const payload = { symbol: args.symbol, found: false, hint: `no symbol matches "${args.symbol}" — try codeweb_find "<free text>" (concept search, no name needed)${suggestions.length ? ' or a near-match below' : ''}` };
        if (suggestions.length) payload.suggestions = suggestions;
        return reply(id, { content: [{ type: 'text', text: JSON.stringify(payload) }] });
      }
      const limit = args.limit != null ? Number(args.limit) : (args.full ? null : tool.budget.value);
      const windowN = args.window != null ? Math.max(0, parseInt(String(args.window), 10) || 3) : 3;
      const payload = buildContextPack(graph, index, sourceReader(graph.meta?.root || null), ids, { symbol: args.symbol, windowN, fullBodies: !!args.full, limit, staleInfo: staleOnce(resolve(graphPath), entry) });
      return reply(id, { content: [{ type: 'text', text: JSON.stringify(payload) }] });
    } catch { /* fall through to the spawned artifact */ }
  }
  // Fast path: structural queries answer in-process from the cached graph (same payloads as the
  // CLI via query-core). Any surprise falls back to the spawned, tested artifact.
  const qkind = QUERY_KIND[tool.name];
  if (qkind) {
    try {
      const entry = cachedGraph(resolve(graphPath));
      const { graph, index } = entry;
      const limit = args.limit != null ? Number(args.limit) : (args.full ? null : tool.budget.value);
      const offset = args.offset != null ? Number(args.offset) : 0;
      const { payload, code } = runQuery(graph, index, { query: qkind, symbol: args.symbol, limit, offset });
      if (code === 0 || payload) {
        const stale = payload.found === false ? null : staleOnce(resolve(graphPath), entry);
        if (stale) {
          payload.stale = stale;
          if (payload.summary) payload.summary += ` — graph is stale for ${stale.count}+ file(s); run codeweb_refresh`;
        }
        return reply(id, { content: [{ type: 'text', text: JSON.stringify(payload) }] });
      }
    } catch { /* fall through to the spawned artifact */ }
  }
  // Fast path (#33): the value receipt is a ~200-byte stats.json the server already has the reader
  // for — spawning a child to read it cost 92–95 ms. cachedGraph(...) throws EXACTLY where the CLI's
  // loadGraph dies (missing/invalid graph), and that throw falls through to the spawned CLI whose
  // stderr/exit-2 becomes the errResult — so the fast path never invents its own error text.
  if (tool.name === 'codeweb_stats') {
    try {
      cachedGraph(resolve(graphPath));
      return reply(id, { content: [{ type: 'text', text: JSON.stringify(receiptPayload(resolve(graphPath))) }] });
    } catch { /* fall through to the spawned artifact (identical graph-not-found errResult) */ }
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
  // finding 19 + #30/#31/#32: spawned children are ASYNC and queue PER WORKSPACE (dir of graph.json /
  // map out / diff's `after`). spawnSync once blocked the readline loop, head-of-line-blocking every
  // queued request; fast-path tools answer in-process ABOVE and never queue. Readers on one workspace
  // now run concurrently under READER_CAP (I4) while still ordering after any earlier-queued writer
  // (I2); writers stay serialized (I1) and wait for earlier readers (I3). Replies may land out of
  // order — clients correlate by id; pendingAsync keeps stdin-close from killing in-flight work.
  enqueueChild(id, {
    kind: WRITER_TOOLS.has(tool.name) ? 'writer' : 'reader',
    key: queueKeyFor(tool, args, graphPath),
    tool: tool.name, bin, argv: [...cliArgs, '--json'],
    stdio: [tool.input ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    input: tool.input ? (tool.input(args) || '') : undefined,
    timeoutMs: SPAWN_TIMEOUT_MS,
    onSettle: spawnedToolReply(id),
  });
}

function handle(line) {
  const s = line.trim();
  if (!s) return;
  let msg;
  try { msg = JSON.parse(s); } catch { return fail(null, -32700, 'Parse error'); }
  // #34 (T-34.3): a JSON-RPC batch array — MINIMAL per-member fan-out. Each member is processed
  // exactly as if it had arrived on its own line; responses are emitted as individual NDJSON lines
  // in settle order, NOT collected into a response array (a documented deviation — a collector would
  // have to thread through a dozen async settle sites, and a cancel-suppressed member gets NO response
  // and would hold the array open forever). An EMPTY array is the JSON-RPC-mandated Invalid Request.
  if (Array.isArray(msg)) {
    if (msg.length === 0) return fail(null, -32600, 'Invalid Request');
    for (const m of msg) handleMessage(m);
    return;
  }
  handleMessage(msg);
}

function handleMessage(msg) {
  // #34 (T-34.2): non-object frames (number/string/bool/null, and a nested array via fan-out) are
  // Invalid Request, not a silent drop.
  if (msg === null || typeof msg !== 'object' || Array.isArray(msg)) return fail(null, -32600, 'Invalid Request');
  const { id, method, params } = msg;
  // #34 (T-34.1): cancellation is an id-less notification — handle it BEFORE the id-less drop. Kill
  // the in-flight child (or mark a still-queued job so it never spawns) and SUPPRESS its reply; the
  // job still releases its slot / writersPending / asyncDone (I5). Unknown or already-settled
  // requestId → ignore (MCP: a server MAY ignore it).
  if (method === 'notifications/cancelled') {
    const j = inflight.get(params && params.requestId);
    if (j) { j.cancelled = true; j.kill(); }
    return;
  }
  if (id === undefined || id === null) return; // other JSON-RPC notifications: never responded to
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

// Start the readline loop ONLY when run as the entry point (node mcp-server.mjs) — so tests can
// import the pure helpers (queueKeyFor) without a server attaching to their own stdin. The
// published bin is a Node-version-guard shim that dynamic-imports this file (argv[1] = the shim),
// so it announces itself via CODEWEB_BIN instead.
const isMain = (!!process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url)))
  || process.env.CODEWEB_BIN === '1';
if (isMain) {
  const rl = createInterface({ input: process.stdin });
  rl.on('line', handle);
  rl.on('close', () => { stdinClosed = true; if (pendingAsync <= 0) process.exit(0); });
}

// Exported for unit tests (the server side-effects are gated behind isMain above).
export { queueKeyFor, TOOLS };
