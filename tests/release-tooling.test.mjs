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

test('the real repo derives 28 MCP tools from the source', () => {
  assert.equal(mcpToolCount(PLUGIN_ROOT), 28);
  assert.equal(productToolCount(PLUGIN_ROOT), 28, 'product.json must list exactly the MCP tools');
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
  assert.equal(r.count, 28);
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
  let s = '"version": "0.0.0",\n... exposes 15 MCP tools for agents ...';
  for (const [re, rep] of plugin.subs) s = s.replace(re, rep);
  assert.match(s, /"version": "9\.9\.9"/);
  assert.match(s, /42 MCP tools/);
});

test('checkConsistency catches drift, applySync repairs it (round-trip)', () => {
  const root = tmpDir('codeweb-rel-');
  try {
    writeTree(root, {
      // Round 2, finding #4: the description drift the gate used to skip — scanned AND sync-repaired.
      'package.json': JSON.stringify({ version: '0.3.0', description: 'engine with 15 MCP tools' }),
      '.claude-plugin/plugin.json': JSON.stringify({
        version: '0.1.0',
        description: 'exposes 15 MCP tools for agents',
      }, null, 2),
      'skills/codebase-anatomy/SKILL.md': '---\nname: x\nmetadata:\n  version: 0.1.0\n---\nbody\n',
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

// D6 / CHARTER C7: a sponsorship cost premise shipped in a run.mjs banner where no gate looked.
// Stdout claim strings now live in scripts/lib/product-copy.mjs, and checkConsistency fails on
// any cost-premise wording there — the exact class C7 ruled fabricated on 2026-07-25.
test('checkConsistency fails a sponsorship cost premise in the stdout copy module', () => {
  const root = tmpDir('codeweb-rel-');
  try {
    writeTree(root, {
      'package.json': JSON.stringify({ version: '0.3.0', description: 'x' }),
      '.claude-plugin/plugin.json': JSON.stringify({ version: '0.3.0', description: 'x' }, null, 2),
      'skills/codebase-anatomy/SKILL.md': '---\nname: x\nmetadata:\n  version: 0.3.0\n---\nbody\n',
      'scripts/mcp-server.mjs': "const TOOLS=[{ name: 'codeweb_a' }];\n",
      'site/data/product.json': JSON.stringify({ toolPhases: [{ tools: [{}] }] }),
      'CHANGELOG.md': '## [0.3.0] - 2026-01-01\n### Added\n- x\n',
      'scripts/lib/product-copy.mjs': "export const SPONSOR_ASK = 'sponsoring pays for the benchmarks';\n",
    });
    const r = checkConsistency(root);
    assert.ok(r.problems.some((p) => /C7/.test(p) && /cost premise/.test(p)),
      `missing the C7 problem: ${r.problems.join('; ') || '(none)'}`);

    writeTree(root, {
      'scripts/lib/product-copy.mjs': "export const SPONSOR_ASK = 'sponsoring supports the project, and sponsors get seen';\n",
    });
    const clean = checkConsistency(root);
    assert.ok(!clean.problems.some((p) => /C7/.test(p)), 'the ratified wording passes');
  } finally { cleanup(root); }
});

// 2026-08-16 drift audit: the C7 class shipped AGAIN through surfaces the product-copy check
// never read (report/demo footer tooltips, trend.mjs, FUNDING.yml). The sweep now covers every
// prose surface, proximity-gated on sponsor-adjacent wording.
test('checkConsistency fails a sponsorship cost premise on any prose surface, not just product-copy', () => {
  const root = tmpDir('codeweb-rel-');
  try {
    writeTree(root, {
      'package.json': JSON.stringify({ version: '0.3.0', description: 'x' }),
      '.claude-plugin/plugin.json': JSON.stringify({ version: '0.3.0', description: 'x' }, null, 2),
      'skills/codebase-anatomy/SKILL.md': '---\nname: x\nmetadata:\n  version: 0.3.0\n---\nbody\n',
      'scripts/mcp-server.mjs': "const TOOLS=[{ name: 'codeweb_a' }];\n",
      'site/data/product.json': JSON.stringify({ toolPhases: [{ tools: [{}] }] }),
      'CHANGELOG.md': '## [0.3.0] - 2026-01-01\n### Added\n- x\n',
      'README.md': 'sponsoring funds the benchmarks\n',
    });
    const r = checkConsistency(root);
    assert.ok(r.problems.some((p) => /README\.md/.test(p) && /C7/.test(p) && /cost premise/.test(p)),
      `missing the widened C7 problem: ${r.problems.join('; ') || '(none)'}`);

    writeTree(root, { 'README.md': 'sponsoring supports the project, and sponsors get seen\n' });
    const clean = checkConsistency(root);
    assert.ok(!clean.problems.some((p) => /C7/.test(p)), 'the ratified wording passes everywhere');
  } finally { cleanup(root); }
});

// D6's structural cause, closed the rest of the way: a numeric public claim hardcoded in any
// script's string literal (outside product-copy.mjs) fails the gate — claim strings live where
// the gate looks.
test('checkConsistency fails a numeric claim literal in a script outside product-copy.mjs', () => {
  const root = tmpDir('codeweb-rel-');
  try {
    writeTree(root, {
      'package.json': JSON.stringify({ version: '0.3.0', description: 'x' }),
      '.claude-plugin/plugin.json': JSON.stringify({ version: '0.3.0', description: 'x' }, null, 2),
      'skills/codebase-anatomy/SKILL.md': '---\nname: x\nmetadata:\n  version: 0.3.0\n---\nbody\n',
      'scripts/mcp-server.mjs': "const TOOLS=[{ name: 'codeweb_a' }];\n",
      'site/data/product.json': JSON.stringify({ toolPhases: [{ tools: [{}] }] }),
      'CHANGELOG.md': '## [0.3.0] - 2026-01-01\n### Added\n- x\n',
      'scripts/stats-banner.mjs': "console.log('found 74% of real callers vs grep');\n",
    });
    const r = checkConsistency(root);
    assert.ok(r.problems.some((p) => /stats-banner\.mjs/.test(p) && /numeric claim/.test(p) && /D6/.test(p)),
      `missing the numeric-claim problem: ${r.problems.join('; ') || '(none)'}`);

    writeTree(root, { 'scripts/stats-banner.mjs': "console.log('map built');\n" });
    const clean = checkConsistency(root);
    assert.ok(!clean.problems.some((p) => /numeric claim/.test(p)), 'plain output passes');
  } finally { cleanup(root); }
});

// D1: the manifest discipline the gate enforces — no tool declared twice across the manifest and
// the server (the triplication class behind the recorded parity fixes), and no prose surface
// naming a tool that doesn't ship (the docs-lying class, 5c5d417 / the 0-of-13 anti-pair).
test('checkConsistency enforces the D1 manifest discipline (restatement + phantom docs)', () => {
  const root = tmpDir('codeweb-rel-');
  try {
    writeTree(root, {
      'package.json': JSON.stringify({ version: '0.3.0', description: 'x' }),
      '.claude-plugin/plugin.json': JSON.stringify({ version: '0.3.0', description: 'x' }, null, 2),
      'skills/codebase-anatomy/SKILL.md': '---\nname: x\nmetadata:\n  version: 0.3.0\n---\nbody\n',
      'scripts/mcp-server.mjs': "const TOOLS=[{ name: 'codeweb_a' },{ name: 'codeweb_b' }];\n",
      'scripts/lib/tool-specs.mjs': "export const QUERY_TOOL_SPECS=[{ name: 'codeweb_b' }];\n",
      'site/data/product.json': JSON.stringify({ toolPhases: [{ tools: [{}, {}] }] }),
      'CHANGELOG.md': '## [0.3.0] - 2026-01-01\n### Added\n- x\n',
      'README.md': 'query with codeweb_a, or try codeweb_ghost for glory\n',
    });
    const r = checkConsistency(root);
    assert.ok(r.problems.some((p) => /codeweb_b is declared in BOTH/.test(p)),
      `missing the restatement problem: ${r.problems.join('; ') || '(none)'}`);
    assert.ok(r.problems.some((p) => /codeweb_ghost/.test(p) && /not a shipped tool/.test(p)),
      `missing the phantom problem: ${r.problems.join('; ') || '(none)'}`);
    assert.ok(!r.problems.some((p) => /codeweb_a/.test(p)), 'a shipped name in prose is fine');
  } finally { cleanup(root); }
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

// The elevator drift: site/data/product.json's prose said "24 deterministic MCP query tools" a
// full release after 27 shipped — data-file prose that feeds site templates, unscanned by both
// PROSE_FILES (content files only) and the structured product.json checks. checkConsistency now
// walks every string value in the file; the live-file case is covered by the aligned-repo test
// above. This pins the exact phrase that slipped.
test('checkConsistency scans site/data/product.json prose — the stale-elevator class', () => {
  const stale = scanProseCounts(
    'answers those questions exactly, for about a kilobyte each: 24 deterministic MCP query tools for your coding agent',
    'site/data/product.json (prose)', { toolCount: 27, langCount: 11 },
  );
  assert.equal(stale.length, 1);
  assert.match(stale[0], /24 deterministic MCP query tools/);
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

// PROOF F2 / CRO C2: the two phrasings that shipped a whole release stale because the scanner
// missed them — "(N total)" after an MCP-tools mention, and a bare "<Word> languages" heading.
test('scanProseCounts catches the "(N total)" and bare "N languages" phrasings that slipped v0.9.0', async () => {
  const { scanProseCounts } = await import('../scripts/release-utils.mjs');
  const facts = { toolCount: 27, langCount: 11 };
  assert.equal(scanProseCounts('and 5 new MCP tools (20 total) shipped', 'f', facts).length, 1,
    'a stale parenthetical total after an MCP-tools mention is flagged');
  assert.equal(scanProseCounts('and 2 new MCP tools (27 total) shipped', 'f', facts).length, 0,
    'a correct parenthetical total passes');
  assert.equal(scanProseCounts('<h2>Five languages, parse-free</h2>', 'f', facts).length, 1,
    'a bare stale language count is flagged even without native/first-class');
  assert.equal(scanProseCounts('<h2>Eleven languages, parse-free</h2>', 'f', facts).length, 0,
    'the correct bare count passes');
  assert.equal(scanProseCounts('parity across the original five languages is validated', 'f', facts).length, 0,
    'historical counts marked "original" are exempt');
  assert.equal(scanProseCounts('supports 40+ languages via LSP', 'f', facts).length, 0,
    'open-ended "+" counts about other tools pass');
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

// The v0.10.0 release page credited a stranger: GitHub renders bare "@14" as a mention of the
// user LOGIN "14", and release notes list mentioned users as contributors — our benchmark
// notation "@14,964 nodes" name-dropped github.com/14. Notes come straight from CHANGELOG.md,
// so the ban lives at the source. Code spans are exempt (`pkg@1.2.3` never autolinks).
test('CHANGELOG never @-mentions a number — bare @digit is banned outside code spans', () => {
  const changelog = readFileSync(join(PLUGIN_ROOT, 'CHANGELOG.md'), 'utf8');
  const bad = [];
  changelog.split('\n').forEach((line, i) => {
    const plain = line.split(/(`[^`]*`)/).filter((p) => !p.startsWith('`')).join('');
    for (const m of plain.match(/@\d[\w,.]*/g) || []) bad.push(`line ${i + 1}: ${m}`);
  });
  assert.deepEqual(bad, [], `write "at 14,964", never "@14,964" — GitHub reads it as a user mention: ${bad.join('; ')}`);
});

test('the release workflow re-syncs notes for an existing release instead of skipping', () => {
  const wf = readFileSync(join(PLUGIN_ROOT, '.github', 'workflows', 'release.yml'), 'utf8');
  assert.match(wf, /gh release edit .*--notes-file/, 're-dispatch is the only path that can repair published notes');
  assert.match(wf, /npm view "\$\{PKG\}@\$\{VERSION\}"/, 'the npm step skips an already-published version, so a notes-repair re-dispatch stays green');
});
