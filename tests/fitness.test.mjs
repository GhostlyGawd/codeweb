// F6 — architectural fitness rules. Tests first. ★ANTI-CHEAT FR-FORBIDDEN-SOUND (and the layer rule)
// recompute the violating edge set with an inline edge filter (no shared lib) over random graphs.
// FR-CYCLE-AGREE is a companion (fileCycles is independently pinned in graph-ops.test).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runNode, script, tmpDir, writeTree, cleanup } from './helpers.mjs';
import { prng, int, pick } from './_proptest.mjs';

const FITNESS = script('fitness.mjs');
const DOMAINS = ['ui', 'api', 'db', 'core'];

function makeGraph(rng, n) {
  const nodes = Array.from({ length: n }, (_, i) => ({ id: `f${i}.js:s${i}`, label: `s${i}`, kind: 'function', file: `f${i}.js`, line: 1, loc: int(rng, 1, 30), exports: false, domain: pick(rng, DOMAINS) }));
  const ids = nodes.map((x) => x.id); const edges = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j && rng() < 0.15) edges.push({ from: ids[i], to: ids[j], kind: 'call' });
  return { meta: {}, nodes, edges, domains: [], overlaps: [] };
}
function setup(graph, rules) {
  const dir = tmpDir('cw-fit-');
  writeTree(dir, { 'graph.json': JSON.stringify(graph), 'rules.json': JSON.stringify({ rules }) });
  return { dir, graphPath: join(dir, 'graph.json'), rulesPath: join(dir, 'rules.json') };
}
const domOf = (g) => { const m = new Map(g.nodes.map((n) => [n.id, n.domain])); return (id) => m.get(id) || 'unassigned'; };

// ★ANTI-CHEAT · FR-FORBIDDEN-SOUND
test('FR-FORBIDDEN-SOUND: forbidden-dependency violations == inline edge filter (40 cases)', () => {
  const rng = prng(0xF17);
  for (let c = 0; c < 40; c++) {
    const g = makeGraph(rng, int(rng, 5, 12));
    const { dir, graphPath, rulesPath } = setup(g, [{ id: 'no-ui-db', type: 'forbidden-dependency', from: 'ui', to: 'db', severity: 'error' }]);
    try {
      const out = JSON.parse(runNode(FITNESS, [graphPath, '--rules', rulesPath, '--json']).stdout);
      const d = domOf(g);
      const oracle = g.edges.filter((e) => d(e.from) === 'ui' && d(e.to) === 'db').map((e) => `${e.from} -> ${e.to}`).sort();
      const v = out.violations.find((x) => x.ruleId === 'no-ui-db');
      if (oracle.length === 0) assert.ok(!v, `case ${c}: expected no violation`);
      else { assert.ok(v, `case ${c}: expected a violation`); assert.deepEqual(v.subjects.slice().sort(), oracle); }
    } finally { cleanup(dir); }
  }
});

// FR-LAYER: a domain may depend only on domains at/below it (order top->bottom). Violation = upward edge.
test('FR-LAYER: layer violations == inline upward-edge filter', () => {
  const rng = prng(0x1A4E);
  const order = ['ui', 'api', 'db']; // ui (top) -> api -> db (bottom); 'core' unconstrained
  const rank = new Map(order.map((dm, i) => [dm, i]));
  for (let c = 0; c < 20; c++) {
    const g = makeGraph(rng, int(rng, 6, 12));
    const { dir, graphPath, rulesPath } = setup(g, [{ id: 'layers', type: 'layer', order, severity: 'error' }]);
    try {
      const out = JSON.parse(runNode(FITNESS, [graphPath, '--rules', rulesPath, '--json']).stdout);
      const d = domOf(g);
      const oracle = g.edges.filter((e) => { const rf = rank.get(d(e.from)), rt = rank.get(d(e.to)); return rf != null && rt != null && rt < rf; }).map((e) => `${e.from} -> ${e.to}`).sort();
      const v = out.violations.find((x) => x.ruleId === 'layers');
      if (oracle.length === 0) assert.ok(!v, `case ${c}: no upward edges`);
      else { assert.ok(v); assert.deepEqual(v.subjects.slice().sort(), oracle); }
    } finally { cleanup(dir); }
  }
});

