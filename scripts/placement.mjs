#!/usr/bin/env node
// codeweb placement — where should a NEW symbol live, and does it duplicate something? Given the
// symbols a new function will call (its intended callees), suggest the domain it belongs in (by
// callee gravity) and the most-established file in that domain, and warn if it duplicates an existing
// symbol (by name, and — with --body — by body similarity via find-similar). Attacks sprawl +
// duplication BEFORE a line is committed. Read-only, deterministic. Built on ./lib/graph-ops.mjs.
//
// Usage: node placement.mjs <graph.json> --calls <id|label,...> [--name <label>] [--body <file>] [--json]
// Exit: 0 ok, 2 usage/IO.

import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeGraph, buildIndex, resolveSymbol } from './lib/graph-ops.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const USAGE = 'usage: placement.mjs <graph.json> --calls <id|label,...> [--name <label>] [--body <file>] [--json]';
import { die, emitJson, finish } from './lib/cli.mjs';

const argv = process.argv.slice(2);
let json = false, calls = null, name = null, body = null; const pos = [];
for (let i = 0; i < argv.length; i++) {
  const t = argv[i];
  if (t === '--json') json = true;
  else if (t === '--calls') calls = argv[++i];
  else if (t === '--name') name = argv[++i];
  else if (t === '--body') body = argv[++i];
  else if (!t.startsWith('-')) pos.push(t);
}
const graphPath = pos[0] || (process.env.CODEWEB_WS ? `${process.env.CODEWEB_WS}/graph.json` : null);
if (!graphPath || calls == null) die(USAGE, 2);

const abs = resolve(graphPath);
if (!existsSync(abs)) die(`graph not found: ${abs}`, 2);
let graph;
try { graph = normalizeGraph(JSON.parse(readFileSync(abs, 'utf8'))); }
catch (e) { die(`invalid JSON in ${abs}: ${e.message}`, 2); }

const index = buildIndex(graph);

// resolve --calls entries to node ids; track which entries resolved to nothing
const entries = calls.split(',').map((s) => s.trim()).filter(Boolean);
const resolved = []; const unresolved = [];
for (const e of entries) {
  const ids = resolveSymbol(graph, e);
  if (ids.length) resolved.push(...ids); else unresolved.push(e);
}
const calleeIds = [...new Set(resolved)].sort();
const calleeNodes = calleeIds.map((id) => index.byId.get(id)).filter(Boolean);

// suggested domain = plurality domain of resolved callees (tie -> lexicographically smallest)
let domain = 'unassigned', file = null, rationale;
if (calleeNodes.length) {
  const counts = new Map();
  for (const n of calleeNodes) counts.set(n.domain, (counts.get(n.domain) || 0) + 1);
  domain = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))[0][0];
  // suggested file = most-called file in that domain (highest aggregate callIn over its nodes; from
  // the shared index — not a local recount), tie -> lexicographic. Candidates = files of the resolved
  // callees that live in the chosen domain.
  const candFiles = [...new Set(calleeNodes.filter((n) => n.domain === domain).map((n) => n.file))];
  const fileScore = (f) => graph.nodes.filter((n) => n.file === f).reduce((s, n) => s + (index.callIn.get(n.id)?.size || 0), 0);
  file = candFiles.map((f) => [f, fileScore(f)]).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))[0][0];
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  rationale = `${calleeNodes.length} resolved callee(s); ${top[1]} live in '${domain}' (plurality). Suggest co-locating in '${file}', the most depended-on file in that domain.`;
} else {
  rationale = `none of the ${entries.length} --calls entr${entries.length === 1 ? 'y' : 'ies'} resolved to a known symbol — cannot infer a home from callee gravity (not guessing). Resolve the callees or place by hand.`;
}

// reuse warnings — name (duplication-by-name) and, with --body, body similarity via find-similar.
const reuseWarnings = [];
if (name) {
  for (const n of graph.nodes) if (n.label === name) reuseWarnings.push({ kind: 'name', id: n.id, file: n.file, domain: n.domain });
}
if (body) {
  const r = spawnSync(process.execPath, [join(HERE, 'find-similar.mjs'), abs, '--body', resolve(body), '--k', '50', '--json'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status === 0) {
    try {
      for (const m of JSON.parse(r.stdout).matches) if (m.sim >= 0.35) reuseWarnings.push({ kind: 'body', id: m.id, file: m.file, sim: m.sim, tier: m.tier });
    } catch { /* find-similar produced no parseable output — skip body warnings */ }
  }
  // find-similar exit 2 (source unavailable) -> no body warnings, silently degrade to name-only
}

const payload = { calls: { resolved: calleeIds, unresolved }, domain, file, rationale, reuseWarnings };

if (json) { emitJson(payload); } else {

console.log(`placement: ${calleeIds.length} resolved callee(s)${unresolved.length ? `, ${unresolved.length} unresolved` : ''}`);
console.log(`  domain: ${domain}${file ? `   file: ${file}` : ''}`);
console.log(`  ${rationale}`);
if (reuseWarnings.length) {
  console.log(`  ⚠ ${reuseWarnings.length} possible reuse target(s) — consider reusing instead of writing new:`);
  for (const w of reuseWarnings) console.log(`    [${w.kind}${w.sim != null ? ` ${(w.sim * 100).toFixed(0)}%` : ''}] ${w.id}`);
}
finish();
}
