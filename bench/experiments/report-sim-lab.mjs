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

// gStep closes over W and sim in the template; recreate that closure so the extracted body runs.
export function loadGStep(templatePath = TEMPLATE) {
  const src = extractFnSource('gStep', readFileSync(templatePath, 'utf8'));
  return (W, sim) => new Function('W', 'sim', 'return (' + src + ')')(W, sim);
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

// Run to settle (alpha ≤ 0.02, hard step cap). Returns the fix's judged metrics. `budgetMs` (if set)
// is only used by callers that already wrap a chunker; the plain gStep is one uninterruptible task.
export function runToSettle(W, gStep, { alphaFloor = 0.02, decay = 0.985, maxSteps = 600 } = {}) {
  const sim = { alpha: 1 };
  const step = gStep(W, sim);
  const times = [];
  let n = 0;
  const t0 = performance.now();
  while (sim.alpha > alphaFloor && n < maxSteps) {
    const t = performance.now();
    step();
    times.push(performance.now() - t);
    sim.alpha *= decay;
    n++;
  }
  const totalMs = performance.now() - t0;
  const last10 = times.slice(-10);
  const settledMsPerStep = last10.reduce((a, b) => a + b, 0) / Math.max(1, last10.length);
  return {
    steps: n,
    settledMsPerStep: Math.round(settledMsPerStep * 100) / 100,
    maxSingleTaskMs: Math.round(Math.max(...times) * 100) / 100,
    firstStepMs: Math.round(times[0] * 100) / 100,
    totalSettleMs: Math.round(totalMs),
    occupancy: occupancy(W.nodes),
  };
}

function main() {
  const argv = process.argv.slice(2);
  const num = (flag, def) => { const i = argv.indexOf(flag); return i >= 0 ? Number(argv[i + 1]) : def; };
  const opts = { domains: num('--domains', 20), perDomain: num('--per-domain', 840), seed: num('--seed', 0xC0FFEE), sp: num('--sp', 0) };
  const W = buildSyntheticW(opts);
  const gStep = loadGStep();
  const r = runToSettle(W, gStep);
  console.log(`sim lab — ${W.nodes.length} nodes, ${W.edges.length} edges, seeding ${opts.sp > 0 ? 'spiral SP=' + opts.sp : 'baseline hatch-14'}`);
  console.log(JSON.stringify(r, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
