// F8 — consolidation codemod. Tests first. ★ANTI-CHEAT CM-GATE-AGREE pins plan.projectedGate to the
// trusted structuralRegressions(before, applyEdit(merge)) oracle (the same one simulate-edit uses).
// Deletions/rewrites are checked against independent graph/edge oracles. --write is gated + reversible:
// a predicted-regression --write touches nothing (CM-WRITE-REVERSIBLE); a safe same-file merge applies
// (CM-WRITE-SUCCESS). Plan-only is pure (CM-PLAN-PURE).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, script, tmpDir, writeTree, cleanup } from './helpers.mjs';
import { prng, int } from './_proptest.mjs';
import { normalizeGraph, applyEdit, structuralRegressions } from '../scripts/lib/graph-ops.mjs';

const CODEMOD = script('codemod.mjs');
const sha = (s) => createHash('sha1').update(s).digest('hex');

function makeGraph(rng, n) {
  const files = ['a.js', 'b.js', 'c.js'];
  const nodes = Array.from({ length: n }, (_, i) => ({ id: `${files[i % files.length]}:s${i}`, label: `s${i}`, kind: 'function', file: files[i % files.length], line: i + 1, loc: int(rng, 1, 5), exports: true, domain: 'd' }));
  const ids = nodes.map((x) => x.id); const edges = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j && rng() < 0.16) edges.push({ from: ids[i], to: ids[j], kind: 'call' });
  return { meta: {}, nodes, edges, domains: [], overlaps: [] };
}
const write = (g) => { const dir = tmpDir('cw-cm-'); writeTree(dir, { 'graph.json': JSON.stringify(g) }); return { dir, graphPath: join(dir, 'graph.json') }; };

// ★ANTI-CHEAT · CM-GATE-AGREE (+ CM-DELETIONS-EXACT + CM-REWRITES-COVER)
test('CM-GATE-AGREE: plan.projectedGate == structuralRegressions(applyEdit(merge)); deletions/rewrites exact (30 cases)', () => {
  const rng = prng(0xC0DE3D);
  for (let c = 0; c < 30; c++) {
    const g = makeGraph(rng, int(rng, 5, 10));
    const ids = g.nodes.map((n) => n.id);
    const k = Math.min(int(rng, 2, 3), ids.length);
    const pickIds = [...ids].sort(() => 0).slice(0, k); // first k (deterministic)
    const into = pickIds[0];
    const { dir, graphPath } = write(g);
    try {
      const out = JSON.parse(runNode(CODEMOD, [graphPath, '--merge', pickIds.join(','), '--into', into, '--json']).stdout);
      // oracle gate
      const after = applyEdit(g, { kind: 'merge', ids: pickIds, into });
      const sr = structuralRegressions(g, after);
      const expGate = { newCycles: sr.newCycles, lostCallers: sr.lostCallers, ok: sr.newCycles.length === 0 && sr.lostCallers.length === 0 };
      assert.deepEqual(out.projectedGate, expGate, `case ${c}: gate`);
      // CM-DELETIONS-EXACT
      const losers = pickIds.filter((id) => id !== into);
      const byId = new Map(g.nodes.map((n) => [n.id, n]));
      const expDel = losers.map((id) => ({ id, file: byId.get(id).file, range: [byId.get(id).line, byId.get(id).line + (byId.get(id).loc || 1) - 1] }))
        .sort((a, b) => (a.id < b.id ? -1 : 1));
      assert.deepEqual(out.deletions.slice().sort((a, b) => (a.id < b.id ? -1 : 1)), expDel, `case ${c}: deletions`);
      // CM-REWRITES-COVER: rewrite caller-set == call-edge in-neighbors of losers
      const loserSet = new Set(losers);
      const expCallers = [...new Set(g.edges.filter((e) => e.kind === 'call' && loserSet.has(e.to)).map((e) => e.from))].sort();
      assert.deepEqual([...new Set(out.rewrites.map((r) => r.callerId))].sort(), expCallers, `case ${c}: rewrites`);
    } finally { cleanup(dir); }
  }
});

// CM-PLAN-PURE: plan-only never writes (graph file byte-identical).
test('CM-PLAN-PURE: a plan-only run leaves graph.json byte-identical', () => {
  const rng = prng(0x9019);
  const g = makeGraph(rng, 7);
  const { dir, graphPath } = write(g);
  try {
    const before = sha(readFileSync(graphPath, 'utf8'));
    const ids = g.nodes.slice(0, 2).map((n) => n.id);
    runNode(CODEMOD, [graphPath, '--merge', ids.join(','), '--into', ids[0], '--json']);
    assert.equal(sha(readFileSync(graphPath, 'utf8')), before);
  } finally { cleanup(dir); }
});

