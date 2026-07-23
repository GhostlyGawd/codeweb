// scripts/lib/sidecars.mjs — the ONE map-time sidecar-trio writer (round 2, finding #25). Pins:
//  - byte-identical migration: writeSidecars ≡ the individual builders the build-report block used;
//  - similar-index's two paths (root readable → rebuilt; root absent/gone → removed, never stale);
//  - the stamp convention (ONE stat shared by the trio) and all three loaders returning non-null;
//  - the crash-window property (graph rewritten after the trio → every loader falls back to null);
//  - hook parity after a refresh (session-brief sidecar path ≡ graph path, byte-identical).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, statSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpDir, cleanup, script, writeTree, runNode } from './helpers.mjs';
import { writeSidecars } from '../scripts/lib/sidecars.mjs';
import { normalizeGraph, buildIndex } from '../scripts/lib/graph-ops.mjs';
import { buildBrief } from '../scripts/lib/brief-core.mjs';
import { buildIndexLite } from '../scripts/lib/index-lite.mjs';
import { buildSimilarIndex } from '../scripts/lib/similar-index.mjs';
import { loadBriefSidecar } from '../scripts/lib/brief-sidecar.mjs';
import { loadSimilarIndex } from '../scripts/lib/similar-index.mjs';
import { sourceReader, atomicWrite } from '../scripts/lib/cli.mjs';
import { preview as sessionBriefPreview } from '../hooks/session-brief.mjs';

const stampOf = (gp) => { const st = statSync(gp); return { graphMtimeMs: st.mtimeMs, graphSize: st.size }; };
const readSidecar = (dir, name) => readFileSync(join(dir, name), 'utf8');

// Write a small in-memory graph to <dir>/graph.json pointing at a real source tree; return paths.
function synthGraph(dir, { root } = {}) {
  const srcRoot = root === undefined ? join(dir, 'src') : root;
  if (root === undefined) writeTree(srcRoot, {
    'u.js': 'export function helper(x) {\n  if (x > 0) return x * 2;\n  return x - 1;\n}\nexport function other(y) {\n  return y + helper(y);\n}\n',
  });
  const graph = {
    meta: { target: 'synth', ...(root === null ? {} : { root: srcRoot.replace(/\\/g, '/') }) },
    nodes: [
      { id: 'u.js:helper', label: 'helper', kind: 'function', file: 'u.js', line: 1, loc: 4, exports: true, domain: 'lib' },
      { id: 'u.js:other', label: 'other', kind: 'function', file: 'u.js', line: 5, loc: 3, exports: true, domain: 'lib' },
    ],
    edges: [{ from: 'u.js:other', to: 'u.js:helper', kind: 'call' }],
    domains: [{ name: 'lib', nodes: 2, summary: '' }], overlaps: [],
  };
  const gp = join(dir, 'graph.json');
  atomicWrite(gp, JSON.stringify(normalizeGraph(graph)));
  return { gp, graph: normalizeGraph(JSON.parse(readFileSync(gp, 'utf8'))) };
}

// ---- byte-identical migration (build-report:77-89 → one writeSidecars call) -------------------
test('writeSidecars is byte-identical to the individual builders the old build-report block ran', () => {
  const dir = tmpDir('codeweb-sc-bi-');
  try {
    const src = join(dir, 'src');
    writeTree(src, { 'a.js': 'export function alpha() { return 1; }\n', 'b.js': 'import { alpha } from "./a.js";\nexport function beta() { return alpha() + 1; }\n' });
    const r = runNode(script('run.mjs'), [src, '--out-dir', join(dir, '.codeweb')]);
    assert.equal(r.status, 0, r.stderr);
    const cw = join(dir, '.codeweb'), gp = join(cw, 'graph.json');
    // The map (build-report → writeSidecars) wrote the trio; recompute via the exact builders + the
    // SAME stat and compare bytes. graph.json's final writer is build-report, so the stat is stable.
    const stamp = stampOf(gp);
    const graph = normalizeGraph(JSON.parse(readFileSync(gp, 'utf8')));
    const reader = sourceReader(graph.meta.root);
    assert.equal(readSidecar(cw, 'brief.json'), JSON.stringify({ version: 1, stamp, brief: buildBrief(graph, buildIndex(graph)) }), 'brief.json bytes');
    assert.equal(readSidecar(cw, 'index-lite.json'), JSON.stringify(buildIndexLite(graph, stamp, reader)), 'index-lite.json bytes');
    assert.equal(readSidecar(cw, 'similar-index.json'), JSON.stringify(buildSimilarIndex(graph, stamp, reader)), 'similar-index.json bytes');
  } finally { cleanup(dir); }
});

