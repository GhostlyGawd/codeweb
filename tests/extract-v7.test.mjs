// v7 extractor precision — the four fixes that make top-N rankings trustworthy:
//   1. BODY SPANS on masked lines: a multi-line template literal containing braces desynced the
//      line-local brace counter, so bodies swallowed whole neighboring functions (a 5-line helper
//      recorded as 550 loc on vite — poisoning complexity, context-pack, and body-confirmation).
//   2. ROLES: every node carries role (product|test|fixture|example|bench|generated).
//   3. WORKSPACE SCOPING: bare-name resolution never crosses a package (manifest) boundary —
//      cross-package name collisions fabricated edges (create-vite templates "calling" vite utils).
//   4. CLASS-FIELD ARROWS: `handleClick = () => {}` inside a class is a method (owner-qualified);
//      the same shape OUTSIDE a class is not a phantom node.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runNode, script, tmpDir, cleanup, writeTree, readJSON, hasEdge } from './helpers.mjs';
import { join } from 'node:path';

const EXTRACT = script('extract-symbols.mjs');

function extract(files) {
  const dir = tmpDir('codeweb-v7-');
  try {
    writeTree(dir, files);
    const out = join(dir, 'fragment.json');
    const r = runNode(EXTRACT, [dir, '--no-ctags', '--out', out]);
    assert.equal(r.status, 0, r.stderr);
    return readJSON(out);
  } finally { cleanup(dir); }
}

test('body spans survive multi-line template literals with braces (no more swallowed neighbors)', () => {
  const frag = extract({
    'tpl.js': [
      'export function warn(base) {',
      '  return [',
      '    `(!) invalid "base" option: "${base}". The value',   // template spans lines, contains { }
      '       can only be } or { or "./"`,',
      '  ].join("");',
      '}',
      '',
      'export function tiny(x) {',
      '  return x + 1;',
      '}',
      '',
    ].join('\n'),
  });
  const byId = new Map(frag.nodes.map((n) => [n.id, n]));
  const warn = byId.get('tpl.js:warn'), tiny = byId.get('tpl.js:tiny');
  assert.ok(warn && tiny, 'both functions discovered');
  assert.equal(warn.loc, 6, `warn spans exactly its 6 lines (got ${warn.loc}) — must not absorb tiny`);
  assert.equal(tiny.loc, 3, `tiny spans exactly its 3 lines (got ${tiny.loc})`);
});

test('nodes carry a role derived from their path', () => {
  const frag = extract({
    'src/core.js': 'export function core() {\n  return 1;\n}\n',
    'tests/core.test.js': 'export function tHelper() {\n  return core();\n}\n',
    'examples/demo.js': 'export function demo() {\n  return 2;\n}\n',
    'playground/play.js': 'export function play() {\n  return 3;\n}\n',
  });
  const role = (id) => frag.nodes.find((n) => n.id === id)?.role;
  assert.equal(role('src/core.js:core'), 'product');
  assert.equal(role('tests/core.test.js:tHelper'), 'test');
  assert.equal(role('examples/demo.js:demo'), 'example');
  assert.equal(role('playground/play.js:play'), 'example');
});

test('bare-name resolution stays inside a package boundary (no cross-package collision edges)', () => {
  const files = {
    'packages/app/package.json': '{"name":"app"}',
    'packages/app/main.js': 'export function boot() {\n  return normalize("x");\n}\n',
    'packages/lib/package.json': '{"name":"lib"}',
    'packages/lib/util.js': 'export function normalize(p) {\n  return p.trim();\n}\n',
  };
  const frag = extract(files);
  // normalize is globally unique but lives in ANOTHER package with no import -> the edge would be a
  // name-collision fabrication; it must be dropped as ambiguous.
  assert.ok(!hasEdge(frag.edges, 'packages/app/main.js:boot', 'packages/lib/util.js:normalize'),
    'no bare-name edge across package boundaries');

  // the SAME shape without manifests (single-package tree) keeps resolving as before
  const single = extract({
    'app/main.js': 'export function boot() {\n  return normalize("x");\n}\n',
    'lib/util.js': 'export function normalize(p) {\n  return p.trim();\n}\n',
  });
  assert.ok(hasEdge(single.edges, 'app/main.js:boot', 'lib/util.js:normalize', 'call'),
    'unique-global fallback unchanged when there are no package boundaries');
});

test('class-field arrow methods: discovered inside a class (qualified), NOT outside one', () => {
  const frag = extract({
    'comp.js': [
      'export class Button {',
      '  handleClick = () => {',
      '    return this.value;',
      '  };',
      '}',
      '',
      'export function makeCb() {',
      '  let cb = null;',
      '  cb = () => {',       // same shape, NOT a class field
      '    return 1;',
      '  };',
      '  return cb;',
      '}',
      '',
    ].join('\n'),
  });
  const ids = frag.nodes.map((n) => n.id);
  assert.ok(ids.includes('comp.js:Button.handleClick'), `class-field arrow becomes an owner-qualified method (got ${ids.join(', ')})`);
  assert.ok(!ids.some((i) => /:cb$|\.cb$/.test(i)), 'a local arrow reassignment inside a function is not a phantom method');
});

test('v9: `export * from` barrel chains resolve to the real symbol (no swallowed edges)', () => {
  const frag = extract({
    'impl/core.js': 'export function realWork(x) {\n  return x + 1;\n}\n',
    'impl/index.js': 'export * from "./core.js";\n',
    'barrel.js': 'export * from "./impl/index.js";\n',
    'app.js': 'import { realWork } from "./barrel.js";\nexport function go() {\n  return realWork(1);\n}\n',
  });
  assert.ok(
    frag.edges.some((e) => e.from === 'app.js:go' && e.to === 'impl/core.js:realWork' && e.kind === 'call'),
    `star-chained import resolves through two barrels; got ${JSON.stringify(frag.edges.filter((e) => e.from === 'app.js:go'))}`
  );
});