// CM-WRITE-REVERSIBLE: a merge the gate REJECTS (predicted new cycle) -> --write touches nothing.
test('CM-WRITE-REVERSIBLE: a predicted-regression --write leaves source byte-identical and exits 1', () => {
  const dir = tmpDir('cw-cm-rev-');
  try {
    // merging X(fa) and Y(fb) into X creates a new fa<->fb cycle (N->Y becomes N->X = fb->fa; X->M = fa->fb)
    writeTree(dir, {
      'fa.js': 'export function X() { return M(); }\nexport function P() { return 0; }',
      'fb.js': 'export function Y() { return 1; }\nexport function M() { return 2; }\nexport function N() { return Y(); }',
    });
    const g = {
      meta: { root: dir.replace(/\\/g, '/') }, domains: [], overlaps: [],
      nodes: [
        { id: 'fa.js:X', label: 'X', kind: 'function', file: 'fa.js', line: 1, loc: 1, exports: true, domain: 'd' },
        { id: 'fb.js:Y', label: 'Y', kind: 'function', file: 'fb.js', line: 1, loc: 1, exports: true, domain: 'd' },
        { id: 'fb.js:M', label: 'M', kind: 'function', file: 'fb.js', line: 2, loc: 1, exports: true, domain: 'd' },
        { id: 'fb.js:N', label: 'N', kind: 'function', file: 'fb.js', line: 3, loc: 1, exports: true, domain: 'd' },
      ],
      edges: [{ from: 'fa.js:X', to: 'fb.js:M', kind: 'call' }, { from: 'fb.js:N', to: 'fb.js:Y', kind: 'call' }],
    };
    const graphPath = join(dir, 'graph.json'); writeFileSync(graphPath, JSON.stringify(g));
    // confirm the gate really would reject (sanity on the fixture)
    const sr = structuralRegressions(g, applyEdit(g, { kind: 'merge', ids: ['fa.js:X', 'fb.js:Y'], into: 'fa.js:X' }));
    assert.ok(sr.newCycles.length >= 1, 'fixture must predict a new cycle');

    const faBefore = sha(readFileSync(join(dir, 'fa.js'), 'utf8'));
    const fbBefore = sha(readFileSync(join(dir, 'fb.js'), 'utf8'));
    const r = runNode(CODEMOD, [graphPath, '--merge', 'fa.js:X,fb.js:Y', '--into', 'fa.js:X', '--write']);
    assert.equal(r.status, 1, 'predicted-regression --write must exit 1');
    assert.equal(sha(readFileSync(join(dir, 'fa.js'), 'utf8')), faBefore, 'fa.js untouched');
    assert.equal(sha(readFileSync(join(dir, 'fb.js'), 'utf8')), fbBefore, 'fb.js untouched');
  } finally { cleanup(dir); }
});

// CM-INTO-RESOLVES (perf-quality finding 2a): an unresolvable or ambiguous --into is a hard exit 2
// BEFORE any write — pre-fix it was used verbatim, canonLabel became undefined, and --write deleted
// BOTH definitions while rewriting loser tokens to the literal text "undefined" (exit 0, applied).
test('CM-INTO-RESOLVES: unresolvable/ambiguous --into exits 2 and touches nothing, even with --write', () => {
  const dir = tmpDir('cw-cm-into-');
  try {
    writeTree(dir, { 'fa.js': 'export function keep() { return 1; }\nexport function dup() { return 1; }' });
    const g = {
      meta: { root: dir.replace(/\\/g, '/') }, domains: [], overlaps: [],
      nodes: [
        { id: 'fa.js:keep', label: 'keep', kind: 'function', file: 'fa.js', line: 1, loc: 1, exports: true, domain: 'd' },
        { id: 'fa.js:dup', label: 'dup', kind: 'function', file: 'fa.js', line: 2, loc: 1, exports: true, domain: 'd' },
      ],
      edges: [],
    };
    const graphPath = join(dir, 'graph.json'); writeFileSync(graphPath, JSON.stringify(g));
    const before = sha(readFileSync(join(dir, 'fa.js'), 'utf8'));
    // root-prefixed spelling of a real id — the reproduced corruption input
    const r = runNode(CODEMOD, [graphPath, '--merge', 'fa.js:keep,fa.js:dup', '--into', 'src/fa.js:keep', '--write']);
    assert.equal(r.status, 2, 'unresolvable --into must exit 2');
    assert.match(r.stderr, /--into does not resolve/);
    assert.equal(sha(readFileSync(join(dir, 'fa.js'), 'utf8')), before, 'source untouched');
  } finally { cleanup(dir); }
});

