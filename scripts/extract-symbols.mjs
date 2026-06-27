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
import { loadTsEngine } from './lib/ts-engine.mjs'; // optional tree-sitter tier: exact cyclomatic (opt-in)

// F0: bump when scanSymbols/ctagsSymbols OUTPUT or the cache format changes — invalidates stale caches.
// v2: nodes carry complexity/maxDepth (F4) + the cache holds per-file edge lists + a symbol signature (F9).
// v3: namespace/default-import member-access resolution (util.merge() / new Default()) -> new call edges.
// v4: Python docstrings/comments masked before symbol+edge scan -> drops phantom symbols/edges.
// v5: opt-in tree-sitter engine owns JS/TS method nodes (class-qualified ids) + dispatch edges.
const SCANNER_VERSION = 5;
const sha1 = (s) => createHash('sha1').update(s).digest('hex');

// Derive the file path from a node id (`<file>:<label>`); ids use '/' in paths and ':' only as the
// label separator, so the last ':' splits them.
const idFile = (id) => id.slice(0, id.lastIndexOf(':'));

const argv = process.argv.slice(2);
const opts = { path: null, out: null, ctags: true, target: null, cache: null, full: false, engine: process.env.CODEWEB_ENGINE || null };
for (let i = 0; i < argv.length; i++) {
  const t = argv[i];
  if (t === '--out') opts.out = argv[++i];
  else if (t === '--target') opts.target = argv[++i];
  else if (t === '--cache') opts.cache = argv[++i]; // F0: per-file scan cache (incremental freshness)
  else if (t === '--full') opts.full = true;        // F9: ignore the edge cache, derive all edges from scratch
  else if (t === '--no-ctags') opts.ctags = false;
  else if (t === '--engine') opts.engine = argv[++i]; // optional tree-sitter tier (exact cyclomatic); default regex
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

// Blank Python triple-quoted strings (docstrings) and `#` comments so the symbol/edge scanners never
// see `def`/`class`/calls that live INSIDE documentation — the root cause of phantom symbols and
// fabricated edges (e.g. flask helpers.py's make_response docstring fabricates a render_template
// caller). Column- AND line-count-preserving (masked regions -> spaces) so the unmasked text's
// bodyEnd/signature line offsets are unaffected. Single-line '...'/"..." strings are blanked first so
// a `#` or `"""` inside them can't be mistaken for a comment/docstring delimiter. Best-effort, same
// ethos as stripSC: escapes inside triple-strings aren't tracked, worst case is a slightly-off mask.
function maskPy(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  let triple = null; // active multi-line triple-quote delimiter ('"""' or "'''")
  for (const line of lines) {
    const n = line.length; let res = '', i = 0;
    while (i < n) {
      if (triple) {
        const end = line.indexOf(triple, i);
        if (end === -1) { res += ' '.repeat(n - i); i = n; }
        else { res += ' '.repeat(end + 3 - i); i = end + 3; triple = null; }
        continue;
      }
      const ch = line[i];
      if (ch === '#') { res += ' '.repeat(n - i); i = n; continue; }      // comment to EOL
      if (ch === '"' || ch === "'") {
        const tri = line.substr(i, 3);
        if (tri === '"""' || tri === "'''") {
          const end = line.indexOf(tri, i + 3);
          if (end === -1) { triple = tri; res += ' '.repeat(n - i); i = n; }   // opens, spans lines
          else { res += ' '.repeat(end + 3 - i); i = end + 3; }                // single-line triple
          continue;
        }
        let j = i + 1;                                                         // single-line string
        while (j < n && line[j] !== ch) { if (line[j] === '\\') j++; j++; }
        const stop = Math.min(j + 1, n);
        res += ' '.repeat(stop - i); i = stop;
        continue;
      }
      res += ch; i++;
    }
    out.push(res);
  }
  return out.join('\n');
}

// Go counterpart of maskPy: blanks `//` line comments and `/* */` block comments (and string/rune/
// raw-string literal interiors) to spaces, preserving line + column counts, for the edge-derivation
// scan. Without it, example code INSIDE a package-doc block comment (gorilla-mux's doc.go) fabricates
// call edges — the same phantom-edge class as the Python docstring bug. `//`/`/*` inside a string,
// rune, or raw (backtick) literal is NOT a comment, so those are skipped; block comments and raw
// strings may span lines, so their open state is carried across the loop.
function maskGo(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  let inBlockComment = false; // inside /* */ spanning lines
  let inRawString = false;    // inside `...` raw string spanning lines
  for (const line of lines) {
    const n = line.length; let res = '', i = 0;
    while (i < n) {
      if (inBlockComment) {
        const end = line.indexOf('*/', i);
        if (end === -1) { res += ' '.repeat(n - i); i = n; }
        else { res += ' '.repeat(end + 2 - i); i = end + 2; inBlockComment = false; }
        continue;
      }
      if (inRawString) {
        const end = line.indexOf('`', i);
        if (end === -1) { res += ' '.repeat(n - i); i = n; }
        else { res += ' '.repeat(end + 1 - i); i = end + 1; inRawString = false; }
        continue;
      }
      const ch = line[i];
      if (ch === '/' && line[i + 1] === '/') { res += ' '.repeat(n - i); i = n; continue; } // line comment
      if (ch === '/' && line[i + 1] === '*') {                                               // block comment
        const end = line.indexOf('*/', i + 2);
        if (end === -1) { inBlockComment = true; res += ' '.repeat(n - i); i = n; }
        else { res += ' '.repeat(end + 2 - i); i = end + 2; }
        continue;
      }
      if (ch === '"' || ch === "'") {                                                        // interpreted string / rune
        let j = i + 1;
        while (j < n && line[j] !== ch) { if (line[j] === '\\') j++; j++; }
        const stop = Math.min(j + 1, n);
        res += ' '.repeat(stop - i); i = stop;
        continue;
      }
      if (ch === '`') {                                                                       // raw string (may span lines)
        const end = line.indexOf('`', i + 1);
        if (end === -1) { inRawString = true; res += ' '.repeat(n - i); i = n; }
        else { res += ' '.repeat(end + 1 - i); i = end + 1; }
        continue;
      }
      res += ch; i++;
    }
    out.push(res);
  }
  return out.join('\n');
}

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
  const lines = (ext === '.py' ? maskPy(text) : text).split(/\r?\n/); // hide def/class inside docstrings
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

// Optional tree-sitter engine. Opt-in via `--engine tree-sitter` or CODEWEB_ENGINE=tree-sitter.
// web-tree-sitter is an optionalDependency — if it or the vendored grammar is unavailable,
// loadTsEngine() returns null and we fall back to the regex scanner per-file. When active it OWNS
// JS/TS method nodes (class-qualified ids `file:Class.method`) + dynamic-dispatch call edges and
// supplies exact cyclomatic complexity. Loaded before the cache key so it can namespace the cache.
let tsEngine = null;
if (opts.engine === 'tree-sitter' || opts.engine === 'ts') {
  tsEngine = await loadTsEngine();
  if (!tsEngine) console.error('[extract] --engine tree-sitter requested but web-tree-sitter/grammar unavailable; falling back to regex F4');
}

// F0: load the scan cache (keyed by content hash + engine mode + scanner version). A re-run reuses
// cached symbol-discovery for byte-identical files and re-scans only changed ones — edge derivation
// is still GLOBAL (see below), so the fragment is identical with or without the cache. tree-sitter is
// its own engine namespace (`+ts`) so class-qualified syms can't be served to a regex run, or vice versa.
const engineMode = (useCtags ? 'ctags' : 'regex') + (tsEngine ? '+ts' : '');
let oldCache = null;
if (opts.cache) { try { const c = JSON.parse(readFileSync(opts.cache, 'utf8')); if (c && c.version === SCANNER_VERSION && c.engine === engineMode) oldCache = c; } catch { /* corrupt/absent -> cold */ } }
const newCache = opts.cache ? { version: SCANNER_VERSION, engine: engineMode, files: {} } : null;
let scanCount = 0;
const scanFile = (f, text) => { scanCount++; return (useCtags && ctagsSymbols(f)) || scanSymbols(f, text); };

// ---- build nodes per file, with line ranges ----
const nodes = [];
const fileSyms = new Map(); // file -> {text, ranges:[{id,name,start,end,kind}]}
const dispatchByFile = new Map(); // file -> [{from,to}] dispatch edges (tree-sitter engine only)
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
  const isJsTs = /\.(jsx?|mjs|cjs|tsx?)$/.test(r);
  // When the tree-sitter engine is active it OWNS JS/TS method discovery (class-qualified ids) and the
  // dispatch edges; the regex scanner still owns classes, functions and const-arrow functions (which
  // the parse-tree walk doesn't cover). extractJsTs returns null on any parse failure -> keep the regex
  // methods (graceful per-file fallback). Build the qualified ids in ONE parser so dispatch from/to
  // always match an emitted node — never a second line-containment guess that could silently disagree.
  let tsResult = null;
  if (tsEngine && isJsTs) {
    tsResult = tsEngine.extractJsTs(text, r);
    if (tsResult) syms = syms.filter((s) => s.kind !== 'method');
  }
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
      // Exact McCabe via tree-sitter for JS/TS when the engine is active (TS grammar is a JS superset
      // for control-flow counting); otherwise the regex F4 approximation. maxDepth stays regex F4 —
      // exact nesting is a later increment. Rust/Go/Python always use regex (no TS grammar match).
      node.complexity = (tsEngine && isJsTs) ? tsEngine.cyclomaticExact(body) : cyclomatic(body, lang);
      node.maxDepth = nestingDepth(body, lang);
    }
    nodes.push(node);
  });
  // Tree-sitter method nodes: class-qualified id, BARE label (so byName / codemod's ambiguity guard /
  // overlap clustering keep keying on the same bare name), exact complexity from the parse tree;
  // signature + maxDepth reuse the regex F3/F4 helpers on the method's source slice (exact nesting is a
  // later increment). Added to `ranges` so deriveFileEdges attributes a call FROM a method to its
  // qualified id — the same id the dispatch edge uses for `from` (enclosing() prefers the method over
  // its containing class by largest start, so the qualified method id wins).
  if (tsResult) {
    for (const m of tsResult.methods) {
      const start = m.line;
      const end = Math.min(m.endLine, total);
      const loc = Math.min(end - start + 1, 2000);
      const body = lines.slice(start - 1, end).join('\n');
      ranges.push({ id: m.id, name: m.label, start, end, kind: 'method' });
      nodes.push({
        id: m.id, label: m.label, kind: 'method', file: r, line: start, loc,
        exports: false, domain: '', summary: '',
        signature: parseSignature(lines[start - 1] || '', m.label, false),
        complexity: m.complexity,
        maxDepth: nestingDepth(body, 'js'),
      });
    }
    if (tsResult.dispatch.length) dispatchByFile.set(f, tsResult.dispatch);
  }
  fileSyms.set(f, { text, ranges });
}

