// F1 — find_similar: reuse-at-write-time. Tests are written BEFORE the implementation (strict TDD)
// and pin the tool to an INDEPENDENT inline shingler (the FS-ORACLE anti-cheat) run over RANDOMIZED
// bodies — the only un-gameable design (mirrors SE-FAITHFUL). The feature uses scripts/lib/shingles.mjs;
// this test never imports it — it carries its own parallel copy of the K=3 shingler + jaccard.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, script, tmpDir, writeTree, cleanup } from './helpers.mjs';
import { prng, int, pick } from './_proptest.mjs';
import { tokenize, shingles, jaccard } from '../scripts/lib/shingles.mjs';

const FS = script('find-similar.mjs');

// ---- INDEPENDENT oracle (a parallel reimplementation; must NOT import scripts/lib/shingles.mjs) ----
const KW = new Set(['if','for','while','switch','catch','return','function','typeof','await','new','const','let','var','async','else','try','finally','class','case','of','in','throw']);
const oracleTokens = (src) => src
  .replace(/\/\/[^\n]*/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(['"`])(?:\\.|(?!\1).)*\1/g, ' STR ')
  .toLowerCase()
  .match(/[a-z_$][\w$]*|[{}();=><!+\-*/%]/g)?.filter((t) => !KW.has(t)) || [];
const oracleShingles = (src, k = 3) => {
  const t = oracleTokens(src); const s = new Set();
  for (let i = 0; i + k <= t.length; i++) s.add(t.slice(i, i + k).join(' '));
  return s;
};
const oracleJaccard = (a, b) => { if (!a.size || !b.size) return 0; let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i); };
const tierOf = (s) => (s >= 0.6 ? 'high' : s >= 0.35 ? 'medium' : 'low');

// A fixture: N single-line token-soup "bodies" from a small vocabulary (so similarities span a
// spectrum). Each body is one line, so node i sits at line i+1 with loc 1 — exact, controllable.
const VOCAB = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta'];
const randomBody = (rng) => Array.from({ length: int(rng, 3, 10) }, () => pick(rng, VOCAB)).join(' ');
function makeFixture(rng, n) {
  const dir = tmpDir('cw-fs-');
  const bodies = Array.from({ length: n }, () => randomBody(rng));
  writeTree(dir, { 'src.js': bodies.join('\n') });
  const nodes = bodies.map((b, i) => ({ id: `src.js:f${i}`, label: `f${i}`, kind: 'function', file: 'src.js', line: i + 1, loc: 1, exports: false, domain: 'd' }));
  const graph = { meta: { root: dir.replace(/\\/g, '/'), target: 'fx' }, nodes, edges: [], domains: [], overlaps: [] };
  writeTree(dir, { 'graph.json': JSON.stringify(graph) });
  return { dir, bodies, graphPath: join(dir, 'graph.json') };
}
const expectedMatches = (cand, bodies, ids, k) => {
  const cs = oracleShingles(cand);
  return bodies.map((b, i) => ({ id: ids[i], sim: oracleJaccard(cs, oracleShingles(b)) }))
    .filter((e) => e.sim >= 0.15)
    .sort((a, b) => b.sim - a.sim || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, k);
};
const round = (x) => Math.round(x * 1e6) / 1e6;

// ★ANTI-CHEAT · FS-ORACLE — over randomized bodies, every reported sim equals the independent
// jaccard, AND the ranking matches. An implementation cannot fit this.
test('FS-ORACLE: reported sims + ranking match the independent shingler over random bodies (40 cases)', () => {
  const rng = prng(0xF1A11);
  for (let c = 0; c < 40; c++) {
    const ids = Array.from({ length: int(rng, 4, 9) }, (_, i) => `src.js:f${i}`);
    const { dir, bodies, graphPath } = makeFixture(rng, ids.length);
    try {
      const cand = randomBody(rng);
      const candPath = join(dir, 'cand.txt'); writeFileSync(candPath, cand);
      const K = 50;
      const r = runNode(FS, [graphPath, '--body', candPath, '--k', String(K), '--json']);
      assert.equal(r.status, 0, r.stderr);
      const out = JSON.parse(r.stdout);
      const exp = expectedMatches(cand, bodies, ids, K);
      assert.deepEqual(out.matches.map((m) => m.id), exp.map((e) => e.id), `ranking mismatch (case ${c})`);
      for (let i = 0; i < exp.length; i++) {
        assert.equal(round(out.matches[i].sim), round(exp[i].sim), `sim mismatch ${exp[i].id}`);
        assert.equal(out.matches[i].tier, tierOf(exp[i].sim), `tier mismatch ${exp[i].id}`);
      }
    } finally { cleanup(dir); }
  }
});

// FS-DOGFOOD — lock the lifted shingler's output so a future tokenizer change to lib/shingles.mjs
// (which also drives overlap.mjs) fails a clearly-named test instead of silently shifting detection.
test('FS-DOGFOOD: the shared shingler is byte-stable (keywords + strings/comments handled)', () => {
  assert.deepEqual(tokenize('alpha beta gamma'), ['alpha', 'beta', 'gamma']);
  assert.deepEqual(tokenize('const x = 1; // gone'), ['x', '=', ';']);          // 'const' is a KW, '1' is not an identifier, comment stripped
  assert.deepEqual(tokenize('return foo("hi")'), ['foo', '(', 'str', ')']);     // 'return' KW dropped; string -> STR placeholder
  assert.deepEqual([...shingles('alpha beta gamma delta')], ['alpha beta gamma', 'beta gamma delta']);
  assert.equal(jaccard(shingles('alpha beta gamma'), shingles('alpha beta gamma')), 1);
  assert.equal(jaccard(shingles('alpha beta gamma'), shingles('x y z')), 0);
  assert.equal(jaccard(shingles('a b c d'), shingles('a b c')), 0.5);
});

// FS-SELF — an exact body fed back must self-match at sim 1.0, ranked first.
test('FS-SELF: an exact-body candidate self-matches at sim 1.0, ranked first', () => {
  const rng = prng(0x5E1F);
  const { dir, bodies, graphPath } = makeFixture(rng, 6);
  try {
    const i = 2;
    const candPath = join(dir, 'cand.txt'); writeFileSync(candPath, bodies[i]);
    const r = runNode(FS, [graphPath, '--body', candPath, '--json']);
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.ok(out.matches.length >= 1);
    assert.equal(out.matches[0].id, `src.js:f${i}`);
    assert.equal(round(out.matches[0].sim), 1, 'self-similarity must be exactly 1.0');
    assert.equal(out.matches[0].tier, 'high');
  } finally { cleanup(dir); }
});

// FS-NEGATIVE — nothing below 0.15 is ever reported (exclusion, not just clearing the bar).
test('FS-NEGATIVE: no reported match has sim < 0.15', () => {
  const rng = prng(0x4E64);
  for (let c = 0; c < 20; c++) {
    const { dir, graphPath } = makeFixture(rng, int(rng, 4, 9));
    try {
      const candPath = join(dir, 'cand.txt'); writeFileSync(candPath, randomBody(rng));
      const out = JSON.parse(runNode(FS, [graphPath, '--body', candPath, '--json']).stdout);
      for (const m of out.matches) assert.ok(m.sim >= 0.15, `leaked low-sim match ${m.id}=${m.sim}`);
    } finally { cleanup(dir); }
  }
});

// FS-BOUNDED-K — at most K results, and they are the top K by the oracle ranking.
test('FS-BOUNDED-K: --k truncates to the top-K', () => {
  const rng = prng(0xB0B); // large fixture so >K survive
  const { dir, bodies, graphPath } = makeFixture(rng, 12);
  try {
    const cand = bodies[0]; // guarantees several non-trivial matches share vocabulary
    const candPath = join(dir, 'cand.txt'); writeFileSync(candPath, cand);
    const K = 3;
    const out = JSON.parse(runNode(FS, [graphPath, '--body', candPath, '--k', String(K), '--json']).stdout);
    assert.ok(out.matches.length <= K);
    const ids = Array.from({ length: 12 }, (_, i) => `src.js:f${i}`);
    assert.deepEqual(out.matches.map((m) => m.id), expectedMatches(cand, bodies, ids, K).map((e) => e.id));
  } finally { cleanup(dir); }
});

// API F3 (behavior bug fix) — `count` was the POST-cap length (top.length after slice(0, k)),
// contradicting the fleet-wide "count is the true total" contract; the real total was discarded
// and the cut was invisible. count is now the pre-cap total; `more` names the capped remainder.
test('FS-TRUE-TOTAL: count is the pre-cap match total; more.remaining marks the k-cap', () => {
  // Constructed fixture: candidate == body 0, so f0/f1 self-match at 1.0 and f2/f3 share the
  // 'alpha beta gamma' shingle (J = 1/3 >= 0.15) — exactly 4 matches, verified by the oracle.
  const dir = tmpDir('cw-fs-tt-');
  try {
    const bodies = [
      'alpha beta gamma delta',
      'alpha beta gamma delta',
      'alpha beta gamma epsilon',
      'beta gamma delta epsilon zeta',
      'zeta eta theta zeta eta theta',
    ];
    writeTree(dir, { 'src.js': bodies.join('\n') });
    const nodes = bodies.map((b, i) => ({ id: `src.js:f${i}`, label: `f${i}`, kind: 'function', file: 'src.js', line: i + 1, loc: 1, exports: false, domain: 'd' }));
    const graphPath = join(dir, 'graph.json');
    writeTree(dir, { 'graph.json': JSON.stringify({ meta: { root: dir.replace(/\\/g, '/'), target: 'fx' }, nodes, edges: [], domains: [], overlaps: [] }) });
    const cand = bodies[0];
    const candPath = join(dir, 'cand.txt'); writeFileSync(candPath, cand);
    const ids = bodies.map((_, i) => `src.js:f${i}`);
    const all = expectedMatches(cand, bodies, ids, Infinity);
    assert.ok(all.length >= 2, `fixture yields multiple matches (got ${all.length})`);
    const K = all.length - 1; // force a cap
    const out = JSON.parse(runNode(FS, [graphPath, '--body', candPath, '--k', String(K), '--json']).stdout);
    assert.equal(out.count, all.length, 'count is the TRUE total, not the capped length');
    assert.equal(out.matches.length, K);
    assert.deepEqual(out.more, { remaining: all.length - K }, 'the cap is visible');
    const uncapped = JSON.parse(runNode(FS, [graphPath, '--body', candPath, '--k', '999', '--json']).stdout);
    assert.equal(uncapped.count, all.length);
    assert.equal(uncapped.more, undefined, 'no cap, no more');
  } finally { cleanup(dir); }
});

// FS-DETERMINISTIC — identical inputs → identical stdout.
test('FS-DETERMINISTIC: identical inputs → identical stdout', () => {
  const rng = prng(0xD17);
  const { dir, bodies, graphPath } = makeFixture(rng, 7);
  try {
    const candPath = join(dir, 'cand.txt'); writeFileSync(candPath, bodies[1] + ' alpha beta');
    const a = runNode(FS, [graphPath, '--body', candPath, '--json']).stdout;
    const b = runNode(FS, [graphPath, '--body', candPath, '--json']).stdout;
    assert.equal(a, b);
  } finally { cleanup(dir); }
});

// SC3 — source absent → exit 2 with a reason (never a silent empty).
test('SC3: missing meta.root → exit 2 with an explicit reason', () => {
  const dir = tmpDir('cw-fs-nr-');
  try {
    const graph = { meta: { root: join(dir, 'does-not-exist') }, nodes: [], edges: [], domains: [], overlaps: [] };
    writeTree(dir, { 'graph.json': JSON.stringify(graph), 'cand.txt': 'alpha beta gamma' });
    const r = runNode(FS, [join(dir, 'graph.json'), '--body', join(dir, 'cand.txt'), '--json']);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /source|root/i);
  } finally { cleanup(dir); }
});

// SC3 — no candidate input → usage exit 2.
test('usage: no --body/--stdin/--signature → exit 2', () => {
  const dir = tmpDir('cw-fs-u-');
  try {
    const graph = { meta: { root: dir.replace(/\\/g, '/') }, nodes: [], edges: [], domains: [], overlaps: [] };
    writeTree(dir, { 'graph.json': JSON.stringify(graph) });
    assert.equal(runNode(FS, [join(dir, 'graph.json'), '--json']).status, 2);
  } finally { cleanup(dir); }
});

// Perf-quality finding 16 — the map-time sidecar path must be byte-identical to the live path.
// build-report writes similar-index.json beside the graph; find-similar serves from it (payload
// says index:"sidecar"), and deleting or staling it falls back to live with identical matches.
test('FS-SIDECAR: sidecar path == live path byte-for-byte; stale sidecar falls back', async () => {
  const { rmSync, utimesSync, statSync } = await import('node:fs');
  const rng = prng(0xF16);
  const { dir, bodies, graphPath } = makeFixture(rng, 24);
  try {
    const candFile = join(dir, 'cand.txt');
    writeFileSync(candFile, bodies[3] + ' ' + bodies[7]);
    // no sidecar yet -> live
    const live = JSON.parse(runNode(FS, [graphPath, '--body', candFile, '--json']).stdout);
    assert.equal(live.index, 'live');
    // build-report writes the sidecar
    const br = runNode(script('build-report.mjs'), [graphPath, '--no-md']);
    assert.equal(br.status, 0, br.stderr);
    const withSidecar = JSON.parse(runNode(FS, [graphPath, '--body', candFile, '--json']).stdout);
    assert.equal(withSidecar.index, 'sidecar', 'sidecar detected and used');
    assert.deepEqual(withSidecar.matches, live.matches, 'matches byte-identical across paths');
    assert.equal(withSidecar.scanned, live.scanned, 'scanned identical');
    // stale sidecar (graph touched) -> live fallback, same answers
    const st = statSync(graphPath);
    utimesSync(graphPath, new Date(st.atimeMs + 2000), new Date(st.mtimeMs + 2000));
    const stale = JSON.parse(runNode(FS, [graphPath, '--body', candFile, '--json']).stdout);
    assert.equal(stale.index, 'live', 'stamp mismatch falls back to live');
    assert.deepEqual(stale.matches, live.matches);
    // removed sidecar -> live
    rmSync(join(dir, 'similar-index.json'), { force: true });
    const gone = JSON.parse(runNode(FS, [graphPath, '--body', candFile, '--json']).stdout);
    assert.equal(gone.index, 'live');
    assert.deepEqual(gone.matches, live.matches);
  } finally { cleanup(dir); }
});
