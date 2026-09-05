// Text pins for the gate-led repositioning of the two hero surfaces — README.md and the site
// homepage. Charter C2 and non-goal 10 demote the human-facing map to a supporting view; the
// deterministic regression gate is what leads the story.
//
// The regression class is ORDER, not wording: a later edit reflowing the README or the homepage
// and quietly putting the map back on top, or dropping the boundary link that ties the free
// product to its published contract. Wording stays free — the pins are the lead position, the
// gate's stated semantics, the identity line, and the links.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ROOT } from './helpers.mjs';

const read = (p) => readFileSync(join(PLUGIN_ROOT, p), 'utf8');
const IDENTITY = 'See what your AI edits affect.';
// The mission's ratified positioning line. Case-insensitive: the site sets it in caps via CSS,
// the README writes it in sentence case.
const GATE_LEAD = /Structural checks for AI code changes/i;
const BOUNDARY_URL = 'https://ghostlygawd.github.io/codeweb/boundary.html';

/** Index of a marker, asserting presence first so a failure names what is missing. */
function at(text, marker, where) {
  const i = typeof marker === 'string' ? text.indexOf(marker) : text.search(marker);
  assert.notEqual(i, -1, `${where}: missing ${marker}`);
  return i;
}

const stripTags = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
// Markdown hard-wraps mid-sentence, so a quoted phrase can straddle a newline. Phrase pins run
// against the reflowed text; only ORDER pins run against the raw file.
const reflow = (md) => md.replace(/\s+/g, ' ');

// ---- README: the gate leads, the map supports -------------------------------------------------

test('README puts the gate lead between the identity line and any map-led narrative', () => {
  const readme = read('README.md');
  const identity = at(readme, IDENTITY, 'README.md');
  const gate = at(readme, GATE_LEAD, 'README.md');
  assert.ok(identity < gate, 'the ratified identity line still opens the README');
  // Every map/graph exploration surface must sit BELOW the gate lead.
  for (const mapMarker of ['codeweb reads your code', '## See it in action', '### Navigate the whole system']) {
    const map = at(readme, mapMarker, 'README.md');
    assert.ok(gate < map, `the gate lead must precede the map-led section "${mapMarker}" (charter C2 / non-goal 10)`);
  }
});

test('the README gate lead states the verdict, its three blockers, and its token cost', () => {
  const readme = read('README.md');
  // The lead paragraph runs from the gate line to the first map sentence.
  const lead = reflow(readme.slice(at(readme, GATE_LEAD, 'README.md'), at(readme, 'codeweb reads your code', 'README.md')));
  assert.match(lead, /zero model tokens/i, 'the zero-marginal-cost property is the wedge — it leads with the gate');
  assert.match(lead, /cycle/i, 'blocker 1: a new dependency cycle');
  assert.match(lead, /duplicat/i, 'blocker 2: a new body-confirmed duplication');
  assert.match(lead, /caller/i, 'blocker 3: a symbol that lost every caller');
  assert.match(lead, /no LLM/i, 'checks do not use an LLM');
  assert.match(lead, /does not prove the program works/i, 'structural verdict states its runtime limit');
});

