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
});

test('builder runs and reports the expected page count', () => {
  const r = runNode(BUILD, ['--out', OUT]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /built 5 page\(s\)/);
});

test('emits every page in the information architecture', () => {
  runNode(BUILD, ['--out', OUT]);
  const files = htmlFiles();
  for (const p of ['index.html', 'product.html', 'research.html', 'start.html', 'changelog.html']) {
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
  for (const [f, html] of Object.entries(snapshot())) {
    // links to github.com are allowed (source/releases); no other external hosts or CDNs
    const externals = (html.match(/https?:\/\/[^\s"')]+/g) || [])
      .filter((u) => !u.startsWith('https://github.com/'))
      .filter((u) => !u.startsWith('https://ghostlygawd.github.io/'))
      .filter((u) => !u.startsWith('https://keepachangelog.com/'))
      .filter((u) => !u.startsWith('https://semver.org/'))
      .filter((u) => !u.startsWith('http://www.w3.org/'));
    assert.deepEqual(externals, [], `${f} references unexpected external origins: ${externals.join(', ')}`);
  }
});
