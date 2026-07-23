// finding #40 (WS-H, T-40.3) — the extractor exposes `runExtract(opts)` and its import is
// SIDE-EFFECT-FREE: no argv parse, no process.exit, no file writes at import time (the precondition
// for #18b's in-process hook and the deep fix for #6's spawn-bound trials). These tests pin the
// import-cleanliness contract and in-process reentrancy/concurrency (the interleaving + first-init
// race class) BEFORE T-40.4 puts runExtract under node:test's concurrent subtests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runNode, script, tmpDir, cleanup, writeTree } from './helpers.mjs';

const EXTRACT = script('extract-symbols.mjs');

const TREE_A = {
  'a.js': 'export function alpha(x) { return beta(x); }\nexport function beta(y) { return y + 1; }\n',
  'b.js': 'import { alpha } from "./a.js";\nexport function useA() { return alpha(2); }\n',
};
const TREE_B = {
  'x.py': 'def outer():\n    return inner()\n\ndef inner():\n    return 3\n',
  'y.py': 'from x import outer\n\ndef top():\n    return outer()\n',
};

// (a) SE-IMPORT-CLEAN — importing the module must do nothing observable: no argv parse, no exit, no
// writes. Run in an EMPTY tmpdir with NO extra argv (so the main-guard short-circuits on argv[1]);
// the dynamic import resolves, prints exactly `clean`, and the cwd is still empty afterward.
test('SE-IMPORT-CLEAN: import(extract-symbols) is side-effect-free', () => {
  const empty = mkdtempSync(join(tmpdir(), 'cw-se-'));
  try {
    const code = `import(${JSON.stringify(pathToFileURL(EXTRACT).href)}).then(()=>process.stdout.write('clean'),(e)=>{process.stderr.write(String(e&&e.stack||e));process.exit(3);})`;
    const r = spawnSync(process.execPath, ['-e', code], { cwd: empty, encoding: 'utf8' });
    assert.equal(r.status, 0, `import should exit 0; stderr:\n${r.stderr}`);
    assert.equal(r.stdout, 'clean', 'stdout is exactly "clean" (no fragment, no banner)');
    assert.equal(r.stderr, '', 'no stderr at import (no argv parse, no usage, no banner)');
    assert.deepEqual(readdirSync(empty), [], 'cwd tmpdir stays empty (no argv parse -> no artifact write)');
  } finally { rmSync(empty, { recursive: true, force: true }); }
});

// runExtract must be importable and callable; JSON.stringify(fragment) equals the CLI stdout byte
// for byte on the same tree (the CLI surface stays pinned while the engine goes in-process).
async function cliFragment(root) {
  const r = runNode(EXTRACT, [root, '--no-ctags']);
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

test('IE-TWO-RUNS: two sequential runExtract calls each byte-equal a fresh CLI run', async () => {
  const { runExtract } = await import('../scripts/extract-symbols.mjs');
  const dirA = tmpDir('cw-2run-a-'); const dirB = tmpDir('cw-2run-b-');
  try {
    const rootA = writeTree(join(dirA, 'src'), TREE_A);
    const rootB = writeTree(join(dirB, 'src'), TREE_B);
    const cliA = await cliFragment(rootA);
    const cliB = await cliFragment(rootB);
    const one = await runExtract({ path: rootA, ctags: false });
    const two = await runExtract({ path: rootB, ctags: false });
    assert.equal(JSON.stringify(one.fragment), cliA, 'run 1 fragment == CLI(A)');
    assert.equal(JSON.stringify(two.fragment), cliB, 'run 2 fragment == CLI(B) (no state bleed from run 1)');
    assert.match(one.banner, /\[extract\] \d+ symbols/, 'runExtract returns the banner');
  } finally { cleanup(dirA); cleanup(dirB); }
});

test('IE-TWO-RUNS-CONCURRENT: Promise.all of two runExtract calls each byte-equal a fresh CLI run', async () => {
  const { runExtract } = await import('../scripts/extract-symbols.mjs');
  const dirA = tmpDir('cw-cc-a-'); const dirB = tmpDir('cw-cc-b-');
  try {
    const rootA = writeTree(join(dirA, 'src'), TREE_A);
    const rootB = writeTree(join(dirB, 'src'), TREE_B);
    const cliA = await cliFragment(rootA);
    const cliB = await cliFragment(rootB);
    // concurrent: kills the interleaving / first-init (WASM single-flight) race class
    const [one, two] = await Promise.all([
      runExtract({ path: rootA, ctags: false }),
      runExtract({ path: rootB, ctags: false }),
    ]);
    assert.equal(JSON.stringify(one.fragment), cliA, 'concurrent run A == CLI(A)');
    assert.equal(JSON.stringify(two.fragment), cliB, 'concurrent run B == CLI(B)');
  } finally { cleanup(dirA); cleanup(dirB); }
});

// runExtract throws ExtractError (not process.exit) on the guard paths, with byte-identical message
// text — main() is what prints + exits, so a stray exit would kill THIS test process (loud).
test('RE-ERRORS: guard paths throw ExtractError, never exit the host process', async () => {
  const { runExtract } = await import('../scripts/extract-symbols.mjs');
  await assert.rejects(() => runExtract({ path: null }), (e) => e.name === 'ExtractError' && e.code === 2,
    'missing path -> ExtractError(2)');
  await assert.rejects(() => runExtract({ path: '/no/such/tree/xyzzy' }), (e) => e.name === 'ExtractError' && e.code === 1 && /not found/.test(e.message),
    'missing tree -> ExtractError(1) not found');
  await assert.rejects(() => runExtract({ path: process.cwd(), engine: 'bogus' }), (e) => e.name === 'ExtractError' && e.code === 2 && /unknown --engine/.test(e.message),
    'bad engine -> ExtractError(2)');
});
