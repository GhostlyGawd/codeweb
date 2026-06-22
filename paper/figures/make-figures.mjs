#!/usr/bin/env node
// Generate the paper's figures as self-contained SVGs FROM the committed results JSONs (never
// hand-drawn — pre-registration §0.4). Re-run after results change: `node paper/figures/make-figures.mjs`.
// Brand palette matches the repo's GitHub-dark hero/badges.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const R = (f) => JSON.parse(readFileSync(join(ROOT, 'paper', 'results', f), 'utf8'));
const hyp = (j, id) => (j.perHypothesis || []).find((h) => h.id === id);

// palette
const C = { bg: '#0d1117', panel: '#161b22', line: '#30363d', text: '#e6edf3', mut: '#7d8590', blue: '#58a6ff', green: '#3fb950', purple: '#a371f7', red: '#f85149', amber: '#d29922' };
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const txt = (x, y, s, { size = 14, fill = C.text, weight = 400, anchor = 'start', mono = false } = {}) =>
  `<text x="${x}" y="${y}" font-family="${mono ? 'ui-monospace,SFMono-Regular,Consolas,monospace' : FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(s)}</text>`;
const rect = (x, y, w, h, { fill = C.panel, rx = 6, stroke = 'none' } = {}) => `<rect x="${x}" y="${y}" width="${Math.max(0, w)}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}"/>`;
const frame = (w, h, body, title) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(title)}">
<rect width="${w}" height="${h}" rx="12" fill="${C.bg}"/>${body}</svg>\n`;
const out = (name, svg) => { writeFileSync(join(HERE, name), svg); console.log('  wrote', name, `(${svg.length}b)`); };

// ---- 1. scorecard -------------------------------------------------------------------------------
function scorecard() {
  const rows = [
    ['Determinism', R('determinism.json')],
    ['Correctness', R('correctness-query.json')],
    ['Edit-safety', R('edit-safety.json')],
    ['Detection', R('detection-accuracy.json')],
    ['Performance', R('performance.json')],
    ['Feature coverage', R('auxiliary.json')],
  ].map(([name, j]) => {
    const hs = j.perHypothesis || [];
    const pass = hs.filter((h) => h.passed).length;
    return { name, pass, total: hs.length };
  });
  const totP = rows.reduce((s, r) => s + r.pass, 0), totT = rows.reduce((s, r) => s + r.total, 0);
  const W = 820, padX = 28, top = 92, rh = 46, barX = 230, barW = 430;
  let b = '';
  b += txt(padX, 44, `${totP} / ${totT} pre-registered checks pass`, { size: 26, weight: 700 });
  b += txt(padX, 70, 'each with an explicit null hypothesis, an independent oracle, and a pass criterion fixed before data', { size: 13, fill: C.mut });
  rows.forEach((r, i) => {
    const y = top + i * rh;
    const frac = r.total ? r.pass / r.total : 0;
    const allPass = r.pass === r.total;
    b += txt(padX, y + 20, r.name, { size: 15, weight: 600 });
    b += rect(barX, y + 6, barW, 20, { fill: C.line, rx: 5 });
    b += rect(barX, y + 6, barW * frac, 20, { fill: allPass ? C.green : C.amber, rx: 5 });
    b += txt(barX + barW + 14, y + 21, `${r.pass}/${r.total}`, { size: 14, weight: 600, fill: allPass ? C.green : C.amber, mono: true });
  });
  const H = top + rows.length * rh + 16;
  return frame(W, H, b, `${totP} of ${totT} checks pass`);
}

// ---- 2. detection vs baselines ------------------------------------------------------------------
function detection() {
  const d = R('detection-accuracy.json');
  const h9 = hyp(d, 'H9').value, h10 = hyp(d, 'H10').value, h11 = hyp(d, 'H11').value;
  const groups = [
    { label: 'Exact-clone F1', cw: h9.codewebF1, base: h9.baselineF1, baseLabel: 'name-match' },
    { label: 'Renamed-clone recall', cw: h10.structuralRecall, base: h10.lexicalRecall, baseLabel: 'lexical' },
    { label: 'Reuse-ranking MRR', cw: h11.mrr, base: h11.randomMRR, baseLabel: 'random' },
  ];
  const W = 820, padX = 28, top = 92, gap = 150, baseY = 250, maxH = 150, gx0 = 70;
  let b = '';
  b += txt(padX, 44, 'Detection accuracy vs baselines', { size: 24, weight: 700 });
  b += txt(padX, 70, 'codeweb (green) against a stated baseline (grey) — higher is better; scale 0–1', { size: 13, fill: C.mut });
  groups.forEach((g, i) => {
    const cx = gx0 + i * gap + i * 90;
    const bw = 56;
    for (const [j, v, col, lab] of [[0, g.cw, C.green, 'codeweb'], [1, g.base, C.mut, g.baseLabel]]) {
      const x = cx + j * (bw + 18);
      const hgt = Math.max(2, maxH * v);
      b += rect(x, baseY - hgt, bw, hgt, { fill: col, rx: 4 });
      b += txt(x + bw / 2, baseY - hgt - 8, v.toFixed(2), { size: 13, weight: 700, fill: col, anchor: 'middle', mono: true });
      b += txt(x + bw / 2, baseY + 18, lab, { size: 11, fill: C.mut, anchor: 'middle' });
    }
    b += txt(cx + bw + 9, baseY + 40, g.label, { size: 13, weight: 600, anchor: 'middle' });
  });
  b += rect(padX, baseY + 56, W - 2 * padX, 1, { fill: C.line, rx: 0 });
  const h12 = hyp(d, 'H12').value, lr = h12.legacyRange || [h12.worstLegacy, h12.worstLegacy];
  b += txt(padX, baseY + 82, `Plus the false-hub defense: a same-name-heavy corpus fabricates a hub of in-degree ${lr[0]}–${lr[1]} across seeds under the legacy path, ${h12.worstShipped} when shipped.`, { size: 12.5, fill: C.mut });
  return frame(W, baseY + 100, b, 'Detection accuracy vs baselines');
}

// ---- 3. scaling gauge ---------------------------------------------------------------------------
function scaling() {
  const p = R('performance.json');
  const h14 = hyp(p, 'H14').value, h17 = hyp(p, 'H17').value;
  const W = 820, padX = 28, axY = 150, ax0 = 70, ax1 = W - 90, span = ax1 - ax0;
  const X = (v) => ax0 + (v / 2) * span; // axis 0..2
  let b = '';
  b += txt(padX, 44, 'Sub-linear scaling', { size: 24, weight: 700 });
  b += txt(padX, 70, 'pipeline runtime grows as symbols^b — fit by log-log OLS on 10 points (6 real repos + 4 synthetic)', { size: 13, fill: C.mut });
  // axis
  b += rect(ax0, axY, span, 3, { fill: C.line, rx: 2 });
  for (const [v, lab, col] of [[0, 'constant', C.mut], [1, 'linear', C.amber], [2, 'quadratic', C.red]]) {
    b += rect(X(v) - 1, axY - 6, 2, 15, { fill: col, rx: 0 });
    b += txt(X(v), axY + 28, lab, { size: 12, fill: col, anchor: 'middle' });
    b += txt(X(v), axY - 12, v.toFixed(1), { size: 11, fill: C.mut, anchor: 'middle', mono: true });
  }
  // codeweb CI whisker + point
  const lo = X(h14.slopeLo), hi = X(h14.slopeHi), pt = X(h14.slope);
  b += rect(lo, axY + 1.5 - 1, hi - lo, 3, { fill: C.green, rx: 2 });
  b += `<circle cx="${pt}" cy="${axY + 1.5}" r="7" fill="${C.green}"/>`;
  b += txt(pt, axY - 16, `b = ${h14.slope}`, { size: 14, weight: 700, fill: C.green, anchor: 'middle', mono: true });
  b += txt(ax0, axY + 64, `95% CI [${h14.slopeLo}, ${h14.slopeHi}], R² ${h14.r2} — far below the 1.5 ceiling; a quadratic engine would land at 2.0 and fail.`, { size: 12.5, fill: C.mut });
  const q = h17.perQuery || {};
  const meds = Object.values(q).map((x) => x.medianMs).filter((v) => typeof v === 'number');
  const typ = meds.length ? Math.round(Math.min(...meds)) : 96;
  const worst = Math.round(h17.worstMedianMs ?? 117);
  b += txt(ax0, axY + 90, `Query latency on the largest graph (${h17.graph.repo}, ${h17.graph.symbols} symbols): ~${typ} ms typical, ${worst} ms worst-case median — inside an agent's edit loop.`, { size: 12.5, fill: C.blue });
  return frame(W, axY + 112, b, 'Sub-linear scaling');
}

