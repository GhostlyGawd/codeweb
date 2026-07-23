// finding #40 (WS-H, T-40.1) — deriveFileEdges is now a factory (createEdgeDeriver(ctx)) in
// lib/edge-derive.mjs, so per-file call/ref/inherit derivation is testable IN-PROCESS at
// function-call speed — no spawn, no tmp dir, no JSON round-trip (the lang-rules.test.mjs pattern).
// These cases pin the precision gate (alias > same-file > unique-in-package, drop-ambiguous, the
// short-name/closure-local/role/rb-php filters) directly at the seam; the byte-level guarantee that
// this factory equals the old inline function stays with IE-EQUIVALENCE + the P1 self-map cmp.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEdgeDeriver, idFile, markPublicApi, resolveTypedIntents } from '../scripts/lib/edge-derive.mjs';

// Build a deriver with sensible defaults; each test overrides the ctx fields it exercises.
function deriver(ctx = {}) {
  return createEdgeDeriver({
    byName: ctx.byName || new Map(),
    pkgOf: ctx.pkgOf || (() => ''),          // single-package: everything maps to ''
    roleFor: ctx.roleFor || (() => 'product'),
    resolveFileMember: ctx.resolveFileMember || (() => null),
    closureLocalIds: ctx.closureLocalIds || new Set(),
    legacyFallback: ctx.legacyFallback || false,
  }).deriveFileEdges;
}
const byNameOf = (pairs) => new Map(pairs);
const rangesFor = (defs) => defs; // [{id,name,start,end,kind}]
const has = (edges, from, to, kind = null) =>
  edges.some((e) => e.from === from && e.to === to && (kind == null || e.kind === kind));

test('ED-IDFILE: idFile splits a node id on its last colon (paths use / , label after last :)', () => {
  assert.equal(idFile('a/b/c.js:Foo.bar'), 'a/b/c.js');
  assert.equal(idFile('x.js:<module>'), 'x.js');
});

test('ED-PRECEDENCE: alias > same-file > unique-in-package', () => {
  const lines = ['export function caller() {', '  return helper();', '}'];
  const ranges = rangesFor([{ id: 'consumer.js:caller', name: 'caller', start: 1, end: 3, kind: 'function' }]);
  // unique-in-package: only a cross-file def exists
  {
    const d = deriver({ byName: byNameOf([['helper', ['lib.js:helper']], ['caller', ['consumer.js:caller']]]) });
    const { edges } = d('consumer.js', lines, ranges, undefined, undefined, undefined);
    assert.ok(has(edges, 'consumer.js:caller', 'lib.js:helper', 'call'), 'unique-in-package fallback resolves');
  }
  // same-file beats unique-in-package
  {
    const r2 = rangesFor([
      { id: 'consumer.js:caller', name: 'caller', start: 1, end: 3, kind: 'function' },
      { id: 'consumer.js:helper', name: 'helper', start: 5, end: 6, kind: 'function' },
    ]);
    const d = deriver({ byName: byNameOf([['helper', ['lib.js:helper', 'consumer.js:helper']], ['caller', ['consumer.js:caller']]]) });
    const { edges } = d('consumer.js', lines, r2, undefined, undefined, undefined);
    assert.ok(has(edges, 'consumer.js:caller', 'consumer.js:helper', 'call'), 'same-file wins');
    assert.ok(!has(edges, 'consumer.js:caller', 'lib.js:helper'), 'cross-file loses to same-file');
  }
  // alias beats same-file
  {
    const r2 = rangesFor([
      { id: 'consumer.js:caller', name: 'caller', start: 1, end: 3, kind: 'function' },
      { id: 'consumer.js:helper', name: 'helper', start: 5, end: 6, kind: 'function' },
    ]);
    const alias = new Map([['helper', 'aliased.js:helper']]);
    const d = deriver({ byName: byNameOf([['helper', ['consumer.js:helper']], ['caller', ['consumer.js:caller']]]) });
    const { edges } = d('consumer.js', lines, r2, alias, undefined, undefined);
    assert.ok(has(edges, 'consumer.js:caller', 'aliased.js:helper', 'call'), 'alias wins');
  }
});

