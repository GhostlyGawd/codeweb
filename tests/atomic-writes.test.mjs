// Perf-quality finding 3 — crash-safe artifacts. Every graph/fragment/sidecar writer goes through
// atomicWrite (same-dir temp + rename), and run.mjs's stage memo refuses to reuse outputs that no
// longer PARSE. Reproduced pre-fix failure: truncate graph.json (a SIGTERM'd writer), re-map with
// an unchanged fragment -> "stages reused (fragment unchanged)" preserved the corruption forever.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, script, tmpDir, cleanup, writeTree, readJSON } from './helpers.mjs';
import { atomicWrite } from '../scripts/lib/cli.mjs';

test('atomicWrite: target parses, no temp sibling remains', () => {
  const dir = tmpDir('codeweb-atomic-');
  try {
    const p = join(dir, 'graph.json');
    atomicWrite(p, JSON.stringify({ ok: 1 }));
    assert.deepEqual(readJSON(p), { ok: 1 });
    atomicWrite(p, JSON.stringify({ ok: 2 })); // overwrite path
    assert.deepEqual(readJSON(p), { ok: 2 });
    assert.ok(!readdirSync(dir).some((f) => f.endsWith('.tmp')), 'no orphaned temp files');
  } finally { cleanup(dir); }
});

test('a corrupt graph.json is recomputed on re-map, not "stages reused"; intact workspaces still reuse', () => {
  const src = tmpDir('codeweb-atomic-src-');
  const ws = tmpDir('codeweb-atomic-ws-');
  try {
    writeTree(src, {
      'a.mjs': 'export function one() { return two(); }\nexport function two() { return 1; }\n',
    });
    // 1) initial map
    let r = runNode(script('run.mjs'), [src, '--target', 'atomic-x', '--out-dir', ws]);
    assert.equal(r.status, 0, `initial map failed:\n${r.stderr}`);
    const graphPath = join(ws, 'graph.json');
    const good = readFileSync(graphPath, 'utf8');
    assert.ok(JSON.parse(good).nodes.length >= 2, 'sane initial graph');
    // 2) simulate a killed writer: truncate the graph mid-byte
    writeFileSync(graphPath, good.slice(0, Math.floor(good.length / 2)));
    r = runNode(script('run.mjs'), [src, '--target', 'atomic-x', '--out-dir', ws]);
    assert.equal(r.status, 0, `re-map over corruption failed:\n${r.stderr}`);
    assert.ok(!/stages reused/.test(r.stderr), 'memo must NOT reuse over a corrupt graph');
    assert.ok(JSON.parse(readFileSync(graphPath, 'utf8')).nodes.length >= 2, 'graph self-healed');
    // 3) untouched workspace: the memo still reuses (the fix must not disable the memo)
    r = runNode(script('run.mjs'), [src, '--target', 'atomic-x', '--out-dir', ws]);
    assert.equal(r.status, 0);
    assert.ok(/stages reused/.test(r.stderr), 'intact workspace still hits the memo');
  } finally { cleanup(src); cleanup(ws); }
});
