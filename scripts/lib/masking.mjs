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
// mistaken for a comment/docstring delimiter. F-STRINGS (round 2, finding #14): a quote preceded by
// a 1-3 char [rRbBuUfF] prefix run containing f/F is an f-string — its `{…}` interpolations are
// EXECUTING code (the exact analogue of the JS `${}` rule) and are kept verbatim in both modes,
// with a brace-depth counter for nested {} (dicts, format specs f"{x:{w}}") and `{{`/`}}` blanking
// as 2-char text; a quoted run INSIDE the expr blanks through the keepValues gate as one slice
// (delimiters included — kept-in-default quotes would re-mask as normal strings and break
// idempotence), and consuming the whole run keeps a `}` inside it from closing the expr early.
// Triple-quoted f-strings carry expr state across lines; a single-line f-string whose expr is
// unterminated at EOL resets to code state (single-line strings never span lines). Nested f-strings
// inside an expr (f"{f'{x}'}", py3.12 same-quote nesting) are treated as plain quoted runs — the
// inner {x} blanks; accepted best-effort. Best-effort limits: escapes inside triple-strings aren't
// tracked; worst case is a slightly-off mask.
export function maskPy(text, { keepValues = false } = {}) {
  const lines = text.split(/\r?\n/);
  const out = [];
  let triple = null; // active multi-line triple-quote: {delim: '"""'|"'''", isF, exprDepth}
  // f-string prefix sniff at a quote at line[i]: the MAXIMAL word-char run ending at i is a string
  // prefix iff 1-3 chars, all in [rRbBuUfF], containing f/F. Maximality makes the left word
  // boundary automatic (`x1f"…"` scans back to `x1f` and is rejected).
  const fPrefixAt = (line, i) => {
    let j = i;
    while (j > 0 && /[A-Za-z0-9_]/.test(line[j - 1])) j--;
    const run = line.slice(j, i);
    return run.length >= 1 && run.length <= 3 && /^[rRbBuUfF]+$/.test(run) && /[fF]/.test(run);
  };
  // Scan an f-string BODY from i (text or expr per st.exprDepth) to EOL or the closing st.delim.
  // Mutates st.exprDepth; sets st.closed when the delimiter closed on this line. Returns {res, i}.
  const scanF = (line, i, st) => {
    const n = line.length; let res = '';
    while (i < n) {
      if (st.exprDepth > 0) {                          // inside {…} — real code, verbatim in both modes
        const ch = line[i];
        if (ch === '"' || ch === "'") {                // quoted run inside the expr -> keepValues gate
          let j = i + 1;
          while (j < n && line[j] !== ch) { if (line[j] === '\\') j++; j++; }
          const stop = Math.min(j + 1, n);
          res += keepValues ? line.slice(i, stop) : ' '.repeat(stop - i);
          i = stop; continue;
        }
        if (ch === '{') { st.exprDepth++; res += ch; i++; continue; }
        if (ch === '}') { st.exprDepth--; res += ch; i++; continue; } // depth 0 -> back to TEXT
        res += ch; i++; continue;
      }
      if (line.startsWith(st.delim, i)) {              // closing delimiter
        res += keepValues ? st.delim : ' '.repeat(st.delim.length);
        i += st.delim.length; st.closed = true; break;
      }
      const ch = line[i];                              // f-string TEXT
      if (ch === '{' && line[i + 1] === '{') { res += keepValues ? '{{' : '  '; i += 2; continue; }
      if (ch === '}' && line[i + 1] === '}') { res += keepValues ? '}}' : '  '; i += 2; continue; }
      if (ch === '{') { res += '{'; i++; st.exprDepth = 1; continue; }
      if (ch === '\\') { const stop = Math.min(i + 2, n); res += keepValues ? line.slice(i, stop) : ' '.repeat(stop - i); i = stop; continue; }
      res += keepValues ? ch : ' '; i++; continue;
    }
    return { res, i };
  };
  for (const line of lines) {
    const n = line.length; let res = '', i = 0;
    while (i < n) {
      if (triple) {
        if (triple.isF) {                              // triple f-string body: text/expr carry across lines
          const r2 = scanF(line, i, triple);
          res += r2.res; i = r2.i;
          if (triple.closed) triple = null;
          continue;
        }
        const end = line.indexOf(triple.delim, i);
        if (end === -1) { res += keepValues ? line.slice(i) : ' '.repeat(n - i); i = n; }
        else { res += keepValues ? line.slice(i, end + 3) : ' '.repeat(end + 3 - i); i = end + 3; triple = null; }
        continue;
      }
      const ch = line[i];
      if (ch === '#') { res += ' '.repeat(n - i); i = n; continue; }      // comment to EOL
      if (ch === '"' || ch === "'") {
        const isF = fPrefixAt(line, i);
        const tri = line.substr(i, 3);
        if (tri === '"""' || tri === "'''") {
          if (isF) {                                                          // f-triple opens (may close same-line)
            res += keepValues ? tri : '   '; i += 3;
            triple = { delim: tri, isF: true, exprDepth: 0 };
            continue;                                                         // the triple branch scans the remainder
          }
          const end = line.indexOf(tri, i + 3);
          if (end === -1) { triple = { delim: tri, isF: false }; res += keepValues ? line.slice(i) : ' '.repeat(n - i); i = n; }   // opens, spans lines
          else { res += keepValues ? line.slice(i, end + 3) : ' '.repeat(end + 3 - i); i = end + 3; }      // single-line triple
          continue;
        }
        if (isF) {                                                             // single-line f-string
          res += keepValues ? ch : ' ';                                        // opening delimiter
          const st = { delim: ch, isF: true, exprDepth: 0 };
          const r2 = scanF(line, i + 1, st);
          res += r2.res; i = r2.i;                                             // unterminated at EOL -> reset to code state
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

// Ruby masking (Spec I): per-line — string contents first (so interpolation can't fake a comment),
// then `#`-to-EOL, then heredoc openers. Not column-preserving (see header); line COUNT is
// preserved. Round 2, finding #15: unrolled-loop string regexes (this site's escape atom is
// `\\[^]`) — the alternation form recursed per character in V8 and a >=8.4MB single-line string
// RangeError'd the whole extract. Round 2, finding #13: HEREDOC state — a FIFO queue of pending
// tags. Per-line order: (1) queue non-empty -> this line is heredoc BODY: emit an EMPTY line
// (dequeue when it matches the FRONT tag's terminator rule — `~`/`-` tags by trimmed equality,
// plain tags at column 0), and run NO string/comment replaces or opener scanning on it (a `<<X`
// inside a body must not queue); (2) otherwise mask strings/comments FIRST (an opener inside
// "…"/#… is already gone — note this also eats '"TAG"'/"'TAG'" QUOTED-tag openers before the scan;
// only backtick-quoted tags survive to it — accepted limit), then scan for openers
// `<<[~-]?TAG` (no space after `<<`, so `a << b` shift stays code; `<<=` never matches), queueing
// left-to-right (stacked `f(<<~A, <<~B)` works) and replacing each opener TOKEN with the
// two-character literal '' — an empty Ruby string, so `sql = <<~SQL.strip` masks to
// `sql = ''.strip` and the rest of the line stays live. Opener-token blanking is also what keeps
// maskRuby idempotent (a re-mask sees no opener). Accepted limit: `#{…}` interpolation inside
// heredoc bodies is blanked with the body — consistent with RB_DQ already replacing
// "…#{helper(x)}…" with "" (Ruby interpolation edges are a pre-existing, documented recall gap).
const RB_DQ = /"[^"\\]*(?:\\[^][^"\\]*)*"/g;
const RB_SQ = /'[^'\\]*(?:\\[^][^'\\]*)*'/g;
const RB_HEREDOC_OPEN = /<<([~-]?)(["'`]?)([A-Za-z_]\w*)\2/g;
export function maskRuby(text) {
  const out = [];
  const pending = []; // FIFO of open heredoc tags: {tag, flex} — flex = `~`/`-` (indented terminator allowed)
  for (const ln of text.split(/\r?\n/)) {
    if (pending.length) {
      const front = pending[0];
      const isTerm = front.flex
        ? ln.trim() === front.tag
        : ln.startsWith(front.tag) && ln.slice(front.tag.length).trim() === ''; // /^TAG\s*$/, column 0
      if (isTerm) pending.shift();
      out.push(''); // body AND terminator lines mask to length-0 lines
      continue;
    }
    let masked = ln.replace(RB_DQ, '""').replace(RB_SQ, "''").replace(/#.*$/, '');
    RB_HEREDOC_OPEN.lastIndex = 0;
    if (masked.includes('<<')) {
      masked = masked.replace(RB_HEREDOC_OPEN, (_all, dash, _q, tag) => {
        pending.push({ tag, flex: dash !== '' });
        return "''";
      });
    }
    out.push(masked);
  }
  return out.join('\n');
}

// JS/TS counterpart of maskPy for the edge-derivation scan: blanks `//` line comments and `/* */`
// block comments (and ' " string interiors) to spaces, preserving line + column counts, so a call
// written INSIDE a comment can't fabricate a call edge (e.g. a checkout.mjs doc comment
// `cartSubtotal() -> computeLineTotal()` fabricating two edges — the same phantom-edge class the
// Python docstring mask already fixes). STRING-AWARE: a `//` inside a string (`"http://…"`) is not a
// comment. Template literals are special — their TEXT is blanked but a `${ … }` interpolation is REAL
// code and is kept live (so `${ fmt() }` still edges); string literals INSIDE `${}` are VALUES and
// route through the keepValues gate, and a nested template inside `${}` pushes its own frame
// (round 2, finding #8 — see the tpl stack below). REGEX-AWARE (#1): a `/` in expression
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
// Round 2, finding #13 (T-13.2): {hashComment:true} treats `#` in normal code as a to-EOL comment —
// PHP's third comment syntax. php-only (set by maskAligned/maskedOnce for .php paths), so JS
// private fields `#x` are unaffected; the branch order guarantees a `#` inside strings/templates
// never reaches it.
const REGEX_PREV_KW = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
// Round 2, finding #20 (T-20.1): charCode word-class — exactly [A-Za-z0-9_$], replacing a compiled
// regex .test() per character on the hottest path in the repo (masking runs on every cold/changed
// file and, pre-#17, on the whole repo after any symbol-set change).
const isWordCode = (c) => (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || (c >= 48 && c <= 57) || c === 36 || c === 95;
export function maskJs(text, { keepValues = false, hashComment = false } = {}) {
  const lines = text.split(/\r?\n/);
  const out = [];
  let inBlock = false;   // inside /* */ spanning lines
  // Round 2, finding #8: template state is a STACK of frames — one {depth} per open template
  // literal — replacing the two scalars (inTemplate, exprDepth) that could not represent a nested
  // template inside `${}` (its text stayed live and its `}`s decremented the OUTER expr depth,
  // inverting state). Invariants: in template TEXT ⇔ tpl.length && top.depth === 0; inside a `${}`
  // expr ⇔ top.depth > 0. Cross-line invariant: the only state crossing a newline is inBlock, the
  // tpl stack, and lastSig/lastWord — a line ending mid-TEXT resumes in TEXT, mid-expr at depth>0
  // resumes in that expr (multi-line templates and multi-line `${}` flow through unchanged), and an
  // unterminated template at EOF simply blanks the remainder as text. Every template-delimiter
  // backtick — open, close, nested push from expr — emits keepValues ? '`' : ' ' (a verbatim
  // backtick in default-mode output would flip state on re-mask, breaking idempotence).
  const tpl = [];
  let lastSig = null;     // last significant real-code char emitted (null = nothing yet)
  let lastWord = '';      // trailing identifier run ending at lastSig (for keyword detection)
  const note = (ch) => { if (ch !== ' ' && ch !== '\t') { lastWord = isWordCode(ch.charCodeAt(0)) ? lastWord + ch : ''; lastSig = ch; } };
  // Round 2, finding #20 (T-20.2): fold a whole span of plain code into lastSig/lastWord in ONE
  // backward walk, reproducing note()'s per-char accumulation exactly — including its
  // across-spaces quirk (`foo bar` accumulates lastWord `foobar`: spaces/tabs are skipped, they
  // never reset the word). From the run end: skip spaces/tabs; no other char -> both unchanged;
  // first other char is the new lastSig; if non-word, lastWord = ''; else collect word chars
  // walking further back (still skipping spaces/tabs, stopping at the first other char), and
  // prefix the INCOMING lastWord iff the walk exhausted the run (note()'s invariant guarantees
  // lastWord is '' whenever lastSig is non-word, so the unconditional prefix is exact).
  const noteRun = (line, from, to) => {
    let end = to;
    while (end > from) { const c = line.charCodeAt(end - 1); if (c === 32 || c === 9) end--; else break; }
    if (end === from) return;
    const sig = line.charCodeAt(end - 1);
    lastSig = line[end - 1];
    if (!isWordCode(sig)) { lastWord = ''; return; }
    let word = line[end - 1];
    let exhausted = true;
    for (let k = end - 2; k >= from; k--) {
      const c = line.charCodeAt(k);
      if (c === 32 || c === 9) continue;
      if (isWordCode(c)) { word = line[k] + word; continue; }
      exhausted = false; break;
    }
    lastWord = exhausted ? lastWord + word : word;
  };
  const noteValue = () => { lastSig = ')'; lastWord = ''; };  // a string/template/regex just closed: a value — `/` after it is division
  const regexCanFollow = () =>
    lastSig === null ? true
      : isWordCode(lastSig.charCodeAt(0)) ? REGEX_PREV_KW.has(lastWord)
        : !(lastSig === ')' || lastSig === ']' || lastSig === '.' || lastSig === '<');
  // Scan the regex literal opened by the `/` at i: escape- and char-class-aware ([/] does not close).
  // Returns {close, end} (closing `/`, index past the flags) or null when unterminated on this line.
  // Flags loop is charCode A-Za-z (65-90 | 97-122) — what /[a-z]/i matched (finding #20).
  const scanRegex = (line, i) => {
    const n = line.length;
    let cls = false;
    for (let j = i + 1; j < n; j++) {
      const cj = line[j];
      if (cj === '\\') { j++; continue; }
      if (cls) { if (cj === ']') cls = false; continue; }
      if (cj === '[') { cls = true; continue; }
      if (cj === '/') {
        let k = j + 1;
        while (k < n) { const fc = line.charCodeAt(k); if ((fc >= 65 && fc <= 90) || (fc >= 97 && fc <= 122)) k++; else break; }
        return { close: j, end: k };
      }
    }
    return null;
  };
  const value = (s) => (keepValues ? s : ' '.repeat(s.length));
  // Round 2, finding #20 (T-20.2): span-copy. Instead of one branch cascade + one `res += ch` per
  // character, each state scans ahead to its next SPECIAL character and appends the whole run with
  // one slice (or one repeat), then hands the special char to the unchanged branch logic. The
  // special sets are RE-DERIVED from the state machine as it stands after WS-B (#8/#13) — the #20
  // spec's enumeration predated those and missed two members, noted inline:
  //   normal code:      `/` `"` `'` `` ` ``  (+ `#` in hashComment mode) — openers of
  //                     comment/regex/string/template; everything else runs through noteRun.
  //   `${}` interior:   `"` `'` `/` `` ` `` `{` `}` — the backtick is IN the set (finding #8's
  //                     nested-template push lives here; the spec's set predated it).
  //   template TEXT:    `` ` `` `$` `\` — the backslash is IN the set (finding #8's \`-escape
  //                     consumes TWO chars, so it must stop a run); the run is blanked
  //                     (keepValues-gated) and never touches lastSig/lastWord, as per-char before.
  //   block comment:    already spanned via indexOf('*/'), unchanged.
  // `keepValues` only switches copy-vs-blank of value spans; it never changes a special set.
  for (const line of lines) {
    const n = line.length; let res = '', i = 0;
    while (i < n) {
      if (inBlock) {
        const end = line.indexOf('*/', i);
        if (end === -1) { res += ' '.repeat(n - i); i = n; }
        else { res += ' '.repeat(end + 2 - i); i = end + 2; inBlock = false; }
        continue;
      }
      const top = tpl.length ? tpl[tpl.length - 1] : null;
      if (top && top.depth === 0) {                  // template TEXT — blank it, watch for `${` / \-escape / closing backtick
        let j = i;
        while (j < n) { const c = line.charCodeAt(j); if (c === 96 || c === 92 || c === 36) break; j++; }
        if (j > i) { res += keepValues ? line.slice(i, j) : ' '.repeat(j - i); i = j; continue; } // text run: no lastSig/lastWord update
        const ch = line[i];
        if (ch === '`') { res += keepValues ? '`' : ' '; i++; tpl.pop(); noteValue(); continue; } // close: pop to the outer frame's expr (or normal code)
        if (ch === '\\') {                            // \` and \$ are TEXT (2 chars; 1 at EOL), keepValues-gated like other text
          const stop = Math.min(i + 2, n);
          res += keepValues ? line.slice(i, stop) : ' '.repeat(stop - i); i = stop; continue;
        }
        if (line[i + 1] === '{') { res += '${'; i += 2; top.depth = 1; lastSig = '{'; lastWord = ''; continue; } // ch === '$': keep expr
        res += keepValues ? '$' : ' '; i++; continue; // lone $ is template text
      }
      if (top) {                                      // top.depth > 0: inside ${ ... } — keep code verbatim, match braces.
        let j = i;
        while (j < n) { const c = line.charCodeAt(j); if (c === 34 || c === 39 || c === 47 || c === 96 || c === 123 || c === 125) break; j++; }
        if (j > i) { res += line.slice(i, j); noteRun(line, i, j); i = j; continue; } // plain-code run
        // Check order matters: string -> regex -> backtick-push -> braces. If backtick-push
        // preceded the regex check, `${s.split(/`/)}` would push a phantom frame.
        const ch = line[i];
        if (ch === '"' || ch === "'") {               // string literal: whole quoted slice through value()
          let k = i + 1; while (k < n && line[k] !== ch) { if (line[k] === '\\') k++; k++; }
          const stop = Math.min(k + 1, n); res += value(line.slice(i, stop)); i = stop; noteValue(); continue;
        }
        if (ch === '/' && regexCanFollow()) {         // regex literal in the interpolation — blank it so a
          const m = scanRegex(line, i);               // quote or {n} quantifier can't desync brace matching
          if (m) { res += '/' + value(line.slice(i + 1, m.close)) + '/' + value(line.slice(m.close + 1, m.end)); i = m.end; noteValue(); continue; }
        }
        if (ch === '`') { res += keepValues ? '`' : ' '; i++; tpl.push({ depth: 0 }); continue; } // nested template opens: push a frame
        if (ch === '{') top.depth++;
        else if (ch === '}') { top.depth--; if (top.depth === 0) { res += ch; i++; note(ch); continue; } } // back to this frame's TEXT
        note(ch); res += ch; i++; continue;
      }
      // normal code: span-copy the run to the next special char, then branch on it
      let j = i;
      while (j < n) { const c = line.charCodeAt(j); if (c === 47 || c === 34 || c === 39 || c === 96 || (c === 35 && hashComment)) break; j++; }
      if (j > i) { res += line.slice(i, j); noteRun(line, i, j); i = j; continue; }
      const ch = line[i];
      if (ch === '/' && line[i + 1] === '/') { res += ' '.repeat(n - i); i = n; continue; } // line comment
      if (hashComment && ch === '#') { res += ' '.repeat(n - i); i = n; continue; }         // PHP `#` comment (finding #13)
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
        let k = i + 1; while (k < n && line[k] !== ch) { if (line[k] === '\\') k++; k++; }
        const stop = Math.min(k + 1, n); res += value(line.slice(i, stop)); i = stop; noteValue(); continue;
      }
      if (ch === '`') { res += keepValues ? '`' : ' '; i++; tpl.push({ depth: 0 }); continue; } // open template literal (push a frame)
      note(ch); res += ch; i++;                                                               // division `/` falls through here
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
  if (r.endsWith('.php')) return maskJs(text, { ...opts, hashComment: true }); // PHP `#` comments (finding #13)
  if (/\.(jsx?|mjs|cjs|tsx?|mts|cts|java|cs|kt|kts|swift)$/.test(r)) return maskJs(text, opts); // finding #11 (review): .mts/.cts are TS files here too
  return null;
}
