// F3 — the duplication-delta edit gate. Two layers, written BEFORE implementation (RED):
//   1. lib/dup-check.mjs incrementalOverlap(graph, changedIds, {root, bodyOf}) — pure, body-confirmed.
//      `bodyOf` is an optional injector for pure tests; otherwise bodies are read from `root` (the
//      same line-range read overlap.mjs/find-similar.mjs use). Sim is rounded to 6 dp to match
//      find-similar.mjs's `+sim.toFixed(6)` convention (one truth).
//   2. review.mjs --before … gains newDuplications[] + flips the gate, closing the hole where a
//      post-edit/refresh graph (overlaps:[]) can't see a freshly-introduced clone.
//
// Hardened after a review gate: the detection contract is proven by a GENERATOR that edits a body
// across the whole 0..1 Jaccard range and asserts detection flips EXACTLY at overlap.mjs's high bar
// (IOV-BOUNDARY) — not by one verbatim fixture. The "one similarity truth" lock cross-checks the
// independent find-similar.mjs ranking (IOV-MATCHES-FINDSIMILAR), so a second formula can't sneak in.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { incrementalOverlap } from '../scripts/lib/dup-check.mjs';
import { shingles, jaccard } from '../scripts/lib/shingles.mjs';
import { runNode, script, tmpDir, cleanup, writeTree } from './helpers.mjs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { prng, int, pick } from './_proptest.mjs';

const HIGH = 0.6; // overlap.mjs body-confirmed "high" bar
const round6 = (x) => +x.toFixed(6);

const BODY_A = 'function validate(u) {\n  if (!u.email) return false;\n  if (!u.password) return false;\n  if (!u.active) return false;\n  return u.role === "admin" || u.role === "owner";\n}';
const BODY_B = 'function sum(xs) {\n  let t = 0;\n  for (const x of xs) t += x;\n  return t;\n}';
const BODY_A_COPY = BODY_A.replace(/validate/g, 'checkUser'); // same body, different name -> lexical ~1

const mkNode = (id) => ({ id, label: id.split(':')[1], kind: 'function', file: id.split(':')[0], line: 1, loc: 5, domain: 'd' });
const GRAPH = {
  meta: {}, domains: [], overlaps: [],
  nodes: [mkNode('a.js:validate'), mkNode('b.js:sum'), mkNode('c.js:checkUser')],
  edges: [],
};
const BODIES = { 'a.js:validate': BODY_A, 'b.js:sum': BODY_B, 'c.js:checkUser': BODY_A_COPY };
const bodyOf = (n) => BODIES[n.id] ?? null;

test('IOV-DETECTS: a changed symbol that copies an existing body is reported (sim >= high)', () => {
  const out = incrementalOverlap(GRAPH, ['c.js:checkUser'], { bodyOf });
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'c.js:checkUser');
  assert.equal(out[0].dupOf, 'a.js:validate');
  assert.ok(out[0].sim >= HIGH, `body-confirmed high, got ${out[0].sim}`);
});

// The real anti-cheat: a `return []` or verbatim-only matcher dies here. We edit BODY_A across the
// full similarity range and assert detection flips EXACTLY when the (rounded) Jaccard crosses 0.6.
test('IOV-BOUNDARY: detection happens iff body-Jaccard >= high, across the whole 0..1 range', () => {
  const rng = prng(123);
  const baseLines = BODY_A.split('\n');
  for (let i = 0; i < 250; i++) {
    // replace a random subset of body lines with unrelated content -> a controlled similarity
    const k = int(rng, 0, baseLines.length);
    const idxs = new Set();
    while (idxs.size < k) idxs.add(int(rng, 0, baseLines.length - 1));
    const edited = baseLines.map((ln, j) => (idxs.has(j) ? `  zz${i}_${j}(qq${int(rng, 0, 99)});` : ln)).join('\n');
    const g = { meta: {}, domains: [], overlaps: [], nodes: [mkNode('a.js:validate'), mkNode('b.js:sum'), mkNode('x.js:cand')], edges: [] };
    const inject = (n) => (n.id === 'x.js:cand' ? edited : BODIES[n.id] ?? null);
    const out = incrementalOverlap(g, ['x.js:cand'], { bodyOf: inject });
    const simToA = round6(jaccard(shingles(edited, 3), shingles(BODY_A, 3)));
    const simToB = round6(jaccard(shingles(edited, 3), shingles(BODY_B, 3)));
    const best = Math.max(simToA, simToB);
    assert.equal(out.length > 0, best >= HIGH, `case ${i}: detection (${out.length > 0}) must match bestSim ${best} >= ${HIGH}`);
    if (out.length) {
      assert.equal(out[0].dupOf, simToA >= simToB ? 'a.js:validate' : 'b.js:sum', `case ${i}: names the nearest body`);
      assert.equal(out[0].sim, best, `case ${i}: reports the rounded best similarity`);
    }
  }
});

