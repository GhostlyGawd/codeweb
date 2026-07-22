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
import { runNode, tmpDir, cleanup, script, writeTree } from './helpers.mjs';

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
  assert.deepEqual(json.nodes, { added: [], removed: [], renamed: [] });
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

// ---- Round 2, finding #28 (T-28.1): rename-detection characterization + cap-trip marker ----
// These pin renamed[] across the detectRenames extraction/memoization (T-28.2). All four bodies are
// SHORT (< the 400-line cap), so the line cap changes nothing here — they stay byte-identical.
const REN_BODY = 'function alpha(u) {\n  const r = get(u.id);\n  if (!r) return null;\n  return r.value + compute(r);\n}';
const REN_OTHER = 'function zeta() {\n  while (queue.length) drain(queue.pop());\n}';
const fn = (id, file, line, loc) => ({ id, label: id.split(':')[1], kind: 'function', file, line, loc, exports: true, domain: 'core' });
// before/after graphs with independent meta.root dirs (diff reads each side's bodies from its own root)
function renameCase(name, srcBefore, srcAfter, beforeNodes, afterNodes, { noRoot = false } = {}) {
  const dir = tmpDir('codeweb-diffren-');
  const rootB = join(dir, 'b'), rootA = join(dir, 'a');
  if (!noRoot) { if (srcBefore) writeTree(rootB, srcBefore); if (srcAfter) writeTree(rootA, srcAfter); }
  const meta = (t, root) => ({ target: t, ...(noRoot ? {} : { root: root.replace(/\\/g, '/') }) });
  const g = (t, root, nodes) => ({ meta: meta(t, root), nodes, edges: [], domains: [], overlaps: [] });
  const bp = join(dir, 'before.json'), ap = join(dir, 'after.json');
  writeFileSync(bp, JSON.stringify(g('b', rootB, beforeNodes)));
  writeFileSync(ap, JSON.stringify(g('a', rootA, afterNodes)));
  const r = dj(bp, ap);
  cleanup(dir);
  return r.json;
}

test('D-RENAME-PIN-inplace: same file, new name, same body -> renamed (not delete+add)', () => {
  const j = renameCase('inplace',
    { 'f.js': REN_BODY.replace('alpha', 'oldName') + '\n' },
    { 'f.js': REN_BODY.replace('alpha', 'newName') + '\n' },
    [fn('f.js:oldName', 'f.js', 1, 5)], [fn('f.js:newName', 'f.js', 1, 5)]);
  assert.equal(j.nodes.renamed.length, 1);
  assert.equal(j.nodes.renamed[0].from, 'f.js:oldName');
  assert.equal(j.nodes.renamed[0].to, 'f.js:newName');
  assert.ok(j.nodes.renamed[0].sim >= 0.85, `structural sim recorded, got ${j.nodes.renamed[0].sim}`);
  assert.deepEqual(j.nodes.added, []);
  assert.deepEqual(j.nodes.removed, []);
  assert.equal(j.nodes.renameCheck, undefined, 'no cap marker on a small diff');
});

test('D-RENAME-PIN-move: same label, moved file, same body -> renamed via the sameLabel path', () => {
  const j = renameCase('move',
    { 'old.js': REN_BODY.replace('alpha', 'helper') + '\n' },
    { 'new.js': REN_BODY.replace('alpha', 'helper') + '\n' },
    [fn('old.js:helper', 'old.js', 1, 5)], [fn('new.js:helper', 'new.js', 1, 5)]);
  assert.equal(j.nodes.renamed.length, 1);
  assert.equal(j.nodes.renamed[0].from, 'old.js:helper');
  assert.equal(j.nodes.renamed[0].to, 'new.js:helper');
});

test('D-RENAME-PIN-submatch: a genuinely different body (sim < 0.85) is NOT a rename', () => {
  const j = renameCase('sub',
    { 'c.js': REN_BODY.replace('alpha', 'foo') + '\n' },
    { 'c.js': REN_OTHER.replace('zeta', 'bar') + '\n' },
    [fn('c.js:foo', 'c.js', 1, 5)], [fn('c.js:bar', 'c.js', 1, 3)]);
  assert.deepEqual(j.nodes.renamed, [], 'below the 0.85 bar and loc differs -> churn, not a rename');
  assert.deepEqual(j.nodes.added, ['c.js:bar']);
  assert.deepEqual(j.nodes.removed, ['c.js:foo']);
});

