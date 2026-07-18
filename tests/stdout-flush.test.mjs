// Flush-safety — outputs larger than the OS pipe buffer (64KB) must arrive complete and be valid
// JSON. The old pattern `process.stdout.write(big); process.exit(0)` dropped everything still queued
// when exit() fired: piped CLI output truncated at exactly 65,536 bytes and MCP responses (spawnSync
// readers) truncated nondeterministically mid-string. The emitters in lib/cli.mjs end the process
// naturally (exitCode + event-loop drain), which guarantees the flush. These tests pin that with a
// payload well past the buffer size.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runNode, script } from './helpers.mjs';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// A graph whose orphan list alone serializes far beyond one pipe buffer: 3,000 uncalled,
// unexported nodes with long ids  (~90 bytes each -> ~300KB of JSON).
function bigGraph() {
  const nodes = [];
  for (let i = 0; i < 3000; i++) {
    nodes.push({
      id: `pkg/deeply/nested/module-${String(i).padStart(4, '0')}/implementation.js:leftBehindHelperFunction${i}`,
      label: `leftBehindHelperFunction${i}`,
      kind: 'function', file: `pkg/deeply/nested/module-${String(i).padStart(4, '0')}/implementation.js`,
      line: 1, loc: 10, exports: false, domain: `pkg/deeply/nested/module-${String(i).padStart(4, '0')}`,
    });
  }
  return { meta: { target: 'flush-fixture' }, nodes, edges: [], domains: [], overlaps: [] };
}

const PIPE_BUF = 65536;

test('query --orphans --json: >64KB piped output arrives complete and parses', () => {
  const dir = mkdtempSync(join(tmpdir(), 'codeweb-flush-'));
  const g = join(dir, 'graph.json');
  writeFileSync(g, JSON.stringify(bigGraph()));
  const r = runNode(script('query.mjs'), [g, '--orphans', '--json']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.length > PIPE_BUF, `payload must exceed the pipe buffer to prove the flush (got ${r.stdout.length})`);
  const payload = JSON.parse(r.stdout); // throws on truncation
  assert.equal(payload.count, 3000);
});

test('deadcode --json: >64KB piped output arrives complete and parses', () => {
  const dir = mkdtempSync(join(tmpdir(), 'codeweb-flush-'));
  const g = join(dir, 'graph.json');
  writeFileSync(g, JSON.stringify(bigGraph()));
  const r = runNode(script('deadcode.mjs'), [g, '--json']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.length > PIPE_BUF, `payload must exceed the pipe buffer (got ${r.stdout.length})`);
  const payload = JSON.parse(r.stdout);
  assert.equal(payload.totals.orphans, 3000);
  assert.ok(payload.safe.every((o) => typeof o.loc === 'number'), 'deadcode items carry loc (campaign delete-ROI input)');
});

test('deadcode text mode: >64KB piped output arrives complete', () => {
  const dir = mkdtempSync(join(tmpdir(), 'codeweb-flush-'));
  const g = join(dir, 'graph.json');
  writeFileSync(g, JSON.stringify(bigGraph()));
  const r = runNode(script('deadcode.mjs'), [g]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.length > PIPE_BUF, `text payload must exceed the pipe buffer (got ${r.stdout.length})`);
  assert.match(r.stdout, /note: extraction drops ambiguous call edges/, 'the final line survived the flush');
});
