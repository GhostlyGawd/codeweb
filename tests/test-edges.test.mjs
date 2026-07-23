// F4 — `test` edges + codeweb_tests. Tests first. ★ANTI-CHEAT TE-PRECISION runs the REAL extractor
// over RANDOMIZED prod+test fixtures and compares the emitted `test`-edge target set to an INDEPENDENT
// inline scan of the test file (the rawCallers discipline, for test edges). buildIndex's testIn and
// the orphan-set refinement (SC3) are pinned against hand-built graphs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runNode, script, tmpDir, writeTree, cleanup } from './helpers.mjs';
import { runExtract } from '../scripts/extract-symbols.mjs';
import { prng, int } from './_proptest.mjs';

const QUERY = script('query.mjs'); // the query CLI stays spawn-based (a different tool — out of #40's extractor scope)

// Round 2, finding #40 (WS-H, T-40.4): the EXTRACTOR runs in-process (test-kind reclassification
// lives inside deriveFileEdges, so this doubles as seam coverage); the query.mjs spawns below stay.
async function extract(files) {
  const dir = tmpDir('cw-te-');
  writeTree(dir, files);
  const { fragment } = await runExtract({ path: dir });
  return { dir, graph: fragment };
}

// ★ANTI-CHEAT · TE-PRECISION — over random prod/test fixtures, the emitted test-edge target set
// equals the independently-scanned set of prod symbols the test file references (imports ∪ calls).
test('TE-PRECISION: test-edge targets == independent scan of test-file references (15 cases)', async () => {
  const rng = prng(0x7E5701);
  for (let c = 0; c < 15; c++) {
    const N = int(rng, 3, 7);
    const names = Array.from({ length: N }, (_, i) => `prodFn${i}`);
    const prod = names.map((n) => `export function ${n}() { return ${JSON.stringify(n)}; }`).join('\n');
    // each prod name is randomly imported and/or bare-called by the test file (at least referenced sometimes)
    const imported = names.filter(() => rng() < 0.5);
    const called = names.filter(() => rng() < 0.5);
    const importLine = imported.length ? `import { ${imported.join(', ')} } from './prod.js';\n` : '';
    const callBody = called.map((n) => `  ${n}();`).join('\n');
    const testSrc = `${importLine}function testMain() {\n${callBody}\n}\n`;
    const { dir, graph } = await extract({ 'prod.js': prod, 'prod.test.js': testSrc });
    try {
      // independent oracle: prod names the test file references (import braces ∪ bare calls)
      const refImports = (/import\s*\{([^}]*)\}/.exec(testSrc)?.[1] || '').split(',').map((s) => s.trim()).filter(Boolean);
      const refCalls = [...testSrc.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]).filter((n) => names.includes(n));
      const expected = new Set([...refImports, ...refCalls].filter((n) => names.includes(n)).map((n) => `prod.js:${n}`));

      const testEdges = graph.edges.filter((e) => e.kind === 'test');
      const got = new Set(testEdges.map((e) => e.to));
      assert.deepEqual([...got].sort(), [...expected].sort(), `case ${c}: imported=${imported} called=${called}`);
      // TE-FROM-TESTS: every test edge originates in the test file and targets a non-test symbol
      for (const e of testEdges) {
        assert.match(e.from, /prod\.test\.js:/, `test edge from non-test: ${e.from}`);
        assert.match(e.to, /^prod\.js:/, `test edge to non-prod: ${e.to}`);
      }
    } finally { cleanup(dir); }
  }
});

// TE-PRESERVE — a test->prod reference is reclassified, not duplicated: no call/import edge from a
// test-file node to a prod symbol survives.
test('TE-PRESERVE: no call/import edge from a test-file node to a prod symbol', async () => {
  const { dir, graph } = await extract({
    'prod.js': 'export function alpha() { return 1; }\nexport function beta() { return 2; }',
    'prod.test.js': "import { alpha } from './prod.js';\nfunction t() { return alpha() + beta(); }",
  });
  try {
    const leaked = graph.edges.filter((e) => (e.kind === 'call' || e.kind === 'import') && /prod\.test\.js:/.test(e.from) && /^prod\.js:/.test(e.to));
    assert.deepEqual(leaked, [], `leaked production edges from test file: ${JSON.stringify(leaked)}`);
    // and the references DO exist as test edges
    const tos = new Set(graph.edges.filter((e) => e.kind === 'test').map((e) => e.to));
    assert.ok(tos.has('prod.js:alpha') && tos.has('prod.js:beta'));
  } finally { cleanup(dir); }
});

