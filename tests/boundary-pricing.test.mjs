// Text pins for the two public commercial surfaces — the free-forever/Teams boundary page and
// the Teams pricing page — plus the C8 mirror refresh (SPEC.md, docs/ROADMAP.md).
//
// The regression class is a PUBLIC PROMISE going stale or unreceipted: a price on the site with
// no charter ruling behind it, a rival number invented to make the contrast look better, the free
// half of the boundary quietly losing "no accounts / no telemetry / no license keys", or the two
// mirror surfaces drifting back to the superseded distribution trigger that amendment A1 struck.
// Same spirit as charter-amendments.test.mjs: wording is free, the promises and the receipts are
// pinned.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ROOT } from './helpers.mjs';

const read = (p) => readFileSync(join(PLUGIN_ROOT, p), 'utf8');
/** The registered GitHub App's install flow — the one destination every Teams CTA must reach. */
const INSTALL_URL = 'https://github.com/apps/codeweb-teams-dev/installations/new';
const src = { boundary: () => read('site/content/boundary.html'), pricing: () => read('site/content/pricing.html') };
const built = { boundary: () => read('docs/boundary.html'), pricing: () => read('docs/pricing.html') };
// Authored copy with markup and comments removed — what a reader actually sees.
const textOf = (html) => html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ');

// ---- the boundary page: both halves of the contract, on the built site ----------------------

test('the boundary page ships as a source page AND as committed built output', () => {
  assert.ok(existsSync(join(PLUGIN_ROOT, 'site', 'content', 'boundary.html')), 'site/content/boundary.html is the source');
  assert.ok(existsSync(join(PLUGIN_ROOT, 'docs', 'boundary.html')), 'docs/boundary.html is the deployed artifact — rebuild and commit it');
});

test('the boundary page states the free half in the ratified words', () => {
  const page = built.boundary();
  assert.match(page, /free forever/i, 'the contract word itself');
  assert.match(page, /one laptop against one repo is free forever/i, 'the rule, quoted from the charter');
  assert.match(page, /MIT/, 'the license is named');
  for (const promise of [/no accounts?/i, /no telemetry/i, /no license keys?/i]) {
    assert.match(page, promise, `the free half must keep its promise: ${promise}`);
  }
});

test('the boundary page states the paid half — what money buys, and what it never breaks', () => {
  const page = built.boundary();
  assert.match(page, /Teams/, 'the hosted tier is named as the intended paid product');
  assert.match(page, /hosting, multi-repo aggregation, and human attention/i, 'what money buys, in the ratified words');
  assert.match(page, /hosted service/i, 'billing lives in the service, not in this repo');
  assert.match(page, /never breaks (your |a customer's )?local tooling|never breaks[^.]{0,60}CI/i,
    'a payment failure must never break local tooling or CI — the invariant the boundary protects');
});

// ---- the pricing page: the three ratified elements + the sign-up rail -----------------------

test('the pricing page ships as a source page AND as committed built output', () => {
  assert.ok(existsSync(join(PLUGIN_ROOT, 'site', 'content', 'pricing.html')), 'site/content/pricing.html is the source');
  assert.ok(existsSync(join(PLUGIN_ROOT, 'docs', 'pricing.html')), 'docs/pricing.html is the deployed artifact — rebuild and commit it');
});

test('the pricing page carries the price, the seat definition, and the flat-unlimited framing', () => {
  const page = built.pricing();
  assert.match(page, /€10/, '(a) the ratified price');
  assert.match(page, /active author/i, '(b) priced per active author');
  assert.match(page, /90 days/i, '(b) the trailing-90-day window');
  assert.match(page, /default branch/i, '(b) the activity criterion — commits on the gated repos\' default branches');
  assert.match(page, /email/i, '(b) the dedupe key');
  assert.match(page, /login/i, '(b) the dedupe key');
  assert.match(page, /unlimited/i, '(c) flat-unlimited');
  assert.match(page, /credit|meter/i, '(c) contrasted with credit- or usage-metered pricing');
});

test('the price is published as ratified INTENT, not as a live offer', () => {
  // CHARTER.md, "The boundary": the price "becomes a public claim only when the service is real".
  const page = built.pricing();
  assert.match(page, /planned|intent/i, 'the page says the price is planned, not live');
  assert.match(page, /not (a live offer|for sale)|nothing is for sale/i, 'and says nothing is on sale yet');
});

test('the pricing page carries a Teams sign-up rail pointing at the real App install flow', () => {
  // M1 shipped this as a labelled "coming soon" placeholder because the App did not exist yet.
  // It does now (`codeweb-teams-dev`), so the rail is the live acquisition path: every CTA must
  // reach GitHub's own install flow, and none may still advertise itself as unavailable.
  const page = built.pricing();
  const ctas = [...page.matchAll(/<a[^>]*data-cta="teams-install"[^>]*>([\s\S]*?)<\/a>/g)];
  assert.ok(ctas.length >= 1, 'the sign-up/install CTA element must exist and be identifiable by data-cta="teams-install"');

  for (const cta of ctas) {
    const href = /href="([^"]*)"/.exec(cta[0])?.[1] ?? '';
    assert.equal(
      href,
      INSTALL_URL,
      'a Teams CTA must land on the App install flow — a fragment or placeholder href is a dead end',
    );
    // The anchors are live and focusable, so aria-disabled would lie to assistive technology.
    assert.doesNotMatch(cta[0], /aria-disabled/, 'a live CTA must not claim to be disabled');
    assert.doesNotMatch(cta[1], /coming soon/i, 'the install is open — the placeholder wording must go');
  }
  assert.match(page, /github app/i, 'the rail says what installing will mean');
});

