// codeweb structural-skeleton primitives (F6) — normalize a function body to a token stream where
// every IDENTIFIER collapses to a single `ID` placeholder, every number to `NUM`, every string to
// `STR`, while KEYWORDS and OPERATORS are preserved verbatim. Two functions that are the same up to
// variable renaming therefore have identical skeletons (Type-2 clones) — which the lexical shingler
// (lib/shingles.mjs, which KEEPS identifiers) cannot see. Pure, deterministic, zero-dependency.
//
// Intent locks (tests): rename-invariance (single placeholder, not positional ID0/ID1), literal
// normalization, but operator + keyword SENSITIVITY (`+`≠`*`, `&&`≠`||`, `if`≠`while`) so it does not
// over-collapse and call genuinely different logic a clone. Reuses jaccard from lib/shingles.mjs.

const JS_KW = new Set(['if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'return', 'function', 'class', 'new', 'typeof', 'instanceof', 'const', 'let', 'var', 'of', 'in', 'try', 'catch', 'finally', 'throw', 'await', 'async', 'yield', 'extends', 'super', 'this', 'null', 'true', 'false', 'void', 'delete', 'import', 'export', 'from', 'static', 'get', 'set']);
const PY_KW = new Set(['if', 'elif', 'else', 'for', 'while', 'def', 'class', 'return', 'try', 'except', 'finally', 'raise', 'with', 'as', 'import', 'from', 'and', 'or', 'not', 'in', 'is', 'lambda', 'pass', 'yield', 'await', 'async', 'None', 'True', 'False', 'global', 'nonlocal', 'del', 'assert']);

// One pass, priority-ordered: string/template literals, numbers, identifiers, multi-char operators,
// then single chars. Comments are stripped first so their contents don't tokenize.
const TOKEN_RE = /`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\d+\.?\d*|[A-Za-z_$][\w$]*|===|!==|>>>|<<=|>>=|\*\*|\.\.\.|&&|\|\||\?\?|\?\.|=>|==|!=|<=|>=|\+\+|--|\+=|-=|\*=|\/=|&&|[-+*/%=<>!&|^~?:;,.(){}\[\]]/g;

export function skeletonTokens(src, lang = 'js') {
  const kw = lang === 'py' ? PY_KW : JS_KW;
  const stripped = lang === 'py'
    ? (src || '').replace(/#[^\n]*/g, ' ')
    : (src || '').replace(/\/\/[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const out = [];
  for (const tok of stripped.match(TOKEN_RE) || []) {
    const c = tok[0];
    if (c === '`' || c === '"' || c === "'") out.push('STR');
    else if (c >= '0' && c <= '9') out.push('NUM');
    else if (/[A-Za-z_$]/.test(c)) out.push(kw.has(tok) ? tok : 'ID');
    else out.push(tok);
  }
  return out;
}

export const skeleton = (src, lang = 'js') => skeletonTokens(src, lang).join(' ');

export const structuralShingles = (src, k = 3, lang = 'js') => {
  const t = skeletonTokens(src, lang);
  const set = new Set();
  for (let i = 0; i + k <= t.length; i++) set.add(t.slice(i, i + k).join(' '));
  return set;
};
