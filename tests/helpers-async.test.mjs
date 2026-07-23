// Round 2, finding #6: runNodeAsync — the async sibling of runNode. Its whole reason to exist is
// that awaited-in-parallel child processes OVERLAP: node:test runs top-level test()s sequentially,
// and spawnSync bodies serialize even under {concurrency} — only async spawn bodies yield. These
// pin the runNode contract parity (status / stdout / stderr, never rejects) and the overlap itself.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runNodeAsync, tmpDir, cleanup } from './helpers.mjs';

test('runNodeAsync: runNode contract parity — exit status + captured stderr, no rejection', async () => {
  const dir = tmpDir('codeweb-async-');
  try {
    const s = join(dir, 'exit3.mjs');
    writeFileSync(s, 'console.error("boom to stderr"); process.exit(3);\n');
    const r = await runNodeAsync(s);
    assert.equal(r.status, 3);
    assert.match(r.stderr, /boom to stderr/);
  } finally { cleanup(dir); }
});

test('runNodeAsync: two awaited-in-parallel 400 ms children overlap (wall < 750 ms)', async () => {
  const dir = tmpDir('codeweb-async-');
  try {
    const s = join(dir, 'sleep.mjs');
    writeFileSync(s, 'setTimeout(() => process.exit(0), 400);\n');
    const t0 = Date.now();
    const [a, b] = await Promise.all([runNodeAsync(s), runNodeAsync(s)]);
    const wall = Date.now() - t0;
    assert.equal(a.status, 0);
    assert.equal(b.status, 0);
    // generous margin over 400 ms; if CI jitters, loosen upward, never tighten
    assert.ok(wall < 750, `two 400 ms children should overlap, took ${wall} ms`);
  } finally { cleanup(dir); }
});
