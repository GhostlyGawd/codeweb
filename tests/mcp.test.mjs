// Characterization tests for scripts/mcp-server.mjs — the MCP stdio server exposing codeweb's
// queries as tools an agent calls mid-task. Newline-delimited JSON-RPC 2.0 over stdin/stdout,
// zero-dependency. Written TDD-red, hardened after a review gate. We drive it by writing a batch
// of requests to stdin and parsing newline-delimited responses (spawnSync closes stdin -> exit).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { tmpDir, cleanup, script } from './helpers.mjs';

const GRAPH = {
  meta: { target: 'mcp-fixture' },
  nodes: [
    { id: 'a.js:main',   label: 'main',   file: 'a.js', domain: 'app', exports: false },
    { id: 'b.js:helper', label: 'helper', file: 'b.js', domain: 'lib', exports: true },
  ],
  edges: [{ from: 'a.js:main', to: 'b.js:helper', kind: 'call' }],
  domains: [], overlaps: [],
};

// diff fixtures (for codeweb_diff): BEFORE is a clean a->b->c chain; AFTER_REG adds a back-edge
// c->a (closing a file cycle a-b-c) AND a new duplicate-logic overlap -> two regressions. diff.mjs
// then exits 1 but still emits a valid JSON payload, which the tool must surface as a RESULT.
const DN = (id, file, domain, exports) => ({ id, label: id.split(':')[1], file, domain, exports });
const DIFF_BEFORE = {
  meta: { target: 'before' },
  nodes: [DN('a.js:fa', 'a.js', 'app', true), DN('b.js:fb', 'b.js', 'core', false), DN('c.js:fc', 'c.js', 'data', false)],
  edges: [{ from: 'a.js:fa', to: 'b.js:fb', kind: 'call' }, { from: 'b.js:fb', to: 'c.js:fc', kind: 'call' }],
  domains: [], overlaps: [],
};
const DIFF_AFTER_REG = {
  meta: { target: 'after' },
  nodes: [...DIFF_BEFORE.nodes],
  edges: [...DIFF_BEFORE.edges, { from: 'c.js:fc', to: 'a.js:fa', kind: 'call' }],
  domains: [],
  overlaps: [{ kind: 'duplicate-logic', severity: 'high', confidence: 'high', title: '`fc` duplicates `fa`', nodes: ['a.js:fa', 'c.js:fc'] }],
};

let WS, GP, DBP, DAP;
before(() => {
  WS = tmpDir('codeweb-mcp-');
  GP = join(WS, 'graph.json'); writeFileSync(GP, JSON.stringify(GRAPH));
  DBP = join(WS, 'before.json'); writeFileSync(DBP, JSON.stringify(DIFF_BEFORE));
  DAP = join(WS, 'after-reg.json'); writeFileSync(DAP, JSON.stringify(DIFF_AFTER_REG));
});
after(() => { if (WS) cleanup(WS); });

function spawnServer(input) {
  const r = spawnSync(process.execPath, [script('mcp-server.mjs')], { encoding: 'utf8', input, maxBuffer: 1 << 28 });
  if (r.error) throw new Error(`mcp-server.mjs spawn failed: ${r.error.message}`); // makes pre-impl RED explicit, not vacuous
  return r;
}
const parseLines = (stdout) => (stdout || '').split('\n').filter(Boolean).map((l) => {
  try { return JSON.parse(l); } catch { return { __unparseable: l }; }
});
// Send JSON-RPC message objects; assert stdout purity (the server's load-bearing invariant).
function rpc(messages) {
  const input = messages.map((m) => JSON.stringify(m)).join('\n') + '\n';
  const r = spawnServer(input);
  const responses = parseLines(r.stdout);
  const junk = responses.filter((x) => x.__unparseable);
  assert.equal(junk.length, 0, `stdout must be JSON-RPC only; got non-JSON: ${junk.map((j) => j.__unparseable).join(' | ')}`);
  return { status: r.status, stderr: r.stderr || '', responses, byId: new Map(responses.map((x) => [x.id, x])) };
}
const INIT = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } };
const callTool = (id, name, args) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });

