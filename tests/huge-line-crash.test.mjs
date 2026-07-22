// Round 2, finding #15 — one >=8.4 MB single-line string crashed the entire extract, both tiers.
// The string regexes in complexity.mjs's strip(), maskRuby's RB_DQ/RB_SQ, and ts-engine's stmtHash
// used the alternation form /"(?:\\.|[^"\\])*"/ which V8 recurses per character — binary-searched
// first crash at length 8,388,574 (RangeError: Maximum call stack size exceeded). A generated file
// with a big inlined string (base64 asset, dataset) killed the whole map, post-edit hook, and MCP
// refresh. Fixes under test:
//   T-15.1 — each site's regex is rewritten in the unrolled-loop form, PRESERVING the site's escape
//            atom: complexity's trio uses `\\.` ("[^"\\]*(?:\\.[^"\\]*)*"), RB_DQ/RB_SQ and
//            ts-engine's trio use `\\[^]` ("[^"\\]*(?:\\[^][^"\\]*)*"). The atoms are NOT
//            interchangeable — on `a\<newline>b` inside a template the `\\[^]` form strips it and
//            `\\.` leaves it; the seeded equivalence property below (with \n in the alphabet) pins
//            each site to its own atom so the swap can't happen silently.
//   T-15.2 — cyclomatic/nestingDepth are belted: any internal throw degrades to 1/0 instead of
//            killing the run. Degradation chain: ts-engine's extractJsTs already returns null on
//            any internal throw (per-file fallback to regex), whose cyclomatic/nestingDepth are now
//            belted — so no single file can kill an extract, in either tier.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { cyclomatic, nestingDepth } from '../scripts/lib/complexity.mjs';
import { maskRuby } from '../scripts/lib/masking.mjs';
import { runNode, tmpDir, cleanup, writeTree, readJSON, script, hasEdge } from './helpers.mjs';
import { prng, int, pick } from './_proptest.mjs';

// ---- T-15.1 (a): in-process crash repros — RangeError before the fix, plain returns after ----

test('HL-CX: cyclomatic on a 9,000,000-char string literal returns 1 (no RangeError)', () => {
  const src = 'const s = "' + 'a'.repeat(9_000_000) + '";';
  assert.equal(cyclomatic(src, 'js'), 1);
  assert.equal(nestingDepth(src, 'js'), 0);
});

test('HL-RB: maskRuby on a 9,000,000-char double-quoted string returns (no RangeError)', () => {
  const masked = maskRuby('x = "' + 'a'.repeat(9_000_000) + '"');
  assert.equal(typeof masked, 'string');
  assert.ok(masked.startsWith('x = '), 'code before the string survives');
});

test('HL-RB-ESC: maskRuby survives the escape-heavy adversarial shape (2M escaped quotes)', () => {
  // maskRuby has no degradation belt (T-15.2 covers only complexity), so the unrolled form must be
  // proven on the shape that maximizes the escape atom's iteration count, not just the plain run.
  const masked = maskRuby('x = "' + '\\"'.repeat(2_000_000) + '"');
  assert.equal(typeof masked, 'string');
  assert.ok(masked.startsWith('x = '), 'code before the string survives');
});

// ---- T-15.1 (b): per-site equivalence property — old regex (inlined here) vs the shipped new one.
// 5,000 seeded-random strings, length <= 24, alphabet " ' ` \ a { \n / — the \n member is what
// makes the two escape atoms distinguishable, pinning each site to its own.

const ALPHABET = ['"', "'", '`', '\\', 'a', '{', '\n', '/'];
const randStr = (rng) => {
  const len = int(rng, 0, 24);
  let s = '';
  for (let i = 0; i < len; i++) s += pick(rng, ALPHABET);
  return s;
};

// Per site: [name, sourceFile, old regex, new regex (must byte-match the shipped source), replacement]
const SITES = [
  // complexity.mjs strip() trio — escape atom `\\.`
  ['complexity template', 'lib/complexity.mjs', /`(?:\\.|[^`\\])*`/g, /`[^`\\]*(?:\\.[^`\\]*)*`/g, ' '],
  ['complexity double', 'lib/complexity.mjs', /"(?:\\.|[^"\\])*"/g, /"[^"\\]*(?:\\.[^"\\]*)*"/g, ' '],
  ['complexity single', 'lib/complexity.mjs', /'(?:\\.|[^'\\])*'/g, /'[^'\\]*(?:\\.[^'\\]*)*'/g, ' '],
  // masking.mjs RB_DQ / RB_SQ — escape atom `\\[^]`
  ['maskRuby RB_DQ', 'lib/masking.mjs', /"(?:[^"\\]|\\[^])*"/g, /"[^"\\]*(?:\\[^][^"\\]*)*"/g, '""'],
  ['maskRuby RB_SQ', 'lib/masking.mjs', /'(?:[^'\\]|\\[^])*'/g, /'[^'\\]*(?:\\[^][^'\\]*)*'/g, "''"],
  // ts-engine.mjs stmtHash trio — escape atom `\\[^]`
  ['stmtHash TPL_STR_RE', 'lib/ts-engine.mjs', /`(?:[^`\\]|\\[^])*`/g, /`[^`\\]*(?:\\[^][^`\\]*)*`/g, 'S'],
  ['stmtHash SQ_STR_RE', 'lib/ts-engine.mjs', /'(?:[^'\\]|\\[^])*'/g, /'[^'\\]*(?:\\[^][^'\\]*)*'/g, 'S'],
  ['stmtHash DQ_STR_RE', 'lib/ts-engine.mjs', /"(?:[^"\\]|\\[^])*"/g, /"[^"\\]*(?:\\[^][^"\\]*)*"/g, 'S'],
];

