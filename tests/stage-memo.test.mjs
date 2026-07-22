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
// S5 (round 2, #19): a byte-tampered-but-PARSEABLE graph.json forces recompute — the memo's
//     per-output content hashes replace the old graphParses() belt, which only caught unparseable
//     truncation of graph.json alone.
// S6 (round 2, #19): a tampered report.md forces recompute — the other four outputs had NO belt.

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

// Same-length byte tamper: swaps the LAST two differing adjacent chars it can find, keeping the
// file parseable where relevant (a label swap inside a JSON string) — size checks alone must miss
// it, only a content hash catches it.
const sameLengthTamper = (p) => {
  const s = readFileSync(p, 'utf8');
  const i = s.lastIndexOf('ab'); // any 2-char window; fall back to swapping two known chars
  const at = i !== -1 ? i : s.length - 4;
  const t = s.slice(0, at) + s[at + 1] + s[at] + s.slice(at + 2);
  assert.equal(t.length, s.length);
  assert.notEqual(t, s, 'tamper changed bytes');
  writeFileSync(p, t);
};

test('S5: byte-tampered-but-parseable graph.json forces recompute (content hash, not a parse)', () => {
  const dir = tmpDir('codeweb-memo-');
  try {
    writeTree(dir, FIXTURE);
    const ws = join(dir, 'ws');
    runPipeline(dir, ws);
    // tamper a node label inside the JSON — same byte length, still parses
    const p = join(ws, 'graph.json');
    const g = readFileSync(p, 'utf8');
    const tampered = g.replace('"beta"', '"betb"');
    assert.notEqual(tampered, g, 'fixture guarantees a beta label to tamper');
    assert.equal(tampered.length, g.length);
    JSON.parse(tampered); // parseable — the OLD belt (graphParses) would have reused this
    writeFileSync(p, tampered);
    const after = runPipeline(dir, ws);
    assert.ok(!reused(after), 'tampered graph.json -> stages re-run');
    assert.ok(readFileSync(p, 'utf8').includes('"beta"'), 'graph.json recomputed clean');
  } finally { cleanup(dir); }
});

test('S6: a tampered report.md forces recompute (the four non-graph outputs are guarded too)', () => {
  const dir = tmpDir('codeweb-memo-');
  try {
    writeTree(dir, FIXTURE);
    const ws = join(dir, 'ws');
    runPipeline(dir, ws);
    sameLengthTamper(join(ws, 'report.md'));
    const after = runPipeline(dir, ws);
    assert.ok(!reused(after), 'tampered report.md -> stages re-run');
  } finally { cleanup(dir); }
});
