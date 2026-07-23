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

// ---- Round 2, finding #18a — the hook-baseline sidecar (BDD) --------------------------------
// The hook used to JSON.parse the multi-MB baseline graph and recompute its cycles + caller
// index on EVERY edit — an artifact that cannot have changed since map time. run.mjs/refresh now
// persist `hook-baseline.json` (cycle keys + callIn counts + a graph.json stamp/hash) beside
// graph.json; the hook consumes it when the stamp (or, on stamp mismatch, the byte hash)
// matches, and falls back to today's parse path otherwise — fail-open at every seam.
import { rmSync as rmSync18, readFileSync as readFileSync18, statSync as statSync18 } from 'node:fs';
import { runNode as runNode18 } from './helpers.mjs';
import { HOOK_BASELINE_NAME } from '../scripts/lib/hook-baseline.mjs';
import { SCAN_CACHE_NAME } from '../scripts/lib/cli.mjs'; // finding #18b: the warm cache the in-process fire rides
import { check } from '../hooks/post-edit-diff.mjs';

const CYCLE_FIXTURE = {
  'x.mjs': 'import { y } from "./y.mjs";\nexport function x() { return y(); }\n',
  'y.mjs': 'import { x } from "./x.mjs";\nexport function y() { return 1; }\nexport function lonely() { return x(); }\n',
};

function mapWithRun(dir) {
  const r = runNode18(script('run.mjs'), [dir, '--out-dir', join(dir, '.codeweb')]);
  assert.equal(r.status, 0, r.stderr);
}

test('S18-1: given a map, the sidecar exists beside graph.json and stamp-matches it', () => {
  const dir = tmpDir('codeweb-hb-');
  try {
    writeTree(dir, CYCLE_FIXTURE);
    mapWithRun(dir);
    const side = JSON.parse(readFileSync18(join(dir, '.codeweb', HOOK_BASELINE_NAME), 'utf8'));
    const st = statSync18(join(dir, '.codeweb', 'graph.json'));
    assert.equal(side.version, 1);
    assert.equal(side.graph.s, st.size, 'stamped size matches graph.json');
    assert.equal(side.graph.m, Math.round(st.mtimeMs), 'stamped mtime matches graph.json');
    assert.ok(Array.isArray(side.cycles) && side.cycles.some((k) => k.includes('x.mjs')), 'cycle keys recorded');
    assert.ok(side.callIn && typeof side.callIn === 'object', 'callIn counts recorded');
  } finally { cleanup(dir); }
});

test('S18-2: a valid sidecar yields the same verdict as the legacy parse path on the same payload', async () => {
  const dir = tmpDir('codeweb-hb-');
  try {
    writeTree(dir, CYCLE_FIXTURE);
    mapWithRun(dir);
    // edit y.mjs so `lonely` loses its caller relationship target... make x() stop calling y():
    writeFileSync(join(dir, 'x.mjs'), 'import { y } from "./y.mjs";\nexport function x() { return 1; }\n');
    const payload = JSON.stringify({ tool_input: { file_path: join(dir, 'x.mjs') } });
    const viaSidecar = await check(payload);
    rmSync18(join(dir, '.codeweb', HOOK_BASELINE_NAME));
    const viaGraph = await check(payload);
    assert.deepEqual(viaSidecar, viaGraph, 'sidecar path and legacy path agree verdict-for-verdict');
  } finally { cleanup(dir); }
});

test('S18-3: removing a baseline cycle key from the sidecar makes the hook report that cycle as NEW — the sidecar, not the graph, was consumed', async () => {
  const dir = tmpDir('codeweb-hb-');
  try {
    writeTree(dir, CYCLE_FIXTURE);
    mapWithRun(dir);
    const sidePath = join(dir, '.codeweb', HOOK_BASELINE_NAME);
    const side = JSON.parse(readFileSync18(sidePath, 'utf8'));
    const dropped = side.cycles.filter((k) => !k.includes('x.mjs'));
    assert.notEqual(dropped.length, side.cycles.length, 'fixture guarantees an x<->y cycle to drop');
    // rewrite the sidecar, then re-stamp it against graph.json so it still validates
    const st = statSync18(join(dir, '.codeweb', 'graph.json'));
    writeFileSync(sidePath, JSON.stringify({ ...side, cycles: dropped, graph: { ...side.graph, s: st.size, m: Math.round(st.mtimeMs) } }));
    const payload = JSON.stringify({ tool_input: { file_path: join(dir, 'x.mjs') } });
    const out = await check(payload); // no source change: the cycle exists in the graph AND on disk
    assert.ok(out, 'verdict fired');
    assert.ok(out.newCycles.some((c) => c.join('|').includes('x.mjs')), 'the dropped baseline cycle is reported as new — only the sidecar could say that');
  } finally { cleanup(dir); }
});

