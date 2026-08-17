// AC-10 (ac_10): codeweb_dependents over MCP — the union answer ("who do I break?") that
// codeweb_callers cannot see: call + import + inherit + test + ref edges, one budgeted reply.
// The CLI's --dependents mode existed; the manifest entry now serves both transports (D1).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { tmpDir, cleanup, script } from './helpers.mjs';

const GRAPH = {
  meta: { target: 'dependents-fixture' },
  nodes: [
    { id: 'b.js:helper', label: 'helper', file: 'b.js', domain: 'lib', exports: true },
    { id: 'a.js:main', label: 'main', file: 'a.js', domain: 'app', exports: false },
    { id: 'c.js:mod', label: 'mod', file: 'c.js', domain: 'app', exports: false },
    { id: 'd.js:Sub', label: 'Sub', file: 'd.js', domain: 'app', exports: false },
    { id: 't.js:t1', label: 't1', file: 't.js', domain: 'app', exports: false },
    { id: 'e.js:cb', label: 'cb', file: 'e.js', domain: 'app', exports: false },
  ],
  edges: [
    { from: 'a.js:main', to: 'b.js:helper', kind: 'call' },
    { from: 'c.js:mod', to: 'b.js:helper', kind: 'import' },
    { from: 'd.js:Sub', to: 'b.js:helper', kind: 'inherit' },
    { from: 't.js:t1', to: 'b.js:helper', kind: 'test' },
    { from: 'e.js:cb', to: 'b.js:helper', kind: 'ref' },
  ],
  domains: [], overlaps: [],
};

let WS, GP;
before(() => { WS = tmpDir('codeweb-dep-'); GP = join(WS, 'graph.json'); writeFileSync(GP, JSON.stringify(GRAPH)); });
after(() => { if (WS) cleanup(WS); });

const INIT = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } };
function rpc(messages) {
  const input = messages.map((m) => JSON.stringify(m)).join('\n') + '\n';
  const r = spawnSync(process.execPath, [script('mcp-server.mjs')], { encoding: 'utf8', input, maxBuffer: 1 << 28 });
  if (r.error) throw new Error(`mcp-server.mjs spawn failed: ${r.error.message}`);
  const responses = (r.stdout || '').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return new Map(responses.map((x) => [x.id, x]));
}
const call = (id, args) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'codeweb_dependents', arguments: args } });

test('ac_10: codeweb_dependents returns the full union (call+import+inherit+test+ref) with byKind', () => {
  const res = rpc([INIT, call(2, { graph: GP, symbol: 'b.js:helper', full: true })]).get(2).result;
  assert.ok(!res.isError, res.content?.[0]?.text);
  const p = JSON.parse(res.content[0].text);
  assert.equal(p.query, 'dependents');
  assert.equal(p.count, 5, `all five edge kinds counted, got: ${res.content[0].text}`);
  for (const k of ['call', 'import', 'inherit', 'test', 'ref']) {
    const v = (p.byKind || {})[k];
    assert.ok(Array.isArray(v) ? v.length >= 1 : v >= 1, `byKind carries ${k}: ${JSON.stringify(p.byKind)}`);
  }
});

test('ac_10: dependents answers are budgeted with true totals (limit -> more.remaining)', () => {
  const res = rpc([INIT, call(3, { graph: GP, symbol: 'b.js:helper', limit: 2 })]).get(3).result;
  assert.ok(!res.isError, res.content?.[0]?.text);
  const p = JSON.parse(res.content[0].text);
  assert.equal(p.count, 5, 'count stays the TRUE total');
  assert.equal(p.results.length, 2, 'limit caps the list');
  assert.ok(p.more && p.more.remaining === 3, `more describes the remainder: ${JSON.stringify(p.more)}`);
});

test('ac_10: the CLI serves the same mode from the same manifest entry (--dependents)', () => {
  const r = spawnSync(process.execPath, [script('query.mjs'), GP, '--dependents', 'b.js:helper', '--json'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const p = JSON.parse(r.stdout);
  assert.equal(p.query, 'dependents');
  assert.equal(p.count, 5);
});
