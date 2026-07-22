// codeweb minhash — deterministic MinHash signatures + LSH banding (Spec N,
// docs/specs/overlap-lsh.md). Turns "which pairs are worth exact-confirming?" from a quadratic
// enumeration into near-linear bucket collisions, with a tunable false-negative rate. The overlap
// stage uses it as a CANDIDATE GENERATOR only — every candidate still goes through the same exact
// confirmation math, so LSH changes which pairs get examined, never how a finding is confirmed.
//
// Determinism contract: no Math.random, no Date. The K permutation seeds are a fixed table
// generated once at module load from a committed constant, all math is 32-bit integer (imul), so
// signatures are byte-stable across runs and platforms. Set-semantics: signatures are
// iteration-order independent by construction (per-permutation min over items).
//
// Multiset Jaccard (Signal C's shared/union over statement fingerprints) reduces exactly to set
// Jaccard by occurrence-expansion: an item with count c becomes c items `x#1..x#c` — callers do
// the expansion, this module only ever sees plain item strings.

// Fixed seed table: mulberry32 stream from a committed constant. Regenerating with the same
// constant yields the same table on every platform (pure uint32 math).
const SEED = 0xC0DE3EB1;
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}
const MAX_K = 256;
const PERM_SEEDS = (() => {
  const g = mulberry32(SEED);
  return Uint32Array.from({ length: MAX_K }, () => g());
})();

