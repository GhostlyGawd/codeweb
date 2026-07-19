// Spec O-1 (docs/specs/incremental-stages.md, amendment): optimize.mjs stops cloning the world.
// Each duplicate-logic candidate's simulated merge becomes a DELTA on a prebuilt file-graph
// (decrement loser-incident pair witnesses, add redirected pairs) + the same Tarjan SCC — never
// applyEdit's structuredClone + full re-scan. The contract is byte-identity: the delta simulation
// must produce EXACTLY what the clone simulation produced, tier for tier, cycle for cycle.
//
// OD0: optimize --json declares its simulation path (delta by default, clone under
//      CODEWEB_OPT_SIM=clone) — pins that the fast path is actually the one running.
// OD1 (property): across seeded random graphs with random merge candidates, --json output is
//      byte-identical between the two paths (modulo the simulation field itself).
// OD2: a merge that creates a new file cycle is 'blocked' with identical projectedNewCycles
//      either path; optimize.md bytes identical too.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, tmpDir, cleanup, script } from './helpers.mjs';

const OPTIMIZE = script('optimize.mjs');

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A random graph: F files x N fns each, random edges over 4 kinds, plus `dups` random
// duplicate-logic overlap groups (2-3 nodes, cross-file) shaped like overlap.mjs emits them.
function randomGraph(rnd, { files = 8, perFile = 5, edges = 60, dups = 6 }) {
  const nodes = [];
  for (let f = 0; f < files; f++) {
    for (let i = 0; i < perFile; i++) {
      nodes.push({ id: `f${f}.js:fn${f}_${i}`, label: `fn${f}_${i}`, file: `f${f}.js`, kind: 'function', loc: 3 + Math.floor(rnd() * 20), exported: rnd() < 0.5 });
    }
  }
  const kinds = ['call', 'call', 'call', 'import', 'inherit', 'ref', 'test'];
  const es = [];
  for (let k = 0; k < edges; k++) {
    const a = nodes[Math.floor(rnd() * nodes.length)], b = nodes[Math.floor(rnd() * nodes.length)];
    if (a.id === b.id) continue;
    es.push({ from: a.id, to: b.id, kind: kinds[Math.floor(rnd() * kinds.length)] });
  }
  const overlaps = [];
  for (let d = 0; d < dups; d++) {
    const size = 2 + (rnd() < 0.3 ? 1 : 0);
    const members = [...new Set(Array.from({ length: size }, () => nodes[Math.floor(rnd() * nodes.length)].id))];
    if (members.length < 2) continue;
    overlaps.push({
      id: `ov${d}`, kind: 'duplicate-logic', confidence: rnd() < 0.5 ? 'high' : 'medium',
      bodySim: +(0.5 + rnd() * 0.5).toFixed(2), drifted: rnd() < 0.25, severity: 'medium',
      title: `\`${members[0].split(':')[1]}\` duplicated across files`,
      domains: ['core'], nodes: members.sort(),
      evidence: 'synthetic', recommendation: 'merge the copies',
    });
  }
  return { meta: { target: 'synthetic', generatedAt: '2026-01-01T00:00:00.000Z' }, nodes, edges: es, domains: [{ name: 'core', nodes: nodes.map((n) => n.id) }], overlaps };
}

const stripSim = (s) => s.replace(/"simulation":\s*"[^"]*",?\s*/g, '');

