import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildContextPack } from '../scripts/lib/context-core.mjs';
import { buildIndex, normalizeGraph } from '../scripts/lib/graph-ops.mjs';
import { sourceReader } from '../scripts/lib/cli.mjs';
import { tmpDir, cleanup, script } from './helpers.mjs';

// Deliberately includes a renamed call site and a missing file: graph edges alone
// must not be reported as complete source evidence.
const graphOf = (root) => normalizeGraph({
  meta: { root }, domains: [], overlaps: [],
  nodes: ['target', 'many', 'alias', 'missing'].map((label) => ({
    id: `${label}.js:${label}`, label, file: `${label}.js`, line: 1,
    loc: label === 'many' ? 12 : 1, kind: 'function', exports: label === 'target',
  })),
  edges: ['many', 'alias', 'missing'].map((label) => ({ from: `${label}.js:${label}`, to: 'target.js:target', kind: 'call' })),
});
const pack = (g, opts = {}) => buildContextPack(g, buildIndex(g), sourceReader(g.meta.root), ['target.js:target'], { symbol: 'target', ...opts });

test('ac_22: context reports capped, unmatched, and unavailable source evidence independently of neighbor lists', () => {
  const root = tmpDir('cw-analysis-');
  try {
    writeFileSync(join(root, 'target.js'), 'function target() {}');
    writeFileSync(join(root, 'many.js'), Array(12).fill('target();').join('\n'));
    writeFileSync(join(root, 'alias.js'), 'renamed();');
    const g = graphOf(root);
    g.meta.dynamic = { files: 1 };
    const p = pack(g);
    assert.equal(p.analysis.freshness, 'unknown');
    assert.equal(p.analysis.listsComplete, true);
    assert.equal(p.analysis.sourceEvidenceComplete, false);
    assert.deepEqual(p.callers.find((n) => n.label === 'many').windowEvidence,
      { status: 'truncated', matchedLines: 12, shownLines: 8, remaining: 4 });
    assert.equal(p.callers.find((n) => n.label === 'alias').windowEvidence.status, 'no-label-match');
    assert.equal(p.callers.find((n) => n.label === 'missing').windowEvidence.status, 'source-unavailable');
    for (const code of ['source-evidence', 'freshness-unknown', 'external-callers', 'dynamic-dispatch', 'unmapped-calls']) assert.ok(p.analysis.limitations.includes(code));
    assert.ok(p.analysis.nextSteps.some((s) => s.includes('bodies:"full"')));
    writeFileSync(join(root, 'missing.js'), 'target();');
    const full = pack(g, { fullBodies: true });
    assert.equal(full.analysis.sourceEvidenceComplete, true);
    assert.ok(full.analysis.limitations.includes('unmapped-calls'), 'whole bodies do not establish graph completeness');
  } finally { cleanup(root); }
});

test('ac_22: list budgets report blast omissions; complete lists never promise complete analysis', () => {
  const g = graphOf(null);
  for (let i = 0; i < 30; i++) {
    const id = `c${i}.js:c${i}`;
    g.nodes.push({ id, label: `c${i}`, file: `c${i}.js`, line: 1, loc: 1 });
    g.edges.push({ from: id, to: 'target.js:target', kind: 'call' });
  }
  const p = pack(g, { limit: 1 });
  assert.equal(p.analysis.listsComplete, false);
  assert.equal(p.moreCallers.remaining, 32);
  assert.deepEqual(p.blastRadius.more, { remaining: 8, nextOffset: 25 });
  assert.ok(p.analysis.nextSteps.some((s) => s.includes('full:true')));
  const full = pack(g);
  assert.equal(full.analysis.listsComplete, true);
  assert.equal(full.analysis.sourceEvidenceComplete, false);
  assert.ok(full.analysis.limitations.includes('unmapped-calls'));
});

test('ac_22: freshness distinguishes unchanged stamps, stale data, and missing stamps', () => {
  const root = tmpDir('cw-analysis-fresh-');
  try {
    const file = join(root, 'target.js');
    writeFileSync(file, 'function target() {}');
    const st = statSync(file);
    const g = graphOf(root);
    g.meta.sources = { 'target.js': { s: st.size, m: Math.round(st.mtimeMs) } };
    assert.equal(pack(g).analysis.freshness, 'unchanged-stamps');
    assert.ok(pack(g).analysis.limitations.includes('new-files-unchecked'));
    writeFileSync(file, 'function target() { return 42; }');
    const stale = pack(g);
    assert.equal(stale.analysis.freshness, 'stale');
    assert.ok(stale.stale.count > 0);
    assert.ok(stale.analysis.nextSteps.some((s) => s.includes('codeweb_refresh')));
    assert.equal(pack(g, { staleInfo: { count: 9, files: ['elsewhere.js'] } }).stale.count, 9);
    g.meta.sources = {};
    assert.equal(pack(g).analysis.freshness, 'unknown');
  } finally { cleanup(root); }
});

test('ac_22: CLI and MCP emit identical context analysis and evidence', () => {
  const root = tmpDir('cw-analysis-parity-');
  try {
    const path = join(root, 'graph.json');
    writeFileSync(path, JSON.stringify(graphOf(root)));
    const env = { ...process.env, CODEWEB_NO_STATS: '1', CODEWEB_NO_AUTOREFRESH: '1' };
    const cli = spawnSync(process.execPath, [script('context-pack.mjs'), path, 'target', '--limit', '1', '--json'], { encoding: 'utf8', env });
    assert.equal(cli.status, 0, cli.stderr);
    const input = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'codeweb_context', arguments: { graph: path, symbol: 'target', limit: 1 } } }) + '\n';
    const mcp = spawnSync(process.execPath, [script('mcp-server.mjs')], { input, encoding: 'utf8', env });
    assert.equal(mcp.status, 0, mcp.stderr);
    const result = JSON.parse(mcp.stdout).result;
    assert.ok(!result.isError, result.content?.[0]?.text);
    assert.deepEqual(JSON.parse(result.content[0].text), JSON.parse(cli.stdout));
  } finally { cleanup(root); }
});
