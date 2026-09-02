// The VS Code lens must show the SAME numbers the MCP tools serve: callers = reverse `call`
// edges, blast = the codeweb_impact closure (transitive callers + subclasses, seed excluded).
// The logic is pure (editor/vscode-codeweb/lens-core.js, no vscode API), so it pins directly.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { PLUGIN_ROOT } from './helpers.mjs';
import lensCore from '../editor/vscode-codeweb/lens-core.js';

const { buildLensIndex, blastOf, lensesForFile } = lensCore;

// deterministic LCG — no Math.random in the property tests (mirrors the sim determinism invariant)
function lcg(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32; }

const GRAPH = {
  meta: { root: '/repo' },
  nodes: [
    { id: 'a.js:hub', label: 'hub', kind: 'function', file: 'a.js', line: 3 },
    { id: 'a.js:helper', label: 'helper', kind: 'function', file: 'a.js', line: 10 },
    { id: 'a.js:<module>', label: '<module>', kind: 'module', file: 'a.js', line: 1 },
    { id: 'b.js:caller1', label: 'caller1', kind: 'function', file: 'b.js', line: 1 },
    { id: 'd.js:top', label: 'top', kind: 'function', file: 'd.js', line: 1 },
    { id: 'c.js:Base', label: 'Base', kind: 'class', file: 'c.js', line: 2 },
    { id: 'c.js:Sub', label: 'Sub', kind: 'class', file: 'c.js', line: 9 },
  ],
  edges: [
    { from: 'b.js:caller1', to: 'a.js:hub', kind: 'call' },
    { from: 'a.js:helper', to: 'a.js:hub', kind: 'call' },
    { from: 'd.js:top', to: 'b.js:caller1', kind: 'call' },
    { from: 'c.js:Sub', to: 'c.js:Base', kind: 'inherit' },
    { from: 'a.js:<module>', to: 'a.js:hub', kind: 'import' }, // import edges are NOT callers
  ],
};

test('lens-core: callers count reverse call edges only; blast is the impact closure', () => {
  const ix = buildLensIndex(GRAPH);
  const lenses = lensesForFile(ix, 'a.js');
  assert.deepEqual(lenses.map((l) => l.label), ['hub', 'helper'], 'line-sorted, module node excluded');
  const hub = lenses[0];
  assert.equal(hub.line, 3);
  assert.equal(hub.callers, 2, 'two direct call edges (the import edge does not count)');
  assert.equal(hub.blast, 3, 'transitive: caller1, helper, and top (who calls caller1)');
  assert.equal(lenses[1].callers, 0, 'helper has no callers but still gets a lens at minCallers 0');
});

test('lens-core: inherit edges make subclasses part of the blast', () => {
  const ix = buildLensIndex(GRAPH);
  assert.equal(blastOf(ix, 'c.js:Base'), 1, 'changing Base reaches Sub');
  assert.equal(blastOf(ix, 'c.js:Sub'), 0);
});

test('lens-core: minCallers hides sub-threshold symbols; unknown file yields no lenses', () => {
  const ix = buildLensIndex(GRAPH);
  assert.deepEqual(lensesForFile(ix, 'a.js', { minCallers: 1 }).map((l) => l.label), ['hub']);
  assert.deepEqual(lensesForFile(ix, 'nope.js'), []);
  assert.equal(ix.root, '/repo', 'root comes from graph.meta.root');
});

