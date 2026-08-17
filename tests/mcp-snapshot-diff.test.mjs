// AC-9 (ac_9): the MCP-only after-edit gate loop. codeweb_refresh {snapshot:true} preserves the
// pre-refresh graph as graph.prev.json, and codeweb_diff defaults before:"prev" / after: the
// discovered graph — so refresh → diff completes with no shell copy step (the gap that made the
// prescribed loop Claude-hooks-only; reports/PLAN.md finding 2, reports/API.md F9).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpDir, cleanup, script } from './helpers.mjs';

let ROOT, PROJ, WSDIR, GP, ORIGINAL;
before(() => {
  ROOT = tmpDir('codeweb-snap-');
  PROJ = join(ROOT, 'proj');
  mkdirSync(PROJ, { recursive: true });
  writeFileSync(join(PROJ, 'a.js'), 'export function one() { return two(); }\nexport function two() { return 1; }\n');
  WSDIR = join(ROOT, '.codeweb');
  mkdirSync(WSDIR, { recursive: true });
  GP = join(WSDIR, 'graph.json');
  ORIGINAL = JSON.stringify({
    meta: { target: 'snap-fixture', root: PROJ },
    nodes: [{ id: 'a.js:one', label: 'one', file: 'a.js', domain: 'app', exports: true }],
    edges: [], domains: [], overlaps: [],
  });
  writeFileSync(GP, ORIGINAL);
});
after(() => { if (ROOT) cleanup(ROOT); });

const INIT = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } };
const call = (id, name, args) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
// cwd = ROOT so graph auto-discovery finds ROOT/.codeweb/graph.json — the loop as a real
// MCP-only client (Cursor/Windsurf/Codex) experiences it, no paths threaded anywhere.
function rpc(messages) {
  const input = messages.map((m) => JSON.stringify(m)).join('\n') + '\n';
  const r = spawnSync(process.execPath, [script('mcp-server.mjs')], { encoding: 'utf8', input, cwd: ROOT, maxBuffer: 1 << 28 });
  if (r.error) throw new Error(`mcp-server.mjs spawn failed: ${r.error.message}`);
  const responses = (r.stdout || '').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return new Map(responses.map((x) => [x.id, x]));
}

test('ac_9: diff {} before any snapshot fails with the refresh {snapshot:true} remedy', () => {
  const res = rpc([INIT, call(2, 'codeweb_diff', {})]).get(2).result;
  assert.ok(res.isError, 'no snapshot yet -> isError');
  assert.match(res.content[0].text, /snapshot:true/, 'the remedy names the exact call');
});

test('ac_9: refresh {snapshot:true} then diff {} completes the loop in one MCP session', () => {
  const byId = rpc([INIT, call(2, 'codeweb_refresh', { snapshot: true }), call(3, 'codeweb_diff', {})]);
  const refresh = byId.get(2).result;
  assert.ok(!refresh.isError, refresh.content?.[0]?.text);
  const rp = JSON.parse(refresh.content[0].text);
  assert.ok(rp.snapshot && rp.snapshot.endsWith('graph.prev.json'), `refresh names the snapshot: ${refresh.content[0].text}`);
  assert.ok(existsSync(join(WSDIR, 'graph.prev.json')), 'graph.prev.json written beside the live graph');
  assert.equal(readFileSync(join(WSDIR, 'graph.prev.json'), 'utf8'), ORIGINAL, 'the snapshot is the exact pre-refresh bytes');

  const diff = byId.get(3).result;
  assert.ok(!diff.isError, diff.content?.[0]?.text);
  const dp = JSON.parse(diff.content[0].text);
  assert.ok(dp.before, 'the before side resolved (snapshot target/basename)');
  assert.ok(dp.nodes, 'a real structural delta payload');
  assert.ok((dp.nodes.added || []).some((n) => String(n.id || n).includes('a.js:two')),
    `the delta sees the symbol the refresh discovered: ${diff.content[0].text.slice(0, 300)}`);
  // the refreshed extract discovers two() and the one->two call — new wired symbols, no regression
  assert.notEqual(dp.ok, false, `adding a wired symbol is not a regression: ${diff.content[0].text}`);
});

test('ac_9: the refresh CLI serves the same flag (--snapshot)', () => {
  writeFileSync(GP, ORIGINAL); // reset after the MCP leg rewrote it
  const r = spawnSync(process.execPath, [script('refresh.mjs'), GP, '--snapshot', '--json'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const p = JSON.parse(r.stdout);
  assert.ok(p.snapshot && p.snapshot.endsWith('graph.prev.json'));
  assert.equal(readFileSync(p.snapshot, 'utf8'), ORIGINAL);
});
