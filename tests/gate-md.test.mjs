// gate-md — the PR comment the CI gate posts. Budget rules (hard caps + "+N more") and the
// lost-callers derivation (existing symbols only — new and renamed-to nodes are not "lost").

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gateComment } from '../scripts/lib/gate-md.mjs';

const payload = (over = {}) => ({
  before: 'before', after: 'after',
  nodes: { added: [], removed: [], renamed: [] },
  edges: { added: 0, removed: 0 },
  domains: { before: 1, after: 1 },
  crossDomainEdges: { before: 0, after: 0, delta: 0 },
  overlaps: { added: [], removed: [] },
  cycles: { added: [], removed: [] },
  orphans: { added: [], removed: [] },
  regressions: [], ok: true,
  ...over,
});

test('gate-md: clean diff renders the one-glance summary, no blocking section', () => {
  const body = gateComment(payload({ nodes: { added: ['a.js:f'], removed: [], renamed: [] }, edges: { added: 3, removed: 1 } }));
  assert.match(body, /^<!-- codeweb-gate -->/, 'marker first (the workflow updates its own comment by it)');
  assert.match(body, /✅ no structural regressions/);
  assert.match(body, /nodes \+1 −0 · edges \+3 −1/);
  assert.doesNotMatch(body, /Blocking/);
  assert.match(body, /Reproduce locally/);
});

test('gate-md: caps every list and says what was dropped', () => {
  const cycles = Array.from({ length: 7 }, (_, i) => [`a${i}.js`, `b${i}.js`, `a${i}.js`]);
  const overlaps = Array.from({ length: 6 }, (_, i) => ({ kind: 'signal-A', title: `dup ${i}` }));
  const body = gateComment(payload({
    ok: false,
    regressions: ['7 new dependency cycle(s)', '6 new duplication finding(s)'],
    cycles: { added: cycles, removed: [] },
    overlaps: { added: overlaps, removed: [] },
  }));
  assert.match(body, /❌ 2 regression type/);
  assert.match(body, /- ❌ 7 new dependency cycle/);
  assert.equal((body.match(/a\d+\.js → b\d+\.js/g) || []).length, 3, 'cycles capped at 3');
  assert.match(body, /…\+4 more/, 'dropped cycles are counted, not silent');
  assert.equal((body.match(/signal-A: dup/g) || []).length, 5, 'overlaps capped at 5');
  assert.match(body, /…\+1 more/);
});

test('gate-md: lost-callers excludes brand-new and renamed-to symbols; renames show similarity', () => {
  const body = gateComment(payload({
    nodes: { added: ['new.js:fresh'], removed: [], renamed: [{ from: 'a.js:old', to: 'a.js:neu', sim: 0.92 }] },
    orphans: { added: ['new.js:fresh', 'a.js:neu', 'lib.js:abandoned'], removed: [] },
  }));
  assert.match(body, /Symbols that lost all callers/);
  assert.match(body, /`lib\.js:abandoned`/, 'the existing symbol that lost its callers is listed');
  assert.doesNotMatch(body, /- `new\.js:fresh`/, 'a brand-new orphan is not "lost"');
  assert.doesNotMatch(body, /- `a\.js:neu`/, 'a renamed-to orphan is not "lost"');
  assert.match(body, /`a\.js:old` → `a\.js:neu` \(body 92%\)/, 'renames render with body similarity');
});
