// The day-one briefing — a session's first tokens should buy orientation, not exploration.
// Pins the brief's contract (counts, load-bearing, findings), the SessionStart hook's
// mapped/unmapped behavior, and the MCP surface (24th tool, in-process).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, script, tmpDir, cleanup, writeTree, readJSON } from './helpers.mjs';
import { preview } from '../hooks/session-brief.mjs';

const FIXTURE = {
  'core/hub.js': 'export function hub() {\n  return 1;\n}\n',
  'app/a.js': 'import { hub } from "../core/hub.js";\nexport function runA() {\n  return hub();\n}\n',
  'app/b.js': 'import { hub } from "../core/hub.js";\nexport function runB() {\n  return hub();\n}\n',
  'tests/hub.test.js': 'import { hub } from "../core/hub.js";\nexport function checkHub() {\n  return hub();\n}\n',
};

function buildMapped() {
  const dir = tmpDir('codeweb-brief-');
  writeTree(dir, FIXTURE);
  const ws = join(dir, '.codeweb');
  mkdirSync(ws, { recursive: true });
  const r = runNode(script('extract-symbols.mjs'), [dir, '--no-ctags', '--out', join(ws, 'fragment.json')]);
  assert.equal(r.status, 0, r.stderr);
  const frag = readJSON(join(ws, 'fragment.json'));
  writeFileSync(join(ws, 'graph.json'), JSON.stringify({ ...frag, domains: [], overlaps: [] }));
  return { dir, graph: join(ws, 'graph.json') };
}

test('brief: one page with counts, load-bearing symbols, tests, and findings', () => {
  const { dir, graph } = buildMapped();
  try {
    const r = runNode(script('brief.mjs'), [graph, '--json']);
    assert.equal(r.status, 0, r.stderr);
    const b = JSON.parse(r.stdout);
    assert.ok(b.size.symbols >= 4 && b.size.files >= 4, `counts populated (${JSON.stringify(b.size)})`);
    assert.ok(b.loadBearing.some((s) => s.label === 'hub'), 'the most depended-on symbol is named');
    assert.ok(b.tests.symbols >= 1 && b.tests.dirs.includes('tests'), 'test layout reported');
    assert.deepEqual(Object.keys(b.findings).sort(), ['cycles', 'duplications', 'orphanCandidates']);

    const t = runNode(script('brief.mjs'), [graph]);
    assert.match(t.stdout, /codeweb brief — /, 'text headline');
    assert.match(t.stdout, /load-bearing .*hub×/, 'load-bearing line');
    assert.match(t.stdout, /ask codeweb before guessing/, 'teaches the follow-up loop');
  } finally { cleanup(dir); }
});

test('session-brief hook: injects the briefing in a mapped repo, silent otherwise', () => {
  const { dir } = buildMapped();
  try {
    const msg = preview(JSON.stringify({ cwd: join(dir, 'app') }));
    assert.ok(msg, 'mapped cwd yields the briefing');
    assert.match(msg, /\[codeweb\] this repo is mapped/, 'says why the context appears');
    assert.match(msg, /codeweb brief — /, 'carries the page');
    assert.ok(msg.length < 4000, `bounded (${msg.length} chars)`);

    const other = tmpDir('codeweb-unmapped-');
    try { assert.equal(preview(JSON.stringify({ cwd: other })), null, 'unmapped cwd stays silent'); }
    finally { cleanup(other); }
  } finally { cleanup(dir); }
});

test('brief over MCP: 24th tool, served in-process, staleness-annotated shape', () => {
  const { dir, graph } = buildMapped();
  try {
    const input = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'codeweb_brief', arguments: { graph } } },
    ].map((m) => JSON.stringify(m)).join('\n') + '\n';
    const r = spawnSync(process.execPath, [script('mcp-server.mjs')], { encoding: 'utf8', input, maxBuffer: 1 << 26 });
    const byId = new Map(r.stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((m) => [m.id, m]));
    const tools = byId.get(2).result.tools.map((t) => t.name);
    assert.ok(tools.includes('codeweb_brief'), 'advertised');
    assert.equal(tools.length, 27, `27 tools total (got ${tools.length})`);
    const payload = JSON.parse(byId.get(3).result.content[0].text);
    assert.ok(payload.size.symbols >= 4, 'brief payload served');
    assert.ok(payload.loadBearing.some((s) => s.label === 'hub'), 'same content as the CLI');
  } finally { cleanup(dir); }
});
