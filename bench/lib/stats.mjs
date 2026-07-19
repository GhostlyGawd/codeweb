import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// codeweb effectiveness study — shared statistics primitives.
//
// One proven implementation, used by every experiment harness, so confidence intervals and effect
// sizes are computed identically across the paper (no per-harness re-derivation). Dependency-free
// and deterministic: the bootstrap uses a seeded PRNG, so every interval reproduces exactly.
//
// Self-test: `node bench/lib/stats.mjs` runs sanity checks against known values and exits non-zero
// on any mismatch — the lib can't silently drift.

// ---- seeded PRNG (mulberry32) — identical generator to tests/_proptest.mjs, kept local so the
// paper/ tree is self-contained and reproducible standalone. -------------------------------------
export function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- descriptive ------------------------------------------------------------------------------
export const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
export function quantile(xs, q) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}
export const median = (xs) => quantile(xs, 0.5);
export function stddev(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

// ---- Wilson score interval for a binomial proportion (good at extremes, unlike normal approx) ---
// Returns { p, lo, hi } at confidence 1-alpha (default 95%). k successes in n trials.
export function wilson(k, n, z = 1.959963984540054) {
  if (n === 0) return { p: NaN, lo: 0, hi: 1 };
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const margin = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return { p, lo: Math.max(0, center - margin), hi: Math.min(1, center + margin) };
}

// ---- Rule of Three: with 0 observed events in n trials, the 95% upper bound on the true rate ----
export const ruleOfThree = (n) => (n > 0 ? 3 / n : 1);

// ---- bootstrap percentile CI for an arbitrary statistic over a 1-D sample -----------------------
// data: number[]; stat: (resample:number[])=>number. Seeded → reproducible. Returns {est, lo, hi}.
export function bootstrapCI(data, stat = mean, { B = 10000, seed = 1, alpha = 0.05 } = {}) {
  const rng = prng(seed);
  const n = data.length;
  const est = stat(data);
  if (n === 0) return { est: NaN, lo: NaN, hi: NaN, B, n };
  const reps = new Array(B);
  for (let b = 0; b < B; b++) {
    const sample = new Array(n);
    for (let i = 0; i < n; i++) sample[i] = data[(rng() * n) | 0];
    reps[b] = stat(sample);
  }
  return { est, lo: quantile(reps, alpha / 2), hi: quantile(reps, 1 - alpha / 2), B, n };
}

// ---- paired bootstrap on the mean difference (after - before) -----------------------------------
// pairs: {before:number, after:number}[]. Resamples PAIRS (preserving pairing). Returns the CI of
// mean(after-before); a CI strictly below 0 means "after" is significantly lower (e.g. fewer
// regressions in treatment).
export function pairedDiffCI(pairs, opts = {}) {
  const diffs = pairs.map((p) => p.after - p.before);
  return bootstrapCI(diffs, mean, opts);
}

// ---- Cliff's delta: nonparametric effect size in [-1, 1]. δ>0 ⇒ a tends to exceed b. ------------
export function cliffsDelta(a, b) {
  if (!a.length || !b.length) return { delta: NaN, magnitude: 'n/a' };
  let gt = 0, lt = 0;
  for (const x of a) for (const y of b) { if (x > y) gt++; else if (x < y) lt++; }
  const delta = (gt - lt) / (a.length * b.length);
  const m = Math.abs(delta);
  const magnitude = m < 0.147 ? 'negligible' : m < 0.33 ? 'small' : m < 0.474 ? 'medium' : 'large';
  return { delta, magnitude };
}

// ---- OLS fit of log(y) = intercept + slope*log(x): the scaling-exponent estimator ---------------
// Returns { slope, intercept, r2, n, slopeSE, slopeLo, slopeHi } (95% CI via normal approx; n
// reported so small-n CIs are read with care). slope ~ the growth exponent (1 = linear).
export function olsLogLog(xs, ys, z = 1.959963984540054) {
  const pts = xs.map((x, i) => [Math.log(x), Math.log(ys[i])]).filter(([lx, ly]) => isFinite(lx) && isFinite(ly));
  const n = pts.length;
  if (n < 2) return { slope: NaN, intercept: NaN, r2: NaN, n, slopeSE: NaN, slopeLo: NaN, slopeHi: NaN };
  const mx = mean(pts.map((p) => p[0])), my = mean(pts.map((p) => p[1]));
  let sxx = 0, sxy = 0, syy = 0;
  for (const [x, y] of pts) { sxx += (x - mx) ** 2; sxy += (x - mx) * (y - my); syy += (y - my) ** 2; }
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const r2 = (sxy * sxy) / (sxx * syy);
  // residual standard error → SE of slope
  let sse = 0;
  for (const [x, y] of pts) { const yhat = intercept + slope * x; sse += (y - yhat) ** 2; }
  const slopeSE = n > 2 ? Math.sqrt(sse / (n - 2) / sxx) : NaN;
  return { slope, intercept, r2, n, slopeSE, slopeLo: slope - z * slopeSE, slopeHi: slope + z * slopeSE };
}

export const round = (x, d = 4) => (isFinite(x) ? Number(x.toFixed(d)) : x);

// ---- self-test ----------------------------------------------------------------------------------
const isMain = (() => { try { return fileURLToPath(import.meta.url) === resolve(process.argv[1] || ''); } catch { return false; } })();
if (isMain) {
  const fail = [];
  const approx = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;

  // Wilson: 0/10 → lo 0, hi ≈ 0.2775 (textbook value); 10/10 → hi 1, lo ≈ 0.7225 (symmetry).
  const w0 = wilson(0, 10); if (!(approx(w0.lo, 0) && approx(w0.hi, 0.2775, 2e-3))) fail.push(`wilson(0,10)=${JSON.stringify(w0)}`);
  const w10 = wilson(10, 10); if (!(approx(w10.hi, 1) && approx(w10.lo, 0.7225, 2e-3))) fail.push(`wilson(10,10)=${JSON.stringify(w10)}`);
  // Wilson symmetry: wilson(k,n).hi == 1 - wilson(n-k,n).lo
  const wa = wilson(3, 20), wb = wilson(17, 20); if (!approx(wa.hi, 1 - wb.lo)) fail.push('wilson asymmetry');
  // Rule of three
  if (!approx(ruleOfThree(10000), 0.0003)) fail.push('ruleOfThree');
  // quantile/median on a known set
  if (median([1, 2, 3, 4]) !== 2.5) fail.push('median');
  if (quantile([0, 10, 20, 30, 40], 0.95) !== 38) fail.push(`quantile p95=${quantile([0, 10, 20, 30, 40], 0.95)}`);
  // Cliff's delta: a strictly above b → +1; equal sets → 0
  if (cliffsDelta([5, 6, 7], [1, 2, 3]).delta !== 1) fail.push('cliffs +1');
  if (cliffsDelta([1, 2, 3], [1, 2, 3]).delta !== 0) fail.push('cliffs 0');
  // Bootstrap is deterministic given a seed, and its estimate equals the point estimate.
  const b1 = bootstrapCI([2, 4, 6, 8, 10], mean, { B: 2000, seed: 7 });
  const b2 = bootstrapCI([2, 4, 6, 8, 10], mean, { B: 2000, seed: 7 });
  if (b1.est !== 6 || b1.lo !== b2.lo || b1.hi !== b2.hi) fail.push(`bootstrap nondeterministic/biased=${JSON.stringify(b1)}`);
  if (!(b1.lo < 6 && b1.hi > 6)) fail.push('bootstrap CI does not bracket mean');
  // OLS on a perfect power law y = 3*x^2 → slope 2, r2 1
  const xs = [1, 2, 4, 8, 16, 32], ys = xs.map((x) => 3 * x ** 2);
  const fit = olsLogLog(xs, ys);
  if (!(approx(fit.slope, 2, 1e-6) && approx(fit.r2, 1, 1e-9))) fail.push(`ols slope=${fit.slope} r2=${fit.r2}`);

  if (fail.length) { console.error('STATS SELF-TEST FAILED:\n  ' + fail.join('\n  ')); process.exit(1); }
  console.log('stats self-test: OK (wilson, ruleOfThree, quantile, cliffsDelta, bootstrap[seeded], olsLogLog)');
}
