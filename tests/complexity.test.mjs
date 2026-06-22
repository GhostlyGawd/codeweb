// F4 — properties + units for lib/complexity.mjs (cyclomatic + nesting depth), written BEFORE the
// implementation: the lib does not exist yet, so this suite fails to import until it is built (RED).
//
// The intent locks are CX-RENAME-INVARIANT (complexity measures control flow, not names — so an
// agent can't lower it by renaming) and CX-IGNORES-STRINGS-COMMENTS (decision keywords in strings or
// comments must not count). Without those, a "complexity" number is trivially gameable and useless as
// a hotspot signal. Determinism + monotonicity make it a sound ranking input.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cyclomatic, nestingDepth } from '../scripts/lib/complexity.mjs';
import { prng, int, pick } from './_proptest.mjs';

// A random identifier-heavy JS body with a known number of decision tokens baked in. Returns the
// source plus the exact decision-token count so CX-COUNT can assert 1 + count without re-deriving it.
function randomBody(rng) {
  const idents = ['foo', 'bar', 'baz', 'qux', 'user', 'data', 'res', 'tmp', 'acc', 'node'];
  const id = () => pick(rng, idents) + int(rng, 0, 99);
  const lines = [`const ${id()} = ${id()};`];
  let decisions = 0;
  const n = int(rng, 0, 7);
  for (let i = 0; i < n; i++) {
    const k = pick(rng, ['if', 'for', 'while', 'and', 'or', 'tern', 'nullish', 'switch', 'trycatch', 'plain']);
    if (k === 'if') { lines.push(`if (${id()} > ${int(rng, 0, 9)}) { ${id()}(); }`); decisions++; }
    else if (k === 'for') { lines.push(`for (let i = 0; i < ${int(rng, 1, 9)}; i++) { ${id()}(); }`); decisions++; }
    else if (k === 'while') { lines.push(`while (${id()}) { ${id()}(); }`); decisions++; }
    else if (k === 'and') { lines.push(`const ${id()} = ${id()} && ${id()};`); decisions++; }
    else if (k === 'or') { lines.push(`const ${id()} = ${id()} || ${id()};`); decisions++; }
    else if (k === 'tern') { lines.push(`const ${id()} = ${id()} ? ${id()} : ${id()};`); decisions++; }
    else if (k === 'nullish') { lines.push(`const ${id()} = ${id()} ?? ${id()};`); decisions++; }
    else if (k === 'switch') { const arms = int(rng, 1, 3); const body = Array.from({ length: arms }, (_, j) => `case ${j}: ${id()}(); break;`).join(' '); lines.push(`switch (${id()}) { ${body} }`); decisions += arms; }
    else if (k === 'trycatch') { lines.push(`try { ${id()}(); } catch (e) { ${id()}(); }`); decisions++; }
    else lines.push(`${id()}(${id()});`);
  }
  return { src: lines.join('\n'), decisions };
}

// Consistently rename every identifier-looking token by a fixed reversible scheme, PRESERVING every
// JS control-flow keyword (so cyclomatic must be unchanged). `and`/`or`/`not` are NOT JS keywords and
// are intentionally absent. `??`/ternary `?` have no word chars, so the rename can't touch them.
const KW = /^(if|else|for|while|do|switch|case|default|break|continue|catch|try|finally|return|const|let|var|function|class|new|typeof|instanceof|of|in|throw|await|async|yield)$/;
const renameAll = (src) => src.replace(/[A-Za-z_$][\w$]*/g, (w) => (KW.test(w) ? w : 'z' + w));

test('CX-MIN-ONE: a straight-line body has cyclomatic 1; an empty body has 1', () => {
  assert.equal(cyclomatic('return a + b;', 'js'), 1);
  assert.equal(cyclomatic('const x = f(y); g(x); return x;', 'js'), 1);
  assert.equal(cyclomatic('', 'js'), 1);
  assert.equal(cyclomatic('   \n  \n', 'js'), 1);
});

