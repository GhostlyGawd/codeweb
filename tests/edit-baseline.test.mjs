import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpDir, cleanup, script, runNode } from './helpers.mjs';
import { startServer, initServer } from './mcp-harness.mjs';
import { diffGraphs } from '../scripts/lib/diff-core.mjs';
import { normalizeGraph } from '../scripts/lib/graph-ops.mjs';
import { createHash } from 'node:crypto';

function fixture() {
  const root = tmpDir('cw-baseline-');
  const src = join(root, 'src'), ws = join(root, '.codeweb');
  mkdirSync(src); mkdirSync(ws);
  writeFileSync(join(src, 'a.js'), 'export function alpha() { return 1; }\n');
  const gp = join(ws, 'graph.json');
  writeFileSync(gp, JSON.stringify({ meta: { root: src }, nodes: [], edges: [], domains: [], overlaps: [] }));
  return { root, src, ws, gp, baseline: join(ws, 'graph.baseline.json') };
}
const call = (id, name, args) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
const payload = (r) => { assert.ok(!r.result.isError, r.result.content?.[0]?.text); return JSON.parse(r.result.content[0].text); };

test('ac_23: baseline captures refreshed source and survives refresh/snapshot; verification sees later edits', () => {
  const f = fixture();
  try {
    const begin = runNode(script('refresh.mjs'), [f.gp, '--baseline', '--json']);
    assert.equal(begin.status, 0, begin.stderr);
    assert.equal(JSON.parse(begin.stdout).baseline, f.baseline);
    const original = readFileSync(f.baseline, 'utf8');
    assert.ok(JSON.parse(original).nodes.some((n) => n.label === 'alpha'));
    writeFileSync(join(f.src, 'b.js'), 'export function beta() { return alpha(); }\n');
    const refresh = runNode(script('refresh.mjs'), [f.gp, '--snapshot', '--json']);
    assert.equal(refresh.status, 0, refresh.stderr);
    assert.equal(readFileSync(f.baseline, 'utf8'), original);
    const verify = runNode(script('diff.mjs'), ['baseline', f.gp, '--refresh', '--json']);
    assert.equal(verify.status, 0, verify.stderr);
    const p = JSON.parse(verify.stdout);
    assert.ok(p.nodes.added.some((id) => id.endsWith(':beta')));
    assert.equal(p.verification.before, f.baseline);
    assert.equal(p.verification.beforeSha256, createHash('sha256').update(original).digest('hex'));
    assert.equal(p.analysis.checks.duplication, 'not-evaluated');
    assert.equal(readFileSync(f.baseline, 'utf8'), original);
    const denied = runNode(script('refresh.mjs'), [f.baseline, '--json']);
    assert.equal(denied.status, 2);
    assert.equal(readFileSync(f.baseline, 'utf8'), original);
  } finally { cleanup(f.root); }
});

test('ac_23: invalid baselines fail before mutation; failed extraction preserves a previous baseline', () => {
  const f = fixture();
  try {
    const original = readFileSync(f.gp, 'utf8');
    let r = runNode(script('diff.mjs'), ['baseline', f.gp, '--refresh', '--json']);
    assert.equal(r.status, 2); assert.match(r.stderr, /BEFORE editing/);
    assert.equal(readFileSync(f.gp, 'utf8'), original);
    r = runNode(script('diff.mjs'), [f.gp, f.gp, '--refresh', '--json']);
    assert.equal(r.status, 2); assert.match(r.stderr, /separate files/);
    const differentRoot = JSON.parse(original); differentRoot.meta.root = f.root;
    writeFileSync(f.baseline, JSON.stringify(differentRoot));
    r = runNode(script('diff.mjs'), ['baseline', f.gp, '--refresh', '--json']);
    assert.equal(r.status, 2); assert.match(r.stderr, /same source root/);
    assert.equal(readFileSync(f.gp, 'utf8'), original);
    writeFileSync(f.baseline, '{broken');
    r = runNode(script('diff.mjs'), ['baseline', f.gp, '--refresh', '--json']);
    assert.equal(r.status, 2); assert.equal(readFileSync(f.gp, 'utf8'), original);
    const g = JSON.parse(original); g.meta.root = join(f.root, 'absent');
    writeFileSync(f.gp, JSON.stringify(g));
    r = runNode(script('refresh.mjs'), [f.gp, '--baseline', '--json']);
    assert.equal(r.status, 2); assert.equal(readFileSync(f.baseline, 'utf8'), '{broken');
  } finally { cleanup(f.root); }
});

