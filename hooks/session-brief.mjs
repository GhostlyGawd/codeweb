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
  if (!payload) {
    let graph; try { graph = normalizeGraph(JSON.parse(readFileSync(graphPath, 'utf8'))); } catch { return null; }
    payload = buildBrief(graph, buildIndex(graph));
  }
  const brief = attachActivity(payload, graphPath);
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
