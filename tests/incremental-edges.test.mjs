// F9 — incremental edge derivation. The extractor caches per-file edges (guarded by a global
// symbol-set signature); when the symbol set is unchanged, unchanged files reuse their edges and only
// changed files are re-edged. Written BEFORE the impl (RED — the cache currently re-derives edges
// globally every run, and there is no "edged N/M" counter / --full flag yet).
//
// The anti-reward-hack PAIR:
//   IE-EQUIVALENCE   — warm incremental extraction is byte-identical (sorted nodes+edges) to a cold
//                      full extraction of the same final tree, for ANY mutation sequence. (Correctness.)
//   IE-INCREMENTALITY — a pure body edit re-edges ONLY the changed file, and the warm output still
//                      equals a cold full extract (so re-edging the WRONG file can't pass). (Actually
//                      incremental, and correctly so.)
// always-full passes EQUIVALENCE but fails INCREMENTALITY; a cache that skips needed work passes
// INCREMENTALITY but fails EQUIVALENCE. Both must hold.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runNode, runNodeAsync, script, tmpDir, cleanup, writeTree, readJSON } from './helpers.mjs';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { prng, int, pick } from './_proptest.mjs';

const EXTRACT = script('extract-symbols.mjs');
const sortedNodes = (g) => g.nodes.map((n) => n.id).sort();
const sortedEdges = (g) => g.edges.map((e) => `${e.from} ${e.to} ${e.kind}`).sort();
const edgedCount = (stderr) => { const m = /edged (\d+)\/(\d+)/.exec(stderr); return m ? { edged: +m[1], total: +m[2] } : null; };

function extract(root, out, cache, extra = []) {
  const r = runNode(EXTRACT, [root, '--out', out, '--cache', cache, '--no-ctags', ...extra]);
  assert.equal(r.status, 0, `extract failed: ${r.stderr}`);
  return { graph: readJSON(out), stderr: r.stderr };
}
// cold full extract of the current tree, reusing nothing
const coldFull = (dir, root, tag) => extract(root, join(dir, `cold${tag}.json`), join(dir, `coldc${tag}.json`), ['--full']).graph;

// Async twins for IE-EQUIVALENCE's concurrent subtests (round 2, finding #6) — the three other IE
// tests stay sync/top-level.
async function extractAsync(root, out, cache, extra = []) {
  const r = await runNodeAsync(EXTRACT, [root, '--out', out, '--cache', cache, '--no-ctags', ...extra]);
  assert.equal(r.status, 0, `extract failed: ${r.stderr}`);
  return { graph: readJSON(out), stderr: r.stderr };
}
const coldFullAsync = async (dir, root, tag) =>
  (await extractAsync(root, join(dir, `cold${tag}.json`), join(dir, `coldc${tag}.json`), ['--full'])).graph;

const BASE = {
  'a.js': 'export function a1(x) { return b1(x) + 1; }\nexport function a2() { return 2; }\n',
  'b.js': 'export function b1(y) { return y * 2; }\n',
  'c.js': 'import { a1 } from "./a.js";\nexport function c1() { return a1(3); }\n',
};

test('IE-COLD-PARITY: cold cache == no-cache == --full (caching changes nothing cold)', () => {
  const dir = tmpDir('codeweb-ie-'); const root = join(dir, 'src'); writeTree(root, BASE);
  try {
    const cached = extract(root, join(dir, 'c1.json'), join(dir, 'cache.json')).graph;
    const r = runNode(EXTRACT, [root, '--out', join(dir, 'c2.json'), '--no-ctags']);
    assert.equal(r.status, 0, r.stderr);
    const plain = readJSON(join(dir, 'c2.json'));
    const full = coldFull(dir, root, 'p');
    for (const ref of [plain, full]) {
      assert.deepEqual(sortedNodes(cached), sortedNodes(ref));
      assert.deepEqual(sortedEdges(cached), sortedEdges(ref));
    }
  } finally { cleanup(dir); }
});

test('IE-INCREMENTALITY: a pure body edit re-edges only the changed file AND still equals cold full', () => {
  const dir = tmpDir('codeweb-ie-'); const root = join(dir, 'src'); writeTree(root, BASE);
  const cache = join(dir, 'cache.json');
  try {
    extract(root, join(dir, 'g0.json'), cache); // warm
    // pure body edit to b.js (no symbol added/removed)
    writeFileSync(join(root, 'b.js'), 'export function b1(y) { return y * 2 + 0; }\n');
    const warm = extract(root, join(dir, 'g1.json'), cache);
    const ec = edgedCount(warm.stderr);
    assert.ok(ec, `banner reports an "edged N/M" counter (got: ${warm.stderr})`);
    assert.equal(ec.edged, 1, `only the one changed file is re-edged (got ${ec.edged}/${ec.total})`);
    // re-edging the WRONG file would still show 1/3 — so also assert the OUTPUT matches cold full
    const cold = coldFull(dir, root, '1');
    assert.deepEqual(sortedEdges(warm.graph), sortedEdges(cold), 'warm output equals cold full after a body edit');
    // edit TWO files (still body-only) -> exactly two re-edged
    writeFileSync(join(root, 'a.js'), 'export function a1(x) { return b1(x) + 2; }\nexport function a2() { return 22; }\n');
    writeFileSync(join(root, 'c.js'), 'import { a1 } from "./a.js";\nexport function c1() { return a1(4); }\n');
    const warm2 = extract(root, join(dir, 'g2.json'), cache);
    assert.equal(edgedCount(warm2.stderr).edged, 2, 'two changed files -> two re-edged');
    assert.deepEqual(sortedEdges(warm2.graph), sortedEdges(coldFull(dir, root, '2')));
    // ADD a symbol -> symbol set changes -> safe fallback re-edges every file
    writeFileSync(join(root, 'a.js'), 'export function a1(x) { return b1(x) + 2; }\nexport function a2() { return 22; }\nexport function a3() { return 3; }\n');
    const grow = extract(root, join(dir, 'g3.json'), cache);
    const ec2 = edgedCount(grow.stderr);
    assert.equal(ec2.edged, ec2.total, 'a changed symbol set forces a full re-edge (correctness over speed)');
  } finally { cleanup(dir); }
});