// ---- stamp convention: ONE stat shared by the trio; every loader non-null -----------------------
test('the trio shares ONE stamp === statSync(graph.json), and all three loaders return non-null', () => {
  const dir = tmpDir('codeweb-sc-stamp-');
  try {
    const { gp } = synthGraph(dir);
    const touched = writeSidecars(gp, normalizeGraph(JSON.parse(readFileSync(gp, 'utf8'))));
    assert.deepEqual(touched, ['brief', 'index-lite', 'similar-index']);
    const stamp = stampOf(gp);
    const brief = JSON.parse(readSidecar(dir, 'brief.json'));
    const lite = JSON.parse(readSidecar(dir, 'index-lite.json'));
    const sim = JSON.parse(readSidecar(dir, 'similar-index.json'));
    for (const [name, s] of [['brief', brief.stamp], ['index-lite', lite.stamp], ['similar-index', sim.stamp]]) {
      assert.deepEqual(s, stamp, `${name} stamp === the one graph stat`);
    }
    assert.ok(loadBriefSidecar(gp), 'brief loader non-null against the fresh graph');
    assert.ok(loadSimilarIndex(gp), 'similar-index loader non-null');
    assert.ok(lite.stamp.graphMtimeMs === statSync(gp).mtimeMs && lite.stamp.graphSize === statSync(gp).size, 'index-lite stamp matches (hook fast path engages)');
  } finally { cleanup(dir); }
});

// ---- similar-index: root readable → rebuilt; absent or set-but-gone → REMOVED (never stale) ------
test('similar-index is REBUILT when meta.root is readable', () => {
  const dir = tmpDir('codeweb-sc-simA-');
  try {
    const { gp } = synthGraph(dir);
    assert.deepEqual(writeSidecars(gp, normalizeGraph(JSON.parse(readFileSync(gp, 'utf8')))), ['brief', 'index-lite', 'similar-index']);
    assert.ok(existsSync(join(dir, 'similar-index.json')) && loadSimilarIndex(gp), 'rebuilt + loadable');
  } finally { cleanup(dir); }
});

test('similar-index is REMOVED when meta.root is absent (brief + index-lite still written)', () => {
  const dir = tmpDir('codeweb-sc-simB-');
  try {
    const { gp } = synthGraph(dir, { root: null }); // no meta.root
    writeFileSync(join(dir, 'similar-index.json'), '{"stale":true}'); // a stale one is present
    const touched = writeSidecars(gp, normalizeGraph(JSON.parse(readFileSync(gp, 'utf8'))));
    assert.deepEqual(touched, ['brief', 'index-lite', 'similar-index removed']);
    assert.ok(!existsSync(join(dir, 'similar-index.json')), 'the stale similar-index is removed, never silently served');
    assert.equal(loadSimilarIndex(gp), null, 'loader → null → the live path');
    assert.ok(existsSync(join(dir, 'brief.json')) && existsSync(join(dir, 'index-lite.json')), 'brief + index-lite still written (graph-pure)');
  } finally { cleanup(dir); }
});

