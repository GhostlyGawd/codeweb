// codeweb context-pack core — the one payload assembler behind BOTH transports (finding 20).
// The MCP server's INSTRUCTIONS prescribe codeweb_context before every symbol edit, yet the tool
// took the spawn path: node boot + a fresh multi-MB graph parse per call (~256ms measured on a
// 12MB graph) while structural queries answered from the in-process cache in ~3-13ms. The CLI
// (context-pack.mjs) and the MCP fast path now share this assembler — one truth, two transports,
// byte-identical JSON (field order preserved from the CLI's original construction).

import { callersOf, calleesOf, impactOf } from './graph-ops.mjs';
import { coverageNote } from './coverage.mjs'; // #13
import { capList, checkStaleness } from './cli.mjs';

/**
 * Assemble the full context-pack payload for resolved ids. Caller resolves the symbol first
 * (found:false stays transport-specific). `reader` is a cli.mjs sourceReader for graph.meta.root.
 */
export function buildContextPack(graph, index, reader, ids, { symbol, windowN = 3, fullBodies = false, limit = null } = {}) {
  const callerIds = callersOf(index, ids);
  const calleeIds = calleesOf(index, ids);
  const blast = impactOf(index, ids);

  // CP-BODY-FIDELITY: sourceReader serves the exact source lines [line, line+loc-1] (one truth,
  // shared with find-similar + diff rename-matching).
  const sourceAvailable = reader.available;
  const readLines = reader.linesOf;
  const bodyOf = reader.bodyOf;
  const view = (n, withBody) => {
    const o = { id: n.id, label: n.label, kind: n.kind, file: n.file, line: n.line, loc: n.loc, domain: n.domain, exports: n.exports, signature: n.signature ?? null };
    if (withBody) o.body = bodyOf(n);
    return o;
  };
  // CALL-SITE WINDOWS: inside the caller's recorded span, every line that references the target
  // label, each with ±windowN lines of context. Windows overlapping-adjacent are merged.
  const targetLabels = [...new Set(ids.map((id) => index.byId.get(id)?.label).filter(Boolean))];
  const labelRe = targetLabels.length ? new RegExp(`\\b(${targetLabels.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`) : null;
  const windowsOf = (n) => {
    if (!sourceAvailable || !labelRe) return [];
    const lines = readLines(n.file);
    if (!lines) return [];
    const start = n.line, end = Math.min(n.line + (n.loc || 1) - 1, lines.length);
    const hits = [];
    for (let ln = start; ln <= end; ln++) if (labelRe.test(lines[ln - 1] || '')) hits.push(ln);
    const windows = [];
    for (const h of hits.slice(0, 8)) { // a caller with >8 call sites: the first 8 windows tell the story
      const s = Math.max(start, h - windowN), e = Math.min(end, h + windowN);
      const last = windows[windows.length - 1];
      if (last && s <= last.endLine + 1) { last.endLine = e; last.callLines.push(h); }
      else windows.push({ startLine: s, endLine: e, callLines: [h] });
    }
    for (const w of windows) w.text = lines.slice(w.startLine - 1, w.endLine).join('\n');
    return windows;
  };
  const byId = index.byId;
  const callerView = (id) => {
    const n = byId.get(id);
    const o = view(n, fullBodies);
    if (!fullBodies) o.windows = windowsOf(n);
    return o;
  };
  const cappedCallers = capList(callerIds, limit);
  const cappedCallees = capList(calleeIds, limit);
  const cappedBlast = capList(blast, limit != null ? Math.max(limit, 25) : null);
  const payload = {
    symbol, matched: ids, sourceAvailable,
    summary: `${symbol}: ${callerIds.length} caller(s), ${calleeIds.length} callee(s), blast radius ${blast.length}`,
    mode: fullBodies ? 'full-bodies' : `call-site windows (±${windowN} lines)`,
    target: ids.map((id) => view(byId.get(id), true)),
    callers: cappedCallers.items.map(callerView),               // call sites that may need updating
    callees: cappedCallees.items.map((id) => view(byId.get(id), false)),  // dependencies: location-only (bounded)
    blastRadius: { count: blast.length, ids: cappedBlast.items }, // transitive impact: ids only
  };
  if (cappedCallers.truncated) payload.moreCallers = { remaining: cappedCallers.remaining };
  const staleInfo = checkStaleness(graph);
  if (staleInfo) { payload.stale = staleInfo; payload.summary += ` — graph is stale for ${staleInfo.count}+ file(s); run codeweb_refresh`; }
  // #13: an edit window on an unmeasured symbol should SAY the blast radius is unguarded.
  if (graph.meta?.coverage) {
    const uncoveredTargets = ids.filter((id) => index.byId.get(id)?.covered === false);
    if (uncoveredTargets.length) { payload.coverage = uncoveredTargets.map((id) => `${id}: ${coverageNote(graph, index.byId.get(id))}`); payload.summary += ' — ⚠ target NOT covered by the recorded test run'; }
  }
  if (cappedCallees.truncated) payload.moreCallees = { remaining: cappedCallees.remaining };
  return payload;
}
