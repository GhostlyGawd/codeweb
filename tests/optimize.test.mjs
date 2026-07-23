// Regression suite for scripts/optimize.mjs — the report-only consolidation advisor (gate->optimizer
// step 1). Locks in the tiering policy: a body-confirmed high duplicate-logic finding whose
// simulated merge stays acyclic is READY (gate would pass); one whose naive merge would introduce a
// new file cycle is BLOCKED (gate would reject); drifted / structural-only / non-duplicate-logic
// findings are REVIEW; low/refuted are excluded. The merge is SIMULATED structurally — no source is
// written — so fixtures are hand-built graph.json objects (nodes+edges+overlaps) run through the
// real shipped CLI as a child process.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync, readFileSync } from 'node:fs';
import { runNode, tmpDir, cleanup, script } from './helpers.mjs';

const node = (id, file, { loc = 5, kind = 'function', exports = true } = {}) => ({
  id, label: id.split(':').pop(), kind, file, line: 1, loc, exports, domain: '', summary: '',
});
const edge = (from, to, kind = 'call') => ({ from, to, kind });

let WS;
before(() => { WS = tmpDir('codeweb-opt-'); });
after(() => { cleanup(WS); });

// Write a graph.json and run optimize.mjs --json against it; return {status, payload}.
function runOpt(graph, name) {
  const p = join(WS, `${name}.json`);
  writeFileSync(p, JSON.stringify({ meta: { target: name }, domains: [], ...graph }));
  const r = runNode(script('optimize.mjs'), [p, '--json']);
  assert.equal(r.status, 0, `optimize exited non-zero:\n${r.stderr}`);
  return { status: r.status, payload: JSON.parse(r.stdout) };
}
const byId = (payload, id) => payload.opportunities.find((o) => o.id === id);

test('a body-confirmed high duplicate whose merge stays acyclic is READY (gate would pass)', () => {
  const graph = {
    nodes: [
      node('a/calc.js:compute', 'a/calc.js'), node('b/calc.js:compute', 'b/calc.js'),
      node('a/app.js:run', 'a/app.js'), node('b/app.js:go', 'b/app.js'),
    ],
    edges: [edge('a/app.js:run', 'a/calc.js:compute'), edge('b/app.js:go', 'b/calc.js:compute')],
    overlaps: [{
      id: 'ov1', kind: 'duplicate-logic', confidence: 'high', bodySim: 0.95, drifted: false,
      severity: 'high', title: '`compute` re-implemented in 2 files',
      domains: ['a', 'b'], nodes: ['a/calc.js:compute', 'b/calc.js:compute'],
      evidence: '...', recommendation: 'Extract one `compute` and delete the copies.',
    }],
  };
  const { payload } = runOpt(graph, 'ready');
  const o = byId(payload, 'ov1');
  assert.equal(o.tier, 'ready');
  assert.deepEqual(o.projectedNewCycles, []);
  assert.equal(o.removesNodes, 1, 'one copy deleted, canonical kept');
  // both copies have one caller each -> tie -> equal LOC -> lexicographically smallest id wins
  assert.equal(o.canonical, 'a/calc.js:compute');
  assert.equal(payload.totals.ready, 1);
  assert.equal(payload.totals.duplicationRemovable, 1);
  assert.ok(payload.totals.locReclaimable > 0, 'reclaims the deleted copy LOC');
});

