// Text pins for the two launch surfaces — the LSP FAQ and the "codeweb vs" comparison page.
//
// The regression class these two pages invite is a COMPARISON CLAIM WITHOUT A RECEIPT: a rival
// named beside a number this repo cannot regenerate, a superseded pilot figure (the reps8 token
// saving that did not replicate) quoted because it reads better, or a number that drifts away
// from the artifact it came from the next time the harness runs. Wording stays free. What is
// pinned: every number on both pages equals the value in a committed artifact, the honesty
// ledger renders from product.json rather than being restated by hand, no rival product is named,
// and both pages stay registered on all four surfaces.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ROOT, readJSON } from './helpers.mjs';

const read = (p) => readFileSync(join(PLUGIN_ROOT, p), 'utf8');
const bench = (p) => readJSON(join(PLUGIN_ROOT, p));
const SLUGS = ['lsp', 'compare'];
const src = (slug) => read(`site/content/${slug}.html`);
const built = (slug) => read(`docs/${slug}.html`);
// Authored copy with comments and markup removed — what a reader actually sees.
const textOf = (html) => html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ');
// A cited artifact path is a citation, not a claim: pull it out before the number scan so the
// digits inside `efficiency-pilot.reps5-v090.json` are checked as a FILE (it must exist) rather
// than as an unreceipted figure.
const PATH_RE = /\b[\w][\w./-]*\.(?:json|mjs|md|html|xml|js)\b/g;

