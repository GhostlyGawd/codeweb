// Spec D (docs/specs/replay-corpus-v3.md): the replay analyzer gains cost-to-coverage — the
// secondary metric that discriminates even when both arms hit the coverage ceiling ("same
// safety, what price"). Cost comes from the harness's own token accounting (budget.spent()
// deltas), never solver self-report; cells without recorded cost are excluded from means and
// COUNTED, never fabricated.
//
// C1: per-condition means + costToFullCoverage computed exactly from synthetic cells.
// C2: analyzer output is byte-identical across runs on the same raw set.
// C4 (partial): cells lacking cost -> cost.reported < cost.of, means over reported only.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, tmpDir, cleanup, readJSON, PLUGIN_ROOT } from './helpers.mjs';

const ANALYZE = join(PLUGIN_ROOT, 'bench', 'experiments', 'replay-analyze.mjs');

const cell = (condition, rep, covered, total, cost) => ({
  task: 't1', condition, rep,
  grading: { missedCovered: covered, missedTotal: total },
  result: {
    completed: true, filesChanged: [], gate: { structuralRegressions: 0, lostCallers: 0 },
    ...(condition === 'treatment' ? { ambientContextNoted: 'read the card' } : {}),
    ...(cost ? { cost } : {}),
  },
});

const RAW = {
  experiment: 'synthetic',
  cells: [
    cell('control', 0, 2, 2, { tokens: 9000, toolCalls: 24 }),
    cell('control', 1, 1, 2, { tokens: 7000, toolCalls: 18 }),
    cell('control', 2, 2, 2, null), // no cost recorded -> excluded from means, counted
    cell('treatment', 0, 2, 2, { tokens: 4000, toolCalls: 9 }),
    cell('treatment', 1, 2, 2, { tokens: 6000, toolCalls: 13 }),
    cell('treatment', 2, 1, 2, { tokens: 5000, toolCalls: 11 }),
  ],
};

function analyze(dir) {
  const rawPath = join(dir, 'raw.json'), outPath = join(dir, 'out.json');
  writeFileSync(rawPath, JSON.stringify(RAW));
  const r = runNode(ANALYZE, [rawPath, outPath]);
  assert.equal(r.status, 0, r.stderr);
  return { out: readJSON(outPath), bytes: readFileSync(outPath, 'utf8') };
}

test('C1+C4: cost-to-coverage per condition — means over reported cells only, missing counted', () => {
  const dir = tmpDir('codeweb-replayan-');
  try {
    const { out } = analyze(dir);
    const cc = out.perCondition.control.cost;
    assert.equal(cc.reported, 2, 'two control cells carried cost');
    assert.equal(cc.of, 3, 'of three completed');
    assert.equal(cc.meanTokens, 8000, '(9000+7000)/2 — the costless cell never fabricates');
    assert.equal(cc.meanToolCalls, 21);
    assert.equal(cc.costToFullCoverageTokens, 9000, 'only the full-coverage cell WITH cost counts');
    const tc = out.perCondition.treatment.cost;
    assert.equal(tc.reported, 3);
    assert.equal(tc.meanTokens, 5000);
    assert.equal(tc.costToFullCoverageTokens, 5000, '(4000+6000)/2 full-coverage cells');
    assert.ok(out.secondaryMetric && /cost/i.test(out.secondaryMetric), 'secondary metric declared');
  } finally { cleanup(dir); }
});

test('C2: analyzer output byte-identical across runs', () => {
  const a = tmpDir('codeweb-replayan-'), b = tmpDir('codeweb-replayan-');
  try {
    assert.equal(analyze(a).bytes, analyze(b).bytes);
  } finally { cleanup(a); cleanup(b); }
});