// TE-QUERY-COMPLETE — query --tests X == test-edge in-neighbors of X from the raw edge list.
test('TE-QUERY-COMPLETE: --tests X == raw test-edge in-neighbors', async () => {
  const { dir, graph } = await extract({
    'prod.js': 'export function target() { return 1; }',
    'a.test.js': "import { target } from './prod.js';\nfunction ta() { return target(); }",
    'b.spec.js': "import { target } from './prod.js';\nfunction tb() { return target(); }",
  });
  try {
    writeTree(dir, { 'graph.json': JSON.stringify(graph) });
    const out = JSON.parse(runNode(QUERY, [join(dir, 'graph.json'), '--tests', 'target', '--json']).stdout);
    const rawTesters = [...new Set(graph.edges.filter((e) => e.kind === 'test' && e.to === 'prod.js:target').map((e) => e.from))].sort();
    assert.deepEqual(out.results.sort(), rawTesters);
    assert.ok(rawTesters.length >= 2, 'expected testers from both a.test.js and b.spec.js');
  } finally { cleanup(dir); }
});

// SC3 (buildIndex/orphan contract) — test edges are excluded from callIn/hasIncoming, via the query CLI
// over hand-built graphs. A test edge into a non-exported symbol leaves it an orphan; production
// callers exclude test callers.
test('SC3: test edges do not count as callers/imports (orphan + callers contract)', () => {
  const dir = tmpDir('cw-te-sc3-');
  try {
    const graph = {
      meta: {}, domains: [], overlaps: [],
      nodes: [
        { id: 'p.js:onlyTested', label: 'onlyTested', kind: 'function', file: 'p.js', line: 1, loc: 1, exports: false, domain: 'd' },
        { id: 'p.js:prodCalled', label: 'prodCalled', kind: 'function', file: 'p.js', line: 3, loc: 1, exports: false, domain: 'd' },
        { id: 'p.js:caller', label: 'caller', kind: 'function', file: 'p.js', line: 5, loc: 1, exports: true, domain: 'd' },
        { id: 'x.test.js:t', label: 't', kind: 'function', file: 'x.test.js', line: 1, loc: 1, exports: false, domain: 'd' },
      ],
      edges: [
        { from: 'x.test.js:t', to: 'p.js:onlyTested', kind: 'test' },  // only a test references it
        { from: 'x.test.js:t', to: 'p.js:prodCalled', kind: 'test' },  // test AND prod reference it
        { from: 'p.js:caller', to: 'p.js:prodCalled', kind: 'call' },
      ],
    };
    writeTree(dir, { 'graph.json': JSON.stringify(graph) });
    const orphans = JSON.parse(runNode(QUERY, [join(dir, 'graph.json'), '--orphans', '--json']).stdout).results.map((o) => o.id);
    assert.ok(orphans.includes('p.js:onlyTested'), 'a test-only-referenced symbol is reported as an orphan (the F10 signal)');
    assert.ok(!orphans.includes('p.js:prodCalled'), 'a prod-called symbol is not an orphan');
    // production callers of prodCalled exclude the test caller
    const callers = JSON.parse(runNode(QUERY, [join(dir, 'graph.json'), '--callers', 'prodCalled', '--json']).stdout).results;
    assert.deepEqual(callers, ['p.js:caller']);
  } finally { cleanup(dir); }
});

// TE-ANON — a `node:test`-style anonymous test callback `test('…', () => { foo() })` has no named
// enclosing symbol, so its file discovers ZERO symbols. It must STILL produce a `test` edge to the
// imported prod symbol (attributed to the test file's <module>) — the blast-radius coveringTests
// signal. Before the fix the file was excluded from edge derivation entirely.
test('TE-ANON: anonymous test callback edges <module> -> prod:foo as a test edge', async () => {
  const { dir, graph } = await extract({
    'prod.js': 'export function foo() { return 1; }',
    'foo.test.js': [
      "import { test } from 'node:test';",
      "import { foo } from './prod.js';",
      "test('foo works', () => { foo(); });",
    ].join('\n'),
  });
  try {
    const testEdges = graph.edges.filter((e) => e.kind === 'test' && e.to === 'prod.js:foo');
    assert.equal(testEdges.length, 1, `expected one test edge to prod.js:foo, got ${JSON.stringify(graph.edges)}`);
    assert.match(testEdges[0].from, /foo\.test\.js:/, 'test edge originates in the test file');
  } finally { cleanup(dir); }
});

// TE-DESTRUCTURE — a function with a destructuring param (`f({ x }) { … }`) must own the calls in
// its body and stay in the transitive blast radius. Before the fix bodyEnd terminated at the
// signature line (the param `{ }` balanced to zero before the real body brace opened), so body
// calls were mis-attributed to <module> and the function fell out of impactOf().
test('TE-DESTRUCTURE: destructuring-param fn owns its body call and stays in impactOf', async () => {
  const { dir, graph } = await extract({
    'a.js': 'export function inner() { return 1; }',
    'b.js': [
      "import { inner } from './a.js';",
      'export function outer({ x }) {',
      '  return inner() + x;',
      '}',
    ].join('\n'),
  });
  try {
    const fromOuter = graph.edges.filter((e) => e.kind === 'call' && e.from === 'b.js:outer' && e.to === 'a.js:inner');
    assert.equal(fromOuter.length, 1, `expected outer -> inner call edge, got ${JSON.stringify(graph.edges)}`);
    const fromModule = graph.edges.filter((e) => e.kind === 'call' && e.from === 'b.js:<module>' && e.to === 'a.js:inner');
    assert.equal(fromModule.length, 0, 'body call must NOT be attributed to <module>');

    writeTree(dir, { 'graph.json': JSON.stringify(graph) });
    const impact = JSON.parse(runNode(QUERY, [join(dir, 'graph.json'), '--impact', 'inner', '--json']).stdout).results;
    assert.ok(impact.includes('b.js:outer'), `outer must be in impactOf(inner): ${JSON.stringify(impact)}`);
  } finally { cleanup(dir); }
});

