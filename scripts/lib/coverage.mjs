// codeweb coverage — measured-execution ingest (IMPROVEMENTS.md #13; ROADMAP Phase 4's
// "coverage→symbol mapping"). Turns a coverage report (lcov text, or c8/istanbul
// coverage-final.json) into per-symbol facts on the graph: which mapped symbols a recorded run
// actually executed. That upgrades "tests that reference X" (name/path heuristics) into
// "tests MEASURED to execute X" — and, just as actionable, "X has NO recorded coverage".
//
// Deliberately an OPTIONAL, explicit input (like --churn): absent input leaves graphs
// byte-identical; provenance is stamped in meta.coverage (source label + counts, no timestamp —
// annotation must not break byte-determinism). Pure: no I/O here; callers read files.

/** Parse lcov text -> Map<sourcePath, Map<line, hits>>. Tolerant of TN/FN/BRDA noise. */
export function parseLcov(text) {
  const files = new Map();
  let cur = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('SF:')) { cur = new Map(); files.set(line.slice(3).trim().replace(/\\/g, '/'), cur); }
    else if (line.startsWith('DA:') && cur) {
      const [ln, hits] = line.slice(3).split(',');
      const l = parseInt(ln, 10), h = parseInt(hits, 10);
      if (Number.isFinite(l) && Number.isFinite(h)) cur.set(l, Math.max(cur.get(l) || 0, h));
    } else if (line === 'end_of_record') cur = null;
  }
  return files;
}

/** Parse c8/istanbul coverage-final.json -> Map<sourcePath, Map<line, hits>> (statement granularity). */
export function parseIstanbul(json) {
  const files = new Map();
  for (const [path, rec] of Object.entries(json || {})) {
    const lines = new Map();
    const sm = rec.statementMap || {}, s = rec.s || {};
    for (const [sid, loc] of Object.entries(sm)) {
      const hits = s[sid] || 0;
      const start = loc?.start?.line, end = loc?.end?.line ?? start;
      if (!Number.isFinite(start)) continue;
      for (let l = start; l <= (Number.isFinite(end) ? end : start); l++) lines.set(l, Math.max(lines.get(l) || 0, hits));
    }
    files.set(path.replace(/\\/g, '/'), lines);
  }
  return files;
}

/**
 * Map coverage source paths onto the graph's repo-relative files. Exact rel match first (after
 * stripping meta.root when the report used absolute paths), then unique suffix match. Ambiguous
 * suffixes are DROPPED (precision over recall — same contract as the extractor).
 */
export function mapToGraphFiles(covFiles, graph) {
  const rels = new Set((graph.nodes || []).map((n) => n.file).filter(Boolean));
  const root = (graph.meta?.root || '').replace(/\\/g, '/').replace(/\/+$/, '');
  const out = new Map(); // rel -> Map<line, hits>
  const claim = (rel2, lines) => {
    const prev = out.get(rel2);
    if (!prev) { out.set(rel2, lines); return; }
    for (const [l, h] of lines) prev.set(l, Math.max(prev.get(l) || 0, h)); // merged runs
  };
  for (const [src, lines] of covFiles) {
    let rel2 = null;
    if (rels.has(src)) rel2 = src;
    else if (root && src.startsWith(root + '/') && rels.has(src.slice(root.length + 1))) rel2 = src.slice(root.length + 1);
    else {
      const suffixHits = [...rels].filter((r) => src.endsWith('/' + r));
      if (suffixHits.length === 1) rel2 = suffixHits[0];
    }
    if (rel2) claim(rel2, lines);
  }
  return out;
}

/**
 * Annotate graph nodes in place: function/method/class nodes whose span [line, line+loc-1]
 * contains an executed line get `covered: true` + `hits` (peak line hits in the span); spans the
 * report SAW but never executed get `covered: false`. Files absent from the report leave their
 * nodes untouched (unknown ≠ uncovered). Returns { symbolsSeen, symbolsCovered, filesMapped }.
 */
export function annotateCoverage(graph, covFiles, sourceLabel) {
  const byRel = mapToGraphFiles(covFiles, graph);
  let symbolsSeen = 0, symbolsCovered = 0;
  for (const n of graph.nodes || []) {
    if (!byRel.has(n.file) || !n.line) continue;
    if (!['function', 'method', 'class', 'module'].includes(n.kind)) continue;
    const lines = byRel.get(n.file);
    const end = n.line + Math.max((n.loc || 1) - 1, 0);
    // The DECLARATION line executes at module load (`export function neverRun` records a hit even
    // when the body never ran), so judge from BODY lines when any are instrumented; a single-line
    // function falls back to its declaration line (arrows/one-liners have no separate body line).
    let peakBody = 0, sawBody = false, peakDecl = 0, sawDecl = false;
    for (const [l, h] of lines) {
      if (l === n.line) { sawDecl = true; if (h > peakDecl) peakDecl = h; }
      else if (l > n.line && l <= end) { sawBody = true; if (h > peakBody) peakBody = h; }
    }
    if (!sawBody && !sawDecl) continue; // the report never instrumented this span — say nothing
    const peak = sawBody ? peakBody : peakDecl;
    symbolsSeen++;
    if (peak > 0) { n.covered = true; n.hits = peak; symbolsCovered++; }
    else { n.covered = false; delete n.hits; }
  }
  graph.meta = graph.meta || {};
  graph.meta.coverage = { source: sourceLabel, filesMapped: byRel.size, symbolsSeen, symbolsCovered };
  return { symbolsSeen, symbolsCovered, filesMapped: byRel.size };
}

/** One-line coverage fact for a node, or null when the graph carries no coverage data. */
export function coverageNote(graph, node) {
  if (!graph.meta?.coverage || !node) return null;
  if (node.covered === true) return `covered by the recorded run (peak ${node.hits} hit${node.hits === 1 ? '' : 's'})`;
  if (node.covered === false) return 'NOT covered by the recorded run — edits here land untested';
  return 'not in the recorded coverage report';
}
