import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const bin = resolve('bin/codeweb.mjs');
const run = (args, cwd) => spawnSync(process.execPath, [bin, ...args], {
  cwd, encoding: 'utf8', timeout: 30000,
  env: { ...process.env, CODEWEB_NO_STATS: '1', CODEWEB_NO_PROMO: '1' },
});

test('AC15 dispatcher documents its four package commands', () => {
  const result = run(['--help'], process.cwd());
  assert.equal(result.status, 0, result.stderr);
  for (const command of ['setup', 'doctor', 'review', 'gate']) assert.match(result.stdout, new RegExp('codeweb ' + command));
});

test('AC15 reserved directory names still map through explicit paths and delimiter', () => {
  const root = mkdtempSync(join(tmpdir(), 'cw-dispatch-'));
  try {
    for (const name of ['setup', 'doctor', 'review', 'gate']) {
      mkdirSync(join(root, name));
      writeFileSync(join(root, name, 'main.js'), 'export function value() { return 42; }\n');
      const result = run(name === 'review' ? ['--', name, '--json'] : ['./' + name, '--json'], root);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).symbols, 1);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('AC15 legacy map rejects unknown options with usage exit two', () => {
  const result = run(['--imaginary'], process.cwd());
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unknown flag/);
});
