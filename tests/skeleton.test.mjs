// F6 — properties + units for lib/skeleton.mjs (structural / Type-2 clone normalization), written
// BEFORE the implementation (RED until the lib exists).
//
// The headline intent lock is SKL-RENAME-INVARIANT: a structural skeleton must be IDENTICAL under a
// consistent identifier rename, so two functions that are the same up to variable names have
// skeleton-Jaccard 1 — that is exactly what makes this a Type-2 clone detector and what the lexical
// shingler (lib/shingles.mjs, which keeps identifiers) cannot see. SKL-STRUCTURE-SENSITIVE keeps it
// honest: it must NOT collapse everything to 1 — changing control flow must change the skeleton.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skeleton, structuralShingles } from '../scripts/lib/skeleton.mjs';
import { jaccard } from '../scripts/lib/shingles.mjs';
import { prng, int, pick } from './_proptest.mjs';

const sim = (a, b) => jaccard(structuralShingles(a), structuralShingles(b));

// A random control-flow-bearing JS body (enough tokens that K=3 shingles are non-trivial).
function randomBody(rng) {
  const id = () => pick(rng, ['a', 'b', 'c', 'user', 'total', 'item', 'res']) + int(rng, 0, 5);
  const lines = [];
  const n = int(rng, 3, 8);
  for (let i = 0; i < n; i++) {
    const k = pick(rng, ['assign', 'if', 'for', 'call', 'ret']);
    if (k === 'assign') lines.push(`const ${id()} = ${id()} + ${int(rng, 0, 9)};`);
    else if (k === 'if') lines.push(`if (${id()} > ${int(rng, 0, 9)}) { ${id()}(${id()}); }`);
    else if (k === 'for') lines.push(`for (let i = 0; i < ${id()}; i++) { ${id()}(); }`);
    else if (k === 'call') lines.push(`${id()}(${id()}, ${id()});`);
    else lines.push(`return ${id()};`);
  }
  return lines.join('\n');
}
// Consistent rename: every identifier -> a fresh, COLLISION-FREE name (uses map.size, not random, so
// two distinct identifiers can never map to the same token — a random suffix would flake ~1/9000/pair).
// Keywords are preserved so the skeleton's control flow is unchanged.
const KW = /^(if|else|for|while|do|switch|case|catch|return|const|let|var|function|class|new|typeof|of|in|try|finally|break|continue|default|throw|await|async|yield)$/;
const renameConsistent = (src) => {
  const map = new Map();
  return src.replace(/[A-Za-z_$][\w$]*/g, (w) => {
    if (KW.test(w)) return w;
    if (!map.has(w)) map.set(w, 'ren' + map.size);
    return map.get(w);
  });
};

test('SKL-RENAME-INVARIANT: a consistent identifier rename yields an identical skeleton (sim 1)', () => {
  const rng = prng(101);
  for (let i = 0; i < 300; i++) {
    const src = randomBody(rng);
    const renamed = renameConsistent(src);
    assert.notEqual(renamed, src, `case ${i}: the rename actually changed identifiers (else the test is vacuous)`);
    assert.equal(skeleton(renamed, 'js'), skeleton(src, 'js'), `skeleton differs under rename, case ${i}`);
    assert.equal(sim(src, renamed), 1, `Type-2 clone must have structural similarity 1, case ${i}`);
  }
});

test('SKL-LITERAL-NORMALIZED: changing only literal values leaves the skeleton equal', () => {
  const a = 'const x = 42; const s = "hello"; return x + 1;';
  const b = 'const x = 99; const s = "world"; return x + 7;';
  assert.equal(skeleton(a, 'js'), skeleton(b, 'js'));
  assert.equal(sim(a, b), 1);
});

test('SKL-STRUCTURE-SENSITIVE: changing control flow changes the skeleton (does not saturate to 1)', () => {
  const a = 'function f(x) { if (x) { return g(x); } return 0; }';
  const b = 'function f(x) { while (x) { return g(x); } return 0; }'; // if -> while
  assert.notEqual(skeleton(a, 'js'), skeleton(b, 'js'), 'if vs while must differ');
  assert.ok(sim(a, b) < 1, 'different control flow -> structural sim < 1');
  const c = 'function f(x) { return g(x); }'; // fewer statements
  assert.ok(sim(a, c) < 1);
});

test('SKL-STRUCTURE-SENSITIVE (prop): inserting one extra if-block changes the skeleton (sim < 1)', () => {
  const rng = prng(303);
  for (let i = 0; i < 200; i++) {
    const src = randomBody(rng);
    const mutated = src + `\nif (cond${i}) { extra${i}(); }`; // one new decision/structure
    assert.ok(sim(src, mutated) < 1, `case ${i}: adding control flow must lower structural similarity`);
  }
});

// The realistic over-normalization failure: if the skeleton drops operator identity, sum and product
// look like clones. These must differ.
test('SKL-OPERATOR-SENSITIVE: operator identity survives normalization (+ vs *, && vs ||)', () => {
  assert.notEqual(skeleton('return a + b;', 'js'), skeleton('return a * b;', 'js'), '+ and * must differ');
  assert.ok(sim('const x = a + b + c;', 'const x = a * b * c;') < 1, 'arithmetic operators are not interchangeable');
  assert.notEqual(skeleton('return a && b;', 'js'), skeleton('return a || b;', 'js'), '&& and || must differ');
});

test('SKL-KEYWORDS-PRESERVED: keywords survive normalization (control flow is visible)', () => {
  const s = skeleton('if (a) { for (;;) {} } return x;', 'js');
  assert.match(s, /\bif\b/);
  assert.match(s, /\bfor\b/);
  assert.match(s, /\breturn\b/);
  assert.doesNotMatch(s, /\b(a|x)\b/, 'identifiers are replaced by a placeholder, not kept');
  // single, position-independent placeholder: two different identifier pairs normalize identically
  assert.equal(skeleton('return foo + bar;', 'js'), skeleton('return x + y;', 'js'), 'all identifiers map to ONE placeholder, not positional ID0/ID1');
});

test('SKL-DETERMINISTIC: same source -> same skeleton + shingles', () => {
  const rng = prng(202);
  for (let i = 0; i < 100; i++) {
    const src = randomBody(rng);
    assert.equal(skeleton(src, 'js'), skeleton(src, 'js'));
    assert.deepEqual([...structuralShingles(src)].sort(), [...structuralShingles(src)].sort());
  }
});

test('SKL-DISTINGUISHES-UNRELATED: structurally different bodies are not near-1', () => {
  const a = 'const x = 1; return x;';
  const b = 'for (let i = 0; i < n; i++) { acc += arr[i] * 2; if (acc > cap) break; } return acc;';
  assert.ok(sim(a, b) < 0.5, `unrelated bodies should not look like clones (got ${sim(a, b)})`);
});
