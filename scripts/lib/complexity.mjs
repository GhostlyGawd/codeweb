// codeweb complexity primitives (F4) — approximate cyclomatic complexity + max nesting depth of a
// function body, computed from source text with NO parser (deterministic, zero-dependency, matches the
// regex-engine ethos). Shared by the extractor (node fields) and any consumer. Pure.
//
// Cyclomatic = 1 + decision points. Decision points are control-flow keywords + short-circuit/branch
// operators, counted on source with comments and string/template literals stripped (so a keyword
// inside a string never counts — the property CX-IGNORES-STRINGS-COMMENTS). Identifiers are never
// counted, so renaming can't change the number (CX-RENAME-INVARIANT). The exact per-language token set
// is documented below; it is an APPROXIMATION (no AST), good enough as a ranking signal for hotspots.

import { indentOf } from './lang-rules.mjs';

// Strip line/block comments and string/template literals to ` `, so tokens inside them don't count.
// Order: comments first, then strings (a `"` inside a `// comment` is already gone).
const strip = (src, lang) => {
  let s = src;
  if (lang === 'py') {
    s = s.replace(/'''[\s\S]*?'''/g, ' ').replace(/"""[\s\S]*?"""/g, ' ').replace(/#[^\n]*/g, ' ');
  } else {
    s = s.replace(/\/\/[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
  }
  // template literals (whole, incl. ${…}) then double/single quoted strings
  s = s.replace(/`(?:\\.|[^`\\])*`/g, ' ').replace(/"(?:\\.|[^"\\])*"/g, ' ').replace(/'(?:\\.|[^'\\])*'/g, ' ');
  return s;
};
const count = (s, re) => (s.match(re) || []).length;

// Approximate cyclomatic complexity. lang: 'py' uses Python decision tokens; everything else (js/ts/
// go/rust) uses the C-family set. Always >= 1.
export function cyclomatic(src, lang = 'js') {
  const s = strip(src || '', lang);
  let decisions;
  if (lang === 'py') {
    // if / elif / for / while / except  +  boolean `and` / `or`  (else/try are not decisions)
    decisions = count(s, /\b(?:if|elif|for|while|except)\b/g) + count(s, /\b(?:and|or)\b/g);
  } else {
    // if / for / while / case / catch  +  &&  ||  ??  +  ternary ? (not part of ?? or ?.)
    const kw = count(s, /\b(?:if|for|while|case|catch)\b/g);
    const and = count(s, /&&/g), or = count(s, /\|\|/g), nullish = count(s, /\?\?/g);
    const ternary = count(s.replace(/\?\?/g, ' ').replace(/\?\./g, ' '), /\?/g);
    decisions = kw + and + or + nullish + ternary;
  }
  return 1 + decisions;
}

// Max nesting depth. Brace languages: deepest `{}` nesting (strings/comments stripped). Python:
// deepest indentation level below the first line. Always >= 0.
export function nestingDepth(src, lang = 'js') {
  if (lang === 'py') {
    const lines = (src || '').split(/\r?\n/).filter((l) => l.trim() !== '');
    if (!lines.length) return 0;
    // one truth with bodyEnd's dedent measurement (lib/lang-rules.mjs)
    const stack = [indentOf(lines[0])];
    let max = 0;
    for (const l of lines.slice(1)) {
      const ind = indentOf(l);
      while (stack.length > 1 && ind <= stack[stack.length - 1]) stack.pop();
      if (ind > stack[stack.length - 1]) stack.push(ind);
      max = Math.max(max, stack.length - 1);
    }
    return max;
  }
  const s = strip(src || '', lang);
  let depth = 0, max = 0;
  for (const ch of s) {
    if (ch === '{') { depth++; if (depth > max) max = depth; }
    else if (ch === '}') { if (depth > 0) depth--; }
  }
  return max;
}
