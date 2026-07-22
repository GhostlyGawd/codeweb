// Finding #10 — bare-ref magnets: decl-line refs + role-blind unique-global fallback (T-10.1).
//
// Measured on the self-map: 234 of 1,180 ref edges targeted 8 single-letter test/bench symbols,
// and 209 ref edges ran product -> non-product — all fabricated from PARAMETERS: refRe scanning
// declaration lines (`function metrics(g) {` emits a ref from metrics to a test file's global g)
// and body uses of params hitting the unique-global fallback. The codebase renamed its own
// parameters to dodge this (cli.mjs sourceReader, import-resolve.mjs destructure).
//
// Four mechanisms under test, each isolated by one fixture package:
//   (a)     decl-line skip (T-10.2)        — refRe never scans a declaration/signature line
//   (b)     param-shadow (T-10.4)          — a bare name token-bound by an enclosing signature IS
//                                            that binding; it never falls back to a global
//   (c)     >=3-char guard (T-10.4)        — 1-2-char bare names never resolve via the fallback;
//                                            drops surface as "(N short-name)" in the banner
//   (a-inv) one-directional gate (T-10.3)  — test -> product edges are NEVER gated (they relabel
//                                            to kind `test` and power testIn/coverage)
//   (d)     per-binding suppression        — shadowing is per enclosing range, not per-name-per-
//                                            file: the sibling without the param keeps its edge
//
// --no-ctags forces deterministic extraction regardless of host tooling.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runNode, tmpDir, cleanup, writeTree, readJSON, script, hasEdge } from './helpers.mjs';

function extract(files) {
  const dir = tmpDir('codeweb-refscope-');
  writeTree(dir, files);
  const out = join(dir, 'fragment.json');
  const res = runNode(script('extract-symbols.mjs'), [dir, '--target', 'refscope-x', '--no-ctags', '--out', out]);
  assert.equal(res.status, 0, `extractor exited non-zero:\n${res.stderr}`);
  return { dir, frag: readJSON(out), stderr: res.stderr };
}

test('(a) decl-line magnet: `function metrics(g) {` fabricates no ref to a test-file g', () => {
  const { dir, frag } = extract({
    'src/prod.mjs': 'export function metrics(g) {\n  return g;\n}\n',
    'tests/util.test.mjs': 'export function g() { return 1; }\n',
  });
  try {
    assert.ok(!hasEdge(frag.edges, 'src/prod.mjs:metrics', 'tests/util.test.mjs:g'),
      `the signature line must not be ref-scanned (and product must not ref-resolve into test): ${JSON.stringify(frag.edges)}`);
  } finally { cleanup(dir); }
});

test('(a-inv) test -> product survives, relabeled kind `test` (the gate is one-directional)', () => {
  const { dir, frag } = extract({
    'src/prod.mjs': 'export function metrics(g) {\n  return g;\n}\n',
    'tests/util.test.mjs': 'export function g() { return 1; }\n',
    'tests/t.test.mjs': 'export function checkMetrics() {\n  return metrics(1);\n}\n',
  });
  try {
    assert.ok(hasEdge(frag.edges, 'tests/t.test.mjs:checkMetrics', 'src/prod.mjs:metrics', 'test'),
      `test -> product must keep resolving (feeds testIn/coverage); edges: ${JSON.stringify(frag.edges)}`);
  } finally { cleanup(dir); }
});

test('(b) body param shadow: `walk(rel)` using `rel` never falls back to a global rel()', () => {
  const { dir, frag } = extract({
    'src/a.mjs': 'export function walk(rel) {\n  return probe(rel);\n}\n',
    'src/b.mjs': 'export function rel() { return 0; }\n',
  });
  try {
    assert.ok(!hasEdge(frag.edges, 'src/a.mjs:walk', 'src/b.mjs:rel'),
      `a bare use under a binding IS the binding — no fallback edge; edges: ${JSON.stringify(frag.edges)}`);
  } finally { cleanup(dir); }
});

test('(c) short-name guard: a free-floating 1-char bare ref is dropped and counted', () => {
  const { dir, frag, stderr } = extract({
    'src/c.mjs': 'export function h() {\n  return probe(q);\n}\n',
    'src/q.mjs': 'export function q() { return 0; }\n',
  });
  try {
    assert.ok(!hasEdge(frag.edges, 'src/c.mjs:h', 'src/q.mjs:q'),
      `1-2-char bare names never resolve via the fallback; edges: ${JSON.stringify(frag.edges)}`);
    const m = /\((\d+) short-name\)/.exec(stderr);
    assert.ok(m && Number(m[1]) >= 1,
      `the banner must surface the short-name drop count (never silent): ${stderr}`);
  } finally { cleanup(dir); }
});

