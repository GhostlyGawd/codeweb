// Round 2, finding #21 (T-21.3) — the innermost-range index and the open-class owner stack must be
// BEHAVIOR-IDENTICAL to the linear scans they replace. Both references below are the extractor's
// old loops EMBEDDED VERBATIM (frozen oracles); the property runs random range sets — nested,
// overlapping, adjacent, duplicate starts, degenerate (end < start), empty — across every line and
// demands equality BY OBJECT IDENTITY (same winning range, not just same id). A golden mini-fixture
// then pins the owner-qualification semantics end-to-end through the extractor's emitted ids, and a
// generated big-file extract pins determinism on the shape the finding measured.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildInnermostIndex, createOwnerStack } from '../scripts/lib/enclosing.mjs';
import { writeLoadedCorpus } from '../bench/lib/loaded-corpus.mjs';
import { runNode, script, tmpDir, cleanup, writeTree } from './helpers.mjs';
import { prng, int, pick } from './_proptest.mjs';

const EXTRACT = script('extract-symbols.mjs');

// ---- frozen reference oracles (the pre-#21 linear scans, verbatim) ---------------------------
// deriveFileEdges' enclosing():
const referenceEnclosing = (ranges, lineNo) => {
  let best = null;
  for (const rg of ranges) if (lineNo >= rg.start && lineNo <= rg.end && (!best || rg.start > best.start)) best = rg;
  return best;
};
// the node-build loop's method-owner scan (over ranges-so-far):
const referenceOwner = (rangesSoFar, start) => {
  let best = null;
  for (const rg of rangesSoFar) if (rg.kind === 'class' && start > rg.start && start <= rg.end && (!best || rg.start > best.start)) best = rg;
  return best;
};

function randomRanges(rng, lineCount) {
  const n = int(rng, 0, 12);
  const ranges = [];
  for (let i = 0; i < n; i++) {
    const start = int(rng, 1, lineCount);
    // mix of tight, nested-ish, degenerate (end < start), and past-EOF ends
    const end = start + int(rng, -1, Math.max(2, Math.floor(lineCount / 2)));
    ranges.push({ id: `r${i}`, name: `n${i}`, start, end, kind: pick(rng, ['class', 'function', 'method', 'class']) });
  }
  // force duplicate starts often: clone a range's start onto another
  if (n >= 2 && rng() < 0.6) ranges[int(rng, 0, n - 1)].start = ranges[int(rng, 0, n - 1)].start;
  return ranges;
}

test('ENC-PROP: innermost index equals the linear enclosing() scan on every line', () => {
  const rng = prng(20260722);
  for (let trial = 0; trial < 300; trial++) {
    const lineCount = int(rng, 1, 40);
    const ranges = randomRanges(rng, lineCount);
    const innermost = buildInnermostIndex(ranges, lineCount);
    for (let l = 1; l <= lineCount; l++) {
      const got = (l <= lineCount && innermost[l]) || null;
      const want = referenceEnclosing(ranges, l);
      assert.equal(got, want,
        `trial ${trial} line ${l}: index -> ${got && got.id}, reference -> ${want && want.id} (ranges ${JSON.stringify(ranges)})`);
    }
  }
});

test('ENC-PROP: owner stack equals the :422 class-owner scan over a line-sorted build loop', () => {
  const rng = prng(977);
  for (let trial = 0; trial < 300; trial++) {
    const lineCount = int(rng, 1, 40);
    // the build loop walks syms line-sorted (stable), pushing each into ranges as it goes
    const syms = randomRanges(rng, lineCount)
      .map((rg, idx) => ({ rg, idx }))
      .sort((a, b) => a.rg.start - b.rg.start || a.idx - b.idx)
      .map((x) => x.rg);
    const rangesSoFar = [];
    const stack = createOwnerStack();
    for (const s of syms) {
      if (s.kind !== 'class') {
        const want = referenceOwner(rangesSoFar, s.start);
        const got = stack.ownerOf(s.start);
        assert.equal(got, want,
          `trial ${trial} sym@${s.start}: stack -> ${got && got.id}, reference -> ${want && want.id} (syms ${JSON.stringify(syms)})`);
      }
      rangesSoFar.push(s);
      if (s.kind === 'class') stack.push(s);
    }
  }
});

// Golden mini-fixture: nested classes, same-name methods, a method AFTER an inner class closes,
// and a same-line class+method — the owner-qualified id scheme pins which class won each method.
test('ENC-GOLD: owner-qualified ids unchanged on nested/adjacent/same-line class shapes', () => {
  const dir = tmpDir('codeweb-enc-');
  const root = join(dir, 'src');
  writeTree(root, {
    'x.js': [
      'export class Outer {',      // 1..11
      '  ping() { return 1; }',    // 2
      '  static Inner = class Inner2 {', // 3 (field arrow? no — class expr; regex sees "Inner2"? keep simple)
      '  }',
      '  pong() { return 2; }',    // 5
      '}',
      'class Late { ping() { return 3; } }', // 7: class + method on ONE line — class must not own... (start > rg.start)
      'class A { m() { return 4; } }',
      'class B { m() { return 5; } }',
      'function free() { return 6; }',
      '',
    ].join('\n'),
  });
  const r = runNode(EXTRACT, [root, '--no-ctags', '--out', join(dir, 'f.json')]);
  assert.equal(r.status, 0, r.stderr);
  const ids = JSON.parse(readFileSync(join(dir, 'f.json'), 'utf8')).nodes.map((n) => n.id).sort();
  try {
    // Pinned against the PRE-#21 extractor's real output (the golden was captured before the
    // index landed): Outer owns ping/pong, A/B own their same-name m's, and the same-line
    // `class Late { ping() ... }` resolves to Late.ping via the SCANNER's own owner attribution
    // (s.owner from the symbol scan) — the :422 fallback scan, which this finding hoists, only
    // runs when the scanner did NOT attribute an owner, and its strict `start > rg.start`
    // same-line exclusion is pinned by the ENC-PROP property above.
    for (const want of ['x.js:Outer', 'x.js:Outer.ping', 'x.js:Outer.pong', 'x.js:A.m', 'x.js:B.m', 'x.js:Late.ping', 'x.js:free']) {
      assert.ok(ids.includes(want), `${want} present (got ${ids.join(', ')})`);
    }
  } finally { cleanup(dir); }
});

// Determinism on the measured shape (scaled down for suite budget): two extracts of a generated
// single big file are byte-identical, and warm equals cold.
test('ENC-BIG: single big-file extract is deterministic byte-for-byte', () => {
  const dir = tmpDir('codeweb-encbig-');
  const root = join(dir, 'src');
  try {
    writeLoadedCorpus(root, { files: 1, fnsPerFile: 800 });
    const r1 = runNode(EXTRACT, [root, '--no-ctags', '--out', join(dir, 'f1.json')]);
    assert.equal(r1.status, 0, r1.stderr);
    const r2 = runNode(EXTRACT, [root, '--no-ctags', '--out', join(dir, 'f2.json')]);
    assert.equal(r2.status, 0, r2.stderr);
    assert.deepEqual(readFileSync(join(dir, 'f1.json')), readFileSync(join(dir, 'f2.json')), 'byte-identical across runs');
  } finally { cleanup(dir); }
});
