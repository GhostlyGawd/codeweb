// F7 — risk scoring. Tests first. ★ANTI-CHEAT RK-COMPONENTS recomputes every component (fanIn,
// fanOut, loc, blast, churn) independently and re-applies the formula with the IMPORTED weight
// constants, over random graphs. RK-MONOTONE pins the pure formula over 100 random vectors.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runNode, script, tmpDir, writeTree, cleanup } from './helpers.mjs';
import { prng, int, pick } from './_proptest.mjs';
import { normalizeGraph, buildIndex, impactOf } from '../scripts/lib/graph-ops.mjs';
import { RISK_WEIGHTS, riskScore } from '../scripts/lib/risk.mjs';

const RISK = script('risk.mjs');
const round = (x) => Math.round(x * 1e6) / 1e6;

function makeGraph(rng, n) {
  const files = ['a.js', 'b.js', 'c.js', 'd.js'];
  const nodes = Array.from({ length: n }, (_, i) => ({ id: `${pick(rng, files)}#${i}:s${i}`, label: `s${i}`, kind: 'function', file: pick(rng, files), line: 1, loc: int(rng, 1, 50), exports: false, domain: 'd' }));
  // de-dup ids by index suffix already unique via #i
  const ids = nodes.map((x) => x.id); const edges = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j && rng() < 0.14) edges.push({ from: ids[i], to: ids[j], kind: 'call' });
  return { meta: {}, nodes, edges, domains: [], overlaps: [] };
}
function churnFor(rng, g) { const m = {}; for (const f of new Set(g.nodes.map((n) => n.file))) m[f] = int(rng, 0, 20); return m; }

function oracleRanked(g, churn) {
  const idx = buildIndex(normalizeGraph(structuredClone(g)));
  const comp = g.nodes.map((n) => ({
    id: n.id,
    fanIn: idx.callIn.get(n.id)?.size || 0,
    fanOut: idx.callOut.get(n.id)?.size || 0,
    loc: n.loc || 0,
    blast: impactOf(idx, [n.id]).length,
    churn: churn[n.file] || 0,
  }));
  const maxes = { fanIn: 0, fanOut: 0, loc: 0, blast: 0, churn: 0 };
  for (const c of comp) for (const k of Object.keys(maxes)) maxes[k] = Math.max(maxes[k], c[k]);
  return comp.map((c) => ({ id: c.id, risk: riskScore(c, maxes), components: { fanIn: c.fanIn, fanOut: c.fanOut, loc: c.loc, blast: c.blast, churn: c.churn } }))
    .sort((a, b) => b.risk - a.risk || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// ★ANTI-CHEAT · RK-COMPONENTS
test('RK-COMPONENTS: components + risk + ranking match the independent recompute (30 cases)', () => {
  const rng = prng(0x215C);
  for (let c = 0; c < 30; c++) {
    const g = makeGraph(rng, int(rng, 5, 11));
    const churn = churnFor(rng, g);
    const dir = tmpDir('cw-risk-');
    try {
      writeTree(dir, { 'graph.json': JSON.stringify(g), 'churn.json': JSON.stringify(churn) });
      const out = JSON.parse(runNode(RISK, [join(dir, 'graph.json'), '--churn', join(dir, 'churn.json'), '--json']).stdout);
      const exp = oracleRanked(g, churn);
      assert.deepEqual(out.ranked.map((r) => r.id), exp.map((e) => e.id), `case ${c}: ranking`);
      for (let i = 0; i < exp.length; i++) {
        assert.equal(round(out.ranked[i].risk), round(exp[i].risk), `case ${c}: risk ${exp[i].id}`);
        assert.deepEqual(out.ranked[i].components, exp[i].components, `case ${c}: components ${exp[i].id}`);
      }
    } finally { cleanup(dir); }
  }
});

// RK-MONOTONE — pure formula: increasing any single component (others fixed) never decreases risk.
test('RK-MONOTONE: risk is non-decreasing in each component (100 random vectors)', () => {
  const rng = prng(0x310E);
  const maxes = { fanIn: 20, fanOut: 20, loc: 100, blast: 30, churn: 25 };
  for (let i = 0; i < 100; i++) {
    const base = { fanIn: int(rng, 0, 20), fanOut: int(rng, 0, 20), loc: int(rng, 0, 100), blast: int(rng, 0, 30), churn: int(rng, 0, 25) };
    const r0 = riskScore(base, maxes);
    for (const k of Object.keys(RISK_WEIGHTS)) {
      const bumped = { ...base, [k]: base[k] + int(rng, 1, 5) };
      assert.ok(riskScore(bumped, maxes) >= r0 - 1e-12, `risk decreased when ${k} increased`);
    }
  }
});

// --changed restricts the ranked list to changed files' symbols (normalization stays graph-global).
test('--changed restricts ranked output to changed files', () => {
  const rng = prng(0xC4A);
  const g = makeGraph(rng, 10);
  const churn = churnFor(rng, g);
  const dir = tmpDir('cw-risk-ch-');
  try {
    writeTree(dir, { 'graph.json': JSON.stringify(g), 'churn.json': JSON.stringify(churn) });
    const out = JSON.parse(runNode(RISK, [join(dir, 'graph.json'), '--churn', join(dir, 'churn.json'), '--changed', 'a.js', '--json']).stdout);
    for (const r of out.ranked) assert.equal(g.nodes.find((n) => n.id === r.id).file, 'a.js');
  } finally { cleanup(dir); }
});

// RK-DETERMINISTIC
test('RK-DETERMINISTIC: identical inputs -> identical stdout', () => {
  const rng = prng(0x2222);
  const g = makeGraph(rng, 8); const churn = churnFor(rng, g);
  const dir = tmpDir('cw-risk-d-');
  try {
    writeTree(dir, { 'graph.json': JSON.stringify(g), 'churn.json': JSON.stringify(churn) });
    const a = runNode(RISK, [join(dir, 'graph.json'), '--churn', join(dir, 'churn.json'), '--json']).stdout;
    const b = runNode(RISK, [join(dir, 'graph.json'), '--churn', join(dir, 'churn.json'), '--json']).stdout;
    assert.equal(a, b);
  } finally { cleanup(dir); }
});
