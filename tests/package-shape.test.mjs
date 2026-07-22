// Spec J (docs/specs/reach-surfaces.md): the npm package is publish-ready — reach beyond the
// Claude plugin marketplace to every MCP client (`npx codeweb`, `codeweb-mcp`).
//
// P1: manifest shape — not private, bins exist with shebangs, files whitelist entries exist,
//     zero runtime dependencies (the standing stance).
// P2: `npm pack --dry-run` (offline) ships the engine + plugin surfaces and none of the
//     repo-only trees (bench/site/docs/tests).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { PLUGIN_ROOT } from './helpers.mjs';

const pkg = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'package.json'), 'utf8'));

test('P1: manifest is publishable — bins, files, no runtime deps, not private', () => {
  assert.ok(!pkg.private, 'private flag removed');
  assert.ok(pkg.publishConfig?.access === 'public');
  for (const [name, rel] of Object.entries(pkg.bin || {})) {
    const p = join(PLUGIN_ROOT, rel);
    assert.ok(existsSync(p), `bin ${name} -> ${rel} exists`);
    assert.match(readFileSync(p, 'utf8').slice(0, 30), /^#!\/usr\/bin\/env node/, `${rel} carries a shebang`);
  }
  assert.ok(Object.keys(pkg.bin || {}).includes('codeweb-mcp'), 'the MCP server ships as a bin for non-Claude clients');
  for (const f of pkg.files || []) assert.ok(existsSync(join(PLUGIN_ROOT, f)), `files entry exists: ${f}`);
  assert.deepEqual(pkg.dependencies || {}, {}, 'zero runtime dependencies — the stance holds');
  assert.ok(pkg.optionalDependencies?.['web-tree-sitter'], 'the AST tier stays optional');
});

test('P2: npm pack ships engine + plugin surfaces, excludes repo-only trees', () => {
  // Platform-honest spawn: on windows npm is npm.cmd — a bare 'npm' is ENOENT (status null), and
  // .cmd files need a shell since Node's CVE-2024-27980 hardening. Assertions unchanged.
  const WIN = process.platform === 'win32';
  const r = spawnSync(WIN ? 'npm.cmd' : 'npm', ['pack', '--dry-run', '--json'], { cwd: PLUGIN_ROOT, encoding: 'utf8', maxBuffer: 1 << 26, shell: WIN });
  assert.equal(r.status, 0, r.stderr);
  const files = JSON.parse(r.stdout)[0].files.map((f) => f.path);
  for (const must of ['scripts/mcp-server.mjs', 'scripts/run.mjs', 'scripts/extract-symbols.mjs', '.claude-plugin/plugin.json', 'hooks/hooks.json', 'LICENSE', 'README.md']) {
    assert.ok(files.includes(must), `tarball carries ${must}`);
  }
  for (const banned of ['bench/', 'site/', 'docs/', 'tests/', 'assets/', 'spike/']) {
    assert.ok(!files.some((f) => f.startsWith(banned)), `tarball excludes ${banned}`);
  }
});
