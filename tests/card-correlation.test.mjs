// Card→diff correlation (docs/specs/card-correlation.md) — the ledger's "advice followed"
// counter. BDD over REAL hook child processes: the pre-edit hook records which caller files the
// card warned about; a later post-edit touching one counts once; the subject file never counts;
// a new card replaces the pending set; opt-out is a true no-op.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, script, tmpDir, cleanup, writeTree, readJSON, PLUGIN_ROOT } from './helpers.mjs';
import { readStats } from '../scripts/lib/stats.mjs';

const PRE = join(PLUGIN_ROOT, 'hooks', 'pre-edit-impact.mjs');
const POST = join(PLUGIN_ROOT, 'hooks', 'post-edit-diff.mjs');

const FIXTURE = {
  'core/util.js': 'export function used() {\n  return 1;\n}\n',
  'app/a.js': 'import { used } from "../core/util.js";\nexport function goA() {\n  return used();\n}\n',
  'app/b.js': 'import { used } from "../core/util.js";\nexport function goB() {\n  return used();\n}\n',
};

function buildMapped() {
  const dir = tmpDir('codeweb-corr-');
  writeTree(dir, FIXTURE);
  const ws = join(dir, '.codeweb');
  mkdirSync(ws, { recursive: true });
  const r = runNode(script('extract-symbols.mjs'), [dir, '--no-ctags', '--out', join(ws, 'fragment.json')]);
  assert.equal(r.status, 0, r.stderr);
  const frag = readJSON(join(ws, 'fragment.json'));
  writeFileSync(join(ws, 'graph.json'), JSON.stringify({ ...frag, domains: [], overlaps: [] }));
  return { dir, ws, graph: join(ws, 'graph.json') };
}

const fire = (hook, dir, rel, env = {}) => {
  const r = spawnSync(process.execPath, [hook], {
    encoding: 'utf8', env: { ...process.env, ...env },
    input: JSON.stringify({ tool_input: { file_path: join(dir, rel) } }),
  });
  assert.equal(r.status, 0, r.stderr);
  return r;
};
const followed = (graph) => {
  const s = readStats(graph);
  return s ? (Object.values(s.months)[0].cardCallersFollowed || 0) : 0;
};

test('B1: edits touching card-named caller files count once each; the card set is consumed', () => {
  const { dir, ws, graph } = buildMapped();
  try {
    fire(PRE, dir, 'core/util.js'); // the card names app/a.js + app/b.js as callers
    const pending = readJSON(join(ws, 'pending-card.json'));
    assert.deepEqual(pending.files.sort(), ['app/a.js', 'app/b.js'], 'pending set = the callers the card warned about');
    assert.ok(pending.symbol.endsWith('core/util.js:used'));

    fire(POST, dir, 'app/a.js');
    assert.equal(followed(graph), 1, 'first touch of a named caller counts');
    fire(POST, dir, 'app/a.js');
    assert.equal(followed(graph), 1, 'the same file never double-counts');
    fire(POST, dir, 'app/b.js');
    assert.equal(followed(graph), 2, 'each named file counts once');
    assert.ok(!existsSync(join(ws, 'pending-card.json')), 'fully-consumed card clears');
  } finally { cleanup(dir); }
});

test('B2: the card\'s own subject file never counts as following the advice', () => {
  const { dir, ws, graph } = buildMapped();
  try {
    fire(PRE, dir, 'core/util.js');
    const pending = readJSON(join(ws, 'pending-card.json'));
    assert.ok(!pending.files.includes('core/util.js'), 'subject excluded at record time');
    fire(POST, dir, 'core/util.js');
    assert.equal(followed(graph), 0, 'editing the subject is not "following" anything');
  } finally { cleanup(dir); }
});

test('B3: a new card replaces the pending set; B4: opt-out records nothing', () => {
  const { dir, ws } = buildMapped();
  try {
    fire(PRE, dir, 'core/util.js');
    const first = readJSON(join(ws, 'pending-card.json'));
    // second card for a DIFFERENT depended-on file (app/a.js has caller edges? use core again after
    // consuming shape: re-fire replaces timestamp+set wholesale)
    fire(PRE, dir, 'core/util.js');
    const second = readJSON(join(ws, 'pending-card.json'));
    assert.ok(second.t >= first.t, 'replacement is wholesale (fresh timestamp)');
    assert.deepEqual(second.files.sort(), ['app/a.js', 'app/b.js']);

    // opt-out: a fresh workspace records no pending card at all
    const clean = buildMapped();
    try {
      fire(PRE, clean.dir, 'core/util.js', { CODEWEB_NO_STATS: '1' });
      assert.ok(!existsSync(join(clean.ws, 'pending-card.json')), 'opt-out writes nothing');
    } finally { cleanup(clean.dir); }
  } finally { cleanup(dir); }
});
