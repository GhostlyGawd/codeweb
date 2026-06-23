#!/usr/bin/env node
// codeweb symbol extractor: emits {nodes, edges} JSON conforming to the graph schema
// (skills/codebase-anatomy/references/graph-schema.md).
//
// Strategy (hybrid engine, in code):
//   - Symbol discovery prefers universal-ctags (`ctags --output-format=json`) when installed;
//     otherwise a built-in regex scanner handles JS/TS and Python.
//   - Call edges are derived by scanning call sites and mapping each to the enclosing symbol —
//     this works with or without ctags.
//   - Read-only: it never executes the target. The only child processes are `ctags`/`rg`,
//     which statically inspect files already on disk.
//
// Usage:
//   node extract-symbols.mjs <path> [--out fragment.json] [--no-ctags]

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { relative, resolve, join, dirname, extname } from 'node:path';
import { isTestFile } from './lib/graph-ops.mjs'; // F4: test-file predicate (shared, one truth)
import { cyclomatic, nestingDepth } from './lib/complexity.mjs'; // F4: per-symbol complexity/nesting

// F0: bump when scanSymbols/ctagsSymbols OUTPUT or the cache format changes — invalidates stale caches.
// v2: nodes carry complexity/maxDepth (F4) + the cache holds per-file edge lists + a symbol signature (F9).
// v3: namespace/default-import member-access resolution (util.merge() / new Default()) -> new call edges.
const SCANNER_VERSION = 3;
const sha1 = (s) => createHash('sha1').update(s).digest('hex');

// Derive the file path from a node id (`<file>:<label>`); ids use '/' in paths and ':' only as the
// label separator, so the last ':' splits them.
const idFile = (id) => id.slice(0, id.lastIndexOf(':'));

const argv = process.argv.slice(2);
const opts = { path: null, out: null, ctags: true, target: null, cache: null, full: false };
for (let i = 0; i < argv.length; i++) {
  const t = argv[i];
  if (t === '--out') opts.out = argv[++i];
  else if (t === '--target') opts.target = argv[++i];
  else if (t === '--cache') opts.cache = argv[++i]; // F0: per-file scan cache (incremental freshness)
  else if (t === '--full') opts.full = true;        // F9: ignore the edge cache, derive all edges from scratch
  else if (t === '--no-ctags') opts.ctags = false;
  else if (!opts.path) opts.path = t;
}
if (!opts.path) { console.error('usage: extract-symbols.mjs <path> [--out f.json] [--target label] [--no-ctags]'); process.exit(1); }
const root = resolve(opts.path);
if (!existsSync(root)) { console.error(`[extract] not found: ${root}`); process.exit(1); }

const SRC = /\.(js|mjs|cjs|jsx|ts|tsx|py|rs|go)$/;
const SKIP = /(^|[\\/])(node_modules|\.git|dist|build|out|vendor|third_party|\.codeweb|coverage)([\\/]|$)/;
const KEYWORDS = new Set(['if','for','while','switch','catch','return','function','typeof','await','new','super','constructor','else','do','try','finally','class','import','export','const','let','var','async','yield','case','in','of','instanceof','delete','void','throw','with','print']);

function tryExec(cmd, args) { try { return execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28 }); } catch { return null; } }
function toolExists(cmd) { return tryExec(cmd, ['--version']) != null; }

// ---- enumerate source files ----
function listFiles() {
  const viaRg = tryExec('rg', ['--files', root]);
  let files;
  if (viaRg != null) {
    files = viaRg.split(/\r?\n/).filter(Boolean);
  } else {
    files = [];
    const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (SKIP.test(p)) continue; if (e.isDirectory()) walk(p); else files.push(p); } };
    walk(root);
  }
  // Canonicalize enumeration order: `rg --files` (parallel walk) and readdir can return files in a
  // nondeterministic order, which leaks into node-array order AND cluster3's domain-assignment
  // tie-breaks — making the pipeline non-reproducible. Sorting pins a stable order without changing
  // the file set. (Surfaced + verified by the determinism study, H1.)
  return files.filter((f) => SRC.test(f) && !SKIP.test(f)).sort();
}

const rel = (f) => relative(root, f).replace(/\\/g, '/');

