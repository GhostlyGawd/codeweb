// finding #37 — the graph draw loop. The draw helpers are inlined in the self-contained report
// (no module system in the browser), so — per this suite's "what ships is what's tested" rule — we
// extract the REAL functions from the template and exercise them. Canvas rendering itself is a
// browser concern (Playwright, dev-side), but the hot decisions — which labels to draw, which
// style bucket an edge lands in, the search hit set — are pure and pinned here in node.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SCRIPTS } from './helpers.mjs';

// brace-balance a `function name(...) {...}` out of the template (same pattern as treemap-bisect).
function extractFn(name, source) {
  const start = source.indexOf('function ' + name + '(');
  assert.ok(start >= 0, `template no longer defines function ${name}() — update this test`);
  const open = source.indexOf('{', start);
  let depth = 0, i = open;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) { i++; break; }
  }
  const src = source.slice(start, i);
  return { fn: new Function('return (' + src + ')')(), src };
}

const TEMPLATE = readFileSync(join(SCRIPTS, 'report-template.html'), 'utf8');
const { fn: labelPick } = extractFn('labelPick', TEMPLATE);
const { fn: edgeBucketKey } = extractFn('edgeBucketKey', TEMPLATE);
const { fn: edgeStyleFor } = extractFn('edgeStyleFor', TEMPLATE);
const { fn: hitScan } = extractFn('hitScan', TEMPLATE);
const { src: GDRAW_SRC } = extractFn('gDraw', TEMPLATE);

// deterministic LCG so the property tests are reproducible (no Math.random)
function lcg(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32; }

// ---- T-37.1: cvColors() is hoisted to one call at the top of gDraw ----------------------------
test('T-37.1: gDraw reads cvColors() exactly once, before the edge/node passes (not per label)', () => {
  const calls = (GDRAW_SRC.match(/cvColors\(\)/g) || []).length;
  assert.equal(calls, 1, 'exactly one getComputedStyle-backed cvColors() per draw');
  assert.ok(GDRAW_SRC.indexOf('cvColors()') < GDRAW_SRC.indexOf('W.edges.forEach'), 'hoisted above the draw passes');
});

// ---- T-37.3: exact-bucket edge batching, byte-identical to the old per-edge style ---------------
// the OLD per-edge computation, verbatim from the pre-#37 template — the parity oracle.
function oldEdgeStyle(e, A, B, on) {
  const wgt = Math.min(1, Math.log(e.weight + 1) / 3.4);
  const tangle = e.cross && !(A.bubble && B.bubble);
  const stroke = !on ? 'rgba(125,122,135,0.05)'
    : tangle ? 'rgba(236,131,90,' + (0.25 + wgt * 0.4) + ')'
    : 'rgba(156,153,166,' + (0.14 + wgt * 0.34) + ')';
  const width = A.bubble && B.bubble ? Math.max(0.8, Math.min(6, Math.log(e.weight + 1) * 1.4)) : 1;
  return { stroke, width };
}

test('T-37.3: every edge of a 50k set has old per-edge style === its bucket style (byte-exact)', () => {
  const rnd = lcg(0xED9E);
  const keys = new Set();
  const stateOfKey = (k) => k.split('|')[0];
  for (let n = 0; n < 50000; n++) {
    const A = { bubble: rnd() < 0.15 }, B = { bubble: rnd() < 0.15 };
    // integer weights incl. past both saturation points (29 alpha, 72 width)
    const e = { weight: 1 + Math.floor(rnd() * 150), cross: rnd() < 0.4 };
    const on = rnd() < 0.7;
    const key = edgeBucketKey(e, A, B, on);
    keys.add(key);
    const bucket = edgeStyleFor(key);
    const old = oldEdgeStyle(e, A, B, on);
    assert.equal(bucket.stroke, old.stroke, `stroke mismatch for ${key} (w=${e.weight})`);
    assert.equal(bucket.width, old.width, `width mismatch for ${key} (w=${e.weight})`);
  }
  assert.ok(keys.size <= 432, `≤ 3·2·72 buckets (got ${keys.size})`);
  // dim / tangle / norm are disjoint partitions — a bucket key is exactly one state
  for (const k of keys) assert.ok(['dim', 'tangle', 'norm'].includes(stateOfKey(k)), `bucket state well-formed: ${k}`);
});

test('T-37.3: weight ≥ 72 collapses to one width bucket, weight ≥ 29 to one alpha, no over-merge across states', () => {
  const A = { bubble: true }, B = { bubble: true }; // bubble pair → width varies with weight
  const w72 = edgeStyleFor(edgeBucketKey({ weight: 72, cross: false }, A, B, true));
  const w200 = edgeStyleFor(edgeBucketKey({ weight: 200, cross: false }, A, B, true));
  assert.equal(w72.width, w200.width, 'width saturates at w=72');
  assert.equal(w72.width, 6, 'saturated bubble-pair width is 6');
  // dim vs norm never share a bucket even at equal (pair,weight)
  const dim = edgeBucketKey({ weight: 5, cross: false }, { bubble: false }, { bubble: false }, false);
  const norm = edgeBucketKey({ weight: 5, cross: false }, { bubble: false }, { bubble: false }, true);
  assert.notEqual(dim, norm, 'dim and norm are different buckets');
  assert.notEqual(edgeStyleFor(dim).stroke, edgeStyleFor(norm).stroke, 'and different styles');
});

