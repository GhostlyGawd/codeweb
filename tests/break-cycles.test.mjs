// F9 — cycle-breaking advisor. Tests first. ★ANTI-CHEAT (co-★): CB-CHEAP (cut weight <= mean cross-
// file edge weight in the cycle) + CB-NO-FABRICATE (every cut edge exists in the graph). CB-VERIFIED
// is a companion where the TEST independently reconstructs the cut graph and re-runs fileCycles.
// CB-ADVERSARIAL pins that the cheaper of two working cuts is chosen.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runNode, script, tmpDir, writeTree, cleanup } from './helpers.mjs';
import { prng, int, pick } from './_proptest.mjs';
import { normalizeGraph, fileCycles, cheapestCuts } from '../scripts/lib/graph-ops.mjs';

const BC = script('break-cycles.mjs');
const write = (g) => { const dir = tmpDir('cw-bc-'); writeTree(dir, { 'graph.json': JSON.stringify(g) }); return { dir, graphPath: join(dir, 'graph.json') }; };
const edgeKey = (e) => `${e.from} ${e.to} ${e.kind}`;

// a random A.js<->B.js 2-file cycle with wAB edges A->B and wBA edges B->A
function makeCyclic(rng) {
  const wAB = int(rng, 1, 4), wBA = int(rng, 1, 4);
  const n = Math.max(wAB, wBA) + 2;
  const nodes = [];
  for (let i = 0; i < n; i++) nodes.push({ id: `A.js:a${i}`, label: `a${i}`, kind: 'function', file: 'A.js', line: i + 1, loc: 1, exports: true, domain: 'd' });
  for (let i = 0; i < n; i++) nodes.push({ id: `B.js:b${i}`, label: `b${i}`, kind: 'function', file: 'B.js', line: i + 1, loc: 1, exports: true, domain: 'd' });
  const edges = [];
  for (let i = 0; i < wAB; i++) edges.push({ from: `A.js:a${i}`, to: `B.js:b${i}`, kind: 'call' });
  for (let i = 0; i < wBA; i++) edges.push({ from: `B.js:b${i}`, to: `A.js:a${i + 1}`, kind: 'call' });
  return { graph: { meta: {}, nodes, edges, domains: [], overlaps: [] }, wAB, wBA };
}

// a random 3-file ring A.js -> B.js -> C.js -> A.js with random per-edge weights (a simple SCC, so
// cutting ANY one file->file edge breaks it — exercises "cheapest single-edge cut that breaks the SCC").
function makeTriRing(rng) {
  const w = { AB: int(rng, 1, 4), BC: int(rng, 1, 4), CA: int(rng, 1, 4) };
  const n = Math.max(w.AB, w.BC, w.CA) + 2;
  const nodes = [];
  for (const f of ['A.js', 'B.js', 'C.js']) for (let i = 0; i < n; i++) nodes.push({ id: `${f}:s${i}`, label: `${f[0]}${i}`, kind: 'function', file: f, line: i + 1, loc: 1, exports: true, domain: 'd' });
  const edges = [];
  const link = (from, to, cnt) => { for (let i = 0; i < cnt; i++) edges.push({ from: `${from}:s${i}`, to: `${to}:s${i}`, kind: 'call' }); };
  link('A.js', 'B.js', w.AB); link('B.js', 'C.js', w.BC); link('C.js', 'A.js', w.CA);
  return { graph: { meta: {}, nodes, edges, domains: [], overlaps: [] }, w };
}