test('a duplicate whose naive merge would create a new file cycle is BLOCKED (gate would reject)', () => {
  // canonical lives in x/svc.js (2 callers -> wins); x/svc.js already depends on p/use.js.
  // The other copy is called from p/use.js, so routing that caller at the canonical adds the back
  // edge p/use.js -> x/svc.js, closing a cycle [p/use.js, x/svc.js].
  const graph = {
    nodes: [
      node('x/svc.js:handle', 'x/svc.js', { loc: 6 }), node('q/svc.js:handle', 'q/svc.js', { loc: 6 }),
      node('p/use.js:caller', 'p/use.js'), node('p/use.js:leaf', 'p/use.js'),
      node('a/m.js:c1', 'a/m.js'), node('b/m.js:c2', 'b/m.js'),
    ],
    edges: [
      edge('a/m.js:c1', 'x/svc.js:handle'), edge('b/m.js:c2', 'x/svc.js:handle'), // 2 callers -> canonical
      edge('p/use.js:caller', 'q/svc.js:handle'),  // caller of the OTHER copy (file p/use.js -> q/svc.js)
      edge('x/svc.js:handle', 'p/use.js:leaf'),     // canonical already reaches p/use.js (file x/svc.js -> p/use.js)
    ],
    overlaps: [{
      id: 'ov1', kind: 'duplicate-logic', confidence: 'high', bodySim: 0.9, drifted: false,
      severity: 'high', title: '`handle` re-implemented in 2 files',
      domains: ['x', 'q'], nodes: ['x/svc.js:handle', 'q/svc.js:handle'],
      evidence: '...', recommendation: 'Extract one `handle`.',
    }],
  };
  const { payload } = runOpt(graph, 'blocked');
  const o = byId(payload, 'ov1');
  assert.equal(o.canonical, 'x/svc.js:handle', 'more-called copy is canonical');
  assert.equal(o.tier, 'blocked');
  assert.deepEqual(o.projectedNewCycles, [['p/use.js', 'x/svc.js']]);
  assert.match(o.gate, /block/i);
  assert.match(o.recommendation, /neutral module/i, 'advises a neutral home instead of a blind merge');
  assert.equal(payload.totals.blocked, 1);
  assert.equal(payload.totals.ready, 0);
});

test('a drifted duplicate is REVIEW, never auto-ready (no blind-merging diverged copies)', () => {
  const graph = {
    nodes: [node('e/t.js:transform', 'e/t.js'), node('f/t.js:transform', 'f/t.js')],
    edges: [],
    overlaps: [{
      id: 'ov1', kind: 'duplicate-logic', confidence: 'medium', bodySim: 0.45, drifted: true,
      severity: 'medium', title: '`transform` re-implemented in 2 files (drifted)',
      domains: ['e', 'f'], nodes: ['e/t.js:transform', 'f/t.js:transform'],
      evidence: '...', recommendation: 'Reconcile the drifted copies deliberately.',
    }],
  };
  const { payload } = runOpt(graph, 'drifted');
  assert.equal(byId(payload, 'ov1').tier, 'review');
  assert.equal(payload.totals.ready, 0);
});

test('a structural-high duplicate (bodySim null) is REVIEW — only body-confirmed merges are ready', () => {
  const graph = {
    nodes: [node('g/s.js:load', 'g/s.js'), node('h/s.js:load', 'h/s.js')],
    edges: [],
    overlaps: [{
      id: 'ov1', kind: 'duplicate-logic', confidence: 'high', bodySim: null, drifted: false,
      severity: 'high', title: '`load` re-implemented in 2 files',
      domains: ['g', 'h'], nodes: ['g/s.js:load', 'h/s.js:load'],
      evidence: 'structural only', recommendation: 'Extract one `load`.',
    }],
  };
  const { payload } = runOpt(graph, 'structural');
  assert.equal(byId(payload, 'ov1').tier, 'review', 'no body confirmation -> not ready');
  assert.equal(payload.totals.ready, 0);
});

test('low and refuted findings are excluded entirely (precision over recall)', () => {
  const graph = {
    nodes: [node('i/x.js:weak', 'i/x.js'), node('j/x.js:weak', 'j/x.js')],
    edges: [],
    overlaps: [
      { id: 'ov1', kind: 'duplicate-logic', confidence: 'low', bodySim: 0.2, drifted: false, severity: 'low', title: '`weak`', domains: ['i'], nodes: ['i/x.js:weak', 'j/x.js:weak'], evidence: '', recommendation: '' },
      { id: 'ov2', kind: 'duplicate-logic', confidence: 'refuted', bodySim: 0.05, drifted: false, severity: 'low', title: '`coin`', domains: ['i'], nodes: ['i/x.js:weak'], evidence: '', recommendation: '' },
    ],
  };
  const { payload } = runOpt(graph, 'excluded');
  assert.equal(payload.totals.findings, 0);
  assert.equal(payload.opportunities.length, 0);
});

