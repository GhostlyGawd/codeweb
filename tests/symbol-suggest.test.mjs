// #2 (IMPROVEMENTS.md): a symbol miss must not be a dead end. The miss payload carries a hint
// (pointing at concept search) and up to 3 deterministic near-matches, on every transport:
// query-core (CLI + MCP structural queries), explain, and context-pack.

import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { runNode, script, tmpDir, cleanup } from './helpers.mjs';

const GRAPH = {
  meta: { target: 'fixture', root: '/nowhere' },
  domains: [],
  overlaps: [],
  nodes: [
    { id: 'src/path.js:normalizePath', label: 'normalizePath', kind: 'function', file: 'src/path.js', line: 1, loc: 3 },
    { id: 'src/path.js:cleanUrl', label: 'cleanUrl', kind: 'function', file: 'src/path.js', line: 5, loc: 3 },
    { id: 'src/store.js:createStore', label: 'createStore', kind: 'function', file: 'src/store.js', line: 1, loc: 3 },
  ],
  edges: [{ from: 'src/store.js:createStore', to: 'src/path.js:normalizePath', kind: 'call' }],
};

function withGraph(fn) {
  const dir = tmpDir('codeweb-suggest-');
  const graphPath = join(dir, 'graph.json');
  writeFileSync(graphPath, JSON.stringify(GRAPH));
  try { return fn(graphPath); } finally { cleanup(dir); }
}

test('S1 query miss exits 1 and suggests the near-match + concept search', () => {
  withGraph((graphPath) => {
    const r = runNode(script('query.mjs'), [graphPath, '--callers', 'normalisePath']);
    assert.equal(r.status, 1, 'still exit 1 (not found)');
    assert.match(r.stderr, /normalizePath/, 'suggests the near-match');
    assert.match(r.stderr, /find/i, 'points at concept search');
  });
});

test('S2 query miss --json carries hint + ranked suggestions with full ids', () => {
  withGraph((graphPath) => {
    const r = runNode(script('query.mjs'), [graphPath, '--callers', 'normalizepath', '--json']);
    assert.equal(r.status, 1);
    const p = JSON.parse(r.stdout);
    assert.equal(p.found, false);
    assert.match(p.hint, /codeweb_find/, 'hint names the concept-search tool');
    assert.ok(Array.isArray(p.suggestions) && p.suggestions.length >= 1, 'has suggestions');
    assert.equal(p.suggestions[0], 'src/path.js:normalizePath', 'case-insensitive match ranks first, as a full id');
  });
});

test('S3 suggestions are bounded (max 3) and deterministic', () => {
  withGraph((graphPath) => {
    const a = runNode(script('query.mjs'), [graphPath, '--impact', 'create', '--json']);
    const b = runNode(script('query.mjs'), [graphPath, '--impact', 'create', '--json']);
    assert.equal(a.status, 1);
    const pa = JSON.parse(a.stdout), pb = JSON.parse(b.stdout);
    assert.deepEqual(pa.suggestions, pb.suggestions, 'same input, same suggestions');
    assert.ok((pa.suggestions || []).length <= 3, 'at most 3');
    assert.ok(pa.suggestions.includes('src/store.js:createStore'), 'prefix match found');
  });
});

test('S4 a hopeless miss still gets the hint, without fabricated suggestions', () => {
  withGraph((graphPath) => {
    const r = runNode(script('query.mjs'), [graphPath, '--callers', 'zzz_qqq_www', '--json']);
    assert.equal(r.status, 1);
    const p = JSON.parse(r.stdout);
    assert.match(p.hint, /codeweb_find/);
    assert.ok(!p.suggestions || p.suggestions.length === 0, 'no junk suggestions');
  });
});

test('S5 explain miss carries the same hint + suggestions', () => {
  withGraph((graphPath) => {
    const r = runNode(script('explain.mjs'), [graphPath, 'normalisePath', '--json']);
    assert.equal(r.status, 1);
    const p = JSON.parse(r.stdout);
    assert.equal(p.found, false);
    assert.match(p.hint, /codeweb_find/);
    assert.equal(p.suggestions[0], 'src/path.js:normalizePath');
  });
});

test('S6 context-pack miss names the near-match in its error', () => {
  withGraph((graphPath) => {
    const r = runNode(script('context-pack.mjs'), [graphPath, 'normalisePath']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /normalizePath/, 'suggests the near-match');
  });
});
