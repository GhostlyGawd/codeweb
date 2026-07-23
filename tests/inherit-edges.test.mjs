// Regression suite for inherit edges (class hierarchy) — the second reserved-but-empty edge kind.
// graph-schema.md has always listed call|import|inherit|dataflow, but the extractor only emitted
// call|import. This populates `inherit`:
//   `class X extends Y` (JS/TS) and `class X(Y):` (Python) -> edge X -> Y kind 'inherit', resolved
//   with the same precision gate as calls (alias/same-file/single-global; ambiguous dropped).
// Consumers: an extended base is NOT a dead-code orphan, and changing a base shows up in --impact
// of its subclasses (inherit reverse-reachability).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runNode, tmpDir, cleanup, writeTree, readJSON, script, hasEdge } from './helpers.mjs';
import { runExtract } from '../scripts/extract-symbols.mjs'; // finding #40 (T-40.5): extractor in-process
import { normalizeGraph, buildIndex, impactOf, orphans } from '../scripts/lib/graph-ops.mjs';

const FILES = {
  'animal.mjs': 'export class Animal {\n  speak() { return "..."; }\n}\n',
  'dog.mjs': 'import { Animal } from "./animal.mjs";\nexport class Dog extends Animal {\n  bark() { return "woof"; }\n}\n',
  // Shape is NOT exported and never called — reachable ONLY via inheritance:
  'shapes.mjs':
    'class Shape {\n  area() { return 0; }\n}\n' +
    'class Circle extends Shape {\n  area() { return 3.14; }\n}\n',
  'zoo.py':
    'class Base:\n' +
    '    pass\n' +
    'class Lion(Base):\n' +
    '    pass\n',
};

let SRC, OUT;
before(() => { SRC = tmpDir('codeweb-inherit-'); writeTree(SRC, FILES); OUT = join(SRC, 'fragment.json'); });
after(() => cleanup(SRC));
async function extract() {
  const { fragment } = await runExtract({ path: SRC, target: 'inh-x', ctags: false });
  return fragment;
}

test('JS: `class X extends Y` emits an inherit edge X -> Y (alias-resolved across files)', async () => {
  assert.ok(hasEdge((await extract()).edges, 'dog.mjs:Dog', 'animal.mjs:Animal', 'inherit'), 'Dog -> Animal');
});

test('JS: a same-file `extends` resolves', async () => {
  assert.ok(hasEdge((await extract()).edges, 'shapes.mjs:Circle', 'shapes.mjs:Shape', 'inherit'), 'Circle -> Shape');
});

test('Python: `class X(Y)` emits an inherit edge', async () => {
  assert.ok(hasEdge((await extract()).edges, 'zoo.py:Lion', 'zoo.py:Base', 'inherit'), 'Lion -> Base');
});

test('an extended base class is NOT a dead-code orphan', async () => {
  const g = normalizeGraph(await extract()), idx = buildIndex(g);
  const orphanIds = new Set(orphans(g, idx).map((o) => o.id));
  assert.ok(!orphanIds.has('shapes.mjs:Shape'), 'Shape is reached via inheritance, not dead code');
});

test('--impact of a base class includes its subclass (inherit reverse-reachability)', async () => {
  const g = normalizeGraph(await extract()), idx = buildIndex(g);
  assert.ok(impactOf(idx, ['shapes.mjs:Shape']).includes('shapes.mjs:Circle'),
    'changing Shape impacts Circle');
});