// (e) — the spec's blessed Python over-suppression, pinned at its BOUNDARY: parseSignature's raw
// sweep makes `__init__(self, helper)` shadow `helper` inside __init__ (a bare use under a binding
// IS the binding — Python scoping agrees), while a sibling method with no such param keeps its
// real cross-file body ref. The suppression must drop param-refs only, never real body refs.
test('(e) python: __init__ param shadows a module symbol inside __init__ only', () => {
  const { dir, frag } = extract({
    'src/helper.py': 'def helper():\n    return 1\n',
    'src/klass.py':
      'class Widget:\n' +
      '    def __init__(self, helper):\n' +
      '        self.h = probe(helper)\n' +
      '\n' +
      '    def render(self):\n' +
      '        return probe(helper)\n',
  });
  try {
    assert.ok(!hasEdge(frag.edges, 'src/klass.py:Widget.__init__', 'src/helper.py:helper'),
      `the __init__ param binds helper — no fallback ref from __init__; edges: ${JSON.stringify(frag.edges)}`);
    assert.ok(hasEdge(frag.edges, 'src/klass.py:Widget.render', 'src/helper.py:helper', 'ref'),
      `render has no such binding — its real body ref must survive; edges: ${JSON.stringify(frag.edges)}`);
  } finally { cleanup(dir); }
});

// (f) — round-2 WS-D review: the closure-local magnet (the `dep` CI incident, generalized). A
// symbol nested inside another file's FUNCTION body is lexically unreachable from other files, at
// ANY name length — the >=3-char guard's documented residual. graph-ops' `dep` loop variables
// bare-ref-resolved to import-resolve's package-unique `dep` closure and fabricated the cycle the
// structural gate blocked; renaming the closure moved the target but left the class. The fallback
// now excludes closure-local targets; same-file resolution (sameFileByName) is untouched — WS-C's
// two legitimate short survivors are exactly that path.
test('(f) closure-local magnet: loop-var `dep` never ref-resolves into another file\'s closure', () => {
  const { dir, frag } = extract({
    'lib/target.mjs':
      'export function outer(list) {\n' +
      '  const deps = new Set();\n' +
      '  const dep = (t) => { if (t) deps.add(t); return t; };\n' +
      '  for (const x of list) dep(x);\n' +
      '  return deps;\n' +
      '}\n',
    'lib/consumer.mjs':
      'export function impactOf(map, id) {\n' +
      '  const visited = new Set([id]);\n' +
      '  const queue = [id];\n' +
      '  for (let qi = 0; qi < queue.length; qi++) {\n' +
      '    const callers = map.get(queue[qi]);\n' +
      '    if (callers) for (const dep of callers) if (!visited.has(dep)) { visited.add(dep); queue.push(dep); }\n' +
      '  }\n' +
      '  return visited;\n' +
      '}\n',
    'lib/helper.mjs': 'export function summarize(rows) {\n  return rows.length;\n}\n',
    'lib/caller.mjs': 'export function report(rows) {\n  return summarize(rows);\n}\n',
  });
  try {
    assert.ok(!hasEdge(frag.edges, 'lib/consumer.mjs:impactOf', 'lib/target.mjs:dep'),
      `a closure-local is unreachable from another file — no fallback edge; edges: ${JSON.stringify(frag.edges)}`);
    assert.ok(hasEdge(frag.edges, 'lib/target.mjs:outer', 'lib/target.mjs:dep', 'call'),
      `same-file closure call must survive (sameFileByName path, not the fallback); edges: ${JSON.stringify(frag.edges)}`);
    assert.ok(hasEdge(frag.edges, 'lib/caller.mjs:report', 'lib/helper.mjs:summarize', 'call'),
      `positive control: the pkg-unique fallback still resolves TOP-LEVEL targets; edges: ${JSON.stringify(frag.edges)}`);
  } finally { cleanup(dir); }
});

test('(d) suppression is per-binding: f(map) loses the edge, sibling h() keeps it', () => {
  const { dir, frag } = extract({
    'src/f.mjs':
      'export function f(map) {\n  return map();\n}\n' +
      'export function h() {\n  return map();\n}\n',
    'src/map.mjs': 'export function map() { return 0; }\n',
  });
  try {
    assert.ok(!hasEdge(frag.edges, 'src/f.mjs:f', 'src/map.mjs:map'),
      `a call through a param invokes the param's value, never the global; edges: ${JSON.stringify(frag.edges)}`);
    assert.ok(hasEdge(frag.edges, 'src/f.mjs:h', 'src/map.mjs:map', 'call'),
      `the positive control: h has no such binding and must keep its edge; edges: ${JSON.stringify(frag.edges)}`);
  } finally { cleanup(dir); }
});
