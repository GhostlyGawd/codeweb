// The pre-registered check count is a claim, and it went stale exactly the way claims do: the
// published "32 / 33" outlived the retirement of H7, whose subject (`scripts/lib/shards.mjs`) was
// deleted on 2026-07-19. Nothing read the receipts, so nothing noticed for six weeks. The launch
// drafts got a derived count (tests/launch-drafts.test.mjs); the PUBLISHED surfaces — the research
// page, its og/meta description, and the pre-registration receipt itself — did not, which is why
// they kept the stale framing while the drafts refused it.
//
// This binds all three to the artifacts. The count is DERIVED from the six receipts on every run,
// never hardcoded, so retiring or adding a hypothesis moves these surfaces or fails here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ROOT, readJSON } from './helpers.mjs';

const read = (p) => readFileSync(join(PLUGIN_ROOT, p), 'utf8');
const bench = (p) => readJSON(join(PLUGIN_ROOT, p));
const textOf = (html) => html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ');

const RECEIPTS = ['correctness-query', 'edit-safety', 'auxiliary', 'detection-accuracy', 'performance', 'determinism'];
const receipts = () => RECEIPTS.map((n) => bench(`bench/results/${n}.json`));

/** The live count: one per hypothesis the fresh receipts still enumerate. */
const liveCount = () => receipts().reduce((n, r) => n + r.perHypothesis.length, 0);

// The claim-bearing surfaces. The built pages are included deliberately: the source page can be
// correct while the committed docs/ that readers actually load is a stale snapshot.
const SURFACES = [
  'site/content/research.html',
  'docs/research.html',
  'bench/preregistration.md',
  'site/build.mjs',
  'reports/LAUNCH-KIT.md',
];

test('the pre-registered check count on every published surface equals what the receipts enumerate', () => {
  const n = liveCount();
  assert.equal(n, 32, 'the six fresh receipts enumerate 32 live checks');
  for (const rel of SURFACES) {
    const text = rel.endsWith('.html') ? textOf(read(rel)) : read(rel);
    assert.match(text, new RegExp(`\\b${n}\\b`), `${rel} must state the derived check count (${n})`);
  }
});

test('no published surface still frames the study as "32 / 33"', () => {
  // The exact stale phrasings, in the forms they appeared in. A DATED historical record may keep
  // its original wording by repo precedent (docs/changelog.html release entries, the archived
  // product review) — those are excluded here the same way tests/lang-surfaces.test.mjs excludes
  // them from the language-count sweep, and for the same reason: rewriting a dated entry would
  // make it lie about what that release contained.
  // "32 / 33" and "32 of 33" are the stale SCORE in every form it was published in. A sentence
  // that explains the retirement necessarily says "33" once ("the registration froze 33 checks"),
  // and that is the opposite of the rot — so the score, not the digit, is what is barred.
  const STALE = /\b32\s*\/\s*33\b|\b32 of 33\b|\b33 pre-registered checks?\b|\bThe 33 checks\b/;
  for (const rel of SURFACES) {
    const text = rel.endsWith('.html') ? textOf(read(rel)) : read(rel);
    const hits = text.split('\n').filter((l) => STALE.test(l)).map((l) => l.trim());
    assert.deepEqual(hits, [], `${rel} still carries the superseded "32 / 33" framing:\n${hits.join('\n')}`);
  }
});

test('the retired check is recorded with its reason, not silently dropped', () => {
  // A count that simply shrank would be indistinguishable from a check quietly deleted because it
  // was inconvenient. The retirement must stay auditable in the receipt AND explained on the page.
  const editSafety = bench('bench/results/edit-safety.json');
  assert.ok(Array.isArray(editSafety.retiredHypotheses) && editSafety.retiredHypotheses.length > 0,
    'edit-safety.json must record retiredHypotheses');
  const h7 = editSafety.retiredHypotheses.find((h) => h.id === 'H7');
  assert.ok(h7, 'H7 must be recorded as retired');
  assert.ok(h7.reason && h7.decisionSource, 'a retired check carries both its reason and the decision that retired it');

  const prereg = read('bench/preregistration.md');
  assert.match(prereg, /H7/, 'the pre-registration page must name the retired check');
  assert.match(prereg, /retired/i, 'and say it was retired');
  assert.match(prereg, /8b6cfd4/, 'and cite the commit that deleted its subject');
  // Every retired hypothesis must be accounted for on the page, not just the one we know about.
  for (const h of editSafety.retiredHypotheses) {
    assert.match(prereg, new RegExp(`\\b${h.id}\\b`), `${h.id} is retired in the receipt but unexplained on the page`);
  }
});

test('every check the receipts enumerate is recorded as passing', () => {
  // "All 32 pass" is the claim. If a receipt goes red, this must fail before a reader finds it.
  const failing = receipts().flatMap((r) => r.perHypothesis.filter((h) => h.passed !== true).map((h) => h.id));
  assert.deepEqual(failing, [], `the published surfaces claim all checks pass, but these are red: ${failing.join(', ')}`);
});

test('H15 is claimed as passing only while its receipt says so', () => {
  // H15 was the study's published miss and now passes on the repaired harness. That is a verdict
  // CHANGE on a claim-bearing surface, so it is pinned to the receipt rather than to memory: if a
  // future run puts H15 back into a miss, the page that calls it a pass must fail.
  const perf = bench('bench/results/performance.json');
  const h15 = perf.perHypothesis.find((h) => h.id === 'H15');
  assert.ok(h15, 'H15 must still be enumerated — it measures a shipping feature');
  assert.equal(h15.passed, true, 'H15 passes on the repaired harness');
  // The criterion is the original one: a win at EVERY churn fraction. A page that reports a pass
  // while the curve holds a ratio >= 1 somewhere would be quoting a moved goalpost.
  for (const point of h15.value.curve) {
    assert.ok(point.ratio < 1, `H15 claims a speedup at every churn fraction, but p=${point.p}% measured ${point.ratio}`);
  }
});
