// Tests for the zero-dependency static site builder (site/build.mjs). The site is a
// generated artifact committed to docs/, so determinism matters: the same inputs must
// produce byte-identical output, and no template placeholder may slip through unfilled.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ROOT, runNode, tmpDir, cleanup } from './helpers.mjs';

const BUILD = join(PLUGIN_ROOT, 'site', 'build.mjs');
// Round 2, finding #5: tests build into a temp dir, never into tracked docs/ — `npm test` used to
// rewrite docs/changelog.html on every run. The default (no --out -> docs/) path stays covered by
// ci.yml's "Build site" step + its freshness gate.
const OUT = tmpDir('codeweb-site-');
after(() => cleanup(OUT));
const htmlFiles = () => readdirSync(OUT).filter((f) => f.endsWith('.html')).sort();
const snapshot = () => Object.fromEntries(htmlFiles().map((f) => [f, readFileSync(join(OUT, f), 'utf8')]));

const PAGES = ['index.html', 'product.html', 'research.html', 'start.html', 'changelog.html'];

test('--out redirects the whole build', () => {
  const r = runNode(BUILD, ['--out', OUT]);
  assert.equal(r.status, 0, r.stderr);
  for (const p of PAGES) assert.ok(existsSync(join(OUT, p)), `missing ${p} in --out dir`);
  const og = readFileSync(join(OUT, 'assets', 'og.jpg'));
  assert.deepEqual([...og.subarray(0, 3)], [0xff, 0xd8, 0xff], 'Open Graph asset must be a JPEG');
  const home = readFileSync(join(OUT, 'index.html'), 'utf8');
  assert.match(home, /<meta property="og:image" content="[^"]+\/assets\/og\.jpg">/);
  assert.match(home, /<meta property="og:image:width" content="1280">/);
  assert.match(home, /<meta property="og:image:height" content="640">/);
});

test('builder runs and reports the expected page count', () => {
  const r = runNode(BUILD, ['--out', OUT]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /built 8 page\(s\)/); // +case-study (SEO F8) +support (REVENUE §4.3) +downloads (operator, unlisted)
});

test('emits every page in the information architecture', () => {
  runNode(BUILD, ['--out', OUT]);
  const files = htmlFiles();
  for (const p of ['index.html', 'product.html', 'research.html', 'start.html', 'changelog.html', 'case-study.html', 'support.html']) {
    assert.ok(files.includes(p), `missing ${p}`);
  }
});

test('output is deterministic — byte-stable across consecutive builds', () => {
  runNode(BUILD, ['--out', OUT]);
  const a = snapshot();
  runNode(BUILD, ['--out', OUT]);
  const b = snapshot();
  assert.deepEqual(b, a);
});

test('no unfilled template placeholders remain', () => {
  runNode(BUILD, ['--out', OUT]);
  for (const [f, html] of Object.entries(snapshot())) {
    assert.ok(!/\{\{[a-zA-Z_]+\}\}/.test(html), `unfilled placeholder in ${f}`);
  }
});

// COMPREHENSION.md C1: three tool cards on the live product page rendered the literal word
// "undefined" (blurb-vs-desc key drift in product.json). A missing field must fail the BUILD,
// never reach a visitor.
test('no "undefined" ever renders into a page, and every tool card has a description', () => {
  runNode(BUILD, ['--out', OUT]);
  for (const [f, html] of Object.entries(snapshot())) {
    // changelog.html is exempt: its body quotes release history verbatim, which may legitimately
    // name "undefined" (it documents old bugs). Every other page is template+data, where a bare
    // "undefined" is always an interpolation hole.
    if (f === 'changelog.html') continue;
    assert.ok(!/>\s*undefined\s*</.test(html), `literal "undefined" rendered in ${f}`);
  }
  const product = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'site', 'data', 'product.json'), 'utf8'));
  for (const phase of product.toolPhases) {
    for (const t of phase.tools) {
      assert.ok(typeof t.desc === 'string' && t.desc.length > 0, `${t.name} has no desc`);
    }
  }
});

test('every page links the shared stylesheet and sets a canonical URL', () => {
  runNode(BUILD, ['--out', OUT]);
  for (const [f, html] of Object.entries(snapshot())) {
    assert.ok(html.includes('assets/site.css'), `${f} missing stylesheet`);
    assert.ok(html.includes('rel="canonical"'), `${f} missing canonical`);
  }
});

test('footer version is in lock-step with package.json', () => {
  runNode(BUILD, ['--out', OUT]);
  const version = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'package.json'), 'utf8')).version;
  const home = readFileSync(join(OUT, 'index.html'), 'utf8');
  assert.ok(home.includes(`codeweb v${version}`), `footer should show v${version}`);
});

test('pages are self-contained — no third-party network origins', () => {
  runNode(BUILD, ['--out', OUT]);
  // Per-page fetch exemptions. The visitor-facing pages stay fully self-contained; the
  // unlisted operator dashboard's whole purpose is live data from npm's public API. Scoped
  // per page AND per origin so the exemption cannot silently widen.
  const FETCH_EXEMPT = { 'downloads.html': ['https://api.npmjs.org/'] };
  for (const [f, html] of Object.entries(snapshot())) {
    // links to github.com are allowed (source/releases); no other external hosts or CDNs.
    // schema.org / opensource.org / npmjs.com are TEXT references (JSON-LD @context, license
    // and sameAs URLs — SEO F10) — nothing on the page fetches them; the self-contained
    // property this test protects is about network REQUESTS (scripts, styles, images, fonts).
    const externals = (html.match(/https?:\/\/[^\s"')]+/g) || [])
      .filter((u) => !u.startsWith('https://github.com/'))
      .filter((u) => !u.startsWith('https://ghostlygawd.github.io/'))
      .filter((u) => !u.startsWith('https://keepachangelog.com/'))
      .filter((u) => !u.startsWith('https://semver.org/'))
      .filter((u) => !u.startsWith('http://www.w3.org/'))
      .filter((u) => !u.startsWith('https://schema.org'))
      .filter((u) => !u.startsWith('https://opensource.org/'))
      .filter((u) => !u.startsWith('https://www.npmjs.com/'))
      .filter((u) => !(FETCH_EXEMPT[f] || []).some((origin) => u.startsWith(origin)));
    assert.deepEqual(externals, [], `${f} references unexpected external origins: ${externals.join(', ')}`);
  }
});

test('downloads dashboard uses the full package history and excludes incomplete recent days', () => {
  runNode(BUILD, ['--out', OUT]);
  const downloads = readFileSync(join(OUT, 'downloads.html'), 'utf8');
  assert.match(downloads, /FIRST_PUBLISH = '2026-07-19'/);
  assert.match(downloads, /setUTCDate\(cutoff\.getUTCDate\(\) - 3\)/);
  assert.match(downloads, /completed day\(s\) · cutoff/);
  assert.match(downloads, /downloads through/);
  assert.match(downloads, /last 7 completed days/);
  assert.doesNotMatch(downloads, /all-time/);
  assert.match(downloads, /Downloads are package retrievals, not a count of users/);
});
