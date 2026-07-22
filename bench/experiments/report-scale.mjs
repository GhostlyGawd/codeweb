#!/usr/bin/env node
// Spec L (docs/specs/report-at-scale.md) — measure report.html in a real browser, at any scale.
// The pipeline receipts claim monorepo scale; the report is the surface a human opens. This
// harness loads a built report in headless Chromium and records what the spec's thresholds
// judge: load, time-to-interactive-graph, layout settle, search latency, heap. It MEASURES —
// exit 0 on any completed measurement (red is data, recorded in `verdict`); nonzero only when
// the input is not a codeweb report or the browser can't run.
//
//   node bench/experiments/report-scale.mjs --report <report.html> --out <json> [--label <s>]
//
// Dev-side tool: needs playwright (resolved from CODEWEB_PLAYWRIGHT_DIR, the cwd, or the
// global node_modules) + a chromium (PLAYWRIGHT_BROWSERS_PATH or CODEWEB_CHROMIUM). The engine
// and the report itself stay zero-dependency.

import { readFileSync, writeFileSync, statSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// ---- resolvers (exported: tests skip when playwright is absent) -------------------------------
export function resolvePlaywright() {
  const bases = [process.env.CODEWEB_PLAYWRIGHT_DIR, process.cwd(), resolve(process.execPath, '..', '..', 'lib')]
    .filter(Boolean);
  for (const base of bases) {
    try { return createRequire(join(base, 'noop.js')).resolve('playwright'); } catch { /* next */ }
  }
  return null;
}

export function findChromium() {
  if (process.env.CODEWEB_CHROMIUM) return process.env.CODEWEB_CHROMIUM;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (root && existsSync(root)) {
    for (const d of readdirSync(root)) {
      if (d.startsWith('chromium')) {
        const p = join(root, d, 'chrome-linux', 'chrome');
        if (existsSync(p)) return p;
      }
    }
  }
  return undefined; // let playwright resolve its own download
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Layout settle: the report's force sim decays alpha per rAF tick; we call it settled when the
// drawn bbox stops moving for `stableFor` consecutive polls. Returns ms from `t0`.
async function settle(page, t0, { pollMs = 300, stableFor = 3, timeoutMs = 120000 } = {}) {
  let last = null, stable = 0;
  while (Date.now() - t0 < timeoutMs) {
    const bbox = JSON.stringify(await page.evaluate(() => window.__codewebStage && window.__codewebStage.graphBBox()));
    if (bbox !== 'null' && bbox === last) {
      if (++stable >= stableFor) return { ms: Date.now() - t0 - pollMs * stableFor, settled: true };
    } else stable = 0;
    last = bbox;
    await sleep(pollMs);
  }
  return { ms: Date.now() - t0, settled: false };
}

async function main() {
  const argv = process.argv.slice(2);
  const opt = { report: null, out: null, label: null };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--report') opt.report = resolve(argv[++i]);
    else if (t === '--out') opt.out = resolve(argv[++i]);
    else if (t === '--label') opt.label = argv[++i];
  }
  if (!opt.report || !opt.out) { console.error('usage: report-scale.mjs --report <report.html> --out <json> [--label <s>]'); process.exit(2); }

  const pw = resolvePlaywright();
  if (!pw) { console.error('playwright not resolvable — set CODEWEB_PLAYWRIGHT_DIR or npm i playwright (dev-only; the report has zero deps)'); process.exit(2); }
  const mod = await import(pathToFileURL(pw).href);
  const chromium = mod.chromium || (mod.default && mod.default.chromium);

  const graphPath = join(dirname(opt.report), 'graph.json');
  if (!existsSync(graphPath)) { console.error(`graph.json not found next to the report (${graphPath}) — needed for the stats row`); process.exit(2); }
  const g = JSON.parse(readFileSync(graphPath, 'utf8'));

  // finding #37: as root (CI containers, this build box) bare Chromium refuses to launch —
  // "Running as root without --no-sandbox". Disable the sandbox only then; a no-op for normal runners.
  const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  const browser = await chromium.launch({ executablePath: findChromium(), chromiumSandbox: asRoot ? false : undefined });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 200)));

  console.error(`[report-scale] loading ${opt.report} (${statSync(opt.report).size} bytes)...`);
  await page.goto('file://' + opt.report, { waitUntil: 'load', timeout: 300000 });
  const nav = await page.evaluate(() => {
    const t = performance.getEntriesByType('navigation')[0];
    return t ? { dcl: Math.round(t.domContentLoadedEventEnd), load: Math.round(t.loadEventEnd) } : null;
  });

  const isReport = await page.evaluate(() =>
    !!(document.getElementById('gsearch') && document.querySelector('.tab[data-view="graph"]')));
  if (!isReport) {
    await browser.close();
    console.error('not a codeweb report — no #gsearch / graph tab; refusing to emit timings for it');
    process.exit(2);
  }

  // time-to-interactive-graph: click the tab, wait for the first drawn bbox
  const tGraph = Date.now();
  await page.click('.tab[data-view="graph"]');
  let timeToGraphMs = null;
  while (Date.now() - tGraph < 60000) {
    const ready = await page.evaluate(() => !!(window.__codewebStage && window.__codewebStage.graphBBox()));
    if (ready) { timeToGraphMs = Date.now() - tGraph; break; }
    await sleep(50);
  }
  if (timeToGraphMs == null) {
    await browser.close();
    console.error('graph never became interactive within 60s — the graph tab probe did not fire');
    process.exit(1);
  }
  const lay = await settle(page, tGraph);
  console.error(`[report-scale] graph interactive in ${timeToGraphMs}ms, layout ${lay.settled ? 'settled' : 'STILL MOVING'} at ${lay.ms}ms`);

  // search latency: synchronous input handler (filter + redraw) measured in-page
  const searchMs = await page.evaluate(() => {
    const el = document.getElementById('gsearch');
    const t0 = performance.now();
    el.value = 'a'; // 1-char term = worst-case hit set
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return Math.round((performance.now() - t0) * 10) / 10;
  });
  await page.evaluate(() => {
    const el = document.getElementById('gsearch');
    el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

  // staged blast: the demanding state (top hotspot selected, area expanded, neighbors lit)
  let stagedBlastMs = null;
  const staged = await page.evaluate(() => (window.__codewebStage && window.__codewebStage.topHotspot ? window.__codewebStage.topHotspot() : null));
  if (staged) {
    const tStage = Date.now();
    const s = await settle(page, tStage, { timeoutMs: 60000 });
    stagedBlastMs = s.ms;
  }

  // finding 13(d)/21: the expand-all row — EVERY symbol on canvas, per-frame sim cost. This is
  // the cliff that sat one click past the old green verdict (all-pairs: 1,278ms/frame at 16.3k
  // nodes ≈ 5.5 min of sim CPU per click; the grid layout must keep it inside a frame budget).
  const expandAll = await page.evaluate(() => (window.__codewebStage && window.__codewebStage.expandAll ? window.__codewebStage.expandAll(10) : null));

  // finding #37: one full gDraw at the fitted camera with every symbol on canvas — the draw-loop
  // cost the batched edges + capped labels + hoisted cvColors must keep well under a frame.
  const drawOnceMs = await page.evaluate(() => {
    if (!window.__codewebStage || !window.__codewebStage.drawOnce) return null;
    const fit = document.getElementById('gFit'); if (fit) fit.click();
    return Math.round(window.__codewebStage.drawOnce() * 100) / 100;
  });

  const heapUsedBytes = await page.evaluate(() => (performance.memory && performance.memory.usedJSHeapSize) || null);
  const chromiumVersion = browser.version();
  await browser.close();

  // Spec L thresholds — the receipt judges itself.
  const verdict = {
    timeToGraphOk: timeToGraphMs <= 10000,
    searchOk: searchMs <= 300,
    expandAllOk: !expandAll || expandAll.simMsPerFrame <= 16, // one 60fps frame of sim work
    drawOnceOk: drawOnceMs == null || drawOnceMs <= 100, // finding #37: fitted full draw < 100ms
    crashed: pageErrors.length > 0,
    green: timeToGraphMs <= 10000 && searchMs <= 300 && (!expandAll || expandAll.simMsPerFrame <= 16) && (drawOnceMs == null || drawOnceMs <= 100) && pageErrors.length === 0,
  };

  const row = {
    bench: 'report at scale (Spec L, docs/specs/report-at-scale.md)',
    label: opt.label || `${g.nodes.length} symbols`,
    reportBytes: statSync(opt.report).size,
    graph: { symbols: g.nodes.length, edges: g.edges.length },
    domContentLoadedMs: nav ? nav.dcl : null,
    loadMs: nav ? nav.load : null,
    timeToGraphMs,
    layoutSettleMs: lay.ms,
    layoutSettled: lay.settled,
    searchMs,
    stagedBlastMs,
    expandAll,
    drawOnceMs,
    heapUsedBytes,
    pageErrors,
    chromiumVersion,
    verdict,
  };
  writeFileSync(opt.out, JSON.stringify(row, null, 2) + '\n');
  console.error(`[report-scale] ${verdict.green ? 'GREEN' : 'RED'} -> ${opt.out}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
