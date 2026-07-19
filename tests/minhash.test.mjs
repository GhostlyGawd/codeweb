// Spec N (docs/specs/overlap-lsh.md): scripts/lib/minhash.mjs — deterministic MinHash + LSH
// banding over item sets. No Math.random/Date at runtime: the permutation constants are a fixed
// committed table, so signatures are byte-stable across runs and platforms.
//
// N1 (property): |estimate − trueJaccard| ≤ 0.15 at K=128 for ≥95% of seeded random set pairs.
// N2 (property): banding proposes ≥99% of planted pairs at the confirm thresholds the overlap
//     stage uses — J≥0.7 under 32×4 bands and J≥0.5 under 64×3 bands.
// N3: identical inputs (any iteration order) → identical signatures and band keys, twice.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signature, bandKeys, estimate } from '../scripts/lib/minhash.mjs';

// Seeded PRNG for TEST corpora only (the lib itself must never need randomness at runtime).
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

// A pair of sets with |A|=|B|=n sharing exactly `shared` items → trueJ = shared/(2n − shared).
function pairWithOverlap(rnd, n, shared, tag) {
  const common = Array.from({ length: shared }, (_, i) => `c${tag}-${i}-${Math.floor(rnd() * 1e9)}`);
  const onlyA = Array.from({ length: n - shared }, (_, i) => `a${tag}-${i}-${Math.floor(rnd() * 1e9)}`);
  const onlyB = Array.from({ length: n - shared }, (_, i) => `b${tag}-${i}-${Math.floor(rnd() * 1e9)}`);
  return { A: [...common, ...onlyA], B: [...common, ...onlyB], trueJ: shared / (2 * n - shared) };
}

const collide = (sigA, sigB, bands, rows) => {
  const ka = new Set(bandKeys(sigA, bands, rows));
  return bandKeys(sigB, bands, rows).some((k) => ka.has(k));
};

test('N1: minhash estimate tracks true Jaccard within 0.15 at K=128 (>=95% of pairs)', () => {
  const rnd = mulberry32(0xC0DEB);
  let ok = 0;
  const TRIALS = 200;
  for (let t = 0; t < TRIALS; t++) {
    const n = 10 + Math.floor(rnd() * 190);
    const shared = Math.floor(rnd() * (n + 1));
    const { A, B, trueJ } = pairWithOverlap(rnd, n, shared, t);
    const err = Math.abs(estimate(signature(A, 128), signature(B, 128)) - trueJ);
    if (err <= 0.15) ok++;
  }
  assert.ok(ok / TRIALS >= 0.95, `estimate within 0.15 for ${ok}/${TRIALS} pairs`);
});

test('N2: banding proposes >=99% of pairs at the overlap confirm thresholds', () => {
  const rnd = mulberry32(0xBEEF);
  const TRIALS = 150;

  // T3 regime: confirm at J>=0.7, bands 32x4 over K=128
  let hit = 0;
  for (let t = 0; t < TRIALS; t++) {
    const n = 8 + Math.floor(rnd() * 120);
    const shared = Math.ceil((0.7 * 2 * n) / 1.7); // trueJ >= 0.7
    const { A, B, trueJ } = pairWithOverlap(rnd, n, Math.min(n, shared), `t3-${t}`);
    assert.ok(trueJ >= 0.7 - 1e-9, `corpus generator sanity (${trueJ})`);
    if (collide(signature(A, 128), signature(B, 128), 32, 4)) hit++;
  }
  assert.ok(hit / TRIALS >= 0.99, `32x4 banding caught ${hit}/${TRIALS} planted J>=0.7 pairs`);

  // twin regime: confirm at J>=0.5, bands 64x3 over K=192
  let hit2 = 0;
  for (let t = 0; t < TRIALS; t++) {
    const n = 4 + Math.floor(rnd() * 60);
    const shared = Math.ceil((0.5 * 2 * n) / 1.5); // trueJ >= 0.5
    const { A, B, trueJ } = pairWithOverlap(rnd, n, Math.min(n, shared), `tw-${t}`);
    assert.ok(trueJ >= 0.5 - 1e-9, `corpus generator sanity (${trueJ})`);
    if (collide(signature(A, 192), signature(B, 192), 64, 3)) hit2++;
  }
  assert.ok(hit2 / TRIALS >= 0.99, `64x3 banding caught ${hit2}/${TRIALS} planted J>=0.5 pairs`);
});

test('N3: signatures and band keys are deterministic and iteration-order independent', () => {
  const items = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'];
  const a = signature(items, 128);
  const b = signature([...items].reverse(), 128);
  assert.deepEqual([...a], [...b], 'order never changes a signature');
  assert.deepEqual([...signature(items, 128)], [...a], 'same input twice -> same signature');
  assert.deepEqual(bandKeys(a, 32, 4), bandKeys(b, 32, 4), 'band keys identical too');
  assert.throws(() => bandKeys(a, 33, 4), /bands.*rows|divide/i, 'bands*rows must equal K');
  const c = signature(['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'ETA'], 128);
  assert.notDeepEqual([...c], [...a], 'different sets -> different signatures');
});
