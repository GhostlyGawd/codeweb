#!/usr/bin/env node
// codeweb CI gate — fail a PR when an edit makes the structure worse.
//
//   node scripts/ci-gate.mjs --base <ref> [--repo <path>] [--target <subdir>] [--md <file>]
//
// Builds the BEFORE graph from a base ref (materialized in an ephemeral git worktree) and the AFTER
// graph from the current working tree, then runs the diff regression gate. Exit 1 (listing the
// regressions) when an edit introduces a new dependency cycle, a new duplication finding, or makes
// an existing symbol lose all its callers; exit 0 otherwise; exit 2 on usage/IO error. Read-only
// over the repo — the base worktree is removed afterwards. Reuses the canonical run.mjs pipeline and
// the diff.mjs gate verbatim, so the gate's verdict matches `diff` exactly.
//
// --md writes the structural review as a PR-comment-ready markdown digest (lib/gate-md.mjs) —
// best-effort: a digest failure never changes the gate's verdict.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { gateComment } from './lib/gate-md.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const a = { base: null, repo: '.', target: '.', md: null };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--base') a.base = argv[++i];
    else if (t === '--repo') a.repo = argv[++i];
    else if (t === '--target') a.target = argv[++i];
    else if (t === '--md') a.md = argv[++i];
  }
  return a;
}

const opts = parseArgs(process.argv.slice(2));
if (!opts.base) {
  console.error('usage: ci-gate.mjs --base <ref> [--repo <path>] [--target <subdir>] [--md <file>]');
  process.exit(2);
}

const repo = resolve(opts.repo);
const node = process.execPath;
const buildGraph = (srcDir, label, ws) => {
  execFileSync(node, [join(HERE, 'run.mjs'), srcDir, '--target', label, '--out-dir', ws], { stdio: 'ignore' });
  return join(ws, 'graph.json');
};

const base = mkdtempSync(join(tmpdir(), 'codeweb-gate-'));
const afterWs = join(base, 'after'), beforeWs = join(base, 'before'), wt = join(base, 'wt');
let code = 0;
try {
  // AFTER = the current working tree (what the PR proposes to merge)
  const afterGraph = buildGraph(join(repo, opts.target), 'after', afterWs);
  // BEFORE = the base ref, materialized read-only in an ephemeral worktree
  const r = spawnSync('git', ['-C', repo, 'worktree', 'add', '--detach', '--force', wt, opts.base], { encoding: 'utf8' });
  if (r.status !== 0) {
    // throw (NOT process.exit) so the finally block still removes the worktree + temp dir — a bare
    // process.exit() runs synchronously and skips finally, leaking the scratch dir on every failure.
    throw new Error(`cannot create base worktree for "${opts.base}" (need full history — actions/checkout with fetch-depth: 0): ${r.stderr}`);
  }
  const beforeGraph = buildGraph(join(wt, opts.target), 'before', beforeWs);
  // GATE — diff.mjs prints the delta + regressions and sets the exit code we propagate.
  const d = spawnSync(node, [join(HERE, 'diff.mjs'), beforeGraph, afterGraph], { stdio: 'inherit' });
  if (d.status == null) {
    console.error(`[codeweb] gate inconclusive — diff was terminated${d.signal ? ` by ${d.signal}` : ''}`);
    code = 1;
  } else {
    code = d.status;
  }
  // PR-comment digest — a second diff over the already-built graphs (ms), rendered budgeted
  if (opts.md) {
    try {
      const dj = spawnSync(node, [join(HERE, 'diff.mjs'), beforeGraph, afterGraph, '--json'], { encoding: 'utf8', maxBuffer: 1 << 26 });
      writeFileSync(opts.md, gateComment(JSON.parse(dj.stdout)));
    } catch (e) { console.error(`[codeweb] gate comment not written: ${(e && e.message) || e}`); }
  }
} catch (e) {
  console.error(`[codeweb] gate error: ${(e && e.message) || e}`);
  code = 2;
} finally {
  try { spawnSync('git', ['-C', repo, 'worktree', 'remove', '--force', wt]); } catch { /* best-effort */ }
  try { rmSync(base, { recursive: true, force: true }); } catch { /* best-effort */ }
}
process.exit(code);