test('S18-4: a stale or corrupt sidecar falls back to the legacy path with the correct verdict', async () => {
  const dir = tmpDir('codeweb-hb-');
  try {
    writeTree(dir, CYCLE_FIXTURE);
    mapWithRun(dir);
    const sidePath = join(dir, '.codeweb', HOOK_BASELINE_NAME);
    const payload = JSON.stringify({ tool_input: { file_path: join(dir, 'x.mjs') } });
    rmSync18(sidePath, { force: true });
    const want = await check(payload); // legacy truth (no sidecar)
    mapWithRun(dir); // restore sidecar
    // stale: poisoned stamp AND hash -> must fall back, not consume the poison
    const side = JSON.parse(readFileSync18(sidePath, 'utf8'));
    writeFileSync(sidePath, JSON.stringify({ ...side, cycles: [], graph: { s: 1, m: 1, h: 'nope' } }));
    assert.deepEqual(await check(payload), want, 'stale sidecar -> legacy verdict');
    // corrupt: unparseable
    writeFileSync(sidePath, '{nope');
    assert.deepEqual(await check(payload), want, 'corrupt sidecar -> legacy verdict');
  } finally { cleanup(dir); }
});

test('S18-5: both sidecar AND graph corrupt -> the hook binary exits 0 silently (the contract is fail-open)', () => {
  const dir = tmpDir('codeweb-hb-');
  try {
    writeTree(dir, CYCLE_FIXTURE);
    mapWithRun(dir);
    writeFileSync(join(dir, '.codeweb', HOOK_BASELINE_NAME), '{nope');
    writeFileSync(join(dir, '.codeweb', 'graph.json'), '{also nope'); // stamp mismatch + unparseable
    const res = spawnSync(process.execPath, [HOOK],
      { input: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: join(dir, 'x.mjs') } }), encoding: 'utf8' });
    assert.equal(res.status, 0, 'always exit 0');
    assert.ok(!/cycle|regression/i.test(res.stderr || ''), 'no structural output — silence IS the fail-open');
  } finally { cleanup(dir); }
});

// ---- Round 2, finding #18b (WS-H) — in-process extraction via runExtract (BDD) ----------------

// The warm-cache no-change fire: check() returns null (no regression) AND the in-process write-back
// path honors the dirty-skip, so the cache bytes are untouched. (Perf lives in the ledger, not a
// flaky assert.) Also asserts the reused-machinery contract: no child extractor process is needed.
test('S18b-NOCHANGE: a no-change in-process fire returns null and leaves the warm cache bytes untouched', async () => {
  const dir = tmpDir('codeweb-hb-');
  try {
    writeTree(dir, CYCLE_FIXTURE);
    mapWithRun(dir); // warms the SCAN_CACHE_NAME cache beside graph.json
    const cachePath = join(dir, '.codeweb', SCAN_CACHE_NAME);
    const cacheBytesBefore = readFileSync18(cachePath);
    const payload = JSON.stringify({ tool_input: { file_path: join(dir, 'x.mjs') } });
    const out = await check(payload); // x.mjs UNCHANGED since map -> pre-existing cycle only, no regression
    assert.equal(out, null, 'a no-change fire flags nothing');
    assert.ok(readFileSync18(cachePath).equals(cacheBytesBefore), 'dirty-skip: warm cache bytes unchanged on a no-change in-process fire');
  } finally { cleanup(dir); }
});

// Path-parity + the rollback lever: the SAME regression fixture yields byte-identical
// additionalContext whether the hook extracts in-process (default) or via the forced spawn
// (CODEWEB_HOOK_INPROC=0). Proves the lever works AND that the two transports never diverge.
test('S18b-PARITY: additionalContext byte-identical via the in-process path and CODEWEB_HOOK_INPROC=0 (spawn)', () => {
  const dir = tmpDir('codeweb-hbp-');
  try {
    // baseline p.mjs -> q.mjs (no cycle); map it
    writeTree(dir, {
      'p.mjs': 'import { q } from "./q.mjs";\nexport function p() { return q(); }\n',
      'q.mjs': 'export function q() { return 1; }\n',
    });
    mkdirSync(join(dir, '.codeweb'), { recursive: true });
    const m = runNode18(script('extract-symbols.mjs'), [dir, '--target', 'parity-x', '--no-ctags', '--out', join(dir, '.codeweb', 'graph.json')]);
    assert.equal(m.status, 0, m.stderr);
    // edit q.mjs on disk to call back into p -> a NEW file cycle p <-> q (a regression vs baseline)
    writeFileSync(join(dir, 'q.mjs'), 'import { p } from "./p.mjs";\nexport function q() { return p(); }\n');
    const payload = JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: join(dir, 'q.mjs') } });
    const runWith = (env) => spawnSync(process.execPath, [HOOK], { input: payload, encoding: 'utf8', env: { ...process.env, ...env } });
    const ctx = (r) => { try { return JSON.parse(r.stdout).hookSpecificOutput.additionalContext; } catch { return `__NO_CONTEXT__:${r.stdout}`; } };
    const inproc = runWith({ CODEWEB_HOOK_INPROC: '' });   // default: in-process
    const spawned = runWith({ CODEWEB_HOOK_INPROC: '0' }); // rollback lever: forced spawn
    assert.equal(inproc.status, 0, 'in-process fire fail-open exit 0');
    assert.equal(spawned.status, 0, 'forced-spawn fire fail-open exit 0');
    assert.match(ctx(spawned), /cycle/i, 'the forced-spawn path actually fired the regression');
    assert.equal(ctx(inproc), ctx(spawned), 'additionalContext byte-identical across in-process and spawn transports');
  } finally { cleanup(dir); }
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
