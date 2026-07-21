// codeweb shared graph primitives — pure functions over a graph.json object (see graph-schema.md).
// Imported by scripts/query.mjs and scripts/diff.mjs so the call/cycle/orphan logic lives ONCE
// (codeweb dogfooding its own anti-duplication mission). No I/O, no process.exit — callers own
// those. Deterministic: every returned list is sorted.

const asArray = (x) => (Array.isArray(x) ? x : []);
const byIdLt = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// Test-file predicate (shared by find-similar, the extractor's test-edge classification, and the
// dead-code workflow — one truth). Matches `*.test.*`, `*.spec.*`, `*_test.*`, or a path segment
// `tests/` | `test/` | `__tests__/`. Forward-slashed relative paths.
// Canonical edge identity (from+to+kind) — was re-implemented in break-cycles/diff/shards (Spec E dogfood).
export const edgeKey = (e) => [e.from, e.to, e.kind].join(String.fromCharCode(0)); // NUL-separated: ids can contain spaces

export const isTestFile = (file) =>
  /(?:^|\/)(?:tests?|__tests__|spec)\//.test(file || '') || /(?:\.test\.|\.spec\.|_test\.|_spec\.)/.test(file || '') ||
  /(?:^|\/)src\/test\//.test(file || '') ||                       // Maven/Gradle convention
  /(?:Tests?|Spec)\.(?:java|cs|php|swift|kt)$/.test(file || '');  // FooTest.java / FooTests.swift / FooTest.php …