test('M1: initialize returns protocolVersion, an object tools capability, and serverInfo', () => {
  const res = rpc([INIT]).byId.get(1)?.result;
  assert.ok(res, 'initialize answered');
  assert.ok(res.protocolVersion, 'a protocol version is set');
  assert.equal(typeof res.capabilities.tools, 'object', 'tools capability is an object, not a bare bool');
  assert.equal(res.serverInfo.name, 'codeweb');
});

test('M2: tools/list exposes the six tools with object schemas + correct required args', () => {
  const tools = rpc([INIT, { jsonrpc: '2.0', id: 2, method: 'tools/list' }]).byId.get(2).result.tools;
  assert.deepEqual(tools.map((t) => t.name).sort(),
    ['codeweb_callees', 'codeweb_callers', 'codeweb_cycles', 'codeweb_diff', 'codeweb_impact', 'codeweb_orphans']);
  for (const t of tools) {
    assert.ok(t.description && t.description.length > 0, `${t.name} has a description`);
    assert.equal(t.inputSchema.type, 'object', `${t.name} inputSchema is an object`);
  }
  const req = (n) => tools.find((t) => t.name === n).inputSchema.required;
  assert.deepEqual(req('codeweb_callers'), ['graph', 'symbol']);
  assert.deepEqual(req('codeweb_callees'), ['graph', 'symbol']);
  assert.deepEqual(req('codeweb_impact'), ['graph', 'symbol']);
  assert.deepEqual(req('codeweb_cycles'), ['graph']);
  assert.deepEqual(req('codeweb_orphans'), ['graph']);
	assert.deepEqual(req('codeweb_diff'), ['before', 'after']);
});

test('M3: tools/call codeweb_impact returns the query JSON as text content', () => {
  const res = rpc([INIT, callTool(3, 'codeweb_impact', { graph: GP, symbol: 'b.js:helper' })]).byId.get(3).result;
  assert.ok(!res.isError);
  assert.equal(res.content[0].type, 'text');
  const payload = JSON.parse(res.content[0].text);
  assert.equal(payload.query, 'impact');
  assert.deepEqual(payload.results, ['a.js:main']);
});

test('M4: tools/call resolves a bare label (codeweb_callers helper)', () => {
  const payload = JSON.parse(rpc([INIT, callTool(4, 'codeweb_callers', { graph: GP, symbol: 'helper' })]).byId.get(4).result.content[0].text);
  assert.deepEqual(payload.results, ['a.js:main']);
});

test('M5: unknown tool name -> JSON-RPC error -32602 (invalid params), not a crash', () => {
  const r = rpc([INIT, callTool(5, 'codeweb_nope', { graph: GP })]).byId.get(5);
  assert.ok(r.error, 'error object present');
  assert.equal(r.error.code, -32602);
});

test('M6: a not-found symbol is a valid tool result (found:false), not a protocol error', () => {
  const r = rpc([INIT, callTool(6, 'codeweb_callers', { graph: GP, symbol: 'zzzNope' })]).byId.get(6);
  assert.ok(!r.error);
  assert.equal(JSON.parse(r.result.content[0].text).found, false);
});

test('M6b: a missing required argument -> tool result with isError:true (not a JSON-RPC error)', () => {
  const r = rpc([INIT, callTool(10, 'codeweb_callers', { graph: GP })]).byId.get(10); // no symbol
  assert.ok(!r.error, 'still a tools/call result');
  assert.ok(r.result.isError, 'a usage/IO failure surfaces as isError:true');
});

test('M7: notifications (no id) get no response; later requests are still answered', () => {
  const { responses, byId } = rpc([
    INIT,
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 9, method: 'tools/list' },
  ]);
  assert.ok(byId.get(9), 'request after the notification is answered');
  assert.equal(responses.length, 2, 'two responses (init + tools/list); none for the notification');
  assert.ok(responses.every((r) => r.id !== undefined && r.id !== null), 'no id-less response leaked');
});

test('M8: unknown method -> method-not-found error (-32601)', () => {
  const r = rpc([INIT, { jsonrpc: '2.0', id: 8, method: 'foo/bar' }]).byId.get(8);
  assert.ok(r.error);
  assert.equal(r.error.code, -32601);
});

