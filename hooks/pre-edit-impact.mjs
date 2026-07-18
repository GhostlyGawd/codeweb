#!/usr/bin/env node
// codeweb PreToolUse hook — one line of blast-radius awareness BEFORE an edit lands.
//
// The post-edit gate catches a regression after the fact; this is the missing other half: when the
// agent is about to edit a file in a `.codeweb`-mapped target, surface how load-bearing that file
// is (symbols + in-repo callers + the top symbol) so contract-changing edits get checked with
// codeweb_impact/codeweb_context FIRST. One line, advisory, never blocks.
//
// FAIL-OPEN and cheap: any parse/read problem exits 0 silently; unmapped targets are a no-op; the
// whole check is one JSON parse + an in-memory count (~50-100ms on a 3k-symbol graph).

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXPLAIN = join(HERE, '..', 'scripts', 'explain.mjs');
const SRC_RE = /\.(js|mjs|cjs|jsx|ts|tsx|py|rs|go|java|cs)$/;

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

// Returns the one-line advisory for an edit payload, or null (not mapped / not source / no signal).
export function preview(raw) {
  let input; try { input = JSON.parse(raw); } catch { return null; }
  const fp = input?.tool_input?.file_path || input?.tool_input?.filePath;
  if (!fp || !SRC_RE.test(fp)) return null;
  const t = findTarget(fp);
  if (!t) return null;
  let graph; try { graph = JSON.parse(readFileSync(t.baseline, 'utf8')); } catch { return null; }
  const rel = relative(t.root, resolve(fp)).replace(/\\/g, '/');
  const nodes = (graph.nodes || []).filter((n) => n.file === rel && n.kind !== 'module');
  if (!nodes.length) return null;
  const inCount = new Map();
  for (const e of graph.edges || []) {
    if (e.kind !== 'call' && e.kind !== 'import' && e.kind !== 'ref') continue;
    inCount.set(e.to, (inCount.get(e.to) || 0) + 1);
  }
  let total = 0, top = null;
  for (const n of nodes) {
    const c = inCount.get(n.id) || 0;
    total += c;
    if (!top || c > top.c) top = { label: n.label, c };
  }
  if (total === 0) return null; // nothing depends on this file — stay quiet
  let msg = `[codeweb] editing ${rel}: ${nodes.length} symbol(s), ${total} in-repo dependent edge(s)` +
    (top && top.c > 0 ? ` (most depended-on: ${top.label} ×${top.c})` : '') + '.';
  // AMBIENT context: don't just point at the tools — inject the ~1KB explain card for the file's
  // most-depended-on symbol, so the blast radius arrives without the agent having to ask. This is
  // the attack on the edit-quality null: awareness with zero discipline required. Fail-open.
  if (top && top.c > 0) {
    try {
      const topNode = nodes.slice().sort((a, b) => (inCount.get(b.id) || 0) - (inCount.get(a.id) || 0))[0];
      const r = execFileSync(process.execPath, [EXPLAIN, t.baseline, topNode.id, '--json'], { encoding: 'utf8', timeout: 8000, maxBuffer: 1 << 22 });
      const card = JSON.parse(r).cards?.[0];
      if (card) {
        msg += `\n  ${card.summary}`;
        if (card.topCallers?.length) msg += `\n  top callers: ${card.topCallers.slice(0, 4).join(', ')}`;
        if (card.tests?.length) msg += `\n  tests: ${card.tests.slice(0, 2).join(', ')}`;
      }
    } catch { /* card is a bonus, never a blocker */ }
  }
  msg += `\n  → codeweb_context for a bounded edit window; codeweb_impact for the full blast radius.`;
  return msg;
}

// Execute as a hook only when run directly (not when imported by tests).
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  let raw = '';
  try { raw = readFileSync(0, 'utf8'); } catch { /* no stdin */ }
  let msg = null;
  try { msg = preview(raw); } catch { /* fail-open */ }
  if (msg) {
    try {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', additionalContext: msg },
      }) + '\n');
    } catch { /* ignore */ }
  }
  process.exit(0); // ALWAYS non-blocking
}
