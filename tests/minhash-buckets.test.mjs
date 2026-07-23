// Round 2, finding #24 (T-24.2/3): lib/minhash.mjs lshCandidatePairs — THE banding + bucketing +
// pair-enumeration walk both overlap signals ride. The property pins it deep-equal against a
// VERBATIM string-key reference implementation (the pre-#24 global-Map walk): deep-equal on the
// pairs ARRAY pins the ORDER (the legacy global string-key sort, "10:" < "2:", i<j within each
// bucket's sorted ids, first-seen dedup) — a set-equal-but-reordered result FAILS here, because
// downstream consumption (Signal B's byLabelPair first-wins at the slice(0,16) rank, Signal C's
// pairShared insertion order) is order-sensitive, not just set-sensitive. buckets and
// skippedBuckets equality is asserted explicitly. This property is the gate tier 2 (numeric
// band-hash keys) lands behind: grouping identity = exact row tuple, so it must stay EXACTLY the
// string-key grouping, provably, not probabilistically.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signature, bandKeys, lshCandidatePairs } from '../scripts/lib/minhash.mjs';
import { prng, int, pick } from './_proptest.mjs';

// ---- VERBATIM string-key reference (the pre-#24 overlap.mjs walk, parameterized) ----------------
function referenceLsh(entries, { K, bands, rows, bucketCap }) {
  const buckets = new Map();
  for (const [id, items] of entries) {
    for (const bk of bandKeys(signature(items, K), bands, rows)) {
      if (!buckets.has(bk)) buckets.set(bk, []);
      buckets.get(bk).push(id);
    }
  }
  let skippedBuckets = 0;
  const pairs = []; const seen = new Set();
  for (const bk of [...buckets.keys()].sort()) {
    const ids = buckets.get(bk);
    if (ids.length < 2) continue;
    if (ids.length > bucketCap) { skippedBuckets++; continue; }
    ids.sort();
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const key = ids[i] + '|' + ids[j];
      if (!seen.has(key)) { seen.add(key); pairs.push([ids[i], ids[j]]); }
    }
  }
  return { pairs, buckets: buckets.size, skippedBuckets };
}

// Random entries with FORCED collisions (shared item pools), empty item sets, and duplicate items
// — the shapes the two signals actually feed (Signal B: callee-label Sets; Signal C:
// occurrence-expanded arrays with duplicates impossible, but the lib must not care).
function randomEntries(rng) {
  const nPools = int(rng, 1, 4);
  const pools = Array.from({ length: nPools }, (_, p) => Array.from({ length: int(rng, 3, 10) }, (_, i) => `p${p}i${i}`));
  const n = int(rng, 2, 24);
  const entries = [];
  for (let e = 0; e < n; e++) {
    const roll = rng();
    let items;
    if (roll < 0.08) items = []; // empty set: all-0xFFFFFFFF signature — every empty entry collides
    else if (roll < 0.55) items = pick(rng, pools).slice(); // exact pool copy — guaranteed collisions
    else {
      const base = pick(rng, pools);
      items = base.filter(() => rng() < 0.8);
      if (rng() < 0.4) items.push(`u${e}-${int(rng, 0, 99)}`); // near-collision
      if (rng() < 0.3 && items.length) items.push(items[0]);   // duplicate item
    }
    entries.push([`id${String(e).padStart(2, '0')}`, items]);
  }
  return entries;
}

test('LSH-PAIRS-EQ: lshCandidatePairs ≡ verbatim string-key reference — pairs ORDER, buckets, skippedBuckets (220 seeded cases, both signal configs)', () => {
  const rng = prng(0x24BA4D);
  const CONFIGS = [
    { K: 192, bands: 64, rows: 3 },  // Signal B
    { K: 128, bands: 32, rows: 4 },  // Signal C
  ];
  let skippedSeen = 0, multiSeen = 0;
  for (let c = 0; c < 220; c++) {
    const entries = randomEntries(rng);
    const config = { ...pick(rng, CONFIGS), bucketCap: pick(rng, [2, 3, 64]) }; // small caps force skips
    const got = lshCandidatePairs(entries, config);
    const want = referenceLsh(entries, config);
    assert.deepEqual(got.pairs, want.pairs, `case ${c}: pair SEQUENCE must equal the legacy walk order`);
    assert.equal(got.buckets, want.buckets, `case ${c}: bucket count (singletons included)`);
    assert.equal(got.skippedBuckets, want.skippedBuckets, `case ${c}: skipped-bucket count`);
    if (want.skippedBuckets) skippedSeen++;
    if (want.pairs.length) multiSeen++;
  }
  assert.ok(skippedSeen >= 20, `generator must exercise the bucket cap (saw ${skippedSeen})`);
  assert.ok(multiSeen >= 100, `generator must produce multi-occupancy buckets (saw ${multiSeen})`);
});

// LSH-TIER2-COLLISION-SPILL (round 2, #24, T-24.3): a TRUE 32-bit band-fold collision must never
// merge two DIFFERENT row tuples. Items `itm_285` and `itm_13184` fold to the same uint32 on band 0
// (rows=3, K=192) with different tuples — found by search, deterministic under the fixed PERM_SEEDS.
// The numeric bucket keeps the first tuple; the second, colliding-but-different tuple MUST spill to
// the side map and group only with its own exact-tuple duplicates. This is the one path the random
// property cannot reach (a fold collision at 2^32 ~never occurs over the generator's entry counts),
// so the spill branch would otherwise ship untested. The precondition asserts FAIL LOUDLY if a hash
// change ever dissolves the collision — find a new colliding pair, never delete the coverage.
test('LSH-TIER2-COLLISION-SPILL: a true band-fold collision spills by exact tuple, never merges differing tuples', () => {
  const rows = 3, off = 0;
  const fold = (sig) => { let h = 0x811c9dc5; for (let r = 0; r < rows; r++) h = Math.imul(h ^ sig[off + r], 0x01000193); return h >>> 0; };
  const sA = signature(['itm_285'], 192), sB = signature(['itm_13184'], 192);
  assert.equal(fold(sA), fold(sB), 'band-0 fold must collide (else the spill path is untested — search a new pair)');
  assert.notEqual(sA.slice(off, off + rows).join(','), sB.slice(off, off + rows).join(','), 'the colliding tuples must DIFFER (that is what the spill exists for)');
  // A1/A2 are one tuple, B1/B2 the colliding-but-different other; on band 0 they share a fold.
  const entries = [['A1', ['itm_285']], ['B1', ['itm_13184']], ['A2', ['itm_285']], ['B2', ['itm_13184']]];
  const config = { K: 192, bands: 64, rows: 3, bucketCap: 64 };
  const got = lshCandidatePairs(entries, config);
  assert.deepEqual(got, referenceLsh(entries, config), 'spill grouping ≡ string-key reference under a real fold collision');
  const set = new Set(got.pairs.map((p) => p.join('|')));
  assert.ok(set.has('A1|A2') && set.has('B1|B2'), 'each tuple groups with its own exact-tuple duplicate');
  assert.ok(!set.has('A1|B1') && !set.has('A1|B2') && !set.has('A2|B1') && !set.has('A2|B2'), 'the fold collision must NOT merge the differing tuples');
});

test('LSH-PAIRS-DETERMINISTIC: identical entries in identical order -> identical result object', () => {
  const rng = prng(0x24DE7);
  const entries = randomEntries(rng);
  const config = { K: 128, bands: 32, rows: 4, bucketCap: 64 };
  assert.deepEqual(lshCandidatePairs(entries, config), lshCandidatePairs(entries, config));
});
