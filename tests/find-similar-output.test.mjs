// P-01 / AC-34: exercise shipped CLI text + JSON and the MCP description, without executing
// fixture code or treating body similarity as a behavioral oracle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, script, tmpDir, writeTree, cleanup } from './helpers.mjs';

const FS = script('find-similar.mjs');
const node = (id, file, line = 1, loc = 1) => ({ id, label: id.split(':')[1], kind: 'function', file, line, loc, domain: 'fixture' });
function fixture(files, nodes, analysis) {
  const dir = tmpDir('cw-sim-output-');
  writeTree(dir, files);
  const graphPath = join(dir, 'graph.json');
  writeFileSync(graphPath, JSON.stringify({ meta: { root: dir, ...(analysis ? { analysis } : {}) }, nodes, edges: [], domains: [], overlaps: [] }));
  return { dir, graphPath };
}
function invoke(graphPath, candidate, flags = []) {
  return runNode(FS, [graphPath, '--signature', candidate, ...flags]);
}
function assertLimits(text, mode = 'lexical') {
  assert.match(text, new RegExp(mode), 'the comparison mode is visible');
  assert.match(text, />=15%/, 'existing similarity floor is visible');
  assert.match(text, /first 400 lines/, 'existing body cap is visible');
  assert.match(text, /candidate uncapped/, 'the candidate and existing body caps differ');
  assert.match(text, /mapped non-test function\/method/, 'eligible mapped source scope is named');
  assert.match(text, /missing|unavailable/i, 'missing-body limitation is visible');
  assert.match(text, /unmapped/, 'unmapped scope cannot be ruled out');
  assert.match(text, /does not (?:prove|establish).*equivalent behavior/, 'similarity is not a semantic guarantee');
  assert.match(text, /inspect source.*tests/, 'source inspection and tests remain necessary');
  assert.doesNotMatch(text, /looks novel|safe to write|consider reusing instead of re-implementing/i);
}

test('ac_34: empty, supported-zero and incomplete maps give bounded no-candidate output with unchanged JSON', () => {
  const candidate = 'function proposed(value) { return value * 7; }';
  for (const kind of ['empty', 'supported-zero', 'incomplete']) {
    const { dir, graphPath } = fixture({ 'control.js': 'alpha beta gamma' }, kind === 'supported-zero' ? [node('control.js:control', 'control.js')] : [], kind === 'incomplete' ? { status: 'incomplete', diagnostics: [{ reason: 'fixture omission' }] } : undefined);
    try {
      const r = invoke(graphPath, candidate);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /no candidates.*available mapped bodies/i);
      assertLimits(r.stdout);
      const j = invoke(graphPath, candidate, ['--json']);
      assert.equal(j.status, 0, j.stderr);
      const p = JSON.parse(j.stdout);
      assert.deepEqual(p, { candidate: { source: 'signature', shingles: 7, mode: 'lexical' }, index: 'live', bodyLineCap: 400, matches: [], count: 0, scanned: kind === 'supported-zero' ? 1 : 0 });
      assert.equal(/analysis incomplete/.test(r.stderr), kind === 'incomplete');
    } finally { cleanup(dir); }
  }
});

test('ac_34: conflicting contracts and intentional same-file duplication are source candidates, not automatic reuse', () => {
  // Numeric literals are absent from lexical shingles: these functions have opposing bounds
  // despite a 100% body score. The duplicated checks may deliberately serve separate contracts.
  const low = 'function accepts(value) { return value > 1; }';
  const high = 'function accepts(value) { return value > 100; }';
  const { dir, graphPath } = fixture({ 'bounds.js': low + '\n' + high, 'bounds.test.js': low }, [node('bounds.js:low', 'bounds.js'), node('bounds.js:high', 'bounds.js', 2), node('bounds.test.js:test', 'bounds.test.js')]);
  try {
    const r = invoke(graphPath, low);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /2 source candidates for comparison/);
    assertLimits(r.stdout);
    const p = JSON.parse(invoke(graphPath, low, ['--json']).stdout);
    assert.deepEqual(p.matches, [
      { id: 'bounds.js:high', label: 'high', file: 'bounds.js', line: 2, domain: 'fixture', sim: 1, tier: 'high' },
      { id: 'bounds.js:low', label: 'low', file: 'bounds.js', line: 1, domain: 'fixture', sim: 1, tier: 'high' },
    ]);
    assert.equal(p.scanned, 2, 'test files remain excluded');
    for (const m of p.matches) {
      assert.ok(r.stdout.includes(`(${m.file}:${m.line})`), 'exact source location is shown');
      const opened = readFileSync(join(dir, m.file), 'utf8').split('\n')[m.line - 1];
      assert.equal(opened, m.line === 1 ? low : high, 'the named source location opens the real conflicting body');
    }
  } finally { cleanup(dir); }
});

test('ac_34: different-syntax equivalents and missing bodies retain zero-result/count behavior', () => {
  for (const kind of ['different-syntax', 'missing-body']) {
    const { dir, graphPath } = fixture({ 'answer.js': 'function answer() { return 42; }' }, [node('answer.js:answer', kind === 'missing-body' ? 'absent.js' : 'answer.js')]);
    try {
      const r = invoke(graphPath, 'const answer = () => 6 * 7;');
      assert.equal(r.status, 0, r.stderr);
      assertLimits(r.stdout);
      const p = JSON.parse(invoke(graphPath, 'const answer = () => 6 * 7;', ['--json']).stdout);
      assert.equal(p.scanned, 1, 'scanned counts eligible nodes, including an unreadable body');
      assert.deepEqual(p.matches, []);
      assert.equal(p.count, 0, 'no semantic-equivalence inference is introduced');
    } finally { cleanup(dir); }
  }
});

