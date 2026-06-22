import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, script, tmpDir, cleanup, writeTree } from './helpers.mjs';

const hasGit = spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;

// A minimal graph the trend metric reads: overlaps (kind+confidence), nodes (domain), edges (weight).
function graph({ overlaps = [], nodes = [], edges = [] }) {
  return { meta: { target: 't' }, nodes, edges, domains: [], overlaps };
}
const dup = (confidence) => ({ kind: 'duplicate-logic', confidence });

test('trend renders body-confirmed duplication across snapshots (oldest -> newest)', () => {
  const dir = tmpDir('codeweb-trend-');
  try {
    // confirmed: 1 -> 2 -> 0  (an improvement by the last snapshot)
    const g1 = join(dir, 'g1.json'), g2 = join(dir, 'g2.json'), g3 = join(dir, 'g3.json');
    writeFileSync(g1, JSON.stringify(graph({
      overlaps: [dup('high'), dup('refuted')],
      nodes: [{ id: 'a', domain: 'A' }, { id: 'b', domain: 'B' }],
      edges: [{ from: 'a', to: 'b', kind: 'call', weight: 1 }], // cross-domain -> coupling 1
    })));
    writeFileSync(g2, JSON.stringify(graph({
      overlaps: [dup('high'), dup('high')],
      nodes: [{ id: 'a', domain: 'A' }, { id: 'b', domain: 'B' }, { id: 'c', domain: 'A' }],
      edges: [{ from: 'a', to: 'b', kind: 'call', weight: 1 }, { from: 'a', to: 'c', kind: 'call', weight: 1 }],
    })));
    writeFileSync(g3, JSON.stringify(graph({
      overlaps: [dup('refuted')],
      nodes: [{ id: 'a', domain: 'A' }, { id: 'b', domain: 'B' }],
      edges: [{ from: 'a', to: 'b', kind: 'call', weight: 2 }],
    })));

    const r = runNode(script('trend.mjs'), [g1, g2, g3]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /3 snapshots/);
    assert.match(r.stdout, /1 → 2 → 0/, 'confirmed sequence is charted');
    assert.match(r.stdout, /[▁▂▃▄▅▆▇█]/, 'a sparkline is drawn');
    assert.match(r.stdout, /falling/, 'a net decrease is reported as falling');
  } finally {
    cleanup(dir);
  }
});

test('trend --json emits structured per-snapshot metrics', () => {
  const dir = tmpDir('codeweb-trend-');
  try {
    const g1 = join(dir, 'g1.json'), g2 = join(dir, 'g2.json');
    writeFileSync(g1, JSON.stringify(graph({ overlaps: [dup('high')], nodes: [{ id: 'a', domain: 'A' }], edges: [] })));
    writeFileSync(g2, JSON.stringify(graph({
      overlaps: [dup('high'), dup('low')],
      nodes: [{ id: 'a', domain: 'A' }, { id: 'b', domain: 'B' }],
      edges: [{ from: 'a', to: 'b', kind: 'call', weight: 3 }],
    })));
    const r = runNode(script('trend.mjs'), [g1, g2, '--json']);
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.snapshots.length, 2);
    assert.equal(out.snapshots[0].confirmed, 1);
    assert.equal(out.snapshots[1].confirmed, 1);
    assert.equal(out.snapshots[1].candidates, 2, 'high + low both count as candidates');
    assert.equal(out.snapshots[1].coupling, 3, 'cross-domain edge weight summed');
  } finally {
    cleanup(dir);
  }
});

test('trend with no input exits 2 (usage)', () => {
  const r = runNode(script('trend.mjs'), []);
  assert.equal(r.status, 2);
});

// Integration: drive real git history. A duplicate introduced in commit 2 must raise `confirmed`.
const SAME = `export function compute(x) {
  let total = 0;
  for (let i = 0; i < x; i++) {
    if (i % 2 === 0) total += i * 3;
    else total -= i;
  }
  const scaled = total * 2 + 7;
  return scaled > 100 ? scaled - 100 : scaled;
}
`;

test('trend --git charts duplication rising across real commits', { skip: hasGit ? false : 'git not available' }, () => {
  const repo = tmpDir('codeweb-trendrepo-');
  const gitC = (...args) => {
    const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
    return r;
  };
  try {
    gitC('init', '-q');
    gitC('config', 'user.email', 't@example.com');
    gitC('config', 'user.name', 'Test');
    gitC('config', 'commit.gpgsign', 'false');

    // commit 1: a single definition — no duplication
    writeTree(repo, { 'src/a.js': SAME });
    gitC('add', '-A'); gitC('commit', '-q', '-m', 'c1: add compute');

    // commit 2: a byte-identical copy in another file — a body-confirmed duplication
    writeTree(repo, { 'src/b.js': SAME });
    gitC('add', '-A'); gitC('commit', '-q', '-m', 'c2: duplicate compute');

    const r = runNode(script('trend.mjs'), ['--git', repo, '--last', '2', '--focus', 'src', '--json']);
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.snapshots.length, 2, 'one row per commit');
    assert.equal(out.snapshots[0].confirmed, 0, 'no duplication at commit 1');
    assert.ok(out.snapshots[1].confirmed >= 1, 'duplication confirmed at commit 2');
  } finally {
    cleanup(repo);
  }
});
