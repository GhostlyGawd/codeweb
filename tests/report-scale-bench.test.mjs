// Spec L (docs/specs/report-at-scale.md): report.html browser behavior is MEASURED, not assumed.
// bench/experiments/report-scale.mjs loads a built report in headless Chromium and records
// load/graph-ready/layout-settle/search latencies + heap. These tests pin the harness on a small
// fixture report; the committed 16k-symbol numbers come from running the same harness for real.
//
// L1: the harness emits the full schema with sane values on a fixture report.
// L2: fail-loud — a file that is not a codeweb report exits nonzero with a clear error,
//     never a JSON full of bogus timings.
//
// Skipped when playwright is not resolvable (CI stays zero-dep; the bench is a dev-side tool).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, tmpDir, cleanup, writeTree, script, readJSON, PLUGIN_ROOT } from './helpers.mjs';

const RUN = script('run.mjs');
const BENCH = join(PLUGIN_ROOT, 'bench', 'experiments', 'report-scale.mjs');

let HAVE_PW = false;
try {
  const { resolvePlaywright } = await import(BENCH);
  HAVE_PW = !!resolvePlaywright();
} catch { /* bench script missing/broken -> tests run and fail loudly */ }
const SKIP = HAVE_PW ? false : 'playwright not resolvable';

const FIXTURE = {
  'src/a.js': 'export function alpha(x) {\n  return beta(x) + 1;\n}\n',
  'src/b.js': "import { alpha } from './a.js';\nexport function beta(x) {\n  return x * 2;\n}\nexport function gamma() {\n  return alpha(3);\n}\n",
};

test('L1: harness emits the full measurement schema on a fixture report', { skip: SKIP }, () => {
  const dir = tmpDir('codeweb-reportscale-');
  try {
    writeTree(dir, FIXTURE);
    const ws = join(dir, 'ws');
    const built = runNode(RUN, [join(dir, 'src'), '--out-dir', ws]);
    assert.equal(built.status, 0, built.stderr);
    const out = join(dir, 'report-scale.json');
    const r = runNode(BENCH, ['--report', join(ws, 'report.html'), '--out', out, '--label', 'fixture']);
    assert.equal(r.status, 0, r.stderr);
    const j = readJSON(out);
    assert.equal(j.label, 'fixture');
    assert.ok(j.reportBytes > 0, 'report size recorded');
    assert.ok(j.graph.symbols > 0, 'symbol count carried into the row');
    for (const k of ['domContentLoadedMs', 'loadMs', 'timeToGraphMs', 'layoutSettleMs', 'searchMs']) {
      assert.ok(Number.isFinite(j[k]) && j[k] >= 0, `${k} measured (${j[k]})`);
    }
    assert.ok(j.heapUsedBytes === null || j.heapUsedBytes > 0, 'heap recorded when the browser exposes it');
    assert.ok(j.chromiumVersion, 'environment noted');
  } finally { cleanup(dir); }
});

test('L2: a non-report input fails loudly, never emitting bogus timings', { skip: SKIP }, () => {
  const dir = tmpDir('codeweb-reportscale-');
  try {
    const bogus = join(dir, 'not-a-report.html');
    writeFileSync(bogus, '<!doctype html><title>nope</title><p>hello</p>');
    writeFileSync(join(dir, 'graph.json'), '{"nodes":[],"edges":[]}'); // reach the in-browser probe
    const out = join(dir, 'x.json');
    const r = runNode(BENCH, ['--report', bogus, '--out', out]);
    assert.notEqual(r.status, 0, 'exits nonzero');
    assert.match(r.stderr, /not a codeweb report|graph tab|gsearch/i, 'says WHY');
  } finally { cleanup(dir); }
});
