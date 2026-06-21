// Characterization tests for scripts/diff.mjs — the graph delta / post-edit gate. Compares two
// graph.json snapshots (before vs after an agent edit) and flags structural REGRESSIONS so a
// PostToolUse hook / CI step can gate on exit code. Written TDD-red, hardened after a review gate.
//
// Regression policy (deliberate, see review): a regression is something that WAS fine becoming
// worse — a NEW dependency cycle, a NEW duplication finding, or an EXISTING symbol that LOST all
// its callers. A brand-new uncalled node is reported (nodes/orphans added) but is NOT a gate
// failure — agents legitimately add functions before wiring them.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { runNode, tmpDir, cleanup, script } from './helpers.mjs';

const N = (id, file, domain, exports) => ({ id, label: id.split(':')[1], file, domain, exports });
// before: a -> b -> c (no cycle / overlap / orphan; a.js:fa is exported)
const BEFORE = {
  meta: { target: 'before' },
  nodes: [N('a.js:fa', 'a.js', 'app', true), N('b.js:fb', 'b.js', 'core', false), N('c.js:fc', 'c.js', 'data', false)],
  edges: [{ from: 'a.js:fa', to: 'b.js:fb', kind: 'call' }, { from: 'b.js:fb', to: 'c.js:fc', kind: 'call' }],
  domains: [], overlaps: [],
};
// after: + brand-new orphan node d, + edge c->a (file cycle), + a NEW duplicate-logic overlap
const AFTER = {
  meta: { target: 'after' },
  nodes: [...BEFORE.nodes, N('d.js:fd', 'd.js', 'misc', false)],
  edges: [...BEFORE.edges, { from: 'c.js:fc', to: 'a.js:fa', kind: 'call' }],
  domains: [],
  overlaps: [{ kind: 'duplicate-logic', severity: 'high', confidence: 'high', title: '`fd` duplicates `fa`', nodes: ['a.js:fa', 'd.js:fd'] }],
};
// after-orphan: remove a->b so b.js:fb (an EXISTING node) loses its only caller -> regressed orphan
const AFTER_ORPHAN = {
  meta: { target: 'after-orphan' },
  nodes: BEFORE.nodes,
  edges: [{ from: 'b.js:fb', to: 'c.js:fc', kind: 'call' }],
  domains: [], overlaps: [],
};
// overlap-identity: same finding (same kind + node set) but different id/title/severity across snapshots
const OV_NODES = [N('p.js:x', 'p.js', 'd', false), N('q.js:y', 'q.js', 'e', false)];
const BEFORE_OV = { meta: { target: 'bov' }, nodes: OV_NODES, edges: [], domains: [], overlaps: [{ kind: 'duplicate-logic', id: 'ov1', title: 'x/y dup (old wording)', severity: 'high', confidence: 'high', nodes: ['p.js:x', 'q.js:y'] }] };
const AFTER_OV = { meta: { target: 'aov' }, nodes: OV_NODES, edges: [], domains: [], overlaps: [{ kind: 'duplicate-logic', id: 'ov9', title: 'x/y dup (RENAMED, 2 files)', severity: 'medium', confidence: 'medium', nodes: ['q.js:y', 'p.js:x'] }] };

let WS, B, A, AO, BOV, AOV, SP;
before(() => {
  WS = tmpDir('codeweb-diff-');
  const w = (name, obj) => { const p = join(WS, name); writeFileSync(p, JSON.stringify(obj)); return p; };
  B = w('before.json', BEFORE); A = w('after.json', AFTER); AO = w('after-orphan.json', AFTER_ORPHAN);
  BOV = w('bov.json', BEFORE_OV); AOV = w('aov.json', AFTER_OV); SP = w('sparse.json', { meta: {} });
});
after(() => { if (WS) cleanup(WS); });

const d = (...args) => runNode(script('diff.mjs'), args);
const dj = (...args) => {
  const r = d(...args, '--json');
  let json = null; try { json = JSON.parse(r.stdout); } catch { /* null -> assertion reports clearly */ }
  return { ...r, json };
};

test('D1: fewer than two graph args prints usage to stderr and exits 2', () => {
  const r = d(B);
  assert.equal(r.status, 2, `expected usage exit 2, got ${r.status}\n${r.stderr}`);
  assert.match(r.stderr, /usage/i);
  assert.equal(r.stdout, '');
});

