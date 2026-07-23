// Perf-quality finding 12 — batched ctags. A cold run used to spawn one ctags process PER FILE
// (≥0.9s of pure spawn floor per 600 files with a no-op shim; ~10x with real option parsing).
// Cold runs now tag the whole list through ONE process (`-L -`); warm runs keep the per-file
// spawn (misses are few, and one small spawn beats re-tagging the repo); untouched warm runs
// spawn nothing at all (stamp tier). Verified with a logging ctags shim on PATH.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, chmodSync, mkdirSync, utimesSync } from 'node:fs';
import { join, delimiter } from 'node:path';
import { runNode, script, tmpDir, cleanup, writeTree, readJSON } from './helpers.mjs';

let DIR, SHIM, LOG, SRC, CACHE;
before(() => {
  DIR = tmpDir('codeweb-ctags-');
  SHIM = join(DIR, 'bin');
  mkdirSync(SHIM, { recursive: true });
  LOG = join(DIR, 'invocations.log');
  writeFileSync(LOG, '');
  const shim = [
    '#!/usr/bin/env node',
    "const fs = require('fs');",
    'const args = process.argv.slice(2);',
    "fs.appendFileSync(process.env.CTAGS_LOG, JSON.stringify(args) + '\\n');",
    "if (args.includes('--version')) { console.log('shim ctags 1.0'); process.exit(0); }",
    'const emit = (p) => {',
    "  const base = p.split(/[\\\\/]/).pop().replace(/\\W/g, '_');",
    "  process.stdout.write(JSON.stringify({ _type: 'tag', name: 'ct_' + base, line: 1, kind: 'function', path: p }) + '\\n');",
    '};',
    "const li = args.indexOf('-L');",
    'if (li !== -1) {',
    "  for (const p of fs.readFileSync(0, 'utf8').split('\\n')) if (p.trim()) emit(p.trim());",
    '} else emit(args[args.length - 1]);',
    '',
  ].join('\n');
  writeFileSync(join(SHIM, 'ctags'), shim);
  chmodSync(join(SHIM, 'ctags'), 0o755);
  SRC = join(DIR, 'src');
  writeTree(SRC, {
    'a.js': 'export function fa() { return 1; }\n',
    'b.js': 'export function fb() { return 2; }\n',
    'c.js': 'export function fc() { return 3; }\n',
  });
  CACHE = join(DIR, 'cache.json');
});
after(() => cleanup(DIR));

const env = () => ({ PATH: SHIM + delimiter + process.env.PATH, CTAGS_LOG: LOG });
const invocations = () => readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  .filter((a) => !a.includes('--version'));

// The FAKE is unix-only, not the feature: the shim is a shebang node script, which windows cannot
// spawn (CreateProcess runs .exe/.com only, and Node's CVE-2024-27980 hardening EINVALs .cmd/.bat
// without a shell — which the extractor's execFileSync rightly doesn't use). A real ctags.exe on
// PATH spawns fine there. Without the shim the extractor silently falls back to the regex tier,
// so on windows these three would fail (or pass vacuously — the zero-spawn case). Named platform
// skips, counted in ci.yml's windows skip ceiling (11 = shared census 7 + these 3 + 1 headroom).
const CTAGS_SHIM_SKIP = process.platform === 'win32'
  && 'ctags shim is a shebang script — unspawnable on windows (real ctags.exe works; the fake is unix-only)';

test('cold run: ONE batched ctags process (-L -) serves every file', { skip: CTAGS_SHIM_SKIP }, () => {
  const r = runNode(script('extract-symbols.mjs'), [SRC, '--cache', CACHE, '--out', join(DIR, 'f1.json')], { env: env() });
  assert.equal(r.status, 0, r.stderr);
  const inv = invocations();
  assert.equal(inv.length, 1, `expected exactly one tagging invocation, got ${JSON.stringify(inv)}`);
  assert.ok(inv[0].includes('-L'), 'the one invocation is the batch (-L)');
  const frag = readJSON(join(DIR, 'f1.json'));
  assert.ok(frag.nodes.some((n) => n.id === 'a.js:ct_a_js'), 'ctags-sourced symbol present');
  assert.equal(frag.meta.engine, 'ctags');
});

test('untouched warm run: zero ctags processes (stamp tier)', { skip: CTAGS_SHIM_SKIP }, () => {
  const beforeCount = invocations().length;
  const r = runNode(script('extract-symbols.mjs'), [SRC, '--cache', CACHE, '--out', join(DIR, 'f2.json')], { env: env() });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(invocations().length, beforeCount, 'no new tagging invocations on a no-change warm run');
});

test('warm run with one changed file: one PER-FILE spawn, not a whole-repo batch', { skip: CTAGS_SHIM_SKIP }, () => {
  const beforeCount = invocations().length;
  writeFileSync(join(SRC, 'b.js'), 'export function fb() { return 22; }\n'); // content + mtime change
  const r = runNode(script('extract-symbols.mjs'), [SRC, '--cache', CACHE, '--out', join(DIR, 'f3.json')], { env: env() });
  assert.equal(r.status, 0, r.stderr);
  const fresh = invocations().slice(beforeCount);
  assert.equal(fresh.length, 1, `expected exactly one per-file invocation, got ${JSON.stringify(fresh)}`);
  assert.ok(!fresh[0].includes('-L'), 'warm miss uses the per-file path');
  assert.ok(fresh[0][fresh[0].length - 1].endsWith('b.js'), 'and tags only the changed file');
});