test('M9: the server exits cleanly (status 0) when stdin closes', () => {
  assert.equal(rpc([INIT]).status, 0);
});

test('M10: malformed JSON on stdin -> parse error -32700, no crash, recovers', () => {
  const input = 'this is not json\n' + JSON.stringify({ jsonrpc: '2.0', id: 11, method: 'tools/list' }) + '\n';
  const r = spawnServer(input);
  assert.equal(r.status, 0, 'server does not crash on bad input');
  const lines = parseLines(r.stdout);
  assert.ok(lines.find((l) => l.error && l.error.code === -32700), 'parse error -32700 emitted');
  assert.ok(lines.find((l) => l.id === 11), 'subsequent valid request still answered');
});

// --- codeweb_diff: the 6th tool, wrapping scripts/diff.mjs (before/after structural regression gate) ---

test('MD1: codeweb_diff on two clean snapshots returns the delta JSON as content, ok:true, not isError', () => {
	const r = rpc([INIT, callTool(20, 'codeweb_diff', { before: DBP, after: DBP })]).byId.get(20);
	assert.ok(!r.error, 'a successful diff is a tools/call result, not a JSON-RPC error');
	assert.ok(!r.result.isError);
	assert.equal(r.result.content[0].type, 'text');
	const payload = JSON.parse(r.result.content[0].text);
	assert.equal(payload.ok, true);
	assert.deepEqual(payload.regressions, []);
});

test('MD2: a regression (new cycle + new duplication) is a VALID result with ok:false, NOT isError', () => {
	const r = rpc([INIT, callTool(21, 'codeweb_diff', { before: DBP, after: DAP })]).byId.get(21);
	assert.ok(!r.error, 'diff.mjs exit 1 (regressions found) is a successful analysis, not a protocol error');
	assert.ok(!r.result.isError, 'a found regression is the RESULT payload, not a tool-execution failure');
	const payload = JSON.parse(r.result.content[0].text);
	assert.equal(payload.ok, false);
	assert.ok(payload.regressions.length >= 1, 'reports regression reasons for the agent to act on');
	assert.match(payload.regressions.join(' '), /cycle/i, 'names the new cycle');
	assert.match(payload.regressions.join(' '), /duplicat/i, 'names the new duplication finding');
});

test('MD2b: adding a brand-new uncalled node is reported but NOT a regression (ok:true)', () => {
	const AFTER_CLEAN = {
		meta: { target: 'after-clean' },
		nodes: [...DIFF_BEFORE.nodes, DN('d.js:fnew', 'd.js', 'util', false)],
		edges: [...DIFF_BEFORE.edges],
		domains: [], overlaps: [],
	};
	const p = join(WS, 'after-clean.json');
	writeFileSync(p, JSON.stringify(AFTER_CLEAN));
	const r = rpc([INIT, callTool(24, 'codeweb_diff', { before: DBP, after: p })]).byId.get(24);
	assert.ok(!r.result.isError);
	const payload = JSON.parse(r.result.content[0].text);
	assert.equal(payload.ok, true, 'adding a brand-new orphan node is not a regression');
	assert.ok(payload.orphans.added.includes('d.js:fnew'), 'new node appears in orphans.added');
});

test('MD3: codeweb_diff missing the "after" arg -> isError:true tool result naming the arg', () => {
	const r = rpc([INIT, callTool(22, 'codeweb_diff', { before: DBP })]).byId.get(22);
	assert.ok(!r.error, 'still a tools/call result, not a JSON-RPC error');
	assert.ok(r.result.isError, 'a missing required arg surfaces as isError:true');
	assert.match(r.result.content[0].text, /after/, 'names the missing argument');
});

test('MD4: codeweb_diff on a nonexistent graph file -> isError:true (IO), stdout stays pure JSON-RPC', () => {
	const r = rpc([INIT, callTool(23, 'codeweb_diff', { before: DBP, after: join(WS, 'nope.json') })]).byId.get(23);
	assert.ok(!r.error);
	assert.ok(r.result.isError, 'diff.mjs exit 2 (IO) -> isError');
	assert.match(r.result.content[0].text, /not found|no such|cannot/i);
});
