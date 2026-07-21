// codeweb import/re-export resolution (finding 25) — the one place cross-file names bind.
// A pure FACTORY over injected context: the extractor hands in its file universe (rel/relSet/
// absByRel), the per-file records (fileSyms + lazy textOf), the mask memo, and the discovered
// node id set; everything else — relative-import candidates, Python module resolution, JS/TS
// re-export chains (renamed + `export *`), Python from-import re-export tables, unique-member
// lookup, and per-file import BINDING — lives here with no module-global state and no IO of its
// own. Bodies moved verbatim from the extractor; resolution order and precision gates unchanged
// (pinned by the A/B fragment equivalence and the recall suites).

import { dirname, resolve } from 'node:path';

// A file's DEFAULT EXPORT, when it is a single named symbol defined in that file (`export default
// class X` / `export default function X` / `export default X;` / `export { X as default }` /
// `module.exports = X`). Returns its node id, else null (an object/array/expression default — e.g.
// `export default { merge, ... }` — has no single owning symbol, so a default import of it is a
// MODULE dependency). Lets a default import attribute its coarse edge to the real exported symbol
// (AxiosError) instead of an arbitrary anchor, while object-default barrels (utils) fall back to <module>.
export function defaultExportOf(r, text, names) {
  let m;
  if ((m = /export\s+default\s+(?:abstract\s+)?(?:async\s+)?(?:class|function\s*\*?)\s+([A-Za-z_$][\w$]*)/.exec(text)) && names.has(m[1])) return r + ':' + m[1];
  if ((m = /export\s*\{[^}]*?\b([A-Za-z_$][\w$]*)\s+as\s+default\b/.exec(text)) && names.has(m[1])) return r + ':' + m[1];
  if ((m = /export\s+default\s+([A-Za-z_$][\w$]*)\s*;/.exec(text)) && names.has(m[1])) return r + ':' + m[1];
  if ((m = /module\.exports\s*=\s*([A-Za-z_$][\w$]*)\s*;/.exec(text)) && names.has(m[1])) return r + ':' + m[1];
  return null;
}

