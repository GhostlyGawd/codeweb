// Round 2, finding #18a — the post-edit hook's baseline sidecar. structuralRegressions' BEFORE
// side (normalizeGraph + fileCycles + buildIndex over the multi-MB baseline graph, plus its
// JSON.parse) recomputes, per edit, an artifact that cannot have changed since map time. This
// module persists that summary as `hook-baseline.json` beside graph.json (the brief.json sidecar
// convention) and validates it CHEAPLY: the graph.json stamp (size + rounded mtimeMs) first, and
// only on a stamp mismatch the sha1 of graph.json's bytes (an identical-bytes rewrite
// re-validates via `h` — and the bytes read for that check are handed back so a fallback parse
// never reads twice). Everything here is fail-open: loadHookBaseline never throws, and both
// write points (run.mjs after the stage run, refresh.mjs after its atomicWrite) wrap their calls
// in try/catch — a sidecar failure must never fail a map, a refresh, or the hook.

import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { atomicWrite } from './cli.mjs';
import { sha1 } from './hash.mjs';
import { baselineSummary } from './graph-ops.mjs';

export const HOOK_BASELINE_NAME = 'hook-baseline.json';
export const sidecarPathFor = (graphPath) => join(dirname(graphPath), HOOK_BASELINE_NAME);

/** Build the sidecar payload from an in-memory graph + the exact JSON string on disk + its
 *  post-rename mtime. Callers that just wrote the graph pass the string they wrote (free);
 *  run.mjs passes the bytes it read back. */
export function computeHookBaseline(graph, graphString, mtimeMs) {
  const { cycles, callIn } = baselineSummary(graph);
  return {
    version: 1,
    graph: { s: Buffer.byteLength(graphString), m: Math.round(mtimeMs), h: sha1(graphString) },
    cycles,
    callIn,
  };
}

/** Atomic write beside the graph. Throws on IO failure — call sites are best-effort try/catch. */
export function writeHookBaselineBeside(graphPath, baseline) {
  atomicWrite(sidecarPathFor(graphPath), JSON.stringify(baseline));
}

/** Is the sidecar present and stamp-fresh against graph.json? (run.mjs reuse path: rewrite only
 *  when this says no — one graph parse, amortized.) Never throws. */
export function hookBaselineFresh(graphPath) {
  try {
    const side = JSON.parse(readFileSync(sidecarPathFor(graphPath), 'utf8'));
    if (!side || side.version !== 1 || !side.graph) return false;
    const st = statSync(graphPath);
    return st.size === side.graph.s && Math.round(st.mtimeMs) === side.graph.m;
  } catch { return false; }
}

/**
 * Load + validate the sidecar for a graph path. Returns:
 *   { summary }               — valid (stamp matched; graph.json never read), or
 *   { summary, graphBytes }   — valid via the hash re-check (stamp moved, bytes identical), or
 *   { summary: null, graphBytes? } — invalid/missing/corrupt; graphBytes present iff the hash
 *                                    check already read graph.json (share it with the fallback
 *                                    parse — one read). Never throws.
 */
export function loadHookBaseline(graphPath) {
  let side = null;
  try { side = JSON.parse(readFileSync(sidecarPathFor(graphPath), 'utf8')); } catch { return { summary: null }; }
  if (!side || side.version !== 1 || !side.graph || !Array.isArray(side.cycles) || !side.callIn) return { summary: null };
  let st = null;
  try { st = statSync(graphPath); } catch { return { summary: null }; }
  if (st.size === side.graph.s && Math.round(st.mtimeMs) === side.graph.m) {
    return { summary: { cycles: side.cycles, callIn: side.callIn } };
  }
  let graphBytes = null;
  try { graphBytes = readFileSync(graphPath, 'utf8'); } catch { return { summary: null }; }
  if (sha1(graphBytes) === side.graph.h) return { summary: { cycles: side.cycles, callIn: side.callIn }, graphBytes };
  return { summary: null, graphBytes };
}
