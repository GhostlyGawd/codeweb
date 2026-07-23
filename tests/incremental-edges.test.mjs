// F9 — incremental edge derivation. The extractor caches per-file edges (guarded by a global
// symbol-set signature); when the symbol set is unchanged, unchanged files reuse their edges and only
// changed files are re-edged.
//
// The anti-reward-hack PAIR:
//   IE-EQUIVALENCE   — warm incremental extraction is byte-identical (sorted nodes+edges) to a cold
//                      full extraction of the same final tree, for ANY mutation sequence. (Correctness.)
//   IE-INCREMENTALITY — a pure body edit re-edges ONLY the changed file, and the warm output still
//                      equals a cold full extract (so re-edging the WRONG file can't pass). (Actually
//                      incremental, and correctly so.)
// always-full passes EQUIVALENCE but fails INCREMENTALITY; a cache that skips needed work passes
// INCREMENTALITY but fails EQUIVALENCE. Both must hold.
//
// Round 2, finding #40 (WS-H, T-40.4): these run IN-PROCESS via runExtract — the ~330-490 child
// launches at CI depth (this file was the suite's dominant wall term pre-#6, and half of what #6 was
// left with) become function calls. The CLI surface stays pinned by IE-INPROC-PARITY (one spawn,
// byte-equal to the in-process fragment). Every assertion is IDENTICAL to the spawned version — only
// the transport changed; the `edged N/M` reads move from stderr to the returned banner string, and
// the fragment byte-compares move from the `--out` files to JSON.stringify(fragment) (exactly what
// `--out` writes). Env-dependent legs set process.env around their (top-level, sequential) call —
// safe because only IE-EQUIVALENCE's subtests run concurrently and they use no per-call env.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runNode, script, tmpDir, cleanup, writeTree } from './helpers.mjs';
import { runExtract } from '../scripts/extract-symbols.mjs';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { prng, int, pick } from './_proptest.mjs';

const EXTRACT = script('extract-symbols.mjs');
const sortedNodes = (g) => g.nodes.map((n) => n.id).sort();
const sortedEdges = (g) => g.edges.map((e) => `${e.from} ${e.to} ${e.kind}`).sort();
const edgedCount = (banner) => { const m = /edged (\d+)\/(\d+)/.exec(banner); return m ? { edged: +m[1], total: +m[2] } : null; };

