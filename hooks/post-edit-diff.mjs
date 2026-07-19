#!/usr/bin/env node
// codeweb PostToolUse hook — structural regression check after an edit.
//
// Reads the PostToolUse payload on stdin. IF the edited file is a source file under a
// `.codeweb/`-mapped target (i.e. /codeweb has been run, leaving `<target>/.codeweb/graph.json`),
// re-extracts that target and compares to the baseline via structuralRegressions(): a NEW file
// dependency cycle, or a symbol that lost ALL its callers, is surfaced to the agent.
//
// FAIL-OPEN by construction: any parse error, missing baseline, or extraction failure exits 0
// silently, so the hook can never block or break an edit. It is INERT until a target is mapped
// (no `.codeweb/graph.json` up-tree -> no-op), and only checks the edges-only regression subset
// (cycles + lost-callers) — run `scripts/diff.mjs` or re-run /codeweb for the full delta.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { structuralRegressions } from '../scripts/lib/graph-ops.mjs';
import { bump, correlateEdit } from '../scripts/lib/stats.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXTRACT = join(HERE, '..', 'scripts', 'extract-symbols.mjs');
const SRC_RE = /\.(js|mjs|cjs|jsx|ts|tsx|py)$/;

// Walk up from the edited file to the nearest dir holding .codeweb/graph.json (a mapped target).
function findTarget(filePath) {
  let dir = dirname(resolve(filePath));
  for (let i = 0; i < 40; i++) {
    const baseline = join(dir, '.codeweb', 'graph.json');
    if (existsSync(baseline)) return { root: dir, baseline };
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// Returns { root, newCycles, lostCallers } when an edit introduces a structural regression, else null.
export function check(raw) {
  let input; try { input = JSON.parse(raw); } catch { return null; }
  const fp = input?.tool_input?.file_path || input?.tool_input?.filePath;
  if (!fp || !SRC_RE.test(fp)) return null;
  const t = findTarget(fp);
  if (!t) return null;
  let baseline; try { baseline = JSON.parse(readFileSync(t.baseline, 'utf8')); } catch { return null; }
  const tmpOut = join(tmpdir(), `codeweb-hook-${process.pid}.json`);
  try {
    // Incremental: the per-file scan cache lives beside the graph, so an edit re-scans only the
    // changed file(s) instead of the whole target on every keystroke-batch.
    const cache = join(dirname(t.baseline), 'scan-cache.json');
    execFileSync(process.execPath, [EXTRACT, t.root, '--no-ctags', '--cache', cache, '--out', tmpOut], { stdio: 'ignore' });
  } catch { return null; }
  let after; try { after = JSON.parse(readFileSync(tmpOut, 'utf8')); } catch { return null; }
  const reg = structuralRegressions(baseline, after);
  if (!reg.newCycles.length && !reg.lostCallers.length) return null;
  return { root: t.root, ...reg };
}

function format(out) {
  const lines = [`[codeweb] ⚠ structural regression after edit (target: ${out.root}):`];
  for (const c of out.newCycles) lines.push(`  new dependency cycle: ${c.join(' <-> ')}`);
  for (const id of out.lostCallers) lines.push(`  ${id} lost all callers (now uncalled)`);
  lines.push('  -> run `node scripts/diff.mjs` or re-run /codeweb for the full delta.');
  return lines.join('\n');
}

// Execute as a hook only when run directly (not when imported by tests).
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  let raw = '';
  try { raw = readFileSync(0, 'utf8'); } catch { /* no stdin */ }
  let out = null;
  try { out = check(raw); } catch { /* fail-open */ }
  try {
    const fp = JSON.parse(raw)?.tool_input?.file_path || JSON.parse(raw)?.tool_input?.filePath;
    const t = fp && SRC_RE.test(fp) && findTarget(fp);
    if (t) {
      bump(t.baseline, 'postEditChecks');
      if (out) bump(t.baseline, 'regressionsFlagged', out.newCycles.length + out.lostCallers.length);
      // advice-followed correlation: did this edit touch a caller file the last card warned about?
      const rel = resolve(fp).slice(t.root.length + 1).replace(/\\/g, '/');
      correlateEdit(t.baseline, rel);
    }
  } catch { /* receipt only */ }
  if (out) {
    const msg = format(out);
    process.stderr.write(msg + '\n');
    try {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: msg },
      }) + '\n');
    } catch { /* ignore */ }
  }
  process.exit(0); // ALWAYS non-blocking
}
