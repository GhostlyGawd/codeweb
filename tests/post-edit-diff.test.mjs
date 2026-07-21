// Regression suite for the PostToolUse structural-diff hook.
//
// The hook re-extracts a mapped target after an edit and flags the edges-only subset of diff.mjs's
// regressions — a NEW file-level cycle, or a SURVIVING symbol that lost all its callers — surfaced
// to the agent, fail-open. (Duplication/coupling stay the full `diff.mjs` gate.) Core comparison is
// the pure `structuralRegressions()` in graph-ops; the hook is a thin stdin→extract→compare shell.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { structuralRegressions } from '../scripts/lib/graph-ops.mjs';
import { runNode, tmpDir, cleanup, writeTree, readJSON, script, PLUGIN_ROOT } from './helpers.mjs';

const G = (nodes, edges) => ({ nodes, edges });
const N = (id) => ({ id, label: id.split(':')[1] || id, file: id.split(':')[0], kind: 'function', exports: false, domain: '' });
const C = (from, to) => ({ from, to, kind: 'call', weight: 1 });

// ---- pure logic ----------------------------------------------------------------------------
test('structuralRegressions: a NEW file-level cycle is flagged', () => {
  const before = G([N('a.js:f'), N('b.js:g')], [C('a.js:f', 'b.js:g')]);
  const after = G([N('a.js:f'), N('b.js:g')], [C('a.js:f', 'b.js:g'), C('b.js:g', 'a.js:f')]);
  assert.equal(structuralRegressions(before, after).newCycles.length, 1, 'a.js <-> b.js is new');
});

test('structuralRegressions: a pre-existing cycle is NOT re-flagged', () => {
  const cyc = G([N('a.js:f'), N('b.js:g')], [C('a.js:f', 'b.js:g'), C('b.js:g', 'a.js:f')]);
  assert.equal(structuralRegressions(cyc, cyc).newCycles.length, 0, 'unchanged cycle is not new');
});

test('structuralRegressions: a SURVIVING symbol that lost all callers is flagged', () => {
  const before = G([N('a.js:f'), N('a.js:helper')], [C('a.js:f', 'a.js:helper')]);
  const after = G([N('a.js:f'), N('a.js:helper')], []); // helper survives but f no longer calls it
  assert.deepEqual(structuralRegressions(before, after).lostCallers, ['a.js:helper']);
});

test('structuralRegressions: a DELETED symbol is not a lost-caller regression', () => {
  const before = G([N('a.js:f'), N('a.js:helper')], [C('a.js:f', 'a.js:helper')]);
  const after = G([N('a.js:f')], []); // helper removed entirely — deleting code is fine
  assert.equal(structuralRegressions(before, after).lostCallers.length, 0);
});

test('structuralRegressions: a clean additive edit yields nothing', () => {
  const before = G([N('a.js:f'), N('a.js:helper')], [C('a.js:f', 'a.js:helper')]);
  const after = G([N('a.js:f'), N('a.js:helper'), N('a.js:extra')],
    [C('a.js:f', 'a.js:helper'), C('a.js:f', 'a.js:extra')]);
  const r = structuralRegressions(before, after);
  assert.equal(r.newCycles.length + r.lostCallers.length, 0);
});

// ---- hook end-to-end ------------------------------------------------------------------------
let SRC;
const HOOK = join(PLUGIN_ROOT, 'hooks', 'post-edit-diff.mjs');
const runHook = (filePath) => spawnSync(process.execPath, [HOOK],
  { input: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: filePath } }), encoding: 'utf8' });

before(() => {
  SRC = tmpDir('codeweb-hook-');
  // clean baseline: a.mjs -> b.mjs (no cycle)
  writeTree(SRC, {
    'a.mjs': 'import { b } from "./b.mjs";\nexport function a() { return b(); }\n',
    'b.mjs': 'export function b() { return 1; }\n',
  });
  // map it: baseline graph.json under <target>/.codeweb/
  mkdirSync(join(SRC, '.codeweb'), { recursive: true });
  const r = runNode(script('extract-symbols.mjs'), [SRC, '--target', 'hook-x', '--no-ctags', '--out', join(SRC, '.codeweb', 'graph.json')]);
  assert.equal(r.status, 0, r.stderr);
});
after(() => cleanup(SRC));

test('hook is INERT for a non-source file (no .codeweb work)', () => {
  const res = runHook(join(SRC, 'README.md'));
  assert.equal(res.status, 0, 'fail-open exit 0');
  assert.ok(!/cycle|regression/i.test(res.stderr || ''), 'no structural output for a doc file');
});

test('hook is INERT when the file is not under a mapped target', () => {
  const elsewhere = tmpDir('codeweb-unmapped-');
  writeTree(elsewhere, { 'x.mjs': 'export function x() {}\n' });
  const res = runHook(join(elsewhere, 'x.mjs'));
  cleanup(elsewhere);
  assert.equal(res.status, 0);
  assert.ok(!/cycle|regression/i.test(res.stderr || ''), 'unmapped target -> no-op');
});

test('hook flags a NEW cycle introduced by an edit (vs the baseline)', () => {
  // edit b.mjs on disk to call back into a.mjs -> file cycle a.mjs <-> b.mjs
  writeFileSync(join(SRC, 'b.mjs'), 'import { a } from "./a.mjs";\nexport function b() { return a(); }\n');
  const res = runHook(join(SRC, 'b.mjs'));
  assert.equal(res.status, 0, 'fail-open exit 0 even when warning');
  assert.match(res.stderr || '', /cycle/i, 'warns about the new dependency cycle');
});

// Perf-quality finding 22 — the hook must write NO temp files. Pre-fix it left a pid-named
// ~1.2MB codeweb-hook-<pid>.json FILE in os.tmpdir() on EVERY edit, forever (the fragment now
// streams back on stdout). Tripwire: running the hook end-to-end adds no such file. (The suite's
// own fixture DIRS are mkdtemp'd codeweb-hook-* too — the leak signature is specifically the
// .json FILES, so the check filters to those.)
test('the hook leaves no codeweb-hook-*.json temp files behind', async () => {
  const { readdirSync, statSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const hookTempFiles = () => readdirSync(tmpdir())
    .filter((f) => /^codeweb-hook-.*\.json$/.test(f))
    .filter((f) => { try { return statSync(join(tmpdir(), f)).isFile(); } catch { return false; } })
    .sort();
  const beforeFiles = hookTempFiles();
  const r = runHook(join(SRC, 'a.mjs'));
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(hookTempFiles(), beforeFiles, 'no new codeweb-hook-*.json entries in the OS tmpdir');
});