test('ac_34: human truncation names omitted counts and a working --k expansion', () => {
  const body = 'alpha beta gamma delta';
  const { dir, graphPath } = fixture({ 'same.js': [body, body, body].join('\n') }, [node('same.js:c', 'same.js', 3), node('same.js:a', 'same.js'), node('same.js:b', 'same.js', 2)]);
  try {
    const r = invoke(graphPath, body, ['--k', '1']);
    assert.equal(r.status, 0, r.stderr);
    assertLimits(r.stdout);
    assert.match(r.stdout, /2 additional candidates omitted.*--k 3/);
    assert.ok(r.stdout.includes('same.js:a  (same.js:1)'));
    assert.ok(!r.stdout.includes('(same.js:2)'));
    const p = JSON.parse(invoke(graphPath, body, ['--k', '1', '--json']).stdout);
    assert.equal(p.count, 3);
    assert.equal(p.matches.length, 1);
    assert.deepEqual(p.more, { remaining: 2 });
    const expanded = invoke(graphPath, body, ['--k', '3']);
    assert.ok(expanded.stdout.includes('(same.js:2)') && expanded.stdout.includes('(same.js:3)'));
    assert.doesNotMatch(expanded.stdout, /omitted/);
  } finally { cleanup(dir); }
});

test('ac_34: body-cap control excludes a matching tail and structural mode names its limits', () => {
  const body = [...Array(400).fill('alpha beta gamma'), 'unique tail evidence'].join('\n');
  const { dir, graphPath } = fixture({ 'long.js': body }, [node('long.js:long', 'long.js', 1, 401)]);
  try {
    const r = invoke(graphPath, 'unique tail evidence');
    assert.equal(r.status, 0, r.stderr);
    assertLimits(r.stdout);
    const p = JSON.parse(invoke(graphPath, 'unique tail evidence', ['--json']).stdout);
    assert.equal(p.bodyLineCap, 400);
    assert.deepEqual(p.matches, [], 'existing body cap continues to exclude tail-only matches');
    const structural = invoke(graphPath, 'alpha beta gamma', ['--structural']);
    assert.equal(structural.status, 0, structural.stderr);
    assertLimits(structural.stdout, 'structural');
  } finally { cleanup(dir); }
});

test('ac_34: ordinary source/candidate/usage/graph errors still exit 2 without successful result text', () => {
  const { dir, graphPath } = fixture({}, []);
  try {
    const cases = [
      { args: [graphPath], error: /usage/ },
      { args: [graphPath, '--body', join(dir, 'missing.txt')], error: /cannot read candidate/ },
      { args: [join(dir, 'missing.json'), '--signature', 'alpha beta gamma'], error: /graph not found/ },
    ];
    writeTree(dir, { 'corrupt.json': '{', 'no-root.json': JSON.stringify({ meta: {}, nodes: [], edges: [] }) });
    cases.push({ args: [join(dir, 'corrupt.json'), '--signature', 'alpha beta gamma'], error: /invalid JSON/ });
    cases.push({ args: [join(dir, 'no-root.json'), '--signature', 'alpha beta gamma'], error: /source unavailable/ });
    for (const c of cases) {
      const r = runNode(FS, c.args);
      assert.equal(r.status, 2);
      assert.equal(r.stdout, '');
      assert.match(r.stderr, c.error);
    }
  } finally { cleanup(dir); }
});

test('ac_34: MCP tool discovery presents bounded comparison and preserves similarity JSON transport', () => {
  const { dir, graphPath } = fixture({ 'a.js': 'alpha beta gamma' }, [node('a.js:alpha', 'a.js')]);
  try {
    const input = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'p01-test', version: '0' } } },
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'codeweb_find_similar', arguments: { graph: graphPath, signature: 'alpha beta gamma' } } },
    ].map(JSON.stringify).join('\n') + '\n';
    const r = spawnSync(process.execPath, [script('mcp-server.mjs')], { cwd: dir, encoding: 'utf8', input, env: { ...process.env, CODEWEB_WS: '' }, maxBuffer: 1 << 20 });
    assert.equal(r.status, 0, r.stderr);
    const replies = new Map(r.stdout.trim().split('\n').map(JSON.parse).map(p => [p.id, p.result]));
    const description = replies.get(2).tools.find(t => t.name === 'codeweb_find_similar').description;
    assert.match(description, /mapped non-test.*candidates.*comparison/i);
    assert.match(description, />=15%.*first 400 lines.*candidate uncapped/);
    assert.match(description, /does not.*equivalent behavior/i);
    assert.doesNotMatch(description, /AVOID re-implementing|already do this/);
    const result = replies.get(3);
    assert.ok(!result.isError, result.content[0].text);
    const p = JSON.parse(result.content[0].text);
    assert.equal(p.count, 1);
    assert.equal(p.matches[0].sim, 1);
    assert.equal(p.bodyLineCap, 400);
    assert.equal(p.candidate.mode, 'lexical');
  } finally { cleanup(dir); }
});
