// Spec C (docs/specs/bench-all-ci-gates.md): bench:all is the standing measurement behind every
// published number, and --gate turns its budgets into CI promises. BDD:
//   B1 given a mapped fixture, when bench:all runs, then benchmarks.json carries every section,
//      all session responses are valid JSON, and the site mirror is byte-identical.
//   B2 given a budget lowered below reality, when --gate runs, then exit 1 names the violation
//      (and the real budgets pass).
//   B3 given a ledger claim citing a missing source, then the claims audit fails naming it.
//   B4 given no corpus, then the tsEngine section says skipped — with the reason, never silently.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, tmpDir, cleanup, writeTree, readJSON, PLUGIN_ROOT } from './helpers.mjs';
import { auditClaims, sourceExists } from '../scripts/lib/claims-check.mjs';

const ALL = join(PLUGIN_ROOT, 'bench', 'all.mjs');

const FIXTURE = {
  'src/a.js': 'export function alpha(x) {\n  return beta(x) + 1;\n}\n',
  'src/b.js': "import { alpha } from './a.js';\nexport function beta(x) {\n  return x * 2;\n}\nexport function gamma() {\n  return alpha(3) + beta(1);\n}\n",
};

function runAll(dir, extra = []) {
  const out = join(dir, 'benchmarks.json'), site = join(dir, 'site-mirror.json');
  const r = runNode(ALL, ['--target', join(dir, 'src'), '--ws', join(dir, 'ws'), '--corpus', join(dir, 'no-such-corpus'), '--out', out, '--site', site, ...extra]);
  return { r, out, site };
}

test('B1+B4: sections present, session valid, mirror byte-identical, corpus skip explicit', () => {
  const dir = tmpDir('codeweb-benchall-');
  try {
    writeTree(dir, FIXTURE);
    const { r, out, site } = runAll(dir);
    assert.equal(r.status, 0, r.stderr);
    const b = readJSON(out);
    for (const k of ['pipeline', 'session', 'toolBudgets', 'advisors', 'loaded', 'tsEngine', 'budgets', 'ranAt']) assert.ok(b[k], `section ${k} present`);
    assert.equal(b.session.allValidJson, true, 'every MCP response parsed and succeeded');
    assert.equal(b.session.calls.length, 12, 'the representative session is 12 calls');
    assert.equal(b.pipeline.stagesReused, true, 'the no-change rerun reused stages');
    assert.ok(b.pipeline.stageMs && b.pipeline.stageMs.extract >= 0, 'per-stage times parsed from run.mjs stderr (finding 13a)');
    for (const [name, a] of Object.entries(b.advisors)) assert.equal(a.ok, true, `advisor ${name} ran clean (finding 13c)`);
    assert.equal(b.loaded.ok, true, 'loaded corpus mapped');
    assert.ok(b.loaded.overlapFindings >= 15, `loaded corpus triggers the machinery (${b.loaded.overlapFindings} findings; 15 clusters planted) (finding 13b)`);
    assert.equal(b.loaded.lshEngaged, true, 'the LSH path engages on its own at loaded-corpus scale');
    assert.equal(readFileSync(out, 'utf8'), readFileSync(site, 'utf8'), 'site mirror is byte-identical');
    assert.match(b.tsEngine.skipped || '', /corpus absent/, 'B4: skip carries its reason');
  } finally { cleanup(dir); }
});

test('B2: a lowered budget fails the gate by name; real budgets pass', () => {
  const dir = tmpDir('codeweb-benchall-');
  try {
    writeTree(dir, FIXTURE);
    const tight = join(dir, 'tight.json');
    writeFileSync(tight, JSON.stringify({ sessionTokensMax: 20000, perToolBytesMax: 10, warmRefreshFactorMax: 2.0, loadedOverlapFindingsMin: 99999 }));
    const bad = runAll(dir, ['--budgets', tight, '--gate']);
    assert.equal(bad.r.status, 1, 'gate fails');
    assert.match(bad.r.stderr, /perToolBytesMax/, 'violation named');
    assert.match(bad.r.stderr, /loadedOverlapFindingsMin/, 'loaded-corpus violation named too (finding 13b)');
    const good = runAll(dir, ['--gate']);
    assert.equal(good.r.status, 0, `real budgets hold (${good.r.stderr})`);
  } finally { cleanup(dir); }
});

test('B3: claims audit fails on a missing source and passes on the real tree', () => {
  const missing = auditClaims(PLUGIN_ROOT, {
    product: { claims: [{ claim: 'ghost', source: 'no-such-file.json' }], proof: { headline: [] } },
    readme: '',
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.missing[0].source, 'no-such-file.json');

  const product = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'site', 'data', 'product.json'), 'utf8'));
  const readme = readFileSync(join(PLUGIN_ROOT, 'README.md'), 'utf8');
  const real = auditClaims(PLUGIN_ROOT, { product, readme });
  assert.deepEqual(real.missing, [], 'every shipped claim source exists');
  assert.equal(sourceExists(PLUGIN_ROOT, 'oracle-ab.json'), true, 'bare bench/results filenames resolve');
});