test('HL-EQ: old and unrolled regexes replace identically over 5,000 seeded strings, per site', () => {
  const rng = prng(15);
  const cases = Array.from({ length: 5000 }, () => randStr(rng));
  for (const [name, , oldRe, newRe, repl] of SITES) {
    for (const s of cases) {
      assert.equal(s.replace(newRe, repl), s.replace(oldRe, repl),
        `${name}: divergence on ${JSON.stringify(s)}`);
    }
  }
});

test('HL-SHIPPED: the shipped sources contain exactly the unrolled regexes the property tested', () => {
  // The new regexes above are inlined for the property; this pins them to the real files so the
  // tested pattern and the shipped pattern can never drift apart.
  for (const [name, file, , newRe] of SITES) {
    const src = readFileSync(script(file), 'utf8');
    assert.ok(src.includes(newRe.source), `${name}: ${file} must contain /${newRe.source}/`);
  }
});

// ---- T-15.2: degradation belt — cyclomatic/nestingDepth degrade to exactly 1/0 on any throw ----

test('HL-BELT: an internal throw degrades cyclomatic to 1 and nestingDepth to 0', () => {
  // Mock throw (the spec's belt check): a String object whose replace/split throws exercises the
  // catch even now that T-15.1 removed the organic RangeError.
  const evil = new String('if (a) { b(); }');
  evil.replace = () => { throw new Error('synthetic strip failure'); };
  evil.split = () => { throw new Error('synthetic split failure'); };
  assert.equal(cyclomatic(evil, 'js'), 1, 'belt degrades cyclomatic to exactly 1');
  assert.equal(nestingDepth(evil, 'js'), 0, 'belt degrades nestingDepth to exactly 0');
  assert.equal(nestingDepth(evil, 'py'), 0, 'python path is belted too');
});

// ---- T-15.2: end-to-end — the fixture that killed BOTH tiers now extracts in both ----
// The blob sits INSIDE a function body (a module-level const matches no symbol rule, so nothing
// ever ran a catastrophic regex over it — that shape was never red). Verified on the pre-fix tree:
// exit 1 with RangeError in BOTH CODEWEB_ENGINE=regex (cyclomatic/nestingDepth on payload's body)
// and the default engine (stmtHash on the return statement + nestingDepth at the node fields).

let DIR;
before(() => {
  DIR = tmpDir('codeweb-hugeline-');
  writeTree(DIR, {
    'src/generated/data.js':
      'export function payload() { return "' + 'a'.repeat(9_000_000) + '"; }\n' +
      'export function tail() { return payload().length; }\n',
  });
});
after(() => cleanup(DIR));

for (const [label, env] of [['default engine', {}], ['regex engine', { CODEWEB_ENGINE: 'regex' }]]) {
  test(`HL-E2E (${label}): 9MB single-line string no longer kills the extract`, () => {
    const out = join(DIR, `frag-${label.replace(/\W+/g, '-')}.json`);
    const res = runNode(script('extract-symbols.mjs'), [DIR, '--target', 'hugeline', '--no-ctags', '--out', out], { env });
    assert.equal(res.status, 0, `extractor must survive the blob:\n${res.stderr}`);
    const f = readJSON(out);
    const payload = f.nodes.find((n) => n.id === 'src/generated/data.js:payload');
    const tail = f.nodes.find((n) => n.id === 'src/generated/data.js:tail');
    assert.ok(payload, 'payload node exists');
    assert.ok(tail, 'tail node exists');
    assert.equal(typeof payload.complexity, 'number', 'payload.complexity is numeric');
    assert.equal(typeof payload.maxDepth, 'number', 'payload.maxDepth is numeric');
    assert.equal(typeof tail.complexity, 'number', 'tail.complexity is numeric');
    assert.ok(hasEdge(f.edges, 'src/generated/data.js:tail', 'src/generated/data.js:payload'),
      'tail -> payload call edge survives');
  });
}
