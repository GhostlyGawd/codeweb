// #5 (IMPROVEMENTS.md): the CLI front door — --help everywhere, unknown flags rejected with
// usage, graph auto-discovery from the nearest .codeweb above cwd, the documented 0/1/2 exit
// convention on the first-touch scripts, and a success line that points at the report.

import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import { runNode, script, tmpDir, cleanup, writeTree } from './helpers.mjs';

test('F1 run.mjs --help prints usage and exits 0 (it used to error "target not found: --help")', () => {
  const r = runNode(script('run.mjs'), ['--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /usage: run\.mjs/);
  assert.match(r.stdout, /--allow-empty/, 'documents the flags it parses');
  assert.match(r.stdout, /--open/);
});

test('F2 run.mjs rejects an unknown flag with usage, exit 2', () => {
  const r = runNode(script('run.mjs'), ['--no-such-flag']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown flag: --no-such-flag/);
  assert.match(r.stderr, /usage: run\.mjs/);
});

test('F3 run.mjs with no target maps the cwd — a sourceless cwd is refused by the guard, not usage', () => {
  // FUNNEL #2 / FR2 (tests/first-run.test.mjs): <SRC> now defaults to the current directory, so
  // the old bare-run-is-a-usage-error contract is gone. What keeps a WRONG cwd from producing a
  // silent nonsense map is the extract empty-target guard (exit 1), tested here.
  const bare = tmpDir('codeweb-front-');
  try {
    const r = runNode(script('run.mjs'), [], { cwd: bare });
    assert.equal(r.status, 1, 'sourceless cwd refused (guard class, not usage)');
    assert.match(r.stderr, /no supported source files/);
  } finally { cleanup(bare); }
});

test('F4 every USAGE-bearing CLI answers --help with exit 0', () => {
  for (const s of ['query.mjs', 'stats.mjs', 'brief.mjs', 'explain.mjs', 'find.mjs', 'hotspots.mjs', 'campaign.mjs', 'deadcode.mjs', 'optimize.mjs', 'diff.mjs', 'context-pack.mjs', 'trend.mjs', 'refresh.mjs', 'annotate.mjs', 'risk.mjs', 'review.mjs', 'fitness.mjs', 'codemod.mjs', 'break-cycles.mjs', 'reading-order.mjs', 'simulate-edit.mjs', 'find-similar.mjs', 'placement.mjs', 'bench.mjs', 'build-report.mjs']) {
    const r = runNode(script(s), ['--help']);
    assert.equal(r.status, 0, `${s} --help exits 0 (got ${r.status}: ${r.stderr.slice(0, 120)})`);
    assert.match(r.stdout, /usage:/, `${s} --help prints usage`);
  }
});

const GRAPH = {
  meta: { target: 'fixture' },
  domains: [], overlaps: [],
  nodes: [{ id: 'src/a.js:alpha', label: 'alpha', kind: 'function', file: 'src/a.js', line: 1, loc: 2 }],
  edges: [],
};

test('F5 graph auto-discovery: bare query works from inside a mapped repo, and says which graph it used', () => {
  const repo = tmpDir('codeweb-front-');
  try {
    mkdirSync(join(repo, '.codeweb'), { recursive: true });
    mkdirSync(join(repo, 'src', 'deep'), { recursive: true });
    writeFileSync(join(repo, '.codeweb', 'graph.json'), JSON.stringify(GRAPH));
    const r = runNode(script('query.mjs'), ['--callers', 'alpha'], { cwd: join(repo, 'src', 'deep') });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /using .*graph\.json \(nearest \.codeweb above cwd\)/, 'discovery is announced');
    assert.match(r.stdout, /callers of alpha: 0/);
  } finally { cleanup(repo); }
});

test('F6 bare stats works from a mapped repo (the README-advertised invocation)', () => {
  const repo = tmpDir('codeweb-front-');
  try {
    mkdirSync(join(repo, '.codeweb'), { recursive: true });
    writeFileSync(join(repo, '.codeweb', 'graph.json'), JSON.stringify(GRAPH));
    const r = runNode(script('stats.mjs'), [], { cwd: repo });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /no activity recorded yet|codeweb activity/);
  } finally { cleanup(repo); }
});

test('F7 outside any mapped repo, bare query still dies with usage (exit 2)', () => {
  const bare = tmpDir('codeweb-front-');
  try {
    const r = runNode(script('query.mjs'), ['--cycles'], { cwd: bare, env: { CODEWEB_WS: '' } });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /usage: query\.mjs/);
  } finally { cleanup(bare); }
});

test('F8 build-report IO failures use exit 2 per the convention', () => {
  const r = runNode(script('build-report.mjs'), ['/nowhere/graph.json']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /graph not found/);
});

test('F9 run.mjs success points the user at the report', () => {
  const dir = tmpDir('codeweb-front-');
  const ws = tmpDir('codeweb-front-ws-');
  try {
    writeTree(dir, { 'a.js': 'export function alpha() { return 1; }\n' });
    const r = runNode(script('run.mjs'), [dir, '--out-dir', ws]);
    assert.equal(r.status, 0, r.stderr.slice(-400));
    // First run: the next: block's step 1 names the report; returning users get the classic line.
    // CLI.md 6.1: guidance is part of the result page — stdout, not stderr.
    assert.match(r.stdout, /see the map: .*report\.html|open .*report\.html in your browser/);
  } finally { cleanup(dir); cleanup(ws); }
});

test('F10 context-pack works with a bare symbol from a mapped repo', () => {
  const repo = tmpDir('codeweb-front-');
  try {
    mkdirSync(join(repo, '.codeweb'), { recursive: true });
    writeFileSync(join(repo, '.codeweb', 'graph.json'), JSON.stringify(GRAPH));
    const r = runNode(script('context-pack.mjs'), ['alpha'], { cwd: repo });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /context-pack: alpha/);
  } finally { cleanup(repo); }
});