test('D-RENAME-PIN-spanshape: unreadable bodies fall back to same-file span-shape (sim null)', () => {
  const j = renameCase('span', null, null,
    [fn('d.js:gone', 'd.js', 1, 7)], [fn('d.js:reborn', 'd.js', 1, 8)], { noRoot: true });
  assert.equal(j.nodes.renamed.length, 1, 'same file + |loc diff|<=1 with no readable body -> span-shape match');
  assert.equal(j.nodes.renamed[0].from, 'd.js:gone');
  assert.equal(j.nodes.renamed[0].to, 'd.js:reborn');
  assert.equal(j.nodes.renamed[0].sim, null, 'span-shape match records sim null');
});

test('D-RENAME-LONGBODY: an obvious >400-line rename still detects under the body cap', () => {
  const lines = Array.from({ length: 450 }, (_, i) => `  const s${i} = step${i % 9}(acc) + ${i};`).join('\n');
  const big = (nm) => `function ${nm}(acc) {\n${lines}\n}`;
  const j = renameCase('long',
    { 'big.js': big('bigOld') + '\n' }, { 'big.js': big('bigNew') + '\n' },
    [fn('big.js:bigOld', 'big.js', 1, 452)], [fn('big.js:bigNew', 'big.js', 1, 452)]);
  assert.equal(j.nodes.renamed.length, 1, 'long-body rename detected on its first 400 capped lines');
  assert.equal(j.nodes.renamed[0].from, 'big.js:bigOld');
  assert.equal(j.nodes.renamed[0].to, 'big.js:bigNew');
});

test('D-RENAME-CAP: >200 on a side skips detection with an additive renameCheck marker (empty side gets none)', () => {
  const many = Array.from({ length: 201 }, (_, i) => fn(`f${i}.js:fn${i}`, `f${i}.js`, 1, 3));
  // both sides non-empty AND removed > 200 -> detection capped, marker present, renamed stays []
  const capped = renameCase('cap', null, null, many, [fn('new.js:brandNew', 'new.js', 1, 4)], { noRoot: true });
  assert.deepEqual(capped.nodes.renamed, [], 'capped runs do not detect renames');
  assert.deepEqual(capped.nodes.renameCheck, { skipped: true, removed: 201, added: 1, cap: 200 }, 'additive skip marker with the counts');
  assert.equal(capped.nodes.added.length, 1);
  assert.equal(capped.nodes.removed.length, 201);
  // removed > 200 but the ADDED side is empty -> nothing was skippable -> NO marker (silent, as today)
  const emptyAdd = renameCase('capEmpty', null, null, many, [], { noRoot: true });
  assert.equal(emptyAdd.nodes.renameCheck, undefined, 'an empty side is not a skipped detection');
  assert.deepEqual(emptyAdd.nodes.renamed, []);
});

test('D-RENAME-CAP-text: the cap-trip prints one text-mode line naming the skip', () => {
  const dir = tmpDir('codeweb-diffcap-');
  try {
    const many = Array.from({ length: 201 }, (_, i) => fn(`f${i}.js:fn${i}`, `f${i}.js`, 1, 3));
    const g = (t, nodes) => ({ meta: { target: t }, nodes, edges: [], domains: [], overlaps: [] });
    const bp = join(dir, 'b.json'), ap = join(dir, 'a.json');
    writeFileSync(bp, JSON.stringify(g('b', many)));
    writeFileSync(ap, JSON.stringify(g('a', [fn('new.js:brandNew', 'new.js', 1, 4)])));
    const r = d(bp, ap);
    assert.match(r.stdout, /rename detection skipped/i, 'text mode surfaces the cap trip');
    assert.match(r.stdout, /201/);
  } finally { cleanup(dir); }
});