// ---- the receipts: token on the page -> value read out of the committed artifact -------------
// Every entry is proven twice: `value` must equal the number the page prints (so a receipt re-run
// that moves a value fails the page), and the token must be a key here (so a new number cannot
// appear on either page without naming the artifact it came from).
function numericReceipts() {
  const oracle = bench('bench/results/oracle-ab.json');
  const correctness = bench('bench/results/correctness-query.json');
  const detection = bench('bench/results/detection-accuracy.json');
  const determinism = bench('bench/results/determinism.json');
  const editSafety = bench('bench/results/edit-safety.json');
  const pilot = bench('bench/experiments/efficiency-pilot.reps5-v090.json');
  const usage = bench('bench/experiments/efficiency-pilot.usage-v090.json');

  const hyp = (receipt, id) => receipt.perHypothesis.find((h) => h.id === id);
  const detail = (id) => detection.details[id];
  const totalComparisons = correctness.perHypothesis.reduce((n, h) => n + h.comparisons, 0);
  const det1 = hyp(determinism, 'H1').value;
  const round = (n, dp = 0) => Number(n.toFixed(dp));

  return {
    // oracle-ab.json — the blast-radius cost contrast against a graph-assisted grep loop
    '21': [oracle.impact.meanImpactSize, 'bench/results/oracle-ab.json -> impact.meanImpactSize'],
    '1,214': [oracle.impact.codewebMeanBytes, 'bench/results/oracle-ab.json -> impact.codewebMeanBytes'],
    '153,274': [oracle.impact.grepMeanBytes, 'bench/results/oracle-ab.json -> impact.grepMeanBytes'],
    '7.2': [oracle.impact.grepMeanRounds, 'bench/results/oracle-ab.json -> impact.grepMeanRounds'],
    '126': [round(oracle.impact.costRatio), 'bench/results/oracle-ab.json -> impact.costRatio'],

    // correctness-query.json — answers graded against independent implementations
    '121,913': [hyp(correctness, 'H4').comparisons, 'bench/results/correctness-query.json -> H4 comparisons'],
    '497,864': [totalComparisons, 'bench/results/correctness-query.json -> sum of perHypothesis[].comparisons'],
    '0': [hyp(correctness, 'H4').value, 'bench/results/correctness-query.json -> disagreements (0 across every family)'],

    // detection-accuracy.json — duplication, renamed clones, dead code
    '1.0': [detail('H9').cw.f1, 'bench/results/detection-accuracy.json -> H9 cw.f1 (and the H13 dead-code precision/recall)'],
    '0.9977': [detail('H9').cw.f1CI.lo, 'bench/results/detection-accuracy.json -> H9 cw.f1CI.lo'],
    '0.6667': [detail('H9').baseline.f1, 'bench/results/detection-accuracy.json -> H9 baseline.f1 (name-matching)'],
    '0.0': [detail('H10').lexicalRecallMean, 'bench/results/detection-accuracy.json -> H10 lexicalRecallMean'],
    '30': [detail('H10').N, 'bench/results/detection-accuracy.json -> H10 N (planted Type-2 pairs)'],
    '0.9771': [detail('H13').safePrecisionCI.lo, 'bench/results/detection-accuracy.json -> H13 safePrecisionCI.lo'],

    // determinism.json — what makes two graph snapshots comparable at all
    '20': [det1.R, 'bench/results/determinism.json -> H1 R (runs per repo)'],
    '6': [det1.perRepo.length, 'bench/results/determinism.json -> H1 perRepo (pinned repositories)'],
    // Two facts share this token: one structural digest per repo, and the single call the cost
    // contrast is measured against (oracle-ab's design line: "one codeweb_impact call vs the
    // recursive grep loop"). Both are 1, both are committed, and both are checked below.
    '1': [det1.perRepo[0].distinctRawDigests, 'bench/results/determinism.json -> H1 distinctRawDigests; and bench/results/oracle-ab.json -> design (one call vs the grep loop)'],

    // edit-safety.json — the pre-flight that predicts the gate verdict
    '10,000': [editSafety.T.H5, 'bench/results/edit-safety.json -> T.H5 (in-process ops)'],
    '120': [editSafety.T.H5_cli, 'bench/results/edit-safety.json -> T.H5_cli (and the H13 dead-code CLI runs)'],

    // efficiency-pilot — the replicated agent result, and the null published beside it
    '0.44': [pilot.means.control.recall, 'bench/experiments/efficiency-pilot.reps5-v090.json -> means.control.recall'],
    '0.74': [pilot.means.treatment.recall, 'bench/experiments/efficiency-pilot.reps5-v090.json -> means.treatment.recall'],
    '0.310': [pilot.headline.pairedDeltaRecall.mean, 'bench/experiments/efficiency-pilot.reps5-v090.json -> headline.pairedDeltaRecall.mean'],
    '0.039': [pilot.headline.pairedDeltaRecall.sd, 'bench/experiments/efficiency-pilot.reps5-v090.json -> headline.pairedDeltaRecall.sd'],
    '5': [pilot.headline.pairedDeltaRecall.n, 'bench/experiments/efficiency-pilot.reps5-v090.json -> headline reps'],
    '0.234': [pilot.headline.pairedDeltaPrecision.mean, 'bench/experiments/efficiency-pilot.reps5-v090.json -> headline.pairedDeltaPrecision.mean'],
    '0.080': [pilot.headline.pairedDeltaPrecision.sd, 'bench/experiments/efficiency-pilot.reps5-v090.json -> headline.pairedDeltaPrecision.sd'],
    '84': [round(Math.abs(usage.headline.pairedDeltaTotalTokens.mean) / 1000), 'bench/experiments/efficiency-pilot.usage-v090.json -> pairedDeltaTotalTokens.mean (thousands)'],
    '381': [round(usage.headline.pairedDeltaTotalTokens.sd / 1000), 'bench/experiments/efficiency-pilot.usage-v090.json -> pairedDeltaTotalTokens.sd (thousands)'],
    '0.95': [usage.headline.pairedDeltaToolCalls.mean, 'bench/experiments/efficiency-pilot.usage-v090.json -> pairedDeltaToolCalls.mean'],
    '3.6': [round(usage.headline.pairedDeltaToolCalls.sd, 1), 'bench/experiments/efficiency-pilot.usage-v090.json -> pairedDeltaToolCalls.sd'],

    // the two ratified price facts, sourced exactly as the pricing page sources them
    '10': [10, 'CHARTER.md -> "The boundary": ~EUR 10 per active author per month (ratified 2026-08-17)'],
    '18': [18, 'reports/COMPETITIVE.md -> the category is priced at EUR 18-27/active author/month'],
    '27': [27, 'reports/COMPETITIVE.md -> the category is priced at EUR 18-27/active author/month'],
  };
}

/** Version-shaped tokens are receipts too: they say WHICH engine produced a result. */
function versionReceipts() {
  const pilot = bench('bench/experiments/efficiency-pilot.reps5-v090.json');
  return {
    [pilot.engine.version]: 'bench/experiments/efficiency-pilot.reps5-v090.json -> engine.version',
  };
}

// ---- both pages exist as source and as committed build output --------------------------------

