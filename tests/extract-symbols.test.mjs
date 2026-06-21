// Regression suite for scripts/extract-symbols.mjs — locks in the ambiguous-call fix
// (the root cause of the false `discord:log` super-hub, indeg 127 -> 2) and the resolution rules.
// All runs force --no-ctags so symbol extraction is deterministic regardless of the host.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  runNode, tmpDir, cleanup, writeTree, readJSON, script,
  ambiguousDropped, hasEdge,
} from './helpers.mjs';

// A fixture that reproduces the pathology in miniature:
//  - `log` is defined in TWO files (multi-def, bare-name) -> ambiguous
//  - a.js: caller + a same-file `log`  -> same-file resolution (KEEP)
//  - c.js: bare `log()` with no import  -> ambiguous multi-def (DROP, or wire-to-[0] under legacy)
//  - d/e.js: a single-def name           -> safe global fallback (KEEP)
//  - m1/m2/consumer.js: `fetchData` multi-def, consumer imports m1 -> alias wins (KEEP -> m1)
const FILES = {
  'a.js': 'export function log(x) {\n  return x;\n}\nexport function doA() {\n  log("a");\n}\n',
  'b.js': 'export function log(y) {\n  return y;\n}\n',
  'c.js': 'export function doC() {\n  log("c");\n}\n',
  'd.js': 'export function uniqueHelper() {\n  return 1;\n}\n',
  'e.js': 'export function useIt() {\n  uniqueHelper();\n}\n',
  'm1.js': 'export function fetchData() {\n  return 1;\n}\n',
  'm2.js': 'export function fetchData() {\n  return 2;\n}\n',
  'consumer.js': 'import { fetchData } from "./m1.js";\nexport function run() {\n  fetchData();\n}\n',
};

let SRC, OUT;
before(() => {
  SRC = tmpDir('codeweb-extract-');
  writeTree(SRC, FILES);
  OUT = join(SRC, 'fragment.json');
});
after(() => cleanup(SRC));

function extract({ legacy = false, target = 'sample-x' } = {}) {
  const out = join(SRC, legacy ? 'fragment.legacy.json' : 'fragment.json');
  const res = runNode(script('extract-symbols.mjs'),
    [SRC, '--target', target, '--no-ctags', '--out', out],
    { env: legacy ? { CODEWEB_LEGACY_FALLBACK: '1' } : {} });
  assert.equal(res.status, 0, `extractor exited non-zero:\n${res.stderr}`);
  return { frag: readJSON(out), stderr: res.stderr };
}

test('discovers every symbol (9 across 8 files)', () => {
  const { frag } = extract();
  assert.equal(frag.nodes.length, 9);
  const ids = new Set(frag.nodes.map((n) => n.id));
  assert.ok(ids.has('a.js:log') && ids.has('b.js:log'), 'both log defs present (multi-def)');
  assert.ok(ids.has('c.js:doC') && ids.has('m1.js:fetchData') && ids.has('m2.js:fetchData'));
});

test('FIX: ambiguous multi-def bare call is dropped, not wired to a global def', () => {
  const { frag, stderr } = extract();
  // c.js calls bare `log()` with no import and two `log` defs -> unattributable -> dropped.
  assert.equal(ambiguousDropped(stderr), 1, 'exactly one ambiguous bare call dropped');
  assert.equal(frag.edges.filter((e) => e.from === 'c.js:doC').length, 0,
    'doC must have NO outgoing call edge (the false-hub edge is dropped)');
  assert.ok(!hasEdge(frag.edges, 'c.js:doC', 'a.js:log'), 'no fabricated edge to byName[0]');
  assert.ok(!hasEdge(frag.edges, 'c.js:doC', 'b.js:log'));
});

test('LEGACY toggle restores the pre-fix byName[0] wiring (fix is load-bearing)', () => {
  const { frag, stderr } = extract({ legacy: true });
  // Same fixture, CODEWEB_LEGACY_FALLBACK=1: the dropped edge comes back, fabricated against the
  // first global def. WHICH def ([0]) depends on file-enumeration order, which `rg --files` does
  // not guarantee across process invocations — that order-dependence is precisely the fragility
  // the fix removes. So assert that legacy fabricates exactly one edge to *a* log def; the fix
  // (default test above) drops it deterministically to zero.
  assert.equal(ambiguousDropped(stderr), 0, 'legacy path fabricates instead of dropping');
  const fromDoC = frag.edges.filter((e) => e.from === 'c.js:doC' && e.kind === 'call');
  assert.equal(fromDoC.length, 1, 'legacy wires the bare call to one global def');
  assert.match(fromDoC[0].to, /^[ab]\.js:log$/, 'wired to a (nondeterministic) log definition');
});

test('same-file definition resolves authoritatively', () => {
  const { frag } = extract();
  assert.ok(hasEdge(frag.edges, 'a.js:doA', 'a.js:log', 'call'),
    'doA -> log resolves within a.js even though log is also defined in b.js');
});

test('single-def bare name still falls back to the one global def', () => {
  const { frag } = extract();
  assert.ok(hasEdge(frag.edges, 'e.js:useIt', 'd.js:uniqueHelper', 'call'),
    'a name with exactly one definition is safe to wire');
});

test('imported symbol resolves to the imported target, beating both drop and byName[0]', () => {
  const { frag } = extract();
  assert.ok(hasEdge(frag.edges, 'consumer.js:run', 'm1.js:fetchData', 'call'),
    'alias resolves fetchData -> m1 (the imported one)');
  assert.ok(!hasEdge(frag.edges, 'consumer.js:run', 'm2.js:fetchData'),
    'must NOT bleed to the other fetchData def');
});

test('meta block is the single source of truth for the target', () => {
  const { frag } = extract({ target: 'sample-x' });
  const m = frag.meta;
  assert.equal(m.target, 'sample-x', 'explicit --target label wins');
  assert.equal(m.engine, 'regex', '--no-ctags forces the regex engine');
  assert.equal(m.symbols, frag.nodes.length, 'meta.symbols mirrors node count');
  assert.deepEqual(m.languages, ['javascript'], 'all-JS fixture');
  assert.match(m.root, /^([A-Za-z]:)?\//, 'root is absolute, forward-slashed');
  assert.ok(!m.root.includes('\\'), 'root has no backslashes (cross-platform reconstruction)');
});
