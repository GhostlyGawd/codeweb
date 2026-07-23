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

import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { structuralRegressions, regressionsAgainstSummary } from '../scripts/lib/graph-ops.mjs';
import { loadHookBaseline } from '../scripts/lib/hook-baseline.mjs';
import { bump, correlateEdit } from '../scripts/lib/stats.mjs';
import { atomicWrite } from '../scripts/lib/cli.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXTRACT = join(HERE, '..', 'scripts', 'extract-symbols.mjs');
import { SRC_RE, SCAN_CACHE_NAME, findTarget } from '../scripts/lib/cli.mjs'; // Spec E: one truth (was a stale local copy missing five languages)


// Incremental: THE per-file scan cache (finding 17: one shared name — the hook used its own
// `scan-cache.json` and always ran cold after a map). Same name, same engine flags as run.mjs ->
// the hook rides the map-time warm cache and the stamp tier: a one-file edit costs one stat sweep +
// one file scan (docs/specs/hook-fastpath-floor.md).
// Round 2, finding #18b (WS-H): the child spawn of the extractor is replaced by an IN-PROCESS
// runExtract call (extract-symbols' import is side-effect-free since #40's T-40.3), killing the
// child node boot + the fragment stringify(child)+JSON.parse(hook) across the process boundary.
// The symbol-set delta/splice against the #18a baseline fragment IS runExtract's own machinery
// (WS-D #17's name-delta path) riding the warm SCAN_CACHE_NAME cache — the hook adds ZERO splice/
// invalidation logic of its own, so the in-process fire runs exactly what IE-EQUIVALENCE proved
// byte-identical. (The cache JSON.parse is NOT eliminated — it moves into this process.)
function extractViaSpawn(root, cache) {
  // finding 18/22: the fragment streams back on STDOUT — no pid-named temp file leak.
  return JSON.parse(execFileSync(process.execPath, [EXTRACT, root, '--cache', cache],
    { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }));
}
// Crash-safety ladder (fail-open, observable): CODEWEB_HOOK_INPROC=0 forces the spawn (the rollback
// lever); any throw from the lazy import or runExtract -> ONE spawn attempt, bumped so the
// divergence is ledger-visible, then (if that throws too) the caller's catch returns null silently.
async function extractAfter(root, cache, baseline) {
  if (process.env.CODEWEB_HOOK_INPROC === '0') return extractViaSpawn(root, cache); // rollback lever
  try {
    // LAZY import AFTER the findTarget guard — an inert fire must pay nothing (#18a's boot floor).
    const { runExtract } = await import('../scripts/extract-symbols.mjs');
    return (await runExtract({ path: root, cache })).fragment;
  } catch {
    try { bump(baseline, 'hookInprocFallbacks'); } catch { /* stats best-effort */ } // divergence visible
    return extractViaSpawn(root, cache); // one fail-open spawn (may throw -> caller returns null)
  }
}

// Returns { root, newCycles, lostCallers } when an edit introduces a structural regression, else null.
export async function check(raw) {
  let input; try { input = JSON.parse(raw); } catch { return null; }
  const fp = input?.tool_input?.file_path || input?.tool_input?.filePath;
  if (!fp || !SRC_RE.test(fp)) return null;
  const t = findTarget(fp);
  if (!t) return null;
  const cache = join(dirname(t.baseline), SCAN_CACHE_NAME);
  let after;
  try { after = await extractAfter(t.root, cache, t.baseline); } catch { return null; }
  if (!after) return null;
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

// RETENTION R4: surface each regression ONCE per baseline. The old behavior re-flagged the same
// accepted/deferred tradeoff on every subsequent edit to the target, indefinitely — and repeated
// identical warnings train dismissal, killing the channel for the one real catch. A small
// sidecar (.codeweb/flagged.json) records the flagged keys against the baseline graph's
// mtime+size stamp; a re-map or refresh changes the stamp and resets the memory. Fail-open in
// the NOISY direction: a sidecar error keeps the warning (never hides a fresh regression).
export function dedupeFlags(baselinePath, out) {
  try {
    const st = statSync(baselinePath);
    const cur = { m: st.mtimeMs, s: st.size };
    const p = join(dirname(baselinePath), 'flagged.json');
    let doc = null; try { doc = JSON.parse(readFileSync(p, 'utf8')); } catch { /* first flag */ }
    const known = doc && doc.baseline?.m === cur.m && doc.baseline?.s === cur.s ? new Set(doc.keys || []) : new Set();
    const keyOfCycle = (c) => 'cycle:' + [...c].sort().join('|');
    const keys = [...out.newCycles.map(keyOfCycle), ...out.lostCallers.map((id) => 'lost:' + id)];
    const fresh = new Set(keys.filter((k) => !known.has(k)));
    for (const k of keys) known.add(k);
    atomicWrite(p, JSON.stringify({ baseline: cur, keys: [...known].sort() }));
    if (!fresh.size) return null; // everything here was already surfaced against this baseline
    return {
      ...out,
      newCycles: out.newCycles.filter((c) => fresh.has(keyOfCycle(c))),
      lostCallers: out.lostCallers.filter((id) => fresh.has('lost:' + id)),
    };
  } catch { return out; }
}

function format(out) {
  const lines = [`[codeweb] ⚠ structural regression after edit (target: ${out.root}):`];
  for (const c of out.newCycles) lines.push(`  new dependency cycle: ${c.join(' <-> ')}`);
  for (const id of out.lostCallers) lines.push(`  ${id} lost all callers (now uncalled)`);
  lines.push('  -> run `node scripts/diff.mjs` or re-run /codeweb for the full delta.');
  return lines.join('\n');
}

// Execute as a hook only when run directly (not when imported by tests). check() is async now
// (#18b's lazy in-process extraction), so the guard runs it in an async IIFE and awaits it.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  (async () => {
    let raw = '';
    try { raw = readFileSync(0, 'utf8'); } catch { /* no stdin */ }
    let out = null;
    try { out = await check(raw); } catch { /* fail-open */ }
    try {
      const fp = JSON.parse(raw)?.tool_input?.file_path || JSON.parse(raw)?.tool_input?.filePath;
      const t = fp && SRC_RE.test(fp) && findTarget(fp);
      // R4: dedupe BEFORE the ledger so regressionsFlagged counts fresh flags, not repeats.
      if (out && t) { try { out = dedupeFlags(t.baseline, out); } catch { /* keep the warning */ } }
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
  })();
}