test('ED-AMBIGUOUS: two in-package defs of the same name drop (ambiguous counted)', () => {
  const lines = ['export function caller() {', '  return amb();', '}'];
  const ranges = rangesFor([{ id: 'c.js:caller', name: 'caller', start: 1, end: 3, kind: 'function' }]);
  const d = deriver({ byName: byNameOf([['amb', ['a.js:amb', 'b.js:amb']], ['caller', ['c.js:caller']]]) });
  const { edges, ambiguous } = d('c.js', lines, ranges, undefined, undefined, undefined);
  assert.ok(!edges.some((e) => e.to === 'a.js:amb' || e.to === 'b.js:amb'), 'ambiguous name drops');
  assert.ok(ambiguous >= 1, 'ambiguous counter incremented');
});

test('ED-KEYWORDS: a language keyword call-shape produces no edge', () => {
  const lines = ['export function caller() {', '  while (cond()) { work(); }', '}'];
  const ranges = rangesFor([{ id: 'c.js:caller', name: 'caller', start: 1, end: 3, kind: 'function' }]);
  const d = deriver({ byName: byNameOf([['while', ['x.js:while']], ['cond', ['lib.js:cond']], ['caller', ['c.js:caller']]]) });
  const { edges } = d('c.js', lines, ranges, undefined, undefined, undefined);
  assert.ok(!edges.some((e) => e.to === 'x.js:while'), 'keyword "while(" is skipped even when byName has it');
  assert.ok(has(edges, 'c.js:caller', 'lib.js:cond', 'call'), 'the real call on the same line still edges');
});

test('ED-TESTKIND: a test-file caller of a prod symbol reclassifies to a test edge', () => {
  const lines = ['function t() {', '  return bar();', '}'];
  const ranges = rangesFor([{ id: 'foo.test.js:t', name: 't', start: 1, end: 3, kind: 'function' }]);
  const d = deriver({ byName: byNameOf([['bar', ['prod.js:bar']], ['t', ['foo.test.js:t']]]) });
  const { edges } = d('foo.test.js', lines, ranges, undefined, undefined, undefined);
  assert.ok(has(edges, 'foo.test.js:t', 'prod.js:bar', 'test'), 'test-file -> prod symbol becomes kind:test');
  assert.ok(!has(edges, 'foo.test.js:t', 'prod.js:bar', 'call'), 'not also a call edge');
});

test('ED-RBPHP-FILTER: a Ruby/PHP bare name never reaches another file owner-qualified method', () => {
  const lines = ['def caller', '  helper()', 'end'];
  const ranges = rangesFor([{ id: 'a.rb:caller', name: 'caller', start: 1, end: 3, kind: 'method' }]);
  const d = deriver({ byName: byNameOf([['helper', ['b.rb:Foo.helper']], ['caller', ['a.rb:caller']]]) });
  const { edges } = d('a.rb', lines, ranges, undefined, undefined, undefined);
  assert.ok(!edges.some((e) => e.to === 'b.rb:Foo.helper'), 'cross-file owner-qualified method is filtered for rb');
});

test('ED-LEGACY-FALLBACK: both states — off drops ambiguous, on wires defs[0]', () => {
  const lines = ['export function caller() {', '  return amb();', '}'];
  const ranges = rangesFor([{ id: 'c.js:caller', name: 'caller', start: 1, end: 3, kind: 'function' }]);
  const byName = byNameOf([['amb', ['a.js:amb', 'b.js:amb']], ['caller', ['c.js:caller']]]);
  {
    const { edges } = deriver({ byName, legacyFallback: false })('c.js', lines, ranges, undefined, undefined, undefined);
    assert.ok(!edges.some((e) => e.to === 'a.js:amb'), 'off: ambiguous drops');
  }
  {
    const { edges } = deriver({ byName, legacyFallback: true })('c.js', lines, ranges, undefined, undefined, undefined);
    assert.ok(has(edges, 'c.js:caller', 'a.js:amb', 'call'), 'on: wires defs[0]');
  }
});

