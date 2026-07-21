#!/usr/bin/env node
// codeweb refresh (F0) — re-extract a graph's nodes+edges from current disk so an agent's mid-task
// queries (impact / context-pack / callers) reflect the working tree, not a stale snapshot. Uses the
// extractor's per-file scan cache (only changed files are re-scanned), re-attaches each surviving
// node's domain by id, and drops overlaps (they need the full pipeline; not needed by the query
// tools). meta is preserved. Read-only over the target source; never executes it.
//
// Usage: node refresh.mjs <graph.json> [--cache <path>] [--json]
// Exit: 0 ok, 2 usage / missing meta.root.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const USAGE = 'usage: refresh.mjs <graph.json> [--cache <path>] [--json]';
if (process.argv.includes('--help') || process.argv.includes('-h')) { console.log(USAGE); process.exit(0); } // #5: every CLI answers --help
import { die, emitJson, finish, atomicWrite } from './lib/cli.mjs';

const argv = process.argv.slice(2);
let json = false, cache = null; const pos = [];
for (let i = 0; i < argv.length; i++) {
  const t = argv[i];
  if (t === '--json') json = true;
  else if (t === '--cache') cache = argv[++i];
  else if (!t.startsWith('-')) pos.push(t);
}
const graphPath = pos[0];
if (!graphPath) die(USAGE, 2);

const abs = resolve(graphPath);
if (!existsSync(abs)) die(`graph not found: ${abs}`, 2);
let graph;
try { graph = JSON.parse(readFileSync(abs, 'utf8')); }
catch (e) { die(`invalid JSON in ${abs}: ${e.message}`, 2); }

const root = graph.meta && graph.meta.root;
if (!root || !existsSync(root)) die(`cannot refresh: graph.meta.root is missing or not on disk (got ${root || 'none'}) — refresh re-extracts from the recorded target root`, 2);

// re-extract (cached) from the recorded root; the extractor emits the fragment on stdout
const cachePath = cache || join(dirname(abs), 'extract-cache.json'); // default cache beside the graph
const r = spawnSync(process.execPath, [join(HERE, 'extract-symbols.mjs'), root, '--cache', cachePath], { encoding: 'utf8', maxBuffer: 1 << 28 });
if (r.status !== 0) die(`extract failed: ${(r.stderr || '').trim() || r.status}`, 2);
let fresh;
try { fresh = JSON.parse(r.stdout); }
catch (e) { die(`extractor produced invalid JSON: ${e.message}`, 2); }

// re-attach each surviving node's domain by id (domains[] summaries kept; node domains carried over)
const oldDomainById = new Map(graph.nodes.filter((n) => n.domain && n.domain !== 'unassigned').map((n) => [n.id, n.domain]));
let reattached = 0;
for (const n of fresh.nodes) { const d = oldDomainById.get(n.id); if (d) { n.domain = d; reattached++; } else if (n.domain == null) n.domain = ''; }

const before = { nodes: graph.nodes.length, edges: graph.edges.length };
const updated = {
  meta: { ...graph.meta, ...fresh.meta, target: graph.meta.target || fresh.meta.target },
  nodes: fresh.nodes,
  edges: fresh.edges,
  domains: graph.domains || [],   // domain summaries preserved (node assignments re-attached above)
  overlaps: [],                   // stale after an edit — recompute via the full pipeline when needed
};
// #13: node spans just moved — recorded coverage no longer maps; drop it honestly (a stale
// covered flag is worse than none) and say how to get it back.
const hadCoverage = !!updated.meta.coverage;
if (hadCoverage) delete updated.meta.coverage;
atomicWrite(abs, JSON.stringify(updated)); // finding 3: a SIGTERM mid-write (MCP's 60s timeout) must not truncate the graph

const payload = {
  graph: abs, root,
  before, after: { nodes: updated.nodes.length, edges: updated.edges.length },
  domainsReattached: reattached, scanned: /scanned (\d+)/.exec(r.stderr)?.[1] ?? null,
};
if (hadCoverage) payload.note = 'coverage annotations dropped (spans changed) — re-run scripts/coverage.mjs with a fresh report';
if (json) { emitJson(payload); } else {
console.log(`codeweb refresh: ${root}`);
console.log(`  nodes ${before.nodes} -> ${updated.nodes.length}   edges ${before.edges} -> ${updated.edges.length}   domains re-attached ${reattached}`);
console.log(`  overlaps dropped (run the full pipeline to recompute). scanned ${payload.scanned ?? '?'} file(s).`);
finish();
}
