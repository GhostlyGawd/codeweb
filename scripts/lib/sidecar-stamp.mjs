// THE sidecar freshness rule, as one reader (D3a) — every stamped sidecar (brief.json,
// index-lite.json, stale-stamps.json, narration.json, similar-index.json) is written beside
// graph.json and stamped against ONE statSync of the just-written graph (lib/sidecars.mjs mints
// the stamp; hook-baseline.json keeps its own richer shape and is deliberately NOT served here).
// This is the single load-side check: parse the sidecar, require the expected schema version and
// a stamp equal to one fresh stat of the graph, else null — always fail-open, never throw, so any
// mismatch sends the caller to its live path. Do NOT home this in sidecars.mjs: that module
// imports the sidecar libs, so the loader living there would mint the lib cycle codeweb's own
// gate flags.

import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Read sidecar `filename` beside `absGraphPath` iff `doc.version === version` and its stamp
 *  equals one stat of the graph (mtimeMs + size); else null. Never throws. */
export function loadStamped(absGraphPath, filename, version) {
  try {
    const doc = JSON.parse(readFileSync(join(dirname(absGraphPath), filename), 'utf8'));
    if (!doc || doc.version !== version || !doc.stamp) return null;
    const st = statSync(absGraphPath);
    return doc.stamp.graphMtimeMs === st.mtimeMs && doc.stamp.graphSize === st.size ? doc : null;
  } catch { return null; }
}