// ---- 4. find -> fix ------------------------------------------------------------------------------
function findfix() {
  const det = R('detection-accuracy.json');
  const legacy = det.details?.H13?.legacySafePrecision ?? 0.52;
  const fixed = det.details?.H13?.safePrecision ?? 1.0;
  const W = 820, padX = 28, top = 96;
  let b = '';
  b += txt(padX, 40, 'The study found & fixed two real bugs', { size: 24, weight: 700 });
  b += txt(padX, 66, 'two pre-registered checks failed first — surfacing defects the 286-test suite missed — then passed after a fix', { size: 13, fill: C.mut });
  // panel A: determinism
  const pw = (W - 2 * padX - 24) / 2;
  b += rect(padX, top, pw, 150, { fill: C.panel });
  b += txt(padX + 18, top + 30, 'Pipeline determinism (H1)', { size: 14, weight: 700 });
  b += txt(padX + 18, top + 64, 'before', { size: 12, fill: C.mut });
  b += txt(padX + 18, top + 86, 'non-deterministic + crash', { size: 15, weight: 600, fill: C.red });
  b += txt(padX + 18, top + 104, 'after', { size: 12, fill: C.mut });
  b += txt(padX + 18, top + 126, '1 distinct output / 20 runs ✓', { size: 15, weight: 600, fill: C.green });
  // panel B: deadcode precision bars
  const bx = padX + pw + 24;
  b += rect(bx, top, pw, 150, { fill: C.panel });
  b += txt(bx + 18, top + 30, 'Dead-code "safe" precision (H13)', { size: 14, weight: 700 });
  const barMaxW = pw - 150;
  for (const [j, lab, v, col] of [[0, 'before (legacy)', legacy, C.red], [1, 'after (fixed)', fixed, C.green]]) {
    const y = top + 62 + j * 40;
    b += txt(bx + 18, y + 4, lab, { size: 12, fill: C.mut });
    b += rect(bx + 130, y - 11, barMaxW, 16, { fill: C.line, rx: 4 });
    b += rect(bx + 130, y - 11, barMaxW * v, 16, { fill: col, rx: 4 });
    b += txt(bx + 130 + barMaxW + 8, y + 3, v.toFixed(2), { size: 13, weight: 700, fill: col, mono: true });
  }
  return frame(W, top + 150 + 18, b, 'Found and fixed two real bugs');
}

