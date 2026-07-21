import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, script, tmpDir, cleanup, readJSON, PLUGIN_ROOT as PLUGIN_ROOT2 } from './helpers.mjs';

// The shipped report.html is self-contained and shareable (a teammate, a blog post, GitHub Pages),
// so it must never embed the absolute LOCAL source path. meta.root is a private disk pointer the
// query tools use to read bodies; graph.json on disk keeps it, but the report must not leak it.
// The template renders meta.target for the human-facing label, never meta.root.
test('build-report does not embed the absolute local path (meta.root) in report.html', () => {
  const dir = tmpDir('codeweb-report-');
  try {
    const SENTINEL = '/Users/secret-person/private-clients/acme-internal/src';
    const graph = {
      meta: {
        root: SENTINEL,
        target: 'acme',
        mode: 'internal',
        engine: 'regex',
        languages: ['javascript'],
        symbols: 1,
      },
      nodes: [{ id: 'a.js:foo', label: 'foo', kind: 'function', file: 'a.js', line: 1, loc: 3, domain: 'core' }],
      edges: [],
      domains: [{ name: 'core', nodes: 1, summary: '' }],
      overlaps: [],
    };
    const graphPath = join(dir, 'graph.json');
    writeFileSync(graphPath, JSON.stringify(graph));

    const r = runNode(script('build-report.mjs'), [graphPath, '--no-md']);
    assert.equal(r.status, 0, r.stderr);

    const html = readFileSync(join(dir, 'report.html'), 'utf8');
    // The leak under test: the shipped HTML must not contain the absolute source path.
    assert.ok(!html.includes(SENTINEL), 'report.html must not embed the absolute meta.root path');
    // ...but the report must still be labeled by its friendly target.
    assert.ok(html.includes('acme'), 'report.html should still carry meta.target for display');

    // The on-disk graph.json stays the tools' pointer to source — meta.root preserved.
    const disk = readJSON(graphPath);
    assert.equal(disk.meta.root, SENTINEL, 'graph.json on disk must preserve meta.root for the query tools');
  } finally {
    cleanup(dir);
  }
});

// Perf-quality finding 5 — byte-determinism. generatedAt was the sole difference between two
// identical runs, and the embed carried per-file mtime stamps the template never reads (so the
// "shareable" artifact differed across fresh checkouts of the same code). Two runs with
// SOURCE_DATE_EPOCH pinned must now be byte-identical in BOTH artifacts, and report.html must be
// byte-identical even without pinning; the embed carries none of generatedAt/sources/dirs while
// graph.json keeps all three (brief reads generatedAt, the staleness check reads sources/dirs).
test('two identical runs produce byte-identical report.html and (with SOURCE_DATE_EPOCH) graph.json', () => {
  const dir = tmpDir('codeweb-det-');
  try {
    const graph = {
      meta: {
        root: dir, target: 'det-x', engine: 'regex', languages: ['javascript'], symbols: 1,
        sources: { 'a.js': { s: 10, m: 123456789, h: 'f'.repeat(40) } },
        dirs: { '.': 123456789 },
      },
      nodes: [{ id: 'a.js:foo', label: 'foo', kind: 'function', file: 'a.js', line: 1, loc: 3, domain: 'core' }],
      edges: [],
      domains: [{ name: 'core', nodes: 1, summary: '' }],
      overlaps: [],
    };
    const graphPath = join(dir, 'graph.json');
    const env = { SOURCE_DATE_EPOCH: '1753056000' };
    writeFileSync(graphPath, JSON.stringify(graph));
    assert.equal(runNode(script('build-report.mjs'), [graphPath, '--no-md'], { env }).status, 0);
    const html1 = readFileSync(join(dir, 'report.html'), 'utf8');
    const graph1 = readFileSync(graphPath, 'utf8');
    writeFileSync(graphPath, JSON.stringify(graph)); // reset to the identical input
    assert.equal(runNode(script('build-report.mjs'), [graphPath, '--no-md'], { env }).status, 0);
    assert.equal(readFileSync(join(dir, 'report.html'), 'utf8'), html1, 'report.html byte-identical');
    assert.equal(readFileSync(graphPath, 'utf8'), graph1, 'graph.json byte-identical under SOURCE_DATE_EPOCH');
    assert.equal(readJSON(graphPath).meta.generatedAt, '2025-07-21T00:00:00.000Z', 'generatedAt pinned by SOURCE_DATE_EPOCH');
    // the embed strips the nondeterministic/private fields; graph.json keeps them
    assert.ok(!html1.includes('generatedAt') && !html1.includes('123456789'), 'no timestamp/stamp bytes in the embed');
    const disk = readJSON(graphPath);
    assert.ok(disk.meta.sources && disk.meta.dirs && disk.meta.generatedAt, 'graph.json keeps stamps + generatedAt');
    // and WITHOUT the epoch pin, report.html is still byte-identical (only graph.json's timestamp moves)
    writeFileSync(graphPath, JSON.stringify(graph));
    assert.equal(runNode(script('build-report.mjs'), [graphPath, '--no-md']).status, 0);
    assert.equal(readFileSync(join(dir, 'report.html'), 'utf8'), html1, 'report.html byte-identical without pinning too');
  } finally {
    cleanup(dir);
  }
});