// finding #38: blastOf mirrors graph-ops's impactCountOf shape. A SOURCE guard pins the fix
// deterministically — the old O(frontier²) `queue.shift()` and the per-visit `[...callIn, ...inheritIn]`
// spread merge are gone, and the index-pointer walk is present. (The exact numbers stay pinned by the
// semantics tests above; this guards the SHAPE so a future edit can't quietly reintroduce the cost.)
test('lens-core: blastOf uses the pointer-index walk, not shift()/spread-merge (#38 shape)', () => {
  const src = readFileSync(join(PLUGIN_ROOT, 'editor', 'vscode-codeweb', 'lens-core.js'), 'utf8');
  const blast = src.slice(src.indexOf('function blastOf'), src.indexOf('function forwardAdj'));
  assert.ok(!/\.shift\s*\(/.test(blast), 'blastOf must not call queue.shift() (O(frontier) per pop)');
  assert.ok(!/\[\s*\.\.\.\s*\(?\s*index\.callIn/.test(blast), 'blastOf must not spread-merge callIn/inheritIn per visit');
  assert.ok(/for \(let i = 0; i < queue\.length; i\+\+\)/.test(blast), 'blastOf uses the index-pointer queue');
});

// finding #38 budget: the full-file lens pass must scale ~linearly — not the super-linear blow-up
// the shift() walk risked. Factor-based (CI noise on ubuntu 8 / windows 11 can't flap it), via
// SCALE DOUBLING: the pass at 2N over the pass at N. Linear ⇒ ≈2×; a quadratic regression ⇒ ≈4×.
// (Doubling is used instead of pass÷index-build because the build is a few ms — too small and
// GC/JIT-jittery to be a stable divisor; the doubling ratio cancels machine speed and is intrinsic
// to the algorithm.) Bounded-depth segments keep per-symbol blast bounded so linear is the target.
//
// The estimator is BEST-of-N, not median-of-N. Preemption on a shared runner can only ever ADD
// time to a sample, so the fastest observed pass is the closest estimate of the algorithm's real
// cost and the noise is one-sided. A median still carries that noise whenever half the samples are
// disturbed, which is how a genuinely linear pass measured 3.40× on ubuntu (43.8ms vs 12.9ms) and
// reddened ci.yml while check.yml stayed green. Simulated over 200 trials with a third of samples
// stalled 3×, best-of-9 never exceeded the 3.3× budget on a linear pass and exceeded it on every
// quadratic one — a median-of-9 falsely failed 37/200 linear trials. The budget itself is
// UNCHANGED: this fixes the estimator, it does not widen the promise.
test('lens-core: full-file pass scales ~linearly (2N pass ≈ 2× the N pass) (#38)', () => {
  const SEG = 16;
  const mk = (N) => {
    const nodes = [], edges = [];
    for (let i = 0; i < N; i++) {
      nodes.push({ id: 'f' + i, label: 'f' + i, kind: 'function', file: 'big.js', line: i + 1 });
      if (i % SEG !== 0) edges.push({ from: 'f' + i, to: 'f' + (i - 1), kind: 'call' });
    }
    return { meta: { root: '/r' }, nodes, edges };
  };
  const gN = mk(15000), g2N = mk(30000);
  const passMs = (g) => { const ix = buildLensIndex(g); const t = performance.now(); const L = lensesForFile(ix, 'big.js'); return [performance.now() - t, L.length]; };
  for (let w = 0; w < 3; w++) { passMs(gN); passMs(g2N); } // JIT warmup
  const pN = [], p2 = [];
  for (let r = 0; r < 9; r++) {
    const [a, la] = passMs(gN); pN.push(a); assert.equal(la, 15000, 'N pass lenses every symbol');
    const [b, lb] = passMs(g2N); p2.push(b); assert.equal(lb, 30000, '2N pass lenses every symbol');
  }
  const best = (xs) => Math.min(...xs);
  const ratio = best(p2) / best(pN);
  // measured ≈2.0–2.3× locally; ≤3.3 clears linear+noise while still failing a ~4× quadratic pass.
  assert.ok(ratio <= 3.3, `2N pass ${best(p2).toFixed(1)}ms was ${ratio.toFixed(2)}× the ${best(pN).toFixed(1)}ms N pass (linear budget 3.3×; quadratic would be ~4×)`);
});

// The de-flake above is only sound if the budget still CATCHES the regression it exists for. A
// timing test that cannot fail is worse than no test: it reports green forever. This runs the same
// best-of-9 estimator over a deliberately quadratic pass built from the same lens index, and
// asserts it breaches 3.3× — so the estimator change cannot quietly turn finding #38's gate off.
test('lens-core: the linear-scaling estimator still fails a quadratic pass (#38 able-to-fail)', () => {
  const mkNodes = (N) => {
    const nodes = [];
    for (let i = 0; i < N; i++) nodes.push({ id: 'f' + i, label: 'f' + i, kind: 'function', file: 'big.js', line: i + 1 });
    return { meta: { root: '/r' }, nodes, edges: [] };
  };
  // A quadratic stand-in for a regressed pass: every symbol scans every symbol once.
  const quadraticPassMs = (g) => {
    const ix = buildLensIndex(g);
    const ids = ix.byFile ? Object.keys(g.nodes) : g.nodes.map((n) => n.id);
    const t = performance.now();
    let acc = 0;
    for (let i = 0; i < ids.length; i++) for (let j = 0; j < ids.length; j++) acc += (i ^ j) & 1;
    return [performance.now() - t, acc];
  };
  const gN = mkNodes(3000), g2N = mkNodes(6000);
  for (let w = 0; w < 2; w++) { quadraticPassMs(gN); quadraticPassMs(g2N); }
  const pN = [], p2 = [];
  for (let r = 0; r < 9; r++) { pN.push(quadraticPassMs(gN)[0]); p2.push(quadraticPassMs(g2N)[0]); }
  const best = (xs) => Math.min(...xs);
  const ratio = best(p2) / best(pN);
  assert.ok(ratio > 3.3, `a quadratic pass must breach the 3.3x budget, but measured ${ratio.toFixed(2)}x — the gate can no longer fail`);
});

// finding #38: blastMemo persists across refreshes. buildLensIndex(graph, prevIndex) carries the
// memo entries whose blast provably cannot have moved (id ∉ forward-closure of the edge delta's
// `to` seeds, and id still exists). The property: for randomized graph pairs — mutate 1–5 edges AND
// add/remove NODES with their edges — the carried index returns the SAME blast as a cold rebuild for
// every surviving id. A stale carry (unsound invalidation) fails here.
test('lens-core: memo carry === cold rebuild for every id across randomized edge+node mutations (#38)', () => {
  const N = 40;
  for (let trial = 0; trial < 250; trial++) {
    const rnd = lcg(0xC0DE + trial);
    // build a random graph with cycles (stresses the closure soundness)
    const g1 = { meta: { root: '/r' }, nodes: [], edges: [] };
    for (let i = 0; i < N; i++) g1.nodes.push({ id: 'n' + i, label: 'n' + i, kind: 'function', file: 'f' + (i % 5) + '.js', line: i + 1 });
    for (let k = 0; k < N * 2; k++) {
      const a = Math.floor(rnd() * N), b = Math.floor(rnd() * N);
      if (a !== b) g1.edges.push({ from: 'n' + a, to: 'n' + b, kind: rnd() < 0.85 ? 'call' : 'inherit' });
    }
    const prev = buildLensIndex(g1);
    for (const n of g1.nodes) blastOf(prev, n.id); // warm every memo entry so there is something to carry

    // mutate: 1–5 edge add/removes, then add OR remove a node with its edges
    const g2 = { meta: g1.meta, nodes: g1.nodes.map((n) => ({ ...n })), edges: g1.edges.map((e) => ({ ...e })) };
    const nMut = 1 + Math.floor(rnd() * 5);
    for (let k = 0; k < nMut; k++) {
      if (rnd() < 0.5 && g2.edges.length) g2.edges.splice(Math.floor(rnd() * g2.edges.length), 1);
      else { const a = Math.floor(rnd() * g2.nodes.length), b = Math.floor(rnd() * g2.nodes.length); if (a !== b) g2.edges.push({ from: g2.nodes[a].id, to: g2.nodes[b].id, kind: rnd() < 0.85 ? 'call' : 'inherit' }); }
    }
    if (rnd() < 0.5) {
      const id = 'add' + trial;
      g2.nodes.push({ id, label: id, kind: 'function', file: 'f0.js', line: 900 });
      const t = g2.nodes[Math.floor(rnd() * g2.nodes.length)].id;
      g2.edges.push({ from: id, to: t, kind: 'call' }, { from: t, to: id, kind: rnd() < 0.5 ? 'call' : 'inherit' });
    } else {
      const victim = g2.nodes[Math.floor(rnd() * g2.nodes.length)].id;
      g2.nodes = g2.nodes.filter((n) => n.id !== victim);
      g2.edges = g2.edges.filter((e) => e.from !== victim && e.to !== victim);
    }

    const carried = buildLensIndex(g2, prev);
    const cold = buildLensIndex(g2);
    for (const n of g2.nodes) assert.equal(blastOf(carried, n.id), blastOf(cold, n.id), `trial ${trial}, id ${n.id}: carried blast must equal cold`);
  }
});

// finding #38: the carry actually REUSES memo (does not silently recompute everything). Seed the
// previous memo with a poison value for an untouched id and for an affected id; after the rebuild the
// untouched id keeps its poison (carried, not recomputed) while the affected id is recomputed correct.
test('lens-core: memo carry reuses untouched ids and drops affected ones (#38 counting)', () => {
  // two disjoint components: A-chain (touched) and B-chain (untouched)
  const g1 = {
    meta: { root: '/r' },
    nodes: ['a0', 'a1', 'a2', 'b0', 'b1', 'b2'].map((id, i) => ({ id, label: id, kind: 'function', file: id[0] + '.js', line: i + 1 })),
    edges: [
      { from: 'a1', to: 'a0', kind: 'call' }, { from: 'a2', to: 'a1', kind: 'call' }, // a0 blast reaches a1,a2
      { from: 'b1', to: 'b0', kind: 'call' }, { from: 'b2', to: 'b1', kind: 'call' },
    ],
  };
  const prev = buildLensIndex(g1);
  for (const n of g1.nodes) blastOf(prev, n.id);
  // poison the memo so a carried value is detectable
  prev.blastMemo.set('b0', 999); // untouched → must survive the carry
  prev.blastMemo.set('a0', 999); // affected by the A-edge change → must be dropped + recomputed

  // mutate only the A component: add a new caller of a2 (changes a0/a1/a2's forward-reachers)
  const g2 = { meta: g1.meta, nodes: [...g1.nodes.map((n) => ({ ...n })), { id: 'a3', label: 'a3', kind: 'function', file: 'a.js', line: 9 }],
    edges: [...g1.edges.map((e) => ({ ...e })), { from: 'a3', to: 'a2', kind: 'call' }] };
  const carried = buildLensIndex(g2, prev);

  assert.equal(carried.blastMemo.get('b0'), 999, 'untouched b0 memo carried verbatim (not recomputed)');
  assert.ok(!carried.blastMemo.has('a0'), 'affected a0 memo dropped from the carry');
  assert.equal(blastOf(carried, 'a0'), 3, 'a0 recomputed: now reached by a1,a2,a3');
  assert.equal(blastOf(carried, 'b0'), 999, 'b0 still returns the carried (poisoned) value — proof of reuse');
});

// #7 (IMPROVEMENTS.md): the extension's manifest + wiring stay truthful — all 13 native
// languages get lenses, the graph is WATCHED (the README's re-read promise), and a manual
// refresh command exists. String-level pins (the vscode API itself isn't available here).
//
// The selector is keyed by VS CODE language id, not by codeweb's `langOf` name, and the two
// vocabularies differ where the editor splits or renames a language: `csharp` (codeweb: csharp,
// but `cpp` is the id for C++ files whichever extension they carry), and the JSX/TSX ids that
// codeweb folds into javascript/typescript. LANG_IDS is therefore the explicit mapping from the
// canonical product.json list to the ids VS Code will actually hand the provider — the count
// assertion below binds it to that list so a fourteenth language cannot ship unlensed.
const LANG_IDS = {
  JavaScript: ['javascript', 'javascriptreact'],
  TypeScript: ['typescript', 'typescriptreact'],
  Python: ['python'],
  Rust: ['rust'],
  Go: ['go'],
  Java: ['java'],
  'C#': ['csharp'],
  Ruby: ['ruby'],
  PHP: ['php'],
  Kotlin: ['kotlin'],
  Swift: ['swift'],
  C: ['c'],
  'C++': ['cpp'],
};

test('extension: selector covers all 13 native languages and wires the watcher + refresh', () => {
  const src = readFileSync(join(PLUGIN_ROOT, 'editor', 'vscode-codeweb', 'extension.js'), 'utf8');
  const languages = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'site', 'data', 'product.json'), 'utf8')).languages;
  assert.equal(languages.length, 13, 'the canonical list is thirteen languages');
  assert.deepEqual(Object.keys(LANG_IDS).sort(), [...languages].sort(),
    'every canonical language needs its VS Code id(s) mapped here');
  // The selector literal itself, so an id that exists elsewhere in the file (a comment, a helper)
  // cannot pass for a registered one.
  const selector = src.slice(src.indexOf('const selector ='), src.indexOf('.map((language)'));
  for (const [lang, ids] of Object.entries(LANG_IDS)) {
    for (const id of ids) assert.ok(selector.includes(`'${id}'`), `selector includes ${id} (${lang})`);
  }
  const declared = [...selector.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
  assert.deepEqual(declared, Object.values(LANG_IDS).flat(),
    'the selector lists exactly the mapped ids, in canonical order — no extras, no omissions');
  assert.ok(src.includes('onDidChangeCodeLenses'), 'provider exposes the change event');
  assert.ok(src.includes("createFileSystemWatcher('**/.codeweb/graph.json')"), 'graph watcher exists');
  assert.ok(src.includes('codeweb.refreshLenses'), 'manual refresh command registered');
  const pkg = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'editor', 'vscode-codeweb', 'package.json'), 'utf8'));
  assert.ok(pkg.contributes.commands.some((c) => c.command === 'codeweb.refreshLenses'), 'command in the manifest');
  assert.ok(pkg.version !== '0.1.0', 'version bumped past 0.1.0');
});

