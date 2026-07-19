'use strict';
// codeweb CodeLens — pure logic, kept free of the vscode API so node:test can pin it, and
// self-contained (no imports from scripts/lib) so the extension folder installs on its own.
// Semantics mirror the product tools exactly: `callers` = reverse `call` edges (what
// codeweb_callers counts), `blast` = the codeweb_impact closure (transitive callers +
// subclasses, seed excluded). A different number in the editor than over MCP would be a bug.

/** Parse a graph object into the per-file lens index. */
function buildLensIndex(graph) {
  const byFile = new Map();
  for (const n of graph.nodes || []) {
    if (n.kind !== 'function' && n.kind !== 'class' && n.kind !== 'method') continue;
    if (!n.file || !n.line) continue;
    if (!byFile.has(n.file)) byFile.set(n.file, []);
    byFile.get(n.file).push(n);
  }
  for (const arr of byFile.values()) arr.sort((a, b) => a.line - b.line);
  const callIn = new Map(), inheritIn = new Map();
  for (const e of graph.edges || []) {
    const m = e.kind === 'call' ? callIn : e.kind === 'inherit' ? inheritIn : null;
    if (!m) continue;
    if (!m.has(e.to)) m.set(e.to, new Set());
    m.get(e.to).add(e.from);
  }
  return { root: (graph.meta && graph.meta.root) || null, byFile, callIn, inheritIn, blastMemo: new Map() };
}

/** Blast radius (codeweb_impact): transitive reverse reachability over callers + subclasses. */
function blastOf(index, id) {
  if (index.blastMemo.has(id)) return index.blastMemo.get(id);
  const visited = new Set([id]);
  const queue = [id];
  while (queue.length) {
    const cur = queue.shift();
    for (const dep of [...(index.callIn.get(cur) || []), ...(index.inheritIn.get(cur) || [])]) {
      if (!visited.has(dep)) { visited.add(dep); queue.push(dep); }
    }
  }
  const n = visited.size - 1; // the seed is not its own blast
  index.blastMemo.set(id, n);
  return n;
}

/**
 * Lenses for one repo-relative file: [{id, label, line, callers, blast}], line-sorted.
 * opts.minCallers hides sub-threshold symbols (0 = show everything mapped).
 */
function lensesForFile(index, rel, opts = {}) {
  const min = opts.minCallers || 0;
  const out = [];
  for (const n of index.byFile.get(rel) || []) {
    const callers = (index.callIn.get(n.id) || new Set()).size;
    if (callers < min) continue;
    out.push({ id: n.id, label: n.label, line: n.line, callers, blast: blastOf(index, n.id) });
  }
  return out;
}

module.exports = { buildLensIndex, blastOf, lensesForFile };
