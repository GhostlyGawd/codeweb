#!/usr/bin/env node
// codeweb screenshot — the demo-shot pipeline, deterministic and staged. Every committed
// screenshot regenerates from the REAL report with one command, at retina scale, in states
// that actually show the product (a selected symbol with its blast lit, a populated
// inspector) instead of default first paints. Layout is seeded, so reruns produce stable
// frames.
//
//   node scripts/screenshot.mjs <report.html> --out <dir> [--prefix shot] [--scale 2]
//
// Emits: <prefix>-findings.png, -graph.png (areas overview), -blast.png (top hotspot
// selected, neighbors lit), -treemap.png, -matrix.png
// Requires playwright + a chromium (PLAYWRIGHT_BROWSERS_PATH or CODEWEB_CHROMIUM).

import { resolve, join } from 'node:path';
import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
let report = null, outDir = 'shots', prefix = 'shot', scale = 2;
for (let i = 0; i < argv.length; i++) {
  const t = argv[i];
  if (t === '--out') outDir = argv[++i];
  else if (t === '--prefix') prefix = argv[++i];
  else if (t === '--scale') scale = parseFloat(argv[++i]) || 2;
  else if (!t.startsWith('-')) report = t;
}
if (!report) { console.error('usage: screenshot.mjs <report.html> --out <dir> [--prefix p] [--scale 2]'); process.exit(2); }

// dev-only dependency, resolved from the CALLER'S cwd (the engine itself stays zero-dep)
let chromium;
try {
  const req = createRequire(join(process.cwd(), 'noop.js'));
  const mod = await import(pathToFileURL(req.resolve('playwright')).href);
  chromium = mod.chromium || (mod.default && mod.default.chromium);
  if (!chromium) throw new Error('no chromium export');
} catch { console.error('playwright not resolvable from cwd — npm i playwright somewhere and run from there (dev-only; the report itself has zero deps)'); process.exit(2); }

function findChromium() {
  if (process.env.CODEWEB_CHROMIUM) return process.env.CODEWEB_CHROMIUM;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (root && existsSync(root)) {
    for (const d of readdirSync(root)) if (d.startsWith('chromium')) {
      const p = join(root, d, 'chrome-linux', 'chrome');
      if (existsSync(p)) return p;
    }
  }
  return undefined; // let playwright resolve its own download
}

mkdirSync(resolve(outDir), { recursive: true });
const VW = 1600, VH = 1000, PANEL = 340;
const browser = await chromium.launch({ executablePath: findChromium() });
const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: scale });
page.on('pageerror', (e) => { console.error('page error: ' + e.message); process.exitCode = 1; });
await page.goto('file://' + resolve(report));
await page.waitForTimeout(800);
// clip = crop to CONTENT (CSS px) — a README thumbnail of a full frame is unreadable; empty
// canvas never ships. Clips are clamped to the viewport.
const shot = (name, clip) => {
  if (clip) {
    const x = Math.max(0, Math.floor(clip.x)), y = Math.max(0, Math.floor(clip.y));
    clip = { x, y, width: Math.min(VW - x, Math.ceil(clip.width)), height: Math.min(VH - y, Math.ceil(clip.height)) };
  }
  return page.screenshot({ path: join(resolve(outDir), `${prefix}-${name}.png`), ...(clip ? { clip } : {}) });
};
const tab = async (v) => { await page.click(`.tab[data-view="${v}"]`); await page.waitForTimeout(700); };
const graphClip = async (pad) => {
  const b = await page.evaluate(() => window.__codewebStage && window.__codewebStage.graphBBox && window.__codewebStage.graphBBox());
  if (!b) return null;
  // graph bbox + header row; always include the inspector column on the right
  return { x: Math.max(0, b.x - pad), y: 0, width: VW - Math.max(0, b.x - pad), height: Math.min(VH, 48 + b.y + b.h + pad) };
};

// 1. findings — first paint, overview card populated by construction
await shot('findings');

// 2. graph — the areas overview, settled, cropped to the drawn content
await tab('graph');
await page.waitForTimeout(3200);
await page.click('#gFit');
await page.waitForTimeout(400);
await shot('graph', await graphClip(40));

// 3. blast — top hotspot selected (zoomed), its area expanded, inspector populated
const staged = await page.evaluate(() => window.__codewebStage ? window.__codewebStage.topHotspot() : null);
if (staged) { await page.waitForTimeout(2600); await shot('blast', await graphClip(24)); }
else console.error('stage hook missing — blast shot skipped (old report build?)');

// 4. treemap — dense edge-to-edge, full frame
await tab('treemap'); await shot('treemap');

// 5. matrix — cropped to the table + legend (it occupies a corner of the full frame)
await tab('matrix');
const mClip = await page.evaluate(() => {
  const t = document.querySelector('table.m'); const l = document.querySelector('#view-matrix .legend');
  if (!t) return null;
  const tr = t.getBoundingClientRect(), lr = l ? l.getBoundingClientRect() : tr;
  return { x: 0, y: 0, width: Math.max(tr.right, lr.right) + 24, height: Math.max(tr.bottom, lr.bottom) + 16 };
});
await shot('matrix', mClip);

await browser.close();
console.log(`[screenshot] ${staged ? 5 : 4} frame(s) -> ${resolve(outDir)}/${prefix}-*.png${staged ? ` (blast: ${staged})` : ''}`);