// finding #38: the extension must not eagerly activate on every window. activationEvents narrows to
// workspaces that actually contain a codeweb graph (workspaceContains), with the two commands as an
// explicit fallback so the palette still works in a workspace the glob never matched (^1.85
// auto-derives onCommand, but the finding keeps them explicit). No onStartupFinished.
test('extension: activation is graph-gated (workspaceContains) with onCommand fallbacks, no onStartupFinished (#38)', () => {
  const pkg = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'editor', 'vscode-codeweb', 'package.json'), 'utf8'));
  const ev = pkg.activationEvents;
  assert.ok(Array.isArray(ev), 'activationEvents is an array');
  assert.ok(ev.includes('workspaceContains:**/.codeweb/graph.json'), 'activates only when a codeweb graph is present');
  assert.ok(ev.includes('onCommand:codeweb.refreshLenses'), 'refresh command is an explicit activation fallback');
  assert.ok(ev.includes('onCommand:codeweb.openReport'), 'openReport command is an explicit activation fallback');
  assert.ok(!ev.includes('onStartupFinished'), 'no eager startup activation');
  // refresh() no longer clears the cache — that would throw away the carried blastMemo every save.
  const src = readFileSync(join(PLUGIN_ROOT, 'editor', 'vscode-codeweb', 'extension.js'), 'utf8');
  assert.ok(!/refresh\(\)\s*\{[^}]*graphCache\.clear\(\)/.test(src), 'refresh() must not clear graphCache (memo persistence)');
  assert.ok(/buildLensIndex\(JSON\.parse[\s\S]{0,80}hit && hit\.index\)/.test(src), 'loadIndex hands the previous index to buildLensIndex');
});
