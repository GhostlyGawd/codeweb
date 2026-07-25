// Brand sync — the visual surfaces are one system, enforced.
// The rebrand drifted once: the site was redesigned while the report template, the committed
// demo, the README screenshots, and the brand SVGs kept the old look. Each test here turns one
// of those drifts into a CI failure instead of a reviewer's memory. The invariant: everything a
// visitor sees — report UI, live demo, screenshots, README art, site art — derives from the
// same tokens and the same template, and derived artifacts are regenerated when the source moves.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ROOT } from './helpers.mjs';

const read = (...p) => readFileSync(join(PLUGIN_ROOT, ...p), 'utf8');
const TEMPLATE = read('scripts', 'report-template.html');
const DEMO = read('docs', 'demo', 'index.html');

// ---- B1: the report and the site share the core token values ---------------------------------
const CORE_TOKENS = ['#060608', '#0D0D11', '#131318', '#26242C', '#E8E7EE', '#8A8794', '#C6F24E'];
test('B1: report template and site tokens carry the same core palette values', () => {
  const site = read('site', 'tokens.css');
  for (const tok of CORE_TOKENS) {
    const re = new RegExp(tok, 'i');
    assert.match(TEMPLATE, re, `report template is missing brand token ${tok}`);
    assert.match(site, re, `site/tokens.css is missing brand token ${tok}`);
  }
});

