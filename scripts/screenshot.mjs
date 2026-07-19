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
const browser = await chromium.launch({ executablePath: findChromium() });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: scale });
page.on('pageerror', (e) => { console.error('page error: ' + e.message); process.exitCode = 1; });
await page.goto('file://' + resolve(report));
await page.waitForTimeout(800);
const shot = (name) => page.screenshot({ path: join(resolve(outDir), `${prefix}-${name}.png`) });
const tab = async (v) => { await page.click(`.tab[data-view="${v}"]`); await page.waitForTimeout(700); };

// 1. findings — first paint, overview card populated by construction
await shot('findings');

// 2. graph — the areas overview, settled
await tab('graph');
await page.waitForTimeout(3200);
await page.click('#gFit');
await page.waitForTimeout(400);
await shot('graph');

// 3. blast — expand the top hotspot's area, select it, neighbors lit, inspector populated
await page.evaluate(() => {
  const hits = window.__codewebStage && window.__codewebStage.topHotspot();
  return hits;
});
const staged = await page.evaluate(() => window.__codewebStage ? window.__codewebStage.topHotspot() : null);
if (staged) { await page.waitForTimeout(2600); await page.click('#gFit'); await page.waitForTimeout(400); await shot('blast'); }
else console.error('stage hook missing — blast shot skipped (old report build?)');

// 4-5. treemap + matrix
await tab('treemap'); await shot('treemap');
await tab('matrix'); await shot('matrix');

await browser.close();
console.log(`[screenshot] ${staged ? 5 : 4} frame(s) -> ${resolve(outDir)}/${prefix}-*.png${staged ? ` (blast: ${staged})` : ''}`);
