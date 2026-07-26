// codeweb brief sidecar (perf-quality finding 23) — the SessionStart hook re-parsed and
// re-indexed the whole graph on every session start/resume/clear (97–100ms on codeweb's own map,
// 310–328ms at 17k nodes) to build a payload that is a pure function of the graph. The report
// stage now pre-renders it beside graph.json (the Spec P index-lite pattern: stamped mtime+size,
// stat-checked, never parsed to validate); the hook serves it at the node-boot floor and falls
// back to the parse path on any mismatch — fail toward correctness.

import { loadStamped } from './sidecar-stamp.mjs'; // D3a: THE stamp rule, one reader

export const BRIEF_SIDECAR = 'brief.json';

/** Load the pre-rendered brief beside graphPath iff its stamp matches the graph bytes; else null. */
export function loadBriefSidecar(graphPath) {
  return loadStamped(graphPath, BRIEF_SIDECAR, 1)?.brief ?? null;
}
