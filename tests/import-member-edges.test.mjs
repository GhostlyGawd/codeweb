// Regression suite for namespace/default-import member-access resolution (SCANNER v3) + --dependents.
//
// The bare-call pass cannot see cross-file member usage — `util.merge()` is a method access (leading
// dot -> skipped) and `new AxiosError()` is an ambiguous bare name (dropped). v3 resolves both via the
// IMPORT BINDING, attributed to the enclosing caller, WITHOUT fabricating an edge for a param/local
// `obj.method()` (precision — see reference-edges). --dependents unions all in-edge kinds so an agent
// gets the full "who depends on this" set (the cross-file recall the pilot showed --callers misses).
//
// --no-ctags forces deterministic extraction regardless of host tooling.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runNode, tmpDir, cleanup, writeTree, readJSON, script, hasEdge } from './helpers.mjs';
import { runExtract } from '../scripts/extract-symbols.mjs'; // finding #40 (T-40.5): extractor in-process

const FILES = {
  'util.mjs':
    'export function merge(a, b) {\n' +       // util.mjs:merge
    '  return Object.assign({}, a, b);\n' +   // Object.assign() -> Object not an alias -> NO edge
    '}\n' +
    'export default { merge };\n',
  'widget.mjs':
    'export default class Widget {\n' +       // widget.mjs:Widget (anchor / default export)
    '  static from(x) {\n' +                  // widget.mjs:Widget.from
    '    return new Widget();\n' +
    '  }\n' +
    '}\n',
  'consumer.mjs':
    'import util from "./util.mjs";\n' +      // default import -> module object
    'import Widget from "./widget.mjs";\n' +  // default import -> class
    'export function build(a, b) {\n' +       // consumer.mjs:build
    '  const merged = util.merge(a, b);\n' +  //   build -> util.mjs:merge    (member access via alias)
    '  const w = new Widget();\n' +           //   build -> widget.mjs:Widget (default-import direct use)
    '  return Widget.from(merged) || w;\n' +  //   build -> widget.mjs:Widget.from    (static member via alias)
    '}\n',
  'precision.mjs':
    'export function run(obj) {\n' +          // precision.mjs:run
    '  return obj.merge(1, 2);\n' +           //   obj is a PARAM -> must NOT edge to util.mjs:merge
    '}\n',
};

let SRC, OUT;
before(() => { SRC = tmpDir('codeweb-imp-'); writeTree(SRC, FILES); OUT = join(SRC, 'fragment.json'); });
after(() => cleanup(SRC));

async function extract() {
  const { fragment } = await runExtract({ path: SRC, target: 'imp-x', ctags: false });
  return fragment;
}

test('RECALL: a namespace/default-import member call resolves to the imported symbol', async () => {
  const frag = await extract();
  assert.ok(hasEdge(frag.edges, 'consumer.mjs:build', 'util.mjs:merge', 'call'),
    'build -> util.mjs:merge via util.merge()');
});

test('RECALL: default-import construction (new Widget()) resolves to the class', async () => {
  const frag = await extract();
  assert.ok(hasEdge(frag.edges, 'consumer.mjs:build', 'widget.mjs:Widget', 'call'),
    'build -> widget.mjs:Widget via new Widget()');
});

test('RECALL: a static member call on a default-import alias resolves (Widget.from())', async () => {
  const frag = await extract();
  assert.ok(hasEdge(frag.edges, 'consumer.mjs:build', 'widget.mjs:Widget.from', 'call'),
    'build -> widget.mjs:Widget.from via Widget.from()');
});

test('PRECISION: a param obj.merge() does NOT fabricate an edge to the imported merge', async () => {
  const frag = await extract();
  assert.ok(!hasEdge(frag.edges, 'precision.mjs:run', 'util.mjs:merge', 'call'),
    'obj is a param, not an import alias -> no edge');
});

test('DEPENDENTS: --dependents is a superset of --callers and includes the member-access caller', async () => {
  const frag = await extract();
  const GP = join(SRC, 'graph.json');
  writeTree(SRC, { 'graph.json': JSON.stringify(frag) });
  const dep = runNode(script('query.mjs'), [GP, '--dependents', 'util.mjs:merge', '--json']);
  assert.equal(dep.status, 0, dep.stderr);
  const j = JSON.parse(dep.stdout);
  assert.ok(j.results.includes('consumer.mjs:build'), 'build is a dependent of merge');
  assert.ok(Array.isArray(j.byKind.call) && Array.isArray(j.byKind.import), 'byKind breakdown present');
  const call = runNode(script('query.mjs'), [GP, '--callers', 'util.mjs:merge', '--json']);
  const cj = JSON.parse(call.stdout);
  assert.ok(j.count >= cj.count, 'dependents (all in-edge kinds) is a superset of callers (call-only)');
});