test('README gates every pull request before it explains the graph internals', () => {
  const readme = read('README.md');
  const gateSection = at(readme, /^## Gate every pull request/m, 'README.md');
  assert.ok(gateSection < at(readme, '## How it works', 'README.md'), 'the gate is a lead capability, not an appendix');
  const body = reflow(readme.slice(gateSection, at(readme, '## See it in action', 'README.md')));
  assert.match(body, /docs\/ci-gate\.md/, 'the gate section routes to the workflow docs rather than restating an unpinned Action ref');
  assert.match(body, /pin the action to a release tag/i, 'and carries the pinning guidance rather than a floating ref');
});

// ---- README: the boundary section, linked to the published contract ---------------------------

test('README carries a free-forever boundary section linking the published boundary page', () => {
  const readme = read('README.md');
  assert.match(readme, /free forever/i, 'the contract word itself');
  assert.ok(readme.includes(BOUNDARY_URL), `README must link the published boundary page (${BOUNDARY_URL})`);
  assert.ok(existsSync(join(PLUGIN_ROOT, 'docs', 'boundary.html')), 'the linked slug must exist in the built site');
  const section = /^## [^\n]*[Ff]ree forever[^\n]*$/m.exec(readme);
  assert.ok(section, 'the boundary gets its own section heading, not a buried aside');
  const body = reflow(readme.slice(readme.indexOf(section[0])));
  assert.match(body, /one laptop against one repo is free forever/i, 'the rule, quoted from CHARTER.md');
  assert.match(body, /hosting, multi-repo aggregation, and human attention/i, 'what money buys, in the ratified words');
  assert.match(body, /never breaks/i, 'a payment problem never breaks local tooling or CI');
});

test('the identity line stays verbatim on all four enforced surfaces', () => {
  // check-consistency reads this out of CHARTER.md and enforces it; pinned here too because the
  // repositioning rewrites two of the four surfaces around it.
  assert.ok(read('README.md').includes(IDENTITY), 'README.md');
  assert.equal(JSON.parse(read('site/data/product.json')).tagline, IDENTITY, 'site/data/product.json tagline');
  assert.ok(JSON.parse(read('package.json')).description.includes(IDENTITY), 'package.json description');
  assert.ok(JSON.parse(read('.claude-plugin/plugin.json')).description.includes(IDENTITY), 'plugin.json description');
});

// ---- Homepage: the gate leads the first screen, the live map supports it ----------------------

test('the built homepage hero renders the identity line verbatim', () => {
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(read('docs/index.html'));
  assert.ok(h1, 'the homepage keeps an h1');
  assert.equal(stripTags(h1[1]), IDENTITY, 'the hero headline reads exactly as the charter ratified it');
});

test('the homepage leads with the gate and demotes the live map below it', () => {
  for (const page of ['site/content/index.html', 'docs/index.html']) {
    const html = read(page);
    const gate = at(html, page.startsWith('site/') ? '{{descriptor}}' : GATE_LEAD, page);
    assert.ok(gate < at(html, 'id="cw-hero-map"', page), `${page}: the gate story must precede the live map canvas`);
    assert.ok(gate < at(html, 'class="duo"', page), `${page}: the gate story must precede the one-graph-two-interfaces section`);
  }
});

test('the homepage gate story states its blockers, its cost, and where it runs', () => {
  const html = read('docs/index.html');
  const story = html.slice(at(html, GATE_LEAD, 'docs/index.html'), at(html, 'class="duo"', 'docs/index.html'));
  assert.match(story, /zero model tokens/i, 'the zero-marginal-cost wedge');
  assert.match(story, /cycle/i, 'blocker 1');
  assert.match(story, /duplicat/i, 'blocker 2');
  assert.match(story, /caller/i, 'blocker 3');
  assert.match(story, /href="product\.html#ci-gate"/, 'the gate story routes to how the gate works');
  assert.match(story, /href="pricing\.html"/, 'and to the hosted tier that runs it for a whole org');
});

test('the homepage hero still carries its conversion rails after the reorder', () => {
  const html = read('docs/index.html');
  const hero = html.slice(at(html, 'class="hero hero2"', 'docs/index.html'), at(html, 'class="duo"', 'docs/index.html'));
  assert.match(hero, /npx -y @ghostlygawd\/codeweb \./, 'the copyable one-liner survives the reposition');
  assert.match(hero, /href="start\.html"/, 'the primary CTA survives');
  assert.match(hero, /id="cw-hero-map"/, 'the live map is demoted, not deleted — it is still the supporting view');
  assert.match(hero, /data-blast=/, 'and it keeps its interactive try-chips');
});
