// F6 integration — find-similar.mjs --structural surfaces a Type-2 clone (a function copied then
// fully renamed) that the default lexical mode ranks lower. The skeleton lib's rename-invariance is
// unit-tested in skeleton.test.mjs; this proves it reaches the agent-facing tool end to end.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runNode, script, tmpDir, cleanup, writeTree } from './helpers.mjs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BODY = 'function calc(items, rate) {\n  let total = 0;\n  for (const it of items) { total += it.price * rate; }\n  if (total > 100) { total = total * 0.9; }\n  return total;\n}';
// same structure, every identifier renamed + literals changed (a Type-2 clone)
const RENAMED = 'function compute(list, factor) {\n  let sum = 0;\n  for (const x of list) { sum += x.cost * factor; }\n  if (sum > 250) { sum = sum * 0.8; }\n  return sum;\n}';

test('F6-STRUCTURAL-FIND: --structural ranks a renamed clone higher than lexical does', () => {
  const dir = tmpDir('codeweb-f6-');
  try {
    const srcRoot = join(dir, 'src');
    writeTree(srcRoot, { 'a.js': BODY + '\n', 'b.js': 'function unrelated() { return fetch(url).then(r => r.json()); }\n' });
    const node = (id, file, body) => ({ id, label: id.split(':')[1], kind: 'function', file, line: 1, loc: body.split('\n').length, domain: 'd', exports: true });
    const graph = { meta: { root: srcRoot.replace(/\\/g, '/') }, domains: [], overlaps: [],
      nodes: [node('a.js:calc', 'a.js', BODY), node('b.js:unrelated', 'b.js', 'function unrelated() { return fetch(url).then(r => r.json()); }')], edges: [] };
    const gp = join(dir, 'graph.json'); writeFileSync(gp, JSON.stringify(graph));
    const candFile = join(dir, 'cand.js'); writeFileSync(candFile, RENAMED);

    const structural = JSON.parse(runNode(script('find-similar.mjs'), [gp, '--body', candFile, '--structural', '--json']).stdout);
    const lexical = JSON.parse(runNode(script('find-similar.mjs'), [gp, '--body', candFile, '--json']).stdout);

    assert.equal(structural.candidate.mode, 'structural');
    const sTop = structural.matches.find((m) => m.id === 'a.js:calc');
    const lTop = lexical.matches.find((m) => m.id === 'a.js:calc');
    assert.ok(sTop, 'structural mode finds the renamed clone');
    assert.ok(sTop.sim >= 0.9, `renamed clone is ~1 structurally (got ${sTop.sim})`);
    assert.ok(sTop.sim > (lTop ? lTop.sim : 0) + 0.1, `structural similarity (${sTop.sim}) clearly exceeds lexical (${lTop ? lTop.sim : 0})`);
    assert.equal(structural.matches[0].id, 'a.js:calc', 'the clone is the top structural match');
  } finally { cleanup(dir); }
});
