// F4 — `test` edges + codeweb_tests. Tests first. ★ANTI-CHEAT TE-PRECISION runs the REAL extractor
// over RANDOMIZED prod+test fixtures and compares the emitted `test`-edge target set to an INDEPENDENT
// inline scan of the test file (the rawCallers discipline, for test edges). buildIndex's testIn and
// the orphan-set refinement (SC3) are pinned against hand-built graphs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runNode, script, tmpDir, writeTree, cleanup } from './helpers.mjs';
import { prng, int } from './_proptest.mjs';

const EXTRACT = script('extract-symbols.mjs');
const QUERY = script('query.mjs');

function extract(files) {
  const dir = tmpDir('cw-te-');
  writeTree(dir, files);
  const r = runNode(EXTRACT, [dir]);
  assert.equal(r.status, 0, r.stderr);
  return { dir, graph: JSON.parse(r.stdout) };
}

// ★ANTI-CHEAT · TE-PRECISION — over random prod/test fixtures, the emitted test-edge target set
// equals the independently-scanned set of prod symbols the test file references (imports ∪ calls).
test('TE-PRECISION: test-edge targets == independent scan of test-file references (15 cases)', () => {
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
    const { dir, graph } = extract({ 'prod.js': prod, 'prod.test.js': testSrc });
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
test('TE-PRESERVE: no call/import edge from a test-file node to a prod symbol', () => {
  const { dir, graph } = extract({
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
test('TE-QUERY-COMPLETE: --tests X == raw test-edge in-neighbors', () => {
  const { dir, graph } = extract({
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
