// Regression suite for `.call()` / `.apply()` member chains (the axios-merge gap run 3 exposed:
// `utils.merge.call({...}, ...)` in fetch.js:factory was missed because the member resolver only saw
// the LAST identifier before `(` — `call` — which is not an import alias). Resolve `X.member.call(...)`
// / `X.member.apply(...)` where X is a namespace/default import alias to the underlying X-file:member.
// Precision-safe: a param `obj.member.call()` stays unresolved.
//
// --no-ctags forces deterministic extraction regardless of host tooling.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runNode, tmpDir, cleanup, writeTree, readJSON, script, hasEdge } from './helpers.mjs';

const FILES = {
  'utils.mjs':
    'export function merge(a, b) {\n' +
    '  return Object.assign({}, a, b);\n' +
    '}\n' +
    'export default { merge };\n',
  'consumer.mjs':
    'import utils from "./utils.mjs";\n' +
    'export function factory(env) {\n' +
    '  return utils.merge.call({ skipUndefined: true }, {}, env);\n' +  // .call() -> merge
    '}\n' +
    'export function shape(a, b) {\n' +
    '  return utils.merge.apply(null, [a, b]);\n' +                     // .apply() -> merge
    '}\n' +
    'export function passthru(obj) {\n' +
    '  return obj.merge.call(null);\n' +                                // obj is a PARAM -> no edge
    '}\n',
};

let SRC, OUT;
before(() => { SRC = tmpDir('codeweb-callchain-'); writeTree(SRC, FILES); OUT = join(SRC, 'fragment.json'); });
after(() => cleanup(SRC));

function extract() {
  const res = runNode(script('extract-symbols.mjs'), [SRC, '--target', 'callchain-x', '--no-ctags', '--out', OUT]);
  assert.equal(res.status, 0, `extractor exited non-zero:\n${res.stderr}`);
  return readJSON(OUT);
}

test('X.member.call(...) resolves to the underlying function', () => {
  const frag = extract();
  assert.ok(hasEdge(frag.edges, 'consumer.mjs:factory', 'utils.mjs:merge', 'call'),
    'factory -> utils.mjs:merge via utils.merge.call()');
});

test('X.member.apply(...) resolves to the underlying function', () => {
  const frag = extract();
  assert.ok(hasEdge(frag.edges, 'consumer.mjs:shape', 'utils.mjs:merge', 'call'),
    'shape -> utils.mjs:merge via utils.merge.apply()');
});

test('PRECISION: a param obj.member.call() fabricates no edge', () => {
  const frag = extract();
  assert.ok(!hasEdge(frag.edges, 'consumer.mjs:passthru', 'utils.mjs:merge'),
    'obj is a param, not an import alias -> no edge');
});
