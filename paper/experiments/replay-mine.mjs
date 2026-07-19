#!/usr/bin/env node
// replay-mine — build a benchmark out of what ACTUALLY broke. Walks a repo's git history for
// commits that changed a depended-on function's signature and — per the history itself — missed
// caller files that a later commit had to fix. Each hit becomes a replay task with ground truth:
// "at <parent>, apply this definition change; the callers that historically needed updating are
// the answer key." No proposer agent, no invented tasks, no floor effect — if history recorded a
// miss, the task provably had a failure mode.
//
//   node paper/experiments/replay-mine.mjs <repo> [--max-commits 300] [--min-callers 3]
//        [--followup-window 5] [--max-tasks 12] [--out paper/results/replay-tasks.json]
//
// Deterministic given the repo state. Read-only over the repo (ephemeral worktrees, removed).

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXTRACT = join(HERE, '..', '..', 'scripts', 'extract-symbols.mjs');
const SRC_RE = /\.(js|mjs|cjs|jsx|ts|tsx|py|rs|go|java|cs)$/;

const argv = process.argv.slice(2);
let repo = null, maxCommits = 300, minCallers = 3, window_ = 5, maxTasks = 12, outPath = 'paper/results/replay-tasks.json', maxPairs = 40;
for (let i = 0; i < argv.length; i++) {
  const t = argv[i];
  if (t === '--max-commits') maxCommits = parseInt(argv[++i], 10) || maxCommits;
  else if (t === '--min-callers') minCallers = parseInt(argv[++i], 10) || minCallers;
  else if (t === '--followup-window') window_ = parseInt(argv[++i], 10) || window_;
  else if (t === '--max-tasks') maxTasks = parseInt(argv[++i], 10) || maxTasks;
  else if (t === '--max-pairs') maxPairs = parseInt(argv[++i], 10) || maxPairs;
  else if (t === '--out') outPath = argv[++i];
  else if (!t.startsWith('-')) repo = resolve(t);
}
if (!repo) { console.error('usage: replay-mine.mjs <repo> [--max-commits N] [--min-callers N] [--followup-window K] [--max-pairs N] [--out file]'); process.exit(2); }

const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', maxBuffer: 1 << 26 });
const tryGit = (...a) => { try { return git(...a); } catch { return null; } };

// newest -> oldest along first-parent, merges excluded (a squash/PR-merge IS a first-parent commit)
const commits = git('log', '--no-merges', '--first-parent', `-n${maxCommits}`, '--format=%H').trim().split('\n').filter(Boolean);
const posOf = new Map(commits.map((c, i) => [c, i])); // lower index = newer

const filesOf = (sha) => (tryGit('show', '--name-only', '--format=', sha) || '').trim().split('\n').filter(Boolean);
const SIGNISH = /^[+-].*(function\s|=>|\bdef\s|\bfn\s|\bfunc\s)/m;

function extractAt(sha) {
  const wt = mkdtempSync(join(tmpdir(), 'replay-wt-'));
  const out = join(wt, 'frag.json');
  try {
    git('worktree', 'add', '--detach', '--force', join(wt, 'src'), sha);
    execFileSync(process.execPath, [EXTRACT, join(wt, 'src'), '--no-ctags', '--out', out], { stdio: 'ignore' });
    return { frag: JSON.parse(readFileSync(out, 'utf8')), src: join(wt, 'src'), cleanup: () => { try { git('worktree', 'remove', '--force', join(wt, 'src')); } catch {} try { rmSync(wt, { recursive: true, force: true }); } catch {} } };
  } catch (e) {
    try { git('worktree', 'remove', '--force', join(wt, 'src')); } catch {}
    try { rmSync(wt, { recursive: true, force: true }); } catch {}
    return null;
  }
}

// The declaration LINE at a node's position — fragments don't reliably carry rich signatures, so
// the definition text itself is the change detector (formatting-sensitive; downstream filters —
// callers, missed files, follow-up fixes — do the real narrowing).
function defLineOf(srcDir, node) {
  try {
    const lines = readFileSync(join(srcDir, node.file), 'utf8').split(/\r?\n/);
    return (lines[node.line - 1] || '').trim();
  } catch { return null; }
}

const callerFilesOf = (frag, id, ownFile) => {
  const files = new Set();
  for (const e of frag.edges || []) {
    if (e.to !== id || (e.kind !== 'call' && e.kind !== 'import' && e.kind !== 'ref')) continue;
    const f = e.from.slice(0, e.from.lastIndexOf(':'));
    if (f && f !== ownFile) files.add(f);
  }
  return files;
};

