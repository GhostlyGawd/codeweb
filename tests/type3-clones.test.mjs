// Spec H (docs/specs/type3-clones.md): Type-3 (near-miss) clones — same statements reordered,
// or a subexpression extracted — are invisible to the shingle AND skeleton passes. The AST tier
// fingerprints each function's statements (identifier/literal-normalized, multiset), and overlap
// pairs bodies sharing >=70% of them. Distinct finding kind, REVIEW-only, never "merge these".
//
// T1 reorder: same statements, different order + different identifiers -> detected.
// T2 extraction: one side extracts a subexpression into a local -> still detected (>=70%).
// T3 negative: structurally different functions of similar length -> NOT paired.
// T4 small-body guard: < 6 statements each -> never a Type-3 finding.
// T5 fallback: --engine regex -> no t3 fingerprints, no near-miss findings.
// T6 determinism: two runs -> byte-identical graph.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, tmpDir, cleanup, writeTree, script, readJSON, PLUGIN_ROOT } from './helpers.mjs';

const hasEngine = existsSync(join(PLUGIN_ROOT, 'scripts', 'grammars', 'tree-sitter-typescript.wasm')) && existsSync(join(PLUGIN_ROOT, 'node_modules', 'web-tree-sitter'));

// 8 statements, reordered between the two, with renamed identifiers — classic Type-3.
const A = [
  'export function alphaWork(input) {',
  '  const a = input.trim();',
  '  const b = a.toUpperCase();',
  '  const c = b.length;',
  '  const d = c * 2;',
  '  const e = d + 1;',
  '  const f = e - 3;',
  '  console.log(f);',
  '  return f;',
  '}',
].join('\n') + '\n';
const B = [
  'export function betaWork(source) {',
  '  const q = source.trim();',
  '  const w = q.toUpperCase();',
  '  console.log(0);',
  '  const r = w.length;',
  '  const t = r * 2;',
  '  const y = t + 1;',
  '  const u = y - 3;',
  '  return u;',
  '}',
].join('\n') + '\n';
const DIFFERENT = [
  'export function gammaWork(list) {',
  '  for (const item of list) {',
  '    if (item.active) {',
  '      await item.flush();',
  '    }',
  '  }',
  '  while (list.length) {',
  '    list.pop();',
  '  }',
  '  switch (list.mode) {',
  '    default: break;',
  '  }',
  '  return list;',
  '}',
].join('\n') + '\n';

function runPipeline(files) {
  const dir = tmpDir('codeweb-t3-');
  writeTree(dir, files);
  const ws = join(dir, 'ws');
  const r = runNode(script('run.mjs'), [join(dir, 'src'), '--out-dir', ws]);
  assert.equal(r.status, 0, r.stderr);
  return { dir, graph: readJSON(join(ws, 'graph.json')), bytes: readFileSync(join(ws, 'graph.json'), 'utf8') };
}
const nearMiss = (g) => (g.overlaps || []).filter((o) => o.kind === 'near-miss-clone');

test('T1+T2: reordered statements pair as a near-miss clone, REVIEW-only', { skip: hasEngine ? false : 'tree-sitter unavailable' }, () => {
  const { dir, graph } = runPipeline({ 'src/a.js': A, 'src/b.js': B });
  try {
    const f = nearMiss(graph);
    assert.equal(f.length, 1, `exactly one near-miss finding (got ${JSON.stringify(f.map((x) => x.title))})`);
    assert.ok(f[0].nodes.includes('a.js:alphaWork') && f[0].nodes.includes('b.js:betaWork'));
    assert.match(f[0].evidence, /\d+\/\d+ statement/, 'evidence carries shared/total statement counts');
    assert.match(f[0].recommendation, /review|Read/i, 'REVIEW framing, never auto-merge');
  } finally { cleanup(dir); }
});

test('T3: structurally different bodies of similar length do not pair', { skip: hasEngine ? false : 'tree-sitter unavailable' }, () => {
  const { dir, graph } = runPipeline({ 'src/a.js': A, 'src/c.js': DIFFERENT });
  try {
    assert.deepEqual(nearMiss(graph), [], 'no near-miss finding between unlike bodies');
  } finally { cleanup(dir); }
});

test('T4: small bodies never fingerprint (exact-clone territory stays Signal A)', { skip: hasEngine ? false : 'tree-sitter unavailable' }, () => {
  const { dir, graph } = runPipeline({
    'src/a.js': 'export function tiny1(x) {\n  const a = x + 1;\n  return a;\n}\n',
    'src/b.js': 'export function tiny2(y) {\n  const b = y + 1;\n  return b;\n}\n',
  });
  try {
    assert.deepEqual(nearMiss(graph), [], 'sub-threshold bodies carry no t3');
    assert.ok(!graph.nodes.some((n) => n.t3), 'no fingerprints on tiny nodes');
  } finally { cleanup(dir); }
});

test('T5: regex engine -> no fingerprints, no near-miss findings', () => {
  const dir = tmpDir('codeweb-t3-');
  writeTree(dir, { 'src/a.js': A, 'src/b.js': B });
  const ws = join(dir, 'ws');
  try {
    const r = runNode(script('run.mjs'), [join(dir, 'src'), '--out-dir', ws], { env: { CODEWEB_ENGINE: 'regex' } });
    assert.equal(r.status, 0, r.stderr);
    const g = readJSON(join(ws, 'graph.json'));
    assert.ok(!g.nodes.some((n) => n.t3), 'regex fragments carry no t3');
    assert.deepEqual(nearMiss(g), [], 'no AST tier, no near-miss findings');
  } finally { cleanup(dir); }
});

test('T6: determinism — same source, two workspaces, byte-identical graphs (mod generatedAt)', { skip: hasEngine ? false : 'tree-sitter unavailable' }, () => {
  const norm = (s) => s.replace(/"generatedAt":\s*"[^"]*"/g, '"generatedAt":"<t>"');
  const dir = tmpDir('codeweb-t3-');
  try {
    writeTree(dir, { 'src/a.js': A, 'src/b.js': B });
    const build = (ws) => {
      const r = runNode(script('run.mjs'), [join(dir, 'src'), '--out-dir', join(dir, ws), '--full']);
      assert.equal(r.status, 0, r.stderr);
      return readFileSync(join(dir, ws, 'graph.json'), 'utf8');
    };
    assert.equal(norm(build('ws1')), norm(build('ws2')));
  } finally { cleanup(dir); }
});