test('a parallel-impl finding is surfaced as REVIEW, not a delete-the-copies merge', () => {
  const graph = {
    nodes: [node('k/a.js:fetchJson', 'k/a.js'), node('l/b.js:getJson', 'l/b.js')],
    edges: [],
    overlaps: [{
      id: 'ov1', kind: 'parallel-impl', confidence: 'high', bodySim: 0.7, drifted: false,
      severity: 'medium', title: '`fetchJson` and `getJson` call the same 80% of helpers',
      domains: ['k', 'l'], nodes: ['k/a.js:fetchJson', 'l/b.js:getJson'],
      evidence: '...', recommendation: 'Compare the two; route both through one.',
    }],
  };
  const { payload } = runOpt(graph, 'parallel');
  const o = byId(payload, 'ov1');
  assert.equal(o.tier, 'review');
  assert.equal(o.canonical, null, 'no canonical chosen for a non-duplicate-logic finding');
});

test('an empty overlap set yields a clean zero report and exit 0', () => {
  const { status, payload } = runOpt({ nodes: [], edges: [], overlaps: [] }, 'empty');
  assert.equal(status, 0);
  assert.deepEqual(payload.totals, { findings: 0, ready: 0, blocked: 0, review: 0, duplicationRemovable: 0, locReclaimable: 0 });
});

test('opportunities are ordered ready -> blocked -> review (actionable first)', () => {
  const graph = {
    nodes: [
      node('a/r.js:dup', 'a/r.js'), node('b/r.js:dup', 'b/r.js'),         // ready
      node('c/d.js:drift', 'c/d.js'), node('e/d.js:drift', 'e/d.js'),     // review (drifted)
    ],
    edges: [],
    overlaps: [
      { id: 'ovDrift', kind: 'duplicate-logic', confidence: 'medium', bodySim: 0.4, drifted: true, severity: 'high', title: '`drift`', domains: ['c'], nodes: ['c/d.js:drift', 'e/d.js:drift'], evidence: '', recommendation: 'reconcile' },
      { id: 'ovReady', kind: 'duplicate-logic', confidence: 'high', bodySim: 0.9, drifted: false, severity: 'high', title: '`dup`', domains: ['a'], nodes: ['a/r.js:dup', 'b/r.js:dup'], evidence: '', recommendation: 'extract' },
    ],
  };
  const { payload } = runOpt(graph, 'ordering');
  assert.deepEqual(payload.opportunities.map((o) => o.tier), ['ready', 'review']);
  assert.equal(payload.opportunities[0].id, 'ovReady', 'ready sorts ahead of review even though drift is listed first');
});

test('--out writes an optimize.md artifact with the tiered sections', () => {
  const graph = {
    nodes: [node('a/r.js:dup', 'a/r.js'), node('b/r.js:dup', 'b/r.js')],
    edges: [],
    overlaps: [{
      id: 'ov1', kind: 'duplicate-logic', confidence: 'high', bodySim: 0.9, drifted: false,
      severity: 'high', title: '`dup` re-implemented in 2 files', domains: ['a'],
      nodes: ['a/r.js:dup', 'b/r.js:dup'], evidence: '', recommendation: 'Extract one `dup`.',
    }],
  };
  const p = join(WS, 'mdcase.json');
  const mdPath = join(WS, 'optimize.md');
  writeFileSync(p, JSON.stringify({ meta: { target: 'mdcase' }, domains: [], ...graph }));
  const r = runNode(script('optimize.mjs'), [p, '--out', mdPath]);
  assert.equal(r.status, 0, r.stderr);
  const md = readFileSync(mdPath, 'utf8');
  assert.match(md, /# codeweb — consolidation advisory/);
  assert.match(md, /## Ready/);
  assert.match(md, /## Blocked/);
  assert.match(md, /## Judgement calls/); // A4: the review TIER displays as "judgement" (the triple owns "review")
  assert.match(md, /`dup` re-implemented in 2 files/);
});

test('missing graph path exits 2 (usage)', () => {
  const r = runNode(script('optimize.mjs'), []);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage/i);
});
