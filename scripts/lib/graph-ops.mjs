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

// THE edge kinds that participate in file-level cycles — one truth for fileCycles, the merge
// simulator, and break-cycles' witness accounting (round 2, #23: fileCycles and
// createMergeSimulator each carried an inline copy of this set; a drift between them and a
// STRUCTURAL-only witness table is exactly the ref-subtlety trap the cheapestCuts property pins).
export const CYCLE_KINDS = new Set(['call', 'import', 'inherit', 'ref']);

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
    else if (wanted.length >= 3 && label.length >= 3 && (label.startsWith(wanted) || wanted.startsWith(label))) tier = 3;
    else if (wanted.length >= 3 && label.length >= 3 && (label.includes(wanted) || wanted.includes(label))) tier = 2;
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
// Reverse-reachability over callers AND subclasses: changing a node affects what calls it and
// what inherits from it. finding 9: index-pointer queue (shift() was O(frontier) per pop — O(n²)
// on big radii; measured 19.9s -> 0.3s on a 240k-node closure) and no per-visit array merge.
export function impactOf(index, seedIds) {
  const seeds = new Set(seedIds);
  const visited = new Set(seedIds);
  const queue = [...seedIds];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    const callers = index.callIn.get(cur);
    if (callers) for (const dep of callers) if (!visited.has(dep)) { visited.add(dep); queue.push(dep); }
    const subs = index.inheritIn?.get(cur);
    if (subs) for (const dep of subs) if (!visited.has(dep)) { visited.add(dep); queue.push(dep); }
  }
  return [...visited].filter((id) => !seeds.has(id)).sort();
}

// Count-only blast radius — impactOf without the materialize/filter/sort, for callers that use
// only `.length` (finding 9: risk paid the full sort per node and threw it away).
export function impactCountOf(index, seedIds) {
  const seeds = new Set(seedIds);
  const visited = new Set(seeds);
  const queue = [...seeds];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    const callers = index.callIn.get(cur);
    if (callers) for (const dep of callers) if (!visited.has(dep)) { visited.add(dep); queue.push(dep); }
    const subs = index.inheritIn?.get(cur);
    if (subs) for (const dep of subs) if (!visited.has(dep)) { visited.add(dep); queue.push(dep); }
  }
  return visited.size - seeds.size;
}

