// Growth playbook Batch 6 — SEO/discoverability (SEO.md F2, F4-F11): the site gets a crawl path
// in, the most-shared URL unfurls, and the two missing shelf manifests exist. Presence contracts
// over the BUILT site (docs/ is the deploy root — run site/build.mjs before this suite; CI's
// docs-fresh gate already enforces that).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { PLUGIN_ROOT, readJSON } from './helpers.mjs';

const read = (p) => readFileSync(join(PLUGIN_ROOT, p), 'utf8');

test('F6: robots.txt + sitemap.xml exist, and internal markdown is excluded from crawl', () => {
  assert.ok(existsSync(join(PLUGIN_ROOT, 'docs', 'robots.txt')), 'robots.txt is emitted by the build');
  const robots = read('docs/robots.txt');
  assert.match(robots, /Sitemap: https:\/\/.*sitemap\.xml/, 'robots names the sitemap');
  assert.match(robots, /Disallow: \/\*\.md\$/, 'internal working documents are not crawl bait');
  assert.match(robots, /Disallow: \/(decisions|specs)\//, 'spec dirs excluded');
  const sitemap = read('docs/sitemap.xml');
  for (const path of ['product.html', 'research.html', 'start.html', 'changelog.html', 'demo/', 'case-study.html']) {
    assert.ok(sitemap.includes(path), `sitemap lists ${path}`);
  }
});

test('F6b: the IndexNow key deploys with the site and matches the committed key', () => {
  const key = read('site/indexnow-key.txt').trim();
  assert.match(key, /^[a-f0-9]{32}$/, 'key is 32 hex chars');
  assert.ok(existsSync(join(PLUGIN_ROOT, 'docs', `${key}.txt`)), 'the build emits the key file at the site root');
  assert.equal(read(`docs/${key}.txt`).trim(), key, 'file content is the key itself (the IndexNow ownership proof)');
});

test('F6c: search engines get pinged on every site deploy, no account needed', () => {
  const wf = read('.github/workflows/indexnow.yml');
  assert.match(wf, /api\.indexnow\.org/, 'posts to the shared IndexNow endpoint (Bing, Yandex, and the rest)');
  assert.match(wf, /docs\/\*\*/, 'fires when the deployed site changes');
  assert.match(wf, /sitemap\.xml/, 'submits the URLs the sitemap already declares');
});

test('F5: the demo — the most-shared URL — finally unfurls', () => {
  const demo = read('docs/demo/index.html');
  assert.match(demo, /<title>[^<]*axios[^<]*<\/title>/i, 'the title says what the demo IS');
  assert.match(demo, /meta name="description"/, 'meta description present');
  assert.match(demo, /property="og:image"/, 'shares render the graph card, not a grey stub');
  assert.match(demo, /rel="canonical"/, 'canonical URL declared');
});

test('F7/F9: built pages carry search vocabulary and every page has an h1', () => {
  assert.match(read('docs/index.html'), /<title>[^<]*(call graph|codebase map)[^<]*<\/title>/i, 'the homepage title carries a searched phrase');
  for (const p of ['start', 'product', 'research', 'changelog', 'case-study']) {
    assert.match(read(`docs/${p}.html`), /<h1[\s>]/, `${p}.html has an h1`);
  }
});

test('F10/F11: JSON-LD structured data + OG image dimensions', () => {
  const index = read('docs/index.html');
  assert.match(index, /application\/ld\+json/, 'SoftwareApplication JSON-LD emitted');
  assert.match(index, /"@type":\s*"SoftwareApplication"/);
  assert.match(index, /og:image:width/, 'declared dimensions for slow scrapers');
  assert.match(index, /og:image:alt/, 'alt on the share image');
});

test('F2: server.json exists for the MCP registry and tracks the package version', () => {
  const p = join(PLUGIN_ROOT, 'server.json');
  assert.ok(existsSync(p), 'the canonical MCP shelf needs its manifest');
  const server = readJSON(p);
  const pkg = readJSON(join(PLUGIN_ROOT, 'package.json'));
  assert.equal(server.name, 'io.github.ghostlygawd/codeweb');
  assert.equal(server.version, pkg.version, 'version stays in lock-step with the package');
  assert.ok(JSON.stringify(server).includes('@ghostlygawd/codeweb'), 'points at the npm package');
});

test('F4: npm metadata carries the category keywords for the next publish', () => {
  const pkg = readJSON(join(PLUGIN_ROOT, 'package.json'));
  for (const k of ['mcp-server', 'model-context-protocol', 'static-analysis']) {
    assert.ok(pkg.keywords.includes(k), `keywords include ${k}`);
  }
  assert.match(pkg.description, /MCP/, 'the description says the category word');
});

test('F8: the case study is a real built page, not stranded markdown', () => {
  const cs = read('docs/case-study.html');
  assert.match(cs, /axios/i);
  assert.match(cs, /3 (real|confirmed) duplications?/i, 'the rankable claim is the title story');
});

test('F6d: the Search Console ownership proof rides the shared head — dropping it would silently unverify the property', () => {
  assert.match(read('docs/index.html'), /<meta name="google-site-verification" content="[\w-]{20,}"/, 'the verification meta tag is served at the property root');
});

test('F1b: repo About settings are code — the workflow applies what the JSON declares', () => {
  const cfg = readJSON(join(PLUGIN_ROOT, '.github', 'repo-settings.json'));
  assert.match(cfg.description, /call\/import graph/, 'description carries the CRO wording');
  assert.equal(cfg.homepage, 'https://ghostlygawd.github.io/codeweb/');
  assert.ok(cfg.topics.includes('mcp-server') && cfg.topics.length >= 10, 'the SEO topic set rides along');
  assert.ok(cfg.topics.every((t) => /^[a-z0-9-]+$/.test(t)), 'every topic is GitHub-valid (lowercase, hyphens)');
  const wf = read('.github/workflows/repo-settings.yml');
  assert.match(wf, /repo-settings\.json/, 'the JSON is the source of truth');
  assert.match(wf, /REPO_SETTINGS_TOKEN/, 'gated on the owner-created secret');
  assert.match(wf, /\/topics/, 'applies topics, not just the PATCH fields');
});

test('F1: the zero-code operator actions are written down where the operator will find them', () => {
  const ops = read('OPERATOR-ACTIONS.md');
  assert.match(ops, /topics/i, 'GitHub topics list');
  assert.match(ops, /mcp-server/, 'includes the topic strings to paste');
  assert.match(ops, /Search Console/i, 'sitemap submission step');
  assert.match(ops, /mcp-publisher|registry\.modelcontextprotocol/i, 'registry publish step');
});
