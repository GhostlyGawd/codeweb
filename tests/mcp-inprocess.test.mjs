// #33: the prescribed per-edit loop goes IN-PROCESS. codeweb_stats serves the receipt from the
// stats.json the server already reads (no child); codeweb_diff serves the delta from cachedGraph
// (after side) with a spawn fallback. Both must be BYTE-IDENTICAL to their CLIs — the server is a
// faithful fast path, not a second implementation. These drive the real server via spawnSync (a
// batched stdin) and compare the tool's text content to the CLI's --json stdout.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { tmpDir, cleanup, script, runNode } from './helpers.mjs';

const NODE = process.execPath;
const SERVER = script('mcp-server.mjs');
// Run the server with a batched stdin (+ optional env); return the parsed responses by id.
function server(msgs, env = {}) {
  const input = msgs.map((m) => JSON.stringify(m)).join('\n') + '\n';
  const r = spawnSync(NODE, [SERVER], { encoding: 'utf8', maxBuffer: 1 << 28, input, env: { ...process.env, ...env } });
  const byId = new Map();
  for (const l of (r.stdout || '').split('\n').filter(Boolean)) { try { const m = JSON.parse(l); if (m.id != null) byId.set(m.id, m); } catch { /* trace/other */ } }
  return { status: r.status, byId };
}
const INIT = { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} };
const call = (id, name, args) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });

// ---- fixtures ----------------------------------------------------------------------------------
const DN = (id, file, domain, exports) => ({ id, label: id.split(':')[1], file, domain, exports });
const BEFORE = { meta: { target: 'before' }, nodes: [DN('a.js:fa', 'a.js', 'app', true), DN('b.js:fb', 'b.js', 'core', false), DN('c.js:fc', 'c.js', 'data', false)], edges: [{ from: 'a.js:fa', to: 'b.js:fb', kind: 'call' }, { from: 'b.js:fb', to: 'c.js:fc', kind: 'call' }], domains: [], overlaps: [] };
const AFTER_REG = { meta: { target: 'after' }, nodes: [...BEFORE.nodes], edges: [...BEFORE.edges, { from: 'c.js:fc', to: 'a.js:fa', kind: 'call' }], domains: [], overlaps: [{ kind: 'duplicate-logic', severity: 'high', confidence: 'high', title: '`fc` duplicates `fa`', nodes: ['a.js:fa', 'c.js:fc'] }] };
const AFTER_CLEAN = { meta: { target: 'after-clean' }, nodes: [...BEFORE.nodes, DN('d.js:fnew', 'd.js', 'util', false)], edges: [...BEFORE.edges], domains: [], overlaps: [] };

let WS, GP, DBP, DAP, DAC;
before(() => {
  WS = tmpDir('codeweb-inproc-');
  GP = join(WS, 'graph.json'); writeFileSync(GP, JSON.stringify(BEFORE));
  DBP = join(WS, 'before.json'); writeFileSync(DBP, JSON.stringify(BEFORE));
  DAP = join(WS, 'after-reg.json'); writeFileSync(DAP, JSON.stringify(AFTER_REG));
  DAC = join(WS, 'after-clean.json'); writeFileSync(DAC, JSON.stringify(AFTER_CLEAN));
});
after(() => { if (WS) cleanup(WS); });

// ---- T-33.1 stats parity -----------------------------------------------------------------------
test('MP-STATS-PARITY: codeweb_stats (in-process) === stats.mjs --json — empty AND non-empty ledgers', () => {
  const NO_STATS = { CODEWEB_NO_STATS: '1' }; // freeze the ledger so the fast path can't bump it mid-compare
  // empty ledger (no stats.json beside the graph)
  const mcpEmpty = server([INIT, call(2, 'codeweb_stats', { graph: GP })], NO_STATS).byId.get(2).result;
  const cliEmpty = runNode(script('stats.mjs'), [GP, '--json'], { env: NO_STATS });
  assert.ok(!mcpEmpty.isError);
  assert.equal(mcpEmpty.content[0].text.trim(), cliEmpty.stdout.trim(), 'empty-ledger receipt parity');
  assert.match(mcpEmpty.content[0].text, /"empty":true/, 'the empty note is served in-process (no child)');
  // non-empty ledger
  writeFileSync(join(WS, 'stats.json'), JSON.stringify({ since: '2026-01', months: { '2026-01': { queriesServed: 5, cardsDelivered: 2 } } }));
  const mcpFull = server([INIT, call(3, 'codeweb_stats', { graph: GP })], NO_STATS).byId.get(3).result;
  const cliFull = runNode(script('stats.mjs'), [GP, '--json'], { env: NO_STATS });
  assert.equal(mcpFull.content[0].text.trim(), cliFull.stdout.trim(), 'non-empty-ledger receipt parity');
});

test('MP-STATS-MISSING: codeweb_stats on a missing graph falls through to the spawned CLI (identical errResult text)', () => {
  const bad = join(WS, 'nope.json');
  const mcp = server([INIT, call(4, 'codeweb_stats', { graph: bad })]).byId.get(4).result;
  const cli = runNode(script('stats.mjs'), [bad, '--json']);
  assert.ok(mcp.isError, 'missing graph → isError result (via the spawn fallback, not invented text)');
  assert.equal(cli.status, 2, 'the CLI dies exit 2 on a missing graph');
  assert.ok(mcp.content[0].text.includes(cli.stderr.trim()), 'the MCP errResult carries the CLI stderr verbatim');
});

// ---- T-33.3 diff parity ------------------------------------------------------------------------
test('MP-DIFF-PARITY: codeweb_diff (in-process from cachedGraph) === diff.mjs --json, byte-for-byte (MD1/MD2/MD2b)', () => {
  for (const [id, before, afterPath, label] of [[10, DBP, DBP, 'MD1 clean'], [11, DBP, DAP, 'MD2 regression'], [12, DBP, DAC, 'MD2b new-orphan']]) {
    const mcp = server([INIT, call(id, 'codeweb_diff', { before, after: afterPath })]).byId.get(id).result;
    const cli = runNode(script('diff.mjs'), [before, afterPath, '--json']);
    assert.ok(!mcp.error, `${label}: a diff result, not a protocol error`);
    assert.equal(mcp.content[0].text.trim(), cli.stdout.trim(), `${label}: fast-path text === diff.mjs --json`);
  }
});

test('MP-DIFF-FALLBACK: codeweb_diff on a nonexistent after graph → isError (spawn fallback), stdout stays pure', () => {
  const r = server([INIT, call(20, 'codeweb_diff', { before: DBP, after: join(WS, 'ghost.json') })]);
  assert.equal(r.status, 0, 'server exits 0');
  const res = r.byId.get(20).result;
  assert.ok(res.isError, 'the in-process attempt throws on a bad after → spawned diff.mjs → isError');
  assert.match(res.content[0].text, /not found|no such|cannot/i);
});
