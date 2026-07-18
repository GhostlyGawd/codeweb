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
