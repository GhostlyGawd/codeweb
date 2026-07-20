// codeweb index-lite — the pre-edit hook's slim sidecar (Spec P, docs/specs/fastpath-decision.md).
// At 16k symbols the hook's graph path costs ~350ms PER EDIT: a 13.5MB graph.json parse plus an
// explain.mjs subprocess that parses it again. The report stage writes this sidecar next to
// graph.json at map time; the hook serves from it in ~10ms and falls back to the graph path when
// the stamp mismatches (graph rebuilt/annotated after the sidecar) — fail toward correctness.
//
// Parity contract: everything stored here is computed by the SAME code the graph path runs —
// per-file counts replicate the hook's own aggregation loop; the top symbol's card comes from
// explain-core's buildCards (the single card assembler). tests/hook-sidecar.test.mjs pins
// byte-identical hook output between the two paths.

import { buildIndex } from './graph-ops.mjs';
import { buildCards } from './explain-core.mjs';

export const SIDECAR_NAME = 'index-lite.json';

/**
 * Build the sidecar object for a graph. `stamp` identifies the exact graph.json bytes this was
 * derived from ({ graphMtimeMs, graphSize }); the hook compares it against a cheap statSync —
 * never a parse — to decide freshness.
 */
export function buildIndexLite(graph, stamp, reader = () => null) {
  // The hook's exact aggregation: non-module nodes per file; in-edges over call/import/ref.
  const inCount = new Map();
  for (const e of graph.edges || []) {
    if (e.kind !== 'call' && e.kind !== 'import' && e.kind !== 'ref') continue;
    inCount.set(e.to, (inCount.get(e.to) || 0) + 1);
  }
  const byFile = new Map();
  for (const n of graph.nodes || []) {
    if (n.kind === 'module') continue;
    if (!byFile.has(n.file)) byFile.set(n.file, []);
    byFile.get(n.file).push(n);
  }
  const index = buildIndex(graph);
  const files = {};
  for (const [file, nodes] of [...byFile.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    let total = 0, top = null;
    for (const n of nodes) {
      const c = inCount.get(n.id) || 0;
      total += c;
      if (!top || c > top.c) top = { label: n.label, c };
    }
    if (total === 0) continue; // hook stays quiet for these — absence in a FRESH sidecar means "no signal"
    const entry = { symbols: nodes.length, total, top };
    if (top && top.c > 0) {
      // The card the hook would have fetched via the explain subprocess — same sort, same builder.
      const topNode = nodes.slice().sort((a, b) => (inCount.get(b.id) || 0) - (inCount.get(a.id) || 0))[0];
      const card = buildCards(graph, index, reader, [topNode.id])[0];
      entry.card = { summary: card.summary, topCallers: card.topCallers, tests: card.tests };
      entry.topId = topNode.id;
      const callerFiles = [...new Set((card.topCallers || [])
        .map((id) => id.slice(0, id.lastIndexOf(':')))
        .filter((f) => f && f !== file))];
      if (callerFiles.length) entry.cardFiles = callerFiles;
    }
    files[file] = entry;
  }
  return { version: 1, stamp, files };
}
