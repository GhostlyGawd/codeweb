import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, script, tmpDir, cleanup, readJSON } from './helpers.mjs';

// The shipped report.html is self-contained and shareable (a teammate, a blog post, GitHub Pages),
// so it must never embed the absolute LOCAL source path. meta.root is a private disk pointer the
// query tools use to read bodies; graph.json on disk keeps it, but the report must not leak it.
// The template renders meta.target for the human-facing label, never meta.root.
test('build-report does not embed the absolute local path (meta.root) in report.html', () => {
  const dir = tmpDir('codeweb-report-');
  try {
    const SENTINEL = '/Users/secret-person/private-clients/acme-internal/src';
    const graph = {
      meta: {
        root: SENTINEL,
        target: 'acme',
        mode: 'internal',
        engine: 'regex',
        languages: ['javascript'],
        symbols: 1,
      },
      nodes: [{ id: 'a.js:foo', label: 'foo', kind: 'function', file: 'a.js', line: 1, loc: 3, domain: 'core' }],
      edges: [],
      domains: [{ name: 'core', nodes: 1, summary: '' }],
      overlaps: [],
    };
    const graphPath = join(dir, 'graph.json');
    writeFileSync(graphPath, JSON.stringify(graph));

    const r = runNode(script('build-report.mjs'), [graphPath, '--no-md']);
    assert.equal(r.status, 0, r.stderr);

    const html = readFileSync(join(dir, 'report.html'), 'utf8');
    // The leak under test: the shipped HTML must not contain the absolute source path.
    assert.ok(!html.includes(SENTINEL), 'report.html must not embed the absolute meta.root path');
    // ...but the report must still be labeled by its friendly target.
    assert.ok(html.includes('acme'), 'report.html should still carry meta.target for display');

    // The on-disk graph.json stays the tools' pointer to source — meta.root preserved.
    const disk = readJSON(graphPath);
    assert.equal(disk.meta.root, SENTINEL, 'graph.json on disk must preserve meta.root for the query tools');
  } finally {
    cleanup(dir);
  }
});
