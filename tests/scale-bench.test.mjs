// Spec K (docs/specs/bench-scale-runnable.md): the monorepo scale test becomes a RUNNABLE
// experiment. run.mjs prints per-stage wall-time on stderr (never touching an artifact byte),
// and bench/experiments/scale.mjs drives cold / no-change / one-file-edit passes + query
// timings against any checkout, emitting one traceable JSON.
//
// K1: every executed stage prints "done in <N>ms" on stderr; artifacts stay byte-identical
//     across two cold runs (mod generatedAt) — timing never leaks into outputs.
// K2: scale.mjs emits the full schema on a tiny fixture and restores the edited source file
//     byte-identically.
// K3: reuse honesty — stagesReused reflects the banner, pinned at the parser level.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, tmpDir, cleanup, writeTree, script, readJSON, PLUGIN_ROOT } from './helpers.mjs';

const RUN = script('run.mjs');
const SCALE = join(PLUGIN_ROOT, 'bench', 'experiments', 'scale.mjs');
const OUTPUTS = ['graph.json', 'overlap.md', 'optimize.md', 'report.html', 'report.md'];
const STAGES = ['extract', 'cluster', 'overlap', 'optimize', 'report'];

const FIXTURE = {
  'src/a.js': 'export function alpha(x) {\n  return beta(x) + 1;\n}\n',
  'src/b.js': "import { alpha } from './a.js';\nexport function beta(x) {\n  return x * 2;\n}\nexport function gamma() {\n  return alpha(3);\n}\n",
};

const norm = (buf) => String(buf).replace(/"generatedAt":\s*"[^"]*"/g, '"generatedAt":"<t>"');

test('K1: per-stage timing on stderr, artifacts byte-identical across cold runs', () => {
  const dir = tmpDir('codeweb-scalebench-');
  try {
    writeTree(dir, FIXTURE);
    const wsA = join(dir, 'ws-a');
    const wsB = join(dir, 'ws-b');
    const a = runNode(RUN, [join(dir, 'src'), '--out-dir', wsA]);
    assert.equal(a.status, 0, a.stderr);
    for (const s of STAGES) {
      assert.match(a.stderr, new RegExp(`\\[run\\] ${s} done in \\d+ms`), `stage '${s}' reports its wall-time`);
    }
    const b = runNode(RUN, [join(dir, 'src'), '--out-dir', wsB]);
    assert.equal(b.status, 0, b.stderr);
    for (const f of OUTPUTS) {
      assert.equal(norm(readFileSync(join(wsA, f))), norm(readFileSync(join(wsB, f))),
        `${f}: timing is stderr-only — two cold runs stay byte-identical (mod generatedAt)`);
    }
  } finally { cleanup(dir); }
});

test('K2: scale.mjs emits the full schema and restores the edited source byte-identically', () => {
  const dir = tmpDir('codeweb-scalebench-');
  try {
    writeTree(dir, FIXTURE);
    const src = join(dir, 'src');
    const before = Object.fromEntries(readdirSync(src).map((f) => [f, readFileSync(join(src, f), 'utf8')]));
    const out = join(dir, 'scale.json');
    const r = runNode(SCALE, ['--repo', src, '--out', out, '--label', 'fixture']);
    assert.equal(r.status, 0, r.stderr);

    const j = readJSON(out);
    assert.equal(j.target.label, 'fixture');
    assert.ok(j.engine.version, 'engine version recorded');
    assert.ok(j.graph.symbols > 0 && j.graph.edges > 0 && j.graph.files === 2, `graph stats (${JSON.stringify(j.graph)})`);
    assert.ok(j.pipeline.cold.totalMs > 0, 'cold total measured');
    for (const s of STAGES) {
      assert.ok(Number.isFinite(j.pipeline.cold.stagesMs[s]), `cold per-stage ms for '${s}'`);
    }
    assert.ok(j.pipeline.noChange.totalMs > 0, 'no-change total measured');
    assert.equal(j.pipeline.noChange.stagesReused, true, 'no-change re-run reused the stages');
    assert.ok(j.pipeline.oneFileEdit.totalMs > 0, 'one-file-edit total measured');
    assert.ok(j.pipeline.oneFileEdit.editedFile, 'edited file recorded');
    assert.equal(j.pipeline.oneFileEdit.changedFragment, true, 'the edit really invalidated the fragment');
    for (const s of STAGES) {
      assert.ok(Number.isFinite(j.pipeline.oneFileEdit.stagesMs[s]), `edit per-stage ms for '${s}'`);
    }
    assert.ok(j.queries.symbol, 'hub symbol recorded');
    for (const q of ['impactMs', 'callersMs', 'cyclesMs', 'orphansMs']) {
      assert.ok(Number.isFinite(j.queries[q]) && j.queries[q] >= 0, `query timing '${q}'`);
    }

    const after = Object.fromEntries(readdirSync(src).map((f) => [f, readFileSync(join(src, f), 'utf8')]));
    assert.deepEqual(after, before, 'source tree restored byte-identically after the edit pass');
  } finally { cleanup(dir); }
});

test('K3: stagesReused honesty is pinned at the parser level', async () => {
  const { parseStageTimes, sawReuseBanner } = await import(SCALE);
  assert.deepEqual(
    parseStageTimes('[run] extract done in 12ms\nnoise\n[run] overlap done in 340ms\n'),
    { extract: 12, overlap: 340 },
  );
  assert.equal(sawReuseBanner('[run] extract done in 5ms\n[run] stages reused (fragment unchanged) — skipping downstream recompute; --full forces\n'), true);
  assert.equal(sawReuseBanner('[run] extract done in 5ms\n[run] cluster done in 9ms\n'), false, 'no banner -> never claim reuse');
});