test('similar-index is REMOVED when meta.root is set but gone from disk', () => {
  const dir = tmpDir('codeweb-sc-simC-');
  try {
    const { gp } = synthGraph(dir, { root: join(dir, 'was-here-now-deleted') });
    writeFileSync(join(dir, 'similar-index.json'), '{"stale":true}');
    assert.deepEqual(writeSidecars(gp, normalizeGraph(JSON.parse(readFileSync(gp, 'utf8')))), ['brief', 'index-lite', 'similar-index removed']);
    assert.ok(!existsSync(join(dir, 'similar-index.json')), 'removed when the recorded root no longer exists');
  } finally { cleanup(dir); }
});

// ---- crash-window property: graph rewritten after the trio → every loader falls back to null -----
test('crash-window: a graph rewritten after the sidecars leaves only stamp-MISMATCHED sidecars (all loaders null)', () => {
  const dir = tmpDir('codeweb-sc-crash-');
  try {
    const { gp } = synthGraph(dir);
    writeSidecars(gp, normalizeGraph(JSON.parse(readFileSync(gp, 'utf8'))));
    assert.ok(loadBriefSidecar(gp) && loadSimilarIndex(gp), 'fresh before the rewrite');
    // Simulate a crash BETWEEN a later graph write and its sidecar rebuild: rewrite graph.json only.
    const g2 = normalizeGraph(JSON.parse(readFileSync(gp, 'utf8')));
    g2.nodes.push({ id: 'u.js:added', label: 'added', kind: 'function', file: 'u.js', line: 8, loc: 1, exports: true, domain: 'lib' });
    atomicWrite(gp, JSON.stringify(g2)); // new mtime + size, sidecars NOT rebuilt
    assert.equal(loadBriefSidecar(gp), null, 'brief loader → null (stamp mismatch)');
    assert.equal(loadSimilarIndex(gp), null, 'similar loader → null (stamp mismatch)');
    const lite = JSON.parse(readSidecar(dir, 'index-lite.json'));
    const st = statSync(gp);
    assert.ok(lite.stamp.graphMtimeMs !== st.mtimeMs || lite.stamp.graphSize !== st.size, 'index-lite stamp no longer matches → hook takes the graph path');
  } finally { cleanup(dir); }
});

// ---- hook parity AFTER a refresh: session-brief sidecar path ≡ graph path (byte-identical) --------
test('after a refresh, session-brief preview() is byte-identical from the sidecar path and the graph path', () => {
  const dir = tmpDir('codeweb-sc-hook-');
  try {
    const src = join(dir, 'src');
    writeTree(src, { 'main.js': 'import { helper } from "./util.js";\nexport function main() { return helper(2); }\n', 'util.js': 'export function helper(x) { return x * 2; }\n' });
    // Map so cwd walk-up finds <dir>/.codeweb/graph.json.
    assert.equal(runNode(script('run.mjs'), [src, '--out-dir', join(dir, '.codeweb')]).status, 0);
    const gp = join(dir, '.codeweb', 'graph.json');
    // Edit + refresh (which rebuilds the brief sidecar against the new graph).
    writeFileSync(join(src, 'util.js'), readFileSync(join(src, 'util.js'), 'utf8') + '\nexport function two() { return 2; }\n');
    // refresh keys sidecars beside the graph; run it against <dir>/.codeweb/graph.json.
    // NB the refresh CLI resolves meta.root from the graph, so it re-extracts src.
    assert.equal(runNode(script('refresh.mjs'), [gp]).status, 0);
    const raw = JSON.stringify({ cwd: dir });
    const fromSidecar = sessionBriefPreview(raw);
    assert.ok(loadBriefSidecar(gp), 'the refreshed brief sidecar is fresh (loads non-null)');
    // Remove the sidecar → the fallback graph path renders the same brief.
    rmSync(join(dir, '.codeweb', 'brief.json'));
    const fromGraph = sessionBriefPreview(raw);
    assert.equal(fromSidecar, fromGraph, 'refreshed sidecar path ≡ graph path (parity is the correctness contract)');
  } finally { cleanup(dir); }
});
