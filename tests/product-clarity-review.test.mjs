import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { boundedReviewEvidence } from '../scripts/lib/change-review.mjs';
import { runNode, script, tmpDir, writeTree, cleanup, fixtureGitIdentity } from './helpers.mjs';

const REVIEW = script('review.mjs');
function fixture() {
  const dir = tmpDir('cw-change-review-');
  const root = join(dir, 'src');
  writeTree(root, { 'a.js': 'export function alpha() { return 1; }\n', 'b.js': 'export function beta() { return alpha(); }\n' });
  const sources = Object.fromEntries(['a.js', 'b.js'].map(file => { const st = statSync(join(root, file)); return [file, { s: st.size, m: Math.round(st.mtimeMs) }]; }));
  const graph = { meta: { root, target: 'fixture', engine: 'fixture extractor', sources, dirs: { '.': Math.round(statSync(root).mtimeMs) } }, nodes: ['a', 'b'].map((name, i) => ({ id: `${name}.js:${i ? 'beta' : 'alpha'}`, label: i ? 'beta' : 'alpha', file: `${name}.js`, line: 1, loc: 1, kind: 'function', exports: true })), edges: [{ from: 'b.js:beta', to: 'a.js:alpha', kind: 'call' }], overlaps: [], domains: [] };
  const save = (g = graph, before = graph) => writeTree(dir, { 'graph.json': JSON.stringify(g), 'before.json': JSON.stringify(before) });
  save();
  const args = [join(dir, 'graph.json'), '--changed', 'a.js', '--before', join(dir, 'before.json'), '--json'];
  return { dir, root, graph, save, args };
}

test('ac_16: change review preserves impact, reports measured coverage and complete checked scope', () => {
  const f = fixture();
  try {
    f.graph.meta.coverage = { source: '/private/coverage/coverage.json', symbolsSeen: 1, symbolsCovered: 1 };
    f.graph.nodes[0].covered = true; f.graph.nodes[0].hits = 3; f.save();
    const r = runNode(REVIEW, f.args); assert.equal(r.status, 0, r.stderr);
    const p = JSON.parse(r.stdout);
    assert.deepEqual(p.changedSymbols, ['a.js:alpha']);
    assert.deepEqual(p.blastRadius.ids, ['b.js:beta']);
    assert.equal(p.verdict.ok, true); assert.equal(p.analysis.status, 'complete');
    assert.deepEqual(p.review.affectedCallers.map(n => n.id), ['b.js:beta']);
    assert.equal(p.review.changed[0].coverage.status, 'covered');
    assert.equal(p.review.affectedCallers[0].coverage.status, 'unknown');
    assert.match(p.analysis.scope, /structural/);
  } finally { cleanup(f.dir); }
});

test('ac_16: unknown inputs stay incomplete and source changes are stale', () => {
  const f = fixture();
  try {
    let p = JSON.parse(runNode(REVIEW, f.args.filter((_, i) => ![3, 4].includes(i))).stdout);
    assert.equal(p.analysis.status, 'incomplete'); assert.match(p.analysis.reasons.join(' '), /baseline/i);
    for (const alter of [g => { delete g.meta.sources; }, g => { g.meta.root = join(f.dir, 'missing'); }, g => { g.meta.dynamic = { files: 1, sample: ['a.js'] }; }]) {
      const g = structuredClone(f.graph); alter(g); f.save(g);
      p = JSON.parse(runNode(REVIEW, f.args).stdout); assert.equal(p.analysis.status, 'incomplete');
    }
    f.save();
    p = JSON.parse(runNode(REVIEW, [f.args[0], '--changed', 'missing.js', '--before', f.args[4], '--json']).stdout);
    assert.equal(p.analysis.status, 'incomplete'); assert.match(p.analysis.reasons.join(' '), /mapped symbol/i);
    writeTree(f.root, { 'a.js': 'export function alpha() { return 22222; }\n' });
    p = JSON.parse(runNode(REVIEW, f.args).stdout); assert.equal(p.analysis.status, 'stale');
    assert.equal(p.verdict.ok, true, 'uncertainty does not change existing gate policy');
  } finally { cleanup(f.dir); }
});

