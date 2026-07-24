// brief-core — the day-one briefing: everything an agent burns its first 20-50k tokens
// discovering, pre-computed from the graph into one ~2KB page. Where things live, what the
// repo hangs off, where the tests are, what's already known to be wrong. Injected at session
// start (hooks/session-brief.mjs), callable any time (codeweb_brief / scripts/brief.mjs).

import { fileCycles, orphans, fanInOf } from './graph-ops.mjs';

const CONFIRMED = new Set(['high', 'medium']);

/** Assemble the briefing object from a normalized graph + index. Pure; budgeting built in. */
export function buildBrief(graph, index) {
  const nodes = graph.nodes || [];
  const product = nodes.filter((n) => n.role === 'product' && n.kind !== 'module');
  const files = new Set(nodes.map((n) => n.file));
  const roles = {};
  for (const n of nodes) roles[n.role || 'product'] = (roles[n.role || 'product'] || 0) + 1;

  const loadBearing = product
    .slice().sort((a, b) => fanInOf(index, b.id, true) - fanInOf(index, a.id, true) || (a.id < b.id ? -1 : 1)).slice(0, 10)
    .filter((n) => fanInOf(index, n.id, true) > 0)
    .map((n) => ({ id: n.id, label: n.label, fanIn: fanInOf(index, n.id, true), at: `${n.file}:${n.line}` }));

  // entry points: exported product symbols nobody in-repo calls but which call a lot — the
  // places execution starts (CLIs, handlers, public surface). Heuristic, labeled as such.
  const outDegree = (id) => index.callOut?.get(id)?.size || 0;
  const entryPoints = product
    .filter((n) => n.exports && fanInOf(index, n.id, true) === 0 && outDegree(n.id) >= 2)
    .sort((a, b) => outDegree(b.id) - outDegree(a.id) || (a.id < b.id ? -1 : 1))
    .slice(0, 5)
    .map((n) => ({ label: n.label, at: `${n.file}:${n.line}`, callsOut: outDegree(n.id) }));

  const testNodes = nodes.filter((n) => n.role === 'test');
  const testDirs = {};
  for (const n of testNodes) {
    const d = n.file.includes('/') ? n.file.slice(0, n.file.lastIndexOf('/')) : '.';
    testDirs[d] = (testDirs[d] || 0) + 1;
  }
  const topTestDirs = Object.entries(testDirs).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([d]) => d);

  const domains = (graph.domains || [])
    .filter((d) => (d.role || 'product') === 'product')
    .sort((a, b) => (b.nodes || 0) - (a.nodes || 0)).slice(0, 6)
    .map((d) => ({ name: d.name, nodes: d.nodes, summary: d.summary || '' }));

  const dup = (graph.overlaps || []).filter((o) => o.kind !== 'interface-pattern' && (o.confidence == null || CONFIRMED.has(o.confidence))).length;
  const cyc = fileCycles(graph).length;
  const orph = orphans(graph, index).length;

  return {
    target: graph.meta?.target || null,
    root: graph.meta?.root || null,
    generatedAt: graph.meta?.generatedAt || null,
    languages: graph.meta?.languages || [],
    size: { symbols: nodes.length, edges: (graph.edges || []).length, files: files.size, domains: (graph.domains || []).length },
    roles,
    domains,
    loadBearing,
    entryPoints,
    tests: { symbols: testNodes.length, dirs: topTestDirs },
    // RETENTION R2: a refresh drops overlaps and STAMPS the drop — a 0 that means "pending
    // recount" must never render as "nothing to fix" (the human's reason to return).
    findings: { duplications: dup, cycles: cyc, orphanCandidates: orph, ...(graph.meta?.overlapsDroppedAt && dup === 0 ? { notRecounted: true } : {}) },
  };
}

