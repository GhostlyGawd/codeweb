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
import { bump, recordPendingCard, readStats } from '../scripts/lib/stats.mjs';
import { addSuppression, loadAnnotations } from '../scripts/lib/annotations.mjs';

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

// finding #42: the stats ledger (stats.mjs) and the annotations store (annotations.mjs) now write
// through atomicWrite too — same crash-safe contract: the output parses and no temp sibling is left.
test('finding #42: stats + annotations writers are crash-safe (parse, no temp sibling, formatting kept)', () => {
  const dir = tmpDir('codeweb-atomic42-');
  try {
    const gp = join(dir, 'graph.json');
    // stats.bump -> stats.json (compact); stats.recordPendingCard -> pending-card.json (compact)
    bump(gp, 'queriesServed');
    recordPendingCard(gp, 'a.js:f', ['b.js', 'c.js']);
    const stats = readStats(gp);
    assert.ok(stats && Object.values(stats.months || {}).some((m) => m.queriesServed === 1), 'stats.json written + parses');
    const pending = readJSON(join(dir, 'pending-card.json'));
    assert.deepEqual(pending.files, ['b.js', 'c.js'], 'pending-card.json written + parses');
    // annotations.addSuppression -> .codeweb/annotations.json (pretty-print PRESERVED)
    const annDir = join(dir, '.codeweb');
    addSuppression(annDir, 'deadbeefcafef00d', { note: 'fp' });
    assert.equal(loadAnnotations(annDir).suppressions[0].fingerprint, 'deadbeefcafef00d', 'annotations.json written + parses');
    const annRaw = readFileSync(join(annDir, 'annotations.json'), 'utf8');
    assert.match(annRaw, /\n {2}"suppressions"/, 'annotations keeps its 2-space pretty-print');
    // no orphaned temp file from any of the three atomic writes
    for (const d of [dir, annDir]) assert.ok(!readdirSync(d).some((f) => f.endsWith('.tmp')), `no orphaned temp files in ${d}`);
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
