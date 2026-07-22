// v7 overlap precision — findings scope to product code, and same-name groups that nothing in-repo
// calls demote to `interface-pattern` (framework contracts must not get "merge these" advice; on
// vite that advice topped the findings with resolveId()×32 plugin hooks and 23 playground fixtures).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runNode, script, tmpDir, cleanup, writeTree, readJSON } from './helpers.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const HOOK_BODY = 'function resolveId(id) {\n  return id.replace("~", "");\n}\n';

function runOverlap(files, nodes, edges, env = {}) {
  const dir = tmpDir('codeweb-ovr-');
  writeTree(dir, files);
  const ws = join(dir, 'ws');
  mkdirSync(ws, { recursive: true });
  const graph = {
    meta: { root: dir.replace(/\\/g, '/'), target: 'ovr-fixture' },
    nodes, edges, domains: [], overlaps: [],
  };
  writeFileSync(join(ws, 'graph.json'), JSON.stringify(graph));
  const r = runNode(script('overlap.mjs'), [], { env: { CODEWEB_WS: ws, ...env } });
  assert.equal(r.status, 0, r.stderr);
  return { dir, ws, out: readJSON(join(ws, 'graph.json')) };
}

const mkNode = (file, label, line, extra = {}) => ({
  id: `${file}:${label}`, label, kind: 'function', file, line, loc: 3, exports: false, domain: 'core', ...extra,
});

test('>=4 same-named uncalled implementations demote to interface-pattern (never "merge these")', () => {
  const files = {};
  const nodes = [];
  for (let i = 1; i <= 4; i++) {
    files[`plugin${i}/index.js`] = HOOK_BODY;
    nodes.push(mkNode(`plugin${i}/index.js`, 'resolveId', 1));
  }
  const { dir, out } = runOverlap(files, nodes, []);
  try {
    const finding = out.overlaps.find((o) => o.nodes.some((n) => n.endsWith(':resolveId')));
    assert.ok(finding, 'the group is still reported (not silently dropped)');
    assert.equal(finding.kind, 'interface-pattern');
    assert.match(finding.recommendation, /Do NOT merge/, 'the advice inverts');
    assert.ok(!/Extract one/.test(finding.recommendation), 'no consolidation advice for a contract');
  } finally { cleanup(dir); }
});

test('duplicated FIXTURE helpers are excluded from findings by default; CODEWEB_ALL_ROLES=1 restores them', () => {
  const body = 'function text(el) {\n  return el.textContent;\n}\n';
  const files = {
    'playground/a/main.js': body,
    'playground/b/main.js': body,
    'src/x.js': 'function used() {\n  return 1;\n}\n',
  };
  const nodes = [
    mkNode('playground/a/main.js', 'text', 1, { role: 'example' }),
    mkNode('playground/b/main.js', 'text', 1, { role: 'example' }),
    mkNode('src/x.js', 'used', 1, { role: 'product' }),
  ];
  const scoped = runOverlap(files, nodes, []);
  try {
    assert.ok(!scoped.out.overlaps.some((o) => o.title.includes('text')), 'fixture duplication out of scope by default');
  } finally { cleanup(scoped.dir); }

  const all = runOverlap(files, nodes, [], { CODEWEB_ALL_ROLES: '1' });
  try {
    assert.ok(all.out.overlaps.some((o) => o.title.includes('text')), 'CODEWEB_ALL_ROLES=1 widens the scope');
  } finally { cleanup(all.dir); }
});

// Finding #16 — Signal B (structural twins) bypassed the product-role scope its own header
// advertises: `cand` was built from ALL-edge outLabels and the twin loop never consulted roles,
// so 11 of 13 self-findings were "merge the test helpers" — the exact advice role-scoping was
// built to kill. The fixture writes `call`-kind edges directly (real extracts relabel
// test->product calls to kind `test`, which Signal B already skips — the CALLER-side filter is
// the thing under test).
test('Signal B: twin candidates scope to product roles; CODEWEB_ALL_ROLES=1 restores', () => {
  const tBody = 'function tHelper(x) {\n  return setup(x) && check(x);\n}\n';
  const pBody = 'function pHelper(x) {\n  return c1(x) + c2(x) + c3(x) + c4(x);\n}\n';
  const files = {
    'tests/h1.test.js': tBody,
    'tests/h2.test.js': tBody,
    'src/p1.js': pBody,
    'src/p2.js': pBody,
    'src/c.js': 'function c1() {}\nfunction c2() {}\nfunction c3() {}\nfunction c4() {}\n',
  };
  const nodes = [
    mkNode('tests/h1.test.js', 'tA', 1, { role: 'test' }),
    mkNode('tests/h2.test.js', 'tB', 1, { role: 'test' }),
    mkNode('src/p1.js', 'pA', 1, { role: 'product' }),
    mkNode('src/p2.js', 'pB', 1, { role: 'product' }),
    mkNode('src/c.js', 'c1', 1, { role: 'product' }),
    mkNode('src/c.js', 'c2', 2, { role: 'product' }),
    mkNode('src/c.js', 'c3', 3, { role: 'product' }),
    mkNode('src/c.js', 'c4', 4, { role: 'product' }),
  ];
  // each of tA/tB/pA/pB calls all of c1..c4 -> out-label sets of size 4 (>= TWIN_MIN_OUT), jaccard 1
  const edges = [];
  for (const from of ['tests/h1.test.js:tA', 'tests/h2.test.js:tB', 'src/p1.js:pA', 'src/p2.js:pB']) {
    for (const c of ['c1', 'c2', 'c3', 'c4']) edges.push({ from, to: `src/c.js:${c}`, kind: 'call', weight: 1 });
  }

  const scoped = runOverlap(files, nodes, edges);
  try {
    const twins = scoped.out.overlaps.filter((o) => o.kind === 'parallel-impl');
    assert.ok(twins.some((o) => o.nodes.includes('src/p1.js:pA') && o.nodes.includes('src/p2.js:pB')),
      `the product twin pair pA/pB is still found: ${JSON.stringify(twins)}`);
    assert.ok(!twins.some((o) => o.nodes.includes('tests/h1.test.js:tA') && o.nodes.includes('tests/h2.test.js:tB')),
      `test helpers must not pair by default: ${JSON.stringify(twins)}`);
    const testIds = ['tests/h1.test.js:tA', 'tests/h2.test.js:tB'];
    assert.ok(!twins.some((o) => o.nodes.some((n) => testIds.includes(n))),
      `no twin finding may contain a test node at all (no cross-role pair): ${JSON.stringify(twins)}`);
  } finally { cleanup(scoped.dir); }

  const all = runOverlap(files, nodes, edges, { CODEWEB_ALL_ROLES: '1' });
  try {
    const twins = all.out.overlaps.filter((o) => o.kind === 'parallel-impl');
    assert.ok(twins.some((o) => o.nodes.includes('tests/h1.test.js:tA') && o.nodes.includes('tests/h2.test.js:tB')),
      `CODEWEB_ALL_ROLES=1 restores the test-helper pairing: ${JSON.stringify(twins)}`);
  } finally { cleanup(all.dir); }
});
