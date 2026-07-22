// finding #35 — the expand-all force sim. gStep is inlined in the self-contained report; the lab
// (bench/experiments/report-sim-lab.mjs) extracts the REAL gStep and runs it in node so the physics
// is measurable and testable without a browser. These tests pin the INSTRUMENT and the invariants
// the fix must never break: extraction works, a small sim terminates, and the layout is a pure
// deterministic function of its seed (seeded/no-random, insertion-order iteration, slice-independent
// arithmetic) — the physics changes for #35 are tuned against the lab, but determinism is a wall.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSyntheticW, loadGStep, runToSettle } from '../bench/experiments/report-sim-lab.mjs';

test('report-sim: gStep extracts from the template and a small sim settles + terminates', () => {
  const W = buildSyntheticW({ domains: 4, perDomain: 40 });
  const gStep = loadGStep();
  const r = runToSettle(W, gStep, { maxSteps: 400 });
  assert.ok(r.steps > 0 && r.steps < 400, `settles before the hard cap (${r.steps} steps)`);
  assert.ok(Number.isFinite(r.settledMsPerStep) && r.settledMsPerStep >= 0, 'settled ms/step measured');
  assert.ok(Number.isFinite(r.maxSingleTaskMs), 'max single task measured');
  assert.ok(Number.isFinite(r.occupancy.p95), 'cell-occupancy p95 measured');
  for (const n of W.nodes) assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y), 'positions stay finite');
});

test('report-sim: the layout is deterministic — identical seeds give bitwise-equal positions ×2 runs', () => {
  const gStep = loadGStep();
  const run = () => {
    const W = buildSyntheticW({ domains: 5, perDomain: 60, seed: 12345 });
    runToSettle(W, gStep, { maxSteps: 400 });
    return W.nodes.map((n) => [n.x, n.y]);
  };
  const a = run(), b = run();
  assert.equal(a.length, b.length, 'same node count');
  for (let i = 0; i < a.length; i++) {
    assert.equal(a[i][0], b[i][0], `node ${i} x bitwise-equal run to run`);
    assert.equal(a[i][1], b[i][1], `node ${i} y bitwise-equal run to run`);
  }
});

test('report-sim: the spiral seeding is also deterministic and stays finite', () => {
  const gStep = loadGStep();
  const run = () => {
    const W = buildSyntheticW({ domains: 6, perDomain: 50, seed: 999, sp: 38 });
    runToSettle(W, gStep, { maxSteps: 400 });
    return W.nodes.map((n) => [n.x, n.y]);
  };
  const a = run(), b = run();
  for (let i = 0; i < a.length; i++) {
    assert.equal(a[i][0], b[i][0], `node ${i} x bitwise-equal`);
    assert.equal(a[i][1], b[i][1], `node ${i} y bitwise-equal`);
    assert.ok(Number.isFinite(a[i][0]) && Number.isFinite(a[i][1]), 'finite');
  }
});
