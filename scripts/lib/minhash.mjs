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