// ---- index symbol names -> node ids ----
const byName = new Map();
for (const n of nodes) { if (!byName.has(n.label)) byName.set(n.label, []); byName.get(n.label).push(n.id); }

// ---- resolve imports: aliases (for accurate cross-file calls) + import edges ----
const relSet = new Set(files.map(rel));
const nodeIdSet = new Set(nodes.map((n) => n.id));
const kindById = new Map(nodes.map((n) => [n.id, n.kind])); // for class-usage ref edges

// ---- Go cross-package qualified-call resolution (precision-safe, package-anchored) ---------
// A Go file's `package X` clause names the package its top-level symbols belong to. A cross-package
// call writes `X.Func(...)` (the package selector) — but X is NOT a value binding the JS/Rust alias
// machinery can see, so it falls through the member-call pass. Build a map from in-repo package name
// -> exported top-level symbol name -> node ids, so `X.Func()` resolves to that symbol when X is an
// IN-REPO package (the disambiguator that keeps stdlib `fmt.`/`http.` out) AND Func names exactly one
// exported top-level symbol there. Only function/class (type) symbols are package-selector-reachable;
// methods belong to a receiver value, not the package, so they're excluded (and never add ambiguity).
// gorilla-mux: library files are `package mux`, example tests are `package mux_test` calling
// `mux.NewRouter()` -> resolves to mux.go:NewRouter; stdlib `regexp.MustCompile()` -> skipped.
const goPackageOfFile = new Map(); // rel .go file -> declared package name
const goPackageClauseRe = /^[ \t]*package\s+([A-Za-z_]\w*)/m;
for (const [fabs, recd] of fileSyms) {
  const rr = rel(fabs);
  if (!rr.endsWith('.go')) continue;
  const pkgMatch = goPackageClauseRe.exec(recd.text);
  if (pkgMatch) goPackageOfFile.set(rr, pkgMatch[1]);
}
const goPackageSymbols = new Map(); // pkgName -> Map(symbolName -> [node id, ...])
for (const goNode of nodes) {
  if (!goNode.exports || (goNode.kind !== 'function' && goNode.kind !== 'class')) continue;
  const goPkg = goPackageOfFile.get(goNode.file);
  if (!goPkg) continue;
  let bySymbol = goPackageSymbols.get(goPkg);
  if (!bySymbol) { bySymbol = new Map(); goPackageSymbols.set(goPkg, bySymbol); }
  if (!bySymbol.has(goNode.label)) bySymbol.set(goNode.label, []);
  bySymbol.get(goNode.label).push(goNode.id);
}
// Resolve a qualified selector `pkgName.symbolName` to its single in-repo node id, else null
// (unknown package, unknown leaf, or >1 candidate -> no edge).
function goQualifiedTarget(pkgName, symbolName) {
  const bySymbol = goPackageSymbols.get(pkgName);
  if (!bySymbol) return null;
  const candidates = bySymbol.get(symbolName);
  return candidates && candidates.length === 1 ? candidates[0] : null;
}

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
// ---- Rust `use` import resolution (precision-safe, file-anchored) --------------------------
// A Rust file IS a module named by its stem (`pattern.rs` -> module `pattern`, `lib.rs` -> crate
// root `lib`); a `mod.rs` is named by its parent dir. Import edges are attributed to this module
// node so the `use` site reads as a module-scope dependent of the imported symbol.
function rustModuleStem(rustRel) {
  const base = rustRel.slice(rustRel.lastIndexOf('/') + 1).replace(/\.rs$/, '');
  if (base === 'mod') { const dir = rustRel.slice(0, rustRel.lastIndexOf('/')); return dir.slice(dir.lastIndexOf('/') + 1) || base; }
  return base;
}
// The crate's source root = nearest ancestor dir (incl. the file's own dir) holding lib.rs/main.rs.
// `crate::` paths resolve against it; falls back to the file's own dir when no root is found.
function rustCrateRoot(rustRel) {
  let dir = rustRel.includes('/') ? rustRel.slice(0, rustRel.lastIndexOf('/')) : '';
  while (dir) {
    if (relSet.has(dir + '/lib.rs') || relSet.has(dir + '/main.rs')) return dir;
    const upDir = dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '';
    if (upDir === dir) break;
    dir = upDir;
  }
  return rustRel.includes('/') ? rustRel.slice(0, rustRel.lastIndexOf('/')) : '';
}
// Split a `use` tree body on commas at brace/paren depth 0 (so `{a, b}` groups stay intact).
function splitRustUseCommas(body) {
  const parts = []; let depth = 0, cur = '';
  for (const ch of body) {
    if (ch === '{' || ch === '(') depth++;
    else if (ch === '}' || ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}
// Flatten a `use` spec (the text between `use` and `;`) into {segs, leaf, alias} entries, where
// `segs` is the module path (sans leaf). Handles nested groups (`crate::{a, m::{x, y as z}}`),
// `as` renames; skips glob (`*`) and module-self (`self`) leaves. Iterative (explicit stack) so it
// emits no nested function symbol that ci-gate could read as a duplicate.
function parseRustUseTree(spec) {
  const entries = [];
  const stack = [{ body: spec, prefix: [] }];
  while (stack.length) {
    const frame = stack.pop();
    for (const piece of splitRustUseCommas(frame.body)) {
      const item = piece.trim();
      if (!item) continue;
      const brace = item.indexOf('{');
      if (brace !== -1) {
        const headRaw = item.slice(0, brace).replace(/::\s*$/, '').trim();
        const closeIdx = item.lastIndexOf('}');
        const inner = item.slice(brace + 1, closeIdx === -1 ? item.length : closeIdx);
        const headSegs = headRaw ? headRaw.split('::').map((s) => s.trim()).filter(Boolean) : [];
        stack.push({ body: inner, prefix: [...frame.prefix, ...headSegs] });
        continue;
      }
      const asMatch = /\s+as\s+/.exec(item);
      const pathPart = (asMatch ? item.slice(0, asMatch.index) : item).trim();
      const aliasRaw = asMatch ? item.slice(asMatch.index + asMatch[0].length).trim() : null;
      const localSegs = pathPart.split('::').map((s) => s.trim()).filter(Boolean);
      const fullSegs = [...frame.prefix, ...localSegs];
      if (!fullSegs.length) continue;
      const rustUseLeaf = fullSegs[fullSegs.length - 1];
      if (rustUseLeaf === '*' || rustUseLeaf === 'self') continue;
      entries.push({ segs: fullSegs.slice(0, -1), leaf: rustUseLeaf, alias: aliasRaw && /^[A-Za-z_]\w*$/.test(aliasRaw) ? aliasRaw : null });
    }
  }
  return entries;
}
// Resolve a use-path's module segments to a repo-relative .rs file (crate/super/self/bare anchors).
function resolveRustModuleFile(rustRel, segs) {
  let baseDir, rest;
  const fileDir = rustRel.includes('/') ? rustRel.slice(0, rustRel.lastIndexOf('/')) : '';
  if (segs[0] === 'crate') { baseDir = rustCrateRoot(rustRel); rest = segs.slice(1); }
  else if (segs[0] === 'self') { baseDir = fileDir; rest = segs.slice(1); }
  else if (segs[0] === 'super') { baseDir = fileDir.includes('/') ? fileDir.slice(0, fileDir.lastIndexOf('/')) : ''; rest = segs.slice(1); }
  else { baseDir = rustCrateRoot(rustRel); rest = segs.slice(0); } // bare module path -> crate-relative
  if (!rest.length) { for (const c of [baseDir + '/lib.rs', baseDir + '/main.rs']) if (relSet.has(c)) return c; return null; }
  const joined = (baseDir ? baseDir + '/' : '') + rest.join('/');
  for (const c of [joined + '.rs', joined + '/mod.rs']) if (relSet.has(c)) return c;
  return null;
}
// Resolve a `use` entry to an EXISTING symbol node id, or null. File-anchored only: a leaf that
// can't be tied to a known module file + node is dropped (no phantom edge, no byName guessing) —
// this is what keeps a foreign `escape` (globset/pcre2) from being conflated with cli's escape.
function resolveRustUse(rustRel, entry) {
  const modFile = resolveRustModuleFile(rustRel, entry.segs);
  if (!modFile) return null;
  const symId = modFile + ':' + entry.leaf;
  return nodeIdSet.has(symId) ? symId : null;
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
    const baseRel = rel(baseAbs).replace(/\\/g, '/');
    return pyFile([baseRel, ...parts].filter(Boolean).join('/'));
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
// A file's DEFAULT EXPORT, when it is a single named symbol defined in that file (`export default
// class X` / `export default function X` / `export default X;` / `export { X as default }` /
// `module.exports = X`). Returns its node id, else null (an object/array/expression default — e.g.
// `export default { merge, ... }` — has no single owning symbol, so a default import of it is a
// MODULE dependency). Lets a default import attribute its coarse edge to the real exported symbol
// (AxiosError) instead of an arbitrary anchor, while object-default barrels (utils) fall back to <module>.
function defaultExportOf(r, text, names) {
  let m;
  if ((m = /export\s+default\s+(?:abstract\s+)?(?:async\s+)?(?:class|function\s*\*?)\s+([A-Za-z_$][\w$]*)/.exec(text)) && names.has(m[1])) return r + ':' + m[1];
  if ((m = /export\s*\{[^}]*?\b([A-Za-z_$][\w$]*)\s+as\s+default\b/.exec(text)) && names.has(m[1])) return r + ':' + m[1];
  if ((m = /export\s+default\s+([A-Za-z_$][\w$]*)\s*;/.exec(text)) && names.has(m[1])) return r + ':' + m[1];
  if ((m = /module\.exports\s*=\s*([A-Za-z_$][\w$]*)\s*;/.exec(text)) && names.has(m[1])) return r + ':' + m[1];
  return null;
}
const defaultExportByFile = new Map(); // rel -> node id of the single-symbol default export (if any)
for (const [fabs, recd] of fileSyms) {
  const rr = rel(fabs);
  const ds = defaultExportOf(rr, recd.text, new Set(recd.ranges.map((rg) => rg.name)));
  if (ds && nodeIdSet.has(ds)) defaultExportByFile.set(rr, ds);
}
const aliasByFile = new Map();   // fileAbs -> Map(localName -> symbolId in the target file) [named/default value]
const nsAliasByFile = new Map(); // fileAbs -> Map(localName -> target REL file) [namespace/default OBJECT, for member access]
const classAliasByFile = new Map(); // fileAbs -> Map(localName -> CLASS node id) [default import whose default export is a class — for instanceof/static-method ref edges]
const importEdges = [];
const reqNamed = /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g;
const reqDefault = /(?:const|let|var)\s+([\w$]+)\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g;
const esNamed = /import\s+(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
const esStar = /import\s+\*\s+as\s+([\w$]+)\s+from\s*['"]([^'"]+)['"]/g;
const esDefault = /import\s+([\w$]+)\s*(?:,\s*\{[^}]*\})?\s+from\s*['"]([^'"]+)['"]/g;
const esSide = /import\s+['"]([^'"]+)['"]/g;
// Python (line-oriented, `m` flag): `from [.]*MODULE import NAMES` and `import MODULE [as A][, ...]`.
const pyFrom = /^[ \t]*from\s+(\.*)([\w.]*)\s+import\s+(.+)$/gm;
const pyImport = /^[ \t]*import\s+([\w][\w.]*(?:\s+as\s+\w+)?(?:\s*,\s*[\w][\w.]*(?:\s+as\s+\w+)?)*)/gm;
for (const f of files) {
  const fsRec = fileSyms.get(f); if (!fsRec) continue;
  const r = rel(f), isPy = r.endsWith('.py'), isRust = r.endsWith('.rs');
  const text = fsRec.text, aId = anchorId(r), amap = new Map(), nsmap = new Map(), classmap = new Map();
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
  // Python `from [.]*MOD import a, b as c`: each name is EITHER a submodule of MOD (-> module object,
  // member-access binding) OR a symbol defined in MOD's file (-> precise alias, like addNamed). The
  // coarse "imports this module" edge lands on the target's <module> node.
  const addPyFrom = (level, dotted, namesStr) => {
    const pkgFile = resolvePyModule(f, level, dotted);
    for (const part of namesStr.replace(/[()]/g, '').split(',')) {
      const seg = part.trim().split(/\s+as\s+/);
      const orig = (seg[0] || '').trim(), local = (seg[seg.length - 1] || '').trim();
      if (!orig || orig === '*') continue;
      const sub = resolvePyModule(f, level, dotted ? dotted + '.' + orig : orig);
      if (sub && sub !== pkgFile) { nsmap.set(local, sub); if (aId) importEdges.push([aId, sub + ':<module>']); continue; }
      if (pkgFile) { const symId = pkgFile + ':' + orig; if (nodeIdSet.has(symId)) { amap.set(local, symId); if (aId && aId !== symId) importEdges.push([aId, symId]); } }
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
      const t = resolvePyModule(f, 0, dotted); if (!t) continue;
      const local = alias || (dotted.includes('.') ? null : dotted);
      if (local) nsmap.set(local, t);
      if (aId) importEdges.push([aId, t + ':<module>']);
    }
  };
  // Namespace (`import * as X`) / default (`import X from` / `const X = require`): X is the imported
  // MODULE OBJECT. Record X -> target file so `X.member(...)` resolves to target:member in
  // deriveFileEdges; for a default import also alias X -> the target's default export (≈ anchor) so
  // `new X()` / `X()` resolve. The COARSE "imports this module" edge lands on the target's <module>
  // node (created on demand below), NOT on its anchor symbol — member-access now produces the precise
  // per-symbol edges, so attributing the coarse edge to one symbol only pollutes its dependents.
  const addModuleBinding = (local, spec, isDefault) => {
    const t = resolveImport(f, spec); if (!t) return;
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
    if (aId && aId !== edgeTarget) importEdges.push([aId, edgeTarget]);
  };
  const addSide = (spec) => { const t = resolveImport(f, spec); if (!t) return; if (aId) importEdges.push([aId, t + ':<module>']); };
  if (isPy) {
    const pyText = maskPy(text); // don't bind imports that live in a docstring/comment
    while ((m = pyFrom.exec(pyText))) addPyFrom(m[1].length, m[2], m[3]);
    while ((m = pyImport.exec(pyText))) addPyImports(m[1]);
  } else if (isRust) {
    // Rust `use a::b::name;` / `{name1, name2}` / `name as alias` / `pub use` (re-export). Each
    // resolvable leaf (a) aliases its local name to the imported symbol id (so a later bare call
    // resolves cross-file) and (b) emits an import edge from THIS file's module node (`<file>:<stem>`,
    // created on demand) to that symbol — a module-scope dependent of the import. Anchored at line
    // start (after optional `pub`) so a `use` word inside a doc comment is never parsed.
    const rustStem = rustModuleStem(r);
    const rustModuleNodeId = r + ':' + rustStem;
    const ensureRustModuleNode = () => {
      if (nodeIdSet.has(rustModuleNodeId)) return;
      nodes.push({ id: rustModuleNodeId, label: rustStem, kind: 'module', file: r, line: 1, loc: 1, exports: false, domain: '', summary: '' });
      nodeIdSet.add(rustModuleNodeId);
    };
    const rustUseRe = /^[ \t]*(?:pub(?:\([^)]*\))?\s+)?use\s+([^;]+);/gm;
    while ((m = rustUseRe.exec(text))) {
      for (const entry of parseRustUseTree(m[1])) {
        const symId = resolveRustUse(r, entry);
        if (!symId) continue;
        const localName = entry.alias || entry.leaf;
        if (!amap.has(localName)) amap.set(localName, symId);
        ensureRustModuleNode();
        if (rustModuleNodeId !== symId) importEdges.push([rustModuleNodeId, symId]);
      }
    }
  } else {
    while ((m = reqNamed.exec(text))) addNamed(m[1], m[2]);
    while ((m = esNamed.exec(text))) addNamed(m[1], m[2]);
    while ((m = reqDefault.exec(text))) addModuleBinding(m[1], m[2], true);
    while ((m = esStar.exec(text))) addModuleBinding(m[1], m[2], false);
    while ((m = esDefault.exec(text))) addModuleBinding(m[1], m[2], true);
    while ((m = esSide.exec(text))) addSide(m[1]);
  }
  if (amap.size) aliasByFile.set(f, amap);
  if (nsmap.size) nsAliasByFile.set(f, nsmap);
  if (classmap.size) classAliasByFile.set(f, classmap);
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
function deriveFileEdges(r, lines, ranges, aliasMap, nsAliasMap, classAliasMap) {
  const local = []; const localSet = new Set();
  let hasModule = false, ambiguous = 0;
  const isPy = r.endsWith('.py');
  const isGo = r.endsWith('.go');
  const enclosing = (lineNo) => { let best = null; for (const rg of ranges) if (lineNo >= rg.start && lineNo <= rg.end && (!best || rg.start > best.start)) best = rg; return best; };
  const sameFileByName = new Map(ranges.map((rg) => [rg.name, rg.id]));
  const sameFileClasses = new Map(ranges.filter((rg) => rg.kind === 'class').map((rg) => [rg.name, rg.id]));
  // The CLASS node a name refers to (imported class alias OR a same-file class) — for ref edges from
  // `instanceof X` and `X.staticMethod()`. Null for non-classes (an object alias like `utils`).
  const classOf = (name) => (classAliasMap && classAliasMap.get(name)) || sameFileClasses.get(name) || null;
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
    const edgeKind = (kind === 'call' && isTestFile(r) && !isTestFile(idFile(calleeId))) ? 'test' : kind;
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
  const extendsRe = /\bclass\s+[A-Za-z_$][\w$]*\s+extends\s+([A-Za-z_$][\w$]*)/g;
  const instanceofRe = /\binstanceof\s+([A-Za-z_$][\w$]*)/g; // `x instanceof X` -> ref to class X
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
        const before = ln.slice(0, m.index - 1);
        const om = /([A-Za-z_$][\w$]*)$/.exec(before);
        if (om) {
          // Go package selector `pkg.Func()`: resolve when `pkg` is an in-repo package and `Func`
          // names exactly one exported top-level symbol there (precision-safe; stdlib pkgs aren't in
          // the map). Guarded by isGo so JS/TS/Python/Rust member-access is untouched.
          if (isGo) {
            const goCalleeId = goQualifiedTarget(om[1], m[1]);
            if (goCalleeId) addResolved(i, goCalleeId, 'call');
          }
          if (nsAliasMap && nsAliasMap.has(om[1])) {
            const calleeId = nsAliasMap.get(om[1]) + ':' + m[1];
            if (nodeIdSet.has(calleeId)) addResolved(i, calleeId, 'call');
          }
          const cls = classOf(om[1]);
          if (cls) addResolved(i, cls, 'ref'); // X.staticMethod() -> the caller depends on the class X
          // X.member.call(...) / X.member.apply(...): the real invocation is of X-file:member.
          if ((m[1] === 'call' || m[1] === 'apply') && nsAliasMap) {
            const chain = /([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)$/.exec(before);
            if (chain && nsAliasMap.has(chain[1])) {
              const calleeId = nsAliasMap.get(chain[1]) + ':' + chain[2];
              if (nodeIdSet.has(calleeId)) addResolved(i, calleeId, 'call');
            }
          }
        }
        continue; // not an import-alias member -> stay precision-safe (no edge)
      }
      addEdge(i, m[1]);
    }
    refRe.lastIndex = 0;
    while ((m = refRe.exec(ln))) addEdge(i, m[1]);
    instanceofRe.lastIndex = 0;
    while ((m = instanceofRe.exec(ln))) { const cls = classOf(m[1]); if (cls) addResolved(i, cls, 'ref'); }
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
  const lines = (r.endsWith('.py') ? maskPy(text) : r.endsWith('.go') ? maskGo(text) : text).split(/\r?\n/); // no calls from docstrings/comments
  const cacheEntry = newCache && newCache.files[r]; // carries the content hash from discovery
  const prev = reuseEdges && oldCache.files[r];
  let result;
  if (prev && cacheEntry && prev.hash === cacheEntry.hash && prev.edges) {
    result = { edges: prev.edges, hasModule: !!prev.hasModule, ambiguous: prev.ambiguous || 0 }; // reuse
  } else {
    result = deriveFileEdges(r, lines, ranges, aliasByFile.get(f), nsAliasByFile.get(f), classAliasByFile.get(f));
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
// A coarse module-import edge (namespace/default/side) targets the imported file's <module> node,
// created on demand here so a symbol-less barrel still gets a node. This keeps the file-level "imports
// this module" signal (fileCycles/coupling unchanged — same file-pair) without polluting a symbol.
const ensureModuleNode = (id) => {
  if (nodeIdSet.has(id)) return;
  nodes.push({ id, label: '<module>', kind: 'module', file: idFile(id), line: 1, loc: 1, exports: false, domain: '', summary: '' });
  nodeIdSet.add(id);
};
for (const [a, b] of importEdges) {
  if (b.endsWith(':<module>')) ensureModuleNode(b);
  if (!nodeIdSet.has(a) || !nodeIdSet.has(b) || a === b) continue;
  const key = a + ' ' + b;
  if (edgeKeys.has(key)) continue;
  edgeKeys.add(key);
  const ik = (isTestFile(idFile(a)) && !isTestFile(idFile(b))) ? 'test' : 'import';
  edges.push({ from: a, to: b, kind: ik, weight: 1 });
  if (ik === 'import') importEdgeCount++;
}

// ---- append dynamic-dispatch call edges (tree-sitter engine: this.m() + typed-receiver x.m()) ----
// The member-call edges the regex engine deliberately drops. Endpoints are guarded against the final
// node set; deduped by (from,to,kind) so a dispatch `call` can coexist with a `ref`/`import` of the
// same pair but never duplicates an identical edge. Iterate the already-sorted edgeFiles so the
// appended order is deterministic. A test-file caller reclassifies to `test`, matching call edges.
let dispatchEdgeCount = 0, dispatchDropped = 0;
const edgeTriKeys = new Set(edges.map((e) => e.from + '\t' + e.to + '\t' + e.kind));
for (const f of edgeFiles) {
  const disp = dispatchByFile.get(f);
  if (!disp) continue;
  for (const d of disp) {
    if (d.from === d.to || !nodeIdSet.has(d.from) || !nodeIdSet.has(d.to)) { dispatchDropped++; continue; }
    const kind = (isTestFile(idFile(d.from)) && !isTestFile(idFile(d.to))) ? 'test' : 'call';
    const key = d.from + '\t' + d.to + '\t' + kind;
    if (edgeTriKeys.has(key)) continue;
    edgeTriKeys.add(key);
    edges.push({ from: d.from, to: d.to, kind, weight: 1 });
    dispatchEdgeCount++;
  }
}

// meta — the single source of truth for the target. `root` (absolute, forward-slashed) + each
// node's relative `file` path reconstruct any source file, so downstream stages (overlap/confirm
// body-reading, report header) read the target from here instead of re-hardcoding it.
const rootFwd = root.replace(/\\/g, '/').replace(/\/+$/, '');
const targetLabel = opts.target || rootFwd.split('/').slice(-2).join('/') || rootFwd;
const langOf = (f) => (f.endsWith('.py') ? 'python' : f.endsWith('.rs') ? 'rust' : f.endsWith('.go') ? 'go' : /\.tsx?$/.test(f) ? 'typescript' : 'javascript');
const languages = [...new Set(files.map(langOf))].sort();
const fragment = {
  meta: {
    root: rootFwd, target: targetLabel, engine: useCtags ? 'ctags' : 'regex',
    // additive: only present when the opt-in tree-sitter tier actually computed complexity, so the
    // default (regex) output is byte-identical to before. Pins the grammar version for determinism.
    ...(tsEngine ? { complexityEngine: tsEngine.version } : {}),
    languages, symbols: nodes.length,
  },
  nodes, edges,
};
if (newCache) { try { writeFileSync(resolve(opts.cache), JSON.stringify(newCache)); } catch { /* cache is best-effort */ } }
const dispatchNote = tsEngine ? `; wired ${dispatchEdgeCount} dispatch edge(s)${dispatchDropped ? `, dropped ${dispatchDropped} (missing endpoint)` : ''}` : '';
const banner = `[extract] ${nodes.length} symbols, ${edges.length} edges (${edges.length - importEdgeCount} call + ${importEdgeCount} import) from ${files.length} files (${useCtags ? 'ctags' : 'regex'}${tsEngine ? '+tree-sitter' : ''} engine); dropped ${ambiguousDropped} ambiguous bare-call edges${dispatchNote}; scanned ${scanCount}/${files.length} file(s); edged ${edgedCount}/${edgeFiles.length}${opts.cache ? ' (cache on)' : ''}`;
if (opts.out) { writeFileSync(resolve(opts.out), JSON.stringify(fragment, null, 2)); console.error(banner + ` -> ${opts.out}`); }
else { process.stdout.write(JSON.stringify(fragment)); console.error(banner); }
