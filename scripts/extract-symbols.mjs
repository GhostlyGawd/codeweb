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
import { relative, resolve, join, dirname, extname } from 'node:path';

const argv = process.argv.slice(2);
const opts = { path: null, out: null, ctags: true, target: null };
for (let i = 0; i < argv.length; i++) {
  const t = argv[i];
  if (t === '--out') opts.out = argv[++i];
  else if (t === '--target') opts.target = argv[++i];
  else if (t === '--no-ctags') opts.ctags = false;
  else if (!opts.path) opts.path = t;
}
if (!opts.path) { console.error('usage: extract-symbols.mjs <path> [--out f.json] [--target label] [--no-ctags]'); process.exit(1); }
const root = resolve(opts.path);
if (!existsSync(root)) { console.error(`[extract] not found: ${root}`); process.exit(1); }

const SRC = /\.(js|mjs|cjs|jsx|ts|tsx|py)$/;
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
  return files.filter((f) => SRC.test(f) && !SKIP.test(f));
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

const useCtags = opts.ctags && toolExists('ctags');
const files = listFiles();

// ---- build nodes per file, with line ranges ----
const nodes = [];
const fileSyms = new Map(); // file -> {text, ranges:[{id,name,start,end,kind}]}
for (const f of files) {
  let text; try { text = readFileSync(f, 'utf8'); } catch { continue; }
  const r = rel(f);
  let syms = (useCtags && ctagsSymbols(f)) || scanSymbols(f, text);
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
    const id = r + ':' + s.name;
    ranges.push({ id, name: s.name, start, end, kind: s.kind });
    nodes.push({ id, label: s.name, kind: s.kind, file: r, line: start, loc: Math.min(end - start + 1, 2000), exports: s.exports, domain: '', summary: '' });
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
const aliasByFile = new Map(); // fileAbs -> Map(localName -> symbolId in the target file)
const importEdges = [];
const reqNamed = /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g;
const reqNs = /(?:const|let|var)\s+[\w$]+\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g;
const esNamed = /import\s+(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
const esOther = /import\s+(?:[\w$]+|\*\s+as\s+[\w$]+)\s+from\s*['"]([^'"]+)['"]/g;
const esSide = /import\s+['"]([^'"]+)['"]/g;
for (const f of files) {
  const fsRec = fileSyms.get(f); if (!fsRec) continue;
  const text = fsRec.text, aId = anchorId(rel(f)), amap = new Map();
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
  const addNs = (spec) => { const t = resolveImport(f, spec); if (!t) return; const tA = anchorId(t); if (aId && tA && aId !== tA) importEdges.push([aId, tA]); };
  while ((m = reqNamed.exec(text))) addNamed(m[1], m[2]);
  while ((m = esNamed.exec(text))) addNamed(m[1], m[2]);
  while ((m = reqNs.exec(text))) addNs(m[1]);
  while ((m = esOther.exec(text))) addNs(m[1]);
  while ((m = esSide.exec(text))) addNs(m[1]);
  if (amap.size) aliasByFile.set(f, amap);
}

// ---- derive call edges ----
const edgeSet = new Set();
const edges = [];
let ambiguousDropped = 0; // bare calls to multi-def names with no import/same-file resolution
const LEGACY_FALLBACK = !!process.env.CODEWEB_LEGACY_FALLBACK; // A/B: restore pre-fix byName[0] wiring for regression testing
const callRe = /([A-Za-z_$][\w$]*)\s*\(/g;
// Module/top-level scope gets a synthetic per-file `module` node (created lazily, on first
// top-level call) so calls made outside any function body are attributed honestly to the module
// instead of dropped or blamed on whichever function's range happened to reach that line.
const moduleId = new Map();
const ensureModule = (fAbs, rPath) => {
  if (moduleId.has(fAbs)) return moduleId.get(fAbs);
  const id = rPath + ':<module>';
  moduleId.set(fAbs, id);
  nodes.push({ id, label: '<module>', kind: 'module', file: rPath, line: 1, loc: 1, exports: false, domain: '', summary: '' });
  nodeIdSet.add(id);
  return id;
};
for (const f of files) {
  const fs = fileSyms.get(f); if (!fs) continue;
  const { text, ranges } = fs;
  if (!ranges.length) continue;
  const r = rel(f);
  const lines = text.split(/\r?\n/);
  // innermost containing range wins (a call inside a nested fn/method attributes to it, not the
  // enclosing class); null = module/top-level scope.
  const enclosing = (lineNo) => { let best = null; for (const rg of ranges) if (lineNo >= rg.start && lineNo <= rg.end && (!best || rg.start > best.start)) best = rg; return best; };
  const sameFileByName = new Map(ranges.map((rg) => [rg.name, rg.id]));
  const aliasMap = aliasByFile.get(f);
  // Resolve a referenced name to a callee node and record the edge. alias (import) and same-file
  // defs are authoritative; the global byName fallback is only safe when the name has exactly ONE
  // definition — a bare reference to a name defined in many files (log/run/get) can't be attributed
  // to a specific def, and wiring it to byName[0] fabricates false super-hubs (the "lib · log"
  // mega-cluster). Drop instead. caller=null means module/top-level scope -> the synthetic module node.
  const addEdge = (lineIdx, name, kind = 'call') => {
    if (KEYWORDS.has(name)) return;
    const aliased = aliasMap && aliasMap.get(name);
    if (!aliased && !byName.has(name)) return;
    const caller = enclosing(lineIdx + 1);
    if (caller && caller.name === name && lineIdx + 1 === caller.start) return; // its own definition
    const callerId = caller ? caller.id : ensureModule(f, r);
    let calleeId = aliased || sameFileByName.get(name);
    if (!calleeId) {
      const defs = byName.get(name);
      if (defs && defs.length === 1) calleeId = defs[0];
      else if (LEGACY_FALLBACK) calleeId = defs && defs[0]; // pre-fix: wire to first global def (fabricates hubs)
      else { ambiguousDropped++; return; }
    }
    if (!calleeId || calleeId === callerId) return;
    const key = callerId + ' ' + calleeId;
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    edges.push({ from: callerId, to: calleeId, kind, weight: 1 });
  };
  // A function name in argument position passed WITHOUT parens — arr.map(fn), rl.on('x', fn) — is a
  // higher-order reference: the callee invokes fn, so the dependency is real. Captured as a call edge
  // (same precision gate) so --impact/--callers/--orphans see it.
  const refRe = /[(,]\s*([A-Za-z_$][\w$]*)\s*(?=[,)])/g;
  const isPy = r.endsWith('.py');
  const extendsRe = /\bclass\s+[A-Za-z_$][\w$]*\s+extends\s+([A-Za-z_$][\w$]*)/g; // JS/TS single super
  const pyBasesRe = /^\s*class\s+[A-Za-z_]\w*\s*\(([^)]*)\)/;                     // Python base list
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    // inherit edges FIRST: `class X extends Y` / `class X(Y):` -> X inherits Y. The class node's
    // range starts here, so enclosing() resolves the `from` to X automatically. Run before call/ref
    // so a Python `class X(Base):` keys X->Base as inheritance, not as a call arg (first writer wins).
    if (isPy) {
      const pm = pyBasesRe.exec(ln);
      if (pm) for (const part of pm[1].split(',')) {
        const base = part.trim();
        if (!base || base.includes('=')) continue;     // skip metaclass=/keyword bases
        const name = base.replace(/^.*\./, '');          // last segment of a dotted base
        if (/^[A-Za-z_]\w*$/.test(name)) addEdge(i, name, 'inherit');
      }
    } else {
      extendsRe.lastIndex = 0; let xm;
      while ((xm = extendsRe.exec(ln))) addEdge(i, xm[1], 'inherit');
    }
    callRe.lastIndex = 0; let m;
    while ((m = callRe.exec(ln))) {
      if (ln[m.index - 1] === '.') continue; // method/property call (obj.fn()) — not our top-level symbol
      addEdge(i, m[1]);
    }
    refRe.lastIndex = 0;
    while ((m = refRe.exec(ln))) addEdge(i, m[1]);
  }
}

// ---- append import edges (file anchor -> imported symbol) ----
let importEdgeCount = 0;
for (const [a, b] of importEdges) {
  if (!nodeIdSet.has(a) || !nodeIdSet.has(b) || a === b) continue;
  const key = a + ' ' + b;
  if (edgeSet.has(key)) continue;
  edgeSet.add(key);
  edges.push({ from: a, to: b, kind: 'import', weight: 1 });
  importEdgeCount++;
}

// meta — the single source of truth for the target. `root` (absolute, forward-slashed) + each
// node's relative `file` path reconstruct any source file, so downstream stages (overlap/confirm
// body-reading, report header) read the target from here instead of re-hardcoding it.
const rootFwd = root.replace(/\\/g, '/').replace(/\/+$/, '');
const targetLabel = opts.target || rootFwd.split('/').slice(-2).join('/') || rootFwd;
const langOf = (f) => (f.endsWith('.py') ? 'python' : /\.tsx?$/.test(f) ? 'typescript' : 'javascript');
const languages = [...new Set(files.map(langOf))].sort();
const fragment = {
  meta: { root: rootFwd, target: targetLabel, engine: useCtags ? 'ctags' : 'regex', languages, symbols: nodes.length },
  nodes, edges,
};
const banner = `[extract] ${nodes.length} symbols, ${edges.length} edges (${edges.length - importEdgeCount} call + ${importEdgeCount} import) from ${files.length} files (${useCtags ? 'ctags' : 'regex'} engine); dropped ${ambiguousDropped} ambiguous bare-call edges`;
if (opts.out) { writeFileSync(resolve(opts.out), JSON.stringify(fragment, null, 2)); console.error(banner + ` -> ${opts.out}`); }
else { process.stdout.write(JSON.stringify(fragment)); console.error(banner); }