// JM-* — JS/TS comment/string masking for edge derivation (the maskJs counterpart of maskPy). A call
// named only inside a `//` or `/* */` comment must fabricate no edge; masking is string-aware (`//`
// inside "http://…" is not a comment) and template-aware (a call in a `${ … }` interpolation is real
// code and must still edge).
const callsTo = (graph, to) => graph.edges.filter((e) => e.kind === 'call' && e.to === to);

test('JM-COMMENT: calls inside // and /* */ comments produce no call edge', async () => {
  const { dir, graph } = await extract({
    'prod.js': 'export function ghost() { return 1; }\nexport function real() { return 2; }',
    'use.js': [
      "import { ghost, real } from './prod.js';",
      'export function host() {',
      '  // this comment mentions ghost() but must not edge',
      '  /* block also mentions ghost() here */',
      '  return real(); // real() IS called',
      '}',
    ].join('\n'),
  });
  try {
    assert.equal(callsTo(graph, 'prod.js:ghost').length, 0, `ghost() in a comment must not edge: ${JSON.stringify(graph.edges)}`);
    assert.equal(callsTo(graph, 'prod.js:real').length, 1, 'real() is a genuine call and must edge');
  } finally { cleanup(dir); }
});

test('JM-STRING: // inside a string does not blank the rest of the line', async () => {
  const { dir, graph } = await extract({
    'prod.js': 'export function used() { return 1; }',
    'use.js': [
      "import { used } from './prod.js';",
      'export function host() {',
      '  const url = "http://example.com";',
      '  return used(url);',
      '}',
    ].join('\n'),
  });
  try {
    assert.equal(callsTo(graph, 'prod.js:used').length, 1, `used() after a string with // must still edge: ${JSON.stringify(graph.edges)}`);
  } finally { cleanup(dir); }
});

test('JM-TEMPLATE: call inside ${} interpolation still edges', async () => {
  const { dir, graph } = await extract({
    'prod.js': 'export function fmt() { return "x"; }',
    'use.js': [
      "import { fmt } from './prod.js';",
      'export function host() {',
      '  return `value is ${fmt()} ok`;',
      '}',
    ].join('\n'),
  });
  try {
    assert.equal(callsTo(graph, 'prod.js:fmt').length, 1, `fmt() inside \${} must edge: ${JSON.stringify(graph.edges)}`);
  } finally { cleanup(dir); }
});

// RX-* — renamed re-export resolution (`export {x as y} from './impl'`). A call through a renamed
// re-export must edge to the underlying symbol (transitively through the rename) — the one indirection
// grep structurally cannot follow by the primitive's original name.
test('RX-RENAME: call via `export {x as y} from` barrel edges to impl:x', async () => {
  const { dir, graph } = await extract({
    'impl.js': 'export function primitive() { return 1; }',
    'index.js': "export { primitive as renamed } from './impl.js';",
    'consumer.js': [
      "import { renamed } from './index.js';",
      'export function useIt() { return renamed(); }',
    ].join('\n'),
  });
  try {
    const edge = graph.edges.filter((e) => e.kind === 'call' && e.from === 'consumer.js:useIt' && e.to === 'impl.js:primitive');
    assert.equal(edge.length, 1, `useIt -> impl.js:primitive must edge through the rename: ${JSON.stringify(graph.edges)}`);
    writeTree(dir, { 'graph.json': JSON.stringify(graph) });
    const impact = JSON.parse(runNode(QUERY, [join(dir, 'graph.json'), '--impact', 'primitive', '--json']).stdout).results;
    assert.ok(impact.includes('consumer.js:useIt'), `useIt must be in impactOf(primitive): ${JSON.stringify(impact)}`);
  } finally { cleanup(dir); }
});

test('RX-CHAIN: re-export through two barrels resolves transitively', async () => {
  const { dir, graph } = await extract({
    'impl.js': 'export function deep() { return 1; }',
    'mid.js': "export { deep as midName } from './impl.js';",
    'top.js': "export { midName as topName } from './mid.js';",
    'consumer.js': [
      "import { topName } from './top.js';",
      'export function caller() { return topName(); }',
    ].join('\n'),
  });
  try {
    const edge = graph.edges.filter((e) => e.kind === 'call' && e.from === 'consumer.js:caller' && e.to === 'impl.js:deep');
    assert.equal(edge.length, 1, `caller -> impl.js:deep must edge through a 2-hop re-export chain: ${JSON.stringify(graph.edges)}`);
  } finally { cleanup(dir); }
});
