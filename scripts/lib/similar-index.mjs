// codeweb similar-index — find-similar's map-time sidecar (perf-quality finding 16). The MCP
// server prescribes `codeweb_find_similar` before every new function an agent writes, and every
// call re-read and re-shingled EVERY non-test function body from disk (0.48s at 10k small
// functions; a repeated multi-second tax inside the agent write loop at realistic body sizes).
// The report stage now persists each candidate's exact K=3 shingle SET (sorted, deterministic)
// plus its size next to graph.json; find-similar serves from it with zero source reads and an
// exact size-ratio precut, falling back to the live path when the stamp mismatches — fail toward
// correctness, results byte-identical either way (sets, not sketches: no probabilistic cut).
// Lexical mode only (the default and the prescribed path); --structural stays live.

import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { isTestFile } from './graph-ops.mjs';
import { shingles, K, capBody } from './shingles.mjs';

export const SIMILAR_SIDECAR = 'similar-index.json';
export const SIMILAR_K = K; // THE shingle size (lib/shingles.mjs, finding 27)
// THE sidecar schema version — ONE const stamped by the builder AND checked by the loader (never two
// literals). Finding #26 bumped 1 -> 2: v1 shingled UNCAPPED bodies while overlap/dup-check/find-similar
// cap at BODY_LINE_CAP, so a v1 sidecar's >400-line sets disagree with the live path. v2 caps at build
// (below), matching every reader; the loader rejects stale v1 sidecars so uncapped sets are never
// served. WS-F #25's writeSidecars calls this builder and inherits v2 with no edit.
export const SIMILAR_VERSION = 2;

/** Build the sidecar object: exact shingle sets for every non-test function/method body (finding #26:
 *  bodies capped at BODY_LINE_CAP so the stored sets equal the live readers' — sidecar ≡ live). */
export function buildSimilarIndex(graph, stamp, reader) {
  const nodes = {};
  for (const n of graph.nodes || []) {
    if (n.kind !== 'function' && n.kind !== 'method') continue;
    if (isTestFile(n.file)) continue;
    const body = reader.bodyOf(n);
    if (body == null) continue;
    const sh = shingles(capBody(body), SIMILAR_K); // cap BEFORE shingling — the overlap/dup-check parity
    nodes[n.id] = { n: sh.size, sh: [...sh].sort() };
  }
  return { version: SIMILAR_VERSION, k: SIMILAR_K, stamp, nodes };
}

/** Load the sidecar beside graphPath iff its stamp matches the graph bytes on disk; else null. */
export function loadSimilarIndex(graphPath) {
  try {
    const st = statSync(graphPath);
    const idx = JSON.parse(readFileSync(join(dirname(graphPath), SIMILAR_SIDECAR), 'utf8'));
    if (!idx || idx.version !== SIMILAR_VERSION || idx.k !== SIMILAR_K) return null; // stale uncapped v1 rejected, never served
    if (!idx.stamp || idx.stamp.graphMtimeMs !== st.mtimeMs || idx.stamp.graphSize !== st.size) return null;
    return idx;
  } catch { return null; }
}
