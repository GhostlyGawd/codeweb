// Regression + property suite for scripts/context-pack.mjs — the blast-radius-scoped context tool.
// Written BEFORE the implementation: the script does not exist yet, so subprocess runs fail.
// CP-COMPLETE/CP-SOUND cross-check the tool's neighbor sets against an INDEPENDENT raw-edge
// derivation; CP-BODY-FIDELITY checks emitted bodies are byte-for-byte the real source lines.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { runNode, tmpDir, cleanup, writeTree, script } from './helpers.mjs';
import { normalizeGraph } from '../scripts/lib/graph-ops.mjs';
import { prng, randomGraph, rawCallers, rawCallees } from './_proptest.mjs';

let WS;
before(() => { WS = tmpDir('codeweb-cp-'); });
after(() => { cleanup(WS); });

let caseN = 0;
function run(graph, symbol, extra = []) {
  const p = join(WS, `cp${caseN++}.json`);
  writeFileSync(p, JSON.stringify({ meta: { target: 'cp' }, domains: [], overlaps: [], ...graph }));
  const r = runNode(script('context-pack.mjs'), [p, symbol, '--json', ...extra]);
  return { ...r, payload: r.status === 0 ? JSON.parse(r.stdout) : null };
}

// ---------- structural properties over random graphs (no source on disk) ----------
test('CP-COMPLETE & CP-SOUND: callers/callees equal the independent raw-edge neighbor sets', () => {
  const rng = prng(11);
  for (let i = 0; i < 14; i++) {
    const g = normalizeGraph(randomGraph(rng));
    const target = g.nodes[Math.floor(rng() * g.nodes.length)];
    const { payload } = run(g, target.id);
    assert.ok(payload, `exit 0 for ${target.id}`);
    const callers = payload.callers.map((n) => n.id).sort();
    const callees = payload.callees.map((n) => n.id).sort();
    assert.deepEqual(callers, rawCallers(g, [target.id]), `CP-COMPLETE callers for ${target.id}`);
    assert.deepEqual(callees, rawCallees(g, [target.id]), `CP-COMPLETE callees for ${target.id}`);
  }
});

test('CP-BLAST-SUPERSET: blastRadius ⊇ callers and excludes the target', () => {
  const rng = prng(22);
  for (let i = 0; i < 14; i++) {
    const g = normalizeGraph(randomGraph(rng));
    const target = g.nodes[Math.floor(rng() * g.nodes.length)];
    const { payload } = run(g, target.id);
    const blast = new Set(payload.blastRadius.ids);
    for (const c of payload.callers.map((n) => n.id)) assert.ok(blast.has(c), `blast missing caller ${c}`);
    assert.ok(!blast.has(target.id), 'blast excludes the target seed');
    assert.equal(payload.blastRadius.count, payload.blastRadius.ids.length);
  }
});

test('CP-BOUNDED: callees and blastRadius carry NO body text (only target+callers do)', () => {
  const rng = prng(33);
  const g = normalizeGraph(randomGraph(rng));
  const target = g.nodes[0];
  const { payload } = run(g, target.id);
  for (const n of payload.callees) assert.ok(!('body' in n), 'callees must be location-only');
  assert.ok(Array.isArray(payload.blastRadius.ids) && payload.blastRadius.ids.every((x) => typeof x === 'string'), 'blast is ids only');
  assert.deepEqual(Object.keys(payload.blastRadius).sort(), ['count', 'ids'], 'blastRadius carries no body/extra payload');
});

test('CP-M3: a label resolving to multiple nodes returns the UNION across all matched ids', () => {
  const g = {
    nodes: [
      { id: 'a.js:h', label: 'h', kind: 'function', file: 'a.js', line: 1, loc: 1, exports: true, domain: '' },
      { id: 'b.js:h', label: 'h', kind: 'function', file: 'b.js', line: 1, loc: 1, exports: true, domain: '' },
      { id: 'x.js:c1', label: 'c1', kind: 'function', file: 'x.js', line: 1, loc: 1, exports: true, domain: '' },
      { id: 'y.js:c2', label: 'c2', kind: 'function', file: 'y.js', line: 1, loc: 1, exports: true, domain: '' },
    ],
    edges: [{ from: 'x.js:c1', to: 'a.js:h', kind: 'call' }, { from: 'y.js:c2', to: 'b.js:h', kind: 'call' }],
  };
  const { payload } = run(g, 'h');
  assert.deepEqual(payload.matched, ['a.js:h', 'b.js:h']);
  assert.deepEqual(payload.target.map((n) => n.id).sort(), ['a.js:h', 'b.js:h'], 'both definitions are targets');
  assert.deepEqual(payload.callers.map((n) => n.id).sort(), ['x.js:c1', 'y.js:c2'], 'union of callers across both h definitions');
});