test('IOV-REFLEXIVE-EXCLUDED: over random multi-symbol graphs, a symbol never dups itself', () => {
  const rng = prng(9);
  for (let i = 0; i < 100; i++) {
    const n = int(rng, 2, 6);
    const bodies = {};
    const nodes = Array.from({ length: n }, (_, j) => { const id = `f${j}.js:s${j}`; bodies[id] = `function s${j}(){ ${'x();'.repeat(int(rng, 1, 6))} }`; return mkNode(id); });
    const g = { meta: {}, domains: [], overlaps: [], nodes, edges: [] };
    const out = incrementalOverlap(g, nodes.map((x) => x.id), { bodyOf: (nd) => bodies[nd.id] ?? null });
    assert.ok(!out.some((o) => o.dupOf === o.id), `self-dup leaked, case ${i}`);
  }
});

test('IOV-THRESHOLD: a distinct body (sum) is not flagged as a duplicate of anything', () => {
  assert.deepEqual(incrementalOverlap(GRAPH, ['b.js:sum'], { bodyOf }), [], 'unrelated logic must not be reported');
});

test('IOV-DETERMINISTIC: same input -> same output (sorted)', () => {
  const a = incrementalOverlap(GRAPH, ['c.js:checkUser', 'b.js:sum'], { bodyOf });
  const b = incrementalOverlap(GRAPH, ['b.js:sum', 'c.js:checkUser'], { bodyOf });
  assert.deepEqual(a, b);
});

// IOV-MATCHES-FINDSIMILAR: the dup-check ranking must agree with the INDEPENDENT find-similar.mjs
// code path (its top match), so no second similarity formula can creep in. Also exercises the {root}
// disk-reading mode (not the bodyOf injector).
test('IOV-MATCHES-FINDSIMILAR: top dupOf equals find-similar.mjs top match (one truth, {root} mode)', () => {
  const dir = tmpDir('codeweb-iovfs-');
  try {
    const srcRoot = join(dir, 'src');
    writeTree(srcRoot, { 'a.js': BODY_A + '\n', 'b.js': BODY_B + '\n', 'c.js': BODY_A_COPY + '\n' });
    const rootFwd = srcRoot.replace(/\\/g, '/');
    const node = (id, body, file) => ({ id, label: id.split(':')[1], kind: 'function', file, line: 1, loc: body.split('\n').length, domain: 'd', exports: true });
    const withC = { meta: { root: rootFwd }, domains: [], overlaps: [], nodes: [node('a.js:validate', BODY_A, 'a.js'), node('b.js:sum', BODY_B, 'b.js'), node('c.js:checkUser', BODY_A_COPY, 'c.js')], edges: [] };
    const withoutC = { ...withC, nodes: withC.nodes.filter((x) => x.id !== 'c.js:checkUser') };
    // incrementalOverlap on the graph WITH the clone, reading bodies from disk, excludes self -> validate
    const out = incrementalOverlap(withC, ['c.js:checkUser'], { root: rootFwd });
    assert.equal(out[0]?.dupOf, 'a.js:validate');
    // find-similar on the graph WITHOUT the clone, candidate = the clone's body -> top must be validate
    const gp = join(dir, 'g.json'); writeFileSync(gp, JSON.stringify(withoutC));
    const bodyFile = join(dir, 'cand.txt'); writeFileSync(bodyFile, BODY_A_COPY);
    const r = runNode(script('find-similar.mjs'), [gp, '--body', bodyFile, '--json']);
    assert.equal(r.status, 0, r.stderr);
    const fs = JSON.parse(r.stdout);
    assert.equal(fs.matches[0].id, out[0].dupOf, 'dup-check and find-similar agree on the nearest existing body');
  } finally { cleanup(dir); }
});

