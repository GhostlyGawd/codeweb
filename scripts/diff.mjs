#!/usr/bin/env node
// codeweb diff: compare two graph.json snapshots (before vs after an agent edit) and flag structural
// REGRESSIONS, so a PostToolUse hook / CI step can gate on the exit code. Read-only, deterministic.
// The comparison + #28 rename detection live in ./lib/diff-core.mjs (finding #33) so the MCP
// codeweb_diff fast path serves them IN-PROCESS from the cached graph; this CLI is load → diffGraphs
// → emit, exit codes unchanged.
//
// Usage: node diff.mjs <before.json> <after.json> [--json]
//
// Regression (exit 1) = a NEW dependency cycle, a NEW confirmed duplication, or an EXISTING
// non-exported symbol newly orphaned (exported symbols are exempt HERE — the edit-time preflights
// flag those too; the payload's verdict.check names which semantics ran). A brand-new uncalled
// node is reported but is NOT a gate failure (agents legitimately add functions before wiring
// them). Exit: 0 ok, 1 regressions, 2 usage/IO.
//
// Schema note (finding #28): rename detection is O(removed × added), skipped when either side exceeds
// RENAME_CAP nodes. When BOTH sides are non-empty AND one exceeds the cap, an additive
// `nodes.renameCheck = { skipped:true, removed, added, cap }` records the skip (absent otherwise;
// `renamed` stays []) and one text line names it. The MCP codeweb_diff tool consumes this payload;
// hooks gate via graph-ops' structuralRegressions — the additive field breaks neither.

import { basename, dirname, join, resolve } from 'node:path';
import { existsSync, realpathSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { die, emitJson, finish, sign, loadGraph, parseArgs } from './lib/cli.mjs';
import { diffGraphs } from './lib/diff-core.mjs';
import { normalizeGraph } from './lib/graph-ops.mjs';

const USAGE = 'usage: diff.mjs <before.json|baseline|prev> <after.json> [--refresh] [--json]';

// finding #39: THE flag loop (lib/cli.mjs parseArgs) — one unknown-flag policy (reject with usage,
// exit 2; --help prints usage, exit 0). Replaces a no-else hand-roll that silently ignored typos.
const { opts: { json, refresh }, pos: paths } = parseArgs(process.argv.slice(2), {
  usage: USAGE,
  flags: { json: { type: 'bool', default: false }, refresh: { type: 'bool', default: false } },
});
if (paths.length < 2) die(USAGE, 2);

const beforeArg = paths[0];
if (['baseline', 'prev'].includes(beforeArg)) paths[0] = join(dirname(resolve(paths[1])), `graph.${beforeArg}.json`);
if (beforeArg === 'baseline' && !existsSync(paths[0])) die('no pre-edit baseline — run refresh.mjs <graph.json> --baseline BEFORE editing (MCP: codeweb_refresh {baseline:true}); edited source cannot reconstruct a lost baseline', 2);
// Load BEFORE any mutation. Failure must not replace the live graph or the baseline.
let before;
let verification;
if (refresh) {
  // Parse and fingerprint the SAME bytes, so a concurrent baseline replacement
  // cannot make the digest describe a different graph from the one compared.
  let beforeBytes;
  try {
    beforeBytes = readFileSync(paths[0]);
    const raw = JSON.parse(beforeBytes);
    if (!Array.isArray(raw?.nodes) || !Array.isArray(raw?.edges)) {
      throw new Error('baseline must contain nodes and edges arrays');
    }
    before = normalizeGraph(raw);
  }
  catch (e) { die(`cannot read baseline: ${e.message}`, 2); }
  const current = loadGraph(paths[1]);
  if (realpathSync(paths[0]) === realpathSync(current.abs)) die('before and after must be separate files when using --refresh', 2);
  if (!before.meta?.root || !current.graph.meta?.root || resolve(before.meta.root) !== resolve(current.graph.meta.root)) die('baseline and after graph must describe the same source root before refreshing', 2);
  const beforeHash = createHash('sha256').update(beforeBytes).digest('hex');
  const r = spawnSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), 'refresh.mjs'), current.abs, '--json'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0) die(`verification refresh failed: ${(r.stderr || '').trim() || r.error?.message || r.status}`, 2);
  // Refuse a competing explicit rebaseline (e.g. another CLI process), rather than
  // labeling the originally loaded graph with a different baseline's current bytes.
  let baselineUnchanged = false;
  try { baselineUnchanged = createHash('sha256').update(readFileSync(paths[0])).digest('hex') === beforeHash; } catch { /* removed baseline is also a change */ }
  if (!baselineUnchanged) die('baseline changed during verification — retry with a stable pre-edit baseline', 2);
  verification = { before: resolve(paths[0]), beforeSha256: beforeHash, after: current.abs, refreshed: true };
} else before = loadGraph(paths[0]).graph;
const after = loadGraph(paths[1]).graph;
const { payload, code } = diffGraphs(before, after, { names: { before: basename(paths[0]), after: basename(paths[1]) } });
if (verification) payload.verification = verification;

if (json) { emitJson(payload, code); } else {
  const n = payload.nodes, renamed = n.renamed || [];
  console.log(`codeweb diff: ${payload.before} -> ${payload.after}`);
  console.log(`  nodes +${n.added.length} -${n.removed.length}${renamed.length ? ` ~${renamed.length} renamed` : ''}   edges +${payload.edges.added} -${payload.edges.removed}   cross-domain Δ${sign(payload.crossDomainEdges.delta)}`);
  if (renamed.length) for (const r of renamed) console.log(`  renamed: ${r.from} -> ${r.to}${r.sim != null ? ` (body ${(r.sim * 100).toFixed(0)}%)` : ''}`);
  if (n.renameCheck) console.log(`  rename detection skipped: ${n.renameCheck.removed} removed / ${n.renameCheck.added} added exceed the ${n.renameCheck.cap}-node cap`);
  console.log(`  cycles +${payload.cycles.added.length} -${payload.cycles.removed.length}   overlaps +${payload.overlaps.added.length} -${payload.overlaps.removed.length}   orphans +${payload.orphans.added.length} -${payload.orphans.removed.length}`);
  if (payload.regressions.length) { console.log('REGRESSIONS (a gate would block):'); for (const r of payload.regressions) console.log(`  x ${r}`); }
  else console.log('  ok — no structural regressions');
  for (const step of payload.analysis.nextSteps) console.log(`  analysis: ${step}`);
  finish(code);
}
