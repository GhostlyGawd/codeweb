// finding 27 — ONE bounded, cached git-churn parser (lib/churn.mjs), shared by risk + hotspots.
// Pins: (1) counts = commits touching each file within the window; (2) the cache is served at
// the same HEAD (proved by poisoning it) and invalidated by a new commit; (3) a non-repo
// degrades to {} — the advisors rank churn-less, as before.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { churnFromGit } from '../scripts/lib/churn.mjs';

const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], {
  encoding: 'utf8',
  env: { ...process.env, GIT_AUTHOR_NAME: 'x', GIT_AUTHOR_EMAIL: 'x@x', GIT_COMMITTER_NAME: 'x', GIT_COMMITTER_EMAIL: 'x@x' },
});

test('CH1: counts commits per file, window-bounded, cached by HEAD', () => {
  const dir = mkdtempSync(join(tmpdir(), 'codeweb-churn-'));
  try {
    git(dir, 'init', '-q');
    writeFileSync(join(dir, 'a.js'), '1');
    git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'c1');
    writeFileSync(join(dir, 'a.js'), '2');
    writeFileSync(join(dir, 'b.js'), '1');
    git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'c2');

    const ws = join(dir, '.codeweb'); mkdirSync(ws);
    const counts = churnFromGit(dir, { cacheDir: ws });
    assert.equal(counts['a.js'], 2);
    assert.equal(counts['b.js'], 1);

    // same HEAD -> the cache is SERVED (poison it and observe the poison come back)
    const cachePath = join(ws, 'churn-cache.json');
    const cached = JSON.parse(readFileSync(cachePath, 'utf8'));
    assert.equal(cached.counts['a.js'], 2);
    writeFileSync(cachePath, JSON.stringify({ ...cached, counts: { 'poison.js': 99 } }));
    assert.deepEqual(churnFromGit(dir, { cacheDir: ws }), { 'poison.js': 99 });

    // new commit (new HEAD) -> recomputed, poison gone, cache rewritten
    writeFileSync(join(dir, 'b.js'), '2');
    git(dir, 'add', 'b.js'); git(dir, 'commit', '-qm', 'c3'); // b.js only — `add .` would commit the .codeweb cache into the fixture history
    const fresh = churnFromGit(dir, { cacheDir: ws });
    assert.equal(fresh['b.js'], 2);
    assert.equal(fresh['poison.js'], undefined);
    assert.equal(JSON.parse(readFileSync(cachePath, 'utf8')).counts['b.js'], 2);

    // the window bounds history: maxCommits=1 sees only c3
    const windowed = churnFromGit(dir, { maxCommits: 1 });
    assert.deepEqual(windowed, { 'b.js': 1 });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('CH2: not a git repo -> {} (advisors degrade to churn-less ranking)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'codeweb-churn-nogit-'));
  try {
    assert.deepEqual(churnFromGit(dir), {});
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
