// replay-mine — the ground-truth task miner (docs/specs/replay-corpus.md). It feeds the replay
// benchmark, so a miner bug silently poisons the instrument: these tests pin the contract on
// SYNTHETIC git histories where the truth is known by construction.
//
// P1: a signature change that misses callers, fixed in a follow-up -> exactly that task.
// P2: a well-executed change (all callers updated in-commit) -> no task, funnel says why.
// P3: the fix lands outside --followup-window -> no task, funnel says why.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { runNode, tmpDir, cleanup, writeTree, readJSON, PLUGIN_ROOT } from './helpers.mjs';

const MINER = join(PLUGIN_ROOT, 'paper', 'experiments', 'replay-mine.mjs');
const hasGit = spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;

const CALLER = (n) => `import { process } from './lib/hub.js';\nexport function use${n}() {\n  return process(1, 2);\n}\n`;
const CALLER_FIXED = (n) => `import { process } from './lib/hub.js';\nexport function use${n}() {\n  return process(1, 2, {});\n}\n`;

function gitRepo() {
  const repo = tmpDir('codeweb-replaymine-');
  const g = (...a) => {
    const r = spawnSync('git', ['-C', repo, ...a], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`git ${a.join(' ')}: ${r.stderr}`);
    return r.stdout.trim();
  };
  g('init', '-q');
  g('config', 'user.email', 't@example.com');
  g('config', 'user.name', 'Test');
  g('config', 'commit.gpgsign', 'false');
  return { repo, g };
}

function mine(repo, args = []) {
  const out = join(repo, 'tasks.json');
  const r = runNode(MINER, [repo, '--min-callers', '2', '--max-commits', '30', '--out', out, ...args]);
  assert.equal(r.status, 0, r.stderr);
  return readJSON(out);
}

test('P1: missed-then-fixed signature change mines as exactly one task with the history as answer key', { skip: hasGit ? false : 'git not available' }, () => {
  const { repo, g } = gitRepo();
  try {
    writeTree(repo, {
      'lib/hub.js': 'export function process(a, b) {\n  return a + b;\n}\n',
      'ca.js': CALLER('A'), 'cb.js': CALLER('B'), 'cc.js': CALLER('C'),
    });
    g('add', '-A'); g('commit', '-q', '-m', 'base');
    const base = g('rev-parse', 'HEAD');

    // the CHANGE: new parameter, only ca.js updated — cb.js and cc.js are missed
    writeTree(repo, {
      'lib/hub.js': 'export function process(a, b, opts) {\n  return a + b + (opts ? 1 : 0);\n}\n',
      'ca.js': CALLER_FIXED('A'),
    });
    g('add', '-A'); g('commit', '-q', '-m', 'add opts param');
    const change = g('rev-parse', 'HEAD');

    // the FOLLOW-UP: history fixes one missed caller, mentioning the symbol
    writeTree(repo, { 'cb.js': CALLER_FIXED('B') });
    g('add', '-A'); g('commit', '-q', '-m', 'fix caller');
    const fix = g('rev-parse', 'HEAD');

    // noise: a later commit that touches nothing relevant
    writeTree(repo, { 'README.md': 'noise\n' });
    g('add', '-A'); g('commit', '-q', '-m', 'docs');

    const out = mine(repo);
    assert.equal(out.tasks.length, 1, `exactly one task (funnel: ${JSON.stringify(out.funnel)})`);
    const t = out.tasks[0];
    assert.ok(t.symbol.endsWith('lib/hub.js:process'), t.symbol);
    assert.equal(t.baseSha, base, 'base = the parent of the change');
    assert.equal(t.changeSha, change);
    assert.deepEqual(t.missedByChange, ['cb.js', 'cc.js'], 'the two un-updated caller files are the answer key');
    assert.equal(t.fixedInFollowup.length, 1, 'only the real fix commit qualifies');
    assert.equal(t.fixedInFollowup[0].sha, fix);
    assert.deepEqual(t.fixedInFollowup[0].files, ['cb.js']);
    assert.match(t.instruction, /process/, 'instruction names the change');
    assert.ok(t.defDiff.includes('opts'), 'definition-side diff is embedded');
  } finally { cleanup(repo); }
});

test('P2: a well-executed change (all callers updated) mines nothing — and the funnel says why', { skip: hasGit ? false : 'git not available' }, () => {
  const { repo, g } = gitRepo();
  try {
    writeTree(repo, {
      'lib/hub.js': 'export function process(a, b) {\n  return a + b;\n}\n',
      'ca.js': CALLER('A'), 'cb.js': CALLER('B'),
    });
    g('add', '-A'); g('commit', '-q', '-m', 'base');
    writeTree(repo, {
      'lib/hub.js': 'export function process(a, b, opts) {\n  return a + b + (opts ? 1 : 0);\n}\n',
      'ca.js': CALLER_FIXED('A'), 'cb.js': CALLER_FIXED('B'),
    });
    g('add', '-A'); g('commit', '-q', '-m', 'change + every caller');

    const out = mine(repo);
    assert.equal(out.tasks.length, 0, 'no missed callers -> no task');
    assert.ok(out.funnel.enoughCallers >= 1, `the symbol WAS considered (${JSON.stringify(out.funnel)})`);
    assert.equal(out.funnel.hadMissedCallers, 0, 'funnel names the exit stage');
  } finally { cleanup(repo); }
});

test('P3: a fix outside --followup-window mines nothing — and the funnel says why', { skip: hasGit ? false : 'git not available' }, () => {
  const { repo, g } = gitRepo();
  try {
    writeTree(repo, {
      'lib/hub.js': 'export function process(a, b) {\n  return a + b;\n}\n',
      'ca.js': CALLER('A'), 'cb.js': CALLER('B'), 'cc.js': CALLER('C'),
    });
    g('add', '-A'); g('commit', '-q', '-m', 'base');
    writeTree(repo, {
      'lib/hub.js': 'export function process(a, b, opts) {\n  return a + b + (opts ? 1 : 0);\n}\n',
      'ca.js': CALLER_FIXED('A'),
    });
    g('add', '-A'); g('commit', '-q', '-m', 'change');
    // distance 2 from the change: one noise commit, THEN the fix — outside window 1
    writeTree(repo, { 'README.md': 'noise\n' });
    g('add', '-A'); g('commit', '-q', '-m', 'docs');
    writeTree(repo, { 'cb.js': CALLER_FIXED('B') });
    g('add', '-A'); g('commit', '-q', '-m', 'late fix');

    const out = mine(repo, ['--followup-window', '1']);
    assert.equal(out.tasks.length, 0, `late fix is outside the window (funnel: ${JSON.stringify(out.funnel)})`);
    assert.ok(out.funnel.hadMissedCallers >= 1, 'the miss WAS detected');
    assert.equal(out.funnel.hadFollowupFix, 0, 'funnel names the exit stage');
  } finally { cleanup(repo); }
});
