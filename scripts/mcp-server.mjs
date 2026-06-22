#!/usr/bin/env node
// codeweb MCP server — stdio transport, newline-delimited JSON-RPC 2.0, zero-dependency. Exposes
// codeweb's structural queries as MCP tools an agent can call mid-task (callers / callees / impact
// / cycles / orphans). Each tools/call shells out to the tested scripts/query.mjs.
//
// CRITICAL: stdout carries ONLY JSON-RPC messages (one per line). Any stray write to stdout
// corrupts the stream for the client, so all diagnostics go to stderr (here: none).

import { createInterface } from 'node:readline';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const QUERY = join(HERE, 'query.mjs');
const DIFF = join(HERE, 'diff.mjs');
const FINDSIM = join(HERE, 'find-similar.mjs');
const PLACEMENT = join(HERE, 'placement.mjs');
const REVIEW = join(HERE, 'review.mjs');
const FITNESS = join(HERE, 'fitness.mjs');
const RISK = join(HERE, 'risk.mjs');
const BREAKCYCLES = join(HERE, 'break-cycles.mjs');
const DEADCODE = join(HERE, 'deadcode.mjs');
const CODEMOD = join(HERE, 'codemod.mjs');
const SERVER = { name: 'codeweb', version: '0.1.0' };
const DEFAULT_PROTOCOL = '2025-06-18';

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

const TOOLS = [
  { name: 'codeweb_callers', need: ['graph', 'symbol'], flags: (a) => ['--callers', a.symbol],
    description: 'Direct callers (call-edge in-neighbors) of a symbol in a codeweb graph.json.' },
  { name: 'codeweb_callees', need: ['graph', 'symbol'], flags: (a) => ['--callees', a.symbol],
    description: 'Direct callees (the functions a symbol calls) in a codeweb graph.json.' },
  { name: 'codeweb_impact', need: ['graph', 'symbol'], flags: (a) => ['--impact', a.symbol],
    description: 'Blast radius: every function transitively affected by changing a symbol, plus the domains touched. Call this BEFORE editing a symbol.' },
  { name: 'codeweb_cycles', need: ['graph'], flags: () => ['--cycles'],
    description: 'File-level dependency cycles (circular imports/calls) in a codeweb graph.json.' },
  { name: 'codeweb_orphans', need: ['graph'], flags: () => ['--orphans'],
    description: 'Uncalled and unexported symbols (dead-code candidates) in a codeweb graph.json.' },
  { name: 'codeweb_diff', need: ['before', 'after'], bin: DIFF, argv: (a) => [a.before, a.after],
    description: 'Structural delta + regression verdict between two codeweb graph.json snapshots (before vs after an edit): nodes/edges/cycles/overlaps/orphans added & removed, the cross-domain coupling delta, and ok:false with reasons when a regression (new dependency cycle, new duplication, or a symbol that lost all its callers) appears. Call AFTER an edit to gate it.' },
  { name: 'codeweb_tests', need: ['graph', 'symbol'], flags: (a) => ['--tests', a.symbol],
    description: 'The tests that exercise a symbol (test-edge in-neighbors). Run the right subset after editing a symbol, and know what is protected.' },
  { name: 'codeweb_find_similar', need: ['graph', 'signature'], bin: FINDSIM, argv: (a) => [a.graph, '--signature', a.signature],
    description: 'Before writing a function, ask "does something already do this?": ranks existing bodies by token-shingle similarity to a candidate signature/snippet. Call to AVOID re-implementing existing logic.' },
  { name: 'codeweb_placement', need: ['graph', 'calls'], bin: PLACEMENT, argv: (a) => [a.graph, '--calls', a.calls],
    description: 'Where a NEW symbol belongs: given the comma-separated ids/labels it will call, suggests the domain + file by callee gravity, and warns if it duplicates an existing symbol.' },
  { name: 'codeweb_review', need: ['graph', 'changed'], bin: REVIEW, argv: (a) => [a.graph, '--changed', a.changed],
    description: 'Structural review of a change: maps changed files (comma-separated, optionally file:start-end) to changed symbols, their blast radius, domains touched, and fan-in-ranked review order.' },
  { name: 'codeweb_fitness', need: ['graph', 'rules'], bin: FITNESS, argv: (a) => [a.graph, '--rules', a.rules],
    description: 'Check the graph against architectural fitness rules (codeweb.rules.json): forbidden-dependency, layering, no-cycles, max-fan-in, max-symbol-loc. Reports violations.' },
  { name: 'codeweb_risk', need: ['graph'], bin: RISK, argv: (a) => [a.graph],
    description: 'Rank symbols by change-risk (fan-in, fan-out, loc, blast radius, churn) so a reviewer triages the dangerous ones first.' },
  { name: 'codeweb_break_cycles', need: ['graph'], bin: BREAKCYCLES, argv: (a) => [a.graph],
    description: 'For each file dependency cycle, propose the cheapest dependency edge to sever — verified to actually break the cycle.' },
  { name: 'codeweb_deadcode', need: ['graph'], bin: DEADCODE, argv: (a) => [a.graph],
    description: 'Confidence-tiered dead-code: partitions orphans into safe-to-delete vs review-first (test-guarded or entrypoint-like).' },
  { name: 'codeweb_codemod', need: ['graph', 'merge', 'into'], bin: CODEMOD, argv: (a) => [a.graph, '--merge', a.merge, '--into', a.into],
    description: 'Plan a consolidation merge (report-only): canonical survivor, exact deletions + caller rewrites, LOC reclaimed, and the projected regression-gate verdict. Read-only — does NOT modify source.' },
];
const PROP = {
  graph: { type: 'string', description: 'Path to the codeweb graph.json to query' },
  symbol: { type: 'string', description: 'A node id (file:label) or a bare label' },
  before: { type: 'string', description: 'Path to the BEFORE graph.json snapshot' },
  after: { type: 'string', description: 'Path to the AFTER graph.json snapshot' },
  signature: { type: 'string', description: 'A candidate function signature or code snippet to check for existing duplicates' },
  calls: { type: 'string', description: 'Comma-separated ids/labels the new symbol will call (its intended callees)' },
  changed: { type: 'string', description: 'Comma-separated changed files, each optionally file:start-end (whole file if no range)' },
  rules: { type: 'string', description: 'Path to a codeweb.rules.json fitness-rules file' },
  merge: { type: 'string', description: 'Comma-separated symbol ids/labels to consolidate (merge)' },
  into: { type: 'string', description: 'The id/label to keep as the canonical survivor of the merge' },
};
const schema = (need) => ({ type: 'object', properties: Object.fromEntries(need.map((k) => [k, PROP[k]])), required: need });

