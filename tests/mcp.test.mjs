// Characterization tests for scripts/mcp-server.mjs — the MCP stdio server exposing codeweb's
// queries as tools an agent calls mid-task. Newline-delimited JSON-RPC 2.0 over stdin/stdout,
// zero-dependency. Written TDD-red, hardened after a review gate. We drive it by writing a batch
// of requests to stdin and parsing newline-delimited responses (spawnSync closes stdin -> exit).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { writeFileSync, readFileSync } from 'node:fs';
import { tmpDir, cleanup, script, writeTree, runNode, readJSON, PLUGIN_ROOT } from './helpers.mjs';

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
  // serverInfo.version tracks package.json — the drift the consistency gate previously missed
  const pkg = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'package.json'), 'utf8'));
  assert.equal(res.serverInfo.version, pkg.version, 'serverInfo.version derives from package.json');
});

test('M2: tools/list exposes the full tool set with object schemas + correct required args', () => {
  const tools = rpc([INIT, { jsonrpc: '2.0', id: 2, method: 'tools/list' }]).byId.get(2).result.tools;
  assert.deepEqual(tools.map((t) => t.name).sort(),
    ['codeweb_annotate', 'codeweb_break_cycles', 'codeweb_brief', 'codeweb_callees', 'codeweb_callers', 'codeweb_campaign', 'codeweb_codemod',
      'codeweb_context', 'codeweb_cycles', 'codeweb_deadcode', 'codeweb_diff', 'codeweb_explain', 'codeweb_find',
      'codeweb_find_similar', 'codeweb_fitness', 'codeweb_hotspots', 'codeweb_impact', 'codeweb_map',
      'codeweb_orphans', 'codeweb_placement', 'codeweb_reading_order', 'codeweb_refresh', 'codeweb_review',
      'codeweb_risk', 'codeweb_simulate', 'codeweb_stats', 'codeweb_tests']);
  for (const t of tools) {
    assert.ok(t.description && t.description.length > 0, `${t.name} has a description`);
    assert.equal(t.inputSchema.type, 'object', `${t.name} inputSchema is an object`);
  }
  // `graph` is OPTIONAL everywhere now (auto-discovery: CODEWEB_WS or nearest .codeweb/graph.json) —
  // the recurring path-threading tax was pure friction. Only the true inputs stay required.
  const req = (n) => tools.find((t) => t.name === n).inputSchema.required;
  const opt = (n) => Object.keys(tools.find((t) => t.name === n).inputSchema.properties);
  assert.deepEqual(req('codeweb_callers'), ['symbol']);
  assert.deepEqual(req('codeweb_callees'), ['symbol']);
  assert.deepEqual(req('codeweb_impact'), ['symbol']);
  assert.deepEqual(req('codeweb_cycles'), []);
  assert.deepEqual(req('codeweb_orphans'), []);
  assert.deepEqual(req('codeweb_diff'), ['before', 'after']);
  assert.deepEqual(req('codeweb_tests'), ['symbol']);
  assert.deepEqual(req('codeweb_find_similar'), [], 'signature|body validated at call time');
  assert.deepEqual(req('codeweb_placement'), ['calls']);
  assert.deepEqual(req('codeweb_review'), ['changed']);
  assert.deepEqual(req('codeweb_fitness'), ['rules']);
  assert.deepEqual(req('codeweb_risk'), []);
  assert.deepEqual(req('codeweb_break_cycles'), []);
  assert.deepEqual(req('codeweb_deadcode'), []);
  assert.deepEqual(req('codeweb_codemod'), ['merge', 'into']);
  assert.deepEqual(req('codeweb_context'), ['symbol']);
  assert.deepEqual(req('codeweb_refresh'), []);
  assert.deepEqual(req('codeweb_hotspots'), []);
  assert.deepEqual(req('codeweb_campaign'), []);
  assert.deepEqual(req('codeweb_reading_order'), []);
  assert.deepEqual(req('codeweb_map'), []);
  assert.deepEqual(req('codeweb_explain'), ['symbol']);
  // the previously CLI-only power is now agent-reachable
  assert.ok(opt('codeweb_find_similar').includes('body') && opt('codeweb_find_similar').includes('structural'), 'find_similar exposes body+structural');
  assert.ok(opt('codeweb_review').includes('before') && opt('codeweb_review').includes('gate'), 'review exposes before+gate');
  assert.ok(opt('codeweb_reading_order').includes('scope') && opt('codeweb_reading_order').includes('budget'), 'reading_order exposes scope+budget');
  // budgeted tools advertise limit/full
  for (const n of ['codeweb_impact', 'codeweb_callers', 'codeweb_deadcode', 'codeweb_context', 'codeweb_risk', 'codeweb_hotspots']) {
    assert.ok(opt(n).includes('full'), `${n} exposes full`);
  }
});

