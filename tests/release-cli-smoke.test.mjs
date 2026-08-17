// VER-F10: the tooling that WRITES claim surfaces had no direct test — version-sync.mjs rewrites
// seven public surfaces at release prep, and a wrapper regression would mis-sync them exactly at
// release time. The underlying applySync/syncTargets engine is unit-tested; these smoke the CLI
// wrapper paths themselves.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { script } from './helpers.mjs';

test('version-sync.mjs runs clean on the aligned repo (idempotent no-op)', () => {
  const before = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).stdout;
  const r = spawnSync(process.execPath, [script('version-sync.mjs')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /version-sync: v\d+\.\d+\.\d+, \d+ MCP tools/);
  const after = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).stdout;
  assert.equal(after, before, 'an aligned repo must not be modified by a sync');
});

test('screenshot.mjs front door: no args dies with usage (exit 2), never a stack trace', () => {
  const r = spawnSync(process.execPath, [script('screenshot.mjs')], { encoding: 'utf8' });
  assert.equal(r.status, 2, `usage error is exit 2: ${r.stderr}`);
  assert.match(r.stderr, /usage: screenshot\.mjs/);
  assert.ok(!/at .*\.mjs:\d+/.test(r.stderr), 'a missing arg is a usage message, not a crash');
});