function handleToolCall(id, params) {
  const name = params && params.name;
  const args = (params && params.arguments) || {};
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return fail(id, -32602, `unknown tool: ${name}`);
  for (const k of tool.need) {
    if (typeof args[k] !== 'string' || args[k] === '') {
      return reply(id, { content: [{ type: 'text', text: `missing required argument: ${k}` }], isError: true });
    }
  }
  const bin = tool.bin || QUERY;
  const cliArgs = tool.argv ? tool.argv(args) : [args.graph, ...tool.flags(args)];
  const r = spawnSync(process.execPath, [bin, ...cliArgs, '--json'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status === 2 || r.error) {
    const text = (r.stderr || (r.error && r.error.message) || 'query failed').trim();
    return reply(id, { content: [{ type: 'text', text }], isError: true });
  }
  // exit 0 (results) or 1 (found:false) both emit valid JSON on stdout — pass it through verbatim.
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
    return reply(id, { protocolVersion: (params && params.protocolVersion) || DEFAULT_PROTOCOL, capabilities: { tools: {} }, serverInfo: SERVER });
  }
  if (method === 'ping') return reply(id, {});
  if (method === 'tools/list') return reply(id, { tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: schema(t.need) })) });
  if (method === 'tools/call') return handleToolCall(id, params);
  return fail(id, -32601, `method not found: ${method}`);
}

const rl = createInterface({ input: process.stdin });
rl.on('line', handle);
rl.on('close', () => process.exit(0));
