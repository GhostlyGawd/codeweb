// F9 — cycle-breaking advisor. Tests first. ★ANTI-CHEAT (co-★): CB-CHEAP (cut weight <= mean cross-
// file edge weight in the cycle) + CB-NO-FABRICATE (every cut edge exists in the graph). CB-VERIFIED
// is a companion where the TEST independently reconstructs the cut graph and re-runs fileCycles.
// CB-ADVERSARIAL pins that the cheaper of two working cuts is chosen.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runNode, script, tmpDir, writeTree, cleanup } from './helpers.mjs';
import { prng, int } from './_proptest.mjs';
import { normalizeGraph, fileCycles } from '../scripts/lib/graph-ops.mjs';

const BC = script('break-cycles.mjs');
const write = (g) => { const dir = tmpDir('cw-bc-'); writeTree(dir, { 'graph.json': JSON.stringify(g) }); return { dir, graphPath: join(dir, 'graph.json') }; };
const edgeKey = (e) => `${e.from} ${e.to} ${e.kind}`;

// a random A.js<->B.js 2-file cycle with wAB edges A->B and wBA edges B->A
function makeCyclic(rng) {
  const wAB = int(rng, 1, 4), wBA = int(rng, 1, 4);
  const n = Math.max(wAB, wBA) + 2;
  const nodes = [];
  for (let i = 0; i < n; i++) nodes.push({ id: `A.js:a${i}`, label: `a${i}`, kind: 'function', file: 'A.js', line: i + 1, loc: 1, exports: true, domain: 'd' });
  for (let i = 0; i < n; i++) nodes.push({ id: `B.js:b${i}`, label: `b${i}`, kind: 'function', file: 'B.js', line: i + 1, loc: 1, exports: true, domain: 'd' });
  const edges = [];
  for (let i = 0; i < wAB; i++) edges.push({ from: `A.js:a${i}`, to: `B.js:b${i}`, kind: 'call' });
  for (let i = 0; i < wBA; i++) edges.push({ from: `B.js:b${i}`, to: `A.js:a${i + 1}`, kind: 'call' });
  return { graph: { meta: {}, nodes, edges, domains: [], overlaps: [] }, wAB, wBA };
}

// ★ANTI-CHEAT · CB-CHEAP + CB-NO-FABRICATE + CB-VERIFIED companion
test('CB-CHEAP/NO-FABRICATE/VERIFIED over random 2-cycles (40 cases)', () => {
  const rng = prng(0xCB7C1E);
  for (let c = 0; c < 40; c++) {
    const { graph, wAB, wBA } = makeCyclic(rng);
    const { dir, graphPath } = write(graph);
    try {
      const out = JSON.parse(runNode(BC, [graphPath, '--json']).stdout);
      assert.equal(out.cycles.length, 1, `case ${c}: expected one cycle`);
      const cy = out.cycles[0];
      assert.equal(cy.verified, true, `case ${c}: must be verified`);
      const cut = cy.cut;
      // CB-CHEAP: chosen weight <= mean cross-file edge weight in the cycle, and == the cheaper direction
      assert.ok(cut.weight <= cy.meanWeight + 1e-9, `case ${c}: weight ${cut.weight} > mean ${cy.meanWeight}`);
      assert.equal(cut.weight, Math.min(wAB, wBA), `case ${c}: not the cheapest direction`);
      // CB-NO-FABRICATE: every underlying cut edge exists in the graph
      const present = new Set(graph.edges.map(edgeKey));
      for (const e of cut.underlyingEdges) assert.ok(present.has(edgeKey(e)), `case ${c}: fabricated edge ${edgeKey(e)}`);
      // CB-VERIFIED (independent): remove the cut edges, re-run fileCycles -> the A.js|B.js cycle is gone
      const rm = new Set(cut.underlyingEdges.map(edgeKey));
      const g2 = normalizeGraph({ ...structuredClone(graph), edges: graph.edges.filter((e) => !rm.has(edgeKey(e))) });
      assert.ok(!fileCycles(g2).some((cyc) => cyc.join('|') === 'A.js|B.js'), `case ${c}: cut did not break the cycle`);
    } finally { cleanup(dir); }
  }
});

// CB-ADVERSARIAL: cheap (1 edge) and expensive (3 edges) both break the cycle -> cheaper chosen.
test('CB-ADVERSARIAL: the cheaper of two working cuts is chosen', () => {
  // A->B has 1 edge (cheap), B->A has 3 edges (expensive); cutting either breaks the 2-cycle.
  const nodes = [];
  for (let i = 0; i < 5; i++) nodes.push({ id: `A.js:a${i}`, label: `a${i}`, kind: 'function', file: 'A.js', line: i + 1, loc: 1, exports: true, domain: 'd' });
  for (let i = 0; i < 5; i++) nodes.push({ id: `B.js:b${i}`, label: `b${i}`, kind: 'function', file: 'B.js', line: i + 1, loc: 1, exports: true, domain: 'd' });
  const edges = [{ from: 'A.js:a0', to: 'B.js:b0', kind: 'call' }];
  for (let i = 0; i < 3; i++) edges.push({ from: `B.js:b${i}`, to: `A.js:a${i + 1}`, kind: 'call' });
  const { dir, graphPath } = write({ meta: {}, nodes, edges, domains: [], overlaps: [] });
  try {
    const cy = JSON.parse(runNode(BC, [graphPath, '--json']).stdout).cycles[0];
    assert.equal(cy.cut.weight, 1, 'cheapest (1-edge) cut chosen');
    assert.equal(cy.cut.fromFile, 'A.js'); assert.equal(cy.cut.toFile, 'B.js');
    assert.equal(cy.verified, true);
  } finally { cleanup(dir); }
});

// CB-COVERS + no cycles -> empty (no fabricated work).
test('CB-COVERS: an acyclic graph yields zero cycle proposals', () => {
  const g = { meta: {}, domains: [], overlaps: [], nodes: [{ id: 'A.js:a', label: 'a', kind: 'function', file: 'A.js', line: 1, loc: 1, exports: true, domain: 'd' }, { id: 'B.js:b', label: 'b', kind: 'function', file: 'B.js', line: 1, loc: 1, exports: true, domain: 'd' }], edges: [{ from: 'A.js:a', to: 'B.js:b', kind: 'call' }] };
  const { dir, graphPath } = write(g);
  try {
    const out = JSON.parse(runNode(BC, [graphPath, '--json']).stdout);
    assert.equal(out.cycles.length, 0);
  } finally { cleanup(dir); }
});

// CB-DETERMINISTIC
test('CB-DETERMINISTIC: identical input -> identical stdout', () => {
  const rng = prng(0xBC7);
  const { graph } = makeCyclic(rng);
  const { dir, graphPath } = write(graph);
  try {
    assert.equal(runNode(BC, [graphPath, '--json']).stdout, runNode(BC, [graphPath, '--json']).stdout);
  } finally { cleanup(dir); }
});
