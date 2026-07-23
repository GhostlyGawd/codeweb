// history — the per-map metrics ledger (RETENTION R1/R8): one JSONL row per FULL map, appended
// beside graph.json. This is the progression axis every return surface reads — run.mjs's
// "since last map" delta, the session brief's trend line, and trend.mjs's instant fast path
// (which previously recomputed N full pipeline runs into a temp dir and discarded the series).
//
// House rules: strictly local, deterministic inputs (the row's `at` is the graph's own
// generatedAt — SOURCE_DATE_EPOCH-aware), fail-open (a ledger must never fail the map), and
// append-only (history is memory, whitelisted by the workspace .gitignore contract in R6).

import { readFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileCycles } from './graph-ops.mjs';

export const HISTORY_NAME = 'history.jsonl';
export const historyPathOf = (graphPath) => join(dirname(graphPath), HISTORY_NAME);

/** The trend metrics row for one graph — same definitions trend.mjs charts. */
export function metricsRow(graph) {
  const overlaps = Array.isArray(graph.overlaps) ? graph.overlaps : [];
  const dl = overlaps.filter((o) => o.kind === 'duplicate-logic');
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const dom = new Map(nodes.map((n) => [n.id, n.domain || 'unassigned']));
  let coupling = 0;
  for (const e of edges) {
    if (e.kind === 'test') continue;
    const a = dom.get(e.from), b = dom.get(e.to);
    if (a != null && b != null && a !== b) coupling += e.weight || 1;
  }
  return {
    at: graph.meta?.generatedAt || null,
    symbols: nodes.length,
    files: new Set(nodes.map((n) => n.file).filter(Boolean)).size,
    confirmed: dl.filter((o) => o.confidence === 'high').length,
    candidates: dl.filter((o) => o.confidence !== 'refuted').length,
    coupling,
    cycles: fileCycles(graph).length,
  };
}

/** Append one row. Fail-open — never throws. */
export function appendHistory(graphPath, row) {
  try { appendFileSync(historyPathOf(graphPath), JSON.stringify(row) + '\n'); } catch { /* memory, not a gate */ }
}

/** Read the last `tail` rows (oldest -> newest). Fail-open — [] on absence/corruption; a torn
 *  final line (crash mid-append) is skipped, not fatal. */
export function readHistory(graphPath, tail = 8) {
  try {
    const rows = [];
    // (loop var deliberately not named `line` — trend.mjs exports a global `line()` and the
    // scripts/-scoped self-gate wired the bare name into a false history->trend ref edge.)
    for (const row of readFileSync(historyPathOf(graphPath), 'utf8').split('\n')) {
      if (!row.trim()) continue;
      try { rows.push(JSON.parse(row)); } catch { /* torn tail line */ }
    }
    return rows.slice(-tail);
  } catch { return []; }
}
