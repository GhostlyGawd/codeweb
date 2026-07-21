// codeweb_find — concept search: an idea in, ranked symbols out, deterministically. Pins the
// ranking properties that make it useful to an agent (coverage beats single-token noise,
// stemming bridges query/identifier morphology, product outranks tests unless tests are asked
// for) and the MCP surface (23rd tool, in-process, budgeted).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, script, tmpDir, cleanup, writeTree, readJSON } from './helpers.mjs';

const FIXTURE = {
  'net/retry.js': 'export function retryRequest(opts) {\n  return withBackoff(opts);\n}\nexport function withBackoff(o) {\n  return o;\n}\n',
  'net/client.js': 'import { retryRequest } from "./retry.js";\nexport function fetchWithRetry(u) {\n  return retryRequest(u);\n}\n',
  'config/parse-config.js': 'export function parseConfig(raw) {\n  return raw;\n}\n',
  'cli/args.js': 'export function parseArgs(argv) {\n  return argv;\n}\n',
  'err/errors.js': 'export function handleError(e) {\n  return e;\n}\n',
  'tests/retry.test.js': 'import { retryRequest } from "../net/retry.js";\nexport function retryFixture() {\n  return retryRequest({});\n}\n',
};

function buildMapped() {
  const dir = tmpDir('codeweb-find-');
  writeTree(dir, FIXTURE);
  const ws = join(dir, '.codeweb');
  mkdirSync(ws, { recursive: true });
  const r = runNode(script('extract-symbols.mjs'), [dir, '--no-ctags', '--out', join(ws, 'fragment.json')]);
  assert.equal(r.status, 0, r.stderr);
  const frag = readJSON(join(ws, 'fragment.json'));
  writeFileSync(join(ws, 'graph.json'), JSON.stringify({ ...frag, domains: [], overlaps: [] }));
  return { dir, graph: join(ws, 'graph.json') };
}

const run = (graph, args) => {
  const r = runNode(script('find.mjs'), [graph, ...args, '--json']);
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
};

test('find: ranks the product symbol first and says why', () => {
  const { dir, graph } = buildMapped();
  try {
    const out = run(graph, ['retry']);
    assert.ok(out.results.length >= 2, `matches exist (${out.summary})`);
    assert.equal(out.results[0].label, 'retryRequest', `product symbol first, got ${out.results[0].id}`);
    assert.match(out.results[0].match, /label:retry/, 'the match explanation names the hit');
    const fixture = out.results.find((r) => r.id.includes('retry.test.js'));
    if (fixture) assert.ok(out.results[0].score > fixture.score, 'test-role matches rank below product');
  } finally { cleanup(dir); }
});

test('find: multi-term coverage beats single-token hits; stemming bridges morphology', () => {
  const { dir, graph } = buildMapped();
  try {
    const cfg = run(graph, ['parse', 'config']);
    assert.equal(cfg.results[0].label, 'parseConfig', 'both-term match outranks parseArgs');
    assert.ok(cfg.results.some((r) => r.label === 'parseArgs'), 'partial match still listed');
    assert.equal(run(graph, ['retries']).results[0].label, 'retryRequest', '"retries" reaches retryRequest');
    assert.equal(run(graph, ['handled']).results[0].label, 'handleError', '"handled" reaches handleError');
  } finally { cleanup(dir); }
});

test('find: budgeted output with true totals; usage errors are actionable', () => {
  const { dir, graph } = buildMapped();
  try {
    const out = run(graph, ['retry', '--limit', '1']);
    assert.equal(out.results.length, 1);
    assert.ok(out.count > 1 && out.more && out.more.remaining === out.count - 1, 'true total + explicit remainder');
    const bad = runNode(script('find.mjs'), [graph, 'the', 'of', '--json']);
    assert.equal(bad.status, 2, 'stopword-only query is a usage error');
    assert.match(bad.stderr, /no searchable terms/);
  } finally { cleanup(dir); }
});

test('find over MCP: 23rd+ tool, served in-process from the cached graph, budgeted', () => {
  const { dir, graph } = buildMapped();
  try {
    const input = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'codeweb_find', arguments: { graph, query: 'retry handling', limit: 2 } } },
    ].map((m) => JSON.stringify(m)).join('\n') + '\n';
    const r = spawnSync(process.execPath, [script('mcp-server.mjs')], { encoding: 'utf8', input, maxBuffer: 1 << 26 });
    const byId = new Map(r.stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((m) => [m.id, m]));
    const tools = byId.get(2).result.tools.map((t) => t.name);
    assert.ok(tools.includes('codeweb_find'), 'advertised');
    assert.equal(tools.length, 27, `27 tools total (got ${tools.length})`);
    const payload = JSON.parse(byId.get(3).result.content[0].text);
    assert.equal(payload.results[0].label, 'retryRequest', `top hit over MCP (${payload.summary})`);
    assert.ok(payload.results.length <= 2, 'budget respected');
    assert.match(payload.summary, /match\(es\)/);
  } finally { cleanup(dir); }
});
