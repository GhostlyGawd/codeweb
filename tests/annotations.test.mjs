// F7 — properties + units for lib/annotations.mjs (finding fingerprints + false-positive suppression
// memory), written BEFORE the implementation (RED until the lib exists).
//
// The headline intent lock is ANN-IDENTITY-CHANGE-RESURFACES: a suppression is keyed to a finding's
// ESSENTIAL identity (kind + the symbols it implicates), so you cannot hide a genuinely NEW issue
// behind an OLD suppression — if the implicated symbols change, the fingerprint changes and the
// finding comes back. FPR-STABLE keeps the fingerprint from depending on cosmetics (title, order),
// so a suppression survives re-runs. Together they make the memory both durable and non-deceptive.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprint, loadAnnotations, applySuppressions, addSuppression } from '../scripts/lib/annotations.mjs';
import { tmpDir, cleanup } from './helpers.mjs';
import { prng, int, pick } from './_proptest.mjs';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

const finding = (kind, nodes, extra = {}) => ({ kind, nodes, title: 't', severity: 'high', evidence: 'e', ...extra });
const randomFinding = (rng) => {
  const kind = pick(rng, ['duplicate-logic', 'parallel-impl', 'orphan']);
  const n = int(rng, 1, 4);
  const nodes = Array.from({ length: n }, () => `f${int(rng, 0, 9)}.js:s${int(rng, 0, 9)}`);
  return finding(kind, nodes, { title: 'title' + int(rng, 0, 99), severity: pick(rng, ['low', 'high']) });
};

test('FPR-STABLE: fingerprint ignores order / title / severity / evidence — only kind + symbol set', () => {
  const a = finding('duplicate-logic', ['b.js:y', 'a.js:x'], { title: 'A', severity: 'high', evidence: 'foo' });
  const b = finding('duplicate-logic', ['a.js:x', 'b.js:y'], { title: 'TOTALLY DIFFERENT', severity: 'low', evidence: 'bar' });
  assert.equal(fingerprint(a), fingerprint(b), 'reordered nodes + different cosmetics -> same fingerprint');
});

test('FPR-STABLE (prop): fingerprint is deterministic and order-independent over random findings', () => {
  const rng = prng(7);
  for (let i = 0; i < 300; i++) {
    const f = randomFinding(rng);
    const shuffled = { ...f, nodes: f.nodes.slice().reverse(), title: 'x' + i };
    assert.equal(fingerprint(f), fingerprint(f), 'deterministic');
    assert.equal(fingerprint(f), fingerprint(shuffled), 'order/title independent');
  }
});

test('FPR-DISTINGUISHES: different kind or different node-set -> different fingerprint', () => {
  const base = finding('duplicate-logic', ['a.js:x', 'b.js:y']);
  assert.notEqual(fingerprint(base), fingerprint(finding('parallel-impl', ['a.js:x', 'b.js:y'])), 'kind matters');
  assert.notEqual(fingerprint(base), fingerprint(finding('duplicate-logic', ['a.js:x', 'c.js:z'])), 'node set matters');
  assert.notEqual(fingerprint(base), fingerprint(finding('duplicate-logic', ['a.js:x'])), 'subset is a different identity');
});

test('ANN-SUPPRESS-EXACT: applySuppressions removes exactly the matching findings; counts partition', () => {
  const findings = [
    finding('duplicate-logic', ['a.js:x', 'b.js:y']),
    finding('orphan', ['c.js:z']),
    finding('parallel-impl', ['d.js:p', 'e.js:q']),
  ];
  const target = fingerprint(findings[1]);
  const { visible, suppressed } = applySuppressions(findings, { suppressions: [{ fingerprint: target, verdict: 'false-positive' }] });
  assert.equal(suppressed.length, 1);
  assert.equal(suppressed[0].nodes[0], 'c.js:z');
  assert.equal(visible.length, 2);
  assert.ok(!visible.some((f) => fingerprint(f) === target), 'suppressed finding is not visible');
  assert.equal(visible.length + suppressed.length, findings.length, 'partition');
  for (const f of [...visible, ...suppressed]) assert.ok(f.fingerprint, 'every finding is annotated with its fingerprint');
});

test('ANN-IDENTITY-CHANGE-RESURFACES: changing an implicated symbol id un-suppresses the finding', () => {
  const original = finding('duplicate-logic', ['a.js:x', 'b.js:y']);
  const ann = { suppressions: [{ fingerprint: fingerprint(original), verdict: 'false-positive' }] };
  // same finding -> stays suppressed
  assert.equal(applySuppressions([original], ann).visible.length, 0);
  // one node id changes (e.g. the duplicate moved/renamed) -> identity changes -> resurfaces
  const moved = finding('duplicate-logic', ['a.js:x', 'b.js:yRenamed']);
  const out = applySuppressions([moved], ann);
  assert.equal(out.visible.length, 1, 'a new identity must not be silently suppressed');
  assert.equal(out.suppressed.length, 0);
});

test('ANN-KIND-JOINT: suppression keys on kind AND nodes — a different-kind finding over the same nodes stays visible', () => {
  const dup = finding('duplicate-logic', ['a.js:x', 'b.js:y']);
  const ann = { suppressions: [{ fingerprint: fingerprint(dup), verdict: 'false-positive' }] };
  const para = finding('parallel-impl', ['a.js:x', 'b.js:y']); // same symbols, different finding kind
  const out = applySuppressions([dup, para], ann);
  assert.deepEqual(out.suppressed.map((f) => f.kind), ['duplicate-logic'], 'only the suppressed kind is hidden');
  assert.deepEqual(out.visible.map((f) => f.kind), ['parallel-impl'], 'a different finding over the same nodes is NOT suppressed');
});

test('ANN-EMPTY/ABSENT: no annotations file -> everything visible, none suppressed', () => {
  const dir = tmpDir('codeweb-ann-');
  try {
    const ann = loadAnnotations(dir); // absent
    assert.deepEqual(ann.suppressions, []);
    const findings = [finding('orphan', ['a.js:x'])];
    const { visible, suppressed } = applySuppressions(findings, ann);
    assert.equal(visible.length, 1);
    assert.equal(suppressed.length, 0);
  } finally { cleanup(dir); }
});

test('ANN-PERSIST-IDEMPOTENT: addSuppression writes .codeweb/annotations.json; twice -> one entry', () => {
  const dir = tmpDir('codeweb-ann-');
  try {
    const fp = 'abc123';
    addSuppression(dir, fp, { note: 'not a real dup', verdict: 'false-positive' });
    addSuppression(dir, fp, { note: 'again', verdict: 'false-positive' });
    const ann = loadAnnotations(dir);
    assert.equal(ann.suppressions.filter((s) => s.fingerprint === fp).length, 1, 'idempotent on fingerprint');
    const onDisk = JSON.parse(readFileSync(join(dir, 'annotations.json'), 'utf8'));
    assert.ok(Array.isArray(onDisk.suppressions));
  } finally { cleanup(dir); }
});