// ★ANTI-CHEAT · CB-CHEAP + CB-NO-FABRICATE + CB-VERIFIED companion
test('CB-CHEAP/NO-FABRICATE/VERIFIED over random 2-cycles (40 cases)', () => {
  const rng = prng(0xCB7C1E);
  for (let c = 0; c < 40; c++) {
    const { graph, wAB, wBA } = makeCyclic(rng);
    const { dir, graphPath } = write(graph);
    try {
      const out = JSON.parse(runNode(BC, [graphPath, '--json']).stdout);
      assert.equal(out.cycles.length, 1, `case ${c}: expected one cycle`);
      const cy = out.cycles[0];
      assert.equal(cy.verified, true, `case ${c}: must be verified`);
      const cut = cy.cut;
      // CB-CHEAP: chosen weight <= mean cross-file edge weight in the cycle, and == the cheaper direction
      assert.ok(cut.weight <= cy.meanWeight + 1e-9, `case ${c}: weight ${cut.weight} > mean ${cy.meanWeight}`);
      assert.equal(cut.weight, Math.min(wAB, wBA), `case ${c}: not the cheapest direction`);
      // CB-NO-FABRICATE: every underlying cut edge exists in the graph
      const present = new Set(graph.edges.map(edgeKey));
      for (const e of cut.underlyingEdges) assert.ok(present.has(edgeKey(e)), `case ${c}: fabricated edge ${edgeKey(e)}`);
      // CB-VERIFIED (independent): remove the cut edges, re-run fileCycles -> the A.js|B.js cycle is gone
      const rm = new Set(cut.underlyingEdges.map(edgeKey));
      const g2 = normalizeGraph({ ...structuredClone(graph), edges: graph.edges.filter((e) => !rm.has(edgeKey(e))) });
      assert.ok(!fileCycles(g2).some((cyc) => cyc.join('|') === 'A.js|B.js'), `case ${c}: cut did not break the cycle`);
    } finally { cleanup(dir); }
  }
});

// CB-ADVERSARIAL: cheap (1 edge) and expensive (3 edges) both break the cycle -> cheaper chosen.
test('CB-ADVERSARIAL: the cheaper of two working cuts is chosen', () => {
  // A->B has 1 edge (cheap), B->A has 3 edges (expensive); cutting either breaks the 2-cycle.
  const nodes = [];
  for (let i = 0; i < 5; i++) nodes.push({ id: `A.js:a${i}`, label: `a${i}`, kind: 'function', file: 'A.js', line: i + 1, loc: 1, exports: true, domain: 'd' });
  for (let i = 0; i < 5; i++) nodes.push({ id: `B.js:b${i}`, label: `b${i}`, kind: 'function', file: 'B.js', line: i + 1, loc: 1, exports: true, domain: 'd' });
  const edges = [{ from: 'A.js:a0', to: 'B.js:b0', kind: 'call' }];
  for (let i = 0; i < 3; i++) edges.push({ from: `B.js:b${i}`, to: `A.js:a${i + 1}`, kind: 'call' });
  const { dir, graphPath } = write({ meta: {}, nodes, edges, domains: [], overlaps: [] });
  try {
    const cy = JSON.parse(runNode(BC, [graphPath, '--json']).stdout).cycles[0];
    assert.equal(cy.cut.weight, 1, 'cheapest (1-edge) cut chosen');
    assert.equal(cy.cut.fromFile, 'A.js'); assert.equal(cy.cut.toFile, 'B.js');
    assert.equal(cy.verified, true);
  } finally { cleanup(dir); }
});

// CB-3RING: cheapest verified, non-fabricated cut over random 3-file rings (the >2-file coverage gap).
test('CB-3RING: cheapest verified cut on random 3-file rings (20 cases)', () => {
  const rng = prng(0x3217A);
  for (let c = 0; c < 20; c++) {
    const { graph, w } = makeTriRing(rng);
    const { dir, graphPath } = write(graph);
    try {
      const cy = JSON.parse(runNode(BC, [graphPath, '--json']).stdout).cycles[0];
      assert.equal(cy.verified, true, `case ${c}`);
      assert.equal(cy.cut.weight, Math.min(w.AB, w.BC, w.CA), `case ${c}: cheapest direction`);
      assert.ok(cy.cut.weight <= cy.meanWeight + 1e-9, `case ${c}: weight <= mean`);
      const present = new Set(graph.edges.map(edgeKey));
      for (const e of cy.cut.underlyingEdges) assert.ok(present.has(edgeKey(e)), `case ${c}: fabricated`);
      const rm = new Set(cy.cut.underlyingEdges.map(edgeKey));
      const g2 = normalizeGraph({ ...structuredClone(graph), edges: graph.edges.filter((e) => !rm.has(edgeKey(e))) });
      assert.ok(!fileCycles(g2).some((cyc) => cyc.join('|') === 'A.js|B.js|C.js'), `case ${c}: cut broke the ring`);
    } finally { cleanup(dir); }
  }
});