export function createImportResolver({ rel: relPathOf, relSet, absByRel, fileSyms, textOf: recTextOf, maskedOnce: maskTextOf, nodeIdSet, nodes }) {
  // relPathOf/recTextOf/maskTextOf: the injected accessors are RENAMED at the destructure — their
  // new names are label-free across the whole self-map (a rename that lands on ANY existing
  // symbol name, e.g. bench-core's relOf, just moves the false edge to a new file).
  // callers' names (rel/textOf/maskedOnce) are real symbols in extract-symbols.mjs, and the
  // extractor's bare-name pass would read our calls as references INTO the orchestrator —
  // a false import-resolve -> extract-symbols edge closing a dependency cycle (the same
  // dogfood false-ref class as sourceReader's relPath rename).
// Spec Q4: a Python from-import is module-level code — the SITE (<module>) owns its import edge;
// the node is created on demand by ensureModuleNode when the edges are appended.
const pyImportOrigin = (r2) => r2 + ':<module>';
function resolveImport(fromAbs, spec) {
  if (!/^[.]/.test(spec)) return null; // local relative imports only
  let r = relPathOf(resolve(dirname(fromAbs), spec)).replace(/\\/g, '/');
  const cands = [r, r + '.js', r + '.mjs', r + '.cjs', r + '.ts', r + '.tsx', r + '.jsx', r + '/index.js', r + '/index.ts', r + '/index.mjs'];
  for (const c of cands) if (relSet.has(c)) return c;
  return null;
}
// Resolve a Python module spec to a repo-relative file (`x.py` or a package's `x/__init__.py`).
//   level > 0 -> RELATIVE: climb `level` package dirs from the importing file, then append the dotted
//               path. Anchored to the file's real location, so it can't collide with stdlib.
//   level = 0 -> ABSOLUTE: suffix-match the dotted path against known files (sys.path roots unknown).
//               Require >=2 segments so `import json`/`import os` can't grab a local single-name package
//               (e.g. flask's own src/flask/json); the shortest match wins (deterministic).
const pyFile = (stem) => { if (!stem) return null; for (const c of [stem + '.py', stem + '/__init__.py']) if (relSet.has(c)) return c; return null; };
function resolvePyModule(fromAbs, level, dotted) {
  const parts = dotted ? dotted.split('.').filter(Boolean) : [];
  if (level > 0) {
    let baseAbs = dirname(fromAbs);
    for (let i = 1; i < level; i++) baseAbs = dirname(baseAbs);
    const baseRel = relPathOf(baseAbs).replace(/\\/g, '/');
    return pyFile([baseRel, ...parts].filter(Boolean).join('/'));
  }
  // Spec Q1: a SINGLE-segment absolute import resolves only when it names the repo's OWN
  // top-level package — rooted at '' or 'src/' exactly (src-layout), never by suffix. That keeps
  // `import json`/`import os` from grabbing a NESTED in-repo package (flask's src/flask/json)
  // while `from flask import render_template` inside flask's repo finally resolves.
  if (parts.length === 1) {
    for (const c of [parts[0] + '/__init__.py', 'src/' + parts[0] + '/__init__.py', parts[0] + '.py', 'src/' + parts[0] + '.py']) {
      if (relSet.has(c)) return c;
    }
    return null;
  }
  if (parts.length < 2) return null;
  const tail = parts.join('/');
  let best = null;
  for (const rp of relSet) {
    const hit = rp === tail + '.py' || rp.endsWith('/' + tail + '.py') || rp === tail + '/__init__.py' || rp.endsWith('/' + tail + '/__init__.py');
    if (hit && (!best || rp.length < best.length || (rp.length === best.length && rp < best))) best = rp;
  }
  return best;
}
// ---- JS/TS re-export resolution (precision-safe, file-anchored) ---------------------------------
// `export { x as y } from './impl'` re-exports impl's `x` under the public name `y` WITHOUT defining a
// symbol in the barrel — so a downstream `import { y } from './barrel'` has no `barrel:y` node to bind
// to, and the call to `y()` was silently dropped (the name-changing-indirection gap: the one case grep
// also can't follow by the original name). Build, per file, a table of exported-name -> {target, orig}
// and resolve it TRANSITIVELY (a re-export of a re-export) so an import of a renamed re-export binds to
// the real underlying symbol. v9: `export * from './m'` chains resolve too — a barrel that star-forwards
// a module no longer swallows the edge (one of the two measured recall gaps in the oracle A/B).
const esReExportRe = /export\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
const esStarReExportRe = /export\s*\*\s*from\s*['"]([^'"]+)['"]/g; // plain form only (`export * as ns` binds a namespace, not names)
const reExportByFile = new Map();     // rel file -> Map(exportedName -> { target: rel file, orig })
const starReExportByFile = new Map(); // rel file -> [target rel files, in source order]

  /** Scan one JS/TS file's re-export declarations into the tables. Returns { map, stars } for the caller's cache. */
  function scanJsReExports(fAbs, relPath, text) {
  const map = new Map();
  let m;
  esReExportRe.lastIndex = 0;
  while ((m = esReExportRe.exec(text))) {
    const target = resolveImport(fAbs, m[2]); if (!target) continue;
    for (const part of m[1].split(',')) {
      const seg = part.trim().split(/\s+as\s+/);
      const orig = (seg[0] || '').trim(), exported = (seg[seg.length - 1] || '').trim();
      if (orig && orig !== 'default') map.set(exported, { target, orig });
    }
  }
  if (map.size) reExportByFile.set(relPath, map);
  const stars = [];
  esStarReExportRe.lastIndex = 0;
  while ((m = esStarReExportRe.exec(text))) {
    const target = resolveImport(fAbs, m[1]);
    if (target) stars.push(target);
  }
  if (stars.length) starReExportByFile.set(relPath, stars);
    return { map, stars };
  }
  /** Cache replay: install a previously scanned file's re-export table without reading it. */
  function loadJsReExports(relPath, mapPairs, stars) {
    if (mapPairs.length) reExportByFile.set(relPath, new Map(mapPairs.map(([exp2, target, orig]) => [exp2, { target, orig }])));
    if (stars.length) starReExportByFile.set(relPath, stars);
  }

// Resolve `targetRel`'s exported `name` to a real symbol node id, following renamed re-export chains
// and `export *` forwards (first star target that resolves wins — source order, deterministic).
// Returns the node id or null (unknown name / dead-ends at a non-symbol). Cycle-guarded.
function resolveReExport(targetRel, name, seen) {
  const key = targetRel + ':' + name;
  if (nodeIdSet.has(key)) return key;          // a real symbol in the target file
  seen = seen || new Set();
  if (seen.has(key)) return null;              // re-export cycle -> give up (no phantom edge)
  seen.add(key);
  const reMap = reExportByFile.get(targetRel);
  const hop = reMap && reMap.get(name);
  if (hop) { const hit = resolveReExport(hop.target, hop.orig, seen); if (hit) return hit; }
  for (const star of starReExportByFile.get(targetRel) || []) {
    const hit = resolveReExport(star, name, seen);
    if (hit) return hit;
  }
  return null;
}

// v6: methods carry owner-qualified ids (`file:Type.method`), so a member access resolved by FILE +
// NAME (`X.from()` where X is an import alias of `file`) can no longer assume `file:name` exists.
// This map answers "the one member called `name` in `file`" — exactly one match resolves; several
// same-named methods across owners is ambiguous and stays dropped (precision over recall).
const AMBIGUOUS_MEMBER = Symbol('ambiguous');
const memberByFile = new Map(); // `${file}:${label}` -> qualified id | AMBIGUOUS_MEMBER
for (const n of nodes) {
  const key = n.file + ':' + n.label;
  if (key === n.id) continue; // top-level symbol — nodeIdSet already resolves it
  memberByFile.set(key, memberByFile.has(key) ? AMBIGUOUS_MEMBER : n.id);
}
// `file:name` if it exists as a node id, else the unique qualified member, else null.
// Spec Q2: resolve name N in Python module M through M's own `from X import N` re-exports
// (flask's `from .templating import render_template as render_template`). Bounded depth,
// masked text (a docstring can't fabricate a re-export), deterministic first-match.
// finding 8: this used to re-mask the module and re-scan its from-imports on EVERY invocation —
// once per unresolved pkg.member call site and per imported name (70% of a Python-corpus
// extract). Two memos make it a table lookup with byte-identical results: the per-module
// re-export table (local name -> {srcMod, orig}, first valid binding wins — the old scan order),
// and the (module, name) -> id|null result. Null results are cached only from depth-0 calls, so a
// depth-budget-truncated null can never mask a resolvable chain.
const pyReExportTables = new Map(); // moduleRel -> Map(local -> {srcMod, orig}) | null
const pyReExportTableOf = (moduleRel) => {
  if (pyReExportTables.has(moduleRel)) return pyReExportTables.get(moduleRel);
  const modAbs = absByRel.get(moduleRel);
  const rec = modAbs && fileSyms.get(modAbs);
  let table = null;
  if (rec) {
    table = new Map();
    const re = /^[ \t]*from\s+(\.*)([\w.]*)\s+import\s+(.+)$/gm;
    const masked = maskTextOf(moduleRel, 'py', recTextOf(modAbs, rec));
    let mm;
    while ((mm = re.exec(masked))) {
      for (const part of mm[3].replace(/[()]/g, '').split(',')) {
        const seg = part.trim().split(/\s+as\s+/);
        const orig = (seg[0] || '').trim(), local = (seg[seg.length - 1] || '').trim();
        if (!orig || orig === '*' || !local || table.has(local)) continue;
        const srcMod = resolvePyModule(modAbs, mm[1].length, mm[2]);
        if (srcMod && srcMod !== moduleRel) table.set(local, { srcMod, orig });
      }
    }
  }
  pyReExportTables.set(moduleRel, table);
  return table;
};
const pyReExportMemo = new Map(); // `${moduleRel}\x00${name}` -> id | null
const pyReExportResolve = (moduleRel, name, depth = 0) => {
  if (depth > 3) return null;
  const direct = moduleRel + ':' + name;
  if (nodeIdSet.has(direct)) return direct;
  const memoKey = moduleRel + '\x00' + name;
  if (pyReExportMemo.has(memoKey)) return pyReExportMemo.get(memoKey);
  const hit = pyReExportTableOf(moduleRel)?.get(name);
  const out = hit ? pyReExportResolve(hit.srcMod, hit.orig, depth + 1) : null;
  if (out != null || depth === 0) pyReExportMemo.set(memoKey, out);
  return out;
};
const resolveFileMember = (fileRel, name) => {
  const exact = fileRel + ':' + name;
  if (nodeIdSet.has(exact)) return exact;
  const m = memberByFile.get(exact);
  if (m && m !== AMBIGUOUS_MEMBER) return m;
  // Spec Q2 (member path): `flask.render_template(...)` through `import flask` — the member is a
  // re-export in the package __init__; follow it exactly like the from-import path does.
  if (fileRel.endsWith('.py')) { const viaReExport = pyReExportResolve(fileRel, name); if (viaReExport) return viaReExport; }
  return null;
};

const reqNamed = /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g;
const reqDefault = /(?:const|let|var)\s+([\w$]+)\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g;
const esNamed = /import\s+(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
const esStar = /import\s+\*\s+as\s+([\w$]+)\s+from\s*['"]([^'"]+)['"]/g;
const esDefault = /import\s+([\w$]+)\s*(?:,\s*\{[^}]*\})?\s+from\s*['"]([^'"]+)['"]/g;
const esSide = /import\s+['"]([^'"]+)['"]/g;
// Python (line-oriented, `m` flag): `from [.]*MODULE import NAMES` and `import MODULE [as A][, ...]`.
const pyFrom = /^[ \t]*from\s+(\.*)([\w.]*)\s+import\s+(.+)$/gm;
const pyImport = /^[ \t]*import\s+([\w][\w.]*(?:\s+as\s+\w+)?(?:\s*,\s*[\w][\w.]*(?:\s+as\s+\w+)?)*)/gm;

  /**
   * Bind one file's imports: precise local-name aliases (amap), namespace/default module
   * bindings for member access (nsmap), class aliases for instanceof/static refs (classmap),
   * and the coarse import edges ([from, to] id pairs, in source order). The caller owns cache
   * replay/record; `edges` here is what the extractor's binding loop pushed into importEdges.
   */
  function bindFileImports({ fAbs, r, isPy, text, aId, defaultExportByFile, kindById }) {
    const amap = new Map(), nsmap = new Map(), classmap = new Map(), edges = [];
    let m;
  const addNamed = (namesStr, spec) => {
    const target = resolveImport(fAbs, spec); if (!target) return;
    for (const part of namesStr.split(',')) {
      const seg = part.trim().split(/\s+as\s+/);
      const orig = seg[0].trim(), local = seg[seg.length - 1].trim();
      if (!orig) continue;
      const symId = target + ':' + orig;
      // Direct symbol in the target, else follow a renamed re-export chain (`export {orig as …} from`).
      const resolved = nodeIdSet.has(symId) ? symId : resolveReExport(target, orig);
      if (resolved) { amap.set(local, resolved); if (aId && aId !== resolved) edges.push([aId, resolved]); }
    }
  };
  // Python `from [.]*MOD import a, b as c`: each name is EITHER a submodule of MOD (-> module object,
  // member-access binding) OR a symbol defined in MOD's file (-> precise alias, like addNamed). The
  // coarse "imports this module" edge lands on the target's <module> node.
  const addPyFrom = (level, dotted, namesStr) => {
    const pkgFile = resolvePyModule(fAbs, level, dotted);
    for (const part of namesStr.replace(/[()]/g, '').split(',')) {
      const seg = part.trim().split(/\s+as\s+/);
      const orig = (seg[0] || '').trim(), local = (seg[seg.length - 1] || '').trim();
      if (!orig || orig === '*') continue;
      const sub = resolvePyModule(fAbs, level, dotted ? dotted + '.' + orig : orig);
      if (sub && sub !== pkgFile) { nsmap.set(local, sub); if (aId) edges.push([aId, sub + ':<module>']); continue; }
      if (pkgFile) {
        const symId = pkgFile + ':' + orig;
        const resolvedSym = nodeIdSet.has(symId) ? symId : pyReExportResolve(pkgFile, orig); // Spec Q2
        if (resolvedSym) {
          amap.set(local, resolvedSym); // Spec Q3: an explicit import binds bare calls, boundary or not
          const origin = pyImportOrigin(r); // Spec Q4: the SITE (module scope) owns the import edge
          if (origin && origin !== resolvedSym) edges.push([origin, resolvedSym]);
        }
      }
    }
  };
  // Python `import a.b [as c], d`: bind a usable local name -> module object for member access. A
  // dotted path with no alias binds Python's FIRST segment (`a` of `a.b.c`), which member-resolution
  // can't key on, so it gets only the coarse module edge — no false member binding.
  const addPyImports = (namesStr) => {
    for (const part of namesStr.split(',')) {
      const seg = part.trim().split(/\s+as\s+/);
      const dotted = (seg[0] || '').trim(); if (!dotted) continue;
      const alias = seg.length > 1 ? seg[1].trim() : null;
      const t = resolvePyModule(fAbs, 0, dotted); if (!t) continue;
      const local = alias || (dotted.includes('.') ? null : dotted);
      if (local) nsmap.set(local, t);
      if (aId) edges.push([aId, t + ':<module>']);
    }
  };
  // Namespace (`import * as X`) / default (`import X from` / `const X = require`): X is the imported
  // MODULE OBJECT. Record X -> target file so `X.member(...)` resolves to target:member in
  // deriveFileEdges; for a default import also alias X -> the target's default export (≈ anchor) so
  // `new X()` / `X()` resolve. The COARSE "imports this module" edge lands on the target's <module>
  // node (created on demand below), NOT on its anchor symbol — member-access now produces the precise
  // per-symbol edges, so attributing the coarse edge to one symbol only pollutes its dependents.
  const addModuleBinding = (local, spec, isDefault) => {
    const t = resolveImport(fAbs, spec); if (!t) return;
    if (local) nsmap.set(local, t);
    // A default import binds the target's default export: attribute to its single owning symbol when
    // there is one (class/fn AxiosError), else the module object (object-default barrel -> <module>).
    // A namespace import (`import * as X`) is always the module object.
    // Alias the default import ONLY to a detected single-symbol default (class/fn/identifier). NO anchor
    // fallback: for an object-literal or anonymous default the anchor is a DIFFERENT symbol, so aliasing
    // to it made a bare `utils` reference fabricate a call to utils.js's largest symbol (e.g. merge).
    const defSym = isDefault ? defaultExportByFile.get(t) : null;
    if (isDefault && local && defSym && !amap.has(local) && aId !== defSym) amap.set(local, defSym);
    if (isDefault && local && defSym && kindById.get(defSym) === 'class') classmap.set(local, defSym); // X.static()/instanceof X -> ref to class
    const edgeTarget = defSym || (t + ':<module>');
    if (aId && aId !== edgeTarget) edges.push([aId, edgeTarget]);
  };
  const addSide = (spec) => { const t = resolveImport(fAbs, spec); if (!t) return; if (aId) edges.push([aId, t + ':<module>']); };
  if (isPy) {
    const pyText = maskTextOf(r, 'py', text); // don't bind imports that live in a docstring/comment
    while ((m = pyFrom.exec(pyText))) addPyFrom(m[1].length, m[2], m[3]);
    while ((m = pyImport.exec(pyText))) addPyImports(m[1]);
  } else {
    while ((m = reqNamed.exec(text))) addNamed(m[1], m[2]);
    while ((m = esNamed.exec(text))) addNamed(m[1], m[2]);
    while ((m = reqDefault.exec(text))) addModuleBinding(m[1], m[2], true);
    while ((m = esStar.exec(text))) addModuleBinding(m[1], m[2], false);
    while ((m = esDefault.exec(text))) addModuleBinding(m[1], m[2], true);
    while ((m = esSide.exec(text))) addSide(m[1]);
  }
    return { amap, nsmap, classmap, edges };
  }

  return {
    resolveImport, resolvePyModule,
    reExportByFile, starReExportByFile, scanJsReExports, loadJsReExports, resolveReExport,
    pyReExportResolve, resolveFileMember, bindFileImports,
  };
}