test('ED-NSALIAS: ns-alias member + .call/.apply chain resolves via resolveFileMember', () => {
  const lines = [
    'export function factory() {',
    '  return utils.merge.call({}, a, b);',   // .call chain -> utils.js:merge
    '}',
    'export function shape() {',
    '  return utils.merge();',                 // direct member -> utils.js:merge
    '}',
  ];
  const ranges = rangesFor([
    { id: 'consumer.js:factory', name: 'factory', start: 1, end: 3, kind: 'function' },
    { id: 'consumer.js:shape', name: 'shape', start: 4, end: 6, kind: 'function' },
  ]);
  const nsAlias = new Map([['utils', 'utils.js']]);
  const resolveFileMember = (fileRel, name) => (fileRel === 'utils.js' && name === 'merge' ? 'utils.js:merge' : null);
  const d = deriver({ resolveFileMember, byName: byNameOf([['factory', ['consumer.js:factory']], ['shape', ['consumer.js:shape']]]) });
  const { edges } = d('consumer.js', lines, ranges, undefined, nsAlias, undefined);
  assert.ok(has(edges, 'consumer.js:factory', 'utils.js:merge', 'call'), 'utils.merge.call() -> utils.js:merge');
  assert.ok(has(edges, 'consumer.js:shape', 'utils.js:merge', 'call'), 'utils.merge() -> utils.js:merge');
});

test('ED-SELF-SUPPRESS: self-call and same-decl-line call produce no edge', () => {
  // self-call: recur() inside recur's body -> callee id === caller id -> suppressed
  {
    const lines = ['export function recur() {', '  return recur();', '}'];
    const ranges = rangesFor([{ id: 'c.js:recur', name: 'recur', start: 1, end: 3, kind: 'function' }]);
    const d = deriver({ byName: byNameOf([['recur', ['c.js:recur']]]) });
    const { edges } = d('c.js', lines, ranges, undefined, undefined, undefined);
    assert.ok(!has(edges, 'c.js:recur', 'c.js:recur'), 'no self-edge');
  }
  // same-decl-line: value() on value's own declaration line is skipped (declStarts guard)
  {
    const lines = ['export function value() { return other.value(); }', 'export function other() {}'];
    const ranges = rangesFor([
      { id: 'c.js:value', name: 'value', start: 1, end: 1, kind: 'function' },
      { id: 'c.js:other', name: 'other', start: 2, end: 2, kind: 'function' },
    ]);
    const d = deriver({ byName: byNameOf([['value', ['c.js:value', 'other.js:value']], ['other', ['c.js:other']]]) });
    const { edges } = d('c.js', lines, ranges, undefined, undefined, undefined);
    assert.ok(!edges.some((e) => e.to === 'other.js:value'), 'a same-named call on the decl line is skipped');
  }
});

test('ED-CLOSURE-LOCAL: a bare name never resolves to a closure-local target in another file', () => {
  const lines = ['export function caller() {', '  return nested();', '}'];
  const ranges = rangesFor([{ id: 'c.js:caller', name: 'caller', start: 1, end: 3, kind: 'function' }]);
  const d = deriver({
    byName: byNameOf([['nested', ['lib.js:nested']], ['caller', ['c.js:caller']]]),
    closureLocalIds: new Set(['lib.js:nested']),
  });
  const { edges } = d('c.js', lines, ranges, undefined, undefined, undefined);
  assert.ok(!edges.some((e) => e.to === 'lib.js:nested'), 'closure-local target is unreachable by bare name');
});

test('ED-RETURN-SHAPE: return carries edges/hasModule/ambiguous/short/cand', () => {
  const lines = ['topLevelCall();'];
  const ranges = []; // no symbols -> module scope
  const d = deriver({ byName: byNameOf([['topLevelCall', ['lib.js:topLevelCall']]]) });
  const res = d('c.js', lines, ranges, undefined, undefined, undefined);
  assert.ok(Array.isArray(res.edges), 'edges array');
  assert.equal(res.hasModule, true, 'module-scope call sets hasModule');
  assert.ok(has(res.edges, 'c.js:<module>', 'lib.js:topLevelCall', 'call'), 'top-level call attributed to <module>');
  assert.equal(typeof res.ambiguous, 'number');
  assert.equal(typeof res.short, 'number');
  assert.ok(Array.isArray(res.cand) && res.cand.includes('topLevelCall'), 'cand collects the pre-gate name set');
});

// ---- T-40.2: pub-API walk + typed-intent resolution (same cohesive lib) ----