test('CX-COUNT-JS: cyclomatic === 1 + (if|for|while + && + || + ternary) decision tokens', () => {
  // if(1) for(1) while(1) &&(1) ||(1) ?:(1) = 6 decisions -> 7
  const src = 'if (a) {} for (;;) {} while (b) {} const c = a && b || c ? d : e;';
  assert.equal(cyclomatic(src, 'js'), 7);
  assert.equal(cyclomatic('switch (x) { case 1: break; case 2: break; }', 'js'), 3); // two case arms -> 1+2
  assert.equal(cyclomatic('const x = a ?? b; try { f(); } catch (e) { g(); }', 'js'), 3); // ?? (1) + catch (1) -> 3
});

test('CX-COUNT-PY: python elif / except / and / or count as decisions (lang=py)', () => {
  const src = 'if a:\n    pass\nelif b:\n    pass\ntry:\n    pass\nexcept E:\n    pass\nx = a and b or c';
  // if(1) elif(1) except(1) and(1) or(1) = 5 -> 6
  assert.equal(cyclomatic(src, 'py'), 6);
});

test('CX-COUNT: monotone — appending a snippet with d decisions raises cyclomatic by exactly d', () => {
  const rng = prng(11);
  for (let i = 0; i < 200; i++) {
    const a = randomBody(rng), b = randomBody(rng);
    const base = cyclomatic(a.src, 'js');
    const combined = cyclomatic(a.src + '\n' + b.src, 'js');
    assert.equal(combined, base + b.decisions, `case ${i}: adding ${b.decisions} decisions`);
    assert.ok(combined >= base, 'never decreases');
  }
});

test('CX-RENAME-INVARIANT: renaming identifiers (not keywords) never changes cyclomatic', () => {
  const rng = prng(22);
  for (let i = 0; i < 300; i++) {
    const { src } = randomBody(rng);
    assert.equal(cyclomatic(renameAll(src), 'js'), cyclomatic(src, 'js'), `case ${i}`);
  }
});

test('CX-IGNORES-STRINGS-COMMENTS: decision keywords inside strings/comments are not counted', () => {
  assert.equal(cyclomatic('return "if for while && ||";', 'js'), 1);
  assert.equal(cyclomatic('// if for while\n/* && || ? : */\nreturn 1;', 'js'), 1);
  assert.equal(cyclomatic('const s = `if ${a} for`; return s;', 'js'), 1);
  // a real decision next to a decoy string still counts exactly once
  assert.equal(cyclomatic('if (a) { return "if if if"; }', 'js'), 2);
});

test('CX-DETERMINISTIC: same source -> same cyclomatic', () => {
  const rng = prng(33);
  for (let i = 0; i < 100; i++) { const { src } = randomBody(rng); assert.equal(cyclomatic(src, 'js'), cyclomatic(src, 'js')); }
});

test('CXD-FLAT: nestingDepth — flat body <= 1, one block = 1, nested blocks count', () => {
  assert.equal(nestingDepth('return a + b;', 'js'), 0);
  assert.equal(nestingDepth('if (a) { return 1; }', 'js'), 1);
  assert.equal(nestingDepth('if (a) { if (b) { return 1; } }', 'js'), 2);
  assert.equal(nestingDepth('if (a) { while (b) { for (;;) { x(); } } }', 'js'), 3);
});

test('CXD-NONNEG + brace/string safety: never negative; braces in strings/comments ignored', () => {
  const rng = prng(44);
  for (let i = 0; i < 200; i++) { const { src } = randomBody(rng); assert.ok(nestingDepth(src, 'js') >= 0); }
  assert.equal(nestingDepth('const s = "{ { {"; return s;', 'js'), 0, 'braces inside a string do not nest');
  assert.equal(nestingDepth('// } } }\nreturn 1;', 'js'), 0, 'braces in a comment do not nest');
});

test('CXD-PY: python nesting depth follows indentation', () => {
  const src = 'def f():\n    if a:\n        for x in y:\n            g()';
  // body indentation increases twice below the def line -> depth 2 inside the body
  assert.ok(nestingDepth(src, 'py') >= 2);
});