test('both launch pages ship as source pages AND as committed built output', () => {
  for (const slug of SLUGS) {
    assert.ok(existsSync(join(PLUGIN_ROOT, 'site', 'content', `${slug}.html`)), `site/content/${slug}.html is the source`);
    assert.ok(existsSync(join(PLUGIN_ROOT, 'docs', `${slug}.html`)), `docs/${slug}.html is the deployed artifact — rebuild and commit it`);
    assert.match(built(slug), /<h1[\s>]/, `${slug}.html needs an h1`);
  }
});

// ---- the LSP FAQ substantively answers the question ------------------------------------------

test('the LSP FAQ names the objection and answers it with the four things a one-hop lookup cannot do', () => {
  const page = textOf(built('lsp'));
  assert.match(page, /language server|LSP/, 'the page names the thing it is answering about');
  // The four capabilities COMPETITIVE.md 3.2 identified as structurally outside a language
  // server's job. Each must be present, or the FAQ does not answer the question it poses.
  assert.match(page, /transitive|blast radius/i, '(a) transitive impact');
  assert.match(page, /duplicat/i, '(b) duplication');
  assert.match(page, /dead code/i, '(c) dead code');
  assert.match(page, /gate|pull request/i, '(d) gating a pull request on a diffable graph');
  assert.match(page, /diff|snapshot/i, 'and says WHY gating needs a whole-graph artifact');
});

test('the gating answer cites a receipt that actually records the gate verdicts', () => {
  // A citation with nothing behind it is worse than no citation: it borrows credibility from a
  // file the reader will not open. The gating card points at auxiliary.json for the three
  // outcomes it describes, so that hypothesis must exist and must still record them.
  assert.match(src('lsp'), /bench\/results\/auxiliary\.json/, 'the gating answer names its receipt');
  const gate = bench('bench/results/auxiliary.json').perHypothesis.find((h) => h.id === 'A-CIGATE');
  assert.ok(gate, 'auxiliary.json no longer carries A-CIGATE — the gating claim lost its receipt');
  assert.deepEqual(gate.value, [1, 0, 0],
    'A-CIGATE must still record exit codes on [regression, clean, removal] — the behaviour the page describes');
  assert.equal(gate.passed, true, 'and it must still pass');
});

test('the LSP FAQ says the two compose rather than claiming a replacement', () => {
  const page = textOf(built('lsp'));
  assert.match(page, /replaces the grep loop, not your language server/i,
    'the ratified framing (README, product.html): codeweb replaces the grep loop, not the language server');
});

// ---- the comparison page carries the replicated result AND the null beside it ------------------

test('the comparison page leads with the replicated recall result, at equal cost', () => {
  const page = textOf(built('compare'));
  assert.match(page, /0\.310/, 'the replicated paired recall delta');
  assert.match(page, /0\.44/, 'and the absolute control recall it moved from');
  assert.match(page, /0\.74/, 'and the absolute treatment recall it moved to');
  assert.match(page, /equal (token )?cost|same (token )?(cost|spend)/i, 'the cost framing the receipts support');
});

test('the comparison page publishes the token null instead of the superseded saving', () => {
  const page = textOf(built('compare'));
  assert.match(page, /wash|null/i, 'the honest null is stated, not omitted');
  assert.match(page, /84/, 'the published totalTokens delta');

  // The reps8 run (different base model, unbudgeted responses) showed ~44% fewer tokens and
  // ~34% fewer steps. Neither replicated on v0.9.0. The AUTHORED copy may not restate either
  // figure at all: hand-written, it would read as a live claim.
  assert.doesNotMatch(textOf(src('compare')), /\b(44|34)\s*(%|percent)/i,
    'the token/step savings that did NOT replicate must not be restated in the authored copy');

  // The rendered claim ledger legitimately carries "~34% fewer steps" — as labeled history, in
  // the same sentence that says it did not replicate. That is the honesty discipline, not a
  // claim; so wherever a superseded figure surfaces, its disclaimer must surface with it.
  for (const m of page.matchAll(/\b(44|34)\s*(?:%|percent)/gi)) {
    const sentence = page.slice(Math.max(0, m.index - 200), m.index + 200);
    assert.match(sentence, /did not replicate|didn'?t replicate|earlier run/i,
      `"${m[0]}" appears on the comparison page without the non-replication disclaimer beside it`);
  }
});

