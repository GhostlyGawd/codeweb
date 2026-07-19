// The local outcome ledger — the value receipt. Counters accrue where the work happens (hooks,
// MCP server), live beside the graph, never leave the machine, and can never break the tool
// (fail-open; CODEWEB_NO_STATS=1 disables). Pins the lib, the writers, and the receipt.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, script, tmpDir, cleanup, writeTree, readJSON, PLUGIN_ROOT } from './helpers.mjs';
import { bump, readStats, monthLine } from '../scripts/lib/stats.mjs';

const FIXTURE = {
  'core/util.js': 'export function used() {\n  return 1;\n}\n',
  'app/main.js': 'import { used } from "../core/util.js";\nexport function go() {\n  return used();\n}\n',
};

function buildMapped() {
  const dir = tmpDir('codeweb-stats-');
  writeTree(dir, FIXTURE);
  const ws = join(dir, '.codeweb');
  mkdirSync(ws, { recursive: true });
  const r = runNode(script('extract-symbols.mjs'), [dir, '--no-ctags', '--out', join(ws, 'fragment.json')]);
  assert.equal(r.status, 0, r.stderr);
  const frag = readJSON(join(ws, 'fragment.json'));
  writeFileSync(join(ws, 'graph.json'), JSON.stringify({ ...frag, domains: [], overlaps: [] }));
  return { dir, ws, graph: join(ws, 'graph.json') };
}

test('stats lib: bump accumulates monthly, opt-out is a true no-op, receipt line renders', () => {
  const { dir, ws, graph } = buildMapped();
  try {
    bump(graph, 'queriesServed');
    bump(graph, 'queriesServed', 2);
    bump(graph, 'regressionsFlagged');
    const s = readStats(graph);
    const month = Object.keys(s.months)[0];
    assert.equal(s.months[month].queriesServed, 3);
    assert.equal(s.months[month].regressionsFlagged, 1);
    assert.match(monthLine(s.months[month]), /3 queries served/);
    assert.match(monthLine(s.months[month]), /1 regression\(s\) flagged before landing/);

    const before = JSON.stringify(readStats(graph));
    process.env.CODEWEB_NO_STATS = '1';
    try { bump(graph, 'queriesServed', 100); } finally { delete process.env.CODEWEB_NO_STATS; }
    assert.equal(JSON.stringify(readStats(graph)), before, 'opt-out writes nothing');
  } finally { cleanup(dir); }
});

test('writers: the pre-edit hook and the MCP server put real events on the ledger', () => {
  const { dir, ws, graph } = buildMapped();
  try {
    // hook as a real child process (the counting lives in the main block, not preview())
    const hook = spawnSync(process.execPath, [join(PLUGIN_ROOT, 'hooks', 'pre-edit-impact.mjs')], {
      encoding: 'utf8', input: JSON.stringify({ tool_input: { file_path: join(dir, 'core/util.js') } }),
    });
    assert.equal(hook.status, 0, hook.stderr);
    let s = readStats(graph);
    const month = Object.keys(s.months)[0];
    assert.equal(s.months[month].cardsDelivered, 1, 'the delivered card was counted');

    const input = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'codeweb_callers', arguments: { graph, symbol: 'used' } } },
    ].map((m) => JSON.stringify(m)).join('\n') + '\n';
    const r = spawnSync(process.execPath, [script('mcp-server.mjs')], { encoding: 'utf8', input, maxBuffer: 1 << 26 });
    assert.equal(r.status, 0, r.stderr);
    s = readStats(graph);
    assert.ok(s.months[month].queriesServed >= 1, `MCP call counted (${JSON.stringify(s.months[month])})`);

    // the receipt CLI and the brief both surface it
    const receipt = runNode(script('stats.mjs'), [graph]);
    assert.match(receipt.stdout, /codeweb activity — /);
    assert.match(receipt.stdout, /1 pre-edit card\(s\)/);
    const brief = runNode(script('brief.mjs'), [graph]);
    assert.match(brief.stdout, /codeweb this month: .*1 pre-edit card\(s\)/, 'the brief carries the receipt line');
  } finally { cleanup(dir); }
});

test('empty ledger: the receipt says how counters accrue instead of showing nothing', () => {
  const { dir, graph } = buildMapped();
  try {
    const r = runNode(script('stats.mjs'), [graph]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /no activity recorded yet/);
    assert.match(r.stdout, /local-only/);
  } finally { cleanup(dir); }
});
