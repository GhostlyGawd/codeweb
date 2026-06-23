// Regression suite for barrel-export anchor PRECISION (the --dependents pollution the efficiency
// pilot surfaced). A namespace/default import (`import utils from './utils.mjs'`) is a MODULE-level
// dependency, but the extractor used to emit the coarse import edge onto the target file's ANCHOR
// SYMBOL (its largest symbol, e.g. `merge`). So every file that imported utils.mjs became a false
// dependent of `merge` — even one that only ever touched `utils.other()`. Now that member-access
// resolution (SCANNER v3) creates PRECISE per-symbol edges, the coarse edge is redirected to the
// target file's `<module>` node, keeping a real "file imports this module" signal without polluting
// any one symbol's dependents.
//
// --no-ctags forces deterministic extraction regardless of host tooling.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runNode, tmpDir, cleanup, writeTree, readJSON, script, hasEdge } from './helpers.mjs';

const FILES = {
  // utils.mjs: `merge` is the file ANCHOR (largest symbol). `other` is a small sibling export.
  'utils.mjs':
    'export function merge(a, b) {\n' +
    '  const k1 = a;\n' +
    '  const k2 = b;\n' +
    '  const k3 = k1;\n' +
    '  const k4 = k2;\n' +
    '  return Object.assign({}, a, b);\n' +
    '}\n' +
    'export function other(x) {\n' +
    '  return x + 1;\n' +
    '}\n' +
    'export default { merge, other };\n',
  // consumerA uses utils.merge -> a REAL dependent of merge (precise member-access call edge).
  'consumerA.mjs':
    'import utils from "./utils.mjs";\n' +
    'export function build(a, b) {\n' +
    '  return utils.merge(a, b);\n' +
    '}\n',
  // consumerB imports utils but only touches utils.other -> must NOT be a dependent of merge.
  'consumerB.mjs':
    'import utils from "./utils.mjs";\n' +
    'export function tweak(x) {\n' +
    '  return utils.other(x);\n' +
    '}\n',
};

let SRC, OUT;
before(() => { SRC = tmpDir('codeweb-anchor-'); writeTree(SRC, FILES); OUT = join(SRC, 'fragment.json'); });
after(() => cleanup(SRC));

function extract() {
  const res = runNode(script('extract-symbols.mjs'), [SRC, '--target', 'anchor-x', '--no-ctags', '--out', OUT]);
  assert.equal(res.status, 0, `extractor exited non-zero:\n${res.stderr}`);
  return readJSON(OUT);
}

test('PRECISION: an importer that never touches the anchor is NOT a dependent of it', () => {
  const frag = extract();
  assert.ok(!hasEdge(frag.edges, 'consumerB.mjs:tweak', 'utils.mjs:merge'),
    'consumerB only uses utils.other() -> no edge to utils.mjs:merge (any kind)');
});

test('the coarse module-import edge is redirected to the target <module> node', () => {
  const frag = extract();
  assert.ok(frag.nodes.some((n) => n.id === 'utils.mjs:<module>' && n.kind === 'module'),
    'a <module> node exists for the imported file');
  assert.ok(hasEdge(frag.edges, 'consumerB.mjs:tweak', 'utils.mjs:<module>', 'import'),
    'the namespace/default import edge lands on utils.mjs:<module>, not on a symbol');
});

test('RECALL: real member-access dependencies are still precise', () => {
  const frag = extract();
  assert.ok(hasEdge(frag.edges, 'consumerA.mjs:build', 'utils.mjs:merge', 'call'),
    'build -> utils.mjs:merge via utils.merge()');
  assert.ok(hasEdge(frag.edges, 'consumerB.mjs:tweak', 'utils.mjs:other', 'call'),
    'tweak -> utils.mjs:other via utils.other()');
});

test('DEPENDENTS: --dependents of the anchor excludes the non-user, includes the real user', () => {
  const frag = extract();
  const GP = join(SRC, 'graph.json');
  writeTree(SRC, { 'graph.json': JSON.stringify(frag) });
  const dep = runNode(script('query.mjs'), [GP, '--dependents', 'utils.mjs:merge', '--json']);
  assert.equal(dep.status, 0, dep.stderr);
  const j = JSON.parse(dep.stdout);
  assert.ok(j.results.includes('consumerA.mjs:build'), 'build (real merge user) IS a dependent');
  assert.ok(!j.results.includes('consumerB.mjs:tweak'), 'tweak (other-only) is NOT a dependent of merge');
});
