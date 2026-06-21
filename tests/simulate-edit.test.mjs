// Regression + property suite for scripts/simulate-edit.mjs — the structural gate pre-flight.
// Written BEFORE the implementation: the script does not exist yet, so every subprocess run fails.
// The headline property SE-FAITHFUL pins the tool's output to structuralRegressions(before,
// naiveApply(before, op)) — an independent apply composed with the trusted oracle — so it can only
// pass by computing the genuinely-correct post-edit graph, not by fitting examples.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync, readFileSync } from 'node:fs';
import { runNode, tmpDir, cleanup, script } from './helpers.mjs';
import { normalizeGraph, structuralRegressions } from '../scripts/lib/graph-ops.mjs';
import { prng, randomGraph, randomOp, naiveApply } from './_proptest.mjs';

let WS;
before(() => { WS = tmpDir('codeweb-se-'); });
after(() => { cleanup(WS); });

let caseN = 0;
function run(graph, args) {
  const p = join(WS, `se${caseN++}.json`);
  const bytes = JSON.stringify({ meta: { target: 'se' }, domains: [], overlaps: [], ...graph });
  writeFileSync(p, bytes);
  const r = runNode(script('simulate-edit.mjs'), [p, ...args, '--json']);
  return { ...r, path: p, bytes, payload: r.status === 0 ? JSON.parse(r.stdout) : null };
}
const faithful = (rng, kindWanted, n) => {
  for (let i = 0; i < n; i++) {
    const g = normalizeGraph(randomGraph(rng));
    let op; do { op = randomOp(rng, g); } while (kindWanted && op.kind !== kindWanted);
    const { payload } = run(g, opToArgs(op));
    const expected = structuralRegressions(g, naiveApply(g, op));
    assert.deepEqual({ newCycles: payload.projected.newCycles, lostCallers: payload.projected.lostCallers }, expected, `op ${JSON.stringify(op)}`);
    assert.equal(payload.projected.ok, expected.newCycles.length === 0 && expected.lostCallers.length === 0, `ok invariant, op ${JSON.stringify(op)}`);
  }
};
const opToArgs = (op) => op.kind === 'delete' ? ['--delete', op.ids[0]]
  : op.kind === 'move' ? ['--move', op.id, '--to', op.to]
    : ['--merge', op.ids.join(','), '--into', op.into];

test('SC2: projected has gate shape and ok === (no new cycles && no lost callers)', () => {
  const graph = {
    nodes: [
      { id: 'a.js:f', label: 'f', kind: 'function', file: 'a.js', line: 1, loc: 2, exports: true, domain: '' },
      { id: 'b.js:g', label: 'g', kind: 'function', file: 'b.js', line: 1, loc: 2, exports: false, domain: '' },
    ],
    edges: [{ from: 'a.js:f', to: 'b.js:g', kind: 'call' }],
  };
  // deleting f orphans g (g existed, loses its only caller) -> a regression
  const { payload } = run(graph, ['--delete', 'a.js:f']);
  assert.ok(payload, 'exit 0 with json');
  assert.deepEqual(payload.projected.lostCallers, ['b.js:g']);
  assert.deepEqual(payload.projected.newCycles, []);
  assert.equal(payload.projected.ok, false, 'ok reflects the lost caller');
});

test('SE-FAITHFUL: tool matches the oracle + ok invariant holds — delete (30 cases)', () => faithful(prng(101), 'delete', 30));
test('SE-FAITHFUL: tool matches the oracle + ok invariant holds — merge (30 cases)', () => faithful(prng(202), 'merge', 30));
test('SE-FAITHFUL: tool matches the oracle + ok invariant holds — move (30 cases)', () => faithful(prng(303), 'move', 30));
test('SE-FAITHFUL: tool matches the oracle across mixed random ops (60 cases)', () => faithful(prng(404), null, 60));

test('SE-PURE: the input graph file is byte-identical after a run', () => {
  const graph = { nodes: [{ id: 'a.js:f', label: 'f', kind: 'function', file: 'a.js', line: 1, loc: 1, exports: true, domain: '' }], edges: [] };
  const { path, bytes } = run(graph, ['--delete', 'a.js:f']);
  assert.equal(readFileSync(path, 'utf8'), bytes, 'simulate-edit must not write to the graph');
});

test('H4: --into defaults to the smallest resolved id when omitted', () => {
  const graph = {
    nodes: [
      { id: 'a.js:f', label: 'f', kind: 'function', file: 'a.js', line: 1, loc: 1, exports: true, domain: '' },
      { id: 'b.js:g', label: 'g', kind: 'function', file: 'b.js', line: 1, loc: 1, exports: true, domain: '' },
    ],
    edges: [],
  };
  // larger id listed first, --into omitted -> canonical must be the smallest id
  const { payload } = run(graph, ['--merge', 'b.js:g,a.js:f']);
  assert.equal(payload.into, 'a.js:f');
});

