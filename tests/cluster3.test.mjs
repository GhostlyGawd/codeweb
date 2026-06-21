// Regression suite for scripts/cluster3.mjs — locks in the de-hub decision: a per-node A/B on the
// SAME fragment showed that stripping high-in-degree hubs from the clustering adjacency keeps
// callers in their home directory (genuine utility hubs like utils.log otherwise bridge ~20
// hooks/* nodes into lib). This reproduces that in miniature and asserts it, using the
// CODEWEB_HUB_INDEG override to toggle de-hub on/off.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { runNode, tmpDir, cleanup, readJSON, script } from './helpers.mjs';

// A genuine utility hub (`lib/utils.js:log`) called by 12 lib nodes + 3 hooks nodes (indeg 15).
// The lib nodes also form an intra-lib call chain, so lib is cohesive WITHOUT the hub; the hooks
// nodes touch ONLY the hub, so they bleed into lib exactly when the hub is left in the adjacency.
function buildFragment() {
  const node = (id, file, label) => ({ id, label, kind: 'function', file, line: 1, loc: 5, exports: true, domain: '', summary: '' });
  const nodes = [node('lib/utils.js:log', 'lib/utils.js', 'log')];
  const edges = [];
  for (let k = 0; k < 12; k++) nodes.push(node(`lib/m.js:fn${k}`, 'lib/m.js', `fn${k}`));
  for (let k = 0; k < 3; k++) nodes.push(node(`hooks/h.js:h${k}`, 'hooks/h.js', `h${k}`));
  // intra-lib cohesion chain fn0->fn1->...->fn11
  for (let k = 0; k < 11; k++) edges.push({ from: `lib/m.js:fn${k}`, to: `lib/m.js:fn${k + 1}`, kind: 'call', weight: 1 });
  // every lib + hooks node calls the hub -> indeg(log) = 15
  for (let k = 0; k < 12; k++) edges.push({ from: `lib/m.js:fn${k}`, to: 'lib/utils.js:log', kind: 'call', weight: 1 });
  for (let k = 0; k < 3; k++) edges.push({ from: `hooks/h.js:h${k}`, to: 'lib/utils.js:log', kind: 'call', weight: 1 });
  return { meta: { root: null, target: 'fixture-tgt', engine: 'regex', languages: ['javascript'], symbols: nodes.length }, nodes, edges };
}

const HOOKS = ['hooks/h.js:h0', 'hooks/h.js:h1', 'hooks/h.js:h2'];

let WS;
before(() => {
  WS = tmpDir('codeweb-cluster-');
  writeFileSync(join(WS, 'fragment.json'), JSON.stringify(buildFragment()));
});
after(() => cleanup(WS));

function cluster({ hubIndeg = null } = {}) {
  const env = { CODEWEB_WS: WS };
  if (hubIndeg != null) env.CODEWEB_HUB_INDEG = String(hubIndeg);
  const res = runNode(script('cluster3.mjs'), [], { env });
  assert.equal(res.status, 0, `cluster3 exited non-zero:\n${res.stderr}`);
  const graph = readJSON(join(WS, 'graph.json'));
  const domainOf = (id) => graph.nodes.find((n) => n.id === id).domain;
  return { graph, domainOf, stdout: res.stdout };
}

test('default de-hub (indeg>=12) keeps hooks callers in their home directory', () => {
  const { domainOf, stdout } = cluster();
  assert.match(stdout, /hubs stripped \(indeg>=12\): 1/, 'the one utility hub is stripped');
  for (const h of HOOKS) assert.equal(domainOf(h), 'hooks', `${h} stays home`);
});

test('disabling de-hub lets the hub bridge hooks callers into lib (the bug de-hub prevents)', () => {
  const { domainOf } = cluster({ hubIndeg: 9999 });
  // deterministic given the fixed adjacency: all three hooks callers are absorbed into the hub's
  // home dir (lib) once the hub is left in the clustering adjacency.
  for (const h of HOOKS) assert.equal(domainOf(h), 'lib', `${h} bled into the hub's home dir (lib)`);
});

test('domains are named after directories, not utility symbols', () => {
  const { graph, domainOf } = cluster();
  // lib chain nodes anchor a 'lib' domain; nothing is named after the `log` hub symbol.
  assert.equal(domainOf('lib/m.js:fn0'), 'lib');
  const names = new Set(graph.domains.map((d) => d.name));
  assert.ok(!names.has('log'), 'no domain named after the hub symbol');
  assert.ok(names.has('lib') && names.has('hooks'), 'directory-derived domain names');
});

test('meta is carried forward from fragment into graph', () => {
  const { graph } = cluster();
  assert.equal(graph.meta.target, 'fixture-tgt', 'target preserved');
  assert.equal(graph.meta.mode, 'internal');
  assert.equal(graph.meta.depth, 'symbol');
  assert.match(graph.meta.engine, /de-hubbed/, 'clustering engine suffix appended');
  assert.equal(graph.overlaps.length, 0, 'overlaps left empty for the next stage');
});
