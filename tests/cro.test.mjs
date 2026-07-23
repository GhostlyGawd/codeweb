// Growth playbook Batch 5 — CRO (CRO.md C1-C10): the persuasion layer tells the truth it already
// has. These are presence contracts over the public surfaces — the copy can evolve, but the
// trust line, the CTA at peak conviction, and the situation labels must not silently vanish.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { PLUGIN_ROOT } from './helpers.mjs';

const read = (p) => readFileSync(join(PLUGIN_ROOT, p), 'utf8');

test('C1: the trust/offer line answers cost + safety at every ask', () => {
  const readme = read('README.md');
  const hits = readme.match(/Free & MIT/g) || [];
  assert.ok(hits.length >= 2, `README states the offer at the top AND at Install (found ${hits.length})`);
  assert.match(readme, /no account, no server, no telemetry/i, 'the privacy story is a sentence, not an inference');
  assert.match(readme, /never executes/i);
  assert.match(read('site/content/start.html'), /Free &(amp;)? MIT/, 'the install chooser carries the trust line (entity-encoded in HTML)');
});

test('C3: peak conviction has an ask — demo CTA and report footer', () => {
  const build = read('site/build.mjs');
  assert.match(build, /Map your repo/, 'the demo top bar gets a real CTA');
  assert.match(build, /start\.html/, 'and it lands on the conversion page');
  const tpl = read('scripts/report-template.html');
  assert.match(tpl, /github\.com\/GhostlyGawd\/codeweb/, 'the shared report finally links home');
  assert.match(tpl, /get it for your repo/i, 'one discreet footer line — harvesting, not persuading');
});

test('C4: the install chooser is labeled by situation, and the npx form is the cheap one', () => {
  const readme = read('README.md');
  assert.match(readme, /Using Claude Code\?/, 'plugin path labeled by who you are');
  assert.match(readme, /Cursor, Windsurf/, 'the MCP path routes the non-Claude agent user');
  assert.match(readme, /npx -y @ghostlygawd\/codeweb \./, 'the short from-your-project-dir form is the displayed one');
  const start = read('site/content/start.html');
  assert.match(start, /Using Claude Code\?/);
  assert.match(start, /Not sure\?/, 'one routing line for the undecided');
});

test('C5: the one hard requirement (Node >= 22) is stated at the README install decision', () => {
  const readme = read('README.md');
  const install = readme.slice(readme.indexOf('## Install'));
  assert.match(install, /Node(\.js)?\s*(≥|>=)\s*22/, 'no more unexplained first-try failures');
});

test('C7: MCP is expanded at first use, and the positioning line exists as real text', () => {
  const readme = read('README.md');
  assert.match(readme, /MCP[^.]{0,120}(protocol|Model Context Protocol)/is, 'first use carries the expansion');
  assert.match(readme, /DETERMINISTIC · READ-ONLY · ZERO-DEPENDENC/, 'the hero-SVG line is readable text too');
});

test('C8: start.html shows the payoff — the map, the ~3 s, and what success looks like', () => {
  const start = read('site/content/start.html');
  assert.match(start, /05-axios-graph\.png/, 'the reward is visible on the page that asks for work');
  assert.match(start, /~3\s?s/, 'the cost is named');
  assert.match(start, /\[run\] done/, 'success is recognizable before it happens');
});

test('C9: the closing sells the human, in plain words, without a 0-star star-beg', () => {
  const index = read('site/content/index.html');
  assert.ok(!index.includes('Make AI coding agents more efficient'), 'the closing beneficiary is the reader');
  assert.ok(!index.includes('reward hacking'), 'research jargon translated to plain words');
  assert.ok(!index.includes('Star on GitHub'), 'no favor-ask that lands on zero social proof');
});

test('C6: the tool wall opens with a job-framed index', () => {
  const readme = read('README.md');
  assert.match(readme, /Know before you edit/);
  assert.match(readme, /Gate every (edit|PR|change)/);
  assert.match(readme, /Clean up, ranked/);
});