// ---- gate integration: review.mjs --before gains newDuplications + a failing gate ----
function stageRepo() {
  const dir = tmpDir('codeweb-dupgate-');
  try {
    const srcRoot = join(dir, 'src');
    writeTree(srcRoot, { 'a.js': BODY_A + '\n', 'b.js': BODY_B + '\n', 'c.js': BODY_A_COPY + '\n' });
    const node = (id, file, body) => ({ id, label: id.split(':')[1], kind: 'function', file, line: 1, loc: body.split('\n').length, domain: 'd', exports: true });
    const after = {
      meta: { root: srcRoot.replace(/\\/g, '/'), target: 'dupgate' }, domains: [], overlaps: [],
      nodes: [node('a.js:validate', 'a.js', BODY_A), node('b.js:sum', 'b.js', BODY_B), node('c.js:checkUser', 'c.js', BODY_A_COPY)],
      edges: [],
    };
    const before = { ...after, nodes: after.nodes.filter((n) => n.id !== 'c.js:checkUser') };
    const ap = join(dir, 'after.json'); writeFileSync(ap, JSON.stringify(after));
    const bp = join(dir, 'before.json'); writeFileSync(bp, JSON.stringify(before));
    return { dir, ap, bp };
  } catch (e) { cleanup(dir); throw e; }
}

test('DUP-GATE-DETECTS: review --before --gate on the file that added a clone -> newDuplications + exit 1', () => {
  const { dir, ap, bp } = stageRepo();
  try {
    const r = runNode(script('review.mjs'), [ap, '--changed', 'c.js', '--before', bp, '--gate', '--json']);
    const payload = JSON.parse(r.stdout);
    assert.ok(Array.isArray(payload.newDuplications), 'review reports newDuplications when source is readable');
    assert.ok(payload.newDuplications.some((d) => d.id === 'c.js:checkUser' && d.dupOf === 'a.js:validate'),
      `names the new clone + what it duplicates: ${JSON.stringify(payload.newDuplications)}`);
    assert.equal(r.status, 1, 'the gate fails on a newly-introduced duplication');
  } finally { cleanup(dir); }
});

test('DUP-GATE-CLEAN: changing a non-duplicating file reports no newDuplications and passes the gate', () => {
  const { dir, ap, bp } = stageRepo();
  try {
    const r = runNode(script('review.mjs'), [ap, '--changed', 'b.js', '--before', bp, '--gate', '--json']);
    const payload = JSON.parse(r.stdout);
    assert.deepEqual(payload.newDuplications, [], 'sum() duplicates nothing');
    assert.equal(r.status, 0, 'no regression -> gate passes');
  } finally { cleanup(dir); }
});

