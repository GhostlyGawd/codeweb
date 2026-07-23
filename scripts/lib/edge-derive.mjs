// codeweb per-file edge derivation (finding #40, WS-H T-40.1) — the call/ref/inherit precision
// gate lifted OUT of the extractor orchestrator into a pure factory, import-resolve.mjs's proven
// template (explicit injected ctx, zero module-global state, body moved verbatim). Leaf module:
// imports only pure siblings (lang-rules/graph-ops/enclosing, each themselves node:path-only), so
// the orchestrator importing it introduces no cycle. Behavior is byte-identical to the old inline
// function — pinned by tests/edge-derive.test.mjs (seam) + IE-EQUIVALENCE + the P1 self-map cmp.
//
// Free-variable audit re-derived against the CURRENT engine (post WS-B/C/D), NOT the spec-time
// table: lib-local imports of pure modules — KEYWORDS, parseSignature (lang-rules), isTestFile
// (graph-ops), buildInnermostIndex (enclosing); injected ctx — byName, pkgOf, roleFor (#10's ref
// role-gate), resolveFileMember (import-resolve method), closureLocalIds (WS-D-review magnet fix),
// legacyFallback (orchestrator keeps the env read). idFile is DEFINED here and imported back by the
// orchestrator (one truth for the id->file split). #17's per-file `cand` collection and return
// field move WITH the body; #19 edge interning + #17 delta/dirty-label logic stay orchestration.

import { KEYWORDS, parseSignature } from './lang-rules.mjs';
import { isTestFile } from './graph-ops.mjs';
import { buildInnermostIndex } from './enclosing.mjs';
import { importCandidates } from './import-resolve.mjs'; // finding #11: the ONE entry-candidate list (pub walk shares it)

// Derive the file path from a node id (`<file>:<label>`); ids use '/' in paths and ':' only as the
// label separator, so the last ':' splits them. (One truth — the orchestrator imports this back.)
export const idFile = (id) => id.slice(0, id.lastIndexOf(':'));

/**
 * Factory over the injected resolution context. `deriveFileEdges` derives ONE file's edges
 * (call/ref/inherit), from-side = its own symbols or its <module> node; pure w.r.t. the file,
 * returns {edges, hasModule, ambiguous, short, cand}. The precision gate (alias > same-file >
 * unique-in-package, drop-ambiguous) is unchanged — only the plumbing moved so it is cacheable
 * per file (orchestrator) and callable in-process (tests + the in-process hook).
 */