test('M2b: initialize carries workflow instructions; unknown client protocol falls back to ours', () => {
  const res = rpc([INIT]).byId.get(1).result;
  assert.ok(res.instructions && /codeweb_context|codeweb_impact/.test(res.instructions), 'instructions teach the loop');
  const weird = rpc([{ ...INIT, params: { ...INIT.params, protocolVersion: '1999-01-01' } }]).byId.get(1).result;
  assert.equal(weird.protocolVersion, '2025-06-18', 'unsupported client version -> our latest, not an echo');
});

test('M3: tools/call codeweb_impact returns the query JSON as text content', () => {
  const res = rpc([INIT, callTool(3, 'codeweb_impact', { graph: GP, symbol: 'b.js:helper' })]).byId.get(3).result;
  assert.ok(!res.isError);
  assert.equal(res.content[0].type, 'text');
  const payload = JSON.parse(res.content[0].text);
  assert.equal(payload.query, 'impact');
  assert.deepEqual(payload.results, ['a.js:main']);
});

test('M3b: tools/call codeweb_review (a new agent tool) returns its JSON through the server', () => {
  const res = rpc([INIT, callTool(31, 'codeweb_review', { graph: GP, changed: 'b.js' })]).byId.get(31).result;
  assert.ok(!res.isError, 'review is a valid result');
  const payload = JSON.parse(res.content[0].text);
  assert.deepEqual(payload.changedSymbols, ['b.js:helper']); // whole-file change selects b.js's symbols
  assert.deepEqual(payload.blastRadius.ids, ['a.js:main']);   // main calls helper -> in the blast radius
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

// --- Tier 0-3 new tools: context (F1), refresh (F2), hotspots (F4), campaign (F5), reading_order (F8) ---
// context + refresh need a graph whose meta.root points at real source on disk.

let SRCWS, SRCGP;
before(() => {
	SRCWS = tmpDir('codeweb-mcp-src-');
	const root = join(SRCWS, 'src');
	writeTree(root, {
		'main.js': 'import { helper } from "./util.js";\nexport function main() { return helper(2); }\n',
		'util.js': 'export function helper(x) {\n  if (x > 0) return x * 2;\n  return 0;\n}\n',
	});
	const G = {
		meta: { root: root.replace(/\\/g, '/'), target: 'mcp-src' }, domains: [], overlaps: [],
		nodes: [
			{ id: 'main.js:main', label: 'main', kind: 'function', file: 'main.js', line: 2, loc: 1, exports: true, domain: 'app', complexity: 1, maxDepth: 0 },
			{ id: 'util.js:helper', label: 'helper', kind: 'function', file: 'util.js', line: 1, loc: 4, exports: true, domain: 'lib', complexity: 2, maxDepth: 1 },
		],
		edges: [{ from: 'main.js:main', to: 'util.js:helper', kind: 'call' }],
	};
	SRCGP = join(SRCWS, 'graph.json'); writeFileSync(SRCGP, JSON.stringify(G));
});
after(() => { if (SRCWS) cleanup(SRCWS); });

// CTX-MCP-PARITY: the MCP tool result must be BYTE-IDENTICAL to context-pack.mjs --json stdout — the
// server is a faithful pass-through, not a re-implementation (so there is one context impl, not two).
test('M11 / CTX-MCP-PARITY: codeweb_context output == context-pack.mjs --json, verbatim (F1)', () => {
	for (const sym of ['util.js:helper', 'main.js:main', 'zzzNope']) {
		const res = rpc([INIT, callTool(40, 'codeweb_context', { graph: SRCGP, symbol: sym })]).byId.get(40)?.result;
		assert.ok(res, `got a tools/call result for ${sym}`);
		const cli = runNode(script('context-pack.mjs'), [SRCGP, sym, '--json']);
		assert.equal((res.content?.[0]?.text ?? '').trim(), cli.stdout.trim(), `MCP context parity for ${sym}`);
	}
	// sanity that the parity payload is the real thing (caller/blast), not an empty echo
	const res = rpc([INIT, callTool(45, 'codeweb_context', { graph: SRCGP, symbol: 'util.js:helper' })]).byId.get(45)?.result;
	const payload = JSON.parse(res.content[0].text);
	assert.equal(payload.callers[0].id, 'main.js:main');
	assert.ok(/helper/.test(payload.target[0].body), 'target body included from source');
});

// RFS-MCP-PARITY + RFS-IDEMPOTENT: refresh through MCP equals refresh.mjs --json, and a second refresh
// on an unchanged tree yields identical node+edge id-sets (overlaps always emptied).
test('M12 / RFS-MCP-PARITY + IDEMPOTENT: codeweb_refresh matches the CLI and is idempotent (F2)', () => {
	// isolate a copy so the CLI parity run and the MCP run don't fight over the same on-disk graph
	const dir = tmpDir('codeweb-rfs-');
	try {
		const root = join(SRCWS, 'src').replace(/\\/g, '/');
		const G = readJSON(SRCGP);
		const gpCli = join(dir, 'cli.json'); writeFileSync(gpCli, JSON.stringify(G));
		const gpMcp = join(dir, 'mcp.json'); writeFileSync(gpMcp, JSON.stringify(G));
		const cli = runNode(script('refresh.mjs'), [gpCli, '--json']);
		const res = rpc([INIT, callTool(41, 'codeweb_refresh', { graph: gpMcp })]).byId.get(41)?.result;
		assert.ok(res && !res.isError, res?.content?.[0]?.text);
		// the refreshed on-disk graphs must be identical (the summary paths differ, so compare the graphs)
		const a = readJSON(gpCli), b = readJSON(gpMcp);
		assert.deepEqual(a.nodes.map((n) => n.id).sort(), b.nodes.map((n) => n.id).sort(), 'MCP refresh == CLI refresh (nodes)');
		assert.deepEqual(a.edges.map((e) => `${e.from} ${e.to} ${e.kind}`).sort(), b.edges.map((e) => `${e.from} ${e.to} ${e.kind}`).sort(), 'edges');
		// idempotent: refresh again, id-sets unchanged, overlaps empty
		const before = b.nodes.map((n) => n.id).sort();
		rpc([INIT, callTool(46, 'codeweb_refresh', { graph: gpMcp })]);
		const c = readJSON(gpMcp);
		assert.deepEqual(c.nodes.map((n) => n.id).sort(), before, 'second refresh on an unchanged tree is idempotent');
		assert.deepEqual(c.overlaps, [], 'refresh always empties overlaps');
	} finally { cleanup(dir); }
});

test('M13: codeweb_hotspots ranks symbols (F4)', () => {
	const r = rpc([INIT, callTool(42, 'codeweb_hotspots', { graph: SRCGP })]).byId.get(42)?.result;
	assert.ok(r && !r.isError, r?.content?.[0]?.text);
	const payload = JSON.parse(r.content[0].text);
	assert.ok(Array.isArray(payload.ranked) && payload.ranked.length >= 2);
	assert.ok('complexity' in payload.ranked[0].components);
});

test('M14: codeweb_campaign returns an ordered worklist (F5)', () => {
	const r = rpc([INIT, callTool(43, 'codeweb_campaign', { graph: SRCGP })]).byId.get(43)?.result;
	assert.ok(r && !r.isError, r?.content?.[0]?.text);
	const payload = JSON.parse(r.content[0].text);
	assert.ok(Array.isArray(payload.steps), 'emits steps[]');
	assert.ok('totals' in payload);
});

test('M15: codeweb_reading_order returns a bounded foundations-first path (F8)', () => {
	const r = rpc([INIT, callTool(44, 'codeweb_reading_order', { graph: SRCGP })]).byId.get(44)?.result;
	assert.ok(r && !r.isError, r?.content?.[0]?.text);
	const payload = JSON.parse(r.content[0].text);
	assert.ok(Array.isArray(payload.order) && payload.order.length >= 1);
	// helper is a foundation (called by main) -> must precede main in the reading order
	const ids = payload.order.map((o) => o.id);
	assert.ok(ids.indexOf('util.js:helper') < ids.indexOf('main.js:main'), 'callee precedes caller');
});

// #11 (IMPROVEMENTS.md): the loop's last steps arrive over MCP — pre-flight, suppression
// memory, the value receipt — and codeweb_map reports progress when the client asks for it.
test('codeweb_simulate pre-flights a delete and returns the gate verdict', () => {
  const input = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'codeweb_simulate', arguments: { graph: GP, delete: 'b.js:helper' } } },
  ].map((m) => JSON.stringify(m)).join('\n') + '\n';
  const r = spawnServer(input);
  const res = parseLines(r.stdout).find((m) => m.id === 2)?.result;
  assert.ok(res && !res.isError, JSON.stringify(res));
  const p = JSON.parse(res.content[0].text);
  assert.equal(p.op, 'delete');
  // gate semantics: a pure removal passes; the verdict shape is the contract
  assert.ok(typeof p.projected.ok === 'boolean' && Array.isArray(p.projected.newCycles) && Array.isArray(p.projected.lostCallers), 'projected gate verdict shape');
});