// CM-WRITE-STRING-GUARD (finding 2b): a loser label inside a string literal refuses the write —
// a name in a value can be load-bearing (dynamic dispatch, lookup keys); pre-fix the raw \b-token
// replace rewrote string contents silently.
test('CM-WRITE-STRING-GUARD: a loser label inside a string refuses --write and reverts byte-identically', () => {
  const dir = tmpDir('cw-cm-str-');
  try {
    writeTree(dir, {
      'sa.mjs':
        'export function fmtA(x) { return x; }\n' +
        'export function fmtB(x) { return x; }\n' +
        'export function log(x) { return "fmtA done" + fmtA(x); }\n',
    });
    const g = {
      meta: { root: dir.replace(/\\/g, '/') }, domains: [], overlaps: [],
      nodes: [
        { id: 'sa.mjs:fmtA', label: 'fmtA', kind: 'function', file: 'sa.mjs', line: 1, loc: 1, exports: true, domain: 'd' },
        { id: 'sa.mjs:fmtB', label: 'fmtB', kind: 'function', file: 'sa.mjs', line: 2, loc: 1, exports: true, domain: 'd' },
        { id: 'sa.mjs:log', label: 'log', kind: 'function', file: 'sa.mjs', line: 3, loc: 1, exports: true, domain: 'd' },
      ],
      edges: [{ from: 'sa.mjs:log', to: 'sa.mjs:fmtA', kind: 'call' }],
    };
    const graphPath = join(dir, 'graph.json'); writeFileSync(graphPath, JSON.stringify(g));
    const before = sha(readFileSync(join(dir, 'sa.mjs'), 'utf8'));
    const r = runNode(CODEMOD, [graphPath, '--merge', 'sa.mjs:fmtA,sa.mjs:fmtB', '--into', 'sa.mjs:fmtB', '--write', '--json']);
    assert.equal(r.status, 2, `string-guard --write must exit 2:\n${r.stdout}\n${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.write.applied, false);
    assert.match(out.write.reason, /string\/regex literal/);
    assert.equal(sha(readFileSync(join(dir, 'sa.mjs'), 'utf8')), before, 'source reverted byte-identically');
  } finally { cleanup(dir); }
});

// CM-WRITE-COMMENT-OK (finding 2b): a loser label inside a comment does NOT block the write; the
// stale prose is left alone and counted in the result.
test('CM-WRITE-COMMENT-OK: a comment mention is skipped (and counted), live code is rewritten', () => {
  const dir = tmpDir('cw-cm-cmt-');
  try {
    writeTree(dir, {
      'ca.mjs':
        'export function oldF(x) { return x; }\n' +
        'export function newF(x) { return x; }\n' +
        '// oldF is deprecated\n' +
        'export function use2(x) { return oldF(x); }\n',
    });
    const g = {
      meta: { root: dir.replace(/\\/g, '/') }, domains: [], overlaps: [],
      nodes: [
        { id: 'ca.mjs:oldF', label: 'oldF', kind: 'function', file: 'ca.mjs', line: 1, loc: 1, exports: true, domain: 'd' },
        { id: 'ca.mjs:newF', label: 'newF', kind: 'function', file: 'ca.mjs', line: 2, loc: 1, exports: true, domain: 'd' },
        { id: 'ca.mjs:use2', label: 'use2', kind: 'function', file: 'ca.mjs', line: 4, loc: 1, exports: true, domain: 'd' },
      ],
      edges: [{ from: 'ca.mjs:use2', to: 'ca.mjs:oldF', kind: 'call' }],
    };
    const graphPath = join(dir, 'graph.json'); writeFileSync(graphPath, JSON.stringify(g));
    const r = runNode(CODEMOD, [graphPath, '--merge', 'ca.mjs:oldF,ca.mjs:newF', '--into', 'ca.mjs:newF', '--write', '--json']);
    assert.equal(r.status, 0, `comment-mention --write should succeed:\n${r.stdout}\n${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.write.applied, true);
    assert.ok(out.write.commentMentions >= 1, 'the comment mention is counted');
    const src = readFileSync(join(dir, 'ca.mjs'), 'utf8');
    assert.ok(src.includes('// oldF is deprecated'), 'comment text left alone');
    assert.ok(/return newF\(x\)/.test(src), 'live call rewritten');
    assert.ok(!/function oldF\b/.test(src), 'loser definition removed');
  } finally { cleanup(dir); }
});

// CM-IMPORT-REPOINT (finding 2c): after a cross-file merge, an import that named the loser is
// repointed at the canonical's file — pre-fix `import { canon } from './loser.mjs'` survived
// (valid-looking, broken at runtime, invisible to the structural gate).
test('CM-IMPORT-REPOINT: a consumer importing the loser ends up importing the canonical from its real file', () => {
  const dir = tmpDir('cw-cm-imp-');
  try {
    writeTree(dir, {
      'dup1.mjs': 'export function fmtMoney(x) { return x; }\n',
      'dup2.mjs': 'export function formatMoney(x) { return x; }\n',
      'use.mjs': "import { fmtMoney } from './dup1.mjs';\nexport function total(x) { return fmtMoney(x); }\n",
    });
    const g = {
      meta: { root: dir.replace(/\\/g, '/') }, domains: [], overlaps: [],
      nodes: [
        { id: 'dup1.mjs:fmtMoney', label: 'fmtMoney', kind: 'function', file: 'dup1.mjs', line: 1, loc: 1, exports: true, domain: 'd' },
        { id: 'dup2.mjs:formatMoney', label: 'formatMoney', kind: 'function', file: 'dup2.mjs', line: 1, loc: 1, exports: true, domain: 'd' },
        { id: 'use.mjs:total', label: 'total', kind: 'function', file: 'use.mjs', line: 2, loc: 1, exports: true, domain: 'd' },
      ],
      edges: [{ from: 'use.mjs:total', to: 'dup1.mjs:fmtMoney', kind: 'call' }],
    };
    const graphPath = join(dir, 'graph.json'); writeFileSync(graphPath, JSON.stringify(g));
    const r = runNode(CODEMOD, [graphPath, '--merge', 'dup1.mjs:fmtMoney,dup2.mjs:formatMoney', '--into', 'dup2.mjs:formatMoney', '--write', '--json']);
    assert.equal(r.status, 0, `cross-file --write should succeed:\n${r.stdout}\n${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.write.applied, true);
    const use = readFileSync(join(dir, 'use.mjs'), 'utf8');
    assert.match(use, /import \{ formatMoney \} from '\.\/dup2\.mjs'/, 'import repointed to the canonical file');
    assert.match(use, /return formatMoney\(x\)/, 'call site rewritten');
    assert.ok(!/fmtMoney/.test(use), 'no loser tokens remain in the consumer');
    assert.ok(!/function fmtMoney/.test(readFileSync(join(dir, 'dup1.mjs'), 'utf8')), 'loser definition removed');
  } finally { cleanup(dir); }
});

// CM-WRITE-SUCCESS: a safe same-file merge applies — loser removed, caller rewired, gate passes.
test('CM-WRITE-SUCCESS: a safe same-file merge applies and the loser definition is gone', () => {
  const dir = tmpDir('cw-cm-ok-');
  try {
    writeTree(dir, { 'fa.js': 'export function keep() { return 1; }\nexport function dup() { return 1; }\nexport function user() { return dup(); }' });
    const g = {
      meta: { root: dir.replace(/\\/g, '/') }, domains: [], overlaps: [],
      nodes: [
        { id: 'fa.js:keep', label: 'keep', kind: 'function', file: 'fa.js', line: 1, loc: 1, exports: true, domain: 'd' },
        { id: 'fa.js:dup', label: 'dup', kind: 'function', file: 'fa.js', line: 2, loc: 1, exports: true, domain: 'd' },
        { id: 'fa.js:user', label: 'user', kind: 'function', file: 'fa.js', line: 3, loc: 1, exports: true, domain: 'd' },
      ],
      edges: [{ from: 'fa.js:user', to: 'fa.js:dup', kind: 'call' }],
    };
    const graphPath = join(dir, 'graph.json'); writeFileSync(graphPath, JSON.stringify(g));
    const r = runNode(CODEMOD, [graphPath, '--merge', 'fa.js:keep,fa.js:dup', '--into', 'fa.js:keep', '--write']);
    assert.equal(r.status, 0, `safe --write should succeed: ${r.stderr}`);
    const src = readFileSync(join(dir, 'fa.js'), 'utf8');
    assert.ok(!/function dup\b/.test(src), 'dup definition removed');
    assert.ok(/function keep\b/.test(src) && /function user\b/.test(src), 'keep + user remain');
    assert.ok(/return keep\(\)/.test(src), "user's call rewired to keep");
  } finally { cleanup(dir); }
});
