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
import { structuralRegressions, regressionsAgainstSummary } from '../scripts/lib/graph-ops.mjs';
import { loadHookBaseline } from '../scripts/lib/hook-baseline.mjs';
import { bump, correlateEdit } from '../scripts/lib/stats.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXTRACT = join(HERE, '..', 'scripts', 'extract-symbols.mjs');
import { SRC_RE, SCAN_CACHE_NAME, findTarget } from '../scripts/lib/cli.mjs'; // Spec E: one truth (was a stale local copy missing five languages)


// Returns { root, newCycles, lostCallers } when an edit introduces a structural regression, else null.
export function check(raw) {
  let input; try { input = JSON.parse(raw); } catch { return null; }
  const fp = input?.tool_input?.file_path || input?.tool_input?.filePath;
  if (!fp || !SRC_RE.test(fp)) return null;
  const t = findTarget(fp);
  if (!t) return null;
  let after;
  try {
    // Incremental: THE per-file scan cache (finding 17: one shared name — the hook used its own
    // `scan-cache.json` and always ran cold after a map; it also passed --no-ctags, flipping the
    // cache's engine namespace on ctags machines AND diffing a regex fragment against a
    // ctags-engine baseline, which could fabricate phantom regressions). Same name, same engine
    // flags as run.mjs -> the hook rides the map-time warm cache and the stamp tier: a one-file
    // edit costs one stat sweep + one file scan (docs/specs/hook-fastpath-floor.md).
    // finding 18/22: the fragment streams back on STDOUT — the old per-invocation temp file
    // (~1.2MB, pid-named, never unlinked) leaked into the OS tmpdir on every single edit forever,
    // and cost an extra serialize+write+read of the whole fragment besides.
    const cache = join(dirname(t.baseline), SCAN_CACHE_NAME);
    after = JSON.parse(execFileSync(process.execPath, [EXTRACT, t.root, '--cache', cache],
      { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch { return null; }
  // Round 2, finding #18a: the map-time sidecar carries the baseline's cycle keys + caller
  // counts, so the before side needs NO JSON.parse of the multi-MB graph and NO
  // normalizeGraph/fileCycles/buildIndex recompute. Seam matrix (all fail-open): graph.json
  // missing -> findTarget already returned null above (no new seam); sidecar missing/stale/
  // corrupt x graph valid -> the legacy path below, sharing the bytes the hash check already
  // read (one read); sidecar valid x graph tampered under a matching stamp -> sidecar consumed —
  // CORRECT: it snapshots map-time truth where the legacy path would parse the tampered file;
  // both corrupt -> null -> silent exit 0 (the hooks.json advisory contract).
  const side = loadHookBaseline(t.baseline);
  let reg;
  if (side.summary) {
    reg = regressionsAgainstSummary(side.summary, after);
  } else {
    let baseline;
    try { baseline = JSON.parse(side.graphBytes != null ? side.graphBytes : readFileSync(t.baseline, 'utf8')); } catch { return null; }
    reg = structuralRegressions(baseline, after);
  }
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
