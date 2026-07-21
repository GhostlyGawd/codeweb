// codeweb brief sidecar (perf-quality finding 23) — the SessionStart hook re-parsed and
// re-indexed the whole graph on every session start/resume/clear (97–100ms on codeweb's own map,
// 310–328ms at 17k nodes) to build a payload that is a pure function of the graph. The report
// stage now pre-renders it beside graph.json (the Spec P index-lite pattern: stamped mtime+size,
// stat-checked, never parsed to validate); the hook serves it at the node-boot floor and falls
// back to the parse path on any mismatch — fail toward correctness.

import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const BRIEF_SIDECAR = 'brief.json';

/** Load the pre-rendered brief beside graphPath iff its stamp matches the graph bytes; else null. */
export function loadBriefSidecar(graphPath) {
  try {
    const st = statSync(graphPath);
    const b = JSON.parse(readFileSync(join(dirname(graphPath), BRIEF_SIDECAR), 'utf8'));
    if (!b || b.version !== 1 || !b.stamp || b.stamp.graphMtimeMs !== st.mtimeMs || b.stamp.graphSize !== st.size) return null;
    return b.brief;
  } catch { return null; }
}
