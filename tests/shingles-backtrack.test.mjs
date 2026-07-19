// The tokenize() string-literal matcher must be LINEAR on adversarial input. The previous
// pattern `(['"`])(?:\\.|(?!\1).)*\1` let the regex engine re-partition backslash/char runs and
// went exponential on unterminated-quote content — a lone apostrophe in a large real-world body
// (TypeScript's testRunner fixtures) hung the entire overlap stage at 100% CPU. Found by the
// Spec B scale test; the fix consumes each char exactly one way (escape pair XOR non-backslash).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, shingles, jaccard } from '../scripts/lib/shingles.mjs';

test('unterminated quotes tokenize in linear time, not exponential', () => {
  const evil = "const x = 1;\nit's prose with no closing quote " + 'alpha beta gamma '.repeat(5000);
  const t0 = performance.now();
  const toks = tokenize(evil);
  const ms = performance.now() - t0;
  assert.ok(toks.length > 10000, 'the tail still tokenizes');
  assert.ok(ms < 2000, `linear-time: took ${Math.round(ms)}ms`);
});

test('string collapsing semantics are unchanged', () => {
  assert.deepEqual(tokenize('const s = "hello world"; call(s);'), ['s', '=', 'str', ';', 'call', '(', 's', ')', ';']);
  assert.deepEqual(tokenize("const t = 'a\\'b';"), ['t', '=', 'str', ';'], 'escaped quotes stay inside the literal');
  assert.deepEqual(tokenize('const u = `tpl ${x}`;').slice(0, 3), ['u', '=', 'str'], 'templates collapse');
  const a = shingles('function f() { return g(1) + h(2); }');
  const b = shingles('function f() { return g(1) + h(2); }');
  assert.equal(jaccard(a, b), 1, 'identical bodies still score 1');
});