test('the pricing page still separates the live install from the not-yet-live price', () => {
  // The honesty risk of opening the CTA: a reader could take an installable App as a live offer.
  // The price stays intent (VAL-GOV-007's ratified framing) even though the App is installable.
  const page = textOf(built.pricing());
  assert.match(page, /not a live offer|nothing (on this page )?is for sale/i, 'the price is still not an offer');
  assert.doesNotMatch(page, /Installation opens when the service does/i, 'the pre-launch rail heading is superseded');
});

// ---- no fabricated rival claims -------------------------------------------------------------

test('the rival contrast names no competitor — category framing only', () => {
  // A named rival plus a number is a factual claim about someone else's product; the repo holds
  // no receipt for one, so the contrast stays categorical.
  const page = textOf(built.pricing());
  for (const rival of ['CodeRabbit', 'Greptile', 'CodeScene', 'Sourcegraph', 'Codacy', 'SonarQube', 'Qodo', 'DeepSource', 'Sourcery']) {
    assert.doesNotMatch(page, new RegExp(rival, 'i'), `${rival} is named on the pricing page — a rival claim needs a receipt this repo does not hold`);
  }
});

test('the category price anchor cites the in-repo scan that recorded it', () => {
  const page = built.pricing();
  if (!/18/.test(textOf(page))) return; // the anchor is optional copy; if it is stated, it is sourced
  assert.match(page, /reports\/COMPETITIVE\.md/, 'the €18–27 category range must point at the committed competitive scan');
  assert.ok(existsSync(join(PLUGIN_ROOT, 'reports', 'COMPETITIVE.md')), 'the cited receipt must exist in the tree');
  assert.match(read('reports/COMPETITIVE.md'), /€18[–-]27/, 'and must actually record the stated range');
});

// ---- every number on both pages traces to a receipt ------------------------------------------

test('no unreceipted number appears in the authored boundary/pricing copy', () => {
  // Each allowed token names the committed artifact that backs it. The shared chrome (nav,
  // footer version, JSON-LD) is common to every page and already gated by check-consistency;
  // this pin covers the copy these two pages add.
  const RECEIPTS = {
    10: 'CHARTER.md — "The boundary": ~€10 per active author per month (ratified 2026-08-17)',
    90: 'CHARTER.md — "The boundary": an author being one who committed in the trailing 90 days',
    18: 'reports/COMPETITIVE.md — the category is priced at €18–27/active author/month',
    27: 'reports/COMPETITIVE.md — the category is priced at €18–27/active author/month',
  };
  for (const [name, get] of [['boundary', src.boundary], ['pricing', src.pricing]]) {
    for (const m of textOf(get()).matchAll(/\d+(?:[.,]\d+)*/g)) {
      assert.ok(Object.hasOwn(RECEIPTS, m[0]),
        `site/content/${name}.html states "${m[0]}" with no receipt — every number traces to a committed artifact`);
    }
  }
});

// ---- registration: the build table, the sitemap, the homepage nav ---------------------------