function runOptimize(graphPath, env, extra = []) {
  const r = runNode(OPTIMIZE, [graphPath, ...extra], { env });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

test('OD0: the simulation path is declared — delta by default, clone under CODEWEB_OPT_SIM=clone', () => {
  const dir = tmpDir('codeweb-optd-');
  try {
    const g = randomGraph(mulberry32(7), {});
    const gp = join(dir, 'graph.json');
    writeFileSync(gp, JSON.stringify(g));
    const dflt = JSON.parse(runOptimize(gp, {}, ['--json']));
    assert.equal(dflt.simulation, 'delta', 'default path is the delta simulation');
    const clone = JSON.parse(runOptimize(gp, { CODEWEB_OPT_SIM: 'clone' }, ['--json']));
    assert.equal(clone.simulation, 'clone', 'env forces the historical clone simulation');
  } finally { cleanup(dir); }
});

test('OD1: property — delta and clone simulations emit byte-identical results on random graphs', () => {
  const rnd = mulberry32(0xD31A);
  for (let trial = 0; trial < 12; trial++) {
    const dir = tmpDir('codeweb-optd-');
    try {
      const g = randomGraph(rnd, { files: 4 + Math.floor(rnd() * 8), perFile: 3 + Math.floor(rnd() * 5), edges: 30 + Math.floor(rnd() * 120), dups: 4 + Math.floor(rnd() * 8) });
      const gp = join(dir, 'graph.json');
      writeFileSync(gp, JSON.stringify(g));
      const delta = runOptimize(gp, {}, ['--json']);
      const clone = runOptimize(gp, { CODEWEB_OPT_SIM: 'clone' }, ['--json']);
      assert.equal(stripSim(delta), stripSim(clone), `trial ${trial}: identical payloads (mod the simulation field)`);
    } finally { cleanup(dir); }
  }
});

test('OD2: a cycle-creating merge is blocked with identical projectedNewCycles either path', () => {
  const dir = tmpDir('codeweb-optd-');
  try {
    // b.js already depends on a.js (edge born -> alpha). Merging beta (b.js) into alpha (a.js)
    // redirects gamma's call gamma->beta to gamma->alpha, adding file edge a.js ... wait: gamma
    // lives in a.js and beta in b.js: a.js -> b.js appears only via the merge redirect of
    // beta's OWN outgoing edge beta->delta (c.js), while c.js -> a.js closes the loop.
    const g = {
      meta: { target: 'cycle-fixture', generatedAt: '2026-01-01T00:00:00.000Z' },
      nodes: [
        { id: 'a.js:alpha', label: 'alpha', file: 'a.js', kind: 'function', loc: 5, exported: true },
        { id: 'b.js:beta', label: 'beta', file: 'b.js', kind: 'function', loc: 5, exported: true },
        { id: 'c.js:delta', label: 'delta', file: 'c.js', kind: 'function', loc: 5, exported: true },
        { id: 'c.js:back', label: 'back', file: 'c.js', kind: 'function', loc: 5, exported: true },
      ],
      edges: [
        { from: 'b.js:beta', to: 'c.js:delta', kind: 'call' },   // b -> c ; after merge: a -> c
        { from: 'c.js:back', to: 'a.js:alpha', kind: 'call' },   // c -> a  (closes a->c->a after merge)
      ],
      domains: [{ name: 'core', nodes: ['a.js:alpha', 'b.js:beta', 'c.js:delta', 'c.js:back'] }],
      overlaps: [{
        id: 'ov0', kind: 'duplicate-logic', confidence: 'high', bodySim: 0.9, drifted: false,
        severity: 'high', title: '`alpha` duplicated in b.js', domains: ['core'],
        nodes: ['a.js:alpha', 'b.js:beta'], evidence: 'synthetic', recommendation: 'merge them',
      }],
    };
    const gp = join(dir, 'graph.json');
    writeFileSync(gp, JSON.stringify(g));
    const md1 = join(dir, 'opt-delta.md'), md2 = join(dir, 'opt-clone.md');
    const delta = JSON.parse(runOptimize(gp, {}, ['--json', '--out', md1]));
    const clone = JSON.parse(runOptimize(gp, { CODEWEB_OPT_SIM: 'clone' }, ['--json', '--out', md2]));
    for (const p of [delta, clone]) {
      assert.equal(p.opportunities[0].tier, 'blocked', 'the merge would create a.js<->c.js');
      assert.ok(p.opportunities[0].projectedNewCycles.length >= 1, 'cycle reported');
    }
    assert.deepEqual(delta.opportunities[0].projectedNewCycles, clone.opportunities[0].projectedNewCycles, 'identical cycles');
    assert.equal(readFileSync(md1, 'utf8'), readFileSync(md2, 'utf8'), 'optimize.md byte-identical');
  } finally { cleanup(dir); }
});
