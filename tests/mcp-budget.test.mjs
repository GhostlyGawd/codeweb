// P1 — the token flip, over MCP. Three contracts:
//   1. BUDGET INJECTION: list-heavy tools default to top-N + `more.remaining` (count stays the true
//      total); `full: true` restores the unabridged list; an explicit `limit` wins over the default.
//   2. GRAPH AUTO-DISCOVERY: `graph` is optional — the server resolves the nearest
//      `.codeweb/graph.json` above its cwd (or CODEWEB_WS); no graph -> an ACTIONABLE error that
//      names codeweb_map, not a bare "not found".
//   3. codeweb_map: builds a real graph over MCP so a session never dead-ends.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpDir, cleanup, script, writeTree } from './helpers.mjs';

// 60 helpers all called by main -> a fat caller/impact list to exercise budgets.
function fatGraph() {
  const nodes = [{ id: 'hub.js:hub', label: 'hub', kind: 'function', file: 'hub.js', line: 1, loc: 2, exports: true, domain: 'core' }];
  const edges = [];
  for (let i = 0; i < 60; i++) {
    nodes.push({ id: `caller${i}.js:fn${i}`, label: `fn${i}`, kind: 'function', file: `caller${i}.js`, line: 1, loc: 3, exports: false, domain: 'app' });
    edges.push({ from: `caller${i}.js:fn${i}`, to: 'hub.js:hub', kind: 'call', weight: 1 });
  }
  return { meta: { target: 'budget-fixture' }, nodes, edges, domains: [], overlaps: [] };
}

function rpc(messages, { cwd, env } = {}) {
  const input = messages.map((m) => JSON.stringify(m)).join('\n') + '\n';
  const r = spawnSync(process.execPath, [script('mcp-server.mjs')], { encoding: 'utf8', input, maxBuffer: 1 << 28, cwd, env: { ...process.env, CODEWEB_WS: '', ...env } });
  const responses = (r.stdout || '').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return { byId: new Map(responses.map((x) => [x.id, x])) };
}
const INIT = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } };
const call = (id, name, args) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
const resultOf = (r, id) => JSON.parse(r.byId.get(id).result.content[0].text);

test('budget injection: callers defaults to top-20 + more; full:true unabridged; explicit limit wins', () => {
  const ws = tmpDir('codeweb-bud-');
  try {
    const gp = join(ws, 'graph.json');
    writeFileSync(gp, JSON.stringify(fatGraph()));
    const dflt = resultOf(rpc([INIT, call(2, 'codeweb_callers', { graph: gp, symbol: 'hub' })]), 2);
    assert.equal(dflt.count, 60, 'count stays the TRUE total');
    assert.equal(dflt.results.length, 20, 'default budget top-20');
    assert.equal(dflt.more.remaining, 40, 'remainder is explicit, never silent');
    assert.ok(dflt.summary, 'a one-line summary rides along');

    const full = resultOf(rpc([INIT, call(3, 'codeweb_callers', { graph: gp, symbol: 'hub', full: true })]), 3);
    assert.equal(full.results.length, 60, 'full:true removes the budget');
    assert.equal(full.more, undefined);

    const lim = resultOf(rpc([INIT, call(4, 'codeweb_callers', { graph: gp, symbol: 'hub', limit: 5 })]), 4);
    assert.equal(lim.results.length, 5, 'explicit limit wins over the default');
    assert.equal(lim.more.remaining, 55);

    const paged = resultOf(rpc([INIT, call(5, 'codeweb_callers', { graph: gp, symbol: 'hub', limit: 5, offset: 55 })]), 5);
    assert.equal(paged.results.length, 5, 'offset pages the same ordering');
    assert.equal(paged.more, undefined, 'last page has no remainder');
  } finally { cleanup(ws); }
});

test('graph auto-discovery: nearest .codeweb/graph.json above cwd; none -> actionable error naming codeweb_map', () => {
  const ws = tmpDir('codeweb-disc-');
  try {
    const repo = join(ws, 'repo');
    mkdirSync(join(repo, '.codeweb'), { recursive: true });
    mkdirSync(join(repo, 'src', 'deep'), { recursive: true });
    writeFileSync(join(repo, '.codeweb', 'graph.json'), JSON.stringify(fatGraph()));
    // called from a nested dir with NO graph arg -> walks up and finds repo/.codeweb/graph.json
    const found = resultOf(rpc([INIT, call(2, 'codeweb_callers', { symbol: 'hub' })], { cwd: join(repo, 'src', 'deep') }), 2);
    assert.equal(found.count, 60, 'discovered the repo graph without a graph argument');

    const bare = join(ws, 'bare');
    mkdirSync(bare, { recursive: true });
    const err = rpc([INIT, call(3, 'codeweb_callers', { symbol: 'hub' })], { cwd: bare }).byId.get(3).result;
    assert.ok(err.isError, 'no graph anywhere -> isError');
    assert.match(err.content[0].text, /codeweb_map/, 'the error names the tool that fixes it');
  } finally { cleanup(ws); }
});

test('codeweb_map: builds a real graph over MCP and reports the path + stats', () => {
  const ws = tmpDir('codeweb-map-');
  try {
    writeTree(join(ws, 'proj'), {
      'a.js': 'export function alpha() {\n  return beta();\n}\n',
      'b.js': 'export function beta() {\n  return 1;\n}\n',
    });
    const res = rpc([INIT, call(2, 'codeweb_map', { target: join(ws, 'proj') })]).byId.get(2).result;
    assert.ok(!res.isError, `map failed: ${res.content[0].text}`);
    const payload = JSON.parse(res.content[0].text);
    assert.ok(payload.ok);
    assert.match(payload.summary, /\d+ symbols/, 'summary carries stats');
    // and the graph it built immediately serves queries (the dead-end is gone)
    const q = resultOf(rpc([INIT, call(3, 'codeweb_callers', { graph: payload.graph, symbol: 'beta' })]), 3);
    assert.deepEqual(q.results, ['a.js:alpha']);
  } finally { cleanup(ws); }
});

test('find_similar accepts an inline body over MCP (stdin plumbing) + structural flag', () => {
  const ws = tmpDir('codeweb-fs-');
  try {
    const proj = join(ws, 'proj');
    writeTree(proj, {
      'util.js': 'export function sum(list) {\n  let acc = 0;\n  for (const x of list) acc += x;\n  return acc;\n}\n',
    });
    const map = rpc([INIT, call(2, 'codeweb_map', { target: proj })]).byId.get(2).result;
    const gp = JSON.parse(map.content[0].text).graph;
    const res = rpc([INIT, call(3, 'codeweb_find_similar', {
      graph: gp,
      body: 'function total(items) {\n  let acc = 0;\n  for (const x of items) acc += x;\n  return acc;\n}',
      structural: true,
    })]).byId.get(3).result;
    assert.ok(!res.isError, res.content[0].text);
    const payload = JSON.parse(res.content[0].text);
    assert.equal(payload.candidate.mode, 'structural');
    assert.ok(payload.matches.some((m) => m.id === 'util.js:sum'), 'the renamed clone is found');
  } finally { cleanup(ws); }
});
