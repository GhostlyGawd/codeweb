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
  scanProseCounts,
} from '../scripts/release-utils.mjs';

test('bumpVersion follows SemVer', () => {
  assert.equal(bumpVersion('0.2.0', 'patch'), '0.2.1');
  assert.equal(bumpVersion('0.2.0', 'minor'), '0.3.0');
  assert.equal(bumpVersion('0.2.5', 'major'), '1.0.0');
  assert.throws(() => bumpVersion('0.2.0', 'nope'));
});

test('the real repo derives 27 MCP tools from the source', () => {
  assert.equal(mcpToolCount(PLUGIN_ROOT), 27);
  assert.equal(productToolCount(PLUGIN_ROOT), 27, 'product.json must list exactly the MCP tools');
});

// Round 2, finding #3: engines must claim only what CI actually tests. Node 20's `npm test` glob
// is broken (ci.yml documents it) and the 22/24 matrix never tests 20 — so stop claiming it.
test('engines.node claims exactly the tested floor (>=22)', () => {
  const pkg = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.engines.node, '>=22');
});

test('the real repo is consistent (versions + tool count aligned)', () => {
  const r = checkConsistency(PLUGIN_ROOT);
  assert.equal(r.ok, true, `expected aligned, got: ${r.problems.join('; ')}`);
  assert.equal(r.count, 27);
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
      // Round 2, finding #4: the description drift the gate used to skip — scanned AND sync-repaired.
      'package.json': JSON.stringify({ version: '0.3.0', description: 'engine with 15 MCP tools' }),
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
    assert.ok(before.problems.some((p) => /package\.json.*15 MCP tools/.test(p)), 'the description drift is scanned');

    const changed = applySync(root, before.version, before.count);
    assert.ok(changed.includes('.claude-plugin/plugin.json'));
    assert.ok(changed.includes('skills/codebase-anatomy/SKILL.md'));

    const after = checkConsistency(root);
    assert.equal(after.ok, true, `still drifting: ${after.problems.join('; ')}`);
  } finally {
    cleanup(root);
  }
});

// Round 2, finding #4: the exact live drift the gate printed OK over — package.json's description
// said "24 MCP tools" while 27 shipped (the npm listing, the most public surface). The existing
// toolRe already matches the phrase; what was missing was scanning the file at all.
test('scanProseCounts flags the live package.json description string against 27 tools', () => {
  const live = 'The living map of your codebase — deterministic call/import graph engine, 24 MCP tools for coding agents, and a self-contained interactive report.';
  const problems = scanProseCounts(live, 'package.json (description)', { toolCount: 27, langCount: 11 });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /24 MCP tools/);
});

// #3 (IMPROVEMENTS.md): prose scans — hardcoded tool/language counts in public prose must match
// the canonical facts. The v0.9.0 homepage said "20 tools" for a whole release; never again.
test('scanProseCounts flags a stale tool count, in digits and words', async () => {
  const { scanProseCounts } = await import('../scripts/release-utils.mjs');
  const facts = { toolCount: 24, langCount: 11 };
  assert.equal(scanProseCounts('drive the 24 MCP tools', 'f', facts).length, 0, 'correct count passes');
  assert.equal(scanProseCounts('drive the 20 MCP tools', 'f', facts).length, 1, 'stale digit count flagged');
  assert.equal(scanProseCounts('One graph. Twenty tools.', 'f', facts).length, 1, 'stale word count flagged');
  assert.equal(scanProseCounts('static-analysis tools when available', 'f', facts).length, 0, 'unnumbered mentions pass');
  assert.equal(scanProseCounts('over 20,000 comparisons with tools', 'f', facts).length, 0, 'unrelated numbers pass');
});

test('scanProseCounts flags a stale native-language count', async () => {
  const { scanProseCounts } = await import('../scripts/release-utils.mjs');
  const facts = { toolCount: 24, langCount: 11 };
  assert.equal(scanProseCounts('eleven native today (JavaScript, …)', 'f', facts).length, 0);
  assert.equal(scanProseCounts('five first-class languages', 'f', facts).length, 1);
  assert.equal(scanProseCounts('12 native languages', 'f', facts).length, 1);
});

// The language count the site claims is DATA (product.json); this pins that data to the engine:
// one file per supported extension must extract to exactly product.json's language list length.
test('product.json languages match the extractor: one file per extension, counted', async () => {
  const { productLanguageCount } = await import('../scripts/release-utils.mjs');
  const dir = tmpDir('codeweb-langs-');
  try {
    writeTree(dir, {
      'a.js': 'export function fjs() { return 1; }\n',
      'b.mjs': 'export function fmjs() { return 1; }\n',
      'c.cjs': 'function fcjs() { return 1; }\nmodule.exports = { fcjs };\n',
      'd.jsx': 'export function fjsx() { return 1; }\n',
      'e.ts': 'export function fts(): number { return 1; }\n',
      'f.tsx': 'export function ftsx(): number { return 1; }\n',
      'g.py': 'def fpy():\n    return 1\n',
      'h.rs': 'pub fn frs() -> i32 { 1 }\n',
      'i.go': 'package p\n\nfunc Fgo() int { return 1 }\n',
      'j.java': 'public class J { public int fj() { return 1; } }\n',
      'k.cs': 'public class K { public int Fk() { return 1; } }\n',
      'l.rb': 'def frb\n  1\nend\n',
      'm.php': '<?php\nfunction fphp() { return 1; }\n',
      'n.kt': 'fun fkt(): Int = 1\n',
      'o.kts': 'fun fkts(): Int = 1\n',
      'p.swift': 'func fswift() -> Int { return 1 }\n',
    });
    const r = runNode(script('extract-symbols.mjs'), [dir, '--out', join(dir, 'f.json')]);
    assert.equal(r.status, 0, r.stderr);
    const langs = JSON.parse(readFileSync(join(dir, 'f.json'), 'utf8')).meta.languages;
    assert.equal(langs.length, productLanguageCount(PLUGIN_ROOT),
      `extractor languages [${langs.join(', ')}] must match product.json's count`);
  } finally { cleanup(dir); }
});