// Code ROLE by path — product code vs the supporting cast (one truth: the extractor stamps it on
// every node; normalizeGraph back-fills older graphs). Rankings and default report views scope to
// `product` so monorepo fixture noise can't dominate recommendations.
export function roleOf(file) {
  const f = file || '';
  if (isTestFile(f)) return 'test';
  if (/(^|\/)(fixtures?|__fixtures__|__mocks__|mocks?)\//.test(f)) return 'fixture';
  if (/(^|\/)(examples?|samples?|demos?|playgrounds?|playground|sandbox|e2e)\//.test(f)) return 'example';
  if (/(^|\/)(benchmarks?|bench|perf)\//.test(f)) return 'bench';
  if (/\.(min|bundle)\.[cm]?js$/.test(f) || /(^|\/)(generated|__generated__)\//.test(f)) return 'generated';
  return 'product';
}

// #6 (IMPROVEMENTS.md): one role accessor + one product-scope filter for every RANKED surface.
// The vite-playground lesson (rankings drowned by fixtures) was applied to overlap only; hotspots,
// risk, deadcode, and campaign ranked test helpers and generated bundles first on codeweb's own
// map. Scope defaults to product with a COUNTED exclusion (never silent), --all restores.
export const roleOfNode = (n) => n.role || roleOf(n.file || '');
export function productScope(nodes, includeAll = false) {
  if (includeAll) return { kept: nodes, excluded: 0, excludedByRole: {} };
  const kept = [], excludedByRole = {};
  for (const n of nodes) {
    const r = roleOfNode(n);
    if (r === 'product') kept.push(n);
    else excludedByRole[r] = (excludedByRole[r] || 0) + 1;
  }
  return { kept, excluded: nodes.length - kept.length, excludedByRole };
}
export const scopeNote = (s) => (s.excluded ? `excluded ${s.excluded} non-product symbol(s) (${Object.entries(s.excludedByRole).sort().map(([r, c]) => `${r} ${c}`).join(', ')}) — --all includes them` : null);

// Spec E: per-repo role OVERRIDES (codeweb.rules.json `roles: [{glob, role}]`) — heuristics can't
// know a repo's private layout ("docs/ here is generated site output"). Compile the config into a
// matcher; first matching glob wins; an unknown role THROWS (extraction fails loudly, exit 2).
export const VALID_ROLES = new Set(['product', 'test', 'fixture', 'example', 'bench', 'generated', 'vendored']);

function globToRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') { re += glob[i + 2] === '/' ? '(?:.*/)?' : '.*'; i += glob[i + 2] === '/' ? 2 : 1; }
      else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += /[.+^${}()|[\]\\]/.test(c) ? '\\' + c : c;
  }
  return new RegExp('^' + re + '$');
}

/** Compile `roles` config into (relPath) => role|null. Throws on an invalid entry. */
export function compileRoleOverrides(roles) {
  if (!roles) return () => null;
  if (!Array.isArray(roles)) throw new Error('codeweb.rules.json: `roles` must be an array of {glob, role}');
  const compiled = roles.map((r, i) => {
    if (!r || typeof r.glob !== 'string' || typeof r.role !== 'string') throw new Error(`codeweb.rules.json roles[${i}]: need {glob, role}`);
    if (!VALID_ROLES.has(r.role)) throw new Error(`codeweb.rules.json roles[${i}] ("${r.glob}"): unknown role "${r.role}" (valid: ${[...VALID_ROLES].join('|')})`);
    return { re: globToRegex(r.glob), role: r.role };
  });
  return (relPath) => { for (const c of compiled) if (c.re.test(relPath)) return c.role; return null; };
}

// Fill the same defaults build-report.mjs applies, so every consumer sees a well-formed graph.
export function normalizeGraph(graph) {
  const g = graph || {};
  g.meta = g.meta || {};
  g.nodes = asArray(g.nodes);
  g.edges = asArray(g.edges);
  g.domains = asArray(g.domains);
  g.overlaps = asArray(g.overlaps);
  for (const n of g.nodes) {
    if (n.domain == null || n.domain === '') n.domain = 'unassigned';
    if (typeof n.exports !== 'boolean') n.exports = false;
    if (n.file == null) n.file = '';
    if (!n.role) n.role = roleOf(n.file); // pre-v7 graphs: derive
  }
  return g;
}

// Adjacency indexes. callIn/callOut are CALL edges only; hasIncoming tracks any call|import in-edge.
export function buildIndex(graph) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const callIn = new Map();
  const callOut = new Map();
  const inheritIn = new Map(); // reverse inherit: base -> {subclasses}, for impact reachability
  const testIn = new Map();    // F4: reverse `test` edges: prod symbol -> {test nodes exercising it}
  const importIn = new Map();  // reverse `import` edges: symbol -> {symbols that import it}
  const refIn = new Map();     // reverse `ref` edges: class -> {symbols using it via instanceof / static method}
  const hasIncoming = new Set();
  for (const e of graph.edges) {
    if (e.kind === 'call') {
      if (!callIn.has(e.to)) callIn.set(e.to, new Set());
      callIn.get(e.to).add(e.from);
      if (!callOut.has(e.from)) callOut.set(e.from, new Set());
      callOut.get(e.from).add(e.to);
    }
    if (e.kind === 'inherit') {
      if (!inheritIn.has(e.to)) inheritIn.set(e.to, new Set());
      inheritIn.get(e.to).add(e.from);
    }
    if (e.kind === 'test') {
      if (!testIn.has(e.to)) testIn.set(e.to, new Set());
      testIn.get(e.to).add(e.from);
    }
    if (e.kind === 'import') {
      if (!importIn.has(e.to)) importIn.set(e.to, new Set());
      importIn.get(e.to).add(e.from);
    }
    if (e.kind === 'ref') {
      if (!refIn.has(e.to)) refIn.set(e.to, new Set());
      refIn.get(e.to).add(e.from);
    }
    // NOTE: `test` is intentionally EXCLUDED from hasIncoming — a symbol referenced only by tests is
    // still a production orphan (the signal F10 consumes). Production callers also exclude tests.
    if (e.kind === 'call' || e.kind === 'import' || e.kind === 'inherit' || e.kind === 'ref') hasIncoming.add(e.to);
  }
  return { byId, callIn, callOut, inheritIn, testIn, importIn, refIn, hasIncoming };
}

// Resolve a symbol to node ids: exact id wins; else every node whose label matches (sorted).
export function resolveSymbol(graph, sym) {
  if (graph.nodes.some((n) => n.id === sym)) return [sym];
  return graph.nodes.filter((n) => n.label === sym).map((n) => n.id).sort();
}

// #2 (IMPROVEMENTS.md): when resolveSymbol misses, offer the nearest labels instead of a dead
// end. Deterministic and cheap (one pass over nodes, miss path only). Matching is tiered —
// case-insensitive equality, then prefix, then substring, then shared name-tokens — so a typo'd
// case ("normalizepath") or a partial name ("create") still lands. Returns up to `cap` full ids.
const nameTokens = (s) => s.split(/[^a-zA-Z0-9]+|(?<=[a-z0-9])(?=[A-Z])/).filter((t) => t.length >= 3).map((t) => t.toLowerCase());
// (Local names below are deliberately collision-free: bare identifiers whose name uniquely matches
// a global symbol elsewhere in this repo would wire a false ref edge — codeweb's own gate caught
// `score`/`cap` here closing a 10-file cycle. Physician, heal thyself.)
export function suggestSymbols(graph, sym, maxSuggestions = 3) {
  // For `file:label` queries the label part carries the intent; match against it. Tokenize the
  // ORIGINAL casing (camelCase boundaries are the token signal), lowercase only for comparisons.
  const wantedRaw = sym.includes(':') ? sym.slice(sym.lastIndexOf(':') + 1) : sym;
  const wanted = wantedRaw.toLowerCase();
  if (!wanted) return [];
  const wantedTokens = new Set(nameTokens(wantedRaw));
  const suggestScored = [];
  for (const n of graph.nodes) {
    if (!n.label || n.label === '<module>') continue;
    const label = n.label.toLowerCase();
    let tier = 0;
    if (label === wanted) tier = 4;
    else if (wanted.length >= 3 && (label.startsWith(wanted) || wanted.startsWith(label))) tier = 3;
    else if (wanted.length >= 3 && (label.includes(wanted) || wanted.includes(label))) tier = 2;
    else if (wantedTokens.size && nameTokens(n.label).some((t) => wantedTokens.has(t))) tier = 1;
    if (tier) suggestScored.push({ tier, label: n.label, id: n.id });
  }
  suggestScored.sort((a, b) => b.tier - a.tier || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0) || (a.id < b.id ? -1 : 1));
  return suggestScored.slice(0, maxSuggestions).map((s) => s.id);
}

