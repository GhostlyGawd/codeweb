// F0 — graph freshness (incremental re-extraction). Tests first. ★ANTI-CHEAT F0-EQUIV pins the
// cached extractor to the no-cache full extractor (the independent oracle) after arbitrary edits;
// F0-ONLY-CHANGED is asserted IN THE SAME TEST so an "always rescan" implementation (which would
// pass F0-EQUIV trivially) fails the scan-count check. SC4 (global edge re-resolution) is stressed
// by renaming a symbol another, UNCHANGED file references.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, script, tmpDir, writeTree, cleanup } from './helpers.mjs';

const EXTRACT = script('extract-symbols.mjs');
const REFRESH = script('refresh.mjs');

const sortNodes = (g) => g.nodes.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
const sortEdges = (g) => g.edges.slice().sort((a, b) => { const ka = `${a.from} ${a.to} ${a.kind}`, kb = `${b.from} ${b.to} ${b.kind}`; return ka < kb ? -1 : ka > kb ? 1 : 0; });
const scannedCount = (stderr) => { const m = /scanned (\d+)/.exec(stderr); return m ? Number(m[1]) : null; };

function extract(dir, args = []) {
  const r = runNode(EXTRACT, [dir, ...args]);
  assert.equal(r.status, 0, r.stderr);
  return { frag: JSON.parse(r.stdout), scanned: scannedCount(r.stderr), stderr: r.stderr };
}

const TREE = {
  'a.js': 'export function aOne() { return 1; }\nexport function aTwo() { return aOne() + 1; }',
  'b.js': "import { aOne } from './a.js';\nexport function bOne() { return aOne() * 2; }",
  'c.js': 'export function cOne() { return 3; }',
};

// ★ANTI-CHEAT · F0-EQUIV (+ F0-ONLY-CHANGED in the same test)
test('F0-EQUIV: cache-extract ≡ full-extract after edits; F0-ONLY-CHANGED: scans == changed files', () => {
  const dir = tmpDir('cw-fresh-');
  const cache = join(dir, 'cache.json');
  try {
    writeTree(dir, TREE);
    // cold cache run scans everything
    const cold = extract(dir, ['--cache', cache]);
    assert.equal(cold.scanned, 3, `cold run should scan all 3 files (got ${cold.scanned})`);

    // edit exactly 2 files: rename aOne->aOneX in a.js (b.js, UNCHANGED, references aOne), and add cTwo to c.js
    writeFileSync(join(dir, 'a.js'), 'export function aOneX() { return 1; }\nexport function aTwo() { return aOneX() + 1; }');
    writeFileSync(join(dir, 'c.js'), 'export function cOne() { return 3; }\nexport function cTwo() { return cOne(); }');

    // warm cache run: scans ONLY the 2 changed files (b.js served from cache) — F0-ONLY-CHANGED
    const warm = extract(dir, ['--cache', cache]);
    assert.equal(warm.scanned, 2, `warm run should scan only the 2 changed files (got ${warm.scanned})`);

    // full no-cache extract of the edited tree = the independent oracle
    const full = extract(dir);

    // F0-EQUIV: identical node + edge SETS (order-independent). The cache changed the work, not the answer.
    assert.deepEqual(sortNodes(warm.frag), sortNodes(full.frag), 'cached nodes != full nodes after edits');
    assert.deepEqual(sortEdges(warm.frag), sortEdges(full.frag), 'cached edges != full edges after edits');

    // SC4 sanity: b.js was NOT rescanned yet its edge to the renamed symbol was globally re-resolved
    const bEdges = warm.frag.edges.filter((e) => e.from.startsWith('b.js:'));
    assert.ok(!bEdges.some((e) => e.to === 'a.js:aOne'), 'stale edge to renamed a.js:aOne must be gone');
  } finally { cleanup(dir); }
});

// F0-CACHE-NEUTRAL: same tree, --cache vs not → identical fragment (nodes + edges).
test('F0-CACHE-NEUTRAL: --cache vs no-cache → identical fragment on the same tree', () => {
  const dir = tmpDir('cw-fresh-n-');
  try {
    writeTree(dir, TREE);
    const cached = extract(dir, ['--cache', join(dir, 'c.json')]);
    const plain = extract(dir);
    assert.deepEqual(sortNodes(cached.frag), sortNodes(plain.frag));
    assert.deepEqual(sortEdges(cached.frag), sortEdges(plain.frag));
  } finally { cleanup(dir); }
});

// SC3: refresh.mjs updates nodes+edges to current disk, preserves meta, re-attaches domain, drops overlaps.
test('SC3: refresh updates nodes+edges, re-attaches domain by id, drops overlaps', () => {
  const dir = tmpDir('cw-fresh-r-');
  try {
    writeTree(dir, TREE);
    // seed a graph.json from a fresh extract, then hand-assign a domain + a stale overlap
    const { frag } = extract(dir);
    frag.meta.target = 'mytarget';
    for (const n of frag.nodes) if (n.id === 'a.js:aOne') n.domain = 'core';
    frag.domains = [{ name: 'core', nodes: 1 }];
    frag.overlaps = [{ id: 'ov1', kind: 'duplicate-logic', nodes: ['x', 'y'] }];
    const graphPath = join(dir, 'graph.json');
    writeFileSync(graphPath, JSON.stringify(frag));

    // edit source: add a function to b.js
    writeFileSync(join(dir, 'b.js'), "import { aOne } from './a.js';\nexport function bOne() { return aOne() * 2; }\nexport function bTwo() { return 9; }");

    const r = runNode(REFRESH, [graphPath, '--json']);
    assert.equal(r.status, 0, r.stderr);
    const updated = JSON.parse(readFileSync(graphPath, 'utf8'));

    // nodes match a fresh extract of current disk
    const oracle = extract(dir).frag;
    assert.deepEqual(sortNodes(updated).map((n) => n.id), sortNodes(oracle).map((n) => n.id));
    assert.ok(updated.nodes.some((n) => n.id === 'b.js:bTwo'), 'new symbol present after refresh');
    // domain re-attached for surviving id; overlaps dropped; meta preserved
    assert.equal(updated.nodes.find((n) => n.id === 'a.js:aOne').domain, 'core');
    assert.deepEqual(updated.overlaps, []);
    assert.equal(updated.meta.target, 'mytarget');
    assert.ok(updated.meta.root, 'meta.root preserved');
  } finally { cleanup(dir); }
});

// SC3: refresh with no meta.root → exit 2 with a reason.
test('SC3: refresh with missing meta.root → exit 2', () => {
  const dir = tmpDir('cw-fresh-nr-');
  try {
    const graphPath = join(dir, 'graph.json');
    writeFileSync(graphPath, JSON.stringify({ meta: {}, nodes: [], edges: [], domains: [], overlaps: [] }));
    const r = runNode(REFRESH, [graphPath]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /root/i);
  } finally { cleanup(dir); }
});
