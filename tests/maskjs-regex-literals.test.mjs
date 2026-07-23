// Regression suite for JS/TS REGEX-LITERAL masking (perf-quality review #1). maskJs tracked
// strings/templates/comments but not regex literals, so a quote inside `/"/` desynced its string
// state (bodies ran to EOF, absorbing neighbors and fabricating call edges from the absorbed
// code), and a backtick inside a regex flipped `inTemplate` (prose inside a later template literal
// became "live code" and edged; an odd backtick count blanked the rest of the file — codeweb's own
// lib/complexity.mjs extracted as 5 nodes / 0 edges). maskJs now lexes regex literals with the
// standard prev-significant-token heuristic and blanks their interiors like strings.
//
// --no-ctags forces the deterministic regex scanner (the path that does the masking).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { tmpDir, cleanup, writeTree, script, hasEdge } from './helpers.mjs';
import { runExtract } from '../scripts/extract-symbols.mjs'; // finding #40 (T-40.5): extractor in-process

const FILES = {
  // Reproduced corruption #1: a quote inside a regex literal (the ubiquitous escaping-helper
  // pattern). Pre-fix, the `"` opened a phantom string, the masked line lost its closing `)`,
  // bodyEnd's paren gate never returned to 0, and escapeIt ran to EOF — absorbing after() and the
  // module-level call, fabricating `escapeIt -> helper`.
  'a.mjs':
    'export function helper() { return 1; }\n' +
    'export function escapeIt(s) {\n' +
    '  return s.replace(/"/g, "&quot;");\n' +
    '}\n' +
    'export function after() { return helper(); }\n' +
    'const top = helper();\n',
  // Reproduced corruption #2: a backtick inside a regex literal flipped inTemplate, so the words
  // `calls target()` inside a real template literal below were treated as live code -> phantom edge.
  'b.mjs':
    'export function target() { return 2; }\n' +
    'const SPLIT = /`/;\n' +
    'export function realWork(s) {\n' +
    '  const msg = `calls target() in prose`;\n' +
    '  return s.split(SPLIT).length + msg.length;\n' +
    '}\n' +
    'export function caller() { return target(); }\n',
  // Division must NOT be lexed as a regex opener: after an identifier/number/`)`, `/` divides.
  // A wrong guess here would blank ` b / c` as a regex interior and swallow the use() call.
  'c.mjs':
    'export function use(x) { return x; }\n' +
    'export function half(a, b, c) {\n' +
    '  const ratio = a / b / c; return use(ratio);\n' +
    '}\n' +
    'export function kw(s) {\n' +
    '  return /x/.test(s) ? use(s) : 0;\n' +   // regex IS legal right after `return`
    '}\n',
  // A regex inside a template-literal ${} interpolation: its {2} quantifier must not corrupt the
  // interpolation's brace matching (pre-fix the stray `{`/`}` desynced exprDepth and the second
  // ${pad(s)} interpolation was blanked as template text -> lost edge).
  'd.mjs':
    'export function pad(s) { return s; }\n' +
    'export function fmt(s) {\n' +
    '  return `${s.replace(/\\d{2}/g, "N")} ${pad(s)}`;\n' +
    '}\n',
};

let SRC, OUT;
before(() => { SRC = tmpDir('codeweb-jsregex-'); writeTree(SRC, FILES); OUT = join(SRC, 'fragment.json'); });
after(() => cleanup(SRC));

let frag = null;
async function extract() {
  if (frag) return frag;
  const { fragment } = await runExtract({ path: SRC, target: 'jsregex-x', ctags: false });
  frag = fragment;
  return frag;
}

test('a quote inside a regex literal does not desync the mask: extent stays tight, no fabricated edge', async () => {
  const f = await extract();
  const escapeIt = f.nodes.find((n) => n.id === 'a.mjs:escapeIt');
  assert.ok(escapeIt, 'escapeIt symbol exists');
  assert.ok(escapeIt.loc <= 3, `escapeIt body must end at its own brace, not EOF (loc=${escapeIt.loc})`);
  assert.ok(!hasEdge(f.edges, 'a.mjs:escapeIt', 'a.mjs:helper'),
    'escapeIt must not absorb after()/module code and steal its helper() calls');
  assert.ok(hasEdge(f.edges, 'a.mjs:after', 'a.mjs:helper'), 'the real after -> helper edge survives');
});

test('a backtick inside a regex literal does not flip template state: prose stays prose', async () => {
  const f = await extract();
  assert.ok(!hasEdge(f.edges, 'b.mjs:realWork', 'b.mjs:target'),
    '`calls target()` inside a template literal is prose, not an edge');
  assert.ok(hasEdge(f.edges, 'b.mjs:caller', 'b.mjs:target'), 'the real caller -> target edge survives');
});

test('division is not lexed as a regex opener; regex after `return` is', async () => {
  const f = await extract();
  assert.ok(hasEdge(f.edges, 'c.mjs:half', 'c.mjs:use'),
    'a / b / c is division — the use(ratio) call after it must survive');
  assert.ok(hasEdge(f.edges, 'c.mjs:kw', 'c.mjs:use'),
    'return /x/.test(s) ? use(s) : 0 — the regex closes and use(s) still edges');
});

test('a {n} quantifier in a regex inside ${} does not corrupt interpolation brace matching', async () => {
  const f = await extract();
  assert.ok(hasEdge(f.edges, 'd.mjs:fmt', 'd.mjs:pad'),
    'the second ${pad(s)} interpolation stays live code');
});

// Self-map regression: lib/complexity.mjs carries quote- and backtick-bearing regex literals in
// its strip() chain. Pre-fix it extracted as 5 nodes / 0 edges (the odd backtick count blanked the
// rest of the file); its helpers were then listed as safe-to-delete dead code. Assert the known
// same-file edges so the masker can never regress on codeweb's own source again.
test('self-map: complexity.mjs yields its known same-file edges', async () => {
  const dir = tmpDir('codeweb-jsregex-self-');
  try {
    writeTree(dir, { 'complexity.mjs': readFileSync(script('lib/complexity.mjs'), 'utf8') });
    const { fragment: f } = await runExtract({ path: dir, target: 'self-cx', ctags: false });
    for (const fn of ['strip', 'count', 'cyclomatic', 'nestingDepth']) {
      assert.ok(f.nodes.some((n) => n.id === `complexity.mjs:${fn}`), `node ${fn} extracted`);
    }
    assert.ok(hasEdge(f.edges, 'complexity.mjs:cyclomatic', 'complexity.mjs:strip'), 'cyclomatic -> strip');
    assert.ok(hasEdge(f.edges, 'complexity.mjs:cyclomatic', 'complexity.mjs:count'), 'cyclomatic -> count');
    assert.ok(hasEdge(f.edges, 'complexity.mjs:nestingDepth', 'complexity.mjs:strip'), 'nestingDepth -> strip');
  } finally { cleanup(dir); }
});