// DUP-GATE-THRESHOLD: a near-but-sub-high similarity is NOT reported (precision over recall).
test('DUP-GATE-THRESHOLD: a ~50%-similar edit is below the high bar -> not flagged, gate stays green', () => {
  const dir = tmpDir('codeweb-dupthresh-');
  try {
    // half of validate's checks + new unrelated lines -> Jaccard well under 0.6
    const PARTIAL = 'function partialCheck(u) {\n  if (!u.email) return false;\n  logMetric("seen");\n  emitEvent(u.id);\n  return computeScore(u) > threshold;\n}';
    const srcRoot = join(dir, 'src');
    writeTree(srcRoot, { 'a.js': BODY_A + '\n', 'd.js': PARTIAL + '\n' });
    const node = (id, file, body) => ({ id, label: id.split(':')[1], kind: 'function', file, line: 1, loc: body.split('\n').length, domain: 'd', exports: true });
    const after = { meta: { root: srcRoot.replace(/\\/g, '/'), target: 't' }, domains: [], overlaps: [],
      nodes: [node('a.js:validate', 'a.js', BODY_A), node('d.js:partialCheck', 'd.js', PARTIAL)], edges: [] };
    const before = { ...after, nodes: after.nodes.filter((n) => n.id !== 'd.js:partialCheck') };
    // sanity: the actual similarity is below high (keeps the test honest if bodies are tweaked)
    assert.ok(jaccard(shingles(PARTIAL, 3), shingles(BODY_A, 3)) < HIGH, 'fixture is genuinely sub-high');
    const ap = join(dir, 'after.json'); writeFileSync(ap, JSON.stringify(after));
    const bp = join(dir, 'before.json'); writeFileSync(bp, JSON.stringify(before));
    const r = runNode(script('review.mjs'), [ap, '--changed', 'd.js', '--before', bp, '--gate', '--json']);
    assert.deepEqual(JSON.parse(r.stdout).newDuplications, [], 'sub-high similarity is not a confirmed duplicate');
    assert.equal(r.status, 0, 'gate stays green below the high bar');
  } finally { cleanup(dir); }
});

// ---- Round 2, finding #26 (T-26.1): characterization pins across the sidecar/cap rework --------
// ALL of these stay byte-identical through the BODY_LINE_CAP move and the similar-index pool:
// dup-check already capped pool bodies at 400 lines, so centralizing the constant changes nothing
// here; only buildSimilarIndex and find-similar's live path change behavior (their own tests).
test('IOV-PIN-26: >400-line pool body (capped), unreadable body, and no-match are pinned', () => {
  const dir = tmpDir('codeweb-iovpin-');
  try {
    const srcRoot = join(dir, 'src');
    // 450-line pool body; the changed candidate is byte-identical to its FIRST 400 lines, so the
    // pinned sim is exactly 1 IFF the pool side is capped at 400 (uncapping the pool would sink it)
    const longLines = Array.from({ length: 450 }, (_, i) => `  const v${i} = seed${i % 7}(x) + ${i};`);
    const longBody = 'function longPool(x) {\n' + longLines.slice(0, 448).join('\n') + '\n}';
    const cappedCopy = longBody.split('\n').slice(0, 400).join('\n');
    writeTree(srcRoot, {
      'p.js': longBody + '\n',
      'x.js': cappedCopy + '\n',
      'n.js': 'function noMatch(y) {\n  return y ? qqq(y) : www(y);\n}\n',
    });
    const node = (id, file, line, loc) => ({ id, label: id.split(':')[1], kind: 'function', file, line, loc, domain: 'd', exports: true });
    const g = {
      meta: { root: srcRoot.replace(/\\/g, '/') }, domains: [], overlaps: [],
      nodes: [
        node('p.js:longPool', 'p.js', 1, longBody.split('\n').length),
        node('x.js:cand', 'x.js', 1, cappedCopy.split('\n').length),
        node('n.js:noMatch', 'n.js', 1, 3),
        node('gone.js:unreadable', 'gone.js', 1, 5), // file absent on disk
      ],
      edges: [],
    };
    const root = srcRoot.replace(/\\/g, '/');
    assert.deepEqual(incrementalOverlap(g, ['x.js:cand'], { root }),
      [{ id: 'x.js:cand', dupOf: 'p.js:longPool', sim: 1 }],
      'capped pool body: the 400-line-identical candidate confirms at exactly 1');
    assert.deepEqual(incrementalOverlap(g, ['n.js:noMatch'], { root }), [], 'no-match stays empty');
    assert.deepEqual(incrementalOverlap(g, ['gone.js:unreadable'], { root }), [], 'unreadable body: skipped, no crash');
  } finally { cleanup(dir); }
});

