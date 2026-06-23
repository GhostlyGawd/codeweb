// Tests for the zero-dependency static site builder (site/build.mjs). The site is a
// generated artifact committed to docs/, so determinism matters: the same inputs must
// produce byte-identical output, and no template placeholder may slip through unfilled.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ROOT, runNode } from './helpers.mjs';

const BUILD = join(PLUGIN_ROOT, 'site', 'build.mjs');
const DOCS = join(PLUGIN_ROOT, 'docs');
const htmlFiles = () => readdirSync(DOCS).filter((f) => f.endsWith('.html')).sort();
const snapshot = () => Object.fromEntries(htmlFiles().map((f) => [f, readFileSync(join(DOCS, f), 'utf8')]));

test('builder runs and reports the expected page count', () => {
  const r = runNode(BUILD);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /built 5 page\(s\)/);
});

test('emits every page in the information architecture', () => {
  runNode(BUILD);
  const files = htmlFiles();
  for (const p of ['index.html', 'product.html', 'research.html', 'start.html', 'changelog.html']) {
    assert.ok(files.includes(p), `missing ${p}`);
  }
});

test('output is deterministic — byte-stable across consecutive builds', () => {
  runNode(BUILD);
  const a = snapshot();
  runNode(BUILD);
  const b = snapshot();
  assert.deepEqual(b, a);
});

test('no unfilled template placeholders remain', () => {
  runNode(BUILD);
  for (const [f, html] of Object.entries(snapshot())) {
    assert.ok(!/\{\{[a-zA-Z_]+\}\}/.test(html), `unfilled placeholder in ${f}`);
  }
});

test('every page links the shared stylesheet and sets a canonical URL', () => {
  runNode(BUILD);
  for (const [f, html] of Object.entries(snapshot())) {
    assert.ok(html.includes('assets/site.css'), `${f} missing stylesheet`);
    assert.ok(html.includes('rel="canonical"'), `${f} missing canonical`);
  }
});

test('footer version is in lock-step with package.json', () => {
  runNode(BUILD);
  const version = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'package.json'), 'utf8')).version;
  const home = readFileSync(join(DOCS, 'index.html'), 'utf8');
  assert.ok(home.includes(`codeweb v${version}`), `footer should show v${version}`);
});

test('pages are self-contained — no third-party network origins', () => {
  runNode(BUILD);
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