test('ac_23: structurally invalid baseline JSON fails before refreshing the live graph', () => {
  const f = fixture();
  try {
    const original = readFileSync(f.gp, 'utf8');
    for (const bad of [
      { meta: { root: f.src } },
      { meta: { root: f.src }, nodes: {}, edges: [] },
      { meta: { root: f.src }, nodes: [], edges: null },
    ]) {
      writeFileSync(f.baseline, JSON.stringify(bad));
      const r = runNode(script('diff.mjs'), ['baseline', f.gp, '--refresh', '--json']);
      assert.equal(r.status, 2, r.stdout + r.stderr);
      assert.match(r.stderr, /baseline.*nodes.*edges/i);
      assert.equal(readFileSync(f.gp, 'utf8'), original, 'invalid baseline must not refresh live state');
      assert.equal(readFileSync(f.baseline, 'utf8'), JSON.stringify(bad));
    }
  } finally { cleanup(f.root); }
});

test('ac_23: queued MCP begin/verify is ordered; background refresh preserves baseline and verification finds a regression', async () => {
  const f = fixture();
  const h = startServer({ cwd: f.root, env: { CODEWEB_WS: f.ws, CODEWEB_NO_STATS: '1', CODEWEB_MCP_TRACE: '1', CODEWEB_NO_AUTOREFRESH: '0' } });
  try {
    await initServer(h);
    h.sendBurst([call(2, 'codeweb_refresh', { baseline: true }), call(3, 'codeweb_diff', { before: 'baseline', refresh: true })]);
    payload(await h.reply(2)); payload(await h.reply(3));
    const original = readFileSync(f.baseline, 'utf8');
    writeFileSync(join(f.src, 'b.js'), 'export function beta() { return alpha(); }\n');
    writeFileSync(join(f.src, 'a.js'), 'export function alpha() { return beta(); }\n');
    h.send(call(4, 'codeweb_context', { symbol: 'alpha' }));
    await h.reply(4);
    await h.traceEvent((e) => e.ev === 'end' && e.id === null && e.tool === 'codeweb_refresh');
    assert.equal(readFileSync(f.baseline, 'utf8'), original);
    h.send(call(5, 'codeweb_diff', { before: 'baseline', refresh: true }));
    const p = payload(await h.reply(5));
    assert.equal(p.ok, false, 'cycle is a result, not a transport failure');
    assert.ok(p.cycles.added.length > 0);
    assert.equal(p.verification.refreshed, true);
    assert.equal(readFileSync(f.baseline, 'utf8'), original);
    assert.ok(h.trace().some((e) => e.ev === 'start' && e.id === 5));
    writeFileSync(join(f.src, 'a.js'), 'export function alpha() { return 1; }\n');
    h.send(call(6, 'codeweb_diff', { before: 'baseline', refresh: true }));
    const repaired = payload(await h.reply(6));
    assert.equal(repaired.ok, true, 'repair is green against the original baseline');
    assert.deepEqual(repaired.cycles.added, []);
    assert.equal(repaired.verification.beforeSha256, p.verification.beforeSha256);
    assert.equal(readFileSync(f.baseline, 'utf8'), original);
    assert.equal(repaired.analysis.checks.duplication, 'not-evaluated');
    assert.equal(repaired.analysis.checks.behavior, 'not-evaluated');
  } finally { h.close(); await h.exited; cleanup(f.root); }
});

test('ac_23: a dropped overlap set is not a clean duplication check or a claimed fix', () => {
  const before = normalizeGraph({ meta: {}, nodes: [], edges: [], overlaps: [{ kind: 'duplicate-logic', confidence: 'high', nodes: ['a', 'b'] }] });
  const after = normalizeGraph({ meta: { overlapsDroppedAt: 'now' }, nodes: [], edges: [], overlaps: [] });
  const p = diffGraphs(before, after).payload;
  assert.deepEqual(p.overlaps, { added: [], removed: [] });
  assert.equal(p.analysis.checks.duplication, 'not-evaluated');
  assert.equal(diffGraphs(before, before).payload.analysis.checks.duplication, 'evaluated');
  assert.equal(p.analysis.checks.behavior, 'not-evaluated');
});

test('ac_23: review identifies unevaluated structure and unavailable duplication evidence', () => {
  const f = fixture();
  try {
    const g = { meta: { root: join(f.root, 'missing') }, nodes: [{ id: 'a.js:alpha', label: 'alpha', kind: 'function', file: 'a.js', line: 1, loc: 1 }], edges: [], overlaps: [] };
    writeFileSync(f.gp, JSON.stringify(g));
    const r = runNode(script('review.mjs'), [f.gp, '--changed', 'a.js', '--json']);
    assert.equal(r.status, 0, r.stderr);
    const p = JSON.parse(r.stdout);
    assert.equal(p.analysis.checkStatus.duplication, 'not-evaluated');
    assert.equal(p.analysis.checkStatus.cycles, 'not-evaluated');
    assert.equal(p.analysis.checkStatus.behavior, 'not-evaluated');
  } finally { cleanup(f.root); }
});