// CB-COVERS + no cycles -> empty (no fabricated work).
test('CB-COVERS: an acyclic graph yields zero cycle proposals', () => {
  const g = { meta: {}, domains: [], overlaps: [], nodes: [{ id: 'A.js:a', label: 'a', kind: 'function', file: 'A.js', line: 1, loc: 1, exports: true, domain: 'd' }, { id: 'B.js:b', label: 'b', kind: 'function', file: 'B.js', line: 1, loc: 1, exports: true, domain: 'd' }], edges: [{ from: 'A.js:a', to: 'B.js:b', kind: 'call' }] };
  const { dir, graphPath } = write(g);
  try {
    const out = JSON.parse(runNode(BC, [graphPath, '--json']).stdout);
    assert.equal(out.cycles.length, 0);
  } finally { cleanup(dir); }
});

// CB-DETERMINISTIC
test('CB-DETERMINISTIC: identical input -> identical stdout', () => {
  const rng = prng(0xBC7);
  const { graph } = makeCyclic(rng);
  const { dir, graphPath } = write(graph);
  try {
    assert.equal(runNode(BC, [graphPath, '--json']).stdout, runNode(BC, [graphPath, '--json']).stdout);
  } finally { cleanup(dir); }
});

// ---- Round 2, finding #23 (T-23.2): cheapestCuts ≡ the whole-graph oracle -----------------------
// FROZEN ORACLE: a verbatim copy of the pre-#23 per-cycle candidate/verify path — candidates from
// STRUCTURAL edges, each candidate verified by re-running fileCycles on the WHOLE graph with the
// candidate's edges removed (edgeKey-set filter), same-key survival. The SCC-pseudo-graph
// implementation must deep-equal this on every graph; deep-equal is ORDER-sensitive, so it pins
// the candidate trial order, the chosen cut, and underlyingEdges element order, not just verdicts.
function oracleCheapestCuts(graph) {
  const STRUCTURAL = new Set(['call', 'import', 'inherit']);
  const oEdgeKey = (e) => [e.from, e.to, e.kind].join(String.fromCharCode(0));
  const fileOf = new Map(graph.nodes.map((n) => [n.id, n.file]));
  const structuralEdges = graph.edges.filter((e) => STRUCTURAL.has(e.kind));
  const cycleKey = (c) => c.join('|');
  const cyclesWithout = (removeKeys) => fileCycles({ ...graph, edges: graph.edges.filter((e) => !removeKeys.has(oEdgeKey(e))) });
  return fileCycles(graph).map((cycle) => {
    const inCycle = new Set(cycle);
    const fe = new Map();
    for (const e of structuralEdges) {
      const f = fileOf.get(e.from), t = fileOf.get(e.to);
      if (f && t && f !== t && inCycle.has(f) && inCycle.has(t)) {
        const k = `${f}\x00${t}`; if (!fe.has(k)) fe.set(k, []); fe.get(k).push(e);
      }
    }
    const candidates = [...fe.entries()].map(([k, edges]) => { const [fromFile, toFile] = k.split('\x00'); return { fromFile, toFile, weight: edges.length, edges }; })
      .sort((a, b) => a.weight - b.weight || (a.fromFile < b.fromFile ? -1 : a.fromFile > b.fromFile ? 1 : 0) || (a.toFile < b.toFile ? -1 : a.toFile > b.toFile ? 1 : 0));
    const meanWeight = candidates.length ? candidates.reduce((s, c) => s + c.weight, 0) / candidates.length : 0;
    const key = cycleKey(cycle);
    let chosen = null;
    for (const cand of candidates) {
      const rm = new Set(cand.edges.map(oEdgeKey));
      if (!cyclesWithout(rm).some((c) => cycleKey(c) === key)) { chosen = cand; break; }
    }
    if (chosen) return { files: cycle, meanWeight, verified: true, cut: { fromFile: chosen.fromFile, toFile: chosen.toFile, weight: chosen.weight, underlyingEdges: chosen.edges.map((e) => ({ from: e.from, to: e.to, kind: e.kind })) } };
    return { files: cycle, meanWeight, verified: false, cut: null, note: 'no single file->file edge cut breaks this cycle — needs a multi-edge cut or a restructure (extract a shared module)' };
  });
}