// ---- Round 2, finding #26 (T-26.3): the pool served from similar-index ------------------------
function sidecarFixture() {
  const dir = tmpDir('codeweb-dcsc-');
  const srcRoot = join(dir, 'src');
  const longLines = Array.from({ length: 448 }, (_, i) => `  const w${i} = base${i % 5}(x) * ${i};`);
  const longBody = 'function longOne(x) {\n' + longLines.join('\n') + '\n}';
  const BODY = 'function validate(u) {\n  if (!u.email) return false;\n  if (!u.password) return false;\n  if (!u.active) return false;\n  return u.role === "admin" || u.role === "owner";\n}';
  const files = {
    'a.js': BODY + '\n',
    // CRLF line endings — proves reader/cap parity between the sidecar builder and dup-check's reader
    'crlf.js': BODY.replace(/validate/g, 'checkUser').split('\n').join('\r\n') + '\r\n',
    'long.js': longBody + '\n',
    'c.js': BODY.replace(/validate/g, 'freshCopy') + '\n',
    // lc.js is longOne's FIRST 400 lines verbatim (no rename): once the pool caps longOne at 400
    // its body is byte-identical to lc.js, so the confirmed sim is EXACTLY 1 — that identity is the
    // cap parity being pinned (renaming the fn would perturb one shingle and sink sim below 1).
    'lc.js': longBody.split('\n').slice(0, 400).join('\n') + '\n',
  };
  writeTree(srcRoot, files);
  const node = (id, file, body, sepLines) => ({ id, label: id.split(':')[1], kind: 'function', file, line: 1, loc: sepLines, domain: 'd', exports: true });
  const graph = {
    meta: { root: srcRoot.replace(/\\/g, '/'), target: 'dcsc' }, domains: [], overlaps: [],
    nodes: [
      node('a.js:validate', 'a.js', BODY, BODY.split('\n').length),
      node('crlf.js:checkUser', 'crlf.js', BODY, BODY.split('\n').length),
      node('long.js:longOne', 'long.js', longBody, longBody.split('\n').length),
      node('c.js:freshCopy', 'c.js', BODY, BODY.split('\n').length),
      node('lc.js:longCopy', 'lc.js', longBody, 400),
    ],
    edges: [],
  };
  const gp = join(dir, 'graph.json');
  writeFileSync(gp, JSON.stringify(graph));
  return { dir, gp, graph, root: srcRoot.replace(/\\/g, '/') };
}

test('DC-SIDECAR-EQ: sidecar-fresh ≡ live byte-identical (CRLF + >400-line pool bodies); stale/v1 rejected; missing id still found; changed ids shingle live', async () => {
  const { statSync, utimesSync } = await import('node:fs');
  const { buildSimilarIndex, loadSimilarIndex, SIMILAR_SIDECAR, SIMILAR_VERSION } = await import('../scripts/lib/similar-index.mjs');
  const { sourceReader } = await import('../scripts/lib/cli.mjs');
  const { dir, gp, graph, root } = sidecarFixture();
  try {
    const changed = ['c.js:freshCopy', 'lc.js:longCopy'];
    const live = incrementalOverlap(graph, changed, { root });
    assert.ok(live.some((d) => d.id === 'c.js:freshCopy' && (d.dupOf === 'a.js:validate' || d.dupOf === 'crlf.js:checkUser')), 'fixture actually detects (CRLF pool member reachable)');
    assert.ok(live.some((d) => d.id === 'lc.js:longCopy' && d.dupOf === 'long.js:longOne' && d.sim === 1), 'long pool body capped: 400-line copy confirms at 1');
    // fresh sidecar (v2, capped) -> byte-identical results
    const st = statSync(gp);
    const idx = buildSimilarIndex(graph, { graphMtimeMs: st.mtimeMs, graphSize: st.size }, sourceReader(root));
    assert.equal(idx.version, SIMILAR_VERSION, 'builder stamps THE version const');
    writeFileSync(join(dir, SIMILAR_SIDECAR), JSON.stringify(idx));
    const loaded = loadSimilarIndex(gp);
    assert.ok(loaded, 'fresh v2 sidecar loads');
    const viaSidecar = incrementalOverlap(graph, changed, { root, similarIndex: loaded });
    assert.equal(JSON.stringify(viaSidecar), JSON.stringify(live), 'sidecar path byte-identical to live');
    // changed ids always shingle LIVE: doctoring a changed id's sidecar record must change nothing
    const doctored = structuredClone(loaded);
    doctored.nodes['c.js:freshCopy'] = { n: 3, sh: ['zz zz zz', 'yy yy yy', 'xx xx xx'] };
    assert.equal(JSON.stringify(incrementalOverlap(graph, changed, { root, similarIndex: doctored })), JSON.stringify(live),
      'a changed id is judged on its live body, never its sidecar record');
    // missing pool id -> per-node live fallback, still found
    const partial = structuredClone(loaded);
    delete partial.nodes['a.js:validate'];
    delete partial.nodes['long.js:longOne'];
    assert.equal(JSON.stringify(incrementalOverlap(graph, changed, { root, similarIndex: partial })), JSON.stringify(live),
      'missing sidecar records fall back per node');
    // v1 (uncapped era) sidecar is REJECTED by the loader — never served
    const v1 = { ...structuredClone(loaded), version: 1 };
    writeFileSync(join(dir, SIMILAR_SIDECAR), JSON.stringify(v1));
    assert.equal(loadSimilarIndex(gp), null, 'version 1 sidecar rejected');
    // stale stamp -> null -> callers use the live path (identical by construction)
    writeFileSync(join(dir, SIMILAR_SIDECAR), JSON.stringify(idx));
    utimesSync(gp, new Date(st.atimeMs + 3000), new Date(st.mtimeMs + 3000));
    assert.equal(loadSimilarIndex(gp), null, 'stale stamp rejected');
  } finally { cleanup(dir); }
});

