// codeweb source masking — pure, column- and line-count-preserving blanking of the regions the
// symbol/edge scanners must never read as code: comments, string/template interiors, and (JS-family)
// regex-literal interiors. Extracted from extract-symbols.mjs (perf-quality finding 2 needed the
// masks importable; finding 25 wanted the module anyway). No I/O. Two modes:
//   default          — blank comments AND values (strings/templates/regex interiors): the LIVE-CODE
//                      view the extent/edge scanners consume.
//   {keepValues:true} — blank comments ONLY, keep values verbatim: consumers diff the two views to
//                      classify an occurrence as live code / inside-a-value / inside-a-comment
//                      (codemod's rewrite gate — a name in a string can be load-bearing).
// maskJs/maskPy preserve columns exactly (masked region -> same-length spaces) so indexes computed
// on the mask apply to the raw text. maskRuby is line-local and NOT column-preserving (Ruby extents
// are indentation-based; only line identity matters there).

// Blank Python triple-quoted strings (docstrings) and `#` comments so the symbol/edge scanners never
// see `def`/`class`/calls that live INSIDE documentation — the root cause of phantom symbols and
// fabricated edges (e.g. flask helpers.py's make_response docstring fabricates a render_template
// caller). Single-line '...'/"..." strings are blanked first so a `#` or `"""` inside them can't be
// mistaken for a comment/docstring delimiter. Best-effort: escapes inside triple-strings aren't
// tracked, worst case is a slightly-off mask.
export function maskPy(text, { keepValues = false } = {}) {
  const lines = text.split(/\r?\n/);
  const out = [];
  let triple = null; // active multi-line triple-quote delimiter ('"""' or "'''")
  for (const line of lines) {
    const n = line.length; let res = '', i = 0;
    while (i < n) {
      if (triple) {
        const end = line.indexOf(triple, i);
        if (end === -1) { res += keepValues ? line.slice(i) : ' '.repeat(n - i); i = n; }
        else { res += keepValues ? line.slice(i, end + 3) : ' '.repeat(end + 3 - i); i = end + 3; triple = null; }
        continue;
      }
      const ch = line[i];
      if (ch === '#') { res += ' '.repeat(n - i); i = n; continue; }      // comment to EOL
      if (ch === '"' || ch === "'") {
        const tri = line.substr(i, 3);
        if (tri === '"""' || tri === "'''") {
          const end = line.indexOf(tri, i + 3);
          if (end === -1) { triple = tri; res += keepValues ? line.slice(i) : ' '.repeat(n - i); i = n; }   // opens, spans lines
          else { res += keepValues ? line.slice(i, end + 3) : ' '.repeat(end + 3 - i); i = end + 3; }      // single-line triple
          continue;
        }
        let j = i + 1;                                                         // single-line string
        while (j < n && line[j] !== ch) { if (line[j] === '\\') j++; j++; }
        const stop = Math.min(j + 1, n);
        res += keepValues ? line.slice(i, stop) : ' '.repeat(stop - i); i = stop;
        continue;
      }
      res += ch; i++;
    }
    out.push(res);
  }
  return out.join('\n');
}