test('ac_16: empty or partial baseline stamps and empty directory stamps cannot label analysis complete', () => {
  const f = fixture();
  try {
    for (const stamps of [{}, { 'a.js': f.graph.meta.sources['a.js'] }, { 'a.js': {}, 'b.js': {} }]) {
      const baseline = structuredClone(f.graph); baseline.meta.sources = stamps; f.save(f.graph, baseline);
      const p = JSON.parse(runNode(REVIEW, f.args).stdout);
      assert.equal(p.analysis.status, 'incomplete'); assert.match(p.analysis.reasons.join(' '), /Baseline source stamps/);
    }
    const g = structuredClone(f.graph); g.meta.dirs = {}; f.save(g);
    const p = JSON.parse(runNode(REVIEW, f.args).stdout);
    assert.equal(p.analysis.status, 'incomplete'); assert.equal(p.analysis.freshness.status, 'unknown');
  } finally { cleanup(f.dir); }
});

test('ac_16: malformed baseline and failed HTML writes are errors', () => {
  const f = fixture();
  try {
    for (const text of ['{bad', '{}', '{"nodes":"bad","edges":[]}', '{"nodes":[null],"edges":[]}']) {
      writeTree(f.dir, { 'before.json': text });
      assert.equal(runNode(REVIEW, f.args).status, 2);
    }
    f.save();
    assert.equal(runNode(REVIEW, [...f.args, '--html', join(f.dir, 'missing', 'review.html')]).status, 2);
  } finally { cleanup(f.dir); }
});

test('ac_16: portable HTML escapes hostile source labels and has no private root or script', () => {
  const f = fixture();
  try {
    f.graph.nodes[0].label = '<img src=x onerror=alert(1)>';
    f.graph.meta.coverage = { source: '/private/coverage/coverage.json' }; f.save();
    const htmlPath = join(f.dir, 'review.html');
    const r = runNode(REVIEW, [...f.args, '--html', htmlPath]); assert.equal(r.status, 0, r.stderr);
    const html = readFileSync(htmlPath, 'utf8');
    for (const heading of ['Changed symbols', 'Affected callers', 'Structural findings', 'Analysis limits', 'Source provenance']) assert.ok(html.includes(heading));
    assert.ok(html.includes('&lt;img')); assert.ok(!html.includes('<img')); assert.ok(!html.includes('<script'));
    assert.ok(!html.includes(f.dir)); assert.ok(!html.includes('/private/coverage'));
    assert.ok(html.includes('viewport')); assert.ok(html.includes('#C6F24E'));
  } finally { cleanup(f.dir); }
});

