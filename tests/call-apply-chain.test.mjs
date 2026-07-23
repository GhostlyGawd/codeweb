// Regression suite for `.call()` / `.apply()` member chains (the axios-merge gap run 3 exposed:
// `utils.merge.call({...}, ...)` in fetch.js:factory was missed because the member resolver only saw
// the LAST identifier before `(` — `call` — which is not an import alias). Resolve `X.member.call(...)`
// / `X.member.apply(...)` where X is a namespace/default import alias to the underlying X-file:member.
// Precision-safe: a param `obj.member.call()` stays unresolved.
//
// --no-ctags forces deterministic extraction regardless of host tooling.

// Round 2, finding #40 (WS-H, T-40.4): pure edge-derivation semantics — runs IN-PROCESS via
// runExtract (no spawn, no --out round-trip). Assertions unchanged; only the transport moved.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { tmpDir, cleanup, writeTree, hasEdge } from './helpers.mjs';
import { runExtract } from '../scripts/extract-symbols.mjs';

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

let SRC;
before(() => { SRC = tmpDir('codeweb-callchain-'); writeTree(SRC, FILES); });
after(() => cleanup(SRC));

async function extract() {
  const { fragment } = await runExtract({ path: SRC, target: 'callchain-x', ctags: false });
  return fragment;
}

test('X.member.call(...) resolves to the underlying function', async () => {
  const frag = await extract();
  assert.ok(hasEdge(frag.edges, 'consumer.mjs:factory', 'utils.mjs:merge', 'call'),
    'factory -> utils.mjs:merge via utils.merge.call()');
});

test('X.member.apply(...) resolves to the underlying function', async () => {
  const frag = await extract();
  assert.ok(hasEdge(frag.edges, 'consumer.mjs:shape', 'utils.mjs:merge', 'call'),
    'shape -> utils.mjs:merge via utils.merge.apply()');
});

test('PRECISION: a param obj.member.call() fabricates no edge', async () => {
  const frag = await extract();
  assert.ok(!hasEdge(frag.edges, 'consumer.mjs:passthru', 'utils.mjs:merge'),
    'obj is a param, not an import alias -> no edge');
});