const unionSorted = (ids, adj) => {
  const out = new Set();
  for (const id of ids) for (const x of (adj.get(id) || [])) out.add(x);
  return [...out].sort();
};
// Pick the canonical survivor of a merge cluster: most callers (least disruptive to keep), tie ->
// smallest loc, tie -> lexicographically smallest id. Deterministic. Shared by optimize + codemod.
export function chooseCanonical(index, ids) {
  return ids.slice().sort((a, b) => {
    const ca = index.callIn.get(a)?.size || 0, cb = index.callIn.get(b)?.size || 0;
    if (cb !== ca) return cb - ca;
    const la = index.byId.get(a)?.loc || 0, lb = index.byId.get(b)?.loc || 0;
    if (la !== lb) return la - lb;
    return a < b ? -1 : a > b ? 1 : 0;
  })[0];
}

export const callersOf = (index, ids) => unionSorted(ids, index.callIn);
export const calleesOf = (index, ids) => unionSorted(ids, index.callOut);
export const testersOf = (index, ids) => unionSorted(ids, index.testIn); // F4: tests exercising a symbol
export const importersOf = (index, ids) => unionSorted(ids, index.importIn); // symbols that import a symbol
export const refsOf = (index, ids) => unionSorted(ids, index.refIn); // symbols using a class via instanceof / static method

// Every distinct symbol that DEPENDS on a target, across all in-edge kinds (call ∪ import ∪ inherit ∪
// test ∪ ref) — the "who would I have to touch if I changed this?" set. Unlike callersOf (call-only),
// this surfaces cross-file importers, subclasses, and instanceof/static-method users an agent must
// update on a refactor. Deterministic.
export const dependentsOf = (index, ids) => {
  const out = new Set();
  for (const adj of [index.callIn, index.importIn, index.inheritIn, index.testIn, index.refIn])
    for (const id of ids) for (const x of (adj.get(id) || [])) out.add(x);
  return [...out].sort();
};

