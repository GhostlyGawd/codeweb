// F2 — placement: where should a NEW symbol live, and does it duplicate something? Tests first.
// ★ANTI-CHEAT PL-GRAVITY recomputes the plurality-domain answer INLINE from the graph over random
// inputs — the suggestion is a recomputable consequence of the graph, not a heuristic the test trusts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, script, tmpDir, writeTree, cleanup } from './helpers.mjs';
import { prng, int, pick } from './_proptest.mjs';

const PL = script('placement.mjs');
const DOMAINS = ['auth', 'billing', 'api', 'core'];

function makeGraph(rng, n) {
  const nodes = Array.from({ length: n }, (_, i) => ({ id: `f${i}.js:s${i}`, label: `s${i}`, kind: 'function', file: `f${i}.js`, line: 1, loc: 1, exports: false, domain: pick(rng, DOMAINS) }));
  return { meta: { target: 'fx' }, nodes, edges: [], domains: [], overlaps: [] };
}
const write = (graph) => { const dir = tmpDir('cw-pl-'); writeTree(dir, { 'graph.json': JSON.stringify(graph) }); return { dir, graphPath: join(dir, 'graph.json') }; };
// inline oracle: plurality domain (tie -> lexicographically smallest)
const pluralityDomain = (graph, ids) => {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const counts = new Map();
  for (const id of ids) { const d = byId.get(id)?.domain; if (d) counts.set(d, (counts.get(d) || 0) + 1); }
  if (!counts.size) return null;
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))[0][0];
};

// ★ANTI-CHEAT · PL-GRAVITY
test('PL-GRAVITY: suggested domain == inline-recomputed plurality of resolved callees (40 cases)', () => {
  const rng = prng(0x9CA11);
  for (let c = 0; c < 40; c++) {
    const graph = makeGraph(rng, int(rng, 4, 10));
    const ids = graph.nodes.map((n) => n.id);
    const callIds = ids.filter(() => rng() < 0.5);
    if (!callIds.length) callIds.push(pick(rng, ids));
    const { dir, graphPath } = write(graph);
    try {
      const r = runNode(PL, [graphPath, '--calls', callIds.join(','), '--json']);
      assert.equal(r.status, 0, r.stderr);
      const out = JSON.parse(r.stdout);
      assert.equal(out.domain, pluralityDomain(graph, callIds), `case ${c}: ${callIds.join(',')}`);
    } finally { cleanup(dir); }
  }
});

// PL-TIE: equal counts -> lexicographically smallest domain wins.
test('PL-TIE: a tie resolves to the lexicographically smallest domain', () => {
  const graph = {
    meta: {}, edges: [], domains: [], overlaps: [],
    nodes: [
      { id: 'a.js:p', label: 'p', kind: 'function', file: 'a.js', line: 1, loc: 1, exports: false, domain: 'billing' },
      { id: 'b.js:q', label: 'q', kind: 'function', file: 'b.js', line: 1, loc: 1, exports: false, domain: 'billing' },
      { id: 'c.js:r', label: 'r', kind: 'function', file: 'c.js', line: 1, loc: 1, exports: false, domain: 'auth' },
      { id: 'd.js:s', label: 's', kind: 'function', file: 'd.js', line: 1, loc: 1, exports: false, domain: 'auth' },
    ],
  };
  const { dir, graphPath } = write(graph);
  try {
    const out = JSON.parse(runNode(PL, [graphPath, '--calls', 'a.js:p,b.js:q,c.js:r,d.js:s', '--json']).stdout);
    assert.equal(out.domain, 'auth'); // tie billing(2)/auth(2) -> 'auth' < 'billing'
  } finally { cleanup(dir); }
});

// SC1 file suggestion: most-called file (highest aggregate callIn) within the chosen domain.
test('SC1: suggested file is the highest-callIn file in the chosen domain', () => {
  const graph = {
    meta: {}, domains: [], overlaps: [],
    nodes: [
      { id: 'hot.js:h', label: 'h', kind: 'function', file: 'hot.js', line: 1, loc: 1, exports: true, domain: 'core' },
      { id: 'cold.js:c', label: 'c', kind: 'function', file: 'cold.js', line: 1, loc: 1, exports: true, domain: 'core' },
      { id: 'x.js:a', label: 'a', kind: 'function', file: 'x.js', line: 1, loc: 1, exports: false, domain: 'other' },
      { id: 'x.js:b', label: 'b', kind: 'function', file: 'x.js', line: 1, loc: 1, exports: false, domain: 'other' },
    ],
    // hot.js:h has 2 callers, cold.js:c has 0 -> hot.js is the most-called file in 'core'
    edges: [{ from: 'x.js:a', to: 'hot.js:h', kind: 'call' }, { from: 'x.js:b', to: 'hot.js:h', kind: 'call' }],
  };
  const { dir, graphPath } = write(graph);
  try {
    const out = JSON.parse(runNode(PL, [graphPath, '--calls', 'hot.js:h,cold.js:c', '--json']).stdout);
    assert.equal(out.domain, 'core');
    assert.equal(out.file, 'hot.js');
  } finally { cleanup(dir); }
});