test('SE-DETERMINISTIC: same input -> identical stdout', () => {
  const graph = {
    nodes: [
      { id: 'a.js:f', label: 'f', kind: 'function', file: 'a.js', line: 1, loc: 1, exports: true, domain: '' },
      { id: 'b.js:g', label: 'g', kind: 'function', file: 'b.js', line: 1, loc: 1, exports: true, domain: '' },
    ],
    edges: [{ from: 'a.js:f', to: 'b.js:g', kind: 'call' }],
  };
  const a = run(graph, ['--merge', 'a.js:f,b.js:g', '--into', 'a.js:f', '--json']);
  const b = run(graph, ['--merge', 'a.js:f,b.js:g', '--into', 'a.js:f', '--json']);
  assert.equal(a.stdout, b.stdout);
});

test('SE-OPTIMIZE-AGREE: simulate-edit --merge and optimize.mjs project the SAME newCycles for a finding', () => {
  // The optimize.mjs BLOCKED fixture: merging the two `handle` copies closes a [p/use.js, x/svc.js]
  // cycle. Both tools must agree on that projected cycle — they share applyEdit, so a divergence
  // means the optimize refactor broke. canonical = x/svc.js:handle (2 callers).
  const graph = {
    nodes: [
      { id: 'x/svc.js:handle', label: 'handle', kind: 'function', file: 'x/svc.js', line: 1, loc: 6, exports: true, domain: 'x' },
      { id: 'q/svc.js:handle', label: 'handle', kind: 'function', file: 'q/svc.js', line: 1, loc: 6, exports: true, domain: 'q' },
      { id: 'p/use.js:caller', label: 'caller', kind: 'function', file: 'p/use.js', line: 1, loc: 1, exports: true, domain: 'p' },
      { id: 'p/use.js:leaf', label: 'leaf', kind: 'function', file: 'p/use.js', line: 1, loc: 1, exports: true, domain: 'p' },
      { id: 'a/m.js:c1', label: 'c1', kind: 'function', file: 'a/m.js', line: 1, loc: 1, exports: true, domain: 'a' },
      { id: 'b/m.js:c2', label: 'c2', kind: 'function', file: 'b/m.js', line: 1, loc: 1, exports: true, domain: 'b' },
    ],
    edges: [
      { from: 'a/m.js:c1', to: 'x/svc.js:handle', kind: 'call' },
      { from: 'b/m.js:c2', to: 'x/svc.js:handle', kind: 'call' },
      { from: 'p/use.js:caller', to: 'q/svc.js:handle', kind: 'call' },
      { from: 'x/svc.js:handle', to: 'p/use.js:leaf', kind: 'call' },
    ],
    overlaps: [{
      id: 'ov1', kind: 'duplicate-logic', confidence: 'high', bodySim: 0.9, drifted: false, severity: 'high',
      title: '`handle` re-implemented in 2 files', domains: ['x', 'q'],
      nodes: ['x/svc.js:handle', 'q/svc.js:handle'], evidence: '...', recommendation: 'Extract one `handle`.',
    }],
  };
  const { payload: se } = run(graph, ['--merge', 'x/svc.js:handle,q/svc.js:handle', '--into', 'x/svc.js:handle']);

  const op = join(WS, 'agree.json');
  writeFileSync(op, JSON.stringify({ meta: { target: 'agree' }, domains: [], ...graph }));
  const optR = runNode(script('optimize.mjs'), [op, '--json']);
  assert.equal(optR.status, 0, optR.stderr);
  const opt = JSON.parse(optR.stdout).opportunities.find((o) => o.id === 'ov1');

  assert.deepEqual(se.projected.newCycles, [['p/use.js', 'x/svc.js']], 'simulate-edit sees the cycle');
  assert.deepEqual(se.projected.newCycles, opt.projectedNewCycles, 'both tools project the same cycle');
  assert.equal(se.projected.ok, false);
  assert.equal(opt.tier, 'blocked');
});

test('SC4: unknown symbol -> exit 1; missing op -> exit 2', () => {
  const graph = { nodes: [{ id: 'a.js:f', label: 'f', kind: 'function', file: 'a.js', line: 1, loc: 1, exports: true, domain: '' }], edges: [] };
  const notFound = run(graph, ['--delete', 'nope:nope']);
  assert.equal(notFound.status, 1);
  const p = join(WS, 'usage.json');
  writeFileSync(p, JSON.stringify({ nodes: [], edges: [] }));
  const usage = runNode(script('simulate-edit.mjs'), [p]); // no op
  assert.equal(usage.status, 2);
});
