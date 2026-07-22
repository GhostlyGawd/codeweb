// Round 2, WS-B shared property test — mask invariants over a fixed corpus (every fixture source
// from docs/specs/round2-ws-b.md + all tracked scripts/lib/*.mjs), in-process.
//
//   P1 (maskJs/maskPy, both modes): per-line masked.length === input.length — column preservation.
//       Lines compare against input.split(/\r?\n/): the masks consume \r at the split, so raw-byte
//       comparison would be wrong on CRLF input.
//   P2 (maskJs/maskPy, default mode): mask(mask(t)) === mask(t) — idempotence. This is a
//       CORPUS-SCOPED property, not universal: the known counterexample class is value-then-division
//       (`"a" / b / c` — mask1 blanks the string; the re-mask has lost the noteValue() context and
//       lexes `/ b /` as a regex literal). A future fuzzer hitting that class must WIDEN this corpus
//       note, not weaken the mask. Pre-#8, maskJs was NOT idempotent when a `${}` held a string
//       (the kept string content re-masked to blanks); the frame-stack fix routes expr strings
//       through value(), making this hold. maskPy idempotence additionally requires #14's
//       expr-string blanking (f-string `{…}` code is kept, but a quoted run inside it blanks with
//       its delimiters) — the property must stay green when #14 lands.
//   P3 (maskRuby): idempotence + line-COUNT preservation only (documented non-column-preserving).
//
// The huge-line fixture (#15) participates at 1,000,000 chars instead of the crash-repro 9,000,000:
// the mask-semantics properties are size-independent above the "one huge line" class, and the full
// 9M crash coverage lives in tests/huge-line-crash.test.mjs where it is the point.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { maskJs, maskPy, maskRuby, maskAligned } from '../scripts/lib/masking.mjs';
import { SCRIPTS } from './helpers.mjs';

// ---- corpus: the spec's fixture sources (inline, frozen by the spec) ------------------------
const FIXTURES = {
  // #8 n1–n5
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
  // #9 sp.mjs
  'sp.mjs':
    'export function metrics(g) { return { n: 1 }; }\n' +
    'export function report(ws) { return { label: 1, ...metrics(ws) }; }\n',
  // #12 w.ts
  'w.ts':
    'export function normalize(v: number): number { return v | 0; }\n' +
    'export class Widget {\n' +
    '  private v = 0;\n' +
    '  get value(): number { return this.v; }\n' +
    '  set value(v: number) { this.v = normalize(v); }\n' +
    '  compute(n: number): number;\n' +
    '  compute(n: string): number;\n' +
    '  compute(n: any): number { return normalize(n); }\n' +
    '  render(x = 1) { return this.value + x; }\n' +
    '  move({ x, y }) { return normalize(x + y); }\n' +
    '}\n',
  // #13 db.rb + x.php
  'db.rb':
    'def helper(x)\n' +
    '  x\n' +
    'end\n' +
    'SQL = <<~SQL\n' +
    '  SELECT helper(1) FROM t\n' +
    '  def phantom_method\n' +
    'SQL\n' +
    'def real_caller\n' +
    '  helper(2)\n' +
    'end\n',
  'x.php':
    '<?php\n' +
    'function helper($x) { return $x; }\n' +
    '# legacy note: helper(1)\n' +
    'function real() { return helper(2); }\n',
  // #14 rep.py
  'rep.py':
    'def compute(x):\n' +
    '    return x * 2\n' +
    'def report(x):\n' +
    '    return f"total={compute(x)}"\n' +
    'def multi(x):\n' +
    '    return f"""\n' +
    '    header {compute(x)} not{{code}}\n' +
    '    """\n' +
    'def prefixed(x):\n' +
    '    return rf"raw {compute(x)}"\n' +
    'def decoy(x):\n' +
    '    return "compute(x)"\n' +
    'def decoy2(x):\n' +
    "    return f\"{'compute(1)'} ok\"\n",
  // #15 huge single-line string (1M-char member of the 9M crash class — see header)
  'data.js':
    'export function payload() { return "' + 'a'.repeat(1_000_000) + '"; }\n' +
    'export function tail() { return payload().length; }\n',
};

const corpus = new Map(Object.entries(FIXTURES));
for (const f of readdirSync(join(SCRIPTS, 'lib')).filter((f) => f.endsWith('.mjs')).sort()) {
  corpus.set(`lib/${f}`, readFileSync(join(SCRIPTS, 'lib', f), 'utf8'));
}

test('corpus sanity: fixtures + every scripts/lib module present', () => {
  assert.ok(corpus.size >= Object.keys(FIXTURES).length + 10, `corpus has ${corpus.size} members`);
});

const MASKS = [['maskJs', maskJs], ['maskPy', maskPy]];

for (const [name, mask] of MASKS) {
  test(`P1 ${name}: per-line length preservation over the corpus, both modes`, () => {
    for (const [id, text] of corpus) {
      const inLines = text.split(/\r?\n/);
      for (const opts of [{}, { keepValues: true }]) {
        const outLines = mask(text, opts).split('\n');
        assert.equal(outLines.length, inLines.length, `${name}(${id}${opts.keepValues ? ',keepValues' : ''}): line count`);
        for (let i = 0; i < inLines.length; i++) {
          assert.equal(outLines[i].length, inLines[i].length,
            `${name}(${id}${opts.keepValues ? ',keepValues' : ''}) line ${i + 1}: length ${outLines[i].length} != ${inLines[i].length}`);
        }
      }
    }
  });

  test(`P2 ${name}: default-mode idempotence over the corpus`, () => {
    for (const [id, text] of corpus) {
      const m1 = mask(text);
      const m2 = mask(m1);
      assert.equal(m2, m1, `${name}(${id}): mask(mask(t)) !== mask(t)`);
    }
  });
}

test('P3 maskRuby: idempotence + line-count preservation over the corpus', () => {
  for (const [id, text] of corpus) {
    const m1 = maskRuby(text);
    assert.equal(m1.split('\n').length, text.split(/\r?\n/).length, `maskRuby(${id}): line count`);
    assert.equal(maskRuby(m1), m1, `maskRuby(${id}): idempotence`);
  }
});

// P4 (round-2 WS-C review): maskAligned's dispatch must cover every JS/TS-family extension the
// extractor enumerates — finding #11 added `.mts/.cts` to SRC_RE, and a dispatch miss here is not
// a soft degrade: codemod's rewrite gate reads null as "no aligned mask for this language" and
// falls back to UNMASKED whole-file replacement (string/comment occurrences lose their protection).
test('P4 maskAligned: every JS-family extension the extractor enumerates gets the aligned mask', () => {
  const src = 'const s = "fake(call)";\n// fake(comment)\nreal(call);\n';
  for (const f of ['a.js', 'a.mjs', 'a.cjs', 'a.jsx', 'a.ts', 'a.tsx', 'a.mts', 'a.cts', 'a.java', 'a.cs', 'a.kt', 'a.kts', 'a.swift']) {
    const m = maskAligned(f, src);
    assert.notEqual(m, null, `${f}: must dispatch to maskJs, not null`);
    assert.ok(!m.includes('fake(call)') && !m.includes('fake(comment)'), `${f}: string/comment blanked`);
    assert.ok(m.includes('real(call);'), `${f}: live code preserved`);
  }
});
