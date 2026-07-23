// F3 — signature enrichment. Tests first. ★ANTI-CHEAT SIG-FIDELITY runs the REAL extractor over
// RANDOMLY GENERATED single-line declarations and compares each node's params to an INDEPENDENT,
// inline param parser (its own regex — no import from scripts/lib). Randomized + independent ⇒ not
// fittable to a fixture (the failure mode the user warned about).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runNode, script, tmpDir, writeTree, cleanup } from './helpers.mjs';
import { runExtract } from '../scripts/extract-symbols.mjs'; // finding #40 (T-40.5): extractor in-process
import { prng, int, pick } from './_proptest.mjs';

const EXTRACT = script('extract-symbols.mjs');
const CTXPACK = script('context-pack.mjs');

// INDEPENDENT inline oracle: first paren group of a single line; strip * / ** / ... , default (=),
// annotation (:). Different code from the implementation; must agree on results.
function oracleParams(line) {
  const m = /\(([^)]*)\)/.exec(line);
  if (!m) return null;             // no single-line paren group -> null
  const inner = m[1].trim();
  if (inner === '') return [];
  // strip rest/kwargs prefix, default, and annotation; keep only valid identifiers (drops generic
  // fragments like `T0>` that a depth-naive comma split leaves behind) — the same param-name contract
  // the implementation enforces, re-derived independently here.
  return inner.split(',').map((s) => s.trim().replace(/^(\*\*?|\.\.\.)/, '').split('=')[0].split(':')[0].trim()).filter((p) => /^[A-Za-z_$][\w$]*$/.test(p));
}

// random single-line declarations (no nested parens/commas, so the naive oracle is exact)
function genJsDecl(rng, i) {
  const n = int(rng, 0, 4);
  const ps = Array.from({ length: n }, (_, j) => {
    const base = `p${j}`;
    switch (int(rng, 0, 5)) {
      case 1: return `${base} = ${int(rng, 0, 9)}`;
      case 2: return `...${base}`;
      case 3: return `${base}: T${j}`;
      case 4: return `${base} = n > ${int(rng, 0, 9)}`;        // comparison-operator default (the > regression)
      case 5: return `${base}: Map<string, T${j}>`;            // TS generic with an inner comma
      default: return base;
    }
  });
  // alternate between `function jfN(...)` and `const jfN = (...) => {}` — the spec requires BOTH (SC1)
  const line = (i % 2 === 0)
    ? `export function jf${i}(${ps.join(', ')}) {}`
    : `export const jf${i} = (${ps.join(', ')}) => {};`;
  return { line, label: `jf${i}`, params: ps.map((_, j) => `p${j}`) };
}
function genPyDecl(rng, i) {
  const n = int(rng, 0, 4);
  const ps = Array.from({ length: n }, (_, j) => {
    const base = `p${j}`;
    switch (int(rng, 0, 4)) {
      case 1: return `${base}=${int(rng, 0, 9)}`;
      case 2: return `*${base}`;
      case 3: return `${base}: int`;
      case 4: return `**${base}`;
      default: return base;
    }
  });
  return { line: `def pf${i}(${ps.join(', ')}):`, label: `pf${i}`, params: ps.map((_, j) => `p${j}`) };
}

async function extractNodes(files) {
  const dir = tmpDir('cw-sig-');
  writeTree(dir, files);
  const { fragment } = await runExtract({ path: dir });
  return { dir, nodes: fragment.nodes };
}