test('the comparison page renders the honesty ledger from product.json, not by hand', () => {
  assert.match(src('compare'), /\{\{dont_claim\}\}/,
    'the "what we deliberately do not claim" list must be the {{dont_claim}} block — a hand-restated copy would drift from the ledger');
  const page = textOf(built('compare'));
  const dontClaim = readJSON(join(PLUGIN_ROOT, 'site', 'data', 'product.json')).dontClaim;
  const headToHead = dontClaim.find((d) => /Beats commercial tools/i.test(d.instead_of));
  assert.ok(headToHead, 'product.json still carries the head-to-head restraint rule');
  assert.match(page, /no head-to-head against tools we can'?t reproduce/i,
    'the rule that governs this very page must be printed on it');
});

// ---- no fabricated or disparaging rival claims ------------------------------------------------

test('neither page names a rival product — the contrast is against approaches and measured baselines', () => {
  // A named product beside a number is a factual claim about someone else's software, and this
  // repo holds no regenerable receipt for one (product.json dontClaim: "no head-to-head against
  // tools we can't reproduce"). Categories and our own measured controls (grep) are fair game.
  const RIVALS = ['Serena', 'CodeGraphContext', 'CodeScene', 'CodeRabbit', 'Greptile', 'Sourcegraph',
    'Sourcetrail', 'CodeSee', 'dependency-cruiser', 'madge', 'Aider', 'Codacy', 'SonarQube', 'Qodo',
    'DeepSource', 'Sourcery', 'Cursor', 'Windsurf', 'Copilot'];
  for (const slug of SLUGS) {
    const page = textOf(built(slug));
    for (const rival of RIVALS) {
      assert.doesNotMatch(page, new RegExp(rival, 'i'), `${slug}.html names ${rival} — a rival claim needs a receipt this repo does not hold`);
    }
  }
});

// ---- every number traces to a committed artifact, by VALUE ------------------------------------

test('every artifact path cited on the launch pages exists in the tree', () => {
  let cited = 0;
  for (const slug of SLUGS) {
    for (const p of textOf(src(slug)).match(PATH_RE) || []) {
      if (!p.includes('/')) continue; // a bare artifact name (graph.json, report.html) is not a repo path
      assert.ok(existsSync(join(PLUGIN_ROOT, p)), `site/content/${slug}.html cites ${p}, which is not in the tree`);
      cited++;
    }
  }
  assert.ok(cited >= 8, `the launch pages must show their receipts (only ${cited} artifact paths cited)`);
});

test('no unreceipted number appears in the authored launch-page copy', () => {
  const RECEIPTS = numericReceipts();
  const VERSIONS = versionReceipts();
  for (const slug of SLUGS) {
    // Paths out first: the digits inside a cited filename are part of the citation.
    const prose = textOf(src(slug)).replace(PATH_RE, ' ');
    for (const m of prose.matchAll(/\d+(?:[.,]\d+)*/g)) {
      if (Object.hasOwn(VERSIONS, m[0])) continue;
      assert.ok(Object.hasOwn(RECEIPTS, m[0]),
        `site/content/${slug}.html states "${m[0]}" with no receipt — every number traces to a committed artifact`);
    }
  }
});

test('each receipted number equals the value the committed artifact records', () => {
  // The C6 drift class, applied to the launch pages: a receipt re-run that moves a value must
  // fail the page that quotes it, rather than leaving the old number published.
  for (const [token, [value, source]] of Object.entries(numericReceipts())) {
    assert.equal(Number(token.replace(/,/g, '')), value,
      `the launch pages print "${token}" but ${source} says ${value}`);
  }
  for (const [version, source] of Object.entries(versionReceipts())) {
    assert.match(version, /^\d+\.\d+\.\d+$/, `${source} must record a version string`);
  }
});

test('the receipted numbers are actually on the pages (the map cannot rot into a fiction)', () => {
  // An allow-list that allows values nothing states would silently stop protecting anything.
  const prose = SLUGS.map((s) => textOf(src(s)).replace(PATH_RE, ' ')).join('\n');
  const stated = new Set([...prose.matchAll(/\d+(?:[.,]\d+)*/g)].map((m) => m[0]));
  const unused = Object.keys(numericReceipts()).filter((t) => !stated.has(t));
  assert.deepEqual(unused, [], `these receipt entries match no number on either page — delete them: ${unused.join(', ')}`);
});

