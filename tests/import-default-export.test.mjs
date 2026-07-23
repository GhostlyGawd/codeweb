// Regression suite refining the barrel-export anchor fix: a default import binds the target's DEFAULT
// EXPORT. When that default is a single named symbol (`export default class AxiosError`), the coarse
// import edge belongs on THAT symbol — an importer that re-exports/attaches it (lib/axios.js does
// `axios.AxiosError = AxiosError`) is a real dependent even without a detected call. Only when the
// default is an OBJECT literal (`export default { merge, ... }`) or it's a namespace import is there no
// single symbol, so the edge falls back to the file's <module> node. This keeps the merge-precision win
// (object default -> module) AND AxiosError recall (class default -> the class).
//
// --no-ctags forces deterministic extraction regardless of host tooling.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runNode, tmpDir, cleanup, writeTree, readJSON, script, hasEdge } from './helpers.mjs';
import { runExtract } from '../scripts/extract-symbols.mjs'; // finding #40 (T-40.5): extractor in-process

const FILES = {
  // box.mjs's default export IS the Box class (a single named symbol).
  'box.mjs':
    'export default class Box {\n' +
    '  open() {\n' +
    '    return 1;\n' +
    '  }\n' +
    '}\n',
  // shipper imports Box and references it (re-export/attach) WITHOUT constructing it -> a real
  // dependent of Box that only the coarse import edge can record.
  'shipper.mjs':
    'import Box from "./box.mjs";\n' +
    'export function dispatch() {\n' +
    '  return Box;\n' +
    '}\n',
};

let SRC, OUT;
before(() => { SRC = tmpDir('codeweb-defexp-'); writeTree(SRC, FILES); OUT = join(SRC, 'fragment.json'); });
after(() => cleanup(SRC));

async function extract() {
  const { fragment } = await runExtract({ path: SRC, target: 'defexp-x', ctags: false });
  return fragment;
}

test('a default import of a single-symbol class lands the coarse edge on the CLASS', async () => {
  const frag = await extract();
  assert.ok(hasEdge(frag.edges, 'shipper.mjs:dispatch', 'box.mjs:Box', 'import'),
    'import edge targets box.mjs:Box (the default export), not the <module> node');
});

test('the default-export import edge is NOT routed to <module> when a single symbol exists', async () => {
  const frag = await extract();
  assert.ok(!hasEdge(frag.edges, 'shipper.mjs:dispatch', 'box.mjs:<module>', 'import'),
    'no <module> fallback edge when the default is a single named symbol');
});

test('DEPENDENTS: the importer is a dependent of the class even without a detected call', async () => {
  const frag = await extract();
  const GP = join(SRC, 'graph.json');
  writeTree(SRC, { 'graph.json': JSON.stringify(frag) });
  const dep = runNode(script('query.mjs'), [GP, '--dependents', 'box.mjs:Box', '--json']);
  assert.equal(dep.status, 0, dep.stderr);
  const j = JSON.parse(dep.stdout);
  assert.ok(j.results.includes('shipper.mjs:dispatch'), 'dispatch depends on Box (import-kind)');
  assert.ok(j.byKind.import.includes('shipper.mjs:dispatch'), 'classified as an import dependent');
});
