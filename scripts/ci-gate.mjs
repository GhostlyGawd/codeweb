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

import { mkdtempSync, rmSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { gateComment } from './lib/gate-md.mjs';
import { die, parseArgs } from './lib/cli.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const USAGE = 'usage: ci-gate.mjs --base <ref> [--repo <path>] [--target <subdir>] [--md <file>] [--history <file>] [--report-only]\n  --report-only    report completed regressions without blocking; setup errors still fail\n  --history <file>  append this run\'s AFTER metrics to a JSONL ledger (persist it via actions/cache)\n                    and render the cross-PR trend line in the --md comment';

// finding 24: THE flag loop (lib/cli.mjs parseArgs) — unknown flags were silently ignored here,
// and this was one of the CLIs answering no --help; one policy now.
const { opts, pos } = parseArgs(process.argv.slice(2), {
  usage: USAGE,
  flags: {
    base: { type: 'string', default: null },
    'report-only': { type: 'bool', default: false },
    repo: { type: 'string', default: '.' },
    target: { type: 'string', default: '.' },
    md: { type: 'string', default: null },
    history: { type: 'string', default: null }, // RETENTION R7: the gate finally accrues something
  },
});
if (!opts.base || pos.length) die(USAGE, 2);

const repo = resolve(opts.repo);
const node = process.execPath;
const buildGraph = (srcDir, label, ws) => {
  // ERRORS.md #3: stdio:'ignore' reduced every pipeline failure to "gate error: Command failed:
  // <argv>" — the child's own diagnosis (wrong root, no source, node version) never surfaced.
  // Capture and forward the stderr tail; a build failure is a SETUP error (exit 2), never a verdict.
  const r = spawnSync(node, [join(HERE, 'run.mjs'), srcDir, '--target', label, '--out-dir', ws], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) {
    const tail = (r.stderr || '').trim().split('\n').slice(-8).join('\n');
    throw new Error(`graph build failed for "${label}" (exit ${r.status}):\n${tail || '(no stderr captured)'}`);
  }
  return join(ws, 'graph.json');
};

const base = mkdtempSync(join(tmpdir(), 'codeweb-gate-'));
const afterWs = join(base, 'after'), beforeWs = join(base, 'before'), wt = join(base, 'wt');
let code = 0;
let completedRegression = false;
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
  // A process exit alone cannot distinguish a finding from an uncaught Node exception.
  // Accept a verdict only after one completed JSON response matches the diff contract.
  const d = spawnSync(node, [join(HERE, 'diff.mjs'), beforeGraph, afterGraph, '--json'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (d.stderr) process.stderr.write(d.stderr);
  if (d.error || d.signal || ![0, 1].includes(d.status)) {
    throw new Error(`diff analysis did not complete (exit ${d.status}${d.signal ? `, signal ${d.signal}` : ''})`);
  }
  let payload;
  try { payload = JSON.parse(d.stdout); } catch { throw new Error('diff analysis returned no valid JSON verdict'); }
  const valid = typeof payload?.ok === 'boolean'
    && Array.isArray(payload.regressions) && payload.regressions.every(r => typeof r === 'string')
    && payload.ok === (payload.regressions.length === 0) && d.status === (payload.ok ? 0 : 1)
    && payload.verdict?.ok === payload.ok && payload.verdict?.check === 'orphan-gate' && payload.verdict?.scope === 'full'
    && ['newCycles', 'lostCallers', 'newDuplications'].every(key => Array.isArray(payload.verdict?.checks?.[key]))
    && ['nodes', 'cycles', 'overlaps', 'orphans'].every(key => Array.isArray(payload[key]?.added) && Array.isArray(payload[key]?.removed))
    && Array.isArray(payload.nodes?.renamed) && Number.isFinite(payload.edges?.added) && Number.isFinite(payload.edges?.removed)
    && Number.isFinite(payload.crossDomainEdges?.delta);
  if (!valid) throw new Error('diff analysis returned an incomplete or inconsistent verdict');
  code = d.status;
  completedRegression = code === 1;
  // RETENTION R7: the gate ledger — every run computes exactly the metrics trend.mjs charts, and
  // used to discard them with RUNNER_TEMP. With --history (an actions/cache-persisted JSONL),
  // each run appends the AFTER graph's row and the comment gains a cross-PR trajectory line.
  // Best-effort: a ledger failure never changes the verdict.
  let history = null;
  if (opts.history) {
    try {
      const { metricsRow } = await import('./lib/history.mjs');
      const row = { ...metricsRow(JSON.parse(readFileSync(afterGraph, 'utf8'))), at: new Date().toISOString() };
      appendFileSync(resolve(opts.history), JSON.stringify(row) + '\n');
      history = readFileSync(resolve(opts.history), 'utf8').split('\n').filter((l) => l.trim())
        .flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } }).slice(-5);
    } catch (e) { console.error(`[codeweb] gate history not recorded: ${(e && e.message) || e}`); }
  }
  // The terminal and PR comment render the same validated, completed result.
  const digest = gateComment(payload, { history });
  process.stdout.write(digest);
  if (opts.md) {
    try { writeFileSync(opts.md, digest); }
    catch (e) { console.error(`[codeweb] gate comment not written: ${(e && e.message) || e}`); }
  }
} catch (e) {
  console.error(`[codeweb] gate error: ${(e && e.message) || e}`);
  code = 2;
} finally {
  try { spawnSync('git', ['-C', repo, 'worktree', 'remove', '--force', wt]); } catch { /* best-effort */ }
  try { rmSync(base, { recursive: true, force: true }); } catch { /* best-effort */ }
}
if (opts['report-only'] && completedRegression && code === 1) {
  console.error('[codeweb] report-only: structural regression verdict retained; this completed finding does not block.');
  code = 0;
}
process.exitCode = code;