// ---- T-37.2: label pick — cap, priority, determinism, position-independence --------------------
function mkNodes(rnd, N) {
  const out = [];
  for (let i = 0; i < N; i++) out.push({ id: 'n' + String(i).padStart(5, '0'), bubble: rnd() < 0.05, r: 3 + rnd() * 20, x: rnd() * 1000, y: rnd() * 1000, count: i });
  return out;
}

test('T-37.2: labelPick caps at the given count', () => {
  const nodes = mkNodes(lcg(1), 900);
  const picked = labelPick(nodes, { k: 1 }, null, 300);
  assert.equal(picked.length, 300, 'never more than the cap');
  assert.equal(labelPick(nodes.slice(0, 50), { k: 1 }, null, 300).length, 50, 'fewer candidates → all of them');
});

test('T-37.2: priority order is bubbles > hl members > screen radius desc, tie-break by id', () => {
  const cam = { k: 1 };
  const nodes = [
    { id: 'z-small', bubble: false, r: 4, x: 0, y: 0 },
    { id: 'a-big', bubble: false, r: 18, x: 0, y: 0 },
    { id: 'b-hl', bubble: false, r: 4, x: 0, y: 0 },
    { id: 'c-bubble', bubble: true, r: 2, x: 0, y: 0 },
  ];
  const hl = new Set(['b-hl']);
  const picked = labelPick(nodes, cam, hl, 10).map((n) => n.id);
  assert.deepEqual(picked, ['c-bubble', 'b-hl', 'a-big', 'z-small'],
    'bubble first, then the hl member, then bigger screen radius, then the smallest');
  // tie-break by id when rank AND screen radius are equal
  const ties = [{ id: 'n-b', bubble: false, r: 5 }, { id: 'n-a', bubble: false, r: 5 }];
  assert.deepEqual(labelPick(ties, cam, null, 10).map((n) => n.id), ['n-a', 'n-b'], 'id ascending tie-break');
});

test('T-37.2: labelPick is position-independent and deterministic (flicker-free across anneal)', () => {
  const rnd = lcg(7);
  const nodes = mkNodes(rnd, 600);
  const cam = { k: 0.8 };
  const hl = new Set(nodes.filter((_, i) => i % 9 === 0).map((n) => n.id));
  const a = labelPick(nodes, cam, hl, 250).map((n) => n.id);
  // move every node (the anneal does this each frame) — the pick must not change
  const moved = nodes.map((n) => ({ ...n, x: n.x + 137.5, y: -n.y * 3.1 }));
  const b = labelPick(moved, cam, hl, 250).map((n) => n.id);
  assert.deepEqual(a, b, 'rank never depends on x/y — same labels frame to frame at a fixed camera');
  assert.deepEqual(labelPick(nodes, cam, hl, 250).map((n) => n.id), a, 'deterministic run to run');
});

// ---- T-37.4: search hit set computed once (reused by gDraw), not rescanned per frame -----------
test('T-37.4: hitScan matches the old per-frame AN scan; gDraw no longer rescans AN', () => {
  const AN = [
    { id: 'a', label: 'parseHash', domain: 'core' },
    { id: 'b', label: 'ParseArgs', domain: 'cli' },
    { id: 'c', label: 'render', domain: 'ui' },
    { id: 'd', label: 'reParse', domain: 'core' },
  ];
  const term = 'parse';
  // old inline computation the draw loop used to run every frame
  const t = term.toLowerCase();
  const oldIds = new Set(), oldDoms = new Set();
  AN.forEach((n) => { if (n.label.toLowerCase().indexOf(t) >= 0) { oldIds.add(n.id); oldDoms.add(n.domain); } });
  const r = hitScan(AN, term);
  assert.deepEqual([...r.ids].sort(), [...oldIds].sort(), 'same hit ids');
  assert.deepEqual([...r.doms].sort(), [...oldDoms].sort(), 'same hit domains');
  assert.deepEqual(r.hits.map((n) => n.id), ['a', 'b', 'd'], 'case-insensitive substring, active-scope order');
  assert.equal(hitScan(AN, '').ids.size, 0, 'empty term → empty hit set');
  // the source guard: the draw loop reuses the stored sets, it does not rescan AN per frame
  assert.ok(!/AN\.forEach/.test(GDRAW_SRC), 'gDraw no longer contains an AN.forEach rescan');
  assert.ok(GDRAW_SRC.includes('hitIds'), 'gDraw reuses the precomputed hit id set');
});
