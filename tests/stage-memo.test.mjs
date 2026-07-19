// Spec B (docs/specs/perf-stage-memo-scale.md): cluster/overlap/optimize/report are pure
// functions of the extracted fragment (+ CODEWEB_* levers), so run.mjs memoizes them — a re-run
// whose fragment is byte-identical reuses the outputs instead of recomputing ~2.8s of stages.
// Memoization may change wall-time ONLY: outputs are byte-identical modulo meta.generatedAt
// (the one wall-clock stamp, normalized here).
//
// S1: second run skips all four stages; outputs equal a forced --full rerun.
// S2: touching a source file invalidates — stages re-run.
// S3: a deleted output invalidates — stages re-run and the file is restored.
// S4: a CODEWEB_* lever change invalidates — memoized outputs are never served across configs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, tmpDir, cleanup, writeTree, script } from './helpers.mjs';

const RUN = script('run.mjs');
const OUTPUTS = ['graph.json', 'overlap.md', 'optimize.md', 'report.html', 'report.md'];

const FIXTURE = {
  'src/a.js': 'export function alpha(x) {\n  return beta(x) + 1;\n}\n',
  'src/b.js': "import { alpha } from './a.js';\nexport function beta(x) {\n  return x * 2;\n}\nexport function gamma() {\n  return alpha(3);\n}\n",
};

const norm = (buf) => String(buf).replace(/"generatedAt":\s*"[^"]*"/g, '"generatedAt":"<t>"');

function runPipeline(dir, ws, extra = [], env = {}) {
  const r = runNode(RUN, [join(dir, 'src'), '--out-dir', ws, ...extra], { env });
  assert.equal(r.status, 0, r.stderr);
  return r.stderr;
}
const reused = (stderr) => /stages? reused/i.test(stderr);

test('S1: identical fragment -> all four stages reused, outputs equal a --full rerun (mod generatedAt)', () => {
  const dir = tmpDir('codeweb-memo-');
  try {
    writeTree(dir, FIXTURE);
    const ws = join(dir, 'ws');
    const first = runPipeline(dir, ws);
    assert.ok(!reused(first), 'first run computes');
    const second = runPipeline(dir, ws);
    assert.ok(reused(second), `second run reuses (stderr: ${second})`);
    assert.match(second, /\[run\] extract/, 'extract always runs (it is the change detector)');
    assert.ok(!/\[run\] cluster/.test(second), 'cluster skipped');
    assert.ok(!/\[run\] report/.test(second), 'report skipped');
    const memoized = OUTPUTS.map((f) => norm(readFileSync(join(ws, f))));
    const third = runPipeline(dir, ws, ['--full']);
    assert.ok(!reused(third), '--full forces recompute');
    OUTPUTS.forEach((f, i) => {
      assert.equal(memoized[i], norm(readFileSync(join(ws, f))), `${f}: memoized bytes == recomputed bytes`);
    });
  } finally { cleanup(dir); }
});

test('S2: a source edit invalidates the memo', () => {
  const dir = tmpDir('codeweb-memo-');
  try {
    writeTree(dir, FIXTURE);
    const ws = join(dir, 'ws');
    runPipeline(dir, ws);
    writeFileSync(join(dir, 'src/b.js'), readFileSync(join(dir, 'src/b.js'), 'utf8') + 'export function delta() {\n  return 4;\n}\n');
    const after = runPipeline(dir, ws);
    assert.ok(!reused(after), 'changed fragment -> stages re-run');
    assert.ok(readFileSync(join(ws, 'graph.json'), 'utf8').includes('delta'), 'new symbol reached the graph');
  } finally { cleanup(dir); }
});

test('S3: a missing output invalidates the memo and is restored', () => {
  const dir = tmpDir('codeweb-memo-');
  try {
    writeTree(dir, FIXTURE);
    const ws = join(dir, 'ws');
    runPipeline(dir, ws);
    rmSync(join(ws, 'report.html'));
    const after = runPipeline(dir, ws);
    assert.ok(!reused(after), 'damaged workspace -> recompute');
    assert.ok(existsSync(join(ws, 'report.html')), 'output restored');
  } finally { cleanup(dir); }
});

test('S4: a CODEWEB_* lever change invalidates the memo', () => {
  const dir = tmpDir('codeweb-memo-');
  try {
    writeTree(dir, FIXTURE);
    const ws = join(dir, 'ws');
    runPipeline(dir, ws);
    const after = runPipeline(dir, ws, [], { CODEWEB_ALL_ROLES: '1' });
    assert.ok(!reused(after), 'a lever changes downstream behavior -> never serve the memo');
  } finally { cleanup(dir); }
});
