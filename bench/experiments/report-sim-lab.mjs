#!/usr/bin/env node
// finding #35 — node-runnable sim lab. The expand-all force simulation (gStep) is inlined in the
// self-contained report; this lab extracts the REAL gStep from report-template.html, builds a
// synthetic expanded W at any scale, runs it to settle, and reports the numbers the fix is judged
// on: settledMsPerStep (mean of the last 10 logical steps), maxSingleTaskMs, step count, and
// cell-occupancy p95 (how compact the equilibrium is). Deterministic — seeded LCG, no Math.random.
//
//   node bench/experiments/report-sim-lab.mjs [--domains 20] [--per-domain 840] [--seed N]
//                                             [--sp 0]   (0 = baseline radius-14 hatch; >0 = spiral SP)
//
// "what ships is tested": the lab re-extracts gStep every run, so a template change is measured as-is.
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = join(HERE, '..', '..', 'scripts', 'report-template.html');

// brace-balance a `function name(...) {...}` out of the template.
export function extractFnSource(name, source) {
  const start = source.indexOf('function ' + name + '(');
  if (start < 0) throw new Error(`template no longer defines function ${name}()`);
  const open = source.indexOf('{', start);
  let depth = 0, i = open;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) { i++; break; }
  }
  return source.slice(start, i);
}

// gStepChunk closes over W and sim in the template; recreate that closure so the extracted body
// runs. Returns a factory (W, sim) -> chunk(deadline). chunk(Infinity) runs one whole logical step
// in one task (returns true); chunk(now+budget) advances one slice and returns false until the step
// completes. The chunker OWNS the alpha decay (one decay per completed logical step).
export function loadGStepChunk(templatePath = TEMPLATE) {
  const src = extractFnSource('gStepChunk', readFileSync(templatePath, 'utf8'));
  return (W, sim) => new Function('W', 'sim', 'return (' + src + ')')(W, sim);
}
// Back-compat alias: a "full logical step" driver used by the determinism tests.
export function loadGStep(templatePath = TEMPLATE) {
  const chunkFactory = loadGStepChunk(templatePath);
  return (W, sim) => { const chunk = chunkFactory(W, sim); return () => { while (!chunk(Infinity)) { /* setup→integrate */ } }; };
}

function lcg(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32; }

// Build a synthetic EXPANDED W (every symbol on canvas — the expand-all state). Domains are placed
// on the collapsed-bubble spiral; each domain's symbols seed around that center. Two seedings:
//   sp === 0 : the baseline radius-14 hatch (mirrors gLayout today) — reproduces the explosion.
//   sp  >  0 : the golden-spiral hatch rad = sp·√k, angle k·2.39996 (T-35.3), near-equilibrium.
// Edges are LCG-sampled, ~6/node, mostly intra-domain (short springs) with some cross-domain.
export function buildSyntheticW({ domains = 20, perDomain = 840, seed = 0xC0FFEE, sp = 0 } = {}) {
  const rnd = lcg(seed);
  const D = domains, P = perDomain, N = D * P;
  const R = Math.max(140, Math.sqrt(D) * 60);
  const nodes = [];
  for (let di = 0; di < D; di++) {
    const a = di * 2.39996, rad = R * Math.sqrt(di / Math.max(1, D));
    const cx = Math.cos(a) * rad, cy = Math.sin(a) * rad;
    for (let j = 0; j < P; j++) {
      const gi = di * P + j;
      const r = Math.max(3.5, Math.min(16, 3 + Math.sqrt((j % 30) + 6)));
      let x, y;
      if (sp > 0) { const ang = j * 2.39996, rr = sp * Math.sqrt(j); x = cx + Math.cos(ang) * rr; y = cy + Math.sin(ang) * rr; }
      else { x = cx + Math.cos(gi * 2.39996) * 14; y = cy + Math.sin(gi * 2.39996) * 14; }
      nodes.push({ id: 'n' + gi, domain: 'd' + di, sym: true, r, x, y, vx: 0, vy: 0, fx: 0, fy: 0 });
    }
  }
  const idx = new Map(nodes.map((n) => [n.id, n]));
  const edges = [];
  for (let i = 0; i < N; i++) {
    const di = Math.floor(i / P), deg = 3 + Math.floor(rnd() * 6);
    for (let k = 0; k < deg; k++) {
      const t = rnd() < 0.85 ? di * P + Math.floor(rnd() * P) : Math.floor(rnd() * N);
      if (t !== i) edges.push({ from: 'n' + i, to: 'n' + t, weight: 1, cross: Math.floor(t / P) !== di });
    }
  }
  return { nodes, edges, idx };
}