// Fan-in of one node: reverse call edges, optionally + reverse imports (the "how depended-on is
// this?" number every ranking uses — one definition, so consumers can't drift).
export const fanInOf = (index, id, withImports = false) =>
  (index.callIn.get(id)?.size || 0) + (withImports ? (index.importIn.get(id)?.size || 0) : 0);

// Transitive reverse-call closure (blast radius) from all seeds, excluding the seeds themselves.
export function impactOf(index, seedIds) {
  const seeds = new Set(seedIds);
  const visited = new Set(seedIds);
  const queue = [...seedIds];
  while (queue.length) {
    const cur = queue.shift();
    // reverse-reachability over callers AND subclasses: changing a node affects what calls it and
    // what inherits from it.
    const upstream = [...(index.callIn.get(cur) || []), ...(index.inheritIn?.get(cur) || [])];
    for (const dep of upstream) {
      if (!visited.has(dep)) { visited.add(dep); queue.push(dep); }
    }
  }
  return [...visited].filter((id) => !seeds.has(id)).sort();
}

// F5: map changed line-ranges to the symbols they touch, plus blast radius. hunks =
// [{ file, ranges:[[start,end],...] }]; ranges null/empty = the whole file. A node is "changed"
// iff its recorded span [line, line+loc-1] intersects a changed range — best-effort, inheriting
// bodyEnd's clamp limits (can under-select on truncated bodies; documented in review.mjs).
export function reviewImpact(graph, hunks) {
  const index = buildIndex(graph);
  const byFile = new Map();
  for (const h of hunks) {
    if (!byFile.has(h.file)) byFile.set(h.file, []);
    if (h.ranges == null || h.ranges.length === 0) byFile.get(h.file).push(null);
    else for (const r of h.ranges) byFile.get(h.file).push(r);
  }
  const changed = [];
  for (const n of graph.nodes) {
    const rs = byFile.get(n.file);
    if (!rs) continue;
    const start = n.line, end = n.line + (n.loc || 1) - 1;
    if (rs.some((r) => r == null || !(end < r[0] || start > r[1]))) changed.push(n.id);
  }
  changed.sort();
  const blast = impactOf(index, changed);
  const domainsTouched = [...new Set(changed.map((id) => index.byId.get(id)?.domain || 'unassigned'))].sort();
  const callerCounts = changed.map((id) => ({ id, callers: index.callIn.get(id)?.size || 0 })).sort((a, b) => b.callers - a.callers || (a.id < b.id ? -1 : 1));
  return { changedSymbols: changed, blastRadius: { count: blast.length, ids: blast }, domainsTouched, callerCounts };
}