// ---- per-language regex symbol scan ----
function scanSymbols(file, text) {
  const ext = extname(file).toLowerCase();
  const lines = text.split(/\r?\n/);
  const syms = [];
  const push = (name, line, kind, exported) => { if (name && !KEYWORDS.has(name)) syms.push({ name, line: line + 1, kind, exports: !!exported }); };
  if (ext === '.py') {
    lines.forEach((ln, i) => {
      let m;
      if ((m = /^\s*def\s+([A-Za-z_]\w*)/.exec(ln))) push(m[1], i, /^\S/.test(ln) ? 'function' : 'method', true);
      else if ((m = /^\s*class\s+([A-Za-z_]\w*)/.exec(ln))) push(m[1], i, 'class', true);
    });
  } else if (ext === '.rs') {
    // Rust: fn/struct/enum/trait. A `fn` indented inside an `impl`/`trait` block is a method; at
    // column 0 it's a free function. `pub` (incl. `pub(crate)`) -> exported. The name after the
    // keyword is always a real identifier (you can't write `fn fn`), so push directly rather than
    // through the JS-keyword filter — that keeps idiomatic Rust names like `new`/`default`/`drop`.
    const DEF = /^(\s*)(pub(?:\([a-z]+\))?\s+)?(?:async\s+)?(?:unsafe\s+)?(?:const\s+)?(fn|struct|enum|trait)\s+([A-Za-z_]\w*)/;
    lines.forEach((ln, i) => {
      const m = DEF.exec(ln);
      if (!m) return;
      const indent = m[1].length, exported = !!m[2], key = m[3], name = m[4];
      const kind = key === 'fn' ? (indent > 0 ? 'method' : 'function') : 'class';
      syms.push({ name, line: i + 1, kind, exports: exported });
    });
  } else if (ext === '.go') {
    // Go: `func F(...)` is a function; `func (r R) M(...)` (a receiver in parens before the name)
    // is a method; `type X struct|interface { … }` is a class. Visibility is by initial case — an
    // uppercase first letter is exported. Names after func/type are real identifiers -> push direct.
    const methodRe = /^\s*func\s+\(([^)]*)\)\s+([A-Za-z_]\w*)/;
    const funcRe = /^\s*func\s+([A-Za-z_]\w*)/;
    const typeRe = /^\s*type\s+([A-Za-z_]\w*)\s+(?:struct|interface)\b/;
    const exp = (n) => /^[A-Z]/.test(n);
    lines.forEach((ln, i) => {
      let m;
      if ((m = methodRe.exec(ln))) syms.push({ name: m[2], line: i + 1, kind: 'method', exports: exp(m[2]) });
      else if ((m = funcRe.exec(ln))) syms.push({ name: m[1], line: i + 1, kind: 'function', exports: exp(m[1]) });
      else if ((m = typeRe.exec(ln))) syms.push({ name: m[1], line: i + 1, kind: 'class', exports: exp(m[1]) });
    });
  } else {
    const exported = (ln) => /\bexport\b/.test(ln);
    lines.forEach((ln, i) => {
      let m;
      if ((m = /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/.exec(ln))) push(m[1], i, 'function', exported(ln));
      else if ((m = /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\*?\s*\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/.exec(ln))) push(m[1], i, 'function', exported(ln));
      else if ((m = /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/.exec(ln))) push(m[1], i, 'class', exported(ln));
      else if ((m = /^\s{2,}(?:public|private|protected|static|readonly|async|get|set|\*)?\s*([A-Za-z_$][\w$]*)\s*\([^;=]*\)\s*\{/.exec(ln))) push(m[1], i, 'method', false);
    });
  }
  return syms;
}

// ctags accelerator: returns array of {name,line,kind} or null
function ctagsSymbols(file) {
  const out = tryExec('ctags', ['--output-format=json', '--fields=+n-P', '-f', '-', file]);
  if (out == null) return null;
  const syms = [];
  for (const ln of out.split(/\r?\n/)) {
    if (!ln.trim()) continue;
    try { const j = JSON.parse(ln); if (j._type === 'tag' && j.name) syms.push({ name: j.name, line: j.line || 1, kind: j.kind || 'symbol', exports: false }); } catch { /* skip */ }
  }
  return syms.length ? syms : null;
}