/** One-page text rendering (the session-start injection format). */
export function renderBrief(b) {
  const L = [];
  // ACTIVATION A7: an --allow-empty map has zero symbols. Say THAT — the normal render
  // ("0 symbols … ask codeweb before guessing") would point agents at a map that knows nothing.
  if (!b.size || b.size.symbols === 0) {
    L.push(`codeweb brief — ${b.target || b.root || 'this repo'}: a map exists here but it is EMPTY (no supported source found — likely a non-native language, or the map was built at the wrong root).`);
    L.push('In Claude Code, the /codeweb command falls back to agent-based mapping for non-native languages; otherwise re-run codeweb at the code root.');
    return L.join('\n');
  }
  L.push(`codeweb brief — ${b.target || b.root || 'mapped repo'}: ${b.size.symbols} symbols / ${b.size.files} files / ${b.size.domains} domains (${(b.languages || []).join(', ') || 'unknown languages'})`);
  if (b.domains.length) {
    L.push('domains:');
    for (const d of b.domains) {
      // AI-IDEAS Idea 3: the narration sidecar's one-liner says what the area is FOR — always
      // provenance-labeled, and absent (or stale) it simply isn't here.
      const note = b.narration?.domains?.[d.name];
      L.push(`  - ${d.name} (${d.nodes}): ${d.summary}${note ? ` — ${note} [agent-written]` : ''}`);
    }
  }
  if (b.loadBearing.length) {
    L.push(`load-bearing (most depended-on — check impact before touching): ${b.loadBearing.slice(0, 6).map((s) => `${s.label}×${s.fanIn}`).join(', ')}`);
  }
  if (b.entryPoints.length) {
    L.push(`entry points (heuristic): ${b.entryPoints.map((e) => `${e.label} @ ${e.at}`).join('; ')}`);
  }
  L.push(`tests: ${b.tests.symbols} test symbol(s)${b.tests.dirs.length ? ` under ${b.tests.dirs.join(', ')}` : ''}`);
  const f = b.findings;
  if (f.notRecounted) {
    // R2: the refresh dropped the findings — say THAT, never a false zero.
    L.push(`known issues: duplication not recounted since the last refresh (run /codeweb or codeweb_map to recount) · ${f.cycles} file cycle(s), ${f.orphanCandidates} orphan candidate(s)`);
  } else {
    L.push(`known issues: ${f.duplications} duplication finding(s), ${f.cycles} file cycle(s), ${f.orphanCandidates} orphan candidate(s)`);
  }
  // R1/R8: the progression line — value the user already created, resurfaced (readHistory tail
  // attached by the callers that know the graph path; pure render here).
  if (Array.isArray(b.history) && b.history.length >= 2) {
    L.push(`progress: confirmed dups over your last ${b.history.length} maps: ${b.history.map((r) => r.confirmed).join(' -> ')}`);
  }
  if (b.activity) {
    // #10: lead with lifetime (never empty once anything happened), current month in parens.
    const line = (c) => {
      const bits = [];
      if (c.cardsDelivered) bits.push(`${c.cardsDelivered} pre-edit card(s)`);
      if (c.cardCallersFollowed) bits.push(`${c.cardCallersFollowed} card-named caller(s) followed`);
      if (c.regressionsFlagged) bits.push(`${c.regressionsFlagged} regression(s) flagged`);
      if (c.queriesServed) bits.push(`${c.queriesServed} queries served`);
      return bits.join(' · ');
    };
    const life = line(b.activity.lifetime || b.activity.counters || {});
    const month = line(b.activity.counters || {});
    if (life) L.push(`codeweb here${b.activity.since ? ` since ${b.activity.since}` : ''}: ${life}${month && month !== life ? ` (this month: ${month})` : ''} (full receipt: scripts/stats.mjs)`);
  }
  // RETENTION R3: the nudge fires on CHANGE, not on a calendar — the job is refresh-on-change.
  // The 7-day age note stays as the fallback for an untouched-repo map that merely aged.
  if (b.stale?.count) {
    L.push(`note: this map is behind by ${b.stale.count}+ changed file(s) — /codeweb re-maps in seconds (agents: codeweb_map).`);
  } else if (b.generatedAt) {
    const days = Math.floor((Date.now() - Date.parse(b.generatedAt)) / 86400000);
    if (days >= 7) L.push(`note: this map was built ${days} day(s) ago — refresh with codeweb_refresh (agents) or /codeweb (full rebuild).`);
  }
  L.push('ask codeweb before guessing: codeweb_find "<concept>" → codeweb_explain <id> → codeweb_context <id>.');
  return L.join('\n');
}