// ★ANTI-CHEAT · SIG-FIDELITY
test('SIG-FIDELITY: extracted params match an independent inline parser over random decls', async () => {
  const rng = prng(0x516F1);
  for (let c = 0; c < 25; c++) {
    const N = int(rng, 3, 8);
    const js = Array.from({ length: N }, (_, i) => genJsDecl(rng, i));
    const py = Array.from({ length: N }, (_, i) => genPyDecl(rng, i));
    const { dir, nodes } = await extractNodes({ 'a.ts': js.map((d) => d.line).join('\n'), 'b.py': py.map((d) => d.line).join('\n') });
    try {
      const byLabel = new Map(nodes.map((n) => [n.label, n]));
      for (const d of [...js, ...py]) {
        const node = byLabel.get(d.label);
        assert.ok(node, `missing node ${d.label}`);
        assert.ok(node.signature, `expected signature for ${d.label} (${d.line})`);
        // independent oracle on the same source line
        assert.deepEqual(node.signature.params, oracleParams(d.line), `params mismatch for ${d.line}`);
        // and the generator's own intended params, as a second cross-check
        assert.deepEqual(node.signature.params, d.params, `params != intended for ${d.line}`);
      }
    } finally { cleanup(dir); }
  }
});

// SIG-NULL-SAFE: unparseable / multi-line params -> null, never a throw.
test('SIG-NULL-SAFE: multi-line + paren-less + no-paren decls yield signature null', async () => {
  const files = {
    'm.js': [
      'export function multi(',     // multi-line param list -> null
      '  a,',
      '  b',
      ') { return a + b; }',
      'export const arrow = a => a * 2;',   // paren-less arrow -> null (best-effort)
    ].join('\n'),
  };
  const { dir, nodes } = await extractNodes(files);
  try {
    const multi = nodes.find((n) => n.label === 'multi');
    assert.ok(multi, 'multi node exists');
    assert.equal(multi.signature, null, 'multi-line params -> null');
    const arrow = nodes.find((n) => n.label === 'arrow');
    if (arrow) assert.equal(arrow.signature, null, 'paren-less arrow -> null');
    // oracle agrees both are null
    assert.equal(oracleParams('export function multi('), null);
    assert.equal(oracleParams('export const arrow = a => a * 2;'), null);
  } finally { cleanup(dir); }
});

// SC2: returns annotation captured (TS and Python), best-effort.
test('SC2: return annotation captured for TS and Python', async () => {
  const files = {
    'r.ts': 'export function ret(a: number): Promise<void> { return; }',
    's.py': 'def pyret(a) -> int:\n    return a',
  };
  const { dir, nodes } = await extractNodes(files);
  try {
    const ts = nodes.find((n) => n.label === 'ret');
    assert.ok(ts.signature && /Promise<void>/.test(ts.signature.returns || ''), `ts returns: ${ts.signature?.returns}`);
    const py = nodes.find((n) => n.label === 'pyret');
    assert.ok(py.signature && /int/.test(py.signature.returns || ''), `py returns: ${py.signature?.returns}`);
  } finally { cleanup(dir); }
});

// SC4 / SIG-CONTEXT-PACK: context-pack callees carry the same signature as the graph node.
test('SIG-CONTEXT-PACK: context-pack callees include the node signature (no drift)', async () => {
  const dir = tmpDir('cw-sig-cp-');
  try {
    // build a graph by hand: caller -> callee; callee has a known signature
    const graph = {
      meta: {}, domains: [], overlaps: [],
      nodes: [
        { id: 'a.js:caller', label: 'caller', kind: 'function', file: 'a.js', line: 1, loc: 1, exports: false, domain: 'd', signature: { params: ['x'], returns: null, raw: 'x' } },
        { id: 'a.js:callee', label: 'callee', kind: 'function', file: 'a.js', line: 5, loc: 1, exports: false, domain: 'd', signature: { params: ['a', 'b'], returns: 'number', raw: 'a, b' } },
      ],
      edges: [{ from: 'a.js:caller', to: 'a.js:callee', kind: 'call' }],
    };
    writeTree(dir, { 'graph.json': JSON.stringify(graph) });
    const out = JSON.parse(runNode(CTXPACK, [join(dir, 'graph.json'), 'caller', '--json']).stdout);
    const callee = out.callees.find((c) => c.id === 'a.js:callee');
    assert.ok(callee, 'callee present');
    assert.deepEqual(callee.signature, { params: ['a', 'b'], returns: 'number', raw: 'a, b' });
  } finally { cleanup(dir); }
});