// occupancy p95: how many nodes share the busiest cells (a compact equilibrium has LOW spread but
// the near-field grid keeps cells lightly populated; a runaway spread scatters into millions of
// near-empty cells). We report the p95 of per-cell node counts AND the live-cell count + bbox span.
function occupancy(nodes, CUT = 220) {
  const grid = new Map();
  for (const n of nodes) { const key = Math.floor(n.x / CUT) + ':' + Math.floor(n.y / CUT); grid.set(key, (grid.get(key) || 0) + 1); }
  const counts = [...grid.values()].sort((a, b) => a - b);
  const p95 = counts[Math.min(counts.length - 1, Math.floor(0.95 * counts.length))];
  let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
  for (const n of nodes) { a = Math.min(a, n.x); b = Math.min(b, n.y); c = Math.max(c, n.x); d = Math.max(d, n.y); }
  return { p95, liveCells: grid.size, spanX: Math.round(c - a), spanY: Math.round(d - b) };
}

// Run to settle (alpha ≤ 0.02, hard step cap). `makeChunk` is loadGStepChunk's factory; the chunker
// owns the alpha decay. `budgetMs` bounds each uninterruptible task: Infinity = one task per logical
// step; a finite budget times the PRODUCTION slice path. Returns the numbers the #35 receipt gates:
// settledMsPerStep (mean of the last 10 LOGICAL steps), maxSingleTaskMs (the worst single slice),
// firstStepMs, totalSettleMs, steps, and cell occupancy. `positions()` returns the final layout.
export function runToSettle(W, makeChunk, { alphaFloor = 0.02, maxSteps = 600, budgetMs = Infinity } = {}) {
  const sim = { alpha: 1, cur: null, farCoarse: false };
  const chunk = makeChunk(W, sim);
  const stepTimes = [];
  let maxSlice = 0, n = 0;
  const t0 = performance.now();
  while (sim.alpha > alphaFloor && n < maxSteps) {
    const ts = performance.now();
    let done = false;
    while (!done) {
      const s0 = performance.now();
      done = chunk(budgetMs === Infinity ? Infinity : performance.now() + budgetMs);
      const sliceMs = performance.now() - s0;
      if (sliceMs > maxSlice) maxSlice = sliceMs;
    }
    stepTimes.push(performance.now() - ts);
    n++;
  }
  const totalMs = performance.now() - t0;
  const last10 = stepTimes.slice(-10);
  const settledMsPerStep = last10.reduce((a, b) => a + b, 0) / Math.max(1, last10.length);
  return {
    steps: n,
    settledMsPerStep: Math.round(settledMsPerStep * 100) / 100,
    maxSingleTaskMs: Math.round(maxSlice * 100) / 100,
    firstStepMs: Math.round((stepTimes[0] || 0) * 100) / 100,
    totalSettleMs: Math.round(totalMs),
    occupancy: occupancy(W.nodes),
    positions: () => W.nodes.map((nd) => [nd.x, nd.y]),
  };
}

function main() {
  const argv = process.argv.slice(2);
  const num = (flag, def) => { const i = argv.indexOf(flag); return i >= 0 ? Number(argv[i + 1]) : def; };
  const opts = { domains: num('--domains', 20), perDomain: num('--per-domain', 840), seed: num('--seed', 0xC0FFEE), sp: num('--sp', 0) };
  const iBudget = argv.indexOf('--budget');
  const budgetMs = iBudget >= 0 ? Number(argv[iBudget + 1]) : Infinity;
  const W = buildSyntheticW(opts);
  const chunk = loadGStepChunk();
  const r = runToSettle(W, chunk, { budgetMs });
  delete r.positions;
  console.log(`sim lab — ${W.nodes.length} nodes, ${W.edges.length} edges, seeding ${opts.sp > 0 ? 'spiral SP=' + opts.sp : 'baseline hatch-14'}, budget ${budgetMs === Infinity ? '∞' : budgetMs + 'ms'}`);
  console.log(JSON.stringify(r, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