// FR-FANIN: max-fan-in violations == nodes with callIn size > limit (inline count).
test('FR-FANIN: max-fan-in violations == inline callIn count over the limit', () => {
  const rng = prng(0xFA17);
  const g = makeGraph(rng, 14);
  const { dir, graphPath, rulesPath } = setup(g, [{ id: 'godcap', type: 'max-fan-in', limit: 2, severity: 'error' }]);
  try {
    const out = JSON.parse(runNode(FITNESS, [graphPath, '--rules', rulesPath, '--json']).stdout);
    const callIn = new Map();
    for (const e of g.edges) if (e.kind === 'call') callIn.set(e.to, (callIn.get(e.to) || 0) + 1);
    const oracle = g.nodes.filter((n) => (callIn.get(n.id) || 0) > 2).map((n) => n.id).sort();
    const v = out.violations.find((x) => x.ruleId === 'godcap');
    const got = (v ? v.subjects : []).map((s) => s.split(' ')[0]).sort();
    assert.deepEqual(got, oracle);
  } finally { cleanup(dir); }
});

// FR-CYCLE-AGREE (companion) + negative case + subjects name the files.
test('FR-CYCLE-AGREE: no-cycles flags a real cycle (with files) and passes a clean graph', () => {
  const cyclic = {
    meta: {}, domains: [], overlaps: [],
    nodes: [{ id: 'a.js:x', label: 'x', kind: 'function', file: 'a.js', line: 1, loc: 1, exports: true, domain: 'd' }, { id: 'b.js:y', label: 'y', kind: 'function', file: 'b.js', line: 1, loc: 1, exports: true, domain: 'd' }],
    edges: [{ from: 'a.js:x', to: 'b.js:y', kind: 'call' }, { from: 'b.js:y', to: 'a.js:x', kind: 'call' }],
  };
  const r1 = setup(cyclic, [{ id: 'acyclic', type: 'no-cycles', severity: 'error' }]);
  try {
    const out = JSON.parse(runNode(FITNESS, [r1.graphPath, '--rules', r1.rulesPath, '--json']).stdout);
    const v = out.violations.find((x) => x.ruleId === 'acyclic');
    assert.ok(v, 'cycle flagged');
    assert.ok(v.subjects.some((s) => s.includes('a.js') && s.includes('b.js')), 'subjects name the files');
  } finally { cleanup(r1.dir); }
  const acyclic = structuredClone(cyclic); acyclic.edges = [{ from: 'a.js:x', to: 'b.js:y', kind: 'call' }];
  const r2 = setup(acyclic, [{ id: 'acyclic', type: 'no-cycles', severity: 'error' }]);
  try {
    const out = JSON.parse(runNode(FITNESS, [r2.graphPath, '--rules', r2.rulesPath, '--json']).stdout);
    assert.ok(!out.violations.find((x) => x.ruleId === 'acyclic'), 'clean graph -> no violation');
  } finally { cleanup(r2.dir); }
});

// FR-EXIT + unknown type
test('FR-EXIT: error->exit 1, warning->exit 0; unknown rule type -> exit 2', () => {
  const g = { meta: {}, domains: [], overlaps: [], nodes: [{ id: 'a.js:x', label: 'x', kind: 'function', file: 'a.js', line: 1, loc: 999, exports: true, domain: 'd' }], edges: [] };
  const err = setup(g, [{ id: 'loc', type: 'max-symbol-loc', limit: 10, severity: 'error' }]);
  try { assert.equal(runNode(FITNESS, [err.graphPath, '--rules', err.rulesPath]).status, 1); } finally { cleanup(err.dir); }
  const warn = setup(g, [{ id: 'loc', type: 'max-symbol-loc', limit: 10, severity: 'warning' }]);
  try { assert.equal(runNode(FITNESS, [warn.graphPath, '--rules', warn.rulesPath]).status, 0); } finally { cleanup(warn.dir); }
  const unk = setup(g, [{ id: 'huh', type: 'no-such-rule' }]);
  try { assert.equal(runNode(FITNESS, [unk.graphPath, '--rules', unk.rulesPath]).status, 2); } finally { cleanup(unk.dir); }
});
