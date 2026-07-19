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
  let graph; try { graph = normalizeGraph(JSON.parse(readFileSync(graphPath, 'utf8'))); } catch { return null; }
  const text = renderBrief(buildBrief(graph, buildIndex(graph)));
  return `[codeweb] this repo is mapped (${graphPath}).\n${text}`;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  let raw = '';
  try { raw = readFileSync(0, 'utf8'); } catch { /* no stdin */ }
  let msg = null;
  try { msg = preview(raw); } catch { /* fail-open */ }
  if (msg) {
    try {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: msg },
      }) + '\n');
    } catch { /* ignore */ }
  }
  process.exit(0);
}