// Run process.env-scoped for the env-dependent legs (top-level tests are SEQUENTIAL — verified — so
// this never races IE-EQUIVALENCE's concurrent subtests, which pass no env).
async function withEnv(env, fn) {
  const keys = Object.keys(env);
  const saved = keys.map((k) => [k, process.env[k]]);
  for (const k of keys) { if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
  try { return await fn(); } finally { for (const [k, v] of saved) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
}

// In-process extract. Returns { graph: fragment, banner, bytes: JSON.stringify(fragment) } — `bytes`
// is exactly what `--out` writes, so the byte-equality gates are unchanged. `cache=null` = no cache.
async function extract(root, cache, { full = false, env = {} } = {}) {
  return withEnv(env, async () => {
    const { fragment, banner } = await runExtract({ path: root, ctags: false, cache, full });
    return { graph: fragment, banner, bytes: JSON.stringify(fragment) };
  });
}
// cold full extract of the current tree, reusing nothing (no cache, --full)
const coldFull = (root) => extract(root, null, { full: true });

const BASE = {
  'a.js': 'export function a1(x) { return b1(x) + 1; }\nexport function a2() { return 2; }\n',
  'b.js': 'export function b1(y) { return y * 2; }\n',
  'c.js': 'import { a1 } from "./a.js";\nexport function c1() { return a1(3); }\n',
};

// IE-INPROC-PARITY — the CLI surface stays pinned: the in-process fragment is byte-for-byte the
// spawned CLI's stdout on the same tree (finding #40, T-40.4). One spawn; the loops below are all
// in-process. This is also the extractor-level anchor for #18b's in-process hook parity.
test('IE-INPROC-PARITY: in-process runExtract fragment byte-equals the spawned CLI stdout', async () => {
  const dir = tmpDir('codeweb-ie-'); const root = join(dir, 'src'); writeTree(root, BASE);
  try {
    const cli = runNode(EXTRACT, [root, '--no-ctags']);
    assert.equal(cli.status, 0, cli.stderr);
    const { fragment } = await runExtract({ path: root, ctags: false });
    assert.equal(JSON.stringify(fragment), cli.stdout, 'in-process fragment == CLI stdout (CLI surface pinned)');
  } finally { cleanup(dir); }
});

test('IE-COLD-PARITY: cold cache == no-cache == --full (caching changes nothing cold)', async () => {
  const dir = tmpDir('codeweb-ie-'); const root = join(dir, 'src'); writeTree(root, BASE);
  try {
    const cached = (await extract(root, join(dir, 'cache.json'))).graph;
    const plain = (await extract(root, null)).graph;
    const full = (await coldFull(root)).graph;
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
//   - the CODEWEB_NAME_DELTA=0 leg (next test) re-runs the SAME scenario keeping the original
//     assertion VERBATIM: the one assertion moved under the env that pins its semantics.
// d.js is the crafted disjoint file: no imports (bind holds vacuously), candidates {d2} — never
// intersecting the a3/a1x deltas these tests generate.
const DISJOINT = 'export function d1() { return d2(); }\nexport function d2() { return 1; }\n';
// The two tests that assert DELTA behavior (edged < total) pin the lever ON ('' overrides an
// ambient '0'; any value but '0' is on) — so running the whole suite under CODEWEB_NAME_DELTA=0
// (the rollback-verification mode) still passes: equivalence tests respect the ambient lever,
// mechanism tests pin the leg they prove.
const DELTA_ON = { CODEWEB_NAME_DELTA: '' };

test('IE-INCREMENTALITY: a pure body edit re-edges only the changed file AND still equals cold full', async () => {
  const dir = tmpDir('codeweb-ie-'); const root = join(dir, 'src'); writeTree(root, BASE);
  writeFileSync(join(root, 'd.js'), DISJOINT);
  const cache = join(dir, 'cache.json');
  try {
    await extract(root, cache, { env: DELTA_ON }); // warm
    // pure body edit to b.js (no symbol added/removed)
    writeFileSync(join(root, 'b.js'), 'export function b1(y) { return y * 2 + 0; }\n');
    const warm = await extract(root, cache, { env: DELTA_ON });
    const ec = edgedCount(warm.banner);
    assert.ok(ec, `banner reports an "edged N/M" counter (got: ${warm.banner})`);
    assert.equal(ec.edged, 1, `only the one changed file is re-edged (got ${ec.edged}/${ec.total})`);
    // re-edging the WRONG file would still show 1/4 — so also assert the OUTPUT matches cold full
    const cold = (await coldFull(root)).graph;
    assert.deepEqual(sortedEdges(warm.graph), sortedEdges(cold), 'warm output equals cold full after a body edit');
    // edit TWO files (still body-only) -> exactly two re-edged
    writeFileSync(join(root, 'a.js'), 'export function a1(x) { return b1(x) + 2; }\nexport function a2() { return 22; }\n');
    writeFileSync(join(root, 'c.js'), 'import { a1 } from "./a.js";\nexport function c1() { return a1(4); }\n');
    const warm2 = await extract(root, cache, { env: DELTA_ON });
    assert.equal(edgedCount(warm2.banner).edged, 2, 'two changed files -> two re-edged');
    assert.deepEqual(sortedEdges(warm2.graph), sortedEdges((await coldFull(root)).graph));
    // ADD a symbol (a3 to a.js) -> NAME-DELTA path: a.js re-edges (content changed), c.js re-edges
    // (bind-coupled to a.js: its bindDeps hash moved, so its bind re-derived), b.js and the
    // crafted-disjoint d.js REPLAY (cand {b1-callers…}/{d2} never see the {a3} delta, binds hold)
    writeFileSync(join(root, 'a.js'), 'export function a1(x) { return b1(x) + 2; }\nexport function a2() { return 22; }\nexport function a3() { return 3; }\n');
    const grow = await extract(root, cache, { env: DELTA_ON });
    const ec2 = edgedCount(grow.banner);
    assert.ok(ec2.edged < ec2.total, `add-one-function stays incremental under the name delta (got ${ec2.edged}/${ec2.total})`);
    assert.equal(ec2.edged, 2, `exactly the edited file + its bind-coupled importer re-edge (got ${ec2.edged}/${ec2.total})`);
    // and the OUTPUT is byte-equal to a cold full extract — replaying the wrong file cannot pass
    const cold3 = await coldFull(root);
    assert.deepEqual(sortedNodes(grow.graph), sortedNodes(cold3.graph));
    assert.deepEqual(sortedEdges(grow.graph), sortedEdges(cold3.graph));
    assert.equal(grow.bytes, cold3.bytes, 'delta-path fragment bytes equal cold full');
  } finally { cleanup(dir); }
});

test('IE-INCREMENTALITY (kill-switch leg): CODEWEB_NAME_DELTA=0 restores the wholesale mechanism verbatim', async () => {
  const dir = tmpDir('codeweb-ie-'); const root = join(dir, 'src'); writeTree(root, BASE);
  writeFileSync(join(root, 'd.js'), DISJOINT);
  const cache = join(dir, 'cache.json');
  const ENV = { CODEWEB_NAME_DELTA: '0' };
  try {
    await extract(root, cache, { env: ENV }); // warm
    // the SAME add-a3 step as the default leg
    writeFileSync(join(root, 'a.js'), 'export function a1(x) { return b1(x) + 1; }\nexport function a2() { return 2; }\nexport function a3() { return 3; }\n');
    const grow = await extract(root, cache, { env: ENV });
    const ec2 = edgedCount(grow.banner);
    assert.equal(ec2.edged, ec2.total, 'a changed symbol set forces a full re-edge (correctness over speed)');
    // and the wholesale leg's bytes equal cold full too (both paths emit identical bytes)
    const cold = await coldFull(root);
    assert.deepEqual(sortedEdges(grow.graph), sortedEdges(cold.graph));
    assert.equal(grow.bytes, cold.bytes, 'kill-switch fragment bytes equal cold full');
  } finally { cleanup(dir); }
});

test('IE-BIND-COUPLING: rensym of an IMPORTED name re-edges the importer (the aliased-import trap)', async () => {
  const dir = tmpDir('codeweb-ie-'); const root = join(dir, 'src'); writeTree(root, BASE);
  const cache = join(dir, 'cache.json');
  try {
    await extract(root, cache, { env: DELTA_ON }); // warm
    // rename BASE's a1 (imported by c.js) — c.js's text is UNCHANGED and its cand holds `a1`
    // (dirty too), but the load-bearing conjunct is the BIND rule: a.js is in c.js's bindDeps,
    // its hash moved, so c.js re-binds -> re-edges. b.js (candidates disjoint, no imports) replays.
    writeFileSync(join(root, 'a.js'), 'export function a1x(x) { return b1(x) + 1; }\nexport function a2() { return 2; }\n');
    const warm = await extract(root, cache, { env: DELTA_ON });
    const ec = edgedCount(warm.banner);
    assert.equal(ec.edged, 2, `the renamed file + its importer re-edge, b.js replays (got ${ec.edged}/${ec.total})`);
    const cold = await coldFull(root);
    assert.deepEqual(sortedNodes(warm.graph), sortedNodes(cold.graph));
    assert.deepEqual(sortedEdges(warm.graph), sortedEdges(cold.graph));
    assert.ok(!sortedEdges(warm.graph).includes('c.js:c1 a.js:a1 call'), 'no stale edge to the renamed-away a1');
  } finally { cleanup(dir); }
});

// Round 2, finding #17 — the deterministic repro the extended generator's `rex` op first hit:
// flipping a barrel's forward (`export { shared9 } from './rexutil.js'` -> `'./rexutil2.js'`)
// changes ZERO symbols, so the pre-#17 wholesale gate replayed the UNCHANGED consumer's cached call
// edge to the OLD chain target. rexSig closes it: warm == cold.
test('IE-REX-FLIP: retargeting a re-export barrel re-aims the consumer edge (warm == cold)', async () => {
  const dir = tmpDir('codeweb-ie-'); const root = join(dir, 'src');
  writeTree(root, { ...REX_FILES, 'rexbarrel.js': REX_BARREL('rexutil.js') });
  const cache = join(dir, 'cache.json');
  try {
    const w1 = (await extract(root, cache)).graph;
    assert.ok(sortedEdges(w1).includes('rexuser.js:useShared rexutil.js:shared9 call'), 'baseline chain resolves to rexutil');
    writeFileSync(join(root, 'rexbarrel.js'), REX_BARREL('rexutil2.js')); // the flip: zero label delta
    const warm = await extract(root, cache);
    const cold = await coldFull(root);
    assert.deepEqual(sortedEdges(warm.graph), sortedEdges(cold.graph), 'warm equals cold after the flip');
    assert.ok(sortedEdges(warm.graph).includes('rexuser.js:useShared rexutil2.js:shared9 call'), 'consumer edge re-aimed at rexutil2');
    assert.ok(!sortedEdges(warm.graph).includes('rexuser.js:useShared rexutil.js:shared9 call'), 'stale edge to the old target is gone');
  } finally { cleanup(dir); }
});

test('IE-DANGLING: deleting a file that another file imports leaves no dangling edge (warm == cold)', async () => {
  const dir = tmpDir('codeweb-ie-'); const root = join(dir, 'src'); writeTree(root, BASE);
  const cache = join(dir, 'cache.json');
  try {
    await extract(root, cache);
    rmSync(join(root, 'a.js')); // c.js imports a1 from a.js; b.js is independent
    const warm = (await extract(root, cache)).graph;
    const cold = (await coldFull(root)).graph;
    assert.deepEqual(sortedNodes(warm), sortedNodes(cold), 'no stale a.js symbols survive');
    assert.deepEqual(sortedEdges(warm), sortedEdges(cold), 'no dangling edge to a deleted file survives');
    assert.ok(!warm.edges.some((e) => e.from.startsWith('a.js') || e.to.startsWith('a.js')), 'zero edges reference the deleted file');
  } finally { cleanup(dir); }
});

// Round 2, finding #6: the trials run as CONCURRENT subtests (cap 4). Trial count: CODEWEB_IE_TRIALS,
// else 40 in CI / 10 local. Per-trial seeds (2025 + trial); trials are independent, deterministic per
// index, and concurrency-safe. Round 2, finding #40 (T-40.4): the per-trial warm+cold extracts are
// now runExtract calls (no child spawn), so the whole equivalence sweep runs in one process — the
// dominant wall term collapses. No env is set here, so the concurrent subtests never touch process.env.
//
// Round 2, finding #17 (T-17.4) — extended op set, landed FIRST (green under wholesale semantics):
//   delsym / rensym (incl. colliding 1->2 unique->ambiguous) / pkg (boundary repartition, zero label
//   delta) / rex (barrel-forward flip, zero label delta). Semantics class is a strict superset.
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
      await extract(root, cache); // initial warm
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
        const warm = await extract(root, cache);
        const cold = await coldFull(root);
        assert.deepEqual(sortedNodes(warm.graph), sortedNodes(cold.graph), `trial ${trial} step ${s} (${op}): nodes diverge`);
        assert.deepEqual(sortedEdges(warm.graph), sortedEdges(cold.graph), `trial ${trial} step ${s} (${op}): edges diverge`);
        // #19 proof (and #17's shared oracle): warm and cold fragment bytes are equal — the
        // sorted-set compares above stay as diagnostics, the JSON.stringify buffers are the gate.
        assert.equal(warm.bytes, cold.bytes, `trial ${trial} step ${s} (${op}): warm fragment bytes diverge from cold full`);
      }
    } finally { cleanup(dir); }
  })));
});
