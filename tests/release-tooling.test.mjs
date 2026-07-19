// Tests for the release ecosystem: scripts/release-utils.mjs + the version-sync /
// check-consistency wrappers. Pure helpers are unit-tested; the consistency checker
// is run against the real repo (must be aligned) and a deliberately-drifted fixture.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { PLUGIN_ROOT, runNode, script, tmpDir, cleanup, writeTree } from './helpers.mjs';
import {
  bumpVersion, rollChangelog, mcpToolCount, productToolCount, checkConsistency, applySync, syncTargets,
} from '../scripts/release-utils.mjs';

test('bumpVersion follows SemVer', () => {
  assert.equal(bumpVersion('0.2.0', 'patch'), '0.2.1');
  assert.equal(bumpVersion('0.2.0', 'minor'), '0.3.0');
  assert.equal(bumpVersion('0.2.5', 'major'), '1.0.0');
  assert.throws(() => bumpVersion('0.2.0', 'nope'));
});

test('the real repo derives 24 MCP tools from the source', () => {
  assert.equal(mcpToolCount(PLUGIN_ROOT), 24);
  assert.equal(productToolCount(PLUGIN_ROOT), 24, 'product.json must list exactly the MCP tools');
});

test('the real repo is consistent (versions + tool count aligned)', () => {
  const r = checkConsistency(PLUGIN_ROOT);
  assert.equal(r.ok, true, `expected aligned, got: ${r.problems.join('; ')}`);
  assert.equal(r.count, 24);
});

test('check-consistency CLI exits 0 on the aligned repo', () => {
  const r = runNode(script('check-consistency.mjs'));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /all surfaces aligned/);
});

test('rollChangelog moves Unreleased into a dated version section', () => {
  const md = [
    '# Changelog', '', '## [Unreleased]', '', '### Added', '- a shiny new thing', '',
    '## [0.1.0] - 2026-01-01', '### Added', '- initial', '',
    '[Unreleased]: https://github.com/GhostlyGawd/codeweb/compare/v0.1.0...HEAD',
    '[0.1.0]: https://github.com/GhostlyGawd/codeweb/releases/tag/v0.1.0', '',
  ].join('\n');
  const out = rollChangelog(md, '0.2.0', '2026-02-02');
  assert.match(out, /## \[0\.2\.0\] - 2026-02-02/);
  assert.match(out, /## \[0\.2\.0\][\s\S]*?- a shiny new thing/, 'body moves under the new version');
  // and it is no longer under Unreleased (everything before the new section is the Unreleased block)
  const unreleasedBlock = out.split('## [0.2.0]')[0];
  assert.ok(!unreleasedBlock.includes('a shiny new thing'), 'item should leave Unreleased');
  assert.match(out, /## \[Unreleased\]\s*\n\s*_Nothing yet/, 'Unreleased is reset');
  assert.match(out, /\[0\.2\.0\]: https:\/\/github\.com\/GhostlyGawd\/codeweb\/compare\/v0\.1\.0\.\.\.v0\.2\.0/);
  assert.match(out, /\[Unreleased\]: https:\/\/github\.com\/GhostlyGawd\/codeweb\/compare\/v0\.2\.0\.\.\.HEAD/);
});

test('rollChangelog refuses an empty Unreleased', () => {
  const md = '## [Unreleased]\n\n_Nothing yet. Open work lands here before it ships in the next tagged release._\n';
  assert.throws(() => rollChangelog(md, '0.2.0', '2026-02-02'), /nothing to release/);
});

test('syncTargets rewrites version + tool count via backref-preserving subs', () => {
  const [plugin] = syncTargets('9.9.9', 42);
  let s = '"version": "0.0.0",\n... exposes 15 deterministic read-only query tools over MCP ...';
  for (const [re, rep] of plugin.subs) s = s.replace(re, rep);
  assert.match(s, /"version": "9\.9\.9"/);
  assert.match(s, /42 deterministic read-only query tools/);
});

test('checkConsistency catches drift, applySync repairs it (round-trip)', () => {
  const root = tmpDir('codeweb-rel-');
  try {
    writeTree(root, {
      'package.json': JSON.stringify({ version: '0.3.0' }),
      '.claude-plugin/plugin.json': JSON.stringify({
        version: '0.1.0',
        description: 'exposes 15 deterministic read-only query tools over MCP for agents',
      }, null, 2),
      'skills/codebase-anatomy/SKILL.md': '---\nname: x\nversion: 0.1.0\n---\nbody\n',
      'scripts/mcp-server.mjs': "const TOOLS=[{ name: 'codeweb_a' },{ name: 'codeweb_b' },{ name: 'codeweb_c' }];\n",
      'site/data/product.json': JSON.stringify({ toolPhases: [{ tools: [{}, {}, {}] }] }),
      'CHANGELOG.md': '## [0.3.0] - 2026-01-01\n### Added\n- x\n',
    });

    const before = checkConsistency(root);
    assert.equal(before.ok, false);
    assert.equal(before.count, 3, 'tool count comes from the stub mcp-server');
    assert.ok(before.problems.some((p) => /plugin\.json version/.test(p)));
    assert.ok(before.problems.some((p) => /advertises 15 tools/.test(p)));
    assert.ok(before.problems.some((p) => /SKILL\.md version/.test(p)));

    const changed = applySync(root, before.version, before.count);
    assert.ok(changed.includes('.claude-plugin/plugin.json'));
    assert.ok(changed.includes('skills/codebase-anatomy/SKILL.md'));

    const after = checkConsistency(root);
    assert.equal(after.ok, true, `still drifting: ${after.problems.join('; ')}`);
  } finally {
    cleanup(root);
  }
});
