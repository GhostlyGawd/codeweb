// AC-11 (ac_11): staleness honesty reaches the spawned advisors. The orient family annotated
// stale answers; simulate/deadcode/risk/hotspots answered a week-old map with full confidence
// (reports/PLAN.md finding 4). The server now attaches the call-time staleness verdict to every
// spawned graph-consuming reply (refresh/stats/annotate excepted — they don't answer FROM the
// structure), and the overlap-independent advisors joined the auto-refresh set.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpDir, cleanup, script } from './helpers.mjs';

let ROOT, PROJ, GP;
before(() => {
  ROOT = tmpDir('codeweb-stale-');
  PROJ = join(ROOT, 'proj');
  mkdirSync(PROJ, { recursive: true });
  writeFileSync(join(PROJ, 'a.js'), 'export function one() { return two(); }\nexport function two() { return 1; }\n');
  GP = join(ROOT, 'graph.json');
  // meta.sources records a size/mtime that cannot match disk -> checkStaleness fires.
  writeFileSync(GP, JSON.stringify({
    meta: { target: 'stale-fixture', root: PROJ, sources: { 'a.js': { s: 1, m: 1 } } },
    nodes: [
      { id: 'a.js:one', label: 'one', file: 'a.js', domain: 'app', exports: true },
      { id: 'a.js:two', label: 'two', file: 'a.js', domain: 'app', exports: false },
    ],
    edges: [{ from: 'a.js:one', to: 'a.js:two', kind: 'call' }],
    domains: [], overlaps: [],
  }));
});
after(() => { if (ROOT) cleanup(ROOT); });

const INIT = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } };
const call = (id, name, args) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
// CODEWEB_NO_AUTOREFRESH isolates the ANNOTATION contract from the auto-refresh behavior —
// this pin is about honesty in the reply, not about the repair.
function rpc(messages) {
  const input = messages.map((m) => JSON.stringify(m)).join('\n') + '\n';
  const r = spawnSync(process.execPath, [script('mcp-server.mjs')], {
    encoding: 'utf8', input, maxBuffer: 1 << 28,
    env: { ...process.env, CODEWEB_NO_AUTOREFRESH: '1' },
  });
  if (r.error) throw new Error(`mcp-server.mjs spawn failed: ${r.error.message}`);
  const responses = (r.stdout || '').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return new Map(responses.map((x) => [x.id, x]));
}

test('ac_11: a spawned advisor (codeweb_risk) on a stale graph carries the staleness verdict', () => {
  const res = rpc([INIT, call(2, 'codeweb_risk', { graph: GP })]).get(2).result;
  assert.ok(!res.isError, res.content?.[0]?.text);
  const p = JSON.parse(res.content[0].text);
  assert.ok(p.stale && p.stale.count >= 1, `advisor reply is staleness-annotated: ${res.content[0].text.slice(0, 200)}`);
  if (typeof p.summary === 'string') assert.match(p.summary, /codeweb_refresh/, 'the summary names the remedy');
});

test('ac_11: codeweb_simulate (the refactor pre-flight) is staleness-annotated too', () => {
  const res = rpc([INIT, call(3, 'codeweb_simulate', { graph: GP, delete: 'a.js:two' })]).get(3).result;
  assert.ok(!res.isError, res.content?.[0]?.text);
  const p = JSON.parse(res.content[0].text);
  assert.ok(p.stale && p.stale.count >= 1, `pre-flight reply is staleness-annotated: ${res.content[0].text.slice(0, 200)}`);
});

test('ac_11: codeweb_stats stays unannotated (an activity receipt, not a structural answer)', () => {
  const res = rpc([INIT, call(4, 'codeweb_stats', { graph: GP })]).get(4).result;
  assert.ok(!res.isError, res.content?.[0]?.text);
  const p = JSON.parse(res.content[0].text);
  assert.ok(!p.stale, 'stats answers about activity, not the structure — no staleness theater');
});
