// Round 2, finding #9 — the two mis-lexings that made BOTH of the self-map's deadcode "safe to
// delete" verdicts false (campaign would have emitted DELETE trend.mjs:metrics / DELETE
// minhash.mjs:PERM_SEEDS — executing its own advice would break trend and minhash at runtime):
//   T-9.1 — `...metrics(` was routed into the member-call branch by the `.` immediately before the
//           match; the backward identifier match can never succeed on dots, so the call edge was
//           DROPPED (trend.mjs:metrics showed 0 callers). A `..`-preceded match is spread — it now
//           falls through to addEdge.
//   T-9.2 — the const-arrow rule matched `const PERM_SEEDS = (() => {…})()` (the `\(\(` prefix fed
//           the `\([^)]*\)\s*=>` alternative), so an IIFE-initialized VALUE became a `function`
//           node whose only use is subscript — invisible to callRe/refRe, a guaranteed deadcode
//           false positive. `=\s*(?!\(\()` rejects it. ACCEPTED RECALL LOSS, pinned below: a
//           genuinely function-valued, non-invoked `const g = ((a) => a)` also loses its node —
//           any future re-widening must flip that pin consciously.
//   T-9.3 — the self-map dogfood regression: the REAL scripts/trend.mjs + scripts/lib/minhash.mjs
//           texts (flat tmpdir; unresolvable ./lib imports are inert) must yield >=1 caller for
//           trend.mjs:metrics and NO minhash.mjs:PERM_SEEDS node of any kind — deadcode only tiers
//           existing nodes, so neither can ever reach its safe tier again.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { scanSymbols } from '../scripts/lib/lang-rules.mjs';
import { runNode, tmpDir, cleanup, writeTree, readJSON, script, hasEdge } from './helpers.mjs';

const noMask = () => { throw new Error('masked() must not be called for non-masked languages'); };

test('SP-1: a spread call `...metrics(ws)` edges to the same-file callee', () => {
  const dir = tmpDir('codeweb-spread-');
  try {
    writeTree(dir, {
      'sp.mjs':
        'export function metrics(g) { return { n: 1 }; }\n' +
        'export function report(ws) { return { label: 1, ...metrics(ws) }; }\n',
    });
    const out = join(dir, 'fragment.json');
    const res = runNode(script('extract-symbols.mjs'), [dir, '--target', 'spread-x', '--no-ctags', '--out', out]);
    assert.equal(res.status, 0, `extractor exited non-zero:\n${res.stderr}`);
    const f = readJSON(out);
    assert.ok(hasEdge(f.edges, 'sp.mjs:report', 'sp.mjs:metrics', 'call'),
      'spread `...metrics(` must fall through to addEdge (pre-fix: dead-ended in the member branch)');
  } finally { cleanup(dir); }
});

test('SP-2: IIFE initializers are not function nodes; real arrows still are', () => {
  const sym = (text) => scanSymbols('/x/a.mjs', text, noMask);
  assert.deepEqual(sym('const PERM_SEEDS = (() => {\n  return [];\n})();'), [],
    'an IIFE-initialized VALUE must not become a function node');
  // Pinned accepted loss: genuinely function-valued but non-invoked `= ((…) => …)` also loses its
  // node — the `= ((` prefix is the only line-local signal (the invoking `()` may sit lines below).
  assert.deepEqual(sym('const g = ((a) => a);'), [],
    'accepted recall loss (pinned): re-widening this must be a conscious flip');
  const real = sym('const real = (x) => x;');
  assert.equal(real.length, 1);
  assert.equal(real[0].name, 'real');
  assert.equal(real[0].kind, 'function');
  const fn = sym('const fn = async () => {\n  return 1;\n};');
  assert.equal(fn.length, 1);
  assert.equal(fn[0].name, 'fn');
  assert.equal(fn[0].kind, 'function');
});

test('SP-3: self-map dogfood — trend.mjs:metrics has a caller; PERM_SEEDS is no node', () => {
  const dir = tmpDir('codeweb-selfmap9-');
  try {
    writeTree(dir, {
      'trend.mjs': readFileSync(script('trend.mjs'), 'utf8'),
      'minhash.mjs': readFileSync(join(script('lib'), 'minhash.mjs'), 'utf8'),
    });
    const out = join(dir, 'fragment.json');
    const res = runNode(script('extract-symbols.mjs'), [dir, '--target', 'self9', '--no-ctags', '--out', out]);
    assert.equal(res.status, 0, `extractor exited non-zero:\n${res.stderr}`);
    const f = readJSON(out);
    assert.ok(f.nodes.some((n) => n.id === 'trend.mjs:metrics'), 'sanity: metrics node exists');
    const callers = f.edges.filter((e) => e.kind === 'call' && e.to === 'trend.mjs:metrics');
    assert.ok(callers.length >= 1,
      `trend.mjs:metrics must have >=1 caller (the :109 spread site resolves via sameFileByName); got ${callers.length}`);
    assert.ok(!f.nodes.some((n) => n.id === 'minhash.mjs:PERM_SEEDS'),
      'minhash.mjs:PERM_SEEDS (an IIFE-initialized const) must not be a node of any kind');
  } finally { cleanup(dir); }
});