// finding 9: every node's blast radius in ONE pass. risk ranked nodes by impactOf(...).length —
// a fresh BFS per node, ~quadratic overall (measured 82.2s on a 15k-node/44k-edge graph; the SCC
// prototype computed identical sums in 0.75s at 20k). Method: Tarjan-condense the dependents
// graph (u -> its callers/subclasses — the exact direction impactOf walks; every id an edge
// mentions participates, node or not, matching BFS behavior on dangling edges), then propagate
// 64 source-components per pass through the condensation DAG in topological order with two
// Uint32 word masks — O(V·E/64) time, O(V) memory, no per-node BFS. blast(n) = |reach(scc(n))|-1
// (self excluded; same-cycle members included, exactly like impactOf). Returns Map(nodeId->count)
// for graph nodes. Property-pinned equal to per-node impactOf counts.
export function allBlastCounts(index) {
  // Universe: graph nodes plus every id the reverse adjacency mentions (dangling froms traverse too).
  const idx = new Map();
  const ids = [];
  const intern = (id) => {
    let i = idx.get(id);
    if (i === undefined) { i = ids.length; idx.set(id, i); ids.push(id); }
    return i;
  };
  for (const id of index.byId.keys()) intern(id);
  for (const adj of [index.callIn, index.inheritIn]) {
    for (const [to, froms] of adj) { intern(to); for (const f of froms) intern(f); }
  }
  const N = ids.length;
  const succ = ids.map((id) => {
    const out = [];
    const callers = index.callIn.get(id);
    if (callers) for (const d of callers) out.push(idx.get(d));
    const subs = index.inheritIn.get(id);
    if (subs) for (const d of subs) out.push(idx.get(d));
    return out;
  });

  // Iterative Tarjan over the int-indexed graph. Components complete descendants-first, so
  // DESCENDING component index = topological (ancestors-first) order of the condensation.
  const comp = new Int32Array(N).fill(-1);
  const low = new Int32Array(N);
  const num = new Int32Array(N).fill(-1);
  const onStack = new Uint8Array(N);
  const sccStack = [];
  const compSize = [];
  let counter = 0, nComp = 0;
  for (let root = 0; root < N; root++) {
    if (num[root] !== -1) continue;
    num[root] = low[root] = counter++; sccStack.push(root); onStack[root] = 1;
    const work = [[root, 0]];
    while (work.length) {
      const frame = work[work.length - 1];
      const v = frame[0];
      if (frame[1] < succ[v].length) {
        const w = succ[v][frame[1]++];
        if (num[w] === -1) {
          num[w] = low[w] = counter++; sccStack.push(w); onStack[w] = 1;
          work.push([w, 0]);
        } else if (onStack[w] && num[w] < low[v]) low[v] = num[w];
      } else {
        if (low[v] === num[v]) {
          let size = 0, w;
          do { w = sccStack.pop(); onStack[w] = 0; comp[w] = nComp; size++; } while (w !== v);
          compSize.push(size); nComp++;
        }
        work.pop();
        if (work.length) { const p = work[work.length - 1][0]; if (low[v] < low[p]) low[p] = low[v]; }
      }
    }
  }

  // Condensation adjacency, deduped.
  const cadj = Array.from({ length: nComp }, () => []);
  const seenEdge = new Set();
  for (let v = 0; v < N; v++) {
    const cv = comp[v];
    for (const w of succ[v]) {
      const cw = comp[w];
      if (cw === cv) continue;
      const key = cv * nComp + cw;
      if (!seenEdge.has(key)) { seenEdge.add(key); cadj[cv].push(cw); }
    }
  }

  // 64 components per pass: seed each with its own bit, flow masks ancestors-first along DAG
  // edges, then charge every component's node count to each bit present in its mask.
  const reach = new Float64Array(nComp); // node count reachable from each component, incl. itself
  const lo = new Uint32Array(nComp), hi = new Uint32Array(nComp);
  for (let base = 0; base < nComp; base += 64) {
    lo.fill(0); hi.fill(0);
    const width = Math.min(64, nComp - base);
    for (let b = 0; b < width; b++) { if (b < 32) lo[base + b] |= (1 << b) >>> 0; else hi[base + b] |= (1 << (b - 32)) >>> 0; }
    for (let cu = nComp - 1; cu >= 0; cu--) {
      const l = lo[cu], h = hi[cu];
      if (l === 0 && h === 0) continue;
      for (const cv of cadj[cu]) { lo[cv] |= l; hi[cv] |= h; }
    }
    for (let x = 0; x < nComp; x++) {
      const sx = compSize[x];
      let l = lo[x], h = hi[x];
      while (l) { reach[base + (31 - Math.clz32(l & -l))] += sx; l &= l - 1; }
      while (h) { reach[base + 32 + (31 - Math.clz32(h & -h))] += sx; h &= h - 1; }
    }
  }

  const out = new Map();
  for (const id of index.byId.keys()) out.set(id, reach[comp[idx.get(id)]] - 1);
  return out;
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
    if (!CYCLE_KINDS.has(e.kind)) continue;
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

// Round 2, #23 (T-23.1 seam): break-cycles' per-cycle candidate/verify logic, hoisted verbatim so
// the advisor keeps argv/IO/rendering only and the cut logic lives beside fileCycles (one truth).
// STRUCTURAL is deliberately NOT CYCLE_KINDS: candidates must be SEVERABLE dependencies
// (call/import/inherit — an edge you can invert, extract, or inject away), while `ref` is not
// severable advice but still closes cycles — so candidate selection uses STRUCTURAL and cycle
// verification counts ALL CYCLE_KINDS (a pair alive only via ref must survive a structural cut).
const STRUCTURAL = new Set(['call', 'import', 'inherit']);

/** For each file-level dependency cycle, the CHEAPEST verified file->file cut (or verified:false
 *  with a note when no single-pair cut breaks it). Returns break-cycles' `cycles` payload array. */
export function cheapestCuts(graph) {
  const fileOf = new Map(graph.nodes.map((n) => [n.id, n.file]));
  const structuralEdges = graph.edges.filter((e) => STRUCTURAL.has(e.kind));

  // fileCycles with a set of symbol edges removed — independent reconstruction, trusted primitive.
  function cyclesWithout(removeKeys) {
    return fileCycles({ ...graph, edges: graph.edges.filter((e) => !removeKeys.has(edgeKey(e))) });
  }

  return fileCycles(graph).map((cycle) => {
    const inCycle = new Set(cycle);
    // file->file dependencies WITHIN the cycle, with their underlying symbol edges
    const fe = new Map(); // "from\x00to" -> [edges]
    for (const e of structuralEdges) {
      const f = fileOf.get(e.from), t = fileOf.get(e.to);
      if (f && t && f !== t && inCycle.has(f) && inCycle.has(t)) {
        const k = `${f}\x00${t}`; if (!fe.has(k)) fe.set(k, []); fe.get(k).push(e);
      }
    }
    const candidates = [...fe.entries()].map(([k, edges]) => { const [fromFile, toFile] = k.split('\x00'); return { fromFile, toFile, weight: edges.length, edges }; })
      .sort((a, b) => a.weight - b.weight || (a.fromFile < b.fromFile ? -1 : a.fromFile > b.fromFile ? 1 : 0) || (a.toFile < b.toFile ? -1 : a.toFile > b.toFile ? 1 : 0));
    const meanWeight = candidates.length ? candidates.reduce((s, c) => s + c.weight, 0) / candidates.length : 0;
    const key = cycleKey(cycle);
    // pick the cheapest candidate whose removal actually breaks THIS cycle (verified)
    let chosen = null;
    for (const cand of candidates) {
      const rm = new Set(cand.edges.map(edgeKey));
      if (!cyclesWithout(rm).some((c) => cycleKey(c) === key)) { chosen = cand; break; }
    }
    if (chosen) return { files: cycle, meanWeight, verified: true, cut: { fromFile: chosen.fromFile, toFile: chosen.toFile, weight: chosen.weight, underlyingEdges: chosen.edges.map((e) => ({ from: e.from, to: e.to, kind: e.kind })) } };
    return { files: cycle, meanWeight, verified: false, cut: null, note: 'no single file->file edge cut breaks this cycle — needs a multi-edge cut or a restructure (extract a shared module)' };
  });
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
//
// Round 2, finding #18a: split into the BEFORE-side summary (computable once, at map time — the
// hook-baseline sidecar persists it) and the comparison against it, with structuralRegressions
// as their composition — one truth, three entry points, existing callers untouched.
const cycleKey = (c) => c.join('|');

/** The before-side digest: cycle keys + per-id caller counts (only ids with >= 1 caller — all the
 *  comparison consults). Computed on the normalizeGraph'd graph so cycle keys match composition. */
export function baselineSummary(graph) {
  const g = normalizeGraph(graph);
  const cycles = fileCycles(g).map(cycleKey);
  const bi = buildIndex(g);
  const callIn = {};
  for (const [id, callers] of bi.callIn) if (callers.size) callIn[id] = callers.size;
  return { cycles, callIn };
}

/** The after-side comparison against a summary ({cycles: [key...], callIn: {id: count}}). */
export function regressionsAgainstSummary(summary, after) {
  const a = normalizeGraph(after);
  const beforeCycles = new Set(summary.cycles);
  const newCycles = fileCycles(a).filter((c) => !beforeCycles.has(cycleKey(c)));
  const ai = buildIndex(a);
  const afterIds = new Set(a.nodes.map((n) => n.id));
  const lostCallers = [];
  for (const id of Object.keys(summary.callIn)) {
    if (afterIds.has(id) && !(ai.callIn.get(id)?.size)) lostCallers.push(id);
  }
  return { newCycles, lostCallers: lostCallers.sort() };
}

export function structuralRegressions(before, after) {
  return regressionsAgainstSummary(baselineSummary(before), after);
}

// finding 14: the Spec O-1 delta simulator, hoisted from optimize.mjs so EVERY merge chain stops
// cloning the whole graph + re-running full SCC per candidate (campaign measured 289ms/candidate
// at 20k nodes — ~29s for 100 candidates — on the exact pattern optimize had already replaced).
// A merge only changes file-pairs witnessed by loser-incident edges; a delete only removes its
// edges' witnesses. The table tracks pair -> witness count; simulate() hands the surviving pairs
// to the SAME fileCycles as a pseudo-graph (one node per file) — same SCC code, same ordering,
// byte-identical verdicts, no clone. commit()/commitDelete() advance the table so a cumulative
// plan (campaign's delete-then-merge chain) stays O(edges touched) end to end.
export function createMergeSimulator(graph) {
  const SEP = '\0'; // CYCLE_KINDS: the module-level export (one truth, round 2 #23)
  const fileOfId = new Map(graph.nodes.map((n) => [n.id, n.file]));
  const alias = new Map(); // committed merges: loser -> canonical (resolved transitively)
  const followAlias = (id) => { let cur = id, hop; while ((hop = alias.get(cur)) !== undefined) cur = hop; if (cur !== id) alias.set(id, cur); return cur; };
  const deadEdges = new Set(); // edges whose witness was consumed by a committed delete
  const incident = new Map();  // node id -> cycle-kind edges touching it (loser lists splice into the canonical on commit)
  const pairCount = new Map(); // file-pair -> number of witnessing edges
  const pk = (f, t) => f + SEP + t;
  for (const e of graph.edges) {
    if (!CYCLE_KINDS.has(e.kind)) continue;
    if (!incident.has(e.from)) incident.set(e.from, []);
    incident.get(e.from).push(e);
    if (e.to !== e.from) {
      if (!incident.has(e.to)) incident.set(e.to, []);
      incident.get(e.to).push(e);
    }
    const f = fileOfId.get(e.from), t = fileOfId.get(e.to);
    if (!f || !t || f === t) continue;
    pairCount.set(pk(f, t), (pairCount.get(pk(f, t)) || 0) + 1);
  }
  // Current pair an edge witnesses (through committed aliases), or null (dead / self / unfiled).
  const pairOf = (e) => {
    if (deadEdges.has(e)) return null;
    const a = followAlias(e.from), b = followAlias(e.to);
    if (a === b) return null;
    const f = fileOfId.get(a), t = fileOfId.get(b);
    if (!f || !t || f === t) return null;
    return pk(f, t);
  };
  const mergeDelta = (ids, into) => {
    const canonical = followAlias(into);
    const losers = new Set(ids.map(followAlias).filter((x) => x !== canonical));
    const touched = new Set();
    for (const id of losers) for (const e of incident.get(id) || []) touched.add(e);
    const removed = new Map(), added = new Map();
    for (const e of touched) {
      const before = pairOf(e);
      if (before) removed.set(before, (removed.get(before) || 0) + 1);
      if (deadEdges.has(e)) continue;
      const a0 = followAlias(e.from), b0 = followAlias(e.to);
      const a = losers.has(a0) ? canonical : a0, b = losers.has(b0) ? canonical : b0;
      if (a === b) continue; // self-loop after redirect — applyEdit drops these
      const f = fileOfId.get(a), t = fileOfId.get(b);
      if (!f || !t || f === t) continue;
      added.set(pk(f, t), (added.get(pk(f, t)) || 0) + 1);
    }
    return { losers, canonical, removed, added };
  };
  const cyclesOfPairs = (pairs) => {
    const files = new Set(); const edges = [];
    for (const key of pairs) {
      const [f, t] = key.split(SEP);
      files.add(f); files.add(t);
      edges.push({ from: f, to: t, kind: 'call' });
    }
    // pseudo-graph: one node per file, one call edge per surviving pair — fileCycles sees exactly
    // the adjacency the merged full graph would produce, through the same code path.
    return fileCycles({ nodes: [...files].map((f) => ({ id: f, file: f })), edges });
  };
  return {
    /** File cycles of the graph AFTER merging ids into `into` — no mutation, no clone. */
    simulate(ids, into) {
      const { removed, added } = mergeDelta(ids, into);
      const after = new Set();
      for (const [key, c] of pairCount) if (c - (removed.get(key) || 0) > 0) after.add(key);
      for (const key of added.keys()) after.add(key);
      return { cycles: cyclesOfPairs(after) };
    },
    /** File cycles of the CURRENT (committed) state. */
    currentCycles() {
      return cyclesOfPairs(new Set(pairCount.keys()));
    },
    /** Advance the table past a merge (campaign's accepted step). */
    commit(ids, into) {
      const { losers, canonical, removed, added } = mergeDelta(ids, into);
      for (const [key, c] of removed) { const left = (pairCount.get(key) || 0) - c; if (left > 0) pairCount.set(key, left); else pairCount.delete(key); }
      for (const [key, c] of added) pairCount.set(key, (pairCount.get(key) || 0) + c);
      for (const id of losers) {
        alias.set(id, canonical);
        const list = incident.get(id);
        if (list) { incident.set(canonical, (incident.get(canonical) || []).concat(list)); incident.delete(id); }
      }
    },
    /** Advance the table past node deletions (their edges stop witnessing pairs). */
    commitDelete(ids) {
      for (const id of ids) {
        const rid = followAlias(id);
        for (const e of incident.get(rid) || []) {
          if (deadEdges.has(e)) continue;
          const before = pairOf(e);
          deadEdges.add(e);
          if (before) { const left = pairCount.get(before) - 1; if (left > 0) pairCount.set(before, left); else pairCount.delete(before); }
        }
      }
    },
  };
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
