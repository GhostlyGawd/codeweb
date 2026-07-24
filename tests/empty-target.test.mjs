// #1 (IMPROVEMENTS.md): an empty or unsupported target must NOT produce a green run and a blank
// map. The extractor fails with an actionable message (path scanned, supported extensions, next
// step); `--allow-empty` restores the old behavior for intentionally-sparse targets. E-tests are
// BDD: given/when/then in the names, real subprocesses, no mocks.
// E7 (API.md F2 / CLI.md 7.2): a NONEXISTENT target is an input error — exit 2 (distinct from
// the stage-failure 1) and no workspace directory is ever created for it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { existsSync, readdirSync } from 'node:fs';
import { runNode, script, tmpDir, cleanup, writeTree, readJSON } from './helpers.mjs';

test('E1 given an empty directory, extract exits 1 and says no supported source was found', () => {
  const dir = tmpDir('codeweb-empty-');
  try {
    const r = runNode(script('extract-symbols.mjs'), [dir, '--out', join(dir, 'f.json')]);
    assert.equal(r.status, 1, 'exit 1 (nothing found)');
    assert.match(r.stderr, /no supported source files/i, 'names the failure');
    assert.ok(r.stderr.includes(dir), 'names the path scanned');
    assert.match(r.stderr, /\.js\b/, 'lists supported extensions (js)');
    assert.match(r.stderr, /\.swift\b/, 'lists supported extensions (swift)');
    assert.match(r.stderr, /--allow-empty/, 'names the escape hatch');
    assert.ok(!existsSync(join(dir, 'f.json')), 'no output artifact on failure');
  } finally { cleanup(dir); }
});

test('E2 given only unsupported files, extract exits 1 with the same guidance', () => {
  const dir = tmpDir('codeweb-empty-');
  try {
    writeTree(dir, { 'README.txt': 'hello\n', 'data/legacy.cbl': 'IDENTIFICATION DIVISION.\n' });
    const r = runNode(script('extract-symbols.mjs'), [dir, '--out', join(dir, 'f.json')]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /no supported source files/i);
    assert.match(r.stderr, /(wrong|right) (directory|path)/i, 'asks whether the path is right');
    assert.match(r.stderr, /agent fallback|\/codeweb/i, 'routes non-native languages to the agent fallback');
  } finally { cleanup(dir); }
});

test('E3 given --allow-empty, an empty target extracts an empty fragment and exits 0', () => {
  const dir = tmpDir('codeweb-empty-');
  try {
    const r = runNode(script('extract-symbols.mjs'), [dir, '--allow-empty', '--out', join(dir, 'f.json')]);
    assert.equal(r.status, 0, `allow-empty succeeds (stderr: ${r.stderr})`);
    const frag = readJSON(join(dir, 'f.json'));
    assert.equal(frag.nodes.length, 0);
    assert.equal(frag.edges.length, 0);
  } finally { cleanup(dir); }
});

test('E4 given supported files that define no symbols, extract exits 1 and says so', () => {
  const dir = tmpDir('codeweb-empty-');
  try {
    // Valid JS, zero function/class/method definitions.
    writeTree(dir, { 'config.js': 'export default { retries: 3 };\n' });
    const r = runNode(script('extract-symbols.mjs'), [dir, '--out', join(dir, 'f.json')]);
    assert.equal(r.status, 1, 'exit 1 (nothing extracted)');
    assert.match(r.stderr, /0 symbols/i, 'names the outcome');
    assert.match(r.stderr, /--allow-empty/, 'names the escape hatch');
  } finally { cleanup(dir); }
});

test('E5 given an empty target, run.mjs aborts at extract with the message visible', () => {
  const dir = tmpDir('codeweb-empty-');
  const ws = tmpDir('codeweb-empty-ws-');
  try {
    const r = runNode(script('run.mjs'), [dir, '--out-dir', ws]);
    assert.notEqual(r.status, 0, 'pipeline does not report success');
    assert.match(r.stderr, /no supported source files/i, 'the extractor message reaches the user');
    assert.ok(!existsSync(join(ws, 'report.html')), 'no blank report is produced');
  } finally { cleanup(dir); cleanup(ws); }
});

test('E6 given --allow-empty, run.mjs completes the pipeline on an empty target', () => {
  const dir = tmpDir('codeweb-empty-');
  const ws = tmpDir('codeweb-empty-ws-');
  try {
    const r = runNode(script('run.mjs'), [dir, '--allow-empty', '--out-dir', ws]);
    assert.equal(r.status, 0, `pipeline succeeds (stderr: ${r.stderr.slice(-500)})`);
    assert.ok(existsSync(join(ws, 'report.html')), 'report exists');
    assert.ok(existsSync(join(ws, 'graph.json')), 'graph exists');
    assert.equal(readJSON(join(ws, 'graph.json')).nodes.length, 0);
  } finally { cleanup(dir); cleanup(ws); }
});

test('E7 given a nonexistent target, run.mjs exits 2 and leaves NO .codeweb behind', () => {
  const dir = tmpDir('codeweb-empty-');
  try {
    const missing = join(dir, 'no-such-dir');
    const r = runNode(script('run.mjs'), [missing]);
    assert.equal(r.status, 2, 'a wrong path is an input error (2), not a stage failure (1) — API.md F2');
    assert.match(r.stderr, /target not found/, 'names the failure');
    assert.ok(r.stderr.includes(missing), 'names the path');
    assert.ok(!existsSync(missing), 'the missing target was not fabricated by the workspace mkdir');
    assert.deepEqual(readdirSync(dir), [], 'the scratch dir is untouched — no .codeweb minted anywhere (CLI.md 7.2)');
  } finally { cleanup(dir); }
});