test('ac_16: git range uses mapped root from another cwd and retains deleted symbols and callers', () => {
  const f = fixture();
  try {
    const git = (...args) => { const r = spawnSync('git', args, { cwd: f.dir, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
    const identity = fixtureGitIdentity(); git('init'); git('config', 'user.name', identity.name); git('config', 'user.email', identity.email);
    git('add', 'src'); git('commit', '-m', 'fixture baseline');
    rmSync(join(f.root, 'a.js'));
    const after = structuredClone(f.graph); after.nodes = after.nodes.slice(1); after.edges = [];
    delete after.meta.sources['a.js']; after.meta.dirs['.'] = Math.round(statSync(f.root).mtimeMs); f.save(after, f.graph);
    const r = runNode(REVIEW, [f.args[0], '--range', 'HEAD', '--before', f.args[4], '--json']);
    assert.equal(r.status, 0, r.stderr); const p = JSON.parse(r.stdout);
    assert.deepEqual(p.filesChanged, ['a.js']);
    assert.deepEqual(p.review.removed.map(n => n.id), ['a.js:alpha']);
    assert.deepEqual(p.review.baselineAffectedCallers.map(n => n.id), ['b.js:beta']);
    assert.equal(p.analysis.status, 'incomplete');
  } finally { cleanup(f.dir); }
});

test('ac_16: range includes binary and empty files, preserves quoted paths, and excludes files outside mapped root', () => {
  const f = fixture();
  try {
    const oddFile = process.platform === 'win32' ? 'strange café & name.js' : 'strange café "& name.js';
    writeTree(f.root, { [oddFile]: 'export function odd() { return 1; }\n', 'empty.js': '', 'binary.bin': '\0before' });
    writeTree(f.dir, { 'outside.js': 'before\n' });
    const git = (...args) => { const r = spawnSync('git', args, { cwd: f.dir, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
    const identity = fixtureGitIdentity(); git('init'); git('config', 'user.name', identity.name); git('config', 'user.email', identity.email);
    git('add', 'src', 'outside.js'); git('commit', '-m', 'fixture');
    writeTree(f.root, { [oddFile]: 'export function odd() { return 200; }\n', 'binary.bin': '\0after' });
    writeTree(f.dir, { 'outside.js': 'after\n' }); rmSync(join(f.root, 'empty.js'));
    const r = runNode(REVIEW, [f.args[0], '--range', 'HEAD', '--before', f.args[4], '--json']);
    assert.equal(r.status, 0, r.stderr); const p = JSON.parse(r.stdout);
    assert.deepEqual(p.filesChanged, ['binary.bin', 'empty.js', oddFile]);
    assert.notEqual(p.analysis.status, 'complete');
  } finally { cleanup(f.dir); }
});

test('ac_16: new JSON detail and diagnostic lists stay bounded at scale with exact totals', () => {
  const f = fixture();
  try {
    const callers = Array.from({ length: 2000 }, (_, i) => ({ id: `caller-${i}.js:caller`, label: `caller-${i}`, file: `caller-${i}.js`, line: 1, loc: 1, kind: 'function' }));
    f.graph.nodes.push(...callers);
    f.graph.edges.push(...callers.map(n => ({ from: n.id, to: 'a.js:alpha', kind: 'call' })));
    f.save();
    const report = join(f.dir, 'review.html');
    const r = runNode(REVIEW, [...f.args, '--html', report]); assert.equal(r.status, 0, r.stderr);
    const p = JSON.parse(r.stdout);
    assert.equal(p.blastRadius.count, 2001); assert.equal(p.blastRadius.ids.length, 2001, 'legacy fields remain complete');
    assert.ok(p.review.affectedCallers.length <= 12);
    assert.equal(p.review.totals.affectedCallers, 2001);
    assert.equal(p.review.omitted.affectedCallers, 2001 - p.review.affectedCallers.length);
    assert.equal(p.review.totals.baselineAffectedCallers, 2001);
    assert.ok(p.analysis.unavailableFiles.length <= 12);
    assert.equal(p.analysis.totals.unavailableFiles, 2000);
    assert.equal(p.analysis.omitted.unavailableFiles, 2000 - p.analysis.unavailableFiles.length);
    assert.ok(JSON.stringify({ analysis: p.analysis, review: p.review }).length < 15000);
    assert.ok(readFileSync(report, 'utf8').includes('caller-1999'), 'HTML keeps all internal details');
  } finally { cleanup(f.dir); }
});


test('ac_16: every new list has a byte budget and reports omitted oversized rows', () => {
  const long = '界'.repeat(2000);
  const evidence = {
    analysis: { unavailableFiles: [long, 'a.js'], unmappedFiles: Array(100).fill('a.js') },
    review: { changed: [{ id: long }], affectedCallers: [{ id: 'a' }, { id: long }], removed: Array(100).fill({ id: 'gone' }), baselineAffectedCallers: Array(100).fill({ id: 'caller' }) },
  };
  const bounded = boundedReviewEvidence(evidence);
  for (const [section, fields] of [['analysis', ['unavailableFiles', 'unmappedFiles']], ['review', ['changed', 'affectedCallers', 'removed', 'baselineAffectedCallers']]]) {
    for (const field of fields) {
      assert.ok(bounded[section][field].length <= 12);
      assert.ok(Buffer.byteLength(JSON.stringify(bounded[section][field]), 'utf8') <= 4096);
      assert.equal(bounded[section].totals[field], evidence[section][field].length);
      assert.equal(bounded[section].omitted[field], evidence[section][field].length - bounded[section][field].length);
    }
  }
  assert.equal(evidence.review.removed.length, 100, 'full internal evidence is not mutated');
});


test('ac_16: git range maps deleted files through a directory alias', () => {
  const f = fixture();
  try {
    const git = (...args) => { const r = spawnSync('git', args, { cwd: f.dir, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
    const identity = fixtureGitIdentity(); git('init'); git('config', 'user.name', identity.name); git('config', 'user.email', identity.email);
    git('add', 'src'); git('commit', '-m', 'fixture alias baseline');
    const alias = join(f.dir, 'mapped-alias');
    symlinkSync(f.root, alias, 'junction');
    rmSync(join(f.root, 'a.js'));
    const after = structuredClone(f.graph); after.meta.root = alias; after.nodes = after.nodes.slice(1); after.edges = [];
    delete after.meta.sources['a.js']; after.meta.dirs['.'] = Math.round(statSync(f.root).mtimeMs); f.save(after, f.graph);
    const r = runNode(REVIEW, [f.args[0], '--range', 'HEAD', '--before', f.args[4], '--json']);
    assert.equal(r.status, 0, r.stderr); const p = JSON.parse(r.stdout);
    assert.deepEqual(p.filesChanged, ['a.js']);
    assert.deepEqual(p.review.removed.map(n => n.id), ['a.js:alpha']);
    assert.deepEqual(p.review.baselineAffectedCallers.map(n => n.id), ['b.js:beta']);
  } finally { cleanup(f.dir); }
});