// Ruby masking (Spec I): line-local — string contents first (so interpolation can't fake a
// comment), then `#`-to-EOL. Not column-preserving (see header). Round 2, finding #15: unrolled-loop
// form (this site's escape atom is `\\[^]`) — the alternation form recursed per character in V8 and
// a >=8.4MB single-line string RangeError'd the whole extract.
const RB_DQ = /"[^"\\]*(?:\\[^][^"\\]*)*"/g;
const RB_SQ = /'[^'\\]*(?:\\[^][^'\\]*)*'/g;
export function maskRuby(text) {
  return text.split(/\r?\n/).map((ln) => ln
    .replace(RB_DQ, '""')
    .replace(RB_SQ, "''")
    .replace(/#.*$/, '')).join('\n');
}

// JS/TS counterpart of maskPy for the edge-derivation scan: blanks `//` line comments and `/* */`
// block comments (and ' " string interiors) to spaces, preserving line + column counts, so a call
// written INSIDE a comment can't fabricate a call edge (e.g. a checkout.mjs doc comment
// `cartSubtotal() -> computeLineTotal()` fabricating two edges — the same phantom-edge class the
// Python docstring mask already fixes). STRING-AWARE: a `//` inside a string (`"http://…"`) is not a
// comment. Template literals are special — their TEXT is blanked but a `${ … }` interpolation is REAL
// code and is kept verbatim (so `${ fmt() }` still edges). REGEX-AWARE (#1): a `/` in expression
// position — start of input, after most punctuation, or after a keyword like `return` — opens a
// regex literal; its interior (which may hold quotes, backticks, or braces: the ubiquitous
// escaping-helper replace(/…/g) patterns, or a {2} quantifier) is blanked like a string so it can
// never desync the string/template state or the brace counters (the bug that ran bodies to EOF and
// fabricated edges from the absorbed code). After an identifier, `)`, `]`, `.`, or `<` (JSX close
// tags), `/` is division and passes through; a candidate with no closing `/` on the line falls
// back to division (regex literals cannot span lines). Block comments and template literals may
// span lines, so that open state is carried across the loop. Best-effort (same ethos as maskPy):
// pathological forms (`a++ /b/ c`) mis-lex exactly as in every heuristic lexer; worst case is a
// slightly-off mask, never a crash.
const REGEX_PREV_KW = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
export function maskJs(text, { keepValues = false } = {}) {
  const lines = text.split(/\r?\n/);
  const out = [];
  let inBlock = false;   // inside /* */ spanning lines
  let inTemplate = false; // inside `...` template TEXT (not inside ${})
  let exprDepth = 0;      // brace depth inside a template ${ ... } interpolation (0 = not in expr)
  let lastSig = null;     // last significant real-code char emitted (null = nothing yet)
  let lastWord = '';      // trailing identifier run ending at lastSig (for keyword detection)
  const note = (ch) => { if (ch !== ' ' && ch !== '\t') { lastWord = /[A-Za-z0-9_$]/.test(ch) ? lastWord + ch : ''; lastSig = ch; } };
  const noteValue = () => { lastSig = ')'; lastWord = ''; };  // a string/template/regex just closed: a value — `/` after it is division
  const regexCanFollow = () =>
    lastSig === null ? true
      : /[A-Za-z0-9_$]/.test(lastSig) ? REGEX_PREV_KW.has(lastWord)
        : !(lastSig === ')' || lastSig === ']' || lastSig === '.' || lastSig === '<');
  // Scan the regex literal opened by the `/` at i: escape- and char-class-aware ([/] does not close).
  // Returns {close, end} (closing `/`, index past the flags) or null when unterminated on this line.
  const scanRegex = (line, i) => {
    const n = line.length;
    let cls = false;
    for (let j = i + 1; j < n; j++) {
      const cj = line[j];
      if (cj === '\\') { j++; continue; }
      if (cls) { if (cj === ']') cls = false; continue; }
      if (cj === '[') { cls = true; continue; }
      if (cj === '/') { let k = j + 1; while (k < n && /[a-z]/i.test(line[k])) k++; return { close: j, end: k }; }
    }
    return null;
  };
  const value = (s) => (keepValues ? s : ' '.repeat(s.length));
  for (const line of lines) {
    const n = line.length; let res = '', i = 0;
    while (i < n) {
      if (inBlock) {
        const end = line.indexOf('*/', i);
        if (end === -1) { res += ' '.repeat(n - i); i = n; }
        else { res += ' '.repeat(end + 2 - i); i = end + 2; inBlock = false; }
        continue;
      }
      if (inTemplate && exprDepth === 0) {           // template TEXT — blank it, watch for `${` / closing backtick
        const ch = line[i];
        if (ch === '`') { res += keepValues ? '`' : ' '; i++; inTemplate = false; noteValue(); continue; }
        if (ch === '$' && line[i + 1] === '{') { res += '${'; i += 2; exprDepth = 1; lastSig = '{'; lastWord = ''; continue; } // keep expr
        res += keepValues ? ch : ' '; i++; continue; // template literal text
      }
      if (exprDepth > 0) {                            // inside ${ ... } — keep verbatim (real code), match braces
        const ch = line[i];
        if (ch === '"' || ch === "'") {               // skip string interior so a `}` inside it can't miscount
          let j = i + 1; while (j < n && line[j] !== ch) { if (line[j] === '\\') j++; j++; }
          const stop = Math.min(j + 1, n); res += line.slice(i, stop); i = stop; noteValue(); continue;
        }
        if (ch === '/' && regexCanFollow()) {         // regex literal in the interpolation — blank it so a
          const m = scanRegex(line, i);               // quote or {n} quantifier can't desync brace matching
          if (m) { res += '/' + value(line.slice(i + 1, m.close)) + '/' + value(line.slice(m.close + 1, m.end)); i = m.end; noteValue(); continue; }
        }
        if (ch === '{') exprDepth++;
        else if (ch === '}') { exprDepth--; if (exprDepth === 0) { res += ch; i++; inTemplate = true; note(ch); continue; } }
        note(ch); res += ch; i++; continue;
      }
      const ch = line[i];                             // normal code
      if (ch === '/' && line[i + 1] === '/') { res += ' '.repeat(n - i); i = n; continue; } // line comment
      if (ch === '/' && line[i + 1] === '*') {                                               // block comment
        const end = line.indexOf('*/', i + 2);
        if (end === -1) { inBlock = true; res += ' '.repeat(n - i); i = n; }
        else { res += ' '.repeat(end + 2 - i); i = end + 2; }
        continue;
      }
      if (ch === '/' && regexCanFollow()) {                                                  // regex literal
        const m = scanRegex(line, i);
        if (m) { res += '/' + value(line.slice(i + 1, m.close)) + '/' + value(line.slice(m.close + 1, m.end)); i = m.end; noteValue(); continue; }
      }
      if (ch === '"' || ch === "'") {                                                        // string literal
        let j = i + 1; while (j < n && line[j] !== ch) { if (line[j] === '\\') j++; j++; }
        const stop = Math.min(j + 1, n); res += value(line.slice(i, stop)); i = stop; noteValue(); continue;
      }
      if (ch === '`') { res += keepValues ? '`' : ' '; i++; inTemplate = true; continue; }   // open template literal
      note(ch); res += ch; i++;
    }
    out.push(res);
  }
  return out.join('\n');
}

// Column-preserving mask for a path, by extension — or null when this language has no aligned mask
// (Ruby's is line-local; unknown extensions have none). Callers that index into the raw text via
// the mask MUST handle null (fall back to their pre-mask behavior or refuse).
export function maskAligned(relPath, text, opts = {}) {
  const r = String(relPath);
  if (r.endsWith('.py')) return maskPy(text, opts);
  if (/\.(jsx?|mjs|cjs|tsx?|java|cs|php|kt|kts|swift)$/.test(r)) return maskJs(text, opts);
  return null;
}
