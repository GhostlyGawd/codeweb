// Direct unit tests for scripts/lib/graph-ops.mjs — the pure graph primitives shared by
// query.mjs and diff.mjs. Unlike the engine CLIs (tested as subprocesses), this is an importable
// pure module, so we test it directly: this pins the function signatures the CLI adapters depend
// on (a guarantee the subprocess tests cannot give) and locks the iterative-Tarjan + recursion
// safety the reviewer flagged.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeGraph, buildIndex, resolveSymbol, callersOf, calleesOf, impactOf, fileCycles, orphans,
} from '../scripts/lib/graph-ops.mjs';

test('normalizeGraph fills sane defaults (mirrors build-report)', () => {
  const g = normalizeGraph({ nodes: [{ id: 'x.js:f', label: 'f' }] });
  assert.equal(g.nodes[0].exports, false, 'missing exports -> false');
  assert.equal(g.nodes[0].domain, 'unassigned', 'missing domain -> unassigned');
  assert.equal(g.nodes[0].file, '', 'missing file -> empty string');
  assert.ok(Array.isArray(g.edges) && Array.isArray(g.overlaps), 'missing top-level arrays defaulted');
});

test('buildIndex separates call adjacency from any-incoming (call|import)', () => {
  const g = normalizeGraph({
    nodes: [{ id: 'a.js:m', file: 'a.js' }, { id: 'b.js:h', file: 'b.js' }],
    edges: [{ from: 'a.js:m', to: 'b.js:h', kind: 'call' }, { from: 'a.js:m', to: 'b.js:h', kind: 'import' }],
  });
  const ix = buildIndex(g);
  assert.deepEqual([...ix.callIn.get('b.js:h')], ['a.js:m']);
  assert.deepEqual([...ix.callOut.get('a.js:m')], ['b.js:h']);
  assert.ok(ix.hasIncoming.has('b.js:h'), 'call or import in-edge marks incoming');
});

test('resolveSymbol: exact id wins; else all label matches (sorted); else []', () => {
  const g = normalizeGraph({
    nodes: [{ id: 'b.js:h', label: 'h', file: 'b.js' }, { id: 'c.js:h', label: 'h', file: 'c.js' }, { id: 'a.js:m', label: 'm', file: 'a.js' }],
    edges: [],
  });
  assert.deepEqual(resolveSymbol(g, 'a.js:m'), ['a.js:m']);
  assert.deepEqual(resolveSymbol(g, 'h'), ['b.js:h', 'c.js:h']);
  assert.deepEqual(resolveSymbol(g, 'nope'), []);
});

test('callersOf / calleesOf use only call edges, sorted + unioned', () => {
  const g = normalizeGraph({
    nodes: [{ id: 'a.js:m', file: 'a.js' }, { id: 'b.js:h', file: 'b.js' }, { id: 'x.js:i', file: 'x.js' }],
    edges: [{ from: 'a.js:m', to: 'b.js:h', kind: 'call' }, { from: 'x.js:i', to: 'b.js:h', kind: 'import' }],
  });
  const ix = buildIndex(g);
  assert.deepEqual(callersOf(ix, ['b.js:h']), ['a.js:m'], 'import edge x->h excluded');
  assert.deepEqual(calleesOf(ix, ['a.js:m']), ['b.js:h']);
});

test('impactOf is transitive, excludes seeds, and terminates on self-loops', () => {
  const g = normalizeGraph({
    nodes: [{ id: 'r.js:loop', file: 'r.js' }, { id: 'r.js:c', file: 'r.js' }, { id: 'r.js:cc', file: 'r.js' }],
    edges: [
      { from: 'r.js:loop', to: 'r.js:loop', kind: 'call' }, // self-loop must not hang
      { from: 'r.js:c', to: 'r.js:loop', kind: 'call' },
      { from: 'r.js:cc', to: 'r.js:c', kind: 'call' },
    ],
  });
  assert.deepEqual(impactOf(buildIndex(g), ['r.js:loop']), ['r.js:c', 'r.js:cc']);
});

test('fileCycles: file-level SCCs (>=2), sorted + deterministic; same-file self-call ignored', () => {
  const g = normalizeGraph({
    nodes: [
      { id: 'x.js:a', file: 'x.js' }, { id: 'y.js:b', file: 'y.js' },
      { id: 'p.js:a', file: 'p.js' }, { id: 'q.js:b', file: 'q.js' },
      { id: 'z.js:a', file: 'z.js' }, { id: 'z.js:b', file: 'z.js' },
    ],
    edges: [
      { from: 'x.js:a', to: 'y.js:b', kind: 'import' }, { from: 'y.js:b', to: 'x.js:a', kind: 'import' },
      { from: 'p.js:a', to: 'q.js:b', kind: 'call' }, { from: 'q.js:b', to: 'p.js:a', kind: 'call' },
      { from: 'z.js:a', to: 'z.js:b', kind: 'call' }, { from: 'z.js:b', to: 'z.js:a', kind: 'call' }, // same file -> not a cycle
    ],
  });
  assert.deepEqual(fileCycles(g), [['p.js', 'q.js'], ['x.js', 'y.js']]);
});

test('orphans: zero incoming (call|import) AND not exported', () => {
  const g = normalizeGraph({
    nodes: [
      { id: 'a.js:used', file: 'a.js', domain: 'd', exports: false },
      { id: 'a.js:dead', file: 'a.js', domain: 'd', exports: false },
      { id: 'a.js:pub', file: 'a.js', domain: 'd', exports: true },
    ],
    edges: [{ from: 'a.js:pub', to: 'a.js:used', kind: 'call' }],
  });
  const ix = buildIndex(g);
  assert.deepEqual(orphans(g, ix).map((o) => o.id), ['a.js:dead'], 'used has a caller; pub is exported');
});
