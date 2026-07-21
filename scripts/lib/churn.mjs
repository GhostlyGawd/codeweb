// codeweb churn — commits-touching-file counts from git history (finding 27). ONE parser for
// risk.mjs + hotspots.mjs, which carried byte-near-identical copies that were UNBOUNDED (no
// window: a 100k-commit monorepo streamed its whole history per advisory run) and UNCACHED
// (campaign spawns both advisors back-to-back, so the same `git log` ran twice per campaign).
// Bounded to the last CHURN_WINDOW commits — churn is a recency signal, and a commit-count
// window is deterministic for a given HEAD, unlike `--since` which drifts with the clock — and
// cached beside the graph keyed by `git rev-parse HEAD` + window, so a repeat run at the same
// HEAD is a file read, not a git spawn.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { atomicWrite } from './cli.mjs';

export const CHURN_WINDOW = 5000; // commits

/**
 * file -> commits-touching-it count over the last `maxCommits` commits of the repo at `root`.
 * Not a git repo / git absent -> {} (the advisors degrade to churn-less ranking, as before).
 * Pass `cacheDir` (the workspace dir, beside graph.json) to enable the HEAD-keyed cache.
 */
export function churnFromGit(root, { cacheDir = null, maxCommits = CHURN_WINDOW } = {}) {
  const git = (args) => spawnSync('git', ['-C', root || '.', ...args], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const head = git(['rev-parse', 'HEAD']);
  const headSha = head.status === 0 ? head.stdout.trim() : null;
  const cachePath = cacheDir && headSha ? join(cacheDir, 'churn-cache.json') : null;
  if (cachePath) {
    try {
      const c = JSON.parse(readFileSync(cachePath, 'utf8'));
      if (c && c.head === headSha && c.window === maxCommits && c.counts) return c.counts;
    } catch { /* absent/corrupt -> recompute */ }
  }
  const counts = {};
  const r = git(['log', `--max-count=${maxCommits}`, '--format=', '--name-only']);
  if (r.status === 0) for (const f of r.stdout.split(/\r?\n/)) if (f.trim()) counts[f.trim()] = (counts[f.trim()] || 0) + 1;
  if (cachePath && r.status === 0) { try { atomicWrite(cachePath, JSON.stringify({ head: headSha, window: maxCommits, counts })); } catch { /* cache is best-effort */ } }
  return counts;
}