// Seeded cyclic graphs over ALL FOUR cycle kinds, duplicate (from,to,kind) edges included:
// a guaranteed file ring (sometimes closed ONLY by ref edges — candidates empty, verified:false)
// plus random extra edges, plus deliberate call+ref pairs (a pair that stays alive via ref after
// its structural cut — the STRUCTURAL-vs-fileCycles kind-set subtlety).
function randomCyclicKindGraph(rng) {
  const nFiles = int(rng, 2, 6);
  const files = Array.from({ length: nFiles }, (_, i) => `f${i}.js`);
  const perFile = int(rng, 1, 3);
  const nodes = [];
  for (const f of files) for (let j = 0; j < perFile; j++) nodes.push({ id: `${f}:s${j}`, label: `${f[1]}s${j}`, kind: 'function', file: f, line: j + 1, loc: 1, exports: true, domain: 'd' });
  const nodeIn = (f) => `${f}:s${int(rng, 0, perFile - 1)}`;
  const KINDS = ['call', 'import', 'inherit', 'ref'];
  const edges = [];
  // guaranteed ring over a shuffled subset of >= 2 files
  const shuffled = files.slice();
  for (let i = shuffled.length - 1; i > 0; i--) { const j = int(rng, 0, i); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  const ring = shuffled.slice(0, int(rng, 2, nFiles));
  const refOnlyRing = rng() < 0.3; // the ref-closed-cycle case: no structural in-cycle edge
  for (let i = 0; i < ring.length; i++) {
    edges.push({ from: nodeIn(ring[i]), to: nodeIn(ring[(i + 1) % ring.length]), kind: refOnlyRing ? 'ref' : pick(rng, KINDS) });
  }
  // random extras (any kind, any files) + duplicates of already-present edges
  const nExtra = int(rng, 0, 10);
  for (let e = 0; e < nExtra; e++) {
    const from = nodeIn(pick(rng, files)), to = nodeIn(pick(rng, files));
    if (from === to) continue;
    edges.push({ from, to, kind: pick(rng, KINDS) });
  }
  for (let d = 0; d < 3; d++) if (edges.length && rng() < 0.5) edges.push({ ...pick(rng, edges) }); // duplicate (from,to,kind)
  // deliberate call+ref shadow pairs: a ref edge on the same file pair as an existing call edge
  for (const e of edges.slice()) {
    if (e.kind === 'call' && rng() < 0.25) edges.push({ from: e.from, to: e.to, kind: 'ref' });
  }
  return normalizeGraph({ meta: {}, nodes, edges, domains: [], overlaps: [] });
}

// ★ round 2 #23 property — cheapestCuts (SCC-pseudo-graph verification) deep-equals the frozen
// whole-graph oracle, order and all. MUTATION CHECK (demonstrated RED during the build, kept
// documented here): making the witness table count STRUCTURAL kinds only — instead of all
// CYCLE_KINDS — flips CB-REF-ALIVE below and this property (a pair alive only via ref would be
// counted dead, verifying a cut that does NOT break the cycle). fileCycles counts ref; the
// witness table must too.
test('CB-PSEUDO-EQ: cheapestCuts ≡ whole-graph oracle over 150 seeded all-kind cyclic graphs (incl. ref-closed + duplicates)', () => {
  const rng = prng(0x23C0DE);
  let refClosedSeen = 0, unverifiedSeen = 0, dupSeen = 0;
  for (let c = 0; c < 150; c++) {
    const g = randomCyclicKindGraph(rng);
    const seen = new Set(); let hasDup = false;
    for (const e of g.edges) { const k = `${e.from}|${e.to}|${e.kind}`; if (seen.has(k)) hasDup = true; seen.add(k); }
    if (hasDup) dupSeen++;
    const got = cheapestCuts(g);
    const want = oracleCheapestCuts(g);
    assert.deepEqual(got, want, `case ${c}: cheapestCuts must equal the whole-graph oracle`);
    for (const cy of got) {
      if (!cy.verified) {
        unverifiedSeen++;
        assert.equal(cy.cut, null, `case ${c}: unverified cycle carries cut:null`);
        assert.match(cy.note, /no single file->file edge cut/, `case ${c}: unverified cycle carries today's note`);
      }
    }
    // the ref-closed shape: a cycle whose in-cycle edges are all ref -> candidates empty -> verified:false
    const fileOf = new Map(g.nodes.map((n) => [n.id, n.file]));
    for (const cy of got) {
      const inC = new Set(cy.files);
      const structuralIn = g.edges.some((e) => ['call', 'import', 'inherit'].includes(e.kind)
        && inC.has(fileOf.get(e.from)) && inC.has(fileOf.get(e.to)) && fileOf.get(e.from) !== fileOf.get(e.to));
      if (!structuralIn) { refClosedSeen++; assert.equal(cy.verified, false, `case ${c}: ref-closed cycle must be verified:false`); }
    }
  }
  assert.ok(refClosedSeen >= 5, `generator must produce ref-closed cycles (saw ${refClosedSeen})`);
  assert.ok(unverifiedSeen >= 5, `generator must produce unverified cycles (saw ${unverifiedSeen})`);
  assert.ok(dupSeen >= 10, `generator must produce duplicate (from,to,kind) edges (saw ${dupSeen})`);
});

// CB-REF-ALIVE (the spec's scenario, and the permanent mutation guard): given a pair with 1 call +
// 1 ref edge, when its structural cut is tried, the cycle SURVIVES (the ref still closes it) and
// the next candidate is chosen — exactly today's verdict. A STRUCTURAL-only witness table would
// pick the 1-edge cut and go RED here.
test('CB-REF-ALIVE: given a call+ref pair, when its structural cut is tried, then the cycle survives and the next candidate is chosen', () => {
  const nodes = [];
  for (let i = 0; i < 3; i++) nodes.push({ id: `A.js:a${i}`, label: `a${i}`, kind: 'function', file: 'A.js', line: i + 1, loc: 1, exports: true, domain: 'd' });
  for (let i = 0; i < 3; i++) nodes.push({ id: `B.js:b${i}`, label: `b${i}`, kind: 'function', file: 'B.js', line: i + 1, loc: 1, exports: true, domain: 'd' });
  const edges = [
    { from: 'A.js:a0', to: 'B.js:b0', kind: 'call' }, // A->B: 1 structural (weight 1 — tried first)
    { from: 'A.js:a1', to: 'B.js:b1', kind: 'ref' },  // ...but the pair stays ALIVE via ref
    { from: 'B.js:b0', to: 'A.js:a1', kind: 'call' }, // B->A: 2 structural (weight 2 — tried second)
    { from: 'B.js:b1', to: 'A.js:a2', kind: 'call' },
  ];
  const g = normalizeGraph({ meta: {}, nodes, edges, domains: [], overlaps: [] });
  const out = cheapestCuts(g);
  assert.equal(out.length, 1);
  assert.equal(out[0].verified, true);
  assert.deepEqual({ fromFile: out[0].cut.fromFile, toFile: out[0].cut.toFile, weight: out[0].cut.weight },
    { fromFile: 'B.js', toFile: 'A.js', weight: 2 },
    'the 1-call A->B cut must FAIL (ref keeps the pair alive) and the 2-call B->A cut wins');
  assert.deepEqual(out, oracleCheapestCuts(g), 'and the whole-graph oracle agrees verbatim');
});
