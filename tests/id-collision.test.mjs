// v6 — owner-qualified method ids. Same-file same-name methods (Python methods across classes, Rust
// fns across impls, Go methods across receivers, JS/TS methods across classes in the regex tier)
// previously collided into ONE node id (`file:name`), corrupting byName resolution, edge attribution,
// and diff's id-keyed comparisons. Every id in a fragment must be unique, and methods carry their
// owner in the id (`file:Type.method`) — the same scheme the tree-sitter tier already used.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runNode, script, tmpDir, cleanup, writeTree, readJSON } from './helpers.mjs';
import { runExtract } from '../scripts/extract-symbols.mjs'; // finding #40 (T-40.5): extractor in-process
import { join } from 'node:path';

const EXTRACT = script('extract-symbols.mjs');

async function extract(files) {
  const dir = tmpDir('codeweb-idc-');
  try {
    writeTree(dir, files);
    const { fragment } = await runExtract({ path: dir, ctags: false });
    return fragment;
  } finally {
    // fragment read into memory; the tree can go
    cleanup(dir);
  }
}

const ids = (frag) => frag.nodes.map((n) => n.id);
const assertUnique = (frag) => {
  const all = ids(frag);
  assert.equal(new Set(all).size, all.length, `duplicate ids: ${all.filter((x, i) => all.indexOf(x) !== i).join(', ')}`);
};

test('python: same-named methods across two classes get class-qualified, distinct ids', async () => {
  const frag = await extract({
    'm.py': [
      'class A:',
      '    def run(self):',
      '        return 1',
      '',
      'class B:',
      '    def run(self):',
      '        return 2',
      '',
    ].join('\n'),
  });
  assertUnique(frag);
  const runIds = ids(frag).filter((i) => /:(A|B)\.run$/.test(i));
  assert.deepEqual(runIds.sort(), ['m.py:A.run', 'm.py:B.run']);
  // labels stay bare so name-based resolution still finds both
  for (const n of frag.nodes.filter((n) => n.id.endsWith('.run'))) assert.equal(n.label, 'run');
});

test('go: same-named methods across two receivers get receiver-qualified, distinct ids', async () => {
  const frag = await extract({
    'm.go': [
      'package m',
      '',
      'type A struct{}',
      'type B struct{}',
      '',
      'func (a *A) Do() int {',
      '\treturn 1',
      '}',
      '',
      'func (b B) Do() int {',
      '\treturn 2',
      '}',
      '',
    ].join('\n'),
  });
  assertUnique(frag);
  const doIds = ids(frag).filter((i) => /\.Do$/.test(i));
  assert.deepEqual(doIds.sort(), ['m.go:A.Do', 'm.go:B.Do']);
});

test('rust: same-named fns across two impl blocks get impl-type-qualified, distinct ids', async () => {
  const frag = await extract({
    'm.rs': [
      'pub struct A;',
      'pub struct B;',
      '',
      'impl A {',
      '    pub fn new() -> Self {',
      '        A',
      '    }',
      '}',
      '',
      'impl B {',
      '    pub fn new() -> Self {',
      '        B',
      '    }',
      '}',
      '',
    ].join('\n'),
  });
  assertUnique(frag);
  const newIds = ids(frag).filter((i) => /\.new$/.test(i));
  assert.deepEqual(newIds.sort(), ['m.rs:A.new', 'm.rs:B.new']);
});

test('js (regex tier): same-named methods across two classes get class-qualified, distinct ids', async () => {
  const frag = await extract({
    'm.js': [
      'export class A {',
      '  render() {',
      '    return 1;',
      '  }',
      '}',
      '',
      'export class B {',
      '  render() {',
      '    return 2;',
      '  }',
      '}',
      '',
    ].join('\n'),
  });
  assertUnique(frag);
  const renderIds = ids(frag).filter((i) => /\.render$/.test(i));
  assert.deepEqual(renderIds.sort(), ['m.js:A.render', 'm.js:B.render']);
});

test('a call from inside a method is attributed FROM the qualified method id', async () => {
  const frag = await extract({
    'm.js': [
      'function helper() {',
      '  return 1;',
      '}',
      'export class A {',
      '  go() {',
      '    return helper();',
      '  }',
      '}',
      '',
    ].join('\n'),
  });
  assertUnique(frag);
  assert.ok(
    frag.edges.some((e) => e.from === 'm.js:A.go' && e.to === 'm.js:helper' && e.kind === 'call'),
    `expected m.js:A.go -> m.js:helper call edge; got ${JSON.stringify(frag.edges)}`
  );
});