// Perf-quality finding 15 — the exact size-ratio prefilter must never change the reported set.
// Property: over random body pools, incrementalOverlap's results equal a filterless oracle
// (plain jaccard over every pair at the same bar).
test('DC-PREFILTER-EXACT: prefiltered results == filterless oracle on random pools (40 cases)', async () => {
  const { prng, int } = await import('./_proptest.mjs');
  const { shingles, jaccard } = await import('../scripts/lib/shingles.mjs');
  const rng = prng(0xD09C43);
  const round6 = (x) => +x.toFixed(6);
  for (let c = 0; c < 40; c++) {
    const nFns = int(rng, 4, 14);
    const bodies = new Map();
    const nodes = [];
    for (let i = 0; i < nFns; i++) {
      const id = `f${i % 3}.js:fn${i}`;
      // random-ish bodies with deliberate near-duplicates every third symbol
      const base = i % 3 === 0 && i > 0 ? bodies.get(`f${(i - 3) % 3}.js:fn${i - 3}`) : null;
      const lines = base ? base.split('\n') : Array.from({ length: int(rng, 3, 9) }, (_, k) => `const v${k} = a${int(rng, 0, 5)}(x) + ${int(rng, 0, 99)};`);
      if (base && rng() < 0.7) lines[0] = `const v0 = mutated${i}(x);`;
      bodies.set(id, lines.join('\n'));
      nodes.push({ id, label: `fn${i}`, kind: 'function', file: `f${i % 3}.js`, line: 1, loc: lines.length, exports: true, domain: 'd' });
    }
    const graph = { meta: {}, nodes, edges: [], domains: [], overlaps: [] };
    const changed = nodes.filter((_, i) => i % 2 === 0).map((n) => n.id);
    const got = incrementalOverlap(graph, changed, { bodyOf: (n) => bodies.get(n.id) });
    // filterless oracle at the same bar
    const HIGH = 0.6;
    const sh = new Map(nodes.map((n) => [n.id, shingles(bodies.get(n.id), 3)]));
    const want = [];
    for (const id of changed) {
      const cand = sh.get(id);
      if (!cand || !cand.size) continue;
      let best = null;
      for (const other of nodes) {
        if (other.id === id) continue;
        const osh = sh.get(other.id);
        if (!osh || !osh.size) continue;
        const sim = round6(jaccard(cand, osh));
        if (sim < HIGH) continue;
        if (!best || sim > best.sim || (sim === best.sim && other.id < best.dupOf)) best = { dupOf: other.id, sim };
      }
      if (best) want.push({ id, dupOf: best.dupOf, sim: best.sim });
    }
    want.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    assert.deepEqual(got, want, `case ${c}`);
  }
});
