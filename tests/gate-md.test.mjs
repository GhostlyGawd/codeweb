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

test('ac_21: evidence links use graph lines, analyzed commit and target; guidance distinguishes unknown callers', () => {
  const ref = 'a'.repeat(40);
  const body = gateComment(payload({
    ok: false, regressions: ['1 new duplication finding(s)'],
    overlaps: { added: [{ kind: 'duplicate-logic', title: 'Repeated check', nodes: ['a:f', 'b:f'], evidence: 'Bodies share 90% of tokens.', confidence: 'high', bodySim: 0.9 }], removed: [] },
    orphans: { added: ['a:f'], removed: [] },
    cycles: { added: [['a file.js', 'b.js']], removed: [] },
  }), {
    graph: { nodes: [{ id: 'a:f', file: 'a file.js', line: 12 }, { id: 'b:f', file: 'b.js', line: 7 }] },
    source: { repositoryUrl: 'https://github.com/acme/project', ref, target: 'packages/api' },
  });
  assert.ok(body.includes(`https://github.com/acme/project/blob/${ref}/packages/api/a%20file.js#L12`));
  assert.ok(body.includes(`https://github.com/acme/project/blob/${ref}/packages/api/b.js#L7`));
  assert.match(body, /Bodies share 90% of tokens/);
  assert.match(body, /confidence: high/);
  assert.match(body, /Compare the implementations/);
  assert.match(body, /Inspect the dependency path/);
  assert.match(body, /Check entry points/);
  assert.match(body, /No mapped callers does not prove/);
  assert.match(body, /does not establish behavioral correctness/);
});

test('ac_21: evidence is bounded and escaped; unsafe paths and link contexts stay plain text', () => {
  const nodes = Array.from({ length: 9 }, (_, i) => `n${i}`);
  const graph = { nodes: nodes.map((id) => ({ id, file: '../outside.js', line: 2 })) };
  const body = gateComment(payload({ overlaps: { added: [{
    kind: 'duplicate-logic', title: '<img src=x>\n## forged', nodes,
    evidence: '<script>alert(1)</script> ' + 'x'.repeat(2000),
  }], removed: [] } }), { graph, source: { repositoryUrl: 'javascript:alert(1)', ref: 'main', target: '..' } });
  assert.doesNotMatch(body, /<img|<script|\n## forged|javascript:/);
  assert.match(body, /&lt;script&gt;/);
  assert.match(body, /…\+4 more sites/);
  assert.ok(body.length < 2500, 'large evidence is truncated');
  assert.doesNotMatch(body, /\/blob\//);
});

test('ac_21: local comments use file:line and missing evidence never invents a confidence', () => {
  const body = gateComment(payload({ overlaps: { added: [{ kind: 'duplicate-logic', title: 'copy', nodes: ['a:f'] }], removed: [] } }), {
    graph: { nodes: [{ id: 'a:f', file: 'a.js', line: 3 }] },
  });
  assert.match(body, /a\.js:3/);
  assert.doesNotMatch(body, /confidence:|body similarity:/);
});