// FNV-1a — the base 32-bit hash of an item string.
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// murmur3 finalizer — mixes the base hash with a permutation seed into a well-distributed uint32.
function fmix32(h) {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** K-permutation MinHash signature of an iterable of item strings. */
export function signature(items, K = 128) {
  if (K > MAX_K) throw new Error(`K=${K} exceeds the fixed seed table (${MAX_K})`);
  const sig = new Uint32Array(K).fill(0xFFFFFFFF);
  for (const item of items) {
    const base = fnv1a(String(item));
    for (let i = 0; i < K; i++) {
      const v = fmix32(base ^ PERM_SEEDS[i]);
      if (v < sig[i]) sig[i] = v;
    }
  }
  return sig;
}

/** LSH band keys: `bands` groups of `rows` signature values each. bands*rows must equal K. */
export function bandKeys(sig, bands, rows) {
  if (bands * rows !== sig.length) throw new Error(`bands(${bands}) * rows(${rows}) must equal the signature length (${sig.length}) — cannot divide the signature evenly`);
  const keys = new Array(bands);
  for (let b = 0; b < bands; b++) {
    let key = b + ':';
    for (let r = 0; r < rows; r++) key += sig[b * rows + r].toString(36) + ',';
    keys[b] = key;
  }
  return keys;
}

/** Jaccard estimate: fraction of matching signature positions. */
export function estimate(sigA, sigB) {
  if (sigA.length !== sigB.length) throw new Error('signatures must share K');
  let match = 0;
  for (let i = 0; i < sigA.length; i++) if (sigA[i] === sigB[i]) match++;
  return match / sigA.length;
}

/**
 * Round 2, #24 (T-24.2): THE banding + bucketing + pair-enumeration walk, hoisted from overlap.mjs
 * (both signals ran their own copy). entries = iterable of [id, items]; returns
 * { pairs, buckets, skippedBuckets }.
 *
 * ORDER IS LOAD-BEARING, not just the pair set: downstream consumption is order-sensitive
 * (Signal B pushes twins in walk order and byLabelPair keeps the FIRST twin per label pair at a
 * slice(0,16) rank where sim ties are routine; Signal C's pairShared insertion order feeds
 * t3Findings). `pairs` is therefore in the LEGACY WALK ORDER, never re-sorted: ascending
 * lexicographic sort of the legacy string band keys `${band}:${row.toString(36)},…` over ONE
 * global map (note "10:" < "2:" — bands interleave in string order), then i<j within each
 * bucket's sorted ids, first-seen dedup. Buckets over `bucketCap` ids are skipped and counted
 * (the mega-hub analogue); singletons count in `buckets` but are never walked (tier 1 — they
 * have no side effects to preserve). Pinned deep-equal (pairs array order included) against a
 * verbatim string-key reference implementation by the LSH-PAIRS-EQ property.
 */
export function lshCandidatePairs(entries, { K, bands, rows, bucketCap }) {
  // Tier 2 (#24, T-24.3): numeric band-hash buckets — the ~1M per-entry string-key builds (2.25s
  // of the 5.1s stage at 15.7k) collapse to integer folds; legacy strings are materialized ONLY
  // for multi-occupancy groups (multi ≪ total — the singleton key-builds stay dead).
  // Grouping identity = the EXACT row tuple, so grouping stays exactly the string-key grouping,
  // provably, not probabilistically: each numeric bucket stores its FIRST-insert row tuple; a
  // later insert compares tuples and on mismatch (a true 32-bit hash collision) the ONLY action
  // is a deterministic spill to a per-band side map keyed by the full row-tuple string — never
  // abort, never a whole-bucket fallback: first-tuple members stay in the numeric bucket, every
  // non-first tuple groups in the side map, and a third insert re-matching the first tuple
  // rejoins the numeric bucket. A tuple always folds to the same hash, so every group lives in
  // exactly one place and `buckets` = Σ per band (numeric + side groups) equals the legacy
  // global-map count by the tuple ↔ key-string bijection (fixed row count + ',' terminators).
  // Pass 1: all signatures up front (|entries| × K × 4B — ~11 MB at 15k×192, transient).
  const ids = []; const sigs = [];
  for (const [id, items] of entries) { ids.push(id); sigs.push(signature(items, K)); }
  const n = ids.length;
  if (n && bands * rows !== sigs[0].length) throw new Error(`bands(${bands}) * rows(${rows}) must equal the signature length (${sigs[0].length}) — cannot divide the signature evenly`);
  // Pass 2, BAND-MAJOR (one hot Map at a time — measured ~3× faster inserts than entry-major at
  // 15k entries × 64 bands): per band, fold each entry's rows and bucket by the uint32. Group
  // shape is allocation-light ({i: first-insert entry index, ids: null-until-second-member} —
  // ~1M singleton groups exist only to be counted, so they get no array and no string). Per-band
  // group order per bucket = ascending entry index = the legacy per-bucket insertion order.
  const multi = []; // groups that reached 2 members, recorded once: {b, str: string|null, g}
  let buckets = 0;
  for (let b = 0; b < bands; b++) {
    const off = b * rows;
    const m = new Map();    // uint32 fold -> group (first tuple owns the bucket)
    const side = new Map(); // full row-tuple string -> group (true-collision spill)
    for (let i = 0; i < n; i++) {
      const sig = sigs[i];
      let h = 0x811c9dc5; // FNV-1a fold over the band's row values (deterministic uint32 math)
      for (let r = 0; r < rows; r++) h = Math.imul(h ^ sig[off + r], 0x01000193);
      h = h >>> 0;
      const g = m.get(h);
      if (g === undefined) { m.set(h, { i, ids: null }); continue; }
      const s0 = sigs[g.i];
      let same = true;
      for (let r = 0; r < rows; r++) if (s0[off + r] !== sig[off + r]) { same = false; break; }
      if (same) {
        if (g.ids === null) { g.ids = [ids[g.i], ids[i]]; multi.push({ b, str: null, g }); }
        else g.ids.push(ids[i]);
      } else {
        let ts = '';
        for (let r = 0; r < rows; r++) ts += sig[off + r].toString(36) + ',';
        const sg = side.get(ts);
        if (sg === undefined) { side.set(ts, { i, ids: null }); continue; }
        if (sg.ids === null) { sg.ids = [ids[sg.i], ids[i]]; multi.push({ b, str: ts, g: sg }); }
        else sg.ids.push(ids[i]);
      }
    }
    buckets += m.size + side.size;
  }
  // WALK ORDER: materialize the legacy string key for multi groups only, sort those globally —
  // the pair sequence is the legacy order by construction (byte-equal keys, same string sort),
  // not by luck.
  const withKeys = multi.map((mg) => {
    let ts = mg.str;
    if (ts === null) { ts = ''; const s0 = sigs[mg.g.i], off = mg.b * rows; for (let r = 0; r < rows; r++) ts += s0[off + r].toString(36) + ','; }
    return [mg.b + ':' + ts, mg.g.ids];
  }).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  let skippedBuckets = 0;
  const pairs = [];
  const seen = new Set();
  for (const [, ids] of withKeys) {
    if (ids.length > bucketCap) { skippedBuckets++; continue; }
    const sorted = [...ids].sort();
    for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length; j++) {
      const key = sorted[i] + '|' + sorted[j];
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push([sorted[i], sorted[j]]);
    }
  }
  return { pairs, buckets, skippedBuckets };
}
