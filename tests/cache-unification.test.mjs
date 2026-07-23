// Perf-quality finding 17 — one scan cache per workspace. run.mjs wrote `.scan-cache.json`, the
// post-edit hook wrote `scan-cache.json`, refresh.mjs wrote `extract-cache.json` — three copies
// of the same data, so the first hook fire after every map ran a COLD full re-scan (28.7s at 16k
// symbols vs the hook's 30s timeout) and the first MCP auto-refresh was cold too. All three now
// use SCAN_CACHE_NAME and the same engine flags: after map + hook + refresh, exactly ONE cache
// file exists, and the hook/refresh runs ride it (stamp tier: scanned 0 on no-change).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, script, tmpDir, cleanup, writeTree } from './helpers.mjs';
import { SCAN_CACHE_NAME } from '../scripts/lib/cli.mjs';
import { check } from '../hooks/post-edit-diff.mjs';

test('map + post-edit hook + refresh share ONE cache file, and warm runs ride it', async () => {
  const src = tmpDir('cw-unify-');
  try {
    writeTree(src, {
      'a.mjs': 'export function one() { return two(); }\nexport function two() { return 1; }\n',
      'b.mjs': 'export function three() { return one(); }\nexport function one2() { return 0; }\n',
    });
    const ws = join(src, '.codeweb');
    const map = runNode(script('run.mjs'), [src, '--target', 'unify-x', '--out-dir', ws]);
    assert.equal(map.status, 0, map.stderr);

    const caches = () => readdirSync(ws).filter((f) => /cache/.test(f));
    assert.deepEqual(caches(), [SCAN_CACHE_NAME], 'map wrote the one shared cache');

    // the hook (imported check()) extracts via the SAME cache — no second file appears
    const payload = JSON.stringify({ tool_input: { file_path: join(src, 'a.mjs') } });
    await check(payload); // regression result irrelevant here; the cache side-effect is the assertion
    assert.deepEqual(caches(), [SCAN_CACHE_NAME], 'hook rode the shared cache (no scan-cache.json twin)');

    // refresh defaults to the same cache — and a no-change refresh scans zero files (stamp tier)
    const r = runNode(script('refresh.mjs'), [join(ws, 'graph.json'), '--json']);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(caches(), [SCAN_CACHE_NAME], 'refresh rode the shared cache (no extract-cache.json twin)');
    assert.equal(JSON.parse(r.stdout).scanned, '0', 'no-change refresh reads nothing — the warm cache + stamp tier');
  } finally { cleanup(src); }
});
