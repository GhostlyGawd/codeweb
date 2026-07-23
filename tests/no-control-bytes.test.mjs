// Round 2, finding #41 — no tracked .mjs file may contain raw control bytes below 0x09 (NUL through
// backspace). break-cycles.mjs and diff.mjs embedded literal NULs as template-literal key separators,
// which made `file`/`grep`/ripgrep classify two PRODUCT files as binary — invisible to every search
// (three audits hit it). The safe idiom is the '\x00' escape (graph-ops.mjs edgeKey /
// extract-symbols.mjs) — the same runtime string, zero raw bytes. \t (0x09) / \n / \r are unaffected.
// This test is the tripwire: it fails naming the offending file and offset so the class stays closed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ROOT } from './helpers.mjs';

test('LINT-NUL: no tracked .mjs file contains a raw byte < 0x09', () => {
  const tracked = execFileSync('git', ['-C', PLUGIN_ROOT, 'ls-files', '*.mjs'], { encoding: 'utf8' })
    .split(/\r?\n/).filter(Boolean);
  assert.ok(tracked.length > 100, `git ls-files must actually enumerate the repo (got ${tracked.length})`);
  const offenders = [];
  for (const rel of tracked) {
    const bytes = readFileSync(join(PLUGIN_ROOT, rel)); // raw Buffer — no decode, no normalization
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] < 0x09) offenders.push(`${rel}: byte 0x${bytes[i].toString(16).padStart(2, '0')} at offset ${i}`);
    }
  }
  assert.deepEqual(offenders, [], `raw control bytes found (use the '\\x00' escape instead):\n  ${offenders.join('\n  ')}`);
});
