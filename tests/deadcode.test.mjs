// F10 — confidence-tiered dead-code. Tests first. ★ANTI-CHEAT DC-MEMBERSHIP pins `safe` to a POSITIVE
// membership oracle recomputed inline (orphans minus test-targeted minus entrypoints) over random
// graphs — the "dump everything into review" cheat fails it. DC-PARTITION/DC-SAFE-NO-TEST are
// companions; DC-FIXTURE pins the four placements explicitly (incl. test-file-defined -> review).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runNode, script, tmpDir, writeTree, cleanup } from './helpers.mjs';
import { prng, int } from './_proptest.mjs';

const DC = script('deadcode.mjs');
const ENTRYPOINTS = new Set(['main', 'default', 'index', 'setup', 'teardown', 'init']); // mirror the impl

// independent reimplementation of orphans(): kind!=module, not exported, no incoming call|import|inherit
const inlineOrphans = (g) => {
  const incoming = new Set(g.edges.filter((e) => ['call', 'import', 'inherit'].includes(e.kind)).map((e) => e.to));
  return g.nodes.filter((n) => n.kind !== 'module' && !n.exports && !incoming.has(n.id)).map((n) => n.id);
};
const write = (g) => { const dir = tmpDir('cw-dc-'); writeTree(dir, { 'graph.json': JSON.stringify(g) }); return { dir, graphPath: join(dir, 'graph.json') }; };

function makeGraph(rng, n) {
  const nodes = Array.from({ length: n }, (_, i) => ({ id: `f.js:s${i}`, label: `s${i}`, kind: 'function', file: 'f.js', line: i + 1, loc: 1, exports: rng() < 0.3, domain: 'd' }));
  const ids = nodes.map((x) => x.id);
  const edges = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j && rng() < 0.18) edges.push({ from: ids[i], to: ids[j], kind: rng() < 0.5 ? 'call' : 'test' });
  return { meta: {}, nodes, edges, domains: [], overlaps: [] };
}

// ★ANTI-CHEAT · DC-MEMBERSHIP (+ DC-PARTITION + DC-SAFE-NO-TEST companions)
test('DC-MEMBERSHIP: safe == inline-recomputed (orphans − test-targeted − entrypoints) over random graphs', () => {
  const rng = prng(0xDEADC0);
  for (let c = 0; c < 40; c++) {
    const g = makeGraph(rng, int(rng, 5, 12));
    const { dir, graphPath } = write(g);
    try {
      const out = JSON.parse(runNode(DC, [graphPath, '--json']).stdout);
      const orphanIds = inlineOrphans(g);
      const testTargets = new Set(g.edges.filter((e) => e.kind === 'test').map((e) => e.to));
      const byId = new Map(g.nodes.map((n) => [n.id, n]));
      const safeExpected = orphanIds.filter((id) => !testTargets.has(id) && !ENTRYPOINTS.has(byId.get(id).label)).sort();

      const safeGot = out.safe.map((s) => s.id).sort();
      assert.deepEqual(safeGot, safeExpected, `case ${c}: safe membership`);

      // DC-PARTITION: safe ∪ review == orphans, disjoint
      const reviewGot = out.review.map((r) => r.id);
      assert.deepEqual([...safeGot, ...reviewGot].sort(), orphanIds.slice().sort(), 'partition != orphans');
      assert.equal(new Set([...safeGot, ...reviewGot]).size, safeGot.length + reviewGot.length, 'safe/review overlap');
      // DC-SAFE-NO-TEST
      for (const id of safeGot) assert.ok(!testTargets.has(id), `test-targeted node in safe: ${id}`);
    } finally { cleanup(dir); }
  }
});

// DC-FIXTURE: the four placements explicitly. test-targeted, entrypoint, and TEST-FILE-DEFINED all
// go to review; only a plain production orphan is safe. The test-file-defined case (helpers/mocks/
// case registrations) is the H13 fix: such symbols have no inbound code edge, so the old engine
// filed them "safe" — and deleting the safe list would delete a repo's test helpers.
test('DC-FIXTURE: test-targeted/entrypoint/test-file-defined -> review, plain orphan -> safe', () => {
  const g = {
    meta: {}, domains: [], overlaps: [],
    nodes: [
      { id: 'a.js:tested', label: 'tested', kind: 'function', file: 'a.js', line: 1, loc: 1, exports: false, domain: 'd' },
      { id: 'a.js:main', label: 'main', kind: 'function', file: 'a.js', line: 3, loc: 1, exports: false, domain: 'd' },
      { id: 'a.js:reallyDead', label: 'reallyDead', kind: 'function', file: 'a.js', line: 5, loc: 1, exports: false, domain: 'd' },
      { id: 't.test.js:t', label: 't', kind: 'function', file: 't.test.js', line: 1, loc: 1, exports: false, domain: 'd' },
      { id: 'helpers.test.js:mockServer', label: 'mockServer', kind: 'function', file: 'helpers.test.js', line: 1, loc: 1, exports: false, domain: 'd' },
    ],
    edges: [{ from: 't.test.js:t', to: 'a.js:tested', kind: 'test' }],
  };
  const { dir, graphPath } = write(g);
  try {
    const out = JSON.parse(runNode(DC, [graphPath, '--json']).stdout);
    const safe = new Set(out.safe.map((s) => s.id));
    const review = new Set(out.review.map((r) => r.id));
    assert.ok(review.has('a.js:tested'), 'test-targeted -> review');
    assert.ok(review.has('a.js:main'), 'entrypoint -> review');
    assert.ok(review.has('t.test.js:t'), 'test-file-defined (case) -> review');
    assert.ok(review.has('helpers.test.js:mockServer'), 'test-file-defined (helper/mock) -> review, NOT safe — deleting it can break tests');
    assert.ok(safe.has('a.js:reallyDead'), 'plain production orphan -> safe');
    assert.ok(!safe.has('a.js:tested') && !safe.has('a.js:main') && !safe.has('t.test.js:t') && !safe.has('helpers.test.js:mockServer'));
    // every entry carries a reason
    for (const e of [...out.safe, ...out.review]) assert.ok(typeof e.reason === 'string' && e.reason.length > 0, `missing reason for ${e.id}`);
  } finally { cleanup(dir); }
});

// DC-DETERMINISTIC
test('DC-DETERMINISTIC: identical input -> identical stdout', () => {
  const rng = prng(0xD37);
  const { dir, graphPath } = write(makeGraph(rng, 9));
  try {
    const a = runNode(DC, [graphPath, '--json']).stdout;
    const b = runNode(DC, [graphPath, '--json']).stdout;
    assert.equal(a, b);
  } finally { cleanup(dir); }
});
