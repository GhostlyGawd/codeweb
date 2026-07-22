#!/usr/bin/env node
// codeweb diff: compare two graph.json snapshots (before vs after an agent edit) and flag structural
// REGRESSIONS, so a PostToolUse hook / CI step can gate on the exit code. Read-only, deterministic.
// The comparison + #28 rename detection live in ./lib/diff-core.mjs (finding #33) so the MCP
// codeweb_diff fast path serves them IN-PROCESS from the cached graph; this CLI is load → diffGraphs
// → emit, exit codes unchanged.
//
// Usage: node diff.mjs <before.json> <after.json> [--json]
//
// Regression (exit 1) = a NEW dependency cycle, a NEW duplication finding, or an EXISTING symbol that
// lost all its callers. A brand-new uncalled node is reported but is NOT a gate failure (agents
// legitimately add functions before wiring them). Exit: 0 ok, 1 regressions, 2 usage/IO.
//
// Schema note (finding #28): rename detection is O(removed × added), skipped when either side exceeds
// RENAME_CAP nodes. When BOTH sides are non-empty AND one exceeds the cap, an additive
// `nodes.renameCheck = { skipped:true, removed, added, cap }` records the skip (absent otherwise;
// `renamed` stays []) and one text line names it. The MCP codeweb_diff tool consumes this payload;
// hooks gate via graph-ops' structuralRegressions — the additive field breaks neither.

import { basename } from 'node:path';
import { die, emitJson, finish, sign, loadGraph } from './lib/cli.mjs';
import { diffGraphs } from './lib/diff-core.mjs';

const USAGE = 'usage: diff.mjs <before.json> <after.json> [--json]';
if (process.argv.includes('--help') || process.argv.includes('-h')) { console.log(USAGE); process.exit(0); } // #5: every CLI answers --help

const argv = process.argv.slice(2);
let json = false; const paths = [];
for (const t of argv) { if (t === '--json') json = true; else if (!t.startsWith('-')) paths.push(t); }
if (paths.length < 2) die(USAGE, 2);

const before = loadGraph(paths[0]).graph; // Spec E: one truth with every other CLI (loadGraph normalizes + dies on IO)
const after = loadGraph(paths[1]).graph;
const { payload, code } = diffGraphs(before, after, { names: { before: basename(paths[0]), after: basename(paths[1]) } });

if (json) { emitJson(payload, code); } else {
  const n = payload.nodes, renamed = n.renamed || [];
  console.log(`codeweb diff: ${payload.before} -> ${payload.after}`);
  console.log(`  nodes +${n.added.length} -${n.removed.length}${renamed.length ? ` ~${renamed.length} renamed` : ''}   edges +${payload.edges.added} -${payload.edges.removed}   cross-domain Δ${sign(payload.crossDomainEdges.delta)}`);
  if (renamed.length) for (const r of renamed) console.log(`  renamed: ${r.from} -> ${r.to}${r.sim != null ? ` (body ${(r.sim * 100).toFixed(0)}%)` : ''}`);
  if (n.renameCheck) console.log(`  rename detection skipped: ${n.renameCheck.removed} removed / ${n.renameCheck.added} added exceed the ${n.renameCheck.cap}-node cap`);
  console.log(`  cycles +${payload.cycles.added.length} -${payload.cycles.removed.length}   overlaps +${payload.overlaps.added.length} -${payload.overlaps.removed.length}   orphans +${payload.orphans.added.length} -${payload.orphans.removed.length}`);
  if (payload.regressions.length) { console.log('REGRESSIONS (a gate would block):'); for (const r of payload.regressions) console.log(`  x ${r}`); }
  else console.log('  ok — no structural regressions');
  finish(code);
}
