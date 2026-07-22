// Round 2, finding #8 — maskJs had no NESTED-template state: two scalars (inTemplate, exprDepth)
// cannot represent a template inside a `${}` expression. Consequences reproduced here:
//   n1 — nested-template TEXT stayed live, fabricating a docs -> fabricateMe call edge.
//   n2 — a `}` inside nested template text closed the outer interpolation and INVERTED template
//        state (the rest of the file lexed wrong; the later -> helper edge was lost).
//   n3 — an escaped \` in template text flipped state the same way (no `\` handling in TEXT).
//   n4 — `${}`-interior string literals were kept verbatim even in blank-values mode, so string
//        CONTENT fabricated a host -> phantom call edge.
//   n5 — pins the fix's design constraints (green pre-fix, must stay green): two-deep nesting keeps
//        the MIDDLE frame's expr live (outer -> inner), and the expr check order string -> regex ->
//        backtick-push means a backtick inside a regex inside `${}` pushes no phantom frame
//        (tick -> inner).
// The fix: a stack of {depth} frames — one per open template literal; nested backticks push, text
// backtick pops, `${` sets depth 1, expr strings route through value(). The edge scan is shared by
// both tiers, so each fixture is asserted under the default engine AND CODEWEB_ENGINE=regex.
//
// --no-ctags forces the deterministic regex scanner (the path that does the masking).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runNode, tmpDir, cleanup, writeTree, readJSON, script, hasEdge } from './helpers.mjs';

const FILES = {
  'n1.mjs':
    'export function fabricateMe(n) { return n; }\n' +
    'export function docs(xs) {\n' +
    "  return `Usage: ${xs.map((n) => `fabricateMe(${n})`).join('; ')}`;\n" +
    '}\n' +
    'export function realUser(x) { return fabricateMe(x); }\n',
  'n2.mjs':
    'export function helper() { return 1; }\n' +
    'export function fmt(cond, alt) {\n' +
    '  return `v: ${cond ? `has } brace` : alt} tail`;\n' +
    '}\n' +
    'export function later() { return helper(); }\n',
  'n3.mjs':
    'export function helper() { return 1; }\n' +
    'const T = `an escaped \\` backtick`;\n' +
    'export function afterEsc() { return helper(); }\n',
  'n4.mjs':
    'export function phantom(n) { return n; }\n' +
    "export function host() { return `${'phantom(1)'} ok`; }\n",
  'n5.mjs':
    'export function inner() { return 1; }\n' +
    'export function outer(a, b) {\n' +
    "  return `L1 ${a ? `L2 ${b ? `L3` : inner()} T2` : ''} T1`;\n" +
    '}\n' +
    'export function tick(s) { return `${s.split(/`/).length} ${inner()}`; }\n',
};

let SRC;
before(() => { SRC = tmpDir('codeweb-nesttpl-'); writeTree(SRC, FILES); });
after(() => cleanup(SRC));

const frags = new Map();
function extract(engine) {
  if (frags.has(engine)) return frags.get(engine);
  const out = join(SRC, `fragment-${engine}.json`);
  const res = runNode(script('extract-symbols.mjs'), [SRC, '--target', 'nesttpl-x', '--no-ctags', '--out', out],
    { env: { CODEWEB_ENGINE: engine } });
  assert.equal(res.status, 0, `extractor (${engine}) exited non-zero:\n${res.stderr}`);
  const f = readJSON(out);
  frags.set(engine, f);
  return f;
}
// Default tier = tree-sitter when installed; forcing the env var keeps the A-leg honest either way.
const ENGINES = [['tree-sitter', 'default/ast tier'], ['regex', 'regex tier']];

for (const [engine, label] of ENGINES) {
  test(`n1 (${label}): nested-template text is prose — no docs -> fabricateMe; real caller survives`, () => {
    const f = extract(engine);
    assert.ok(!hasEdge(f.edges, 'n1.mjs:docs', 'n1.mjs:fabricateMe'),
      '`fabricateMe(${n})` inside a nested template is TEXT, not a call');
    assert.ok(hasEdge(f.edges, 'n1.mjs:realUser', 'n1.mjs:fabricateMe'), 'realUser -> fabricateMe survives');
  });

  test(`n2 (${label}): a \`}\` in nested template text does not invert state`, () => {
    const f = extract(engine);
    assert.ok(hasEdge(f.edges, 'n2.mjs:later', 'n2.mjs:helper'),
      'later -> helper survives (pre-fix the inverted state corrupted the rest of the file)');
    const fmt = f.nodes.find((n) => n.id === 'n2.mjs:fmt');
    assert.ok(fmt, 'fmt node exists');
    assert.ok(fmt.loc <= 3, `fmt extent must stay tight (masked \${} braces balance): loc=${fmt.loc}`);
  });

  test(`n3 (${label}): escaped \\\` in template text stays text`, () => {
    const f = extract(engine);
    assert.ok(hasEdge(f.edges, 'n3.mjs:afterEsc', 'n3.mjs:helper'),
      'afterEsc -> helper survives (pre-fix the \\` flipped template state and blanked the rest)');
  });

  test(`n4 (${label}): string content inside \${} fabricates nothing`, () => {
    const f = extract(engine);
    assert.ok(!hasEdge(f.edges, 'n4.mjs:host', 'n4.mjs:phantom'),
      "`${'phantom(1)'}` is a string VALUE — blank-values mode must blank it");
  });

  test(`n5 (${label}): two-deep nesting keeps the middle expr live; regex beats backtick-push`, () => {
    const f = extract(engine);
    assert.ok(hasEdge(f.edges, 'n5.mjs:outer', 'n5.mjs:inner'),
      'inner() in the middle frame expr stays live code');
    assert.ok(hasEdge(f.edges, 'n5.mjs:tick', 'n5.mjs:inner'),
      'a backtick inside /`/ inside ${} pushes no phantom frame — inner() after it stays live');
  });
}
