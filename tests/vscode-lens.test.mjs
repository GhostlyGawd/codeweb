// The VS Code lens must show the SAME numbers the MCP tools serve: callers = reverse `call`
// edges, blast = the codeweb_impact closure (transitive callers + subclasses, seed excluded).
// The logic is pure (editor/vscode-codeweb/lens-core.js, no vscode API), so it pins directly.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import lensCore from '../editor/vscode-codeweb/lens-core.js';

const { buildLensIndex, blastOf, lensesForFile } = lensCore;

const GRAPH = {
  meta: { root: '/repo' },
  nodes: [
    { id: 'a.js:hub', label: 'hub', kind: 'function', file: 'a.js', line: 3 },
    { id: 'a.js:helper', label: 'helper', kind: 'function', file: 'a.js', line: 10 },
    { id: 'a.js:<module>', label: '<module>', kind: 'module', file: 'a.js', line: 1 },
    { id: 'b.js:caller1', label: 'caller1', kind: 'function', file: 'b.js', line: 1 },
    { id: 'd.js:top', label: 'top', kind: 'function', file: 'd.js', line: 1 },
    { id: 'c.js:Base', label: 'Base', kind: 'class', file: 'c.js', line: 2 },
    { id: 'c.js:Sub', label: 'Sub', kind: 'class', file: 'c.js', line: 9 },
  ],
  edges: [
    { from: 'b.js:caller1', to: 'a.js:hub', kind: 'call' },
    { from: 'a.js:helper', to: 'a.js:hub', kind: 'call' },
    { from: 'd.js:top', to: 'b.js:caller1', kind: 'call' },
    { from: 'c.js:Sub', to: 'c.js:Base', kind: 'inherit' },
    { from: 'a.js:<module>', to: 'a.js:hub', kind: 'import' }, // import edges are NOT callers
  ],
};

test('lens-core: callers count reverse call edges only; blast is the impact closure', () => {
  const ix = buildLensIndex(GRAPH);
  const lenses = lensesForFile(ix, 'a.js');
  assert.deepEqual(lenses.map((l) => l.label), ['hub', 'helper'], 'line-sorted, module node excluded');
  const hub = lenses[0];
  assert.equal(hub.line, 3);
  assert.equal(hub.callers, 2, 'two direct call edges (the import edge does not count)');
  assert.equal(hub.blast, 3, 'transitive: caller1, helper, and top (who calls caller1)');
  assert.equal(lenses[1].callers, 0, 'helper has no callers but still gets a lens at minCallers 0');
});

test('lens-core: inherit edges make subclasses part of the blast', () => {
  const ix = buildLensIndex(GRAPH);
  assert.equal(blastOf(ix, 'c.js:Base'), 1, 'changing Base reaches Sub');
  assert.equal(blastOf(ix, 'c.js:Sub'), 0);
});

test('lens-core: minCallers hides sub-threshold symbols; unknown file yields no lenses', () => {
  const ix = buildLensIndex(GRAPH);
  assert.deepEqual(lensesForFile(ix, 'a.js', { minCallers: 1 }).map((l) => l.label), ['hub']);
  assert.deepEqual(lensesForFile(ix, 'nope.js'), []);
  assert.equal(ix.root, '/repo', 'root comes from graph.meta.root');
});
