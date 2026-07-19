// find-core — concept search over the graph: "where is retry handled?" -> ranked symbols.
// Deterministic token matching + structural weighting; no LLM, no embeddings, no index build.
// Every other query tool needs a NAME; this one turns an idea into the right starting symbol
// (then explain/context/impact take over). Same-input-same-output, like everything else here.

// Grammatical noise only — never drop meaning-bearing words ("handled" must reach handleError).
const STOP = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'do', 'does', 'did',
  'how', 'what', 'where', 'when', 'which', 'who', 'why', 'in', 'on', 'at', 'of', 'for', 'to',
  'from', 'with', 'and', 'or', 'not', 'it', 'its', 'this', 'that', 'these', 'those', 'there',
  'we', 'you', 'i', 'my', 'our', 'your', 'can', 'could', 'should', 'would', 'will', 'happen', 'happens',
]);

/** Porter-lite: strip plural/participle/agent suffixes so query and identifier meet in the middle. */
export const stemToken = (w) => {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && (w.endsWith('ed') || w.endsWith('es') || w.endsWith('er'))) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  if (w.length > 4 && w.endsWith('e')) w = w.slice(0, -1);
  return w;
};

/** Split an identifier/path segment on camelCase, snake_case, kebab-case, dots, digits. */
export const splitIdent = (s) => String(s)
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
  .toLowerCase()
  .split(/[^a-z0-9]+/)
  .filter(Boolean);

/** Query -> stemmed, deduped, stopword-free tokens (order-independent). */
export const tokenizeQuery = (q) => [...new Set(splitIdent(q).filter((t) => !STOP.has(t)).map(stemToken))];

const stemmedSet = (tokens) => new Set(tokens.map(stemToken));

/**
 * Rank graph nodes for a free-text query. Returns ALL matches sorted (score desc, id asc) —
 * budgeting is the caller's job (capList / MCP budget), so totals stay true.
 * Row: { id, label, kind, file, line, domain, role, score, match } — `match` says WHY, compactly.
 */
export function findSymbols(graph, index, query) {
  const qtoks = tokenizeQuery(query);
  if (!qtoks.length) return { qtoks, results: [] };
  const qJoined = qtoks.join('');
  const wantsTests = qtoks.some((t) => t === 'test' || t === 'spec');
  const results = [];
  for (const n of graph.nodes) {
    const labelToks = stemmedSet(splitIdent(n.label));
    const labelJoined = splitIdent(n.label).map(stemToken).join('');
    const idTail = n.id.slice(n.id.lastIndexOf(':') + 1);
    const ownerToks = idTail === n.label ? labelToks : stemmedSet(splitIdent(idTail));
    const segs = String(n.file || '').split('/');
    const baseToks = stemmedSet(splitIdent(segs[segs.length - 1].replace(/\.[^.]+$/, '')));
    const pathToks = stemmedSet(segs.slice(0, -1).flatMap(splitIdent));
    const domainToks = stemmedSet(splitIdent(n.domain || ''));
    let base = 0, matched = 0;
    const why = [];
    for (const qt of qtoks) {
      let hit = 0;
      if (labelToks.has(qt)) { hit = 3; why.push(`label:${qt}`); }
      else if (qt.length >= 3 && [...labelToks].some((lt) => lt.startsWith(qt))) { hit = 1.5; why.push(`label~${qt}`); }
      else if (ownerToks.has(qt)) { hit = 1.5; why.push(`owner:${qt}`); }
      else if (baseToks.has(qt)) { hit = 2; why.push(`file:${qt}`); }
      else if (pathToks.has(qt)) { hit = 1; why.push(`path:${qt}`); }
      else if (domainToks.has(qt)) { hit = 0.75; why.push(`domain:${qt}`); }
      if (hit) { base += hit; matched++; }
    }
    if (!matched) continue;
    if (labelJoined === qJoined) { base += 4; why.unshift('label=query'); }
    let score = base * (matched / qtoks.length);
    if (n.exports) score *= 1.25;
    if (n.kind === 'module') score *= 0.4;
    if (!wantsTests) {
      if (n.role === 'test' || n.role === 'fixture') score *= 0.6;
      else if (n.role === 'generated' || n.role === 'bench' || n.role === 'example') score *= 0.5;
      else score *= 1.2; // product
    }
    const inDegree = (index.callIn.get(n.id)?.size || 0) + (index.importIn.get(n.id)?.size || 0);
    score *= 1 + Math.min(inDegree, 20) / 40;
    results.push({ id: n.id, label: n.label, kind: n.kind, file: n.file, line: n.line, domain: n.domain || 'unassigned', role: n.role, score: +score.toFixed(2), match: why.join(' ') });
  }
  results.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
  return { qtoks, results };
}
