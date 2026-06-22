// F4 (ranking half) — properties + units for lib/hotspots.mjs (refactoring-hotspot scoring) + the
// hotspots.mjs CLI, written BEFORE the implementation (RED).
//
// hotspot = normalized blend of complexity x fan-in x churn (the Tornhill model): "where do I start"
// in a huge repo. HOT-DOMINANCE is the intent lock — a symbol that is worse on every axis must never
// rank below one that is better on every axis (a monotone blend, like risk.mjs's). HOT-WEIGHTED-BLEND
// pins the exact normalized formula so the score is a real measurement, not an arbitrary sort key.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOTSPOT_WEIGHTS, hotspotScore, rankHotspots } from '../scripts/lib/hotspots.mjs';
import { runNode, script, tmpDir, cleanup } from './helpers.mjs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { prng, int } from './_proptest.mjs';

test('HOT-WEIGHTS: weights are non-negative and sum to 1 (so score in [0,1])', () => {
  const vals = Object.values(HOTSPOT_WEIGHTS);
  assert.ok(vals.every((v) => v >= 0));
  assert.ok(Math.abs(vals.reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

test('HOT-WEIGHTED-BLEND: score is the graph-max-normalized weighted sum of the components', () => {
  const maxes = { complexity: 10, fanIn: 5, churn: 4 };
  const c = { complexity: 10, fanIn: 5, churn: 4 };
  assert.ok(Math.abs(hotspotScore(c, maxes) - 1) < 1e-9, 'max on every axis -> score 1');
  assert.equal(hotspotScore({ complexity: 0, fanIn: 0, churn: 0 }, maxes), 0, 'zero on every axis -> 0');
  const half = hotspotScore({ complexity: 5, fanIn: 0, churn: 0 }, maxes);
  assert.ok(Math.abs(half - HOTSPOT_WEIGHTS.complexity * 0.5) < 1e-9, 'one half-axis -> its weight x 0.5');
});

test('HOT-ZERO: zero maxes never produce NaN (empty/degenerate graphs)', () => {
  const s = hotspotScore({ complexity: 0, fanIn: 0, churn: 0 }, { complexity: 0, fanIn: 0, churn: 0 });
  assert.equal(s, 0);
  assert.ok(!Number.isNaN(s));
});

test('HOT-DOMINANCE: dominating a symbol on every component never ranks below it', () => {
  const rng = prng(7);
  for (let i = 0; i < 300; i++) {
    const maxes = { complexity: 20, fanIn: 20, churn: 20 };
    const lo = { complexity: int(rng, 0, 9), fanIn: int(rng, 0, 9), churn: int(rng, 0, 9) };
    const hi = { complexity: lo.complexity + int(rng, 0, 9), fanIn: lo.fanIn + int(rng, 0, 9), churn: lo.churn + int(rng, 0, 9) };
    assert.ok(hotspotScore(hi, maxes) >= hotspotScore(lo, maxes) - 1e-12, `dominance violated case ${i}`);
  }
  // strict clause: greater on every axis -> STRICTLY higher score (no degenerate all-zero-weight axis)
  const maxes = { complexity: 10, fanIn: 10, churn: 10 };
  assert.ok(hotspotScore({ complexity: 6, fanIn: 6, churn: 6 }, maxes) > hotspotScore({ complexity: 5, fanIn: 5, churn: 5 }, maxes), 'strict dominance -> strictly greater');
});

test('HOT-RANK: rankHotspots sorts by score desc, ties by id; deterministic; no NaN', () => {
  const graph = {
    meta: {}, domains: [], overlaps: [],
    nodes: [
      { id: 'a.js:big', label: 'big', kind: 'function', file: 'a.js', loc: 50, complexity: 12, maxDepth: 4 },
      { id: 'b.js:small', label: 'small', kind: 'function', file: 'b.js', loc: 5, complexity: 1, maxDepth: 1 },
      { id: 'c.js:mid', label: 'mid', kind: 'function', file: 'c.js', loc: 20, complexity: 6, maxDepth: 2 },
    ],
    edges: [{ from: 'b.js:small', to: 'a.js:big', kind: 'call' }, { from: 'c.js:mid', to: 'a.js:big', kind: 'call' }],
  };
  const out = rankHotspots(graph, { churn: { 'a.js': 9 } });
  assert.equal(out.ranked[0].id, 'a.js:big', 'the complex, high-fan-in, high-churn symbol ranks first');
  for (let i = 1; i < out.ranked.length; i++) assert.ok(out.ranked[i - 1].score >= out.ranked[i].score - 1e-12);
  assert.ok(out.ranked.every((r) => !Number.isNaN(r.score)));
  assert.deepEqual(rankHotspots(graph, { churn: { 'a.js': 9 } }), out, 'deterministic');
});

test('HOT-CLI: hotspots.mjs --json ranks symbols with components', () => {
  const dir = tmpDir('codeweb-hot-');
  try {
    const g = { meta: { target: 't' }, domains: [], overlaps: [],
      nodes: [{ id: 'a.js:f', label: 'f', kind: 'function', file: 'a.js', loc: 30, complexity: 8, maxDepth: 3 }],
      edges: [] };
    const gp = join(dir, 'graph.json'); writeFileSync(gp, JSON.stringify(g));
    const r = runNode(script('hotspots.mjs'), [gp, '--json']);
    assert.equal(r.status, 0, r.stderr);
    const payload = JSON.parse(r.stdout);
    assert.ok(Array.isArray(payload.ranked));
    assert.ok('complexity' in payload.ranked[0].components);
  } finally { cleanup(dir); }
});