test('CP-DETERMINISTIC: same graph+symbol -> identical stdout', () => {
  const g = normalizeGraph(randomGraph(prng(44)));
  const id = g.nodes[0].id;
  const a = run(g, id);
  const b = run(g, id);
  assert.equal(a.stdout, b.stdout);
});

test('SC1: unknown symbol -> exit 1', () => {
  const g = { nodes: [{ id: 'a.js:f', label: 'f', kind: 'function', file: 'a.js', line: 1, loc: 1, exports: true, domain: '' }], edges: [] };
  assert.equal(run(g, 'ghost').status, 1);
});

test('SC1: resolves a bare label to its node', () => {
  const g = {
    nodes: [
      { id: 'a.js:foo', label: 'foo', kind: 'function', file: 'a.js', line: 1, loc: 1, exports: true, domain: '' },
      { id: 'b.js:bar', label: 'bar', kind: 'function', file: 'b.js', line: 1, loc: 1, exports: true, domain: '' },
    ],
    edges: [{ from: 'b.js:bar', to: 'a.js:foo', kind: 'call' }],
  };
  const { payload } = run(g, 'foo');
  assert.deepEqual(payload.matched, ['a.js:foo']);
  assert.deepEqual(payload.callers.map((n) => n.id), ['b.js:bar']);
});

// ---------- CP-BODY-FIDELITY against real on-disk source ----------
test('CP-BODY-FIDELITY: target & caller bodies are byte-for-byte the real source lines', () => {
  const SRC = tmpDir('codeweb-cpsrc-');
  // helper.js: a 4-line function at line 1; app.js: a 3-line caller at line 1.
  const helperBody = 'function area(r) {\n  const pi = 3.14159;\n  return pi * r * r;\n}';
  const appBody = 'function draw(r) {\n  return area(r);\n}';
  writeTree(SRC, { 'lib/helper.js': helperBody + '\n', 'ui/app.js': appBody + '\n' });
  const root = SRC.replace(/\\/g, '/');
  const graph = {
    meta: { root, target: 'cpfix' }, domains: [], overlaps: [],
    nodes: [
      { id: 'lib/helper.js:area', label: 'area', kind: 'function', file: 'lib/helper.js', line: 1, loc: 4, exports: true, domain: 'lib' },
      { id: 'ui/app.js:draw', label: 'draw', kind: 'function', file: 'ui/app.js', line: 1, loc: 3, exports: true, domain: 'ui' },
    ],
    edges: [{ from: 'ui/app.js:draw', to: 'lib/helper.js:area', kind: 'call' }],
  };
  const p = join(WS, 'fidelity.json');
  writeFileSync(p, JSON.stringify(graph));
  const r = runNode(script('context-pack.mjs'), [p, 'area', '--json']);
  assert.equal(r.status, 0, r.stderr);
  const payload = JSON.parse(r.stdout);
  assert.equal(payload.sourceAvailable, true);
  assert.equal(payload.target[0].body, helperBody, 'target body is the exact source slice');
  assert.equal(payload.callers[0].body, appBody, 'caller body is the exact source slice');
  cleanup(SRC);
});

test('CP-SC4: source absent -> bodies null and sourceAvailable false (never a guess)', () => {
  const graph = {
    meta: { root: '/no/such/root', target: 'x' }, domains: [], overlaps: [],
    nodes: [{ id: 'a.js:f', label: 'f', kind: 'function', file: 'a.js', line: 1, loc: 1, exports: true, domain: '' }], edges: [],
  };
  const p = join(WS, 'nosrc.json');
  writeFileSync(p, JSON.stringify(graph));
  const r = runNode(script('context-pack.mjs'), [p, 'f', '--json']);
  const payload = JSON.parse(r.stdout);
  assert.equal(payload.sourceAvailable, false);
  assert.equal(payload.target[0].body, null);
});