// File-level dependency cycles: strongly-connected components of size >= 2 in the file graph built
// from call+import edges. ITERATIVE Tarjan (explicit work stack) so deep graphs can't overflow the
// JS call stack. Deterministic: neighbors and the final list are sorted.
export function fileCycles(graph) {
  const fileOf = new Map(graph.nodes.map((n) => [n.id, n.file]));
  const adj = new Map();
  const files = new Set();
  for (const e of graph.edges) {
    if (e.kind !== 'call' && e.kind !== 'import' && e.kind !== 'inherit' && e.kind !== 'ref') continue;
    const f = fileOf.get(e.from), t = fileOf.get(e.to);
    if (!f || !t || f === t) continue;
    files.add(f); files.add(t);
    if (!adj.has(f)) adj.set(f, new Set());
    adj.get(f).add(t);
  }
  const neigh = (v) => [...(adj.get(v) || [])].sort();
  const idx = new Map(), low = new Map(), onStack = new Set(), sccStack = [];
  const out = [];
  let counter = 0;
  for (const root of [...files].sort()) {
    if (idx.has(root)) continue;
    idx.set(root, counter); low.set(root, counter); counter++; sccStack.push(root); onStack.add(root);
    const work = [{ v: root, ns: neigh(root), i: 0 }];
    while (work.length) {
      const frame = work[work.length - 1];
      if (frame.i < frame.ns.length) {
        const w = frame.ns[frame.i++];
        if (!idx.has(w)) {
          idx.set(w, counter); low.set(w, counter); counter++; sccStack.push(w); onStack.add(w);
          work.push({ v: w, ns: neigh(w), i: 0 });
        } else if (onStack.has(w)) {
          low.set(frame.v, Math.min(low.get(frame.v), idx.get(w)));
        }
      } else {
        if (low.get(frame.v) === idx.get(frame.v)) {
          const comp = []; let w;
          do { w = sccStack.pop(); onStack.delete(w); comp.push(w); } while (w !== frame.v);
          if (comp.length >= 2) out.push(comp.sort());
        }
        work.pop();
        if (work.length) {
          const parent = work[work.length - 1].v;
          low.set(parent, Math.min(low.get(parent), low.get(frame.v)));
        }
      }
    }
  }
  return out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

// Dead-code candidates: no incoming call|import edge AND not exported. Sorted by id.
export function orphans(graph, index) {
  return graph.nodes
    .filter((n) => n.kind !== 'module' && !index.hasIncoming.has(n.id) && !n.exports)
    .map((n) => ({ id: n.id, file: n.file, domain: n.domain }))
    .sort(byIdLt);
}

// Edges-only structural regressions between two snapshots — the fast subset the post-edit hook
// checks (re-extraction gives nodes+edges, not domains/overlaps): a file-level cycle present in
// `after` but not `before`, and a symbol that EXISTS in both but lost ALL its callers (deleting a
// symbol entirely is not a regression — only a surviving-but-orphaned one is). Duplication and
// coupling deltas need the full pipeline; that stays diff.mjs.
export function structuralRegressions(before, after) {
  const b = normalizeGraph(before), a = normalizeGraph(after);
  const cycleKey = (c) => c.join('|');
  const beforeCycles = new Set(fileCycles(b).map(cycleKey));
  const newCycles = fileCycles(a).filter((c) => !beforeCycles.has(cycleKey(c)));
  const bi = buildIndex(b), ai = buildIndex(a);
  const afterIds = new Set(a.nodes.map((n) => n.id));
  const lostCallers = [];
  for (const [id, callers] of bi.callIn) {
    if (callers.size && afterIds.has(id) && !(ai.callIn.get(id)?.size)) lostCallers.push(id);
  }
  return { newCycles, lostCallers: lostCallers.sort() };
}

// Pure structural edit simulation — models delete / merge / move on a DEEP COPY of the graph and
// never mutates its argument, so simulate-edit and optimize build the hypothetical graph through
// ONE path (codeweb dogfooding "logic lives once"). Returns a normalized graph; overlaps are
// dropped (they'd be stale — recompute via the pipeline if needed).
//   op = { kind:'delete', ids:[...] } | { kind:'merge', ids:[...], into } | { kind:'move', id, to }
export function applyEdit(graph, op) {
  const g = normalizeGraph(structuredClone(graph)); // clone first: normalizeGraph mutates, the input must not change
  const base = { meta: g.meta, domains: g.domains, overlaps: [] };
  if (op.kind === 'delete') {
    const drop = new Set(op.ids);
    return normalizeGraph({ ...base,
      nodes: g.nodes.filter((n) => !drop.has(n.id)),
      edges: g.edges.filter((e) => !drop.has(e.from) && !drop.has(e.to)) });
  }
  if (op.kind === 'move') {
    return normalizeGraph({ ...base,
      nodes: g.nodes.map((n) => (n.id === op.id ? { ...n, file: op.to } : n)),
      edges: g.edges });
  }
  if (op.kind === 'merge') {
    const copies = new Set(op.ids);
    const map = (id) => (copies.has(id) ? op.into : id);
    const nodes = g.nodes.filter((n) => !(copies.has(n.id) && n.id !== op.into));
    const seen = new Set(); const edges = [];
    for (const e of g.edges) {
      const from = map(e.from), to = map(e.to);
      if (from === to) continue;               // self-loop (incl. merged-into-itself) -> dropped
      const k = `${from} ${to} ${e.kind}`;
      if (seen.has(k)) continue; seen.add(k);   // de-dup redirected edges
      edges.push({ from, to, kind: e.kind });
    }
    return normalizeGraph({ ...base, nodes, edges });
  }
  throw new Error(`applyEdit: unknown op kind '${op && op.kind}'`);
}