// #8 (IMPROVEMENTS.md): the report renders the PIPELINE's findings (G.overlaps), carries share
// metadata (og:*), and ships the whole-view hash machinery — while the privacy invariant holds
// (only the target LABEL and counts are embedded, never meta.root).
test('report carries og metadata, the pipeline-findings renderer, and the shareable-hash machinery', () => {
  const dir = tmpDir('codeweb-report-');
  try {
    const graph = {
      meta: { target: 'acme/web', root: '/Users/secret-person/acme/src' },
      domains: [], edges: [],
      nodes: [
        { id: 'a.js:x', label: 'x', kind: 'function', file: 'a.js', line: 1, loc: 2, domain: 'd' },
        { id: 'b.js:y', label: 'y', kind: 'function', file: 'b.js', line: 1, loc: 2, domain: 'd' },
      ],
      overlaps: [
        { kind: 'duplicate-logic', confidence: 'high', drifted: false, bodySim: 0.93, severity: 'high', title: 'x duplicated across a and b', domains: ['d'], nodes: ['a.js:x', 'b.js:y'], evidence: 'ev', recommendation: 'merge into a.js:x' },
        { kind: 'duplicate-logic', confidence: 'refuted', title: 'same name, different logic', domains: ['d'], nodes: [] },
      ],
    };
    const graphPath = join(dir, 'graph.json');
    writeFileSync(graphPath, JSON.stringify(graph));
    const r = runNode(script('build-report.mjs'), [graphPath, '--no-md']);
    assert.equal(r.status, 0, r.stderr);
    const html = readFileSync(join(dir, 'report.html'), 'utf8');
    assert.match(html, /<meta property="og:title" content="codeweb — acme\/web map">/, 'og:title from the target label');
    assert.match(html, /<meta property="og:description" content="2 symbols · 0 edges/, 'og:description from counts');
    assert.ok(!html.includes('secret-person'), 'meta.root never reaches the shipped HTML (privacy invariant)');
    assert.ok(html.includes('Consolidation findings'), 'pipeline findings section exists');
    assert.ok(html.includes('showOverlap'), 'pipeline finding detail view wired');
    assert.ok(html.includes('x duplicated across a and b'), 'the finding itself is embedded via graph data');
    for (const marker of ['parseHash', 'writeHash', 'copyLink', "roles === 'all'"]) {
      assert.ok(html.includes(marker), `hash/share machinery present: ${marker}`);
    }
  } finally { cleanup(dir); }
});

// #9 (IMPROVEMENTS.md): inclusivity + polish — light/print themes, keyboard parity, scoped
// live region, defined tokens only, no blocking prompt for the editor root.
test('report ships light+print themes, focus-visible parity, ARIA tab wiring, and no blocking prompt', () => {
  const html = readFileSync(join(PLUGIN_ROOT2, 'scripts', 'report-template.html'), 'utf8');
  assert.ok(html.includes('prefers-color-scheme: light'), 'OS light preference honored');
  assert.ok(html.includes('[data-theme="light"]'), 'explicit light theme exists');
  assert.ok(html.includes('id="themeToggle"'), 'theme toggle in the header');
  assert.ok(html.includes('@media print'), 'print stylesheet exists');
  assert.ok(html.includes(':focus-visible'), 'keyboard focus styles exist');
  assert.ok(html.includes('role="tabpanel"'), 'panels carry tabpanel roles');
  assert.ok(html.includes('aria-controls="view-findings"'), 'tabs point at their panels');
  assert.ok(!html.includes('var(--hi)'), 'no undefined CSS tokens');
  assert.ok(!html.includes('var v = prompt('), 'editor root uses the inline form, not prompt()');
  assert.ok(html.includes('id="live"'), 'dedicated live region replaces whole-panel aria-live');
  assert.ok(!/id="detail" aria-live/.test(html), 'detail panel no longer over-announces');
});
