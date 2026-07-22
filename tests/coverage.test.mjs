// #13 (IMPROVEMENTS.md; ROADMAP Phase 4 "coverage→symbol mapping"): measured-execution ingest.
// A coverage report (lcov / c8 JSON) annotates graph symbols with covered/hits facts; explain,
// tests, and context answers surface them; refresh drops them honestly. Absent input = graphs
// untouched (the annotation is an explicit, optional step — same contract as --churn).

import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { runNode, script, tmpDir, cleanup, writeTree, readJSON } from './helpers.mjs';
import { parseLcov, parseIstanbul, annotateCoverage, coverageNote } from '../scripts/lib/coverage.mjs';

const GRAPH = () => ({
  meta: { target: 'covfix', root: '/repo' },
  domains: [], overlaps: [],
  nodes: [
    { id: 'src/a.js:hot', label: 'hot', kind: 'function', file: 'src/a.js', line: 1, loc: 3, domain: 'd' },
    { id: 'src/a.js:cold', label: 'cold', kind: 'function', file: 'src/a.js', line: 5, loc: 3, domain: 'd' },
    { id: 'src/b.js:unknown', label: 'unknown', kind: 'function', file: 'src/b.js', line: 1, loc: 2, domain: 'd' },
  ],
  edges: [],
});

const LCOV = [
  'TN:', 'SF:/repo/src/a.js',
  'DA:1,7', 'DA:2,7', 'DA:3,7', // hot: executed
  'DA:5,0', 'DA:6,0', 'DA:7,0', // cold: instrumented, never run
  'end_of_record',
].join('\n');

test('C1 lcov parses and annotates: executed -> covered+hits, instrumented-but-idle -> covered:false, unseen file untouched', () => {
  const g = GRAPH();
  const summary = annotateCoverage(g, parseLcov(LCOV), 'lcov.info');
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  assert.equal(byId.get('src/a.js:hot').covered, true);
  assert.equal(byId.get('src/a.js:hot').hits, 7);
  assert.equal(byId.get('src/a.js:cold').covered, false);
  assert.equal('covered' in byId.get('src/b.js:unknown'), false, 'unknown stays unknown (never false)');
  assert.deepEqual(summary, { symbolsSeen: 2, symbolsCovered: 1, filesMapped: 1 });
  assert.equal(g.meta.coverage.source, 'lcov.info');
  assert.match(coverageNote(g, byId.get('src/a.js:cold')), /NOT covered/);
  assert.match(coverageNote(g, byId.get('src/b.js:unknown')), /not in the recorded/);
});

test('C2 istanbul/c8 JSON parses to the same shape', () => {
  const g = GRAPH();
  const ist = { '/repo/src/a.js': { statementMap: { 0: { start: { line: 1 }, end: { line: 3 } }, 1: { start: { line: 5 }, end: { line: 7 } } }, s: { 0: 4, 1: 0 } } };
  annotateCoverage(g, parseIstanbul(ist), 'coverage-final.json');
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  assert.equal(byId.get('src/a.js:hot').covered, true);
  assert.equal(byId.get('src/a.js:cold').covered, false);
});

test('C3 the CLI annotates a graph on disk and explain/tests/context surface the facts', () => {
  const dir = tmpDir('codeweb-cov-');
  try {
    const gp = join(dir, 'graph.json');
    const g = GRAPH();
    g.edges.push({ from: 'tests/a.test.js:t1', to: 'src/a.js:cold', kind: 'test' });
    g.nodes.push({ id: 'tests/a.test.js:t1', label: 't1', kind: 'function', file: 'tests/a.test.js', line: 1, loc: 2, domain: 'd' });
    writeFileSync(gp, JSON.stringify(g));
    const lp = join(dir, 'lcov.info');
    writeFileSync(lp, LCOV);
    const r = runNode(script('coverage.mjs'), [gp, lp]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /1\/2 instrumented symbol\(s\) covered/);

    // finding #42: the annotated graph is written COMPACT (was the last pretty-printed graph.json)
    const raw = readFileSync(gp, 'utf8');
    assert.equal(raw, JSON.stringify(JSON.parse(raw)), 'annotated graph.json parses and is compact (no pretty-print)');

    const ex = runNode(script('explain.mjs'), [gp, 'src/a.js:cold', '--json']);
    const card = JSON.parse(ex.stdout).cards?.[0] ?? JSON.parse(ex.stdout)[0] ?? JSON.parse(ex.stdout);
    assert.match(JSON.stringify(card), /NOT covered by the recorded/, 'explain warns on the uncovered symbol');

    const tq = runNode(script('query.mjs'), [gp, '--tests', 'src/a.js:cold', '--json']);
    const tp = JSON.parse(tq.stdout);
    assert.ok(Array.isArray(tp.coverage), 'tests answer carries measured-coverage notes');
    assert.match(tp.summary, /NOT covered by the recorded run/);

    const cp = runNode(script('context-pack.mjs'), [gp, 'src/a.js:cold', '--json']);
    assert.match(JSON.parse(cp.stdout).summary, /NOT covered by the recorded test run/, 'context warns before an unguarded edit');
  } finally { cleanup(dir); }
});

