// F1 (API.md §5, DOCS.md D2, COPY.md #2): "the gate" was three predicates wearing one name.
// gateVerdict is now the one verdict function; the strictness split (orphan gate vs call-caller
// preflight) is a DECLARED parameter, every presenter labels its check, and the famous divergence
// — an exported symbol losing its last caller — is visible in both verdicts instead of silently
// contradicting between them.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { gateVerdict, structuralRegressions, normalizeGraph } from '../scripts/lib/graph-ops.mjs';
import { diffGraphs } from '../scripts/lib/diff-core.mjs';
import { prng, int } from './_proptest.mjs';
import { runNode, script, tmpDir, writeTree, cleanup } from './helpers.mjs';

function makeGraph(rng, n) {
  const nodes = Array.from({ length: n }, (_, i) => ({ id: `f${i % 3}.js:s${i}`, label: `s${i}`, kind: 'function', file: `f${i % 3}.js`, line: i + 1, loc: 2, exports: rng() < 0.35, domain: 'd' }));
  const ids = nodes.map((x) => x.id);
  const edges = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j && rng() < 0.15) edges.push({ from: ids[i], to: ids[j], kind: rng() < 0.7 ? 'call' : 'import' });
  return { meta: {}, nodes, edges, domains: [], overlaps: [] };
}
const mutate = (rng, g) => ({
  ...g,
  nodes: g.nodes.filter(() => rng() > 0.08),
  edges: g.edges.filter(() => rng() > 0.25),
});

test('GV-PREFLIGHT: exemptExported:false is structuralRegressions, id-for-id, over random pairs', () => {
  const rng = prng(0x6a7e01);
  for (let c = 0; c < 30; c++) {
    const before = makeGraph(rng, int(rng, 6, 14));
    const after = mutate(rng, before);
    const v = gateVerdict(before, after, { exemptExported: false });
    const sr = structuralRegressions(before, after);
    assert.deepEqual(v.checks.lostCallers.map((l) => l.id), sr.lostCallers, `case ${c}: lost-caller ids`);
    assert.deepEqual(v.checks.newCycles, sr.newCycles, `case ${c}: cycles`);
    assert.equal(v.ok, sr.newCycles.length === 0 && sr.lostCallers.length === 0, `case ${c}: ok`);
    assert.equal(v.check, 'call-caller-preflight');
  }
});

test('GV-GATE: exemptExported:true agrees with the shipped diff verdict over random pairs', () => {
  const rng = prng(0x6a7e02);
  for (let c = 0; c < 30; c++) {
    const before = normalizeGraph(makeGraph(rng, int(rng, 6, 14)));
    const after = normalizeGraph(mutate(rng, before));
    const { payload, code } = diffGraphs(before, after, {});
    assert.equal(payload.verdict.check, 'orphan-gate');
    assert.equal(payload.verdict.ok, code === 0, `case ${c}: verdict.ok tracks the exit code`);
    const blocking = payload.verdict.checks.lostCallers.filter((l) => !l.exempted).map((l) => l.id);
    const regressed = payload.orphans.added.filter((id) => before.nodes.some((n) => n.id === id));
    assert.deepEqual(blocking, regressed, `case ${c}: blocking set == regressed orphans`);
  }
});

test('GV-DIVERGENCE: an exported symbol losing its last caller — preflight blocks, gate exempts but LISTS it', () => {
  const before = {
    meta: {},
    nodes: [
      { id: 'a.js:caller', label: 'caller', kind: 'function', file: 'a.js', line: 1, loc: 2, exports: true, domain: 'd' },
      { id: 'b.js:api', label: 'api', kind: 'function', file: 'b.js', line: 1, loc: 2, exports: true, domain: 'd' },
    ],
    edges: [{ from: 'a.js:caller', to: 'b.js:api', kind: 'call' }],
    domains: [], overlaps: [],
  };
  const after = { ...before, edges: [] };

  const preflight = gateVerdict(before, after, { exemptExported: false });
  assert.equal(preflight.ok, false, 'the preflight blocks: a surviving symbol lost its last caller');
  assert.deepEqual(preflight.checks.lostCallers.map((l) => l.id), ['b.js:api']);

  const gate = gateVerdict(before, after, { exemptExported: true, newDuplications: [], scope: 'full' });
  assert.equal(gate.ok, true, 'the CI gate exempts exported symbols');
  const listed = gate.checks.lostCallers.find((l) => l.id === 'b.js:api');
  assert.ok(listed && listed.exempted === true && listed.exported === true, 'but the exemption is DECLARED, not hidden');

  const { payload, code } = diffGraphs(normalizeGraph(before), normalizeGraph(after), {});
  assert.equal(code, 0, 'shipped diff agrees with the exempting verdict');
  assert.equal(payload.verdict.checks.lostCallers.some((l) => l.id === 'b.js:api' && l.exempted), true);
});

test('GV-SIMULATE-TEXT: simulate speaks for its own check, not the gate (COPY.md #2)', () => {
  const dir = tmpDir('cw-gv-');
  try {
    const g = {
      meta: {}, domains: [], overlaps: [],
      nodes: [
        { id: 'a.js:main', label: 'main', kind: 'function', file: 'a.js', line: 1, loc: 2, exports: true, domain: 'd' },
        { id: 'b.js:helper', label: 'helper', kind: 'function', file: 'b.js', line: 1, loc: 2, exports: false, domain: 'd' },
      ],
      edges: [{ from: 'a.js:main', to: 'b.js:helper', kind: 'call' }],
    };
    writeTree(dir, { 'graph.json': JSON.stringify(g) });
    const gp = join(dir, 'graph.json');

    const pass = runNode(script('simulate-edit.mjs'), [gp, '--delete', 'b.js:helper']);
    assert.equal(pass.status, 0);
    assert.match(pass.stdout, /projected: PASS — no new cycles; no surviving symbol loses its last caller/);
    assert.match(pass.stdout, /stricter than the diff\.mjs\/CI gate, which exempts exported symbols/);
    assert.ok(!/the gate would (accept|reject)/.test(pass.stdout), 'the borrowed-verdict phrasing is retired');

    const block = runNode(script('simulate-edit.mjs'), [gp, '--delete', 'a.js:main']);
    assert.match(block.stdout, /projected: BLOCK — new cycle or a symbol losing its last caller/);

    const j = JSON.parse(runNode(script('simulate-edit.mjs'), [gp, '--delete', 'a.js:main', '--json']).stdout);
    assert.equal(j.verdict.check, 'call-caller-preflight');
    assert.equal(j.verdict.scope, 'edges-only');
    assert.equal(j.verdict.ok, j.projected.ok, 'legacy projected shape stays in lock-step');
  } finally { cleanup(dir); }
});