test('PUB-WALK: entry-reachable exports (direct + through a re-export chain) are stamped', () => {
  const nodes = [
    { id: 'index.js:foo', file: 'index.js', label: 'foo', kind: 'function', exports: true },
    { id: 'index.js:bar', file: 'index.js', label: 'bar', kind: 'function', exports: false },
    { id: 'index.js:<module>', file: 'index.js', label: '<module>', kind: 'module', exports: false },
    { id: 'impl.js:baz', file: 'impl.js', label: 'baz', kind: 'function', exports: true },
    { id: 'private.js:hidden', file: 'private.js', label: 'hidden', kind: 'function', exports: true },
  ];
  const stamp = markPublicApi({
    nodes,
    relFiles: ['index.js', 'impl.js', 'private.js'],
    pkgOf: () => '',
    sources: { 'index.js': {}, 'impl.js': {}, 'private.js': {} },
    reExportEdges: [['index.js:<module>', 'impl.js:baz']], // index re-exports impl's baz
    readPkg: (dir) => (dir === '' ? { main: './index.js' } : null),
  });
  assert.ok(stamp instanceof Set, 'returns a Set of node ids');
  assert.ok(stamp.has('index.js:foo'), 'a direct export in the entry file is public');
  assert.ok(stamp.has('impl.js:baz'), 'a re-exported symbol reached through the chain is public');
  assert.ok(!stamp.has('index.js:bar'), 'a non-exported symbol is not public');
  assert.ok(!stamp.has('private.js:hidden'), 'an export unreachable from any entry is not public');
  assert.ok(!stamp.has('index.js:<module>'), 'the module pseudo-node is never stamped');
});

test('PUB-WALK: no manifest / no entry -> empty stamp set (no fs in the lib)', () => {
  const nodes = [{ id: 'a.js:x', file: 'a.js', label: 'x', kind: 'function', exports: true }];
  const stamp = markPublicApi({
    nodes, relFiles: ['a.js'], pkgOf: () => '', sources: { 'a.js': {} },
    reExportEdges: [], readPkg: () => null, // readPkg does the fs; here it finds nothing
  });
  assert.equal(stamp.size, 0);
});

test('TYPED-INTENTS: a receiver class resolving to exactly one file wires; ambiguous/absent drop', () => {
  const nodeIdSet = new Set(['Svc.java:Service.handle', 'Main.java:Main.run', 'Other.java:Other.ping']);
  const keys = new Set();
  const res = resolveTypedIntents({
    intentsByFile: new Map([
      ['Main.java', [
        { from: 'Main.java:Main.run', recvType: 'Service', method: 'handle' }, // resolves -> Svc.java
        { from: 'Main.java:Main.run', recvType: 'Ghost', method: 'nope' },       // unknown class -> drop
      ]],
    ]),
    nodeIdSet,
    existingTriKeys: keys,
  });
  assert.equal(res.wired, 1, 'one intent wired');
  assert.equal(res.dropped, 1, 'the unknown-class intent dropped');
  assert.ok(has(res.edges, 'Main.java:Main.run', 'Svc.java:Service.handle', 'call'));
  assert.ok(keys.has('Main.java:Main.run\tSvc.java:Service.handle\tcall'), 'caller-owned tri-key set is appended in place');
});

test('TYPED-INTENTS: ambiguous class (two defining files) drops', () => {
  const nodeIdSet = new Set(['A.java:Service.handle', 'B.java:Service.handle', 'M.java:M.run']);
  const res = resolveTypedIntents({
    intentsByFile: new Map([['M.java', [{ from: 'M.java:M.run', recvType: 'Service', method: 'handle' }]]]),
    nodeIdSet, existingTriKeys: new Set(),
  });
  assert.equal(res.wired, 0);
  assert.equal(res.dropped, 1);
});

test('TYPED-INTENTS: a test-file caller reclassifies to a test edge', () => {
  const nodeIdSet = new Set(['Svc.java:Service.handle', 'AppTest.java:AppTest.t']);
  const res = resolveTypedIntents({
    intentsByFile: new Map([['AppTest.java', [{ from: 'AppTest.java:AppTest.t', recvType: 'Service', method: 'handle' }]]]),
    nodeIdSet, existingTriKeys: new Set(),
  });
  assert.ok(has(res.edges, 'AppTest.java:AppTest.t', 'Svc.java:Service.handle', 'test'), 'test-file caller -> kind:test');
});
