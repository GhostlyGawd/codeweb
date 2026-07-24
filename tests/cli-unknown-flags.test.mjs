// Round 2, finding #39: the #24 shared parseArgs/spec pattern (lib/cli.mjs) has one policy for an
// unknown flag — reject with usage, exit 2, NEVER a silent positional. A second drifted mini-parser
// survived in several scripts. Two were the live BUG: explain.mjs and diff.mjs hand-rolled
//   for (const t of argv) { if (t === '--json') json = true; else if (!t.startsWith('-')) pos.push(t); }
// with NO else-branch, so a typo like `--jsno` was silently ignored (exit 0) instead of erroring.
// bench-ts-engine swallowed an unknown flag into the positional target (the original #24 shape).
// This locks the one policy across every converted front door AND proves the legitimate flags,
// positionals, and --help still work exactly as before.

import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { runNode, script, tmpDir, cleanup } from './helpers.mjs';

// Minimal well-formed graph: one resolvable symbol so the legitimate paths reach exit 0.
const GRAPH = {
  meta: { target: 'fixture', root: null },
  domains: [], overlaps: [],
  nodes: [{ id: 'src/a.js:alpha', label: 'alpha', kind: 'function', file: 'src/a.js', line: 1, loc: 2 }],
  edges: [],
};

function withGraph(fn) {
  const dir = tmpDir('codeweb-uflag-');
  try {
    const gp = join(dir, 'g.json');
    writeFileSync(gp, JSON.stringify(GRAPH));
    return fn(gp, dir);
  } finally { cleanup(dir); }
}

test('explain.mjs rejects an unknown flag with usage, exit 2 (was: --jsno silently ignored -> exit 0)', () => {
  withGraph((gp) => {
    const r = runNode(script('explain.mjs'), [gp, 'alpha', '--jsno']);
    assert.equal(r.status, 2, `unknown flag must exit 2, got ${r.status}`);
    assert.match(r.stderr, /unknown flag: --jsno/);
    assert.match(r.stderr, /usage: explain\.mjs/);
  });
});

test('diff.mjs rejects an unknown flag with usage, exit 2 (was: bogus flag silently ignored -> exit 0)', () => {
  withGraph((gp) => {
    const r = runNode(script('diff.mjs'), [gp, gp, '--nope']);
    assert.equal(r.status, 2, `unknown flag must exit 2, got ${r.status}`);
    assert.match(r.stderr, /unknown flag: --nope/);
    assert.match(r.stderr, /usage: diff\.mjs/);
  });
});

test('brief/stats/coverage reject an unknown flag with usage, exit 2 (one policy)', () => {
  withGraph((gp) => {
    const brief = runNode(script('brief.mjs'), [gp, '--nope']);
    assert.equal(brief.status, 2, brief.stderr);
    assert.match(brief.stderr, /unknown flag: --nope/);
    assert.match(brief.stderr, /usage: brief\.mjs/);

    const stats = runNode(script('stats.mjs'), [gp, '--nope']);
    assert.equal(stats.status, 2, stats.stderr);
    assert.match(stats.stderr, /unknown flag: --nope/);
    assert.match(stats.stderr, /usage: stats\.mjs/);

    const cov = runNode(script('coverage.mjs'), [gp, gp, '--nope']);
    assert.equal(cov.status, 2, cov.stderr);
    assert.match(cov.stderr, /unknown flag: --nope/);
    assert.match(cov.stderr, /usage: coverage\.mjs/);
  });
});

test('bench-ts-engine.mjs rejects an unknown flag with usage, exit 2 (was: swallowed into the target positional -> exit 1 "target not found")', () => {
  // parseArgs rejects before any extraction runs, so this stays cheap (no tree-sitter needed).
  const r = runNode(script('bench-ts-engine.mjs'), ['--engine', 'tree-sitter']);
  assert.equal(r.status, 2, `unknown flag must exit 2, got ${r.status}: ${r.stderr.slice(0, 160)}`);
  assert.match(r.stderr, /unknown flag: --engine/);
  assert.match(r.stderr, /usage: bench-ts-engine\.mjs/);
});

// --- the legitimate surface must survive the conversion unchanged ---

test('explain.mjs: --json still parses, positionals resolve (graph + symbol -> found)', () => {
  withGraph((gp) => {
    const r = runNode(script('explain.mjs'), [gp, 'alpha', '--json']);
    assert.equal(r.status, 0, r.stderr);
    const payload = JSON.parse(r.stdout);
    assert.equal(payload.symbol, 'alpha');
    assert.ok(Array.isArray(payload.matched) && payload.matched.includes('src/a.js:alpha'), 'positional symbol resolved to the node');
  });
});

test('diff.mjs: --json still parses, positionals resolve (before + after -> no regressions)', () => {
  withGraph((gp) => {
    const r = runNode(script('diff.mjs'), [gp, gp, '--json']);
    assert.equal(r.status, 0, r.stderr);
    const payload = JSON.parse(r.stdout);
    assert.ok('regressions' in payload && payload.regressions.length === 0, 'identical graphs -> zero regressions');
  });
});

test('--help still prints usage and exits 0 on every converted front door', () => {
  for (const s of ['explain.mjs', 'diff.mjs', 'brief.mjs', 'stats.mjs', 'coverage.mjs', 'bench-ts-engine.mjs']) {
    const r = runNode(script(s), ['--help']);
    assert.equal(r.status, 0, `${s} --help exits 0 (got ${r.status}: ${r.stderr.slice(0, 120)})`);
    assert.match(r.stdout, /usage:/, `${s} --help prints usage`);
  }
});

// CLI review "first fix" (CLI.md §6) + ERRORS.md R1: the parser coaches. A near-miss typo names
// the flag it probably meant; --flag=value parses; and a valid command in an UNMAPPED directory
// gets the no-map cause + remedy with the usage APPENDED — never the bare usage wall.
test('coach: did-you-mean on a near-miss flag, silence on a far one', () => {
  withGraph((gp) => {
    const near = runNode(script('query.mjs'), [gp, '--cyles']);
    assert.equal(near.status, 2);
    assert.match(near.stderr, /unknown flag: --cyles \(did you mean --cycles\?\)/);
    const far = runNode(script('query.mjs'), [gp, '--zzqxwv']);
    assert.equal(far.status, 2);
    assert.ok(!/did you mean/.test(far.stderr), 'no guess when nothing is close');
  });
});

test('coach: --flag=value parses for value flags and bool switches take =false', () => {
  withGraph((gp) => {
    const r = runNode(script('query.mjs'), [gp, '--orphans', '--limit=1']);
    assert.equal(r.status, 0, r.stderr);
    const b = runNode(script('query.mjs'), [gp, '--orphans', '--json=false']);
    assert.equal(b.status, 0, b.stderr);
    assert.ok(!b.stdout.trimStart().startsWith('{'), '--json=false stays in text mode');
  });
});

test('coach: unmapped directory gets cause + remedy, usage appended (ERRORS R1)', () => {
  const dir = tmpDir('codeweb-nomap-');
  try {
    const r = runNode(script('query.mjs'), ['--cycles'], { cwd: dir, env: { ...process.env, CODEWEB_WS: '' } });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /no map found — checked the graph argument, CODEWEB_WS, and every \.codeweb\/ above/);
    assert.match(r.stderr, /map this repo first: npx -y @ghostlygawd\/codeweb/);
    assert.match(r.stderr, /then: usage: query\.mjs/, 'the usage still arrives — after the cause, not instead of it');
  } finally { cleanup(dir); }
});