// ---- function body extent -----------------------------------------------------------------
// Real end-of-body so a symbol's range never runs to EOF and absorbs the trailing top-level code
// (the root cause of fabricated call edges — e.g. query.mjs:parseArgs credited with 9 calls it
// never makes). Brace-matched for JS/TS; dedent for Python. Strings + line/inline-block comments
// are stripped before brace counting — best-effort: multi-line strings and template `${}` are not
// state-tracked, so the worst case is a slightly-off end, never a run-to-EOF. startIdx is 0-based;
// returns the 0-based inclusive last line of the body.
const stripSC = (line) => line
  .replace(/\/\/.*$/, '')                        // line comment
  .replace(/\/\*.*?\*\//g, ' ')                  // single-line block comment
  .replace(/(['"`])(?:\\.|(?!\1).)*?\1/g, ' ')   // same-line string / template literal
  .replace(/\[(?:\\.|[^\]\n])*\]/g, ' ')         // regex char classes — strip stray [{] / [^}]
  .replace(/\\./g, ' ');                         // escaped chars — \{ \} in regex literals (e.g. /\s*\{/)
function bodyEnd(lines, startIdx, isPy) {
  if (isPy) {
    const indent = (s) => s.length - s.replace(/^\s+/, '').length;
    const base = indent(lines[startIdx] || '');
    let end = startIdx;
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (lines[i].trim() === '') continue;        // blank lines don't end a body
      if (indent(lines[i]) <= base) break;         // dedent to <= the def -> body ended above
      end = i;
    }
    return end;
  }
  let depth = 0, started = false;
  for (let i = startIdx; i < lines.length; i++) {
    const s = stripSC(lines[i]);
    for (let c = 0; c < s.length; c++) {
      const ch = s[c];
      if (ch === '{') { depth++; started = true; }
      else if (ch === '}') { depth--; if (started && depth <= 0) return i; }
    }
    if (!started && /;\s*$/.test(s)) return i;     // brace-less body (arrow/expr) ending in ';'
  }
  return lines.length - 1;
}

// ---- F3: single-line signature extraction ------------------------------------------------
// Returns {params, returns, raw} from a function/method DECLARATION line, or null when the param
// list isn't fully on that line (multi-line / paren-less arrow) — never a guess (best-effort, the
// same ethos as bodyEnd). The extractor is line-oriented, so multi-line params are intentionally null.
const splitTopLevelParams = (s) => {
  // Track only unambiguous bracket pairs. `<`/`>` are NOT tracked — they double as comparison
  // operators in default values (`a = x > 0, b`), and treating them as brackets would mis-balance
  // depth and drop trailing params. TS generics (`a: Map<string, number>`) still split correctly:
  // the inner comma yields a non-identifier fragment that paramName() discards.
  const out = []; let depth = 0, cur = '';
  for (const ch of s) {
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim() || out.length) out.push(cur);
  return out;
};
const paramName = (entry) => {
  let e = entry.trim();
  if (!e) return null;
  e = e.replace(/^(\*\*?|\.\.\.)/, '').split('=')[0].split(':')[0].trim().split(/\s+/)[0]; // *args/**kw/...rest, default, annotation; trailing-token = Go `a int` -> `a`
  return /^[A-Za-z_$][\w$]*$/.test(e) ? e : null;                          // destructuring/other -> dropped
};
function parseSignature(line, name, isPy) {
  const nameEsc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // the param-list open-paren for BOTH `name(...)` (declaration) and `name = [async] [function [g]] (...)`
  // (arrow / function-expression assignment) — so `const f = (a, b) => …` parses, not just `function f(a, b)`.
  const nameRe = new RegExp(`(?:^|[^\\w$])${nameEsc}\\s*(?:=\\s*(?:async\\s+)?(?:function\\s*\\*?\\s*[\\w$]*\\s*)?)?\\(`);
  const m = nameRe.exec(line);
  if (!m) return null;                       // no param paren attributable to `name` on this line
  const open = m.index + m[0].length - 1;
  let depth = 0, close = -1;
  for (let i = open; i < line.length; i++) { const ch = line[i]; if (ch === '(') depth++; else if (ch === ')') { depth--; if (depth === 0) { close = i; break; } } }
  if (close === -1) return null;             // params spill onto the next line -> null
  const raw = line.slice(open + 1, close);
  const params = splitTopLevelParams(raw).map(paramName).filter((x) => x != null);
  let returns = null;
  if (isPy) { const r = /->\s*([^:]+):/.exec(line.slice(close)); if (r) returns = r[1].trim(); }
  else { const r = /^\s*:\s*([^={]+?)\s*(?:=>|\{|$)/.exec(line.slice(close + 1)); if (r) returns = r[1].trim(); }
  return { params, returns, raw };
}

const useCtags = opts.ctags && toolExists('ctags');
const files = listFiles();

// F0: load the scan cache (keyed by content hash + engine mode + scanner version). A re-run reuses
// cached symbol-discovery for byte-identical files and re-scans only changed ones — edge derivation
// is still GLOBAL (see below), so the fragment is identical with or without the cache.
const engineMode = useCtags ? 'ctags' : 'regex';
let oldCache = null;
if (opts.cache) { try { const c = JSON.parse(readFileSync(opts.cache, 'utf8')); if (c && c.version === SCANNER_VERSION && c.engine === engineMode) oldCache = c; } catch { /* corrupt/absent -> cold */ } }
const newCache = opts.cache ? { version: SCANNER_VERSION, engine: engineMode, files: {} } : null;
let scanCount = 0;
const scanFile = (f, text) => { scanCount++; return (useCtags && ctagsSymbols(f)) || scanSymbols(f, text); };

// ---- build nodes per file, with line ranges ----
const nodes = [];
const fileSyms = new Map(); // file -> {text, ranges:[{id,name,start,end,kind}]}
for (const f of files) {
  let text; try { text = readFileSync(f, 'utf8'); } catch { continue; }
  const r = rel(f);
  let syms;
  if (opts.cache) {
    const h = sha1(text);
    const hit = oldCache && oldCache.files[r];
    syms = (hit && hit.hash === h) ? hit.syms : scanFile(f, text); // cache miss -> re-scan
    newCache.files[r] = { hash: h, syms };                          // prune deleted files (only current)
  } else {
    syms = scanFile(f, text);
  }
  const seen = new Set();
  syms = syms.filter((s) => { const k = s.name + ':' + s.line; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => a.line - b.line);
  const lines = text.split(/\r?\n/);
  const total = lines.length;
  const isPy = r.endsWith('.py');
  const ranges = [];
  syms.forEach((s) => {
    const start = s.line;
    // real body extent (brace match / dedent), NOT next-symbol-line — so the last symbol can't
    // run to EOF and absorb the trailing top-level code (the fabricated-edge bug).
    const end = Math.min(bodyEnd(lines, start - 1, isPy) + 1, total);
    const loc = Math.min(end - start + 1, 2000);
    const id = r + ':' + s.name;
    ranges.push({ id, name: s.name, start, end, kind: s.kind });
    const node = { id, label: s.name, kind: s.kind, file: r, line: start, loc, exports: s.exports, domain: '', summary: '' };
    if (s.kind === 'function' || s.kind === 'method') {
      node.signature = parseSignature(lines[start - 1] || '', s.name, isPy); // F3: contract for callers
      // F4: approximate cyclomatic complexity + max nesting from the SAME body extent (lines [start, end]).
      // Only function/method nodes carry these (a class/module has no single control-flow body).
      const body = lines.slice(start - 1, start - 1 + loc).join('\n');
      const lang = isPy ? 'py' : 'js';
      node.complexity = cyclomatic(body, lang);
      node.maxDepth = nestingDepth(body, lang);
    }
    nodes.push(node);
  });
  fileSyms.set(f, { text, ranges });
}

// ---- index symbol names -> node ids ----
const byName = new Map();
for (const n of nodes) { if (!byName.has(n.label)) byName.set(n.label, []); byName.get(n.label).push(n.id); }

// ---- resolve imports: aliases (for accurate cross-file calls) + import edges ----
const relSet = new Set(files.map(rel));
const nodeIdSet = new Set(nodes.map((n) => n.id));
const anchorByFile = new Map(); // rel -> {id, loc} most-substantial symbol of the file
for (const n of nodes) { const cur = anchorByFile.get(n.file); if (!cur || (n.loc || 0) > cur.loc) anchorByFile.set(n.file, { id: n.id, loc: n.loc || 0 }); }
const anchorId = (r) => { const a = anchorByFile.get(r); return a ? a.id : null; };
function resolveImport(fromAbs, spec) {
  if (!/^[.]/.test(spec)) return null; // local relative imports only
  let r = rel(resolve(dirname(fromAbs), spec)).replace(/\\/g, '/');
  const cands = [r, r + '.js', r + '.mjs', r + '.cjs', r + '.ts', r + '.tsx', r + '.jsx', r + '/index.js', r + '/index.ts', r + '/index.mjs'];
  for (const c of cands) if (relSet.has(c)) return c;
  return null;
}
const aliasByFile = new Map();   // fileAbs -> Map(localName -> symbolId in the target file) [named/default value]
const nsAliasByFile = new Map(); // fileAbs -> Map(localName -> target REL file) [namespace/default OBJECT, for member access]
const importEdges = [];
const reqNamed = /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g;
const reqDefault = /(?:const|let|var)\s+([\w$]+)\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g;
const esNamed = /import\s+(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
const esStar = /import\s+\*\s+as\s+([\w$]+)\s+from\s*['"]([^'"]+)['"]/g;
const esDefault = /import\s+([\w$]+)\s*(?:,\s*\{[^}]*\})?\s+from\s*['"]([^'"]+)['"]/g;
const esSide = /import\s+['"]([^'"]+)['"]/g;
for (const f of files) {
  const fsRec = fileSyms.get(f); if (!fsRec) continue;
  const text = fsRec.text, aId = anchorId(rel(f)), amap = new Map(), nsmap = new Map();
  let m;
  const addNamed = (namesStr, spec) => {
    const target = resolveImport(f, spec); if (!target) return;
    for (const part of namesStr.split(',')) {
      const seg = part.trim().split(/\s+as\s+/);
      const orig = seg[0].trim(), local = seg[seg.length - 1].trim();
      if (!orig) continue;
      const symId = target + ':' + orig;
      if (nodeIdSet.has(symId)) { amap.set(local, symId); if (aId && aId !== symId) importEdges.push([aId, symId]); }
    }
  };
  // Namespace (`import * as X`) / default (`import X from` / `const X = require`): X is the imported
  // MODULE OBJECT. Record X -> target file so `X.member(...)` resolves to target:member in
  // deriveFileEdges; for a default import also alias X -> the target's default export (≈ anchor) so
  // `new X()` / `X()` resolve. The coarse file-anchor import edge is preserved either way.
  const addModuleBinding = (local, spec, isDefault) => {
    const t = resolveImport(f, spec); if (!t) return;
    if (local) nsmap.set(local, t);
    const tA = anchorId(t);
    if (!tA) return;
    if (isDefault && local && !amap.has(local) && aId !== tA) amap.set(local, tA);
    if (aId && aId !== tA) importEdges.push([aId, tA]);
  };
  const addSide = (spec) => { const t = resolveImport(f, spec); if (!t) return; const tA = anchorId(t); if (aId && tA && aId !== tA) importEdges.push([aId, tA]); };
  while ((m = reqNamed.exec(text))) addNamed(m[1], m[2]);
  while ((m = esNamed.exec(text))) addNamed(m[1], m[2]);
  while ((m = reqDefault.exec(text))) addModuleBinding(m[1], m[2], true);
  while ((m = esStar.exec(text))) addModuleBinding(m[1], m[2], false);
  while ((m = esDefault.exec(text))) addModuleBinding(m[1], m[2], true);
  while ((m = esSide.exec(text))) addSide(m[1]);
  if (amap.size) aliasByFile.set(f, amap);
  if (nsmap.size) nsAliasByFile.set(f, nsmap);
}

// ---- derive call edges (F9: incremental, per-file, cacheable) ------------------------------
const LEGACY_FALLBACK = !!process.env.CODEWEB_LEGACY_FALLBACK; // A/B: restore pre-fix byName[0] wiring for regression testing

// F9: global symbol signature — a hash of the discovered symbol-node id set (module nodes are derived,
// so excluded). A file's edges depend ONLY on its own text + global symbol resolution (byName/alias),
// so when the symbol set is unchanged AND a file's content is unchanged, that file's edges are
// identical and may be reused. Any added/removed/renamed symbol flips the signature -> full re-derive
// (correctness over speed). This is what makes warm-incremental byte-identical to a cold full extract.
const symbolSig = sha1(nodes.map((n) => n.id).slice().sort().join('\n'));

// Derive ONE file's edges (call/ref/inherit), with from-side = its own symbols or its <module> node.
// Pure w.r.t. the file: returns {edges, hasModule, ambiguous}. The precision gate (alias > same-file >
// unique-global, drop-ambiguous) is unchanged — only the plumbing moved into a function so it can be
// cached per file and skipped when the file + symbol set are unchanged.
function deriveFileEdges(r, lines, ranges, aliasMap, nsAliasMap) {
  const local = []; const localSet = new Set();
  let hasModule = false, ambiguous = 0;
  const isPy = r.endsWith('.py');
  const enclosing = (lineNo) => { let best = null; for (const rg of ranges) if (lineNo >= rg.start && lineNo <= rg.end && (!best || rg.start > best.start)) best = rg; return best; };
  const sameFileByName = new Map(ranges.map((rg) => [rg.name, rg.id]));
  const addEdge = (lineIdx, name, kind = 'call') => {
    if (KEYWORDS.has(name)) return;
    const aliased = aliasMap && aliasMap.get(name);
    if (!aliased && !byName.has(name)) return;
    const caller = enclosing(lineIdx + 1);
    if (caller && caller.name === name && lineIdx + 1 === caller.start) return; // its own definition
    let callerId;
    if (caller) callerId = caller.id;
    else { callerId = r + ':<module>'; hasModule = true; } // module/top-level scope
    let calleeId = aliased || sameFileByName.get(name);
    if (!calleeId) {
      const defs = byName.get(name);
      if (defs && defs.length === 1) calleeId = defs[0];
      else if (LEGACY_FALLBACK) calleeId = defs && defs[0];
      else { ambiguous++; return; }
    }
    if (!calleeId || calleeId === callerId) return;
    const key = callerId + ' ' + calleeId;
    if (localSet.has(key)) return;
    localSet.add(key);
    const edgeKind = (kind === 'call' && isTestFile(r) && !isTestFile(idFile(calleeId))) ? 'test' : kind;
    local.push({ from: callerId, to: calleeId, kind: edgeKind, weight: 1 });
  };
  // Push an edge to an ALREADY-RESOLVED callee id — used for namespace/default import member-access,
  // where the callee is resolved via the import binding rather than bare-name lookup.
  const addResolved = (lineIdx, calleeId, kind = 'call') => {
    const caller = enclosing(lineIdx + 1);
    let callerId;
    if (caller) callerId = caller.id; else { callerId = r + ':<module>'; hasModule = true; }
    if (!calleeId || calleeId === callerId) return;
    const key = callerId + ' ' + calleeId;
    if (localSet.has(key)) return;
    localSet.add(key);
    const edgeKind = (kind === 'call' && isTestFile(r) && !isTestFile(idFile(calleeId))) ? 'test' : kind;
    local.push({ from: callerId, to: calleeId, kind: edgeKind, weight: 1 });
  };
  const callRe = /([A-Za-z_$][\w$]*)\s*\(/g;
  const refRe = /[(,]\s*([A-Za-z_$][\w$]*)\s*(?=[,)])/g;
  const extendsRe = /\bclass\s+[A-Za-z_$][\w$]*\s+extends\s+([A-Za-z_$][\w$]*)/g;
  const pyBasesRe = /^\s*class\s+[A-Za-z_]\w*\s*\(([^)]*)\)/;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
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
    }
    callRe.lastIndex = 0; let m;
    while ((m = callRe.exec(ln))) {
      if (ln[m.index - 1] === '.') {
        // member call obj.fn(): resolve ONLY when obj is a namespace/default import alias (a param or
        // local obj.method() must stay unresolved — see reference-edges PRECISION). This recovers the
        // cross-file usage the bare-name pass can't see (util.merge(), AxiosHeaders.from()).
        const om = /([A-Za-z_$][\w$]*)$/.exec(ln.slice(0, m.index - 1));
        if (om && nsAliasMap && nsAliasMap.has(om[1])) {
          const calleeId = nsAliasMap.get(om[1]) + ':' + m[1];
          if (nodeIdSet.has(calleeId)) addResolved(i, calleeId, 'call');
        }
        continue; // not an import-alias member -> stay precision-safe (no edge)
      }
      addEdge(i, m[1]);
    }
    refRe.lastIndex = 0;
    while ((m = refRe.exec(ln))) addEdge(i, m[1]);
  }
  return { edges: local, hasModule, ambiguous };
}

const edges = [];
let ambiguousDropped = 0, edgedCount = 0;
const edgeFiles = files.filter((f) => fileSyms.get(f)?.ranges.length);
const reuseEdges = !opts.full && oldCache && oldCache.symbolSig === symbolSig; // edge cache valid iff symbol set unchanged
for (const f of edgeFiles) {
  const { text, ranges } = fileSyms.get(f);
  const r = rel(f);
  const lines = text.split(/\r?\n/);
  const cacheEntry = newCache && newCache.files[r]; // carries the content hash from discovery
  const prev = reuseEdges && oldCache.files[r];
  let result;
  if (prev && cacheEntry && prev.hash === cacheEntry.hash && prev.edges) {
    result = { edges: prev.edges, hasModule: !!prev.hasModule, ambiguous: prev.ambiguous || 0 }; // reuse
  } else {
    result = deriveFileEdges(r, lines, ranges, aliasByFile.get(f), nsAliasByFile.get(f));
    edgedCount++;
  }
  if (cacheEntry) { cacheEntry.edges = result.edges; cacheEntry.hasModule = result.hasModule; cacheEntry.ambiguous = result.ambiguous; }
  if (result.hasModule && !nodeIdSet.has(r + ':<module>')) {
    nodes.push({ id: r + ':<module>', label: '<module>', kind: 'module', file: r, line: 1, loc: 1, exports: false, domain: '', summary: '' });
    nodeIdSet.add(r + ':<module>');
  }
  for (const e of result.edges) edges.push(e);
  ambiguousDropped += result.ambiguous;
}
if (newCache) newCache.symbolSig = symbolSig;

// ---- append import edges (file anchor -> imported symbol) ----
// Deduped against the call edges by (from,to): caller ids are file-local, so this set has no
// cross-file collisions and matches the original single-edgeSet behaviour exactly.
let importEdgeCount = 0;
const edgeKeys = new Set(edges.map((e) => e.from + ' ' + e.to));
for (const [a, b] of importEdges) {
  if (!nodeIdSet.has(a) || !nodeIdSet.has(b) || a === b) continue;
  const key = a + ' ' + b;
  if (edgeKeys.has(key)) continue;
  edgeKeys.add(key);
  const ik = (isTestFile(idFile(a)) && !isTestFile(idFile(b))) ? 'test' : 'import';
  edges.push({ from: a, to: b, kind: ik, weight: 1 });
  if (ik === 'import') importEdgeCount++;
}

// meta — the single source of truth for the target. `root` (absolute, forward-slashed) + each
// node's relative `file` path reconstruct any source file, so downstream stages (overlap/confirm
// body-reading, report header) read the target from here instead of re-hardcoding it.
const rootFwd = root.replace(/\\/g, '/').replace(/\/+$/, '');
const targetLabel = opts.target || rootFwd.split('/').slice(-2).join('/') || rootFwd;
const langOf = (f) => (f.endsWith('.py') ? 'python' : f.endsWith('.rs') ? 'rust' : f.endsWith('.go') ? 'go' : /\.tsx?$/.test(f) ? 'typescript' : 'javascript');
const languages = [...new Set(files.map(langOf))].sort();
const fragment = {
  meta: { root: rootFwd, target: targetLabel, engine: useCtags ? 'ctags' : 'regex', languages, symbols: nodes.length },
  nodes, edges,
};
if (newCache) { try { writeFileSync(resolve(opts.cache), JSON.stringify(newCache)); } catch { /* cache is best-effort */ } }
const banner = `[extract] ${nodes.length} symbols, ${edges.length} edges (${edges.length - importEdgeCount} call + ${importEdgeCount} import) from ${files.length} files (${useCtags ? 'ctags' : 'regex'} engine); dropped ${ambiguousDropped} ambiguous bare-call edges; scanned ${scanCount}/${files.length} file(s); edged ${edgedCount}/${edgeFiles.length}${opts.cache ? ' (cache on)' : ''}`;
if (opts.out) { writeFileSync(resolve(opts.out), JSON.stringify(fragment, null, 2)); console.error(banner + ` -> ${opts.out}`); }
else { process.stdout.write(JSON.stringify(fragment)); console.error(banner); }
