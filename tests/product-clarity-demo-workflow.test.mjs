import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'scripts/product-demo.mjs');
const run = (...args) => spawnSync(process.execPath, [script, ...args], {
  cwd: root, encoding: 'utf8', timeout: 90000,
});

test('technical demo produces observed caller, cycle and report-only evidence without executing fixture source', () => {
  const temp = mkdtempSync(join(tmpdir(), 'codeweb-demo-test-'));
  try {
    const out = join(temp, 'new output');
    const result = run('--out', out);
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(readFileSync(join(out, 'receipt.json'), 'utf8'));
    assert.equal(receipt.schemaVersion, 1);
    assert.equal(receipt.productVersion, JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version);
    assert.equal(receipt.fixture, 'cross-file-cycle');
    assert.equal(receipt.changedFile, 'feature.js');
    assert.equal(receipt.expectedCaller, 'app.js:run');
    assert.deepEqual(receipt.gate, { blockingExitCode: 1, reportOnlyExitCode: 0, verdict: 'regression' });
    assert.equal(receipt.verified, true);
    assert.match(readFileSync(join(out, 'repo/app.js'), 'utf8'), /throw new Error\('DEMO_SOURCE_MUST_NOT_EXECUTE'\)/);
    const before = JSON.parse(readFileSync(join(out, receipt.beforeGraph), 'utf8'));
    const after = JSON.parse(readFileSync(join(out, receipt.afterGraph), 'utf8'));
    assert.ok(before.nodes.some((n) => n.id === 'app.js:run'));
    assert.ok(after.nodes.some((n) => n.file === 'feature.js'));
    const callers = JSON.parse(readFileSync(join(out, 'callers.json'), 'utf8'));
    assert.ok(callers.results.includes(receipt.expectedCaller));
    const diff = JSON.parse(readFileSync(join(out, 'diff.json'), 'utf8'));
    assert.ok(diff.cycles.added.length > 0);
    assert.equal(diff.verdict.ok, false);
    assert.match(readFileSync(join(out, receipt.reviewHtml), 'utf8'), /feature\.js/);
    assert.match(readFileSync(join(out, 'gate-report-only.txt'), 'utf8'), /new dependency cycle/i);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('technical demo refuses existing output and invalid options without overwriting evidence', () => {
  const temp = mkdtempSync(join(tmpdir(), 'codeweb-demo-existing-'));
  try {
    writeFileSync(join(temp, 'receipt.json'), 'previous evidence');
    const result = run('--out', temp);
    assert.equal(result.status, 2);
    assert.equal(readFileSync(join(temp, 'receipt.json'), 'utf8'), 'previous evidence');
    assert.equal(existsSync(join(temp, 'repo')), false);
    assert.equal(run('--wrong-option').status, 2);
    assert.equal(run().status, 2);
    assert.equal(run('--help').status, 0);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