test('D1b: a missing graph file exits 2 with a clear message (no raw stack)', () => {
  const r = d(B, join(WS, 'nope.json'));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /not found|no such|cannot/i);
  assert.doesNotMatch(r.stderr, /at \w+.*\(.*:\d+:\d+\)/);
});

test('D5: identical snapshots -> empty deltas, ok:true, exit 0', () => {
  const { status, json } = dj(B, B);
  assert.equal(status, 0);
  assert.deepEqual(json.nodes, { added: [], removed: [] });
  assert.equal(json.edges.added, 0);
  assert.equal(json.edges.removed, 0);
  assert.deepEqual(json.cycles.added, []);
  assert.deepEqual(json.orphans.added, []);
  assert.deepEqual(json.overlaps.added, []);
  assert.equal(json.crossDomainEdges.delta, 0);
  assert.equal(json.ok, true);
  assert.deepEqual(json.regressions, []);
});

test('D3: adds a cycle + duplicate + a brand-new orphan node -> cycle & dup are regressions; new node is NOT', () => {
  const { status, json } = dj(B, A);
  assert.deepEqual(json.nodes.added, ['d.js:fd']);
  assert.deepEqual(json.nodes.removed, []);
  assert.equal(json.edges.added, 1, 'the c->a edge');
  assert.equal(json.edges.removed, 0);
  assert.deepEqual(json.cycles.added, [['a.js', 'b.js', 'c.js']]);
  assert.deepEqual(json.orphans.added, ['d.js:fd'], 'reported in the orphan membership delta');
  assert.equal(json.overlaps.added.length, 1);
  assert.equal(json.overlaps.added[0].kind, 'duplicate-logic');
  assert.equal(json.crossDomainEdges.delta, 1);
  // policy: brand-new uncalled node is NOT a regression; only cycle + duplication are
  assert.equal(json.regressions.length, 2, 'cycle + duplication only');
  const reg = json.regressions.join(' | ');
  assert.match(reg, /cycle/i);
  assert.match(reg, /duplicat/i);
  assert.doesNotMatch(reg, /caller|orphan/i, 'a brand-new uncalled node must not trip the gate');
  assert.equal(json.ok, false);
  assert.equal(status, 1);
});

test('D3b: an EXISTING node that loses its only caller is a regression (ok:false, exit 1)', () => {
  const { status, json } = dj(B, AO);
  assert.equal(json.edges.removed, 1, 'a->b removed');
  assert.deepEqual(json.orphans.added, ['b.js:fb'], 'b existed before and is now uncalled');
  assert.deepEqual(json.cycles.added, []);
  assert.equal(json.overlaps.added.length, 0);
  assert.equal(json.regressions.length, 1);
  assert.match(json.regressions[0], /caller|orphan/i);
  assert.equal(json.ok, false);
  assert.equal(status, 1);
});

test('D4: the reverse diff (pure removals) is NOT a regression -> ok:true, exit 0', () => {
  const { status, json } = dj(A, B);
  assert.deepEqual(json.nodes.removed, ['d.js:fd']);
  assert.deepEqual(json.nodes.added, []);
  assert.deepEqual(json.cycles.removed, [['a.js', 'b.js', 'c.js']]);
  assert.deepEqual(json.cycles.added, []);
  assert.deepEqual(json.orphans.removed, ['d.js:fd']);
  assert.equal(json.overlaps.removed.length, 1);
  assert.equal(json.overlaps.added.length, 0);
  assert.equal(json.ok, true, 'removing code/cycles/dups is an improvement');
  assert.equal(status, 0);
});

test('D-overlap-identity: the same finding with a different id/title is NOT added or removed', () => {
  const { status, json } = dj(BOV, AOV);
  assert.deepEqual(json.overlaps.added, [], 'content key (kind + sorted nodes) is stable across id/title churn');
  assert.deepEqual(json.overlaps.removed, []);
  assert.equal(json.ok, true);
  assert.equal(status, 0);
});

test('D-sparse: graphs missing top-level arrays normalize instead of crashing', () => {
  const { status, json } = dj(SP, SP);
  assert.equal(status, 0);
  assert.deepEqual(json.nodes.added, []);
  assert.deepEqual(json.cycles.added, []);
  assert.equal(json.ok, true);
});

test('D6: --json output is byte-stable and the CLI actually ran (not a vacuous pass)', () => {
  const a = d(B, A, '--json');
  const b = d(B, A, '--json');
  assert.notEqual(a.status, null, 'diff.mjs exists and executed (guards against vacuous RED green)');
  assert.equal(a.stdout, b.stdout, 'identical inputs -> identical bytes');
});