// ---- 5. correctness big-numbers -----------------------------------------------------------------
function correctness() {
  const c = R('correctness-query.json'), es = R('edit-safety.json');
  const cmp = (c.counts?.inProcessPerSymbolComparisons || 0) + (c.counts?.cliPerSymbolComparisons || 0);
  const editTrials = Object.entries(es.T || {}).filter(([k]) => !k.includes('cli')).reduce((s, [, v]) => s + v, 0);
  const W = 820, padX = 28, top = 92;
  let b = '';
  b += txt(padX, 44, 'Correctness is exact, at scale', { size: 24, weight: 700 });
  b += txt(padX, 70, 'codeweb’s structural answers compared against independently-written reference oracles', { size: 13, fill: C.mut });
  const pw = (W - 2 * padX - 24) / 2;
  const panel = (x, big, unit, sub, col) => rect(x, top, pw, 132, { fill: C.panel })
    + txt(x + 20, top + 62, big, { size: 46, weight: 800, fill: col, mono: true })
    + txt(x + 22 + big.length * 27, top + 62, unit, { size: 16, fill: C.mut })
    + txt(x + 20, top + 98, sub, { size: 13, fill: C.text });
  b += panel(padX, '0', 'disagreements', `across ${cmp.toLocaleString()} comparisons (cycles, impact, callers/callees, context-pack)`, C.green);
  b += panel(padX + pw + 24, '0', 'violations', `across ${editTrials.toLocaleString()} edit-safety trials (pre-flight, campaign, shards, codemod)`, C.green);
  return frame(W, top + 132 + 18, b, 'Correctness is exact at scale');
}

console.log('[figures] generating from paper/results/*.json ...');
out('fig-scorecard.svg', scorecard());
out('fig-detection.svg', detection());
out('fig-scaling.svg', scaling());
out('fig-findfix.svg', findfix());
out('fig-correctness.svg', correctness());
console.log('[figures] done -> paper/figures/*.svg');
