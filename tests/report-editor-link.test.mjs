// Spec J (docs/specs/reach-surfaces.md), amended by the standing privacy invariant
// (tests/build-report.test.mjs): the shipped report NEVER embeds the absolute source path, so
// editor links come from a viewer-supplied root (localStorage, client-side only).
//
// E1 given a built report, then the inspector machinery carries the vscode://file/ link path,
//    the set-root affordance, and the copyable file:line fallback.
// E2 given the same report, then the absolute local path (meta.root) still never appears —
//    the editor-link feature cannot regress the privacy invariant.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, script, tmpDir, cleanup } from './helpers.mjs';

test('E1+E2: editor links ship without leaking the source root', () => {
  const dir = tmpDir('codeweb-editlink-');
  try {
    const SENTINEL = '/Users/secret-person/private-clients/acme-internal/src';
    const graph = {
      meta: { root: SENTINEL, target: 'acme', mode: 'internal', engine: 'regex', languages: ['javascript'], symbols: 1 },
      nodes: [{ id: 'a.js:foo', label: 'foo', kind: 'function', file: 'a.js', line: 3, loc: 3, domain: 'core' }],
      edges: [], domains: [{ name: 'core', nodes: 1, summary: '' }], overlaps: [],
    };
    const graphPath = join(dir, 'graph.json');
    writeFileSync(graphPath, JSON.stringify(graph));
    const r = runNode(script('build-report.mjs'), [graphPath, '--no-md']);
    assert.equal(r.status, 0, r.stderr);
    const html = readFileSync(join(dir, 'report.html'), 'utf8');
    assert.ok(html.includes('vscode://file/'), 'E1: the editor deep-link scheme ships');
    assert.ok(html.includes('data-set-root'), 'E1: the viewer can supply their root');
    assert.ok(html.includes('cwEditorRoot'), 'E1: the root persists client-side (localStorage)');
    assert.ok(html.includes('set root for editor links'), 'E1: the no-root fallback is discoverable');
    assert.ok(!html.includes(SENTINEL), 'E2: the absolute local path still never leaks');
  } finally { cleanup(dir); }
});
