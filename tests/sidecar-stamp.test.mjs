// D3a (reports/DEBT.md §5): loadStamped is THE one reader of the sidecar freshness rule that
// lib/sidecars.mjs mints. Pin the contract: fresh stamp + matching version -> parsed doc; every
// non-fresh case (stale mtime, stale size, wrong version, missing stamp, missing sidecar,
// malformed JSON, missing graph) -> null, and none of them throws.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpDir, cleanup } from './helpers.mjs';
import { loadStamped } from '../scripts/lib/sidecar-stamp.mjs';

// Write graph.json + side.json where side.json carries `version` and a stamp derived from one
// stat of the graph, optionally poisoned — the exact write-side convention of lib/sidecars.mjs.
function writePair(dir, { version = 3, poison = {} } = {}) {
  const graph = join(dir, 'graph.json');
  writeFileSync(graph, '{"nodes":[],"edges":[]}');
  const st = statSync(graph);
  const stamp = { graphMtimeMs: st.mtimeMs, graphSize: st.size, ...poison };
  writeFileSync(join(dir, 'side.json'), JSON.stringify({ version, stamp, payload: 'ok' }));
  return graph;
}

test('fresh stamp + matching version -> the parsed doc', () => {
  const dir = tmpDir('codeweb-stamp-');
  try {
    const graph = writePair(dir);
    const doc = loadStamped(graph, 'side.json', 3);
    assert.equal(doc?.payload, 'ok');
  } finally { cleanup(dir); }
});

test('version mismatch -> null (stale schema never served)', () => {
  const dir = tmpDir('codeweb-stamp-');
  try {
    const graph = writePair(dir, { version: 2 });
    assert.equal(loadStamped(graph, 'side.json', 3), null);
  } finally { cleanup(dir); }
});

test('stale mtime -> null', () => {
  const dir = tmpDir('codeweb-stamp-');
  try {
    const graph = writePair(dir, { poison: { graphMtimeMs: -1 } });
    assert.equal(loadStamped(graph, 'side.json', 3), null);
  } finally { cleanup(dir); }
});

test('stale size -> null', () => {
  const dir = tmpDir('codeweb-stamp-');
  try {
    const graph = writePair(dir, { poison: { graphSize: 999999 } });
    assert.equal(loadStamped(graph, 'side.json', 3), null);
  } finally { cleanup(dir); }
});

test('graph rewritten after the sidecar stamped it -> null', () => {
  const dir = tmpDir('codeweb-stamp-');
  try {
    const graph = writePair(dir);
    writeFileSync(graph, '{"nodes":[],"edges":[],"meta":{}}'); // new bytes: size (and mtime) move
    assert.equal(loadStamped(graph, 'side.json', 3), null);
  } finally { cleanup(dir); }
});

test('missing stamp, missing sidecar, malformed JSON, missing graph -> null, never throws', () => {
  const dir = tmpDir('codeweb-stamp-');
  try {
    const graph = writePair(dir);
    writeFileSync(join(dir, 'side.json'), JSON.stringify({ version: 3, payload: 'ok' }));
    assert.equal(loadStamped(graph, 'side.json', 3), null, 'missing stamp');
    writeFileSync(join(dir, 'side.json'), 'not json {');
    assert.equal(loadStamped(graph, 'side.json', 3), null, 'malformed JSON');
    assert.equal(loadStamped(graph, 'absent.json', 3), null, 'missing sidecar');
    writePair(dir); // restore a fresh pair, then remove the graph itself
    rmSync(graph);
    assert.equal(loadStamped(graph, 'side.json', 3), null, 'missing graph');
  } finally { cleanup(dir); }
});
