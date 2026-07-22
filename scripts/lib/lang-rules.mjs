// codeweb per-language rules (finding 25) — the pure, in-process-testable half of symbol
// discovery. Everything here is a function of its arguments: the regex symbol scan for the 11
// native languages, body-extent measurement (brace/dedent), single-line signature extraction,
// and the small shared tables (KEYWORDS, DYNAMIC_RE, langOf). No IO, no process state, no
// imports beyond node:path — the extractor (scripts/extract-symbols.mjs) is the orchestrator
// that feeds it file text and a mask accessor. Bodies moved verbatim from the extractor; the
// per-language behavior is pinned by the A/B fragment equivalence and the language suites.

import { extname } from 'node:path';

/** Leading-whitespace width of a line — shared with lib/complexity.mjs (one truth; the gate flagged the drifted pair). */
export const indentOf = (s) => s.length - s.replace(/^\s+/, '').length;

export const KEYWORDS = new Set(['if','for','while','switch','catch','return','function','typeof','await','new','super','constructor','else','do','try','finally','class','import','export','const','let','var','async','yield','case','in','of','instanceof','delete','void','throw','with','print']);

// `masked(kind)` returns the masked text for this file (the extractor's per-file memo) — the
// Python AND Ruby branches need it here (def/class inside docstrings; def/class inside heredoc
// bodies — round 2, finding #13). maskPy is column-preserving; maskRuby preserves line count only,
// which is all the line-anchored Ruby rules read.
export function scanSymbols(file, text, masked) {
  const ext = extname(file).toLowerCase();
  const lines = (ext === '.py' ? masked('py') : ext === '.rb' ? masked('rb') : text).split(/\r?\n/); // hide def/class inside docstrings/heredocs
  const syms = [];
  const push = (name, line, kind, exported, owner) => { if (name && !KEYWORDS.has(name)) syms.push({ name, line: line + 1, kind, exports: !!exported, ...(owner ? { owner } : {}) }); };
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
    // Owner: a prescan records `impl [Trait for] Type { … }` extents (column-0 `impl` to the first
    // column-0 `}`, idiomatic rustfmt shape) so a method knows its impl type — two `fn new` across
    // two impls in one file must not share an id.
    const implRe = /^impl(?:\s*<[^>]*>)?\s+(?:.*?\bfor\s+)?([A-Za-z_]\w*)/;
    const implRanges = [];
    for (let i = 0; i < lines.length; i++) {
      const im = implRe.exec(lines[i]);
      if (!im) continue;
      let end = lines.length - 1;
      for (let j = i + 1; j < lines.length; j++) { if (/^\}/.test(lines[j])) { end = j; break; } }
      implRanges.push({ type: im[1], start: i + 1, end: end + 1 });
    }
    const implOwner = (lineNo) => { let best = null; for (const r of implRanges) if (lineNo > r.start && lineNo <= r.end && (!best || r.start > best.start)) best = r; return best ? best.type : undefined; };
    const DEF = /^(\s*)(pub(?:\([a-z]+\))?\s+)?(?:async\s+)?(?:unsafe\s+)?(?:const\s+)?(fn|struct|enum|trait)\s+([A-Za-z_]\w*)/;
    lines.forEach((ln, i) => {
      const m = DEF.exec(ln);
      if (!m) return;
      const indent = m[1].length, exported = !!m[2], key = m[3], name = m[4];
      const kind = key === 'fn' ? (indent > 0 ? 'method' : 'function') : 'class';
      const owner = kind === 'method' ? implOwner(i + 1) : undefined;
      syms.push({ name, line: i + 1, kind, exports: exported, ...(owner ? { owner } : {}) });
    });
  } else if (ext === '.go') {
    // Go: `func F(...)` is a function; `func (r R) M(...)` (a receiver in parens before the name)
    // is a method; `type X struct|interface { … }` is a class. Visibility is by initial case — an
    // uppercase first letter is exported. Names after func/type are real identifiers -> push direct.
    // Owner: the receiver TYPE (last identifier in the receiver, `*`/generics stripped) qualifies the
    // id — `func (a A) Do` and `func (b B) Do` in one file are different methods, not one.
    const methodRe = /^\s*func\s+\(([^)]*)\)\s+([A-Za-z_]\w*)/;
    const funcRe = /^\s*func\s+([A-Za-z_]\w*)/;
    const typeRe = /^\s*type\s+([A-Za-z_]\w*)\s+(?:struct|interface)\b/;
    const exp = (n) => /^[A-Z]/.test(n);
    const recvType = (recv) => { const m2 = /([A-Za-z_]\w*)\s*$/.exec(recv.replace(/\[[^\]]*\]/g, '').replace(/\*/g, '').trim()); return m2 ? m2[1] : undefined; };
    lines.forEach((ln, i) => {
      let m;
      if ((m = methodRe.exec(ln))) syms.push({ name: m[2], line: i + 1, kind: 'method', exports: exp(m[2]), ...(recvType(m[1]) ? { owner: recvType(m[1]) } : {}) });
      else if ((m = funcRe.exec(ln))) syms.push({ name: m[1], line: i + 1, kind: 'function', exports: exp(m[1]) });
      else if ((m = typeRe.exec(ln))) syms.push({ name: m[1], line: i + 1, kind: 'class', exports: exp(m[1]) });
    });
  } else if (ext === '.java') {
    // Java: class/interface/enum/record -> 'class' (public -> exported); a name(...)-{ line inside a
    // type is a method/constructor. Owner qualification reuses the enclosing-class mechanism (every
    // Java method is inside a type). Annotation lines (@Override) match nothing. Control-flow words
    // are filtered by KEYWORDS; `throws` clauses are tolerated before the brace.
    const TYPE = /^\s*(?:@[\w.$]+(?:\([^)]*\))?\s+)?(?:(?:public|protected|private|static|final|abstract|sealed|non-sealed|strictfp)\s+)*(class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/;
    const METHOD = /^\s+(?:(?:public|protected|private|static|final|abstract|synchronized|native|default|strictfp)\s+)*(?:<[^>]+>\s+)?(?:[\w$<>\[\],.?\s]+?\s+)?([A-Za-z_$][\w$]*)\s*\([^;{]*\)\s*(?:throws\s+[\w$,.\s]+)?\{/;
    const CTRL = new Set(['if', 'for', 'while', 'switch', 'catch', 'try', 'do', 'synchronized', 'assert', 'return', 'throw', 'new', 'else']);
    lines.forEach((ln, i) => {
      let m;
      if ((m = TYPE.exec(ln))) push(m[2], i, 'class', /\bpublic\b/.test(ln));
      else if ((m = METHOD.exec(ln)) && !CTRL.has(m[1])) push(m[1], i, 'method', /\bpublic\b/.test(ln));
    });
  } else if (ext === '.cs') {
    // C#: class/interface/struct/record/enum -> 'class' (public -> exported); methods like Java
    // (expression-bodied `=> …;` members end via the brace-less semicolon rule). Properties
    // (`int X { get; set; }`) are skipped — no param list, and they'd be reference noise.
    const TYPE = /^\s*(?:\[[^\]]*\]\s*)?(?:(?:public|private|protected|internal|static|sealed|abstract|partial|readonly|ref)\s+)*(class|interface|struct|record|enum)\s+([A-Za-z_][\w]*)/;
    // brace on the same line, `=> expr;`, or NOTHING after `)` — C#'s dominant Allman style puts
    // the `{` on the next line (bodyEnd handles that; a call statement line ends `);` so it can't
    // false-match the bare-`)` form).
    const METHOD = /^\s+(?:(?:public|private|protected|internal|static|virtual|override|abstract|sealed|async|extern|unsafe|new|partial)\s+)+(?:[\w<>\[\],.?\s]+?\s+)?([A-Za-z_][\w]*)\s*\([^;{]*\)\s*(?:where\s+[^{]+)?(?:\{|=>|$)/;
    const CTRL = new Set(['if', 'for', 'foreach', 'while', 'switch', 'catch', 'try', 'do', 'using', 'lock', 'fixed', 'return', 'throw', 'new', 'else']);
    lines.forEach((ln, i) => {
      let m;
      if ((m = TYPE.exec(ln))) push(m[2], i, 'class', /\bpublic\b/.test(ln));
      else if ((m = METHOD.exec(ln)) && !CTRL.has(m[1])) push(m[1], i, 'method', /\bpublic\b/.test(ln));
    });
  } else if (ext === '.rb') {
    // Ruby (Spec I): class/module + def (self. = class-level, same owner), everything public by
    // default. Extents are indentation-based (idiomatic 2-space Ruby) — see isIndentLang below.
    // Line-anchored patterns are comment-safe (`# def x` can't match ^\s*def).
    const ownerRanges = [];
    const ownerAt = (lineNo) => { let best = null; for (const o of ownerRanges) if (lineNo > o.start && lineNo < o.end && (!best || o.start > best.start)) best = o; return best?.name; };
    lines.forEach((ln, i) => {
      let m;
      if ((m = /^(\s*)(?:class|module)\s+([A-Z]\w*)/.exec(ln))) {
        const indent = m[1].length;
        let end = lines.length;
        for (let j = i + 1; j < lines.length; j++) {
          if (/^\s*end\b/.test(lines[j]) && (lines[j].match(/^\s*/)[0].length <= indent)) { end = j + 1; break; }
        }
        ownerRanges.push({ name: m[2], start: i + 1, end, indent });
        push(m[2], i, 'class', true);
      } else if ((m = /^(\s*)def\s+(?:self\.)?([A-Za-z_]\w*[?!]?)/.exec(ln))) {
        const owner = m[1].length ? ownerAt(i + 1) : undefined;
        push(m[2], i, owner ? 'method' : 'function', true, owner);
      }
    });
  } else if (ext === '.php') {
    // PHP (Spec I): class/interface/trait + function members (visibility-as-export, public
    // default); top-level functions. Owner qualification rides the enclosing-class ranges.
    const TYPE = /^\s*(?:abstract\s+|final\s+)?(?:class|interface|trait)\s+([A-Za-z_]\w*)/;
    const FN = /^(\s*)(?:(?:public|protected|private|static|final|abstract)\s+)*function\s+&?\s*([A-Za-z_]\w*)\s*\(/;
    lines.forEach((ln, i) => {
      let m;
      if ((m = TYPE.exec(ln))) push(m[1], i, 'class', true);
      else if ((m = FN.exec(ln))) push(m[2], i, m[1].length ? 'method' : 'function', !/\b(?:private|protected)\b/.test(ln));
    });
  } else if (ext === '.kt' || ext === '.kts') {
    // Kotlin (Spec I): class/object/interface + fun members (public-by-default; private/internal
    // -> not exported); expression-bodied `fun f() = …` extents collapse to one line via bodyEnd.
    // `fun Type.name(` (extension function) owner-qualifies to the receiver type directly.
    const TYPE = /^\s*(?:(?:public|private|internal|protected|open|final|abstract|sealed|data|inner|enum|annotation|value)\s+)*(?:class|object|interface)\s+([A-Za-z_]\w*)/;
    const FUN = /^(\s*)(?:(?:public|private|internal|protected|open|override|final|abstract|suspend|inline|operator|infix|tailrec|external|actual|expect)\s+)*fun\s+(?:<[^>]+>\s+)?(?:([A-Za-z_][\w.]*)\.)?([A-Za-z_]\w*)\s*\(/;
    lines.forEach((ln, i) => {
      let m;
      if ((m = TYPE.exec(ln))) push(m[1], i, 'class', !/\b(?:private|internal)\b/.test(ln));
      else if ((m = FUN.exec(ln))) {
        const recv = m[2] ? m[2].split('.').pop() : undefined;
        push(m[3], i, m[1].length || recv ? 'method' : 'function', !/\b(?:private|internal)\b/.test(ln), recv);
      }
    });
  } else if (ext === '.swift') {
    // Swift (Spec I): class/struct/enum/protocol/actor/extension + func members. Default access
    // is internal (module-scoped) -> only public/open count as exported. Extension members
    // owner-qualify to the extended type via the extension's range.
    const TYPE = /^\s*(?:(?:public|open|internal|fileprivate|private|final|indirect)\s+)*(?:class|struct|enum|protocol|extension|actor)\s+([A-Za-z_]\w*)/;
    const FUNC = /^(\s*)(?:(?:public|open|internal|fileprivate|private|final|static|class|override|mutating|nonmutating|convenience|required|dynamic|@\w+(?:\([^)]*\))?)\s+)*func\s+([A-Za-z_]\w*)\s*[(<]/;
    lines.forEach((ln, i) => {
      let m;
      if ((m = TYPE.exec(ln))) push(m[1], i, 'class', /\b(?:public|open)\b/.test(ln));
      else if ((m = FUNC.exec(ln))) push(m[2], i, m[1].length ? 'method' : 'function', /\b(?:public|open)\b/.test(ln));
    });
  } else {
    const exported = (ln) => /\bexport\b/.test(ln);
    lines.forEach((ln, i) => {
      let m;
      if ((m = /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/.exec(ln))) push(m[1], i, 'function', exported(ln));
      // Round 2, finding #9: `(?!\s*\(\()` rejects IIFE initializers — `const PERM_SEEDS = (() => {…})()`
      // matched via the `\([^)]*\)\s*=>` alternative eating the inner paren, minting a function node
      // for a VALUE (a guaranteed deadcode false positive). The lookahead is anchored AT the `=`
      // with the whitespace inside it (a `=\s*(?!\(\()` form is defeated by `\s*` backtracking).
      // The `= ((` prefix is the only line-local signal (the invoking `()` sits on a later line for
      // multi-line IIFEs), so genuinely function-valued, non-invoked `const g = ((a) => a)` ALSO
      // loses its node — accepted recall loss, pinned in tests/spread-iife-selfmap.test.mjs.
      // Residuals: a space-separated `= ( (` IIFE and `= (async () => {…})()` still match;
      // `= (function () {})()` never matched any alternative — arrow-IIFEs were the only false-node class.
      else if ((m = /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=(?!\s*\(\()\s*(?:async\s*)?(?:function\b|\*?\s*\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/.exec(ln))) push(m[1], i, 'function', exported(ln));
      else if ((m = /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/.exec(ln))) push(m[1], i, 'class', exported(ln));
      // Round 2, finding #12 (T-12.3): modifiers STACK (`public static run(`), the `*` sits outside
      // the \s+-terminated group (or `*gen() {` — no space after `*` — regresses to invisible), the
      // param interior is [^;]* — NOT [^;{}]* (that would regress destructured params `move({ x, y })`,
      // matched today) — additionally admitting default params (`render(x = 1)`), and a `: Type`
      // return annotation is allowed before the brace (`get value(): number {` was invisible, its
      // body's calls re-attributed to the class). Methods actually NAMED get/set keep matching: the
      // modifier group requires trailing \s+, so it backtracks to zero reps and the name capture
      // takes the word. Known noise class (pre-existing, pinned in tests): `it('works', function () {`
      // matches in all variants; `describe('x', () => {` matches in none; `if (…) {` dies in KEYWORDS.
      else if ((m = /^\s{2,}(?:(?:public|private|protected|static|readonly|async|get|set)\s+)*(?:\*\s*)?([A-Za-z_$][\w$]*)\s*\([^;]*\)(?:\s*:\s*[^{;=]+)?\s*\{/.exec(ln))) push(m[1], i, 'method', false);
      // class-field arrow methods (`handleClick = () => {` / `run = async (x) => …`) — the standard
      // React/TS pattern the method regex (name + paren) can't see. Marked `field`: the node is only
      // kept when an ENCLOSING CLASS confirms it (a bare local `cb = () => {}` reassignment inside a
      // function must not become a phantom method).
      else if ((m = /^\s{2,}(?:public\s+|private\s+|protected\s+|readonly\s+|static\s+)*([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/.exec(ln))) { if (m[1] && !KEYWORDS.has(m[1])) syms.push({ name: m[1], line: i + 1, kind: 'method', exports: false, field: true }); }
    });
  }
  return syms;
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
export function bodyEnd(lines, startIdx, isPy) {
  if (isPy) {
    const base = indentOf(lines[startIdx] || '');
    let end = startIdx;
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (lines[i].trim() === '') continue;        // blank lines don't end a body
      if (indentOf(lines[i]) <= base) break;      // dedent to <= the def -> body ended above
      end = i;
    }
    return end;
  }
  // Brace count gated on paren depth 0: a `{`/`}` inside a parameter list — destructuring
  // (`function f({ a, b }) {`) or an object-literal default (`f(o = { x: 1 }) {`) — must NOT be
  // read as the body brace, or the body would end at the signature line (the destructuring `{ }`
  // balances to zero before the real body opens), mis-attributing every body call to <module>. The
  // structural body braces are always at paren depth 0; object-literal call args inside the body sit
  // at paren depth >= 1 and are balanced, so skipping them is strictly safe.
  let depth = 0, started = false, paren = 0;
  for (let i = startIdx; i < lines.length; i++) {
    const s = stripSC(lines[i]);
    for (let c = 0; c < s.length; c++) {
      const ch = s[c];
      if (ch === '(') paren++;
      else if (ch === ')') { if (paren > 0) paren--; }
      else if (paren === 0) {
        if (ch === '{') { depth++; started = true; }
        else if (ch === '}') { depth--; if (started && depth <= 0) return i; }
      }
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
export function parseSignature(line, name, isPy) {
  // Find the param-list open-paren for BOTH `name(...)` (declaration) and `name = [async]
  // [function [g]] (...)` (arrow / function-expression assignment) — so `const f = (a, b) => …`
  // parses, not just `function f(a, b)`. finding 11: this used to compile a fresh RegExp from the
  // (mostly unique) symbol name per node — 27% of a regex-path extract in profile. The indexOf
  // scan below performs the identical match (same boundaries, same optional groups, first
  // completing occurrence wins) with zero regex construction.
  const n = line.length;
  const isWs = (c) => c === ' ' || c === '\t' || c === '\f' || c === '\v' || c === ' ';
  const isWord = (c) => c === '$' || c === '_' || (c >= '0' && c <= '9') || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
  let open = -1;
  for (let from = 0; from < n && open === -1;) {
    const at = line.indexOf(name, from);
    if (at === -1) break;
    from = at + 1;
    if (at > 0 && isWord(line[at - 1])) continue;               // left boundary: ^ or [^\w$]
    let i = at + name.length;
    while (i < n && isWs(line[i])) i++;
    if (line[i] === '=') {                                       // `= [async] [function[*] [id]]` form
      i++;
      while (i < n && isWs(line[i])) i++;
      if (line.startsWith('async', i) && isWs(line[i + 5] || '')) { // async requires trailing ws (as `async\s+` did)
        i += 5;
        while (i < n && isWs(line[i])) i++;
      }
      if (line.startsWith('function', i)) {
        i += 8;
        while (i < n && isWs(line[i])) i++;
        if (line[i] === '*') { i++; while (i < n && isWs(line[i])) i++; }
        while (i < n && isWord(line[i])) i++;                    // optional fn-expression name
        while (i < n && isWs(line[i])) i++;
      }
    }
    if (line[i] === '(') open = i;
  }
  if (open === -1) return null;              // no param paren attributable to `name` on this line
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

// Files using dynamic dispatch (computed member calls, getattr, non-literal require, event
// emitters) hide call edges no static map can see — recorded per file for answer-time calibration.
export const DYNAMIC_RE = /\[[A-Za-z_$][\w$]*\]\s*\(|\bgetattr\s*\(|require\s*\(\s*[^'"`)\s]|\.emit\s*\(|globalThis\s*\[|window\s*\[/;

/** Language of a repo-relative file path (extension-keyed; the meta.languages vocabulary). */
export const langOf = (f) => (f.endsWith('.py') ? 'python' : f.endsWith('.rs') ? 'rust' : f.endsWith('.go') ? 'go' : f.endsWith('.java') ? 'java' : f.endsWith('.cs') ? 'csharp' : f.endsWith('.rb') ? 'ruby' : f.endsWith('.php') ? 'php' : /\.kts?$/.test(f) ? 'kotlin' : f.endsWith('.swift') ? 'swift' : /\.tsx?$/.test(f) ? 'typescript' : 'javascript');
