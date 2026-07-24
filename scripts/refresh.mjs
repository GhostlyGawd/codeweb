#!/usr/bin/env node
// codeweb refresh (F0) — re-extract a graph's nodes+edges from current disk so an agent's mid-task
// queries (impact / context-pack / callers) reflect the working tree, not a stale snapshot. Uses the
// extractor's per-file scan cache (only changed files are re-scanned), re-attaches each surviving
// node's domain by id, and drops overlaps (they need the full pipeline; not needed by the query
// tools). meta is preserved. Read-only over the target source; never executes it.
//
// Usage: node refresh.mjs [graph.json] [--cache <path>] [--json]   (or set CODEWEB_WS, or run from a mapped repo)
// Exit: 0 ok, 2 usage / missing meta.root.

import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const USAGE = 'usage: refresh.mjs [graph.json] [--cache <path>] [--json]   (or set CODEWEB_WS, or run from a mapped repo)';
import { die, emitJson, finish, atomicWrite, SCAN_CACHE_NAME, loadGraph, parseArgs } from './lib/cli.mjs';

// finding 24: THE flag loop (lib/cli.mjs parseArgs) — one unknown-flag policy, --help included.
const { opts, pos } = parseArgs(process.argv.slice(2), {
  usage: USAGE,
  flags: { json: { type: 'bool', default: false }, cache: { type: 'string', default: null } },
});
const { json, cache } = opts;

// API F7 (COPY.md #9): refresh required a positional and hand-rolled a weaker error — no
// CODEWEB_WS, no walk-up. It now uses THE one loader (arg -> env -> nearest .codeweb above cwd,
// shared errors). The graph is re-read RAW below: the written bytes must come from the on-disk
// JSON + the fresh fragment, never from normalizeGraph's in-memory back-fills (its mutation runs
// post-write for the sidecars — see the #25 note below).
const { abs } = loadGraph(pos[0], { usage: USAGE });
let graph;
try { graph = JSON.parse(readFileSync(abs, 'utf8')); }
catch (e) { die(`invalid JSON in ${abs}: ${e.message}`, 2); }

const root = graph.meta && graph.meta.root;
if (!root || !existsSync(root)) die(`cannot refresh: graph.meta.root is missing or not on disk (got ${root || 'none'}) — refresh re-extracts from the recorded target root`, 2);

// re-extract (cached) from the recorded root; the extractor emits the fragment on stdout
const cachePath = cache || join(dirname(abs), SCAN_CACHE_NAME); // finding 17: THE shared cache — refresh used its own extract-cache.json and ran cold after every map
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
  // RETENTION R2: the overlap drop is STAMPED, never silent — brief/report render "not recounted
  // since refresh" instead of a false "0 findings" (the human's reason to return, zeroed by the
  // product's own best freshness feature). A full map rebuilds meta from the fragment, clearing it.
  meta: { ...graph.meta, ...fresh.meta, target: graph.meta.target || fresh.meta.target, overlapsDroppedAt: new Date().toISOString() },
  nodes: fresh.nodes,
  edges: fresh.edges,
  domains: graph.domains || [],   // domain summaries preserved (node assignments re-attached above)
  overlaps: [],                   // stale after an edit — recompute via the full pipeline when needed
};
// #13: node spans just moved — recorded coverage no longer maps; drop it honestly (a stale
// covered flag is worse than none) and say how to get it back.
const hadCoverage = !!updated.meta.coverage;
if (hadCoverage) delete updated.meta.coverage;
const updatedJson = JSON.stringify(updated);
atomicWrite(abs, updatedJson); // finding 3: a SIGTERM mid-write (MCP's 60s timeout) must not truncate the graph
// Round 2, finding #18a: refresh re-baselines the post-edit hook's sidecar — `h`/`s` from the
// in-memory string just written (free), `m` from a post-rename stat. Best-effort by contract.
try {
  const { computeHookBaseline, writeHookBaselineBeside } = await import('./lib/hook-baseline.mjs');
  const { statSync } = await import('node:fs');
  writeHookBaselineBeside(abs, computeHookBaseline(updated, updatedJson, statSync(abs).mtimeMs));
} catch { /* sidecar failure must never fail a refresh */ }

// Round 2, finding #25: rebuild the map-time sidecar TRIO (brief/index-lite/similar-index) beside the
// just-written graph so the prescribed post-edit refresh no longer kills the hook / find_similar fast
// paths until the next full map. Write order is graph → hook-baseline (WS-D, above) → trio.
// normalizeGraph runs POST-write so its mutation can't leak into the graph bytes; the sidecar content
// then equals what each consumer's fallback computes from the on-disk graph (that parity is the
// contract). writeSidecars is best-effort (never throws). Extraction stays spawned (in-process is #40).
let sidecars = [];
try {
  const { writeSidecars } = await import('./lib/sidecars.mjs');
  const { normalizeGraph } = await import('./lib/graph-ops.mjs');
  sidecars = writeSidecars(abs, normalizeGraph(updated));
} catch { /* sidecar failure must never fail a refresh */ }

const payload = {
  graph: abs, root,
  before, after: { nodes: updated.nodes.length, edges: updated.edges.length },
  domainsReattached: reattached, scanned: /scanned (\d+)/.exec(r.stderr)?.[1] ?? null,
  sidecars,
};
if (hadCoverage) payload.note = 'coverage annotations dropped (spans changed) — re-run scripts/coverage.mjs with a fresh report';
if (json) { emitJson(payload); } else {
console.log(`codeweb refresh: ${root}`);
console.log(`  nodes ${before.nodes} -> ${updated.nodes.length}   edges ${before.edges} -> ${updated.edges.length}   domains re-attached ${reattached}`);
console.log(`  overlaps dropped (run the full pipeline to recompute). scanned ${payload.scanned ?? '?'} file(s).`);
finish();
}
