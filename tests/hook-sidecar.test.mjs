// Spec P (docs/specs/fastpath-decision.md): the pre-edit hook's per-edit cost at 16k symbols was
// measured at ~350ms — a full 13.5MB graph parse PLUS an explain.mjs subprocess (which parses it
// again), on EVERY agent edit. The fix is a slim sidecar: at map time the report stage writes
// index-lite.json (per-file counts + the top symbol's pre-built card) next to graph.json; the hook
// serves from it when its stamp matches graph.json (mtime+size — no graph parse), and falls back
// to the graph path otherwise. Byte-parity between the two paths is the contract.
//
// P1: mapping writes the sidecar; hook output is byte-identical served from sidecar vs graph.
// P2: stale/corrupt sidecar -> silent fallback to the graph path, same correct output.
// P3: the sidecar is slim (a small fraction of graph.json).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, tmpDir, cleanup, writeTree, script } from './helpers.mjs';
import { preview } from '../hooks/pre-edit-impact.mjs';

const RUN = script('run.mjs');

const FIXTURE = {
  'core/util.js': 'export function fmtId(x) {\n  return String(x).trim();\n}\nexport function fmtAll(xs) {\n  return xs.map(fmtId);\n}\n',
  'app.js': "import { fmtId, fmtAll } from './core/util.js';\nexport function main() {\n  return fmtAll([fmtId(1), fmtId(2)]);\n}\n",
  'app2.js': "import { fmtId } from './core/util.js';\nexport function render(x) {\n  return fmtId(x) + '!';\n}\n",
};

function mapFixture(dir) {
  const r = runNode(RUN, [dir, '--out-dir', join(dir, '.codeweb')]);
  assert.equal(r.status, 0, r.stderr);
}
const payloadFor = (fp) => JSON.stringify({ tool_input: { file_path: fp } });

test('P1: map writes index-lite.json; hook output byte-identical from sidecar vs graph', () => {
  const dir = tmpDir('codeweb-sidecar-');
  try {
    writeTree(dir, FIXTURE);
    mapFixture(dir);
    const sidecar = join(dir, '.codeweb', 'index-lite.json');
    assert.ok(existsSync(sidecar), 'the map wrote the sidecar next to graph.json');

    const fromSidecar = preview(payloadFor(join(dir, 'core/util.js')));
    assert.ok(fromSidecar, 'hook speaks for a load-bearing file');
    assert.match(fromSidecar, /editing core\/util\.js: \d+ symbol/, 'first line intact');

    rmSync(sidecar);
    const fromGraph = preview(payloadFor(join(dir, 'core/util.js')));
    assert.equal(fromSidecar, fromGraph, 'sidecar path and graph path produce identical bytes');
  } finally { cleanup(dir); }
});

test('P2: stale or corrupt sidecar falls back to the graph path silently', () => {
  const dir = tmpDir('codeweb-sidecar-');
  try {
    writeTree(dir, FIXTURE);
    mapFixture(dir);
    const graphPath = join(dir, '.codeweb', 'graph.json');
    const sidecar = join(dir, '.codeweb', 'index-lite.json');
    const want = preview(payloadFor(join(dir, 'core/util.js')));

    // stale: graph.json regenerated after the sidecar (stamp mismatch) — poison the sidecar to
    // prove the fresh answer can only have come from the graph path
    writeFileSync(sidecar, JSON.stringify({ version: 1, stamp: { graphMtimeMs: 1, graphSize: 1 }, files: {} }));
    const g = readFileSync(graphPath, 'utf8');
    writeFileSync(graphPath, g); // fresh mtime
    assert.equal(preview(payloadFor(join(dir, 'core/util.js'))), want, 'stale sidecar -> graph path, same output');

    // corrupt: unparseable sidecar never breaks the hook
    writeFileSync(sidecar, '{nope');
    assert.equal(preview(payloadFor(join(dir, 'core/util.js'))), want, 'corrupt sidecar -> graph path, same output');
  } finally { cleanup(dir); }
});

test('P3: the sidecar is slim relative to the graph', () => {
  const dir = tmpDir('codeweb-sidecar-');
  try {
    writeTree(dir, FIXTURE);
    mapFixture(dir);
    const graphB = statSync(join(dir, '.codeweb', 'graph.json')).size;
    const sideB = statSync(join(dir, '.codeweb', 'index-lite.json')).size;
    assert.ok(sideB < graphB / 2, `sidecar (${sideB}B) is a fraction of graph.json (${graphB}B)`);
  } finally { cleanup(dir); }
});
