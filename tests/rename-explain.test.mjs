// P3 — rename-aware diff + the codeweb_explain composite card.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runNode, script, tmpDir, cleanup, writeTree } from './helpers.mjs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

test('diff: a rename (same body, new name) reports as renamed, not delete+add churn', () => {
  const dir = tmpDir('codeweb-ren-');
  try {
    // real source on disk so body-similarity matching engages
    writeTree(dir, {
      'v1/util.js': 'export function fetchData(u) {\n  const r = get(u);\n  return r.json();\n}\n',
      'v2/util.js': 'export function loadData(u) {\n  const r = get(u);\n  return r.json();\n}\n',
    });
    const node = (id, file, line) => ({ id, label: id.split(':')[1], kind: 'function', file, line, loc: 4, exports: true, domain: 'core' });
    const before = { meta: { root: join(dir, 'v1').replace(/\\/g, '/'), target: 'b' }, nodes: [node('util.js:fetchData', 'util.js', 1)], edges: [], domains: [], overlaps: [] };
    const after = { meta: { root: join(dir, 'v2').replace(/\\/g, '/'), target: 'a' }, nodes: [node('util.js:loadData', 'util.js', 1)], edges: [], domains: [], overlaps: [] };
    const bp = join(dir, 'b.json'), ap = join(dir, 'a.json');
    writeFileSync(bp, JSON.stringify(before)); writeFileSync(ap, JSON.stringify(after));
    const r = runNode(script('diff.mjs'), [bp, ap, '--json']);
    const payload = JSON.parse(r.stdout);
    assert.equal(payload.nodes.renamed.length, 1, 'one rename detected');
    assert.equal(payload.nodes.renamed[0].from, 'util.js:fetchData');
    assert.equal(payload.nodes.renamed[0].to, 'util.js:loadData');
    assert.ok(payload.nodes.renamed[0].sim >= 0.85, 'structural similarity recorded');
    assert.deepEqual(payload.nodes.added, [], 'the renamed node is not added-churn');
    assert.deepEqual(payload.nodes.removed, [], 'the renamed node is not removed-churn');
    assert.equal(payload.ok, true, 'a clean rename is not a regression');
  } finally { cleanup(dir); }
});

test('explain: one bounded card with identity, dependents, tops, and findings membership', () => {
  const dir = tmpDir('codeweb-exp-');
  try {
    const node = (id, file, extra = {}) => ({ id, label: id.split(':')[1], kind: 'function', file, line: 1, loc: 3, exports: false, domain: 'core', role: 'product', ...extra });
    const graph = {
      meta: { target: 'exp' },
      nodes: [
        node('a.js:hub', 'a.js', { exports: true }),
        node('b.js:one', 'b.js'), node('c.js:two', 'c.js'),
        node('t/x.test.js:tcase', 't/x.test.js', { role: 'test' }),
      ],
      edges: [
        { from: 'b.js:one', to: 'a.js:hub', kind: 'call' },
        { from: 'c.js:two', to: 'a.js:hub', kind: 'call' },
        { from: 't/x.test.js:tcase', to: 'a.js:hub', kind: 'test' },
      ],
      domains: [],
      overlaps: [{ id: 'ov1', kind: 'duplicate-logic', confidence: 'high', title: '`hub` re-implemented in 2 files', nodes: ['a.js:hub', 'z.js:hub'] }],
    };
    const gp = join(dir, 'graph.json');
    writeFileSync(gp, JSON.stringify(graph));
    const r = runNode(script('explain.mjs'), [gp, 'hub', '--json']);
    assert.equal(r.status, 0, r.stderr);
    const payload = JSON.parse(r.stdout);
    assert.equal(payload.cards.length, 1);
    const c = payload.cards[0];
    assert.equal(c.dependents.callers, 2);
    assert.equal(c.dependents.tests, 1);
    assert.equal(c.dependents.blastRadius, 2);
    assert.deepEqual(c.topCallers.sort(), ['b.js:one', 'c.js:two']);
    assert.equal(c.findings.length, 1, 'membership in overlap findings surfaces');
    assert.ok(r.stdout.length < 2500, `the card stays bounded (${r.stdout.length} bytes)`);
    // unknown symbol -> found:false, exit 1 (matches query tool conventions)
    const miss = runNode(script('explain.mjs'), [gp, 'nope', '--json']);
    assert.equal(miss.status, 1);
    assert.equal(JSON.parse(miss.stdout).found, false);
  } finally { cleanup(dir); }
});
