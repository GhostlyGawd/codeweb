// codeweb shared token-shingling primitives — lifted verbatim out of overlap.mjs so the
// body-similarity logic lives ONCE (dogfooding the anti-duplication mission). Used by overlap.mjs
// (duplicate confirmation) and find-similar.mjs (reuse-at-write-time). Pure, no I/O.
//
// NOTE: this KW stop-list is overlap.mjs's, and is DELIBERATELY DIFFERENT from the extractor's
// KEYWORDS set (extract-symbols.mjs) — the extractor's includes call-site noise like `print`/`super`
// for edge filtering; this one is tuned for body-shingle similarity. Do not unify the two.

export const KW = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'typeof', 'await', 'new', 'const', 'let', 'var', 'async', 'else', 'try', 'finally', 'class', 'case', 'of', 'in', 'throw']);

// Tokenize source: strip line/block comments and string/template literals (→ ` STR `), lowercase,
// then keep identifiers and a fixed set of structural operators, dropping keywords.
export const tokenize = (src) => src
  .replace(/\/\/[^\n]*/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  // Linear-time string matcher: each char is consumed exactly one way (an escape pair XOR a
  // non-backslash non-quote), so there is no backtracking ambiguity. The previous
  // `(?:\\.|(?!\1).)*` let the engine re-partition backslash runs and went EXPONENTIAL on
  // unterminated-quote content — a lone apostrophe in a big real-world body hung the whole
  // overlap stage (found by the TypeScript-src scale test).
  .replace(/(['"`])(?:\\[\s\S]|(?!\1)[^\\])*\1/g, ' STR ')
  .toLowerCase()
  .match(/[a-z_$][\w$]*|[{}();=><!+\-*/%]/g)?.filter((t) => !KW.has(t)) || [];

// THE shingle size and confidence bands (finding 27). Four files hardcoded 0.6 (and the
// 0.35/0.15 bands) with "must match overlap.mjs" comments — each copy documented the coupling
// in prose instead of importing it. Consumers: overlap.mjs (confidence tiers), optimize.mjs
// (READY floor), find-similar.mjs (tiers + low-band cutoff), lib/dup-check.mjs (HIGH gate),
// lib/similar-index.mjs + lib/skeleton.mjs (K).
export const K = 3;
export const BANDS = { high: 0.6, medium: 0.35, low: 0.15 }; // body-similarity mean: >=high confirmed · >=medium DRIFTED · >=low weak · below refuted

// K-gram shingle set of the tokenized source (default: THE K above).
export const shingles = (src, k = K) => {
  const t = tokenize(src);
  const s = new Set();
  for (let i = 0; i + k <= t.length; i++) s.add(t.slice(i, i + k).join(' '));
  return s;
};

// Jaccard similarity of two shingle sets. Empty either side → 0.
export const jaccard = (a, b) => {
  if (!a.size || !b.size) return 0;
  let i = 0;
  for (const x of a) if (b.has(x)) i++;
  return i / (a.size + b.size - i);
};
