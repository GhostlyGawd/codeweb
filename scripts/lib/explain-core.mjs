// codeweb explain-core — the ONE place an explain card is assembled (Spec P lifted it out of the
// explain.mjs CLI so the pre-edit sidecar writer and the CLI build byte-identical cards from the
// same code). Pure: takes a graph + prebuilt index + reader, returns card objects; no IO, no CLI.

import { callersOf, calleesOf, testersOf, impactOf, fanInOf } from './graph-ops.mjs';
import { callerReliance, relianceLine } from './reliance.mjs';
import { coverageNote } from './coverage.mjs'; // #13: measured-execution facts on the card

/** Build the bounded explain card for each id. Identical to what `explain.mjs` always emitted. */
export function buildCards(graph, index, reader, ids) {
  const topBy = (list, n) => list.slice().sort((a, b) => fanInOf(index, b) - fanInOf(index, a) || (a < b ? -1 : 1)).slice(0, n);
  return ids.map((id) => {
    const n = index.byId.get(id);
    const callers = callersOf(index, [id]);
    const callees = calleesOf(index, [id]);
    const tests = testersOf(index, [id]);
    const blast = impactOf(index, [id]);
    const blastDomains = [...new Set(blast.map((x) => index.byId.get(x)?.domain || 'unassigned'))];
    const findings = (graph.overlaps || []).filter((o) => (o.nodes || []).includes(id))
      .map((o) => ({ id: o.id, kind: o.kind, title: o.title, confidence: o.confidence }));
    const reliance = callerReliance(graph, index, n, reader);
    // confidence calibration: say when "N callers" is NOT the whole story
    const caveat = n.pub
      ? 'public API (reachable from a package entrypoint) — external callers likely; renames are breaking'
      : (callers.length === 0 && n.exports)
        ? '0 in-repo callers but exported — external use possible'
        : (callers.length === 0 && graph.meta?.dynamic)
          ? `repo routes calls dynamically in ${graph.meta.dynamic.files} file(s) — absence of callers is weaker evidence`
          : null;
    return {
      ...(n.pub ? { publicApi: true } : {}),
      ...(caveat ? { caveat } : {}),
      ...(reliance ? { callersRelyOn: reliance } : {}),
      id, label: n.label, kind: n.kind, role: n.role || 'product', domain: n.domain,
      at: `${n.file}:${n.line}`, loc: n.loc, exports: n.exports,
      signature: n.signature ?? null,
      ...(n.complexity != null ? { complexity: n.complexity, maxDepth: n.maxDepth } : {}),
      dependents: { callers: callers.length, tests: tests.length, blastRadius: blast.length, blastDomains: blastDomains.length },
      ...(coverageNote(graph, n) ? { coverage: coverageNote(graph, n) } : {}), // #13
      topCallers: topBy(callers, 5),
      topCallees: topBy(callees, 5),
      tests: tests.slice(0, 3),
      findings,
      summary: `${n.kind} ${n.label} (${n.role || 'product'}, ${n.domain}) — ${callers.length} caller(s), ${tests.length} test(s), blast ${blast.length} across ${blastDomains.length} domain(s)${findings.length ? `; in ${findings.length} finding(s)` : ''}${relianceLine(reliance) ? `; ${relianceLine(reliance)}` : ''}${caveat ? `; ⚠ ${caveat}` : ''}${n.covered === false && graph.meta?.coverage ? '; ⚠ NOT covered by the recorded test run' : ''}`,
    };
  });
}