// PL-REUSE-SOUND (name): every name-warning shares the exact --name label and is a real node.
test('PL-REUSE-SOUND: name warnings are real nodes with the exact --name label', () => {
  const graph = {
    meta: {}, edges: [], domains: [], overlaps: [],
    nodes: [
      { id: 'a.js:validate', label: 'validate', kind: 'function', file: 'a.js', line: 1, loc: 1, exports: true, domain: 'auth' },
      { id: 'b.js:validate', label: 'validate', kind: 'function', file: 'b.js', line: 1, loc: 1, exports: true, domain: 'auth' },
      { id: 'c.js:other', label: 'other', kind: 'function', file: 'c.js', line: 1, loc: 1, exports: true, domain: 'auth' },
    ],
  };
  const { dir, graphPath } = write(graph);
  try {
    const out = JSON.parse(runNode(PL, [graphPath, '--calls', 'c.js:other', '--name', 'validate', '--json']).stdout);
    const names = out.reuseWarnings.filter((w) => w.kind === 'name');
    assert.equal(names.length, 2);
    const labels = new Set(graph.nodes.map((n) => n.id));
    for (const w of names) { assert.ok(labels.has(w.id)); assert.equal(graph.nodes.find((n) => n.id === w.id).label, 'validate'); }
  } finally { cleanup(dir); }
});

// PL-REUSE-SOUND (body): body warnings have sim >= 0.35 (the medium floor), via real find_similar.
test('PL-REUSE-SOUND: body warnings clear the medium (0.35) floor', () => {
  const dir = tmpDir('cw-pl-body-');
  try {
    const body = 'alpha beta gamma delta epsilon zeta eta theta';
    writeTree(dir, { 'src.js': `${body}\nunrelated foo bar` , 'cand.txt': body });
    const graph = {
      meta: { root: dir.replace(/\\/g, '/') }, edges: [], domains: [], overlaps: [],
      nodes: [
        { id: 'src.js:dup', label: 'dup', kind: 'function', file: 'src.js', line: 1, loc: 1, exports: true, domain: 'core' },
        { id: 'src.js:other', label: 'other', kind: 'function', file: 'src.js', line: 2, loc: 1, exports: true, domain: 'core' },
      ],
    };
    writeTree(dir, { 'graph.json': JSON.stringify(graph) });
    const out = JSON.parse(runNode(PL, [join(dir, 'graph.json'), '--calls', 'src.js:other', '--body', join(dir, 'cand.txt'), '--json']).stdout);
    const bodyW = out.reuseWarnings.filter((w) => w.kind === 'body');
    assert.ok(bodyW.length >= 1, 'expected a body reuse warning');
    for (const w of bodyW) assert.ok(w.sim >= 0.35, `body warning below floor: ${w.sim}`);
    assert.ok(bodyW.some((w) => w.id === 'src.js:dup'));
  } finally { cleanup(dir); }
});

// SC3 / SC4: unresolved reported; no resolved callees -> unassigned/null with rationale.
test('SC3/SC4: unresolved callees reported; empty -> unassigned/null', () => {
  const graph = { meta: {}, edges: [], domains: [], overlaps: [], nodes: [{ id: 'a.js:x', label: 'x', kind: 'function', file: 'a.js', line: 1, loc: 1, exports: true, domain: 'auth' }] };
  const { dir, graphPath } = write(graph);
  try {
    const mixed = JSON.parse(runNode(PL, [graphPath, '--calls', 'a.js:x,nope', '--json']).stdout);
    assert.deepEqual(mixed.calls.unresolved, ['nope']);
    const empty = JSON.parse(runNode(PL, [graphPath, '--calls', 'nope1,nope2', '--json']).stdout);
    assert.equal(empty.domain, 'unassigned');
    assert.equal(empty.file, null);
    assert.ok(typeof empty.rationale === 'string' && empty.rationale.length > 0);
  } finally { cleanup(dir); }
});

// PL-DETERMINISTIC
test('PL-DETERMINISTIC: identical inputs -> identical stdout', () => {
  const rng = prng(0x0DE7);
  const graph = makeGraph(rng, 8);
  const { dir, graphPath } = write(graph);
  try {
    const ids = graph.nodes.slice(0, 4).map((n) => n.id).join(',');
    const a = runNode(PL, [graphPath, '--calls', ids, '--json']).stdout;
    const b = runNode(PL, [graphPath, '--calls', ids, '--json']).stdout;
    assert.equal(a, b);
  } finally { cleanup(dir); }
});
