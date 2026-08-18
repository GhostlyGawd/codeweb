// Text pins on CHARTER.md's ratified governance, in the same spirit as workflows.test.mjs: the
// regression class is a ruling QUIETLY REVERTING — a non-goal restored, an amendment's date or
// operator attribution dropped in an edit, a struck rule drifting back to live prose. The charter
// is the file every other surface is audited against (`CLAUDE.md`, the 150 · Drift Audit), so a
// silent change here launders itself into README/site copy with nothing failing.
//
// Scope is deliberately narrow: the 2026-08-17/18 amendment (A1-A4) plus the two disciplines the
// charter states about ITSELF (dated+attributed entries, one question at a time). Wording is not
// pinned — the markers and the decisions are.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ROOT } from './helpers.mjs';

const charter = readFileSync(join(PLUGIN_ROOT, 'CHARTER.md'), 'utf8');
const section = (heading) => {
  const start = charter.indexOf(heading);
  assert.notEqual(start, -1, `CHARTER.md lost its "${heading}" section`);
  const next = charter.indexOf('\n## ', start + heading.length);
  return charter.slice(start, next === -1 ? charter.length : next);
};
// A non-goal item and its amendment note, up to the next numbered item.
const nonGoal = (n) => {
  const body = section('## Non-goals');
  const m = new RegExp(`^${n}\\. [\\s\\S]*?(?=^${n + 1}\\. |\\Z)`, 'm').exec(body);
  assert.ok(m, `non-goal ${n} is missing from CHARTER.md`);
  return m[0];
};

// ---- A1: the Teams green-light. The trigger is struck, and struck for a recorded reason -------

test('A1: non-goal 5 is struck — the distribution trigger no longer gates the Teams build', () => {
  const five = nonGoal(5);
  assert.match(five, /~~/, 'the superseded rule stays visible as struck text, not deleted');
  assert.match(five, /2026-08-1[78]/, 'the strike carries its date');
  assert.match(five, /operator/i, 'the strike is attributed to the operator, not to an agent');
  assert.match(five, /market timing/i, 'the rationale is recorded, not just the outcome');
  assert.match(five, /supersede/i, 'the trigger is superseded — the charter must not imply it was met');
  // The struck text must not also stand as a live rule anywhere in the non-goals list.
  const live = section('## Non-goals').replace(/~~[\s\S]*?~~/g, '');
  assert.doesNotMatch(live, /No hosted "Teams" build before the distribution trigger/,
    'the superseded rule must not survive as live prose outside the strikethrough');
});

test('A1 does not loosen non-goal 4 — the local product still takes no accounts or telemetry', () => {
  assert.match(nonGoal(4), /No accounts, telemetry, or license keys in the local product, ever\./,
    'non-goal 4 stands verbatim: the hosted build is a separate service, not a change to this one');
  assert.doesNotMatch(nonGoal(4), /~~/, 'non-goal 4 is not struck');
});

// ---- A2: the grammar bar gained a source; it did not lower --------------------------------

test('A2: non-goal 8 is amended, not struck, and names the second trusted source', () => {
  const eight = nonGoal(8);
  assert.doesNotMatch(eight, /~~/, 'the provenance bar is amended — striking it would drop the bar');
  assert.match(eight, /2026-08-1[78]/, 'the amendment carries its date');
  assert.match(eight, /operator/i, 'the amendment is attributed to the operator');
  assert.match(eight, /tree-sitter org|github\.com\/tree-sitter/i, 'the newly trusted source is named');
  assert.match(eight, /sha256/i, 'the pin requirement rides along with the new source');
  assert.match(eight, /ABI/, 'the ABI check rides along with the new source');
  assert.match(eight, /PROVENANCE\.md/, 'the discipline still points at the provenance table');
});

// ---- A3: the boundary is ratified here, with all three elements ----------------------------

test('A3: the boundary section states the rule, where billing lives, and the price intent', () => {
  const boundary = section('## The boundary: free forever / Teams');
  assert.match(boundary, /2026-08-1[78]/, 'the ratification carries its date');
  assert.match(boundary, /operator/i, 'the ratification is attributed to the operator');
  assert.match(boundary, /one laptop against one repo is free forever/i, 'the rule, in the ratified words');
  assert.match(boundary, /hosting, multi-repo aggregation, and human attention/i, 'what money buys');
  assert.match(boundary, /only in the hosted service/i, 'billing lives in the service, never in this repo');
  assert.match(boundary, /never\*{0,2}\s*\n?breaks local tooling|never breaks local tooling/i,
    'payment failure must never break local tooling — the invariant the boundary protects');
  assert.match(boundary, /€10/, 'the Teams price intent');
  assert.match(boundary, /90 day|trailing 90/i, 'the active-author definition the price is per');
});

// ---- A4: the reaffirmation is recorded, so survival is a decision --------------------------

test('A4: non-goal 6 stands live and its reaffirmation is on the record', () => {
  const six = nonGoal(6);
  assert.doesNotMatch(six, /~~/, 'the Marketplace ban is live, not struck');
  assert.match(six, /No VS Code Marketplace publish/, 'the rule itself is unchanged');
  assert.match(six, /reaffirm/i, 'the review is recorded — silence would read as an oversight');
  assert.match(six, /2026-08-1[78]/, 'the reaffirmation carries its date');
  assert.match(six, /operator/i, 'the reaffirmation is attributed to the operator');
});

// ---- The charter's disciplines about itself ------------------------------------------------

test('every 2026-08-17/18 amendment is indexed, dated, and attributed', () => {
  const amendments = section('## Amendments');
  for (const id of ['A1', 'A2', 'A3', 'A4']) {
    assert.match(amendments, new RegExp(`\\|\\s*${id}\\s*\\|`), `the ledger lost ruling ${id}`);
  }
  // Every table row in the ledger carries a date column entry.
  const rows = amendments.split('\n').filter((l) => /^\| A\d/.test(l));
  assert.equal(rows.length, 4, 'four rulings were made in that interview');
  for (const r of rows) {
    assert.match(r, /2026-08-1[78]/, `ledger row lacks its date: ${r.slice(0, 60)}`);
  }
  assert.match(amendments, /Untouched by the 2026-08-17\/18 interview/i,
    'what the interview did NOT change is recorded too — silence is not consent');
});

test('the open-questions discipline survives the amendment', () => {
  const open = section('## Open questions');
  // The 2026-07-27 data-format question is either still open or explicitly ruled — never dropped.
  assert.match(open, /2026-07-27/, 'the pre-existing open question is still on the record');
  assert.match(open, /data format/i, 'and still states its subject');
  assert.match(open, /still open|Answered 2026-08|ratif/i,
    'it is either carried forward explicitly or resolved with a dated ruling — never silently dropped');
  assert.match(open, /one at a time/i, "the operator's one-question-at-a-time rule survives");
});

test('the ratified job line is untouched by the amendment', () => {
  // check-consistency reads this line out of the charter and enforces it on four surfaces; an
  // amendment that disturbed it would take every public surface red with it.
  assert.match(charter, /\*\*"Your agents break less code and burn fewer tokens\."\*\*/,
    'the identity line stays verbatim and stays the first bolded quote the gate reads');
  assert.equal(
    (charter.match(/\*\*"([^"]+)"\*\*/) || [])[1],
    'Your agents break less code and burn fewer tokens.',
    'the gate takes the FIRST bolded quote — no amendment may introduce an earlier one',
  );
});
