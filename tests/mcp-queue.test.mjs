// Unit tests for the mcp-server queue machinery (docs/specs/round2-ws-f.md §Queue redesign).
// queueKeyFor is pure and exported (the server's readline loop is gated behind isMain, so importing
// the module here does NOT start a server). The I5 settle-once unit drives the real server via
// spawnSync — a map child that fails must produce EXACTLY ONE reply and a clean drain (exit 0), the
// double-reply / double-decrement bug handleMap had before it was routed through runChild.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { queueKeyFor, TOOLS } from '../scripts/mcp-server.mjs';
import { tmpDir, cleanup, script } from './helpers.mjs';

const tool = (n) => TOOLS.find((t) => t.name === n);

// ---- T-30.1 / T-31.1: the workspace-dir key function -------------------------------------------
test('queueKeyFor: graph tools key to the DIR of graph.json (annotate too — dirFromGraph, not graphless)', () => {
  const gp = '/ws/app/.codeweb/graph.json';
  assert.equal(queueKeyFor(tool('codeweb_callers'), { symbol: 'x' }, gp), resolve('/ws/app/.codeweb'));
  assert.equal(queueKeyFor(tool('codeweb_annotate'), { list: true }, gp), resolve('/ws/app/.codeweb'));
  assert.equal(queueKeyFor(tool('codeweb_refresh'), {}, gp), resolve('/ws/app/.codeweb'));
});

test('queueKeyFor: diff keys to the dir of args.after — COLLIDES with refresh on one workspace (#30)', () => {
  const after = '/ws/app/.codeweb/graph.json';
  const diffKey = queueKeyFor(tool('codeweb_diff'), { before: '/tmp/snap.json', after }, null);
  const refreshKey = queueKeyFor(tool('codeweb_refresh'), {}, after);
  assert.equal(diffKey, refreshKey, 'diff(after) and refresh(graph) resolve to ONE workspace key — the ordering #30 needs');
  // a tmp-dir `before` snapshot keys the diff to the AFTER dir, not the before dir (harmless by design)
  assert.equal(diffKey, resolve('/ws/app/.codeweb'));
});

test('queueKeyFor: a relative after resolves against cwd', () => {
  assert.equal(queueKeyFor(tool('codeweb_diff'), { before: 'b.json', after: 'sub/after.json' }, null), dirname(resolve('sub/after.json')));
});

test('queueKeyFor: map keys to resolve(out) (default out = <target>/.codeweb)', () => {
  assert.equal(queueKeyFor(tool('codeweb_map'), { target: '/repo', out: '/repo/.codeweb' }, null), resolve('/repo/.codeweb'));
  assert.equal(queueKeyFor(tool('codeweb_map'), { target: '/repo' }, null), resolve(join(resolve('/repo'), '.codeweb')));
});

test('queueKeyFor: the "(graphless)" slot is UNREACHABLE for shipped tools (only diff+map are graphless)', () => {
  for (const t of TOOLS.filter((t) => t.graphless)) assert.ok(t.map || t.queueFrom, `${t.name} avoids the (graphless) fallback`);
  assert.equal(queueKeyFor({ graphless: true }, {}, null), '(graphless)'); // only a hypothetical graphless-without-queueFrom hits it
});

// ---- I5: settle exactly once + release everything (the handleMap double-fire fix) --------------
const NODE = process.execPath;
test('I5: a failing codeweb_map settles ONCE (exactly one reply for its id) and the server drains + exits 0', () => {
  const dir = tmpDir('codeweb-i5-'); // an EMPTY target dir -> run.mjs aborts extract (exit 1)
  try {
    const msgs = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'codeweb_map', arguments: { target: dir, out: join(dir, '.codeweb') } } },
    ];
    const r = spawnSync(NODE, [script('mcp-server.mjs')], { encoding: 'utf8', maxBuffer: 1 << 28, input: msgs.map((m) => JSON.stringify(m)).join('\n') + '\n' });
    assert.equal(r.status, 0, 'server drains in-flight work and exits 0 (pendingAsync balanced)');
    const forId2 = (r.stdout || '').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return {}; } }).filter((m) => m.id === 2);
    assert.equal(forId2.length, 1, 'EXACTLY ONE reply for the failed map (no error+close double-fire)');
    assert.ok(forId2[0].result && forId2[0].result.isError, 'the failure surfaces as an isError result');
  } finally { cleanup(dir); }
});

// ERRORS.md #2/R2: the first MCP error on an unsupported repo used to keep only the LAST 3 stderr
// lines — the extractor's escapes-first message beheaded down to a flag codeweb_map cannot even
// pass. The no-source case now speaks the marker path's own words.
test('I5b: unsupported-repo map failure names the escapes, never the --allow-empty leak', () => {
  const dir = tmpDir('codeweb-i5b-');
  try {
    const msgs = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'codeweb_map', arguments: { target: dir, out: join(dir, '.codeweb') } } },
    ];
    const r = spawnSync(NODE, [script('mcp-server.mjs')], { encoding: 'utf8', maxBuffer: 1 << 28, input: msgs.map((m) => JSON.stringify(m)).join('\n') + '\n' });
    const reply = (r.stdout || '').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return {}; } }).find((m) => m.id === 2);
    const text = reply?.result?.content?.[0]?.text || '';
    assert.match(text, /no supported source under/, 'leads with the cause');
    assert.match(text, /wrong directory\?.*agent fallback/s, 'both escapes present');
    assert.ok(!/--allow-empty/.test(text), 'no flag this tool cannot pass');
  } finally { cleanup(dir); }
});
