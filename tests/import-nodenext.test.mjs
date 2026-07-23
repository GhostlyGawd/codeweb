// Finding #11 — NodeNext `.js` specifiers must reach `.ts/.tsx` sources (T-11.1 recall fixtures).
//
// Under `moduleResolution: node16/nodenext`, TypeScript REQUIRES relative imports to be spelled
// with the EMITTED extension (`./x.js` for `./x.ts`, `./h.mjs` for `./h.mts`) — the candidate
// list in lib/import-resolve.mjs never mapped those specifiers back to their TS sources, and the
// index-candidate list was missing `/index.tsx|jsx|cjs|mts|cts`. So alias, namespace, and
// re-export edges silently vanished in modern TS repos (resolveImport -> null -> alias miss ->
// bare-name fallback ambiguous/absent). One fixture package per case, real extractor runs.
//
// i6 is the both-exist PRECEDENCE pin (deliberate divergence from tsc, which probes substituted
// `x.ts` BEFORE the literal `x.js`): codeweb keeps Node runtime semantics — the literal on-disk
// file wins — so ext-remaps stay pure recall additions. It guards the remap from ever flipping a
// currently-resolving specifier.
//
// --no-ctags forces deterministic extraction regardless of host tooling.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runNode, tmpDir, cleanup, writeTree, readJSON, script, hasEdge, ambiguousDropped } from './helpers.mjs';

function extract(files) {
  const dir = tmpDir('codeweb-nodenext-');
  writeTree(dir, files);
  const out = join(dir, 'fragment.json');
  const res = runNode(script('extract-symbols.mjs'), [dir, '--target', 'nodenext-x', '--no-ctags', '--out', out]);
  assert.equal(res.status, 0, `extractor exited non-zero:\n${res.stderr}`);
  return { dir, frag: readJSON(out), stderr: res.stderr };
}

test('i1: `.js` specifier disambiguates between two same-named `.ts` exports (ext remap)', () => {
  const { dir, frag, stderr } = extract({
    'src/x-parse.ts': 'export function parse(s: string) { return s.trim(); }\n',
    'src/y-parse.ts': 'export function parse(s: string) { return s.toUpperCase(); }\n',
    'src/main.ts':
      "import { parse } from './x-parse.js';\n" +
      'export function run(s: string) { return parse(s); }\n',
  });
  try {
    assert.ok(hasEdge(frag.edges, 'src/main.ts:run', 'src/x-parse.ts:parse', 'call'),
      `run -> x-parse:parse must resolve via the .js->.ts remap; edges: ${JSON.stringify(frag.edges)}`);
    assert.ok(!hasEdge(frag.edges, 'src/main.ts:run', 'src/y-parse.ts:parse'),
      'the import names x-parse — no edge may bleed to y-parse');
    assert.equal(ambiguousDropped(stderr), 0,
      'the aliased call must not fall into the ambiguous bare-name drop');
  } finally { cleanup(dir); }
});

test('i2: `import * as u from "./util.js"` binds the namespace to util.ts (member call edges)', () => {
  const { dir, frag } = extract({
    'src/util.ts': 'export function merge(a: number, b: number) { return b; }\n',
    'src/app.ts':
      "import * as u from './util.js';\n" +
      'export function boot() { return u.merge(1, 2); }\n',
  });
  try {
    assert.ok(hasEdge(frag.edges, 'src/app.ts:boot', 'src/util.ts:merge', 'call'),
      `boot -> util:merge must resolve through the namespace binding; edges: ${JSON.stringify(frag.edges)}`);
  } finally { cleanup(dir); }
});

test('i3: re-export chain through a `.js`-specified barrel resolves + barrel dependent edge', () => {
  const { dir, frag } = extract({
    'src/util.ts': 'export function shared() { return 1; }\n',
    'src/index.ts': "export { shared } from './util.js';\n",
    'src/consumer.ts':
      "import { shared } from './index.js';\n" +
      'export function use() { return shared(); }\n',
  });
  try {
    assert.ok(hasEdge(frag.edges, 'src/consumer.ts:use', 'src/util.ts:shared', 'call'),
      `use -> util:shared must resolve through the re-export chain; edges: ${JSON.stringify(frag.edges)}`);
    // v9 barrel-is-a-dependent contract: the re-export specifier is a reference the barrel owns.
    assert.ok(hasEdge(frag.edges, 'src/index.ts:<module>', 'src/util.ts:shared'),
      `barrel <module> -> util:shared dependent edge must exist; edges: ${JSON.stringify(frag.edges)}`);
  } finally { cleanup(dir); }
});

test('i4: `.mjs`->`.mts` remap and `/index.tsx` index candidates resolve', () => {
  const { dir, frag } = extract({
    'src/helper.mts': 'export function help() { return 1; }\n',
    'src/lib/index.tsx': 'export function widget() { return 2; }\n',
    'src/page.mts':
      "import { help } from './helper.mjs';\n" +
      "import { widget } from './lib/index.js';\n" +
      "import { widget as w2 } from './lib';\n" +
      'export function draw() { return help() + widget(); }\n',
  });
  try {
    assert.ok(hasEdge(frag.edges, 'src/page.mts:draw', 'src/helper.mts:help', 'call'),
      `draw -> helper.mts:help must resolve via the .mjs->.mts remap; edges: ${JSON.stringify(frag.edges)}`);
    assert.ok(hasEdge(frag.edges, 'src/page.mts:draw', 'src/lib/index.tsx:widget', 'call'),
      `draw -> lib/index.tsx:widget must resolve via the /index.tsx candidate; edges: ${JSON.stringify(frag.edges)}`);
  } finally { cleanup(dir); }
});

test('i5: pub-entrypoint walk follows main "./src/index.js" to src/index.ts (mirrored list)', () => {
  const { dir, frag } = extract({
    'package.json': '{"name":"p","main":"./src/index.js"}\n',
    'src/index.ts': 'export function api() { return 1; }\n',
  });
  try {
    const api = frag.nodes.find((n) => n.id === 'src/index.ts:api');
    assert.ok(api, 'src/index.ts:api node exists');
    assert.equal(api.pub, true,
      'api is reachable from the package entrypoint via the .js->.ts remap and must be pub');
  } finally { cleanup(dir); }
});

test('i6: when BOTH dual.js and dual.ts exist, the literal on-disk .js wins (Node semantics)', () => {
  const { dir, frag } = extract({
    'src/dual.js': 'export function f() { return 1; }\n',
    'src/dual.ts': 'export function f() { return 2; }\n',
    'src/main.ts':
      "import { f } from './dual.js';\n" +
      'export function call() { return f(); }\n',
  });
  try {
    assert.ok(hasEdge(frag.edges, 'src/main.ts:call', 'src/dual.js:f', 'call'),
      `the literal on-disk dual.js must win over the remapped dual.ts; edges: ${JSON.stringify(frag.edges)}`);
    assert.ok(!hasEdge(frag.edges, 'src/main.ts:call', 'src/dual.ts:f'),
      'the remap must never flip a specifier that already resolves (pure recall addition)');
  } finally { cleanup(dir); }
});
