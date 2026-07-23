// codeweb sidecar writer (round 2, finding #25) — THE one place the map-time trio (brief.json,
// index-lite.json, similar-index.json) is written, stamped against the just-written graph.json.
// build-report writes them at map time; refresh now REWRITES them after a mid-task re-extract. Before
// this, `refresh.mjs` rewrote graph.json but left all three sidecars stale until the next full map —
// so the session-brief / pre-edit / find_similar fast paths lost their floor for the rest of the
// session (63–81 ms → 106–135 ms hooks; find_similar --body 605 → 1,104 ms) the moment an agent ran
// the prescribed post-edit refresh.
//
// Stamps convention (the one rule): every sidecar stamps against ONE statSync of the just-written
// graph.json and is written strictly AFTER the graph's rename lands. Consequence, stated as a
// property: a crash/SIGKILL anywhere between the graph write and the last sidecar leaves only stamp-
// MISMATCHED sidecars → every loader returns null → live paths; a fresh-stamped-wrong-content sidecar
// is impossible by ordering. hook-baseline.json (WS-D) is a FOURTH sidecar with its own stamp shape,
// written by its own lib — not reshaped here (the unification is semantic, not byte-wise).
//
// Best-effort by contract: writeSidecars NEVER throws (a sidecar failure must not fail the map or
// refresh that calls it). Version fields are owned by each sidecar's lib (buildIndexLite,
// buildSimilarIndex stamp their own version; brief keeps the caller-written v1 the loader checks) —
// never a fresh literal here for the ones a lib owns.

import { existsSync, statSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { sourceReader, atomicWrite } from './cli.mjs';
import { buildIndex } from './graph-ops.mjs';
import { buildBrief } from './brief-core.mjs';
import { buildIndexLite, SIDECAR_NAME } from './index-lite.mjs';
import { buildSimilarIndex, SIMILAR_SIDECAR } from './similar-index.mjs';
import { BRIEF_SIDECAR } from './brief-sidecar.mjs';
import { STALE_SIDECAR } from './stale-stamps.mjs'; // RETENTION R3: change-nudge without the graph parse

/**
 * Write the map-time sidecar trio beside a just-written graph.json, all stamped against ONE stat of
 * that graph. `graph` must be the SAME (normalized) object the on-disk bytes serialize from — the
 * sidecar content must equal what each consumer's fallback computes from the on-disk graph (the
 * parity that is the correctness contract). brief + index-lite are pure functions of the graph and
 * are always written. similar-index is rebuilt when meta.root is readable (via the CURRENT
 * buildSimilarIndex — inherits its v2 capped-shingle schema with no edit here), else REMOVED (force,
 * ENOENT-ignored) so staleness is explicit (loadSimilarIndex → null → the live path) rather than a
 * silently stale file. Returns the sidecars touched, e.g. ['brief','index-lite','similar-index'] or
 * ['brief','index-lite','similar-index removed']. Never throws.
 */
export function writeSidecars(absGraphPath, graph) {
  const written = [];
  try {
    const dir = dirname(absGraphPath);
    const st = statSync(absGraphPath); // ONE stat — the trio share this exact stamp
    const stamp = { graphMtimeMs: st.mtimeMs, graphSize: st.size };
    const reader = sourceReader(graph.meta?.root);
    // brief.json — the SessionStart payload; version literal is the loader's contract (brief-sidecar.mjs).
    atomicWrite(join(dir, BRIEF_SIDECAR), JSON.stringify({ version: 1, stamp, brief: buildBrief(graph, buildIndex(graph)) }));
    written.push('brief');
    // index-lite.json — the pre-edit hook's slim sidecar (its version is owned by buildIndexLite).
    atomicWrite(join(dir, SIDECAR_NAME), JSON.stringify(buildIndexLite(graph, stamp, reader)));
    written.push('index-lite');
    // stale-stamps.json (R3) — {root, sources, dirs} so the SessionStart hook can run the
    // change-based staleness sweep at the sidecar boot floor (never parsing the multi-MB graph).
    atomicWrite(join(dir, STALE_SIDECAR), JSON.stringify({ version: 1, stamp, root: graph.meta?.root || null, sources: graph.meta?.sources || null, dirs: graph.meta?.dirs || null }));
    written.push('stale-stamps');
    // similar-index.json — find-similar's shingle sets (version owned by buildSimilarIndex / v2).
    if (graph.meta?.root && existsSync(graph.meta.root)) {
      atomicWrite(join(dir, SIMILAR_SIDECAR), JSON.stringify(buildSimilarIndex(graph, stamp, reader)));
      written.push('similar-index');
    } else {
      rmSync(join(dir, SIMILAR_SIDECAR), { force: true }); // root gone → remove, never serve a stale file
      written.push('similar-index removed');
    }
  } catch { /* the consumers fall back to their live paths — a sidecar failure must not fail the caller */ }
  return written;
}