test('codeweb_simulate validates its mode arguments', () => {
  const input = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'codeweb_simulate', arguments: { graph: GP } } },
  ].map((m) => JSON.stringify(m)).join('\n') + '\n';
  const res = parseLines(spawnServer(input).stdout).find((m) => m.id === 2)?.result;
  assert.ok(res.isError, 'no mode -> isError');
  assert.match(res.content[0].text, /exactly one of/);
});

test('codeweb_annotate records a suppression beside the graph and lists it back', () => {
  const ws = tmpDir('codeweb-mcp-ann-');
  try {
    const gp = join(ws, 'graph.json');
    writeFileSync(gp, JSON.stringify(GRAPH));
    const input = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'codeweb_annotate', arguments: { graph: gp, suppress: 'orphan:a.js:main', note: 'framework-invoked' } } },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'codeweb_annotate', arguments: { graph: gp, list: true } } },
    ].map((m) => JSON.stringify(m)).join('\n') + '\n';
    const r = spawnServer(input);
    const lines = parseLines(r.stdout);
    const add = lines.find((m) => m.id === 2)?.result;
    assert.ok(add && !add.isError, JSON.stringify(add));
    const listed = JSON.parse(lines.find((m) => m.id === 3).result.content[0].text);
    assert.ok(JSON.stringify(listed).includes('orphan:a.js:main'), 'suppression listed back');
    assert.ok(readFileSync(join(ws, 'annotations.json'), 'utf8').includes('framework-invoked'), 'written beside the graph');
  } finally { cleanup(ws); }
});