const tasks = [];
// the funnel is reported, never silent — a 0-task run must say WHERE candidates died
const funnel = { signaturePairs: 0, symbolsInChangedFiles: 0, idPresentInBase: 0, signatureChanged: 0, enoughCallers: 0, hadMissedCallers: 0, hadFollowupFix: 0 };
let pairsTried = 0;
for (let i = 0; i < commits.length - 1 && tasks.length < maxTasks && pairsTried < maxPairs; i++) {
  const C = commits[i];
  const P = tryGit('rev-parse', `${C}^`)?.trim();
  if (!P) continue; // shallow edge
  const changed = filesOf(C).filter((f) => SRC_RE.test(f));
  if (!changed.length || changed.length > 12) continue; // bulk changes are not "a change to a symbol"
  const diffText = tryGit('show', '--unified=0', '--format=', C, '--', ...changed) || '';
  if (!SIGNISH.test(diffText)) continue;

  pairsTried++;
  const before = extractAt(P);
  if (!before) continue;
  const after = extractAt(C);
  if (!after) { before.cleanup(); continue; }
  try {
    const bById = new Map((before.frag.nodes || []).map((n) => [n.id, n]));
    const changedSet = new Set(changed);
    for (const a of after.frag.nodes || []) {
      if (tasks.length >= maxTasks) break;
      if ((a.kind !== 'function' && a.kind !== 'method') || a.role !== 'product' || !changedSet.has(a.file)) continue;
      funnel.symbolsInChangedFiles++;
      const b = bById.get(a.id);
      if (!b) continue;
      funnel.idPresentInBase++;
      const bp = JSON.stringify(b.signature?.params ?? null), ap = JSON.stringify(a.signature?.params ?? null);
      let sigChanged = bp !== ap;
      if (!sigChanged) {
        const bl = defLineOf(before.src, b), al = defLineOf(after.src, a);
        sigChanged = bl != null && al != null && bl !== al && (bl.includes('(') || al.includes('('));
      }
      if (!sigChanged) continue;
      funnel.signatureChanged++;
      const callers = callerFilesOf(before.frag, a.id, a.file);
      if (callers.size < minCallers) continue;
      funnel.enoughCallers++;
      const touchedInC = new Set(changed);
      const missed = [...callers].filter((f) => !touchedInC.has(f));
      if (!missed.length) continue; // C updated every caller file itself — well-executed, no ground truth
      funnel.hadMissedCallers++;
      // history's answer key: a later commit (newer = smaller index) touched a missed caller file
      // AND mentions the symbol — the caller catch-up C should have included.
      const fixedBy = [];
      for (let j = i - 1; j >= Math.max(0, i - window_); j--) {
        const F = commits[j];
        const ff = filesOf(F).filter((f) => missed.includes(f));
        if (!ff.length) continue;
        const fDiff = tryGit('show', '--unified=0', '--format=', F, '--', ...ff) || '';
        if (new RegExp(`\\b${a.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(fDiff)) fixedBy.push({ sha: F, files: ff });
      }
      if (!fixedBy.length) continue;
      funnel.hadFollowupFix++;
      const defDiff = (tryGit('show', '--format=', C, '--', a.file) || '').slice(0, 4096);
      tasks.push({
        repo, baseSha: P, changeSha: C, symbol: a.id, label: a.label, file: a.file,
        fanInAtBase: callers.size,
        callerFilesAtBase: [...callers].sort(),
        missedByChange: missed.sort(),
        fixedInFollowup: fixedBy,
        defDiff,
        instruction: `At the base revision, apply exactly this change to ${a.label} in ${a.file} (the definition-side diff is given verbatim below), then update the codebase so it remains consistent with the change.\n\n${defDiff}`,
        criterion: 'every file that uses the changed signature compiles/behaves against the new shape; graded on (a) coverage of the historically-missed caller files and (b) zero structural regressions (diff.mjs gate)',
      });
    }
  } finally { before.cleanup(); after.cleanup(); }
}

funnel.signaturePairs = pairsTried;
const result = {
  minedAt: 'replay-mine v1', repo, config: { maxCommits, minCallers, followupWindow: window_, maxTasks, pairsTried },
  commitsScanned: commits.length, funnel, tasks,
};
writeFileSync(resolve(outPath), JSON.stringify(result, null, 2));
console.log(`[replay-mine] ${tasks.length} ground-truth task(s) from ${commits.length} commits (${pairsTried} signature-change pair(s) graphed) -> ${outPath}`);
console.log(`  funnel: ${Object.entries(funnel).map(([k, v]) => `${k} ${v}`).join(' -> ')}`);
for (const t of tasks) console.log(`  ${t.changeSha.slice(0, 7)} ${t.label} — ${t.fanInAtBase} caller file(s), missed ${t.missedByChange.length}, fixed later by ${t.fixedInFollowup.map((f) => f.sha.slice(0, 7)).join(',')}`);