export function createEdgeDeriver(ctx) {
  const { byName, pkgOf, roleFor, resolveFileMember, closureLocalIds, legacyFallback } = ctx;

  function deriveFileEdges(r, lines, ranges, aliasMap, nsAliasMap, classAliasMap) {
    const local = []; const localSet = new Set();
    let hasModule = false, ambiguous = 0, shortDropped = 0;
    const isPy = r.endsWith('.py');
    // finding #17 (T-17.1): the file's CANDIDATE name set — every name reaching addEdge, recorded
    // after the KEYWORDS return and BEFORE the aliased/byName gate, so alias locals, decl-line
    // self-captures, and names that resolved to NOTHING this run are all included (an unresolvable
    // name is exactly what a later-added symbol turns into an edge). Qualified-name scans
    // (csBase/pyBases) contribute what addEdge receives — the split tail. Collected from the SAME
    // masked lines the edges derive from, so cand and edges cannot skew across mask versions.
    const cand = new Set();
    // finding #21 (T-21.1): innermost-range-per-line precompute — the old per-call linear scan over
    // ALL ranges made big generated/hub files quadratic (8k-fn file: addEdge 50.8 % self). One
    // O(lines + R log R) sweep at entry; lookup O(1); property-pinned identical (incl. the
    // duplicate-start tie-break) in tests/enclosing-index.test.mjs. Zero behavior change —
    // addEdge/addResolved consume the same winning range objects.
    const innermost = buildInnermostIndex(ranges, lines.length);
    const enclosing = (lineNo) => (lineNo <= lines.length && innermost[lineNo]) || null;
    // Round 2, finding #10 (T-10.2/T-10.4): declaration START lines + per-range signature tokens.
    // refRe never scans a decl line (24% of self-map ref edges were fabricated there — `function
    // metrics(g) {` emitted a ref from metrics to a test file's global g), and every identifier
    // token in a range's signature becomes a SHADOW set for the fallback path: a bare use under a
    // binding IS the binding (a call through a param invokes the param's value, never the global).
    // sig.raw over-collects (destructure keys, default-value exprs, TS annotations) — that only
    // suppresses fallback edges, precision-safe by construction. Multi-line signatures: when the
    // param list opened at/after the name doesn't balance on the decl line, continuation lines keep
    // the refRe skip AND sweep their tokens until the cumulative paren balance closes. Local maps
    // only — `ranges` objects also live in the scan cache and must not grow non-JSON state.
    const startLines = new Set(ranges.map((rg) => rg.start));
    const paramsOf = new Map(); // range -> Set(identifier tokens in its signature)
    const sweepInto = (set, s) => { for (const t of s.match(/[A-Za-z_$][\w$]*/g) || []) set.add(t); };
    // Unbalanced paren depth of `name`'s param list on its decl line (0 = balanced or no list).
    const sigSpill = (ln, name, set) => {
      const at = ln.indexOf(name);
      if (at === -1) return 0;
      const open = ln.indexOf('(', at + name.length);
      if (open === -1) return 0;
      let depth = 0;
      for (let k = open; k < ln.length; k++) {
        if (ln[k] === '(') depth++;
        else if (ln[k] === ')') { depth--; if (depth <= 0) return 0; }
      }
      sweepInto(set, ln.slice(open + 1)); // spilled: parseSignature returned null, sweep the tail
      return depth;
    };
    for (const rg of ranges) {
      const set = new Set();
      const sig = parseSignature(lines[rg.start - 1] || '', rg.name, isPy);
      if (sig) sweepInto(set, sig.raw);
      paramsOf.set(rg, set);
    }
    // Round 2, finding #12: every declaration start line per NAME. addEdge skips a match whose name
    // has a declaration starting on that line — a getter/setter pair or an overload impl line used to
    // be scanned as a CALL with the class as scope (`Widget -> Widget.value` phantom callers, hiding
    // accessors from deadcode). Generalizes the old own-start-line guard (caller.name === name at
    // caller.start), which this strictly subsumes. addEdge ONLY — addResolved stays untouched so an
    // ns-alias member call ON a decl line still edges; and the guard keys on the matched NAME, so the
    // setter's normalize(v) call on its own decl line still edges from the @line id.
    const declStarts = new Map(); // name -> Set(1-based start lines)
    for (const rg of ranges) { let s = declStarts.get(rg.name); if (!s) declStarts.set(rg.name, s = new Set()); s.add(rg.start); }
    const sameFileByName = new Map(ranges.map((rg) => [rg.name, rg.id]));
    const sameFileClasses = new Map(ranges.filter((rg) => rg.kind === 'class').map((rg) => [rg.name, rg.id]));
    // The CLASS node a name refers to (imported class alias OR a same-file class) — for ref edges from
    // `instanceof X` and `X.staticMethod()`. Null for non-classes (an object alias like `utils`).
    const classOf = (name) => (classAliasMap && classAliasMap.get(name)) || sameFileClasses.get(name) || null;
    const addEdge = (lineIdx, name, kind = 'call') => {
      if (KEYWORDS.has(name)) return;
      cand.add(name); // finding #17: pre-gate — see the declaration above
      const aliased = aliasMap && aliasMap.get(name);
      if (!aliased && !byName.has(name)) return;
      if (declStarts.get(name)?.has(lineIdx + 1)) return; // any same-named declaration line — finding #12 (subsumes the old own-definition guard)
      const caller = enclosing(lineIdx + 1);
      let callerId;
      if (caller) callerId = caller.id;
      else { callerId = r + ':<module>'; hasModule = true; } // module/top-level scope
      let calleeId = aliased || sameFileByName.get(name);
      if (!calleeId) {
        if (kind === 'call' || kind === 'ref') {
          // finding #10 (T-10.4): PARAM SHADOW — a bare name token-bound by the signature of ANY
          // enclosing range never reaches the fallback (alias/same-file resolution already missed;
          // this is shadowing semantics, per BINDING, not per name-per-file — a sibling without the
          // param keeps its edge). Kills the body-use half of the parameter-magnet class.
          const lineNo = lineIdx + 1;
          for (const rg of ranges) {
            if (lineNo >= rg.start && lineNo <= rg.end && paramsOf.get(rg).has(name)) { ambiguous++; return; }
          }
          // finding #10 (T-10.4): >=3-CHAR GUARD — 1-2-char bare names are the measured magnet
          // class (234 self-map ref edges into 8 one-letter test/bench symbols) and had ZERO
          // legitimate cross-file bare-fallback in-edges on any measured corpus (the 4 short
          // product symbols all resolve same-file; Ruby's cross-file bare reach is method-gated
          // below). NOT silent: counted in `shortDropped`, surfaced in the banner as
          // "(N short-name)" — a future real 1-2-char cross-file symbol shows up there, and the
          // guard is revisited only on that evidence.
          if (name.length < 3) { ambiguous++; shortDropped++; return; }
        }
        // package-scoped unique-name fallback: resolve only within the caller's package (imports
        // handle legitimate cross-package calls; cross-package bare-name matches are collisions).
        const defs = byName.get(name) || [];
        const pkg = pkgOf(r);
        let inPkg = defs.filter((d) => pkgOf(idFile(d)) === pkg);
        // #14: in Ruby/PHP a bare name can NEVER legitimately reach another file's owner-qualified
        // METHOD (a method needs a receiver: implicit self is same-class, $obj-> needs a type) —
        // that attribution belongs to the dispatch tier, which has the receiver evidence. Without
        // this, `helper(1)` in class A wired to B.helper across files on a name coincidence.
        if (/\.(rb|php)$/.test(r)) inPkg = inPkg.filter((d) => { const lbl = d.slice(d.lastIndexOf(':') + 1); return !lbl.includes('.') || idFile(d) === r; });
        // WS-D review — closure-local magnet: a bare name in ANOTHER file can never lexically reach
        // a symbol nested inside a function body (see closureLocalIds above; the `dep` CI incident).
        // Same-file defs stay eligible (belt — sameFileByName resolves them before this point).
        inPkg = inPkg.filter((d) => idFile(d) === r || !closureLocalIds.has(d));
        if (inPkg.length === 1) {
          // finding #10 (T-10.3): ROLE-GATE the unique-global fallback for ref kinds — product
          // never ref-resolves into test/bench/fixture code. REJECT-form, not filter-form: a name
          // with one product def among several defs stays an ambiguous DROP (filter-form would
          // fabricate a product->product edge from the collision — byName['rel'] on the self-map
          // is exactly that trap). Mirror of the test->product relabel below, which is BY
          // CONSTRUCTION one-directional: test/bench->product edges become kind `test` and power
          // testIn/coverage — never gate that direction. Role truth is roleFor (rules overrides +
          // roleOf), the same truth stamped on nodes.
          if (kind === 'ref' && roleFor(r) === 'product' && roleFor(idFile(inPkg[0])) !== 'product') { ambiguous++; return; }
          calleeId = inPkg[0];
        }
        else if (legacyFallback) calleeId = defs[0];
        else { ambiguous++; return; }
      }
      if (!calleeId || calleeId === callerId) return;
      const edgeKind = ((kind === 'call' || kind === 'ref') && isTestFile(r) && !isTestFile(idFile(calleeId))) ? 'test' : kind;
      const key = callerId + ' ' + calleeId + ' ' + edgeKind;
      if (localSet.has(key)) return;
      localSet.add(key);
      local.push({ from: callerId, to: calleeId, kind: edgeKind, weight: 1 });
    };
    // Push an edge to an ALREADY-RESOLVED callee id — used for namespace/default import member-access,
    // where the callee is resolved via the import binding rather than bare-name lookup.
    const addResolved = (lineIdx, calleeId, kind = 'call') => {
      const caller = enclosing(lineIdx + 1);
      let callerId;
      if (caller) callerId = caller.id; else { callerId = r + ':<module>'; hasModule = true; }
      if (!calleeId || calleeId === callerId) return;
      const edgeKind = ((kind === 'call' || kind === 'ref') && isTestFile(r) && !isTestFile(idFile(calleeId))) ? 'test' : kind;
      const key = callerId + ' ' + calleeId + ' ' + edgeKind; // call & ref to the same target coexist
      if (localSet.has(key)) return;
      localSet.add(key);
      local.push({ from: callerId, to: calleeId, kind: edgeKind, weight: 1 });
    };
    const callRe = /([A-Za-z_$][\w$]*)\s*\(/g;
    const refRe = /[(,]\s*([A-Za-z_$][\w$]*)\s*(?=[,)])/g;
    // finding #12: body-less TS overload stubs have NO range, so declStarts can't cover them. A line
    // shaped `name(params)[: Ret];` whose ENCLOSING range is a CLASS is a signature, not code — skip
    // callRe AND refRe there (refRe on stub params would fabricate ref edges to short repo symbols,
    // the #10 magnet class). Name-independent, one regex test per line — no per-match RegExp. The
    // class gate narrows the spec's unconditional line guard: the same shape inside a FUNCTION body
    // is an ordinary call statement (`finish(code);` — review-measured: the unconditional guard hits
    // 675 tracked js/ts lines, 382 of them non-keyword-led statements) whose edges must survive;
    // class bodies cannot contain statements, so the gate suppresses nothing real — with ONE known
    // residual (review-verified): a bare call statement inside an ES2022 `static {}` block is
    // stub-shaped with a class enclosing, so its class-attributed edge is suppressed. Accepted:
    // rare construct, and pre-#12 that edge mis-attributed the call to the class node anyway.
    // Module-level TS overload stubs need no guard at all — each stub line matches the function rule
    // in both tiers, so declStarts covers it (pinned in tests/accessor-overload-truth.test.mjs).
    const STUB_LINE_RE = /^\s*(?:(?:public|private|protected|static|readonly|abstract|override|async)\s+)*[A-Za-z_$][\w$]*\s*\([^;{]*\)\s*(?::[^{;]*)?;\s*$/;
    const extendsRe = /\bclass\s+[A-Za-z_$][\w$]*\s+extends\s+([A-Za-z_$][\w$]*)/g;
    const csBaseRe = /\b(?:class|struct|record)\s+[A-Za-z_]\w*(?:<[^>]*>)?\s*:\s*([A-Za-z_][\w.]*)/g; // C# `class A : Base, IFace` -> Base
    const isCs = r.endsWith('.cs');
    const instanceofRe = /\binstanceof\s+([A-Za-z_$][\w$]*)/g; // `x instanceof X` -> ref to class X
    const pyBasesRe = /^\s*class\s+[A-Za-z_]\w*\s*\(([^)]*)\)/;
    // finding #10 (T-10.2): >0 while inside a spilled multi-line signature; the ranges it belongs to
    // keep collecting param tokens until the cumulative paren balance closes.
    let contDepth = 0, contRanges = null;
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      // finding #10 (T-10.2): signature-line + continuation state — decided BEFORE any scan (and
      // before the stub-line `continue`, which must not desync the balance). `sigLine` suppresses
      // refRe ONLY; callRe/inherit/instanceof scans are untouched. Accepted recall loss: a ref
      // argument inside a single-line decl+body (`const f = () => emit(handler)`) — decl lines are
      // where the measured fabrication lives, body-line refs are unaffected.
      let sigLine = false;
      if (contDepth > 0) {
        sigLine = true;
        for (const rg of contRanges) sweepInto(paramsOf.get(rg), ln);
        for (let k = 0; k < ln.length; k++) { if (ln[k] === '(') contDepth++; else if (ln[k] === ')') contDepth--; }
        if (contDepth <= 0) { contDepth = 0; contRanges = null; }
      } else if (startLines.has(i + 1)) {
        sigLine = true;
        for (const rg of ranges) {
          if (rg.start !== i + 1) continue;
          const d = sigSpill(ln, rg.name, paramsOf.get(rg));
          if (d > 0) { contDepth = d; (contRanges = contRanges || []).push(rg); }
        }
      }
      if (isPy) {
        const pm = pyBasesRe.exec(ln);
        if (pm) for (const part of pm[1].split(',')) {
          const base = part.trim();
          if (!base || base.includes('=')) continue;
          const name = base.replace(/^.*\./, '');
          if (/^[A-Za-z_]\w*$/.test(name)) addEdge(i, name, 'inherit');
        }
      } else {
        extendsRe.lastIndex = 0; let xm;
        while ((xm = extendsRe.exec(ln))) addEdge(i, xm[1], 'inherit');
        if (isCs) {
          csBaseRe.lastIndex = 0;
          while ((xm = csBaseRe.exec(ln))) { const base = xm[1].split('.').pop(); if (base) addEdge(i, base, 'inherit'); }
        }
      }
      if (STUB_LINE_RE.test(ln) && enclosing(i + 1)?.kind === 'class') continue; // overload-stub line (finding #12): no calls, no refs
      callRe.lastIndex = 0; let m;
      while ((m = callRe.exec(ln))) {
        // Round 2, finding #9: `...fn(` (the char before the `.` is another `.`) is a SPREAD call,
        // not a member call — the backward identifier match below can never succeed on dots, so the
        // member branch silently dropped the edge (trend.mjs:metrics showed 0 callers). Fall through
        // to addEdge instead. Verified non-cases: `a?.b(` has [m.index-2]==='?' (member branch,
        // unchanged); `...obj.fn(` matches at `fn` with [idx-2]==='j' (member branch, correct).
        // Accepted noise: `1..toString(` and the syntax error `x...y(` now reach addEdge — both
        // resolve only if the name is a repo symbol; harmless.
        if (ln[m.index - 1] === '.' && ln[m.index - 2] !== '.') {
          // member call obj.fn(): resolve ONLY when obj is a namespace/default import alias (a param or
          // local obj.method() must stay unresolved — see reference-edges PRECISION). This recovers the
          // cross-file usage the bare-name pass can't see (util.merge(), AxiosHeaders.from()).
          const before = ln.slice(0, m.index - 1);
          const om = /([A-Za-z_$][\w$]*)$/.exec(before);
          if (om) {
            if (nsAliasMap && nsAliasMap.has(om[1])) {
              const calleeId = resolveFileMember(nsAliasMap.get(om[1]), m[1]);
              if (calleeId) addResolved(i, calleeId, 'call');
            }
            const cls = classOf(om[1]);
            if (cls) addResolved(i, cls, 'ref'); // X.staticMethod() -> the caller depends on the class X
            // X.member.call(...) / X.member.apply(...): the real invocation is of X-file:member.
            if ((m[1] === 'call' || m[1] === 'apply') && nsAliasMap) {
              const chain = /([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)$/.exec(before);
              if (chain && nsAliasMap.has(chain[1])) {
                const calleeId = resolveFileMember(nsAliasMap.get(chain[1]), chain[2]);
                if (calleeId) addResolved(i, calleeId, 'call');
              }
            }
          }
          continue; // not an import-alias member -> stay precision-safe (no edge)
        }
        addEdge(i, m[1]);
      }
      if (!sigLine) { // finding #10 (T-10.2): a signature line's params are bindings, not references
        refRe.lastIndex = 0;
        while ((m = refRe.exec(ln))) addEdge(i, m[1], 'ref'); // a bare identifier ARGUMENT is a reference (callback/value), not an invocation
      }
      instanceofRe.lastIndex = 0;
      while ((m = instanceofRe.exec(ln))) { const cls = classOf(m[1]); if (cls) addResolved(i, cls, 'ref'); }
    }
    return { edges: local, hasModule, ambiguous, short: shortDropped, cand: [...cand].sort() };
  }

  return { deriveFileEdges };
}

// finding #40 (WS-H T-40.2): the two remaining global-resolution passes over the assembled node
// universe join this cohesive lib (both are ~30-45-line pure passes; import-resolve stays the
// import-binding home). Neither mutates the graph — each RETURNS what to apply, so the orchestrator
// owns the single write (the pub-walk never reads `pub`, so returning ids-to-stamp is order-safe).

/**
 * v10 PUBLIC API walk — symbols reachable from a package entrypoint (package.json main/module/
 * browser/bin/exports, followed through re-export chains) have callers the graph CANNOT see. This
 * pass does NO fs: the caller injects `readPkg(dir) -> parsed package.json object | null` and the
 * pre-statted `sources` membership map. Returns the Set of node ids to stamp `pub: true`
 * (order-safe: the walk never reads `pub`). Moved verbatim from the extractor; `sources`/
 * `importCandidates` membership + re-export-chain BFS unchanged.
 */
export function markPublicApi({ nodes, relFiles, pkgOf, sources, reExportEdges, readPkg }) {
  const stamp = new Set();
  const entryFiles = new Set();
  const pkgDirs = new Set(['']);
  for (const rf of relFiles) pkgDirs.add(pkgOf(rf));
  const addEntry = (dir, spec) => {
    if (typeof spec !== 'string' || !spec || spec.endsWith('.d.ts') || spec.endsWith('.json')) return;
    const base = (dir ? dir + '/' : '') + spec.replace(/^\.\//, '');
    // finding #11: the ONE candidate list, shared with resolveImport. Membership stays the caller's:
    // `sources` spans every statted file. `.tsx/.jsx` probe BEFORE index candidates (TS resolution).
    for (const cand of importCandidates(base)) {
      const norm = cand.replace(/\/{2,}/g, '/');
      if (sources[norm]) { entryFiles.add(norm); return; }
    }
  };
  const collectExports = (dir, v) => {
    if (typeof v === 'string') addEntry(dir, v);
    else if (v && typeof v === 'object') for (const k of Object.keys(v)) { if (k !== 'types') collectExports(dir, v[k]); }
  };
  for (const dir of pkgDirs) {
    const pkg = readPkg(dir); if (!pkg) continue;
    addEntry(dir, pkg.main); addEntry(dir, pkg.module); if (typeof pkg.browser === 'string') addEntry(dir, pkg.browser);
    if (typeof pkg.bin === 'string') addEntry(dir, pkg.bin);
    else if (pkg.bin && typeof pkg.bin === 'object') for (const v of Object.values(pkg.bin)) addEntry(dir, v);
    collectExports(dir, pkg.exports);
  }
  if (entryFiles.size) {
    const byIdMut = new Map(nodes.map((n) => [n.id, n]));
    const reOut = new Map(); // fromModuleId -> [toIds]
    for (const [a, b] of reExportEdges) { if (!reOut.has(a)) reOut.set(a, []); reOut.get(a).push(b); }
    const seenFiles = new Set(), queue = [...entryFiles];
    for (let qi = 0; qi < queue.length; qi++) { // index-pointer, not shift(): O(frontier) pops go quadratic (finding 9)
      const file = queue[qi];
      if (seenFiles.has(file)) continue;
      seenFiles.add(file);
      for (const n of nodes) if (n.file === file && n.exports && n.kind !== 'module') stamp.add(n.id);
      for (const to of reOut.get(file + ':<module>') || []) {
        if (to.endsWith(':<module>')) queue.push(to.slice(0, -':<module>'.length));
        else { const n = byIdMut.get(to); if (n && n.exports) stamp.add(n.id); }
      }
    }
  }
  return stamp;
}

/**
 * Typed-receiver dispatch (Java/C#): resolve each {from, recvType, method} intent against the WHOLE
 * graph — the receiver's class must resolve to exactly ONE file and the qualified method must be a
 * real node; anything ambiguous or absent is dropped and counted, never guessed. Returns
 * {edges, wired, dropped}; tri-keys are appended to the caller-owned `existingTriKeys` (today's
 * semantics — the caller dedups the appended edges against the rest of the edge set). Moving it here
 * mechanically clears #40's named shadowing smells (`rel` loop-var vs the `rel()` fn; a `files`
 * local vs the global).
 */
export function resolveTypedIntents({ intentsByFile, nodeIdSet, existingTriKeys }) {
  const edges = [];
  let wired = 0, dropped = 0;
  if (!intentsByFile.size) return { edges, wired, dropped };
  const classFiles = new Map(); // class name -> Set(rel files that define it, per owner-qualified ids)
  for (const id of nodeIdSet) {
    const m = /^(.+):([A-Za-z_$][\w$]*)\.[^.]+$/.exec(id);
    if (!m) continue;
    if (!classFiles.has(m[2])) classFiles.set(m[2], new Set());
    classFiles.get(m[2]).add(m[1]);
  }
  for (const relFile of [...intentsByFile.keys()].sort()) {
    for (const it of intentsByFile.get(relFile)) {
      const defFiles = classFiles.get(it.recvType);
      if (!defFiles || defFiles.size !== 1) { dropped++; continue; } // unknown or ambiguous class -> never guess
      const toId = [...defFiles][0] + ':' + it.recvType + '.' + it.method;
      if (!nodeIdSet.has(toId) || !nodeIdSet.has(it.from) || it.from === toId) { dropped++; continue; }
      const kind = (isTestFile(idFile(it.from)) && !isTestFile(idFile(toId))) ? 'test' : 'call';
      const key = it.from + '\t' + toId + '\t' + kind;
      if (existingTriKeys.has(key)) continue;
      existingTriKeys.add(key);
      edges.push({ from: it.from, to: toId, kind, weight: 1 });
      wired++;
    }
  }
  return { edges, wired, dropped };
}