test('codeweb_stats serves the value receipt over MCP', () => {
  const input = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'codeweb_stats', arguments: { graph: GP } } },
  ].map((m) => JSON.stringify(m)).join('\n') + '\n';
  const res = parseLines(spawnServer(input).stdout).find((m) => m.id === 2)?.result;
  assert.ok(res && !res.isError, JSON.stringify(res));
  const p = JSON.parse(res.content[0].text);
  assert.ok(p.empty || p.months, 'receipt shape (empty note or months)');
});

test('codeweb_map emits notifications/progress when the client sends a progressToken', () => {
  const dir = tmpDir('codeweb-mcp-map-');
  try {
    writeTree(dir, { 'a.js': 'export function alpha() { return 1; }\n' });
    const input = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'codeweb_map', arguments: { target: dir }, _meta: { progressToken: 'map-1' } } },
    ].map((m) => JSON.stringify(m)).join('\n') + '\n';
    const r = spawnServer(input);
    const lines = parseLines(r.stdout);
    const progress = lines.filter((m) => m.method === 'notifications/progress');
    assert.ok(progress.length >= 2, `at least stage + done notifications (got ${progress.length})`);
    assert.ok(progress.every((n) => n.params.progressToken === 'map-1'), 'token echoed');
    assert.ok(progress.some((n) => /extract/.test(n.params.message)), 'stage names surface');
    const res = lines.find((m) => m.id === 2)?.result;
    assert.ok(res && !res.isError, JSON.stringify(res));
    assert.match(res.content[0].text, /"ok":true/);
  } finally { cleanup(dir); }
});