test('IE-DANGLING: deleting a file that another file imports leaves no dangling edge (warm == cold)', () => {
  const dir = tmpDir('codeweb-ie-'); const root = join(dir, 'src'); writeTree(root, BASE);
  const cache = join(dir, 'cache.json');
  try {
    extract(root, join(dir, 'g0.json'), cache);
    rmSync(join(root, 'a.js')); // c.js imports a1 from a.js; b.js is independent
    const warm = extract(root, join(dir, 'g1.json'), cache).graph;
    const cold = coldFull(dir, root, 'd');
    assert.deepEqual(sortedNodes(warm), sortedNodes(cold), 'no stale a.js symbols survive');
    assert.deepEqual(sortedEdges(warm), sortedEdges(cold), 'no dangling edge to a deleted file survives');
    assert.ok(!warm.edges.some((e) => e.from.startsWith('a.js') || e.to.startsWith('a.js')), 'zero edges reference the deleted file');
  } finally { cleanup(dir); }
});

// Round 2, finding #6: the trials run as CONCURRENT subtests (cap 4) with async child spawns —
// the one test was 60 s of the suite's ~93 s floor. Trial count: CODEWEB_IE_TRIALS, else 40 in CI
// (unchanged CI depth) / 10 local. Per-trial seeds (2025 + trial) replace the one shared PRNG
// stream, so fixture BYTES differ from the serial version; the semantics class — random 2–6-step
// mutation sequences with a warm ≡ cold assert per step — is unchanged. Trials are independent,
// deterministic per index, and concurrency-safe; a diverging step still fails its own named
// `trial N` subtest with the step/op message.
const TRIALS = Number(process.env.CODEWEB_IE_TRIALS || (process.env.CI ? 40 : 10));
if (!Number.isInteger(TRIALS) || TRIALS < 1) throw new Error('CODEWEB_IE_TRIALS must be a positive integer');

test('IE-EQUIVALENCE: warm incremental == cold full, for random mutation sequences', { concurrency: 4 }, async (t) => {
  await Promise.all([...Array(TRIALS).keys()].map((trial) => t.test(`trial ${trial}`, async () => {
    const rng = prng(2025 + trial);
    const dir = tmpDir('codeweb-ie-'); const root = join(dir, 'src');
    const tree = { ...BASE };
    writeTree(root, tree);
    const cache = join(dir, 'cache.json');
    try {
      await extractAsync(root, join(dir, 'warm.json'), cache); // initial warm
      const steps = int(rng, 2, 6);
      for (let s = 0; s < steps; s++) {
        const op = pick(rng, ['body', 'addsym', 'addfile', 'delfile', 'delfile']);
        const keys = Object.keys(tree);
        if (op === 'body') {
          const f = pick(rng, keys);
          tree[f] = tree[f] + `\n// touch ${int(rng, 0, 9999)}\n`;
        } else if (op === 'addsym') {
          const f = pick(rng, keys);
          tree[f] = tree[f] + `\nexport function g${int(rng, 0, 9999)}() { return b1(1); }\n`;
        } else if (op === 'addfile') {
          tree[`m${int(rng, 0, 9999)}.js`] = `export function n${int(rng, 0, 9)}() { return b1(1); }\n`;
        } else if (op === 'delfile' && keys.length > 1) {
          const f = pick(rng, keys); // genuinely pick from the CURRENT tree (was a bug: tree.length on an object)
          delete tree[f]; try { rmSync(join(root, f)); } catch { /* already gone */ }
        }
        writeTree(root, tree); // re-stage survivors; deleted files already removed from disk
        const warm = (await extractAsync(root, join(dir, `warm${s}.json`), cache)).graph;
        const cold = await coldFullAsync(dir, root, `${trial}_${s}`);
        assert.deepEqual(sortedNodes(warm), sortedNodes(cold), `trial ${trial} step ${s} (${op}): nodes diverge`);
        assert.deepEqual(sortedEdges(warm), sortedEdges(cold), `trial ${trial} step ${s} (${op}): edges diverge`);
      }
    } finally { cleanup(dir); }
  })));
});
