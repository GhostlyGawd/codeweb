// P2 awareness — the graph tells you when it's out of date, and the pre-edit hook surfaces
// blast-radius BEFORE a change lands (the post-edit gate only reacts after).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runNode, script, tmpDir, cleanup, writeTree, readJSON } from './helpers.mjs';
import { preview } from '../hooks/pre-edit-impact.mjs';
import { writeFileSync, mkdirSync, readFileSync, copyFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';

function buildMapped(dirFiles) {
  const dir = tmpDir('codeweb-aware-');
  writeTree(dir, dirFiles);
  const ws = join(dir, '.codeweb');
  mkdirSync(ws, { recursive: true });
  const r1 = runNode(script('extract-symbols.mjs'), [dir, '--no-ctags', '--out', join(ws, 'fragment.json')]);
  assert.equal(r1.status, 0, r1.stderr);
  // promote the fragment to a graph (meta carries root + sources; nodes/edges as-is)
  const frag = readJSON(join(ws, 'fragment.json'));
  writeFileSync(join(ws, 'graph.json'), JSON.stringify({ ...frag, domains: [], overlaps: [] }));
  return { dir, graph: join(ws, 'graph.json') };
}

test('staleness: an edited source file annotates query results until refresh', () => {
  const { dir, graph } = buildMapped({
    'a.js': 'export function alpha() {\n  return beta();\n}\n',
    'b.js': 'export function beta() {\n  return 1;\n}\n',
  });
  try {
    // fresh graph -> no stale marker
    let r = runNode(script('query.mjs'), [graph, '--callers', 'beta', '--json']);
    let payload = JSON.parse(r.stdout);
    assert.equal(payload.stale, undefined, 'fresh graph carries no stale marker');

    // touch a source file with DIFFERENT content (size change beats mtime granularity)
    writeFileSync(join(dir, 'b.js'), 'export function beta() {\n  return 1 + 1;\n}\n');
    r = runNode(script('query.mjs'), [graph, '--callers', 'beta', '--json']);
    payload = JSON.parse(r.stdout);
    assert.ok(payload.stale && payload.stale.count >= 1, 'stale marker appears after an on-disk change');
    assert.match(payload.summary, /stale/, 'the summary carries the staleness warning');
  } finally { cleanup(dir); }
});

test('pre-edit hook: one-line advisory for a mapped, depended-on file; silent otherwise', () => {
  const { dir } = buildMapped({
    'core/util.js': 'export function used() {\n  return 1;\n}\n',
    'app/main.js': 'import { used } from "../core/util.js";\nexport function go() {\n  return used();\n}\n',
  });
  try {
    const payloadFor = (fp) => JSON.stringify({ tool_input: { file_path: fp } });
    const msg = preview(payloadFor(join(dir, 'core/util.js')));
    assert.ok(msg, 'a mapped, depended-on file yields an advisory');
    assert.match(msg, /core\/util\.js/, 'names the file');
    assert.match(msg, /dependent edge/, 'counts dependents');
    assert.match(msg, /codeweb_impact/, 'points at the impact tool');

    // a file outside any mapped target stays silent
    const other = tmpDir('codeweb-unmapped-');
    try {
      writeTree(other, { 'x.js': 'export function x() {\n  return 1;\n}\n' });
      assert.equal(preview(payloadFor(join(other, 'x.js'))), null, 'unmapped target -> no output');
    } finally { cleanup(other); }

    // non-source files stay silent
    assert.equal(preview(payloadFor(join(dir, 'README.md'))), null);
  } finally { cleanup(dir); }
});
