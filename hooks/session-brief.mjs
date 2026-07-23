#!/usr/bin/env node
// codeweb SessionStart hook — the day-one briefing, injected before the first token is spent.
//
// A new session in a mapped repo starts oriented instead of exploring: one ~2KB page (areas,
// load-bearing symbols, entry points, test layout, known issues) from the already-built graph.
// FAIL-OPEN and cheap: unmapped cwd is a silent no-op; any error exits 0 with no output.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { normalizeGraph, buildIndex } from '../scripts/lib/graph-ops.mjs';
import { buildBrief, renderBrief } from '../scripts/lib/brief-core.mjs';
import { loadBriefSidecar } from '../scripts/lib/brief-sidecar.mjs'; // finding 23: serve the map-time render at the boot floor
import { bump, attachActivity } from '../scripts/lib/stats.mjs';
import { checkStaleness } from '../scripts/lib/cli.mjs';           // R3: the change-based nudge
import { loadStaleStamps } from '../scripts/lib/stale-stamps.mjs'; // R3: stamps without the graph parse
import { readHistory } from '../scripts/lib/history.mjs';          // R1/R8: the progression line
import { loadNarration } from '../scripts/lib/narration.mjs';      // AI-IDEAS 3: agent-written notes, labeled

function findGraph(startDir) {
  let dir = resolve(startDir);
  for (let i = 0; i < 40; i++) {
    const cand = join(dir, '.codeweb', 'graph.json');
    if (existsSync(cand)) return cand;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// Returns the briefing text for a SessionStart payload, or null (unmapped / unreadable).
export function preview(raw) {
  let input; try { input = JSON.parse(raw); } catch { input = {}; }
  const cwd = input?.cwd || process.cwd();
  const graphPath = findGraph(cwd);
  if (!graphPath) return null;
  // finding 23: the brief is a pure function of the graph — the report stage pre-rendered it, so
  // the common path is stat + one small read instead of parse + index of the whole graph (97ms on
  // this repo, 310-328ms at 17k nodes). Stamp mismatch (graph rebuilt since) -> the parse path.
  let payload = loadBriefSidecar(graphPath);
  let staleMeta = null; // {root, sources, dirs} for the R3 change check, from whichever path ran
  if (!payload) {
    let graph; try { graph = normalizeGraph(JSON.parse(readFileSync(graphPath, 'utf8'))); } catch { return null; }
    payload = buildBrief(graph, buildIndex(graph));
    staleMeta = { root: graph.meta?.root, sources: graph.meta?.sources, dirs: graph.meta?.dirs };
  } else {
    staleMeta = loadStaleStamps(graphPath); // sidecar path: stamps sidecar keeps the boot floor
  }
  const brief = attachActivity(payload, graphPath);
  // R3: the change-based nudge — the sweep is stat-only (12-17ms at 5k files), fail-open.
  try { if (staleMeta?.sources) { const v = checkStaleness({ meta: staleMeta }); if (v) brief.stale = v; } } catch { /* nudge is best-effort */ }
  // R1/R8: the progression line — one small file read.
  try { const h = readHistory(graphPath, 4); if (h.length >= 2) brief.history = h; } catch { /* memory is best-effort */ }
  // AI-IDEAS Idea 3: agent-written narration, provenance-labeled by the renderer; stale -> absent.
  try { const n = loadNarration(graphPath); if (n) brief.narration = n; } catch { /* sidecar is best-effort */ }
  const text = renderBrief(brief);
  // ACTIVATION A7: an EMPTY map must not be announced as "mapped" — renderBrief already leads
  // with the empty verdict, so the prefix only adds the path.
  if (!brief.size || brief.size.symbols === 0) return `[codeweb] ${text}\n(map file: ${graphPath})`;
  return `[codeweb] this repo is mapped (${graphPath}).\n${text}`;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  let raw = '';
  try { raw = readFileSync(0, 'utf8'); } catch { /* no stdin */ }
  let msg = null;
  try { msg = preview(raw); } catch { /* fail-open */ }
  if (msg) {
    try { const input = JSON.parse(raw); bump(findGraph(input?.cwd || process.cwd()), 'briefInjected'); } catch { /* receipt only */ }
    try {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: msg },
      }) + '\n');
    } catch { /* ignore */ }
  }
  process.exit(0);
}
