// stale-stamps sidecar (RETENTION R3) — {root, sources, dirs} lifted out of graph.meta so the
// SessionStart hook can run the CHANGE-BASED staleness check without parsing the multi-MB graph
// (the brief sidecar exists precisely to avoid that parse; this keeps its floor). Same stamp
// convention as the trio (lib/sidecars.mjs): one stat of the just-written graph.json; any
// mismatch -> null -> the caller falls back to its live path (parsing the graph).

import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const STALE_SIDECAR = 'stale-stamps.json';

/** Load the freshness stamps beside a graph, or null (absent / version or stamp mismatch). */
export function loadStaleStamps(absGraphPath) {
  try {
    const doc = JSON.parse(readFileSync(join(dirname(absGraphPath), STALE_SIDECAR), 'utf8'));
    if (doc.version !== 1) return null;
    const st = statSync(absGraphPath);
    if (doc.stamp?.graphMtimeMs !== st.mtimeMs || doc.stamp?.graphSize !== st.size) return null;
    return { root: doc.root || null, sources: doc.sources || null, dirs: doc.dirs || null };
  } catch { return null; }
}
