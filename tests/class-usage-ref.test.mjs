// Regression suite for CLASS-USAGE ref edges (the AxiosHeaders gap the run-3 pilot exposed). A class
// consumed via `X.staticMethod(...)` or `obj instanceof X` is a real dependent of X-the-CLASS, but the
// extractor routed `X.from()` to the `from` METHOD and emitted NOTHING for `instanceof`, so
// `--callers`/`--dependents` of the class missed every such user (AxiosHeaders `--callers` returned 2).
//
// New 'ref' edge kind: at each `instanceof X` / `X.staticMethod()` where X is an imported CLASS (its
// default export is a class), emit a ref edge from the ENCLOSING function to the class — the oracle's
// exact truth granularity. Construction `new X()` stays a call edge. Precision-safe: an OBJECT-default
// alias (`import utils from './utils'`, `export default { merge }`) gets NO class ref — utils isn't a
// class, so utils.merge() is only a call to merge.
//
// --no-ctags forces deterministic extraction regardless of host tooling.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runNode, tmpDir, cleanup, writeTree, readJSON, script, hasEdge } from './helpers.mjs';
import { runExtract } from '../scripts/extract-symbols.mjs'; // finding #40 (T-40.5): extractor in-process

const FILES = {
  'AxiosHeaders.mjs':
    'export default class AxiosHeaders {\n' +
    '  static from(x) {\n' +
    '    return new AxiosHeaders();\n' +
    '  }\n' +
    '  get(k) {\n' +
    '    return k;\n' +
    '  }\n' +
    '}\n',
  'consumer.mjs':
    'import AxiosHeaders from "./AxiosHeaders.mjs";\n' +
    'export function build(cfg) {\n' +
    '  return AxiosHeaders.from(cfg);\n' +      // static method -> ref to class + call to from
    '}\n' +
    'export function check(x) {\n' +
    '  return x instanceof AxiosHeaders;\n' +   // instanceof -> ref to class
    '}\n' +
    'export function make() {\n' +
    '  return new AxiosHeaders();\n' +          // construction -> call to class (existing)
    '}\n',
  // object-default barrel: utils is NOT a class -> member access must NOT create a class ref.
  'utils.mjs':
    'export function merge(a, b) {\n' +
    '  return Object.assign({}, a, b);\n' +
    '}\n' +
    'export default { merge };\n',
  'objConsumer.mjs':
    'import utils from "./utils.mjs";\n' +
    'export function go(a, b) {\n' +
    '  return utils.merge(a, b);\n' +           // member on an OBJECT -> call to merge, NO class ref
    '}\n',
};

let SRC, OUT;
before(() => { SRC = tmpDir('codeweb-ref-'); writeTree(SRC, FILES); OUT = join(SRC, 'fragment.json'); });
after(() => cleanup(SRC));

async function extract() {
  const { fragment } = await runExtract({ path: SRC, target: 'ref-x', ctags: false });
  return fragment;
}

test('a static-method call on an imported class refs the CLASS (and still calls the method)', async () => {
  const frag = await extract();
  assert.ok(hasEdge(frag.edges, 'consumer.mjs:build', 'AxiosHeaders.mjs:AxiosHeaders', 'ref'),
    'build -> AxiosHeaders (class) via AxiosHeaders.from()');
  assert.ok(hasEdge(frag.edges, 'consumer.mjs:build', 'AxiosHeaders.mjs:AxiosHeaders.from', 'call'),
    'build -> AxiosHeaders.from (method, owner-qualified id) call edge preserved');
});

test('instanceof on an imported class refs the CLASS', async () => {
  const frag = await extract();
  assert.ok(hasEdge(frag.edges, 'consumer.mjs:check', 'AxiosHeaders.mjs:AxiosHeaders', 'ref'),
    'check -> AxiosHeaders via instanceof');
});

test('construction still produces a call edge to the class', async () => {
  const frag = await extract();
  assert.ok(hasEdge(frag.edges, 'consumer.mjs:make', 'AxiosHeaders.mjs:AxiosHeaders', 'call'),
    'make -> AxiosHeaders via new');
});

test('PRECISION: an object-default member access creates NO class ref', async () => {
  const frag = await extract();
  assert.ok(!frag.edges.some((e) => e.from === 'objConsumer.mjs:go' && e.kind === 'ref'),
    'utils is an object, not a class -> go emits no ref edge');
  assert.ok(hasEdge(frag.edges, 'objConsumer.mjs:go', 'utils.mjs:merge', 'call'),
    'utils.merge() is still a precise call to merge');
});

test('DEPENDENTS: --dependents of the class unions the ref users, with a ref byKind breakdown', async () => {
  const frag = await extract();
  const GP = join(SRC, 'graph.json');
  writeTree(SRC, { 'graph.json': JSON.stringify(frag) });
  const dep = runNode(script('query.mjs'), [GP, '--dependents', 'AxiosHeaders.mjs:AxiosHeaders', '--json']);
  assert.equal(dep.status, 0, dep.stderr);
  const j = JSON.parse(dep.stdout);
  for (const u of ['consumer.mjs:build', 'consumer.mjs:check', 'consumer.mjs:make'])
    assert.ok(j.results.includes(u), `${u} is a dependent of AxiosHeaders`);
  assert.ok(Array.isArray(j.byKind.ref) && j.byKind.ref.length >= 2, 'ref byKind present (build + check)');
});
