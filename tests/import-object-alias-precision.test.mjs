// Regression suite: a bare reference to an OBJECT-default import alias must not resolve to the target
// file's anchor symbol. `import utils from './utils'` (where utils.js is `export default { merge, ... }`)
// binds utils to the MODULE OBJECT, which is no single symbol. The extractor used to alias such a
// default import to the file's anchor (largest symbol, e.g. merge) as a fallback, so a bare `utils`
// passed as an argument (`register(utils, cb)`) fabricated a call edge to merge — a false caller the
// run-3 pilot surfaced (toFormData.js:<module> -> merge, with zero `merge` text in toFormData). The
// anchor fallback only ever fired for anonymous/object defaults (named defaults are detected precisely),
// where the anchor is a DIFFERENT symbol than the default — so it is dropped. Member access (utils.merge())
// still resolves via the namespace binding; a single-symbol default (class/fn) still aliases precisely.
//
// --no-ctags forces deterministic extraction regardless of host tooling.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runNode, tmpDir, cleanup, writeTree, readJSON, script, hasEdge } from './helpers.mjs';

const FILES = {
  'utils.mjs':
    'export function merge(a, b) {\n' +       // anchor (largest symbol)
    '  const k1 = a; const k2 = b;\n' +
    '  return Object.assign({}, k1, k2);\n' +
    '}\n' +
    'export function tiny(x) {\n' +
    '  return x;\n' +
    '}\n' +
    'export default { merge, tiny };\n',
  'consumer.mjs':
    'import utils from "./utils.mjs";\n' +
    'function register(obj, cb) {\n' +
    '  return obj;\n' +
    '}\n' +
    'export function use(cb) {\n' +
    '  return register(utils, cb);\n' +       // bare `utils` arg -> must NOT resolve to merge
    '}\n' +
    'export function shape(a, b) {\n' +
    '  return utils.merge(a, b);\n' +          // member access -> still resolves to merge
    '}\n',
};

let SRC, OUT;
before(() => { SRC = tmpDir('codeweb-objalias-'); writeTree(SRC, FILES); OUT = join(SRC, 'fragment.json'); });
after(() => cleanup(SRC));

function extract() {
  const res = runNode(script('extract-symbols.mjs'), [SRC, '--target', 'objalias-x', '--no-ctags', '--out', OUT]);
  assert.equal(res.status, 0, `extractor exited non-zero:\n${res.stderr}`);
  return readJSON(OUT);
}

test('PRECISION: a bare object-default alias reference does NOT resolve to the anchor', () => {
  const frag = extract();
  assert.ok(!hasEdge(frag.edges, 'consumer.mjs:use', 'utils.mjs:merge'),
    'register(utils, cb) passes the module object, not merge -> no edge to merge');
});

test('RECALL: member access on the object alias still resolves', () => {
  const frag = extract();
  assert.ok(hasEdge(frag.edges, 'consumer.mjs:shape', 'utils.mjs:merge', 'call'),
    'utils.merge() still resolves to utils.mjs:merge');
});