test('both pages are registered in the PAGES table as listed pages', () => {
  const build = read('site/build.mjs');
  for (const slug of ['pricing', 'boundary']) {
    const row = new RegExp(`\\{ slug: '${slug}',[^\\n]*`).exec(build);
    assert.ok(row, `site/build.mjs PAGES has no ${slug} entry`);
    assert.doesNotMatch(row[0], /unlisted:\s*true/, `${slug} must be a listed page — unlisted drops it from nav and sitemap`);
    assert.match(row[0], /title: [`'"]/, `${slug} needs a real title`);
    assert.match(row[0], /description: [`'"]/, `${slug} needs a real description`);
  }
});

test('both pages are in the committed sitemap', () => {
  const sitemap = read('docs/sitemap.xml');
  for (const slug of ['pricing', 'boundary']) {
    assert.ok(sitemap.includes(`${slug}.html`), `docs/sitemap.xml is missing ${slug}.html`);
  }
});

test('the homepage nav reaches both pages, and the links resolve in docs/', () => {
  const home = read('docs/index.html');
  const navBlock = /<header class="site-nav">[\s\S]*?<\/header>/.exec(home);
  assert.ok(navBlock, 'the built homepage must carry the shared nav');
  for (const slug of ['pricing', 'boundary']) {
    assert.match(navBlock[0], new RegExp(`href="${slug}\\.html"`), `the homepage nav does not reach ${slug}.html`);
    assert.ok(existsSync(join(PLUGIN_ROOT, 'docs', `${slug}.html`)), `the nav link ${slug}.html 404s against docs/`);
  }
});

test('the consistency sweeps cover both new pages', () => {
  const utils = read('scripts/release-utils.mjs');
  for (const slug of ['pricing', 'boundary']) {
    assert.match(utils, new RegExp(`'site/content/${slug}\\.html'`), `PROSE_FILES must include ${slug}.html or its counts and C7 sweeps go unread`);
  }
});

// ---- C8: the two mirror surfaces no longer restate the superseded non-goal 5 ------------------

const live = (text) => text.replace(/~~[\s\S]*?~~/g, ' '); // struck text stays visible but is not a live rule

test('C8: SPEC.md no longer gates the Teams tier behind the distribution trigger', () => {
  const spec = live(read('SPEC.md'));
  assert.doesNotMatch(spec, /No hosted "Teams" build before the distribution trigger/,
    'the superseded non-goal must not survive as a live rule in the spec');
  assert.doesNotMatch(spec, /waits behind the distribution trigger/i,
    'the "Buyer and the first dollar" mirror must not restate the struck trigger either');
  assert.match(spec, /A1|2026-08-1[78]/, 'the refresh points at the amendment that authorized it');
  assert.match(spec, /No VS Code Marketplace publish/, 'non-goal 6 survives the refresh — only non-goal 5 moved');
  assert.match(spec, /No accounts, telemetry, or license keys in the local product, ever\./,
    'the local-product invariant stands: Teams is a separate hosted service');
});

test('C8: docs/ROADMAP.md no longer parks the Teams build or the boundary statement', () => {
  const roadmap = live(read('docs/ROADMAP.md'));
  assert.doesNotMatch(roadmap, /parked behind the distribution trigger/i, 'the boundary statement is published, not parked');
  const notNow = /## Not now([\s\S]*?)(?=\n## |$)/.exec(roadmap);
  assert.ok(notNow, 'docs/ROADMAP.md keeps its "Not now" section');
  assert.doesNotMatch(notNow[1], /Teams build/, 'the Teams build is green-lit — it cannot still be listed as not-now');
  assert.match(notNow[1], /VS Code Marketplace/, 'the Marketplace ban stays not-now (non-goal 6, reaffirmed)');
  assert.match(roadmap, /2026-08-1[78]/, 'the refresh is dated like every other correction in the file');
});

test('C8: the charter records the contradiction as resolved, not still-open drift', () => {
  const charter = read('CHARTER.md');
  const row = /^\| C8 \|.*$/m.exec(charter);
  assert.ok(row, 'CHARTER.md lost its C8 contradiction row');
  assert.match(row[0], /Resolved/i, 'C8 is closed once the mirrors are refreshed');
  assert.match(row[0], /2026-08-1[78]/, 'the resolution carries its date');
  assert.match(row[0], /SPEC\.md/, 'and names the surfaces that were refreshed');
  assert.match(row[0], /ROADMAP\.md/, 'and names the surfaces that were refreshed');
});
