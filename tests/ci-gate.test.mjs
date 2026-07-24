import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, script, tmpDir, cleanup, writeTree, PLUGIN_ROOT } from './helpers.mjs';

const hasGit = spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;

const COMPUTE = `export function compute(x) {
  let total = 0;
  for (let i = 0; i < x; i++) {
    if (i % 2 === 0) total += i * 3;
    else total -= i;
  }
  const scaled = total * 2 + 7;
  return scaled > 100 ? scaled - 100 : scaled;
}
`;

function repoWithBase() {
  const repo = tmpDir('codeweb-gaterepo-');
  const gitC = (...args) => {
    const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
    return r;
  };
  gitC('init', '-q');
  gitC('config', 'user.email', 't@example.com');
  gitC('config', 'user.name', 'Test');
  gitC('config', 'commit.gpgsign', 'false');
  writeTree(repo, { 'src/a.js': COMPUTE });
  gitC('add', '-A'); gitC('commit', '-q', '-m', 'base');
  const base = gitC('rev-parse', 'HEAD').stdout.trim();
  return { repo, base };
}

test('ci-gate fails (exit 1) when the working tree introduces a new duplication', { skip: hasGit ? false : 'git not available' }, () => {
  const { repo, base } = repoWithBase();
  try {
    // working-tree change: a byte-identical copy -> a new body-confirmed duplication vs base
    writeTree(repo, { 'src/b.js': COMPUTE });
    const r = runNode(script('ci-gate.mjs'), ['--base', base, '--repo', repo, '--target', 'src']);
    assert.equal(r.status, 1, `expected the gate to fail; stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    assert.match(r.stdout + r.stderr, /regress|duplicat/i, 'reports why it failed');
  } finally {
    cleanup(repo);
  }
});

test('ci-gate passes (exit 0) when the working tree matches base', { skip: hasGit ? false : 'git not available' }, () => {
  const { repo, base } = repoWithBase();
  try {
    const r = runNode(script('ci-gate.mjs'), ['--base', base, '--repo', repo, '--target', 'src']);
    assert.equal(r.status, 0, `expected the gate to pass; stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  } finally {
    cleanup(repo);
  }
});

test('ci-gate --md writes the PR-comment digest carrying the verdict', { skip: hasGit ? false : 'git not available' }, () => {
  const { repo, base } = repoWithBase();
  try {
    writeTree(repo, { 'src/b.js': COMPUTE }); // duplication -> failing gate
    const md = join(repo, 'gate.md');
    const r = runNode(script('ci-gate.mjs'), ['--base', base, '--repo', repo, '--target', 'src', '--md', md]);
    assert.equal(r.status, 1, 'verdict unchanged by the digest');
    const body = readFileSync(md, 'utf8');
    assert.match(body, /^<!-- codeweb-gate -->/, 'sticky-comment marker leads the body');
    assert.match(body, /❌ \d+ regression type/, 'verdict in the headline');
    assert.match(body, /New duplication findings/, 'names the regression class');
  } finally {
    cleanup(repo);
  }
});

test('ci-gate without --base exits 2 (usage)', () => {
  const r = runNode(script('ci-gate.mjs'), []);
  assert.equal(r.status, 2);
});

test('ci-gate exits 2 (not a crash) when the base ref cannot be resolved', { skip: hasGit ? false : 'git not available' }, () => {
  const { repo } = repoWithBase();
  try {
    // an unresolvable base must fail gracefully via the cleanup path (throw -> catch -> finally),
    // never a bare process.exit that would leak the scratch worktree
    const r = runNode(script('ci-gate.mjs'), ['--base', '0000000000000000000000000000000000000000', '--repo', repo, '--target', 'src']);
    assert.equal(r.status, 2, `expected a graceful exit 2; stderr:\n${r.stderr}`);
    assert.match(r.stderr, /worktree|base/i, 'explains the base could not be materialized');
  } finally {
    cleanup(repo);
  }
});

// #15 (IMPROVEMENTS.md): the REUSABLE action carries the gate-as-reviewer — adopters get the
// same sticky structural-review comment codeweb's own PRs get (opt-in, fork-safe).
test('the composite action ships the sticky-comment reviewer, opt-in and fork-safe', () => {
  const yml = readFileSync(join(PLUGIN_ROOT, '.github', 'actions', 'codeweb-gate', 'action.yml'), 'utf8');
  assert.match(yml, /comment:\n/, 'comment input exists');
  assert.match(yml, /default: 'false'/, 'comment is opt-in');
  assert.match(yml, /--md "\$RUNNER_TEMP\/codeweb-gate\.md"/, 'the digest is produced for the comment');
  assert.match(yml, /<!-- codeweb-gate -->/, 'sticky marker matches the self-repo workflow');
  assert.match(yml, /updateComment|createComment/, 'posts or updates in place');
  // ERRORS #3: the gate step always exits 0 and records ci-gate's REAL code as an output, so the
  // comment still posts first AND the enforce step can tell exit 1 (regression) from exit 2 (setup).
  assert.match(yml, /echo "code=\$\?" >> "\$GITHUB_OUTPUT"/, 'the real exit code is captured');
  assert.match(yml, /steps\.gate\.outputs\.code != '0'/, 'comment posts before the verdict enforces');
  assert.match(yml, /Enforce gate verdict/, 'the verdict still fails the job');
  assert.match(yml, /found structural regressions/, 'exit 1 keeps the regression message');
  assert.match(yml, /setup problem, not a structural regression/, 'exit 2 names setup, never a false verdict');
  assert.match(yml, /pull-requests: write/, 'permission requirement documented in the input description');
});
