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
import { writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { prng, int, pick } from './_proptest.mjs';

const EXTRACT = script('extract-symbols.mjs');
const sortedNodes = (g) => g.nodes.map((n) => n.id).sort();
const sortedEdges = (g) => g.edges.map((e) => `${e.from} ${e.to} ${e.kind}`).sort();
const edgedCount = (stderr) => { const m = /edged (\d+)\/(\d+)/.exec(stderr); return m ? { edged: +m[1], total: +m[2] } : null; };

function extract(root, out, cache, extra = [], env = {}) {
  const r = runNode(EXTRACT, [root, '--out', out, '--cache', cache, '--no-ctags', ...extra], { env });
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

// Round 2, finding #17 (T-17.4 adjudication): the old third act of this test — "a changed symbol
// set forces a full re-edge" — pinned the wholesale MECHANISM, not the user-visible guarantee.
// The replacement is a STRICT SUPERSET, nothing deleted:
//   - the default-env leg (below) replaces it with strictly stronger checks: the add-one-function
//     step re-edges the edited file plus candidate-intersecting files while a crafted DISJOINT
//     file does not re-edge (edged < total), byte-equal to cold;
//   - the CODEWEB_NAME_DELTA=0 leg (next test) re-runs the SAME scenario — BASE tree (+ the same
//     disjoint d.js), the same add-a3 step — keeping the original assertion VERBATIM: the one
//     assertion moved under the env that pins its semantics, scenario intact.
// d.js is the crafted disjoint file: no imports (bind holds vacuously), candidates {d2} — never
// intersecting the a3/a1x deltas these tests generate.
const DISJOINT = 'export function d1() { return d2(); }\nexport function d2() { return 1; }\n';
// The two tests that assert DELTA behavior (edged < total) pin the lever ON ('' overrides an
// ambient '0' through runNode's env merge; any value but '0' is on) — so running the whole suite
// under CODEWEB_NAME_DELTA=0 (the rollback-verification mode) still passes: equivalence tests
// respect the ambient lever, mechanism tests pin the leg they prove.
const DELTA_ON = { CODEWEB_NAME_DELTA: '' };

test('IE-INCREMENTALITY: a pure body edit re-edges only the changed file AND still equals cold full', () => {
  const dir = tmpDir('codeweb-ie-'); const root = join(dir, 'src'); writeTree(root, BASE);
  writeFileSync(join(root, 'd.js'), DISJOINT);
  const cache = join(dir, 'cache.json');
  try {
    extract(root, join(dir, 'g0.json'), cache, [], DELTA_ON); // warm
    // pure body edit to b.js (no symbol added/removed)
    writeFileSync(join(root, 'b.js'), 'export function b1(y) { return y * 2 + 0; }\n');
    const warm = extract(root, join(dir, 'g1.json'), cache, [], DELTA_ON);
    const ec = edgedCount(warm.stderr);
    assert.ok(ec, `banner reports an "edged N/M" counter (got: ${warm.stderr})`);
    assert.equal(ec.edged, 1, `only the one changed file is re-edged (got ${ec.edged}/${ec.total})`);
    // re-edging the WRONG file would still show 1/4 — so also assert the OUTPUT matches cold full
    const cold = coldFull(dir, root, '1');
    assert.deepEqual(sortedEdges(warm.graph), sortedEdges(cold), 'warm output equals cold full after a body edit');
    // edit TWO files (still body-only) -> exactly two re-edged
    writeFileSync(join(root, 'a.js'), 'export function a1(x) { return b1(x) + 2; }\nexport function a2() { return 22; }\n');
    writeFileSync(join(root, 'c.js'), 'import { a1 } from "./a.js";\nexport function c1() { return a1(4); }\n');
    const warm2 = extract(root, join(dir, 'g2.json'), cache, [], DELTA_ON);
    assert.equal(edgedCount(warm2.stderr).edged, 2, 'two changed files -> two re-edged');
    assert.deepEqual(sortedEdges(warm2.graph), sortedEdges(coldFull(dir, root, '2')));
    // ADD a symbol (a3 to a.js) -> NAME-DELTA path: a.js re-edges (content changed), c.js re-edges
    // (bind-coupled to a.js: its bindDeps hash moved, so its bind re-derived), b.js and the
    // crafted-disjoint d.js REPLAY (cand {b1-callers…}/{d2} never see the {a3} delta, binds hold)
    writeFileSync(join(root, 'a.js'), 'export function a1(x) { return b1(x) + 2; }\nexport function a2() { return 22; }\nexport function a3() { return 3; }\n');
    const grow = extract(root, join(dir, 'g3.json'), cache, [], DELTA_ON);
    const ec2 = edgedCount(grow.stderr);
    assert.ok(ec2.edged < ec2.total, `add-one-function stays incremental under the name delta (got ${ec2.edged}/${ec2.total})`);
    assert.equal(ec2.edged, 2, `exactly the edited file + its bind-coupled importer re-edge (got ${ec2.edged}/${ec2.total})`);
    // and the OUTPUT is byte-equal to a cold full extract — replaying the wrong file cannot pass
    const cold3 = coldFull(dir, root, '3');
    assert.deepEqual(sortedNodes(grow.graph), sortedNodes(cold3));
    assert.deepEqual(sortedEdges(grow.graph), sortedEdges(cold3));
    assert.ok(readFileSync(join(dir, 'g3.json')).equals(readFileSync(join(dir, 'cold3.json'))), 'delta-path fragment bytes equal cold full');
  } finally { cleanup(dir); }
});

test('IE-INCREMENTALITY (kill-switch leg): CODEWEB_NAME_DELTA=0 restores the wholesale mechanism verbatim', () => {
  const dir = tmpDir('codeweb-ie-'); const root = join(dir, 'src'); writeTree(root, BASE);
  writeFileSync(join(root, 'd.js'), DISJOINT);
  const cache = join(dir, 'cache.json');
  const ENV = { CODEWEB_NAME_DELTA: '0' };
  try {
    extract(root, join(dir, 'g0.json'), cache, [], ENV); // warm
    // the SAME add-a3 step as the default leg
    writeFileSync(join(root, 'a.js'), 'export function a1(x) { return b1(x) + 1; }\nexport function a2() { return 2; }\nexport function a3() { return 3; }\n');
    const grow = extract(root, join(dir, 'g3.json'), cache, [], ENV);
    const ec2 = edgedCount(grow.stderr);
    assert.equal(ec2.edged, ec2.total, 'a changed symbol set forces a full re-edge (correctness over speed)');
    // and the wholesale leg's bytes equal cold full too (both paths emit identical bytes)
    const cold = coldFull(dir, root, 'ks');
    assert.deepEqual(sortedEdges(grow.graph), sortedEdges(cold));
    assert.ok(readFileSync(join(dir, 'g3.json')).equals(readFileSync(join(dir, 'coldks.json'))), 'kill-switch fragment bytes equal cold full');
  } finally { cleanup(dir); }
});

test('IE-BIND-COUPLING: rensym of an IMPORTED name re-edges the importer (the aliased-import trap)', () => {
  const dir = tmpDir('codeweb-ie-'); const root = join(dir, 'src'); writeTree(root, BASE);
  const cache = join(dir, 'cache.json');
  try {
    extract(root, join(dir, 'g0.json'), cache, [], DELTA_ON); // warm
    // rename BASE's a1 (imported by c.js) — c.js's text is UNCHANGED and its cand holds `a1`
    // (dirty too), but the load-bearing conjunct is the BIND rule: a.js is in c.js's bindDeps,
    // its hash moved, so c.js re-binds -> re-edges. b.js (candidates disjoint, no imports) replays.
    writeFileSync(join(root, 'a.js'), 'export function a1x(x) { return b1(x) + 1; }\nexport function a2() { return 2; }\n');
    const warm = extract(root, join(dir, 'g1.json'), cache, [], DELTA_ON);
    const ec = edgedCount(warm.stderr);
    assert.equal(ec.edged, 2, `the renamed file + its importer re-edge, b.js replays (got ${ec.edged}/${ec.total})`);
    const cold = coldFull(dir, root, 'bc');
    assert.deepEqual(sortedNodes(warm.graph), sortedNodes(cold));
    assert.deepEqual(sortedEdges(warm.graph), sortedEdges(cold));
    assert.ok(!sortedEdges(warm.graph).includes('c.js:c1 a.js:a1 call'), 'no stale edge to the renamed-away a1');
  } finally { cleanup(dir); }
});

// Round 2, finding #17 — the deterministic repro the extended generator's `rex` op first hit:
// flipping a barrel's forward (`export { shared9 } from './rexutil.js'` -> `'./rexutil2.js'`)
// changes ZERO symbols, so the pre-#17 wholesale gate (symbolSig + per-file hash) replayed the
// UNCHANGED consumer's cached call edge to the OLD chain target. rexSig closes it: warm == cold.
test('IE-REX-FLIP: retargeting a re-export barrel re-aims the consumer edge (warm == cold)', () => {
  const dir = tmpDir('codeweb-ie-'); const root = join(dir, 'src');
  writeTree(root, { ...REX_FILES, 'rexbarrel.js': REX_BARREL('rexutil.js') });
  const cache = join(dir, 'cache.json');
  try {
    const w1 = extract(root, join(dir, 'g0.json'), cache).graph;
    assert.ok(sortedEdges(w1).includes('rexuser.js:useShared rexutil.js:shared9 call'), 'baseline chain resolves to rexutil');
    writeFileSync(join(root, 'rexbarrel.js'), REX_BARREL('rexutil2.js')); // the flip: zero label delta
    const warm = extract(root, join(dir, 'g1.json'), cache);
    const cold = coldFull(dir, root, 'rx');
    assert.deepEqual(sortedEdges(warm.graph), sortedEdges(cold), 'warm equals cold after the flip');
    assert.ok(sortedEdges(warm.graph).includes('rexuser.js:useShared rexutil2.js:shared9 call'), 'consumer edge re-aimed at rexutil2');
    assert.ok(!sortedEdges(warm.graph).includes('rexuser.js:useShared rexutil.js:shared9 call'), 'stale edge to the old target is gone');
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
//
// Round 2, finding #17 (T-17.4) — extended op set, landed FIRST (green under wholesale semantics)
// so the name-delta invalidation is built under it, not fitted to it:
//   delsym  — strip one previously-added g-function (falls back to addsym when none exist);
//   rensym  — rename a DEF in place (call sites untouched); sometimes a COLLIDING rename onto a
//             name defined elsewhere, forcing a 1 -> 2 unique->ambiguous transition;
//   pkg     — toggle a nested package.json under sub/ (first use also plants sub/p.js) — a
//             pkg-boundary repartition with zero label delta (delta-ineligibility (a));
//   rex     — plant a re-export chain (rexutil/rexutil2 both defining shared9, a rexbarrel
//             forwarding it, a rexuser importing through the barrel), then FLIP the barrel's
//             target between the twins — retargets the consumer's chain with zero label delta
//             (delta-ineligibility (e)).
// Per-trial seeds keep 2025+trial; op-stream bytes differ from the previous generator (the #6
// precedent), the semantics class is a strict superset.
const TRIALS = Number(process.env.CODEWEB_IE_TRIALS || (process.env.CI ? 40 : 10));
if (!Number.isInteger(TRIALS) || TRIALS < 1) throw new Error('CODEWEB_IE_TRIALS must be a positive integer');

const REX_BARREL = (target) => `export { shared9 } from "./${target}";\n`;
const REX_FILES = {
  'rexutil.js': 'export function shared9() { return 1; }\n',
  'rexutil2.js': 'export function shared9() { return 2; }\n',
  'rexuser.js': 'import { shared9 } from "./rexbarrel.js";\nexport function useShared() { return shared9(); }\n',
};

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
        let op = pick(rng, ['body', 'addsym', 'addfile', 'delfile', 'delsym', 'rensym', 'pkg', 'rex']);
        const keys = Object.keys(tree).filter((f) => f.endsWith('.js'));
        if (op === 'delsym' && !keys.some((f) => /^export function g\d+\(\) \{ return b1\(1\); \}$/m.test(tree[f]))) op = 'addsym';
        if (op === 'body') {
          const f = pick(rng, keys);
          tree[f] = tree[f] + `\n// touch ${int(rng, 0, 9999)}\n`;
        } else if (op === 'addsym') {
          const f = pick(rng, keys);
          tree[f] = tree[f] + `\nexport function g${int(rng, 0, 9999)}() { return b1(1); }\n`;
        } else if (op === 'delsym') {
          const withG = keys.filter((f) => /^export function g\d+\(\) \{ return b1\(1\); \}$/m.test(tree[f]));
          const f = pick(rng, withG);
          tree[f] = tree[f].replace(/\nexport function g\d+\(\) \{ return b1\(1\); \}\n/, '\n');
        } else if (op === 'rensym') {
          const f = pick(rng, keys);
          const defs = [...tree[f].matchAll(/export function ([A-Za-z_]\w*)\(/g)].map((m) => m[1]);
          if (defs.length) {
            const oldName = pick(rng, defs);
            const others = keys.filter((k) => k !== f).flatMap((k) => [...tree[k].matchAll(/export function ([A-Za-z_]\w*)\(/g)].map((m) => m[1]));
            // colliding rename (1 -> 2 unique->ambiguous) roughly half the time when possible
            const newName = others.length && rng() < 0.5 ? pick(rng, others) : `r${int(rng, 0, 9999)}`;
            tree[f] = tree[f].replace(new RegExp(`export function ${oldName}\\(`), `export function ${newName}(`);
          }
        } else if (op === 'addfile') {
          tree[`m${int(rng, 0, 9999)}.js`] = `export function n${int(rng, 0, 9)}() { return b1(1); }\n`;
        } else if (op === 'delfile' && keys.length > 1) {
          const f = pick(rng, keys); // genuinely pick from the CURRENT tree (was a bug: tree.length on an object)
          delete tree[f]; try { rmSync(join(root, f)); } catch { /* already gone */ }
        } else if (op === 'pkg') {
          if (!tree['sub/p.js']) tree['sub/p.js'] = `export function subfn${int(rng, 0, 999)}() { return 1; }\n`;
          if (tree['sub/package.json']) { delete tree['sub/package.json']; try { rmSync(join(root, 'sub/package.json')); } catch { /* gone */ } }
          else tree['sub/package.json'] = '{"name":"sub"}\n';
        } else if (op === 'rex') {
          if (!tree['rexbarrel.js']) { Object.assign(tree, REX_FILES); tree['rexbarrel.js'] = REX_BARREL('rexutil.js'); }
          else tree['rexbarrel.js'] = REX_BARREL(tree['rexbarrel.js'].includes('rexutil2') ? 'rexutil.js' : 'rexutil2.js');
        }
        writeTree(root, tree); // re-stage survivors; deleted files already removed from disk
        const warm = (await extractAsync(root, join(dir, `warm${s}.json`), cache)).graph;
        const cold = await coldFullAsync(dir, root, `${trial}_${s}`);
        assert.deepEqual(sortedNodes(warm), sortedNodes(cold), `trial ${trial} step ${s} (${op}): nodes diverge`);
        assert.deepEqual(sortedEdges(warm), sortedEdges(cold), `trial ${trial} step ${s} (${op}): edges diverge`);
        // #19 proof (and #17's shared oracle): warm and cold `--out` files are byte-equal — the
        // sorted-set compares above stay as diagnostics, the buffers are the gate.
        assert.ok(readFileSync(join(dir, `warm${s}.json`)).equals(readFileSync(join(dir, `cold${trial}_${s}.json`))),
          `trial ${trial} step ${s} (${op}): warm fragment bytes diverge from cold full`);
      }
    } finally { cleanup(dir); }
  })));
});
