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
];
const PROP = {
  graph: { type: 'string', description: 'Path to the codeweb graph.json to query' },
  symbol: { type: 'string', description: 'A node id (file:label) or a bare label' },
  before: { type: 'string', description: 'Path to the BEFORE graph.json snapshot' },
  after: { type: 'string', description: 'Path to the AFTER graph.json snapshot' },
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