// ---- B2: template brand invariants ------------------------------------------------------------
test('B2: report template stays square, mono, and dark-by-default', () => {
  assert.ok(TEMPLATE.includes('border-radius:0 !important'), 'square-corners kill switch present');
  assert.match(TEMPLATE, /var UIFONT = 'ui-monospace/, 'canvas labels use the mono stack');
  assert.ok(!/prefers-color-scheme:\s*light\)\s*\{\s*:root:not\(\[data-theme\]\)/.test(TEMPLATE),
    'dark is the default — the OS light preference applies only under data-theme="auto"');
});

// ---- B3: the committed demo was generated from the CURRENT template ---------------------------
// build-report embeds the template verbatim; the site build only touches the topbar HTML and the
// <head> identity block. So the demo's <style> and main <script> must be byte-identical to the
// template's — if they aren't, the demo predates a template change.
const REGEN = 'regenerate: node scripts/build-report.mjs docs/demo/axios.graph.json --out docs/demo/index.html --no-md ' +
  '&& node site/build.mjs (discard the graph.json meta.generatedAt churn), then re-shoot assets/screens and run node scripts/stamp-screens.mjs';
function styleBlock(html) { return html.slice(html.indexOf('<style>'), html.indexOf('</style>')); }
function mainScript(html) { const m = /<script>\n([\s\S]*?)\n<\/script>/.exec(html); return m && m[1]; }
test('B3: docs/demo/index.html embeds the current report template (style + script parity)', () => {
  assert.equal(styleBlock(DEMO), styleBlock(TEMPLATE), `demo <style> differs from the template — ${REGEN}`);
  assert.ok(mainScript(TEMPLATE), 'template main script found');
  assert.equal(mainScript(DEMO), mainScript(TEMPLATE), `demo <script> differs from the template — ${REGEN}`);
});

// ---- B4: retired palettes may not reappear on any authored surface ----------------------------
// Every hex the brand has retired (the categorical DOMC set, the status traffic lights, the
// GitHub-dark era, the crafted-dark era) plus the old canvas rgba triplets. CHANGELOG is
// history and exempt; docs/ is generated from the scanned sources.
const BANNED_HEX = [
  '3987e5', '008300', 'd55181', 'c98500', '199e70', 'd95926', '9085e9', 'e66767',
  'fab219', 'ec835a', 'd03b3b', '0ca30c',
  '0d1117', '11161f', '161b22', '30363d', '58a6ff', 'a371f7', '3fb950', 'ff5c5c', 'ffb65c', '8b949e', 'e6edf3',
  'a78bfa', '4fd6c4', '9c99a6', '0d0c11', '16131d', '100e14', '14121a', '1a1820', '232029', '322e3a',
  'ff5d5d', 'ffb14e', 'e8c44e', '5bd17a', 'e7f6bf', 'ffd2d0', '1f1216', '6a6775', 'cfcdd6',
  'ffcf9e', 'b7e9c4',
];
const BANNED_RGB = ['236,131,90', '156,153,166', '57,135,229', '25,158,112'];
function brandSurfaces() {
  const files = [
    'README.md', join('assets', 'brand', 'README.md'),
    join('scripts', 'report-template.html'),
    join('site', 'build.mjs'), join('site', 'tokens.css'), join('site', 'styles.css'),
  ];
  for (const f of readdirSync(join(PLUGIN_ROOT, 'site', 'content'))) if (f.endsWith('.html')) files.push(join('site', 'content', f));
  for (const f of readdirSync(join(PLUGIN_ROOT, 'site', 'assets'))) if (/\.(js|css)$/.test(f)) files.push(join('site', 'assets', f));
  for (const f of readdirSync(join(PLUGIN_ROOT, 'assets', 'brand'))) if (f.endsWith('.svg')) files.push(join('assets', 'brand', f));
  return files;
}
test('B4: no retired palette hex or rgba survives on an authored brand surface', () => {
  for (const rel of brandSurfaces()) {
    const src = read(rel);
    for (const hex of BANNED_HEX) {
      assert.ok(!new RegExp('#' + hex, 'i').test(src), `${rel} carries retired color #${hex}`);
    }
    for (const rgb of BANNED_RGB) {
      assert.ok(!src.includes(`(${rgb},`) && !src.includes(`(${rgb})`), `${rel} carries retired rgba ${rgb}`);
    }
  }
});

// ---- B5: brand art obeys the shape law --------------------------------------------------------
test('B5: brand SVGs are square-language (no circles, ellipses, or rounded rects); injected nav has no pills', () => {
  for (const f of readdirSync(join(PLUGIN_ROOT, 'assets', 'brand'))) {
    if (!f.endsWith('.svg')) continue;
    const src = read('assets', 'brand', f);
    assert.ok(!src.includes('<circle'), `assets/brand/${f} contains a <circle>`);
    assert.ok(!src.includes('<ellipse'), `assets/brand/${f} contains an <ellipse>`);
    assert.ok(!/\brx="/.test(src), `assets/brand/${f} contains a rounded rect (rx=)`);
  }
  const build = read('site', 'build.mjs');
  const wm = /const wm = [\s\S]*?<!--\\\/cw-nav-->/.exec(build) || /const wm = [\s\S]*?cw-nav-->`;/.exec(build);
  assert.ok(wm, 'injected demo nav found in site/build.mjs');
  assert.ok(!wm[0].includes('border-radius'), 'injected demo nav must not reintroduce rounded pills');
});

// ---- B6: screenshots are stamped against the template they were shot from ---------------------
test('B6: assets/screens were re-verified after the last report-template change (stamp matches)', () => {
  const stampPath = join(PLUGIN_ROOT, 'assets', 'screens', '.template-stamp');
  assert.ok(existsSync(stampPath), 'assets/screens/.template-stamp missing — shoot screenshots, then: node scripts/stamp-screens.mjs');
  const stamp = readFileSync(stampPath, 'utf8').trim();
  const now = createHash('sha256').update(TEMPLATE).digest('hex');
  assert.equal(stamp, now,
    'scripts/report-template.html changed after the committed screenshots were taken. ' +
    'Re-shoot assets/screens from docs/demo (LOOK at every image), regenerate the demo if needed, then: node scripts/stamp-screens.mjs');
});

// ---- B7: numeric captions match the committed demo graph (receipts, not vibes) ----------------
test('B7: every "N symbols … M domains" and "N callers" caption matches docs/demo/axios.graph.json', () => {
  const g = JSON.parse(read('docs', 'demo', 'axios.graph.json'));
  const nodes = g.nodes.length;
  const domains = (g.domains && g.domains.length) || new Set(g.nodes.map((n) => n.domain)).size;
  const axiosErrorCallers = g.edges.filter((e) => e.to === 'core/AxiosError.js:AxiosError').length;
  const pages = ['README.md', join('site', 'content', 'index.html'), join('site', 'content', 'start.html'), join('site', 'content', 'case-study.html')];
  let checked = 0;
  for (const rel of pages) {
    const src = read(rel);
    for (const m of src.matchAll(/(\d[\d,]*) (?:product )?symbols(?:,| across) (\d+) domains/g)) {
      assert.equal(Number(m[1].replace(/,/g, '')), nodes, `${rel} says "${m[0]}" but the demo graph has ${nodes} symbols`);
      assert.equal(Number(m[2]), domains, `${rel} says "${m[0]}" but the demo graph has ${domains} domains`);
      checked++;
    }
    for (const m of src.matchAll(/(\d+) callers across the domains/g)) {
      assert.equal(Number(m[1]), axiosErrorCallers, `${rel} claims ${m[1]} AxiosError callers; the graph has ${axiosErrorCallers}`);
      checked++;
    }
  }
  assert.ok(checked >= 3, `expected the captions to be present somewhere (checked ${checked})`);
});

// ---- B8: every image the README and site reference actually exists ----------------------------
test('B8: no dead image references in README or site content', () => {
  for (const m of read('README.md').matchAll(/src="(assets\/[\w\-/.]+)"/g)) {
    assert.ok(existsSync(join(PLUGIN_ROOT, m[1])), `README references missing image ${m[1]}`);
  }
  for (const f of readdirSync(join(PLUGIN_ROOT, 'site', 'content'))) {
    if (!f.endsWith('.html')) continue;
    for (const m of read('site', 'content', f).matchAll(/src="assets\/([\w\-.]+)"/g)) {
      const name = m[1];
      const found = ['assets/screens', 'assets/brand', 'site/assets', 'docs/assets']
        .some((dir) => existsSync(join(PLUGIN_ROOT, dir, name)));
      assert.ok(found, `site/content/${f} references assets/${name}, which no source directory provides`);
    }
  }
});