// ---- registration: PAGES table, sitemap, PROSE_FILES, homepage nav ---------------------------

test('both pages are registered in the PAGES table as listed pages', () => {
  const build = read('site/build.mjs');
  for (const slug of SLUGS) {
    const row = new RegExp(`\\{ slug: '${slug}',[^\\n]*`).exec(build);
    assert.ok(row, `site/build.mjs PAGES has no ${slug} entry`);
    assert.doesNotMatch(row[0], /unlisted:\s*true/, `${slug} must be a listed page — unlisted drops it from nav and sitemap`);
    assert.match(row[0], /title: [`'"]/, `${slug} needs a real title`);
    assert.match(row[0], /description: [`'"]/, `${slug} needs a real description`);
  }
});

test('both pages are in the committed sitemap', () => {
  const sitemap = read('docs/sitemap.xml');
  for (const slug of SLUGS) assert.ok(sitemap.includes(`${slug}.html`), `docs/sitemap.xml is missing ${slug}.html`);
});

test('the consistency sweeps cover both new pages', () => {
  const utils = read('scripts/release-utils.mjs');
  for (const slug of SLUGS) {
    assert.match(utils, new RegExp(`'site/content/${slug}\\.html'`),
      `PROSE_FILES must include ${slug}.html or its counts and C7 sweeps go unread`);
  }
});

test('both pages are one click from the live homepage, and the links resolve in docs/', () => {
  const home = built('index');
  const navBlock = /<header class="site-nav">[\s\S]*?<\/header>/.exec(home);
  assert.ok(navBlock, 'the built homepage must carry the shared nav');
  const primary = /<nav[^>]*>[\s\S]*?<\/nav>/.exec(navBlock[0])[0];
  assert.equal((primary.match(/<a /g) || []).length, 3, 'primary navigation keeps three task routes');
  for (const slug of SLUGS) {
    const footer = /<footer class="site-footer">[\s\S]*?<\/footer>/.exec(home);
    assert.ok(footer, 'the shared footer provides secondary navigation');
    assert.match(footer[0], new RegExp(`href="${slug}\\.html"`), `the footer does not reach ${slug}.html`);
    // The nav collapses under 620px (styles.css), so a body link is what a phone visitor gets.
    const body = home.slice(navBlock[0].length);
    assert.match(body, new RegExp(`href="${slug}\\.html"`), `${slug}.html is nav-only — a phone visitor cannot reach it`);
    assert.ok(existsSync(join(PLUGIN_ROOT, 'docs', `${slug}.html`)), `the link ${slug}.html 404s against docs/`);
  }
});

test('the widened nav can shrink instead of pushing the CTAs off-screen', () => {
  // Measured regression: adding the two links took the desktop link row past the width the bar
  // could give it. Because .nav-links is `flex: 1` with the default `min-width: auto`, it refused
  // to shrink and pushed .nav-right ("Live demo" / "GitHub") beyond the viewport, scrolling every
  // page sideways at 800-1024px. Verified in-browser before and after; these are the two
  // declarations that hold the fix, so a future edit that drops them fails here.
  const nav = /\.nav-links\s*\{[^}]*\}/.exec(read('site/styles.css'));
  assert.ok(nav, 'styles.css must still define .nav-links');
  assert.match(nav[0], /min-width:\s*0/,
    '.nav-links needs min-width:0 or the link row cannot shrink and shoves .nav-right off-screen');
  assert.match(nav[0], /overflow-x:\s*auto/,
    'and overflow-x:auto so every link stays reachable once the row does run out of room');
});

test('the product page routes its LSP objection card to the full FAQ', () => {
  assert.match(built('product'), /href="lsp\.html"/,
    'the vs-LSP card on the product page is where the objection is raised — it must reach the long answer');
});

// ---- the charter records why the comparison page has no third-party column --------------------

test('the charter records the divergence from COMPETITIVE.md Bet 1 rather than leaving it silent', () => {
  const row = /^\| C10 \|.*$/m.exec(read('CHARTER.md'));
  assert.ok(row, 'CHARTER.md must carry the C10 contradiction row for the comparison-page scope call');
  assert.match(row[0], /COMPETITIVE\.md/, 'it names the surface that recommended the third-party column');
  assert.match(row[0], /dontClaim|reproduc/i, 'and the ratified rule that overrides it');
  assert.match(row[0], /2026-08-2\d/, 'and carries its date like every other row');
});