test('C4 refresh drops stale coverage annotations and says how to restore them', () => {
  const dir = tmpDir('codeweb-cov-');
  try {
    writeTree(dir, { 'src/a.js': 'export function hot() {\n  return 1;\n}\nexport function cold() {\n  return 2;\n}\n' });
    const gp = join(dir, '.codeweb', 'graph.json');
    const ex = runNode(script('extract-symbols.mjs'), [join(dir, 'src')]);
    assert.equal(ex.status, 0, ex.stderr);
    const g = JSON.parse(ex.stdout);
    g.domains = []; g.overlaps = [];
    writeTree(dir, { '.codeweb/keep': '' });
    g.meta.coverage = { source: 'lcov.info', filesMapped: 1, symbolsSeen: 2, symbolsCovered: 1 };
    writeFileSync(gp, JSON.stringify(g));
    const r = runNode(script('refresh.mjs'), [gp, '--json']);
    assert.equal(r.status, 0, r.stderr);
    const p = JSON.parse(r.stdout);
    assert.match(p.note, /coverage annotations dropped/, 'refresh says what happened');
    assert.equal(readJSON(gp).meta.coverage, undefined, 'stale coverage removed from the graph');
  } finally { cleanup(dir); }
});

test('C5 dogfood: Node\'s own lcov reporter output annotates a real codeweb graph', () => {
  const dir = tmpDir('codeweb-cov-dog-');
  try {
    // a tiny real project + a real node:test run with the built-in lcov reporter
    writeTree(dir, {
      'src/calc.mjs': 'export function add(a, b) {\n  return a + b;\n}\nexport function neverRun(a) {\n  return a * 2;\n}\n',
      'test/calc.test.mjs': "import test from 'node:test';\nimport assert from 'node:assert';\nimport { add } from '../src/calc.mjs';\ntest('adds', () => { assert.equal(add(2, 3), 5); });\n",
    });
    // run the test with coverage from INSIDE the fixture so paths resolve; strip the parent
    // test-runner's context vars or the nested `node --test` speaks the child protocol instead
    const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^NODE_TEST|^NODE_OPTIONS$/.test(k)));
    const run = spawnSync(process.execPath, ['--test', '--experimental-test-coverage', '--test-reporter=lcov', 'test/calc.test.mjs'], { cwd: dir, encoding: 'utf8', env: cleanEnv });
    assert.equal(run.status, 0, run.stderr);
    writeFileSync(join(dir, 'lcov.info'), run.stdout);
    const ex = runNode(script('extract-symbols.mjs'), [dir, '--out', join(dir, 'f.json')]);
    assert.equal(ex.status, 0, ex.stderr);
    const g = readJSON(join(dir, 'f.json'));
    g.domains = []; g.overlaps = [];
    const gp = join(dir, 'graph.json');
    writeFileSync(gp, JSON.stringify(g));
    const r = runNode(script('coverage.mjs'), [gp, join(dir, 'lcov.info'), '--json']);
    assert.equal(r.status, 0, r.stderr);
    const annotated = readJSON(gp);
    const byId = new Map(annotated.nodes.map((n) => [n.id, n]));
    assert.equal(byId.get('src/calc.mjs:add')?.covered, true, `add() measured covered: ${JSON.stringify(annotated.nodes.filter((n) => n.file === 'src/calc.mjs'))}`);
    assert.equal(byId.get('src/calc.mjs:neverRun')?.covered, false, 'neverRun() measured uncovered');
  } finally { cleanup(dir); }
});
