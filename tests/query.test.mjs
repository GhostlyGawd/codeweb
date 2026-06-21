// Characterization tests for scripts/query.mjs — the structural query CLI an agent calls to
// ground itself in the repo before/while editing (callers, callees, blast-radius, cycles,
// orphans). Written BEFORE the implementation (TDD red phase) and hardened after an independent
// review gate. House style: spawn the REAL shipped CLI as a child process against a crafted
// fixture graph and assert on stdout/exit — no mocks. Every --json output must be deterministic.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { runNode, tmpDir, cleanup, writeTree, script } from './helpers.mjs';

// --- primary fixture ---------------------------------------------------------------------------
// call chain:   a.js:main -> b.js:process -> {b.js:validate, c.js:store}
//               a.js:helper -> c.js:store           (c.js:store has two direct callers)
//               b.js:validate -> {dup.js:run, dup2.js:run}   (label "run" is ambiguous: 2 nodes)
// import cycle:  x.js:fx <-> y.js:fy                (file-level cycle x.js <-> y.js; IMPORT edges)
// orphans:       c.js:dead (no in-edges, not exported)        -> orphan
//               c.js:publicUnused (no in-edges, EXPORTED)     -> NOT an orphan
const NODES = [
  { id: 'a.js:main',         label: 'main',         file: 'a.js',    domain: 'app',  exports: false, kind: 'function' },
  { id: 'a.js:helper',       label: 'helper',       file: 'a.js',    domain: 'app',  exports: false, kind: 'function' },
  { id: 'b.js:process',      label: 'process',      file: 'b.js',    domain: 'core', exports: true,  kind: 'function' },
  { id: 'b.js:validate',     label: 'validate',     file: 'b.js',    domain: 'core', exports: false, kind: 'function' },
  { id: 'c.js:store',        label: 'store',        file: 'c.js',    domain: 'data', exports: true,  kind: 'function' },
  { id: 'c.js:dead',         label: 'dead',         file: 'c.js',    domain: 'data', exports: false, kind: 'function' },
  { id: 'c.js:publicUnused', label: 'publicUnused', file: 'c.js',    domain: 'data', exports: true,  kind: 'function' },
  { id: 'dup.js:run',        label: 'run',          file: 'dup.js',  domain: 'x',    exports: false, kind: 'function' },
  { id: 'dup2.js:run',       label: 'run',          file: 'dup2.js', domain: 'y',    exports: false, kind: 'function' },
  { id: 'x.js:fx',           label: 'fx',           file: 'x.js',    domain: 'm',    exports: true,  kind: 'function' },
  { id: 'y.js:fy',           label: 'fy',           file: 'y.js',    domain: 'm',    exports: true,  kind: 'function' },
];
const EDGES = [
  { from: 'a.js:main',     to: 'b.js:process',  kind: 'call',   weight: 1 },
  { from: 'b.js:process',  to: 'b.js:validate', kind: 'call',   weight: 1 },
  { from: 'b.js:process',  to: 'c.js:store',    kind: 'call',   weight: 1 },
  { from: 'a.js:helper',   to: 'c.js:store',    kind: 'call',   weight: 1 },
  { from: 'b.js:validate', to: 'dup.js:run',    kind: 'call',   weight: 1 },
  { from: 'b.js:validate', to: 'dup2.js:run',   kind: 'call',   weight: 1 },
  { from: 'x.js:fx',       to: 'y.js:fy',       kind: 'import', weight: 1 },
  { from: 'y.js:fy',       to: 'x.js:fx',       kind: 'import', weight: 1 },
];
const GRAPH = { meta: { target: 'query-fixture', engine: 'fixture', stats: {} }, nodes: NODES, edges: EDGES, domains: [], overlaps: [] };

let WS, GP, seq = 0;
before(() => {
  WS = tmpDir('codeweb-query-');
  writeTree(WS, { 'graph.json': JSON.stringify(GRAPH) });
  GP = join(WS, 'graph.json');
});
after(() => { if (WS) cleanup(WS); });

// run the CLI against the primary fixture; jq() parses stdout as JSON.
const q = (...args) => runNode(script('query.mjs'), [GP, ...args]);
const jq = (...args) => {
  const r = q(...args, '--json');
  let json = null; try { json = JSON.parse(r.stdout); } catch { /* null -> assertion reports clearly */ }
  return { ...r, json };
};
// run the CLI against an ad-hoc graph (for edge-case fixtures). Intentionally omits meta/domains
// on some inputs to exercise top-level normalization, mirroring build-report.mjs.
const onGraph = (graph, ...args) => {
  const p = join(WS, `g${seq++}.json`);
  writeFileSync(p, JSON.stringify(graph));
  return runNode(script('query.mjs'), [p, ...args]);
};
const onGraphJson = (graph, ...args) => {
  const r = onGraph(graph, ...args, '--json');
  let json = null; try { json = JSON.parse(r.stdout); } catch { /* null */ }
  return { ...r, json };
};

test('SC1: no query prints usage to stderr (not stdout) and exits 2', () => {
  const r = q();
  assert.equal(r.status, 2, `expected usage exit 2, got ${r.status}\n${r.stderr}`);
  assert.match(r.stderr, /usage/i, 'usage banner on stderr');
  assert.equal(r.stdout, '', 'nothing on stdout — stdout is the data channel');
});

test('SC2: missing graph file exits 2 with a clear message (no raw stack)', () => {
  const r = runNode(script('query.mjs'), [join(WS, 'nope.json'), '--callers', 'x']);
  assert.equal(r.status, 2, `expected exit 2, got ${r.status}`);
  assert.match(r.stderr, /not found|no such|cannot/i, 'human-readable not-found message');
  assert.doesNotMatch(r.stderr, /at \w+.*\(.*:\d+:\d+\)/, 'no raw V8 stack trace leaked');
});

test('SC3: --callers returns direct call in-neighbors, sorted', () => {
  const { status, json } = jq('--callers', 'c.js:store');
  assert.equal(status, 0);
  assert.equal(json.query, 'callers');
  assert.deepEqual(json.matched, ['c.js:store']);
  assert.deepEqual(json.results, ['a.js:helper', 'b.js:process'], 'both callers, sorted');
  assert.equal(json.count, 2);
});

test('SC4: --callees returns direct call out-neighbors, sorted', () => {
  const { status, json } = jq('--callees', 'b.js:process');
  assert.equal(status, 0);
  assert.equal(json.query, 'callees');
  assert.deepEqual(json.results, ['b.js:validate', 'c.js:store']);
  assert.equal(json.count, 2);
});

test('SC5: --impact returns the transitive reverse-call closure + distinct domains', () => {
  const { status, json } = jq('--impact', 'c.js:store');
  assert.equal(status, 0);
  assert.equal(json.query, 'impact');
  assert.deepEqual(json.results, ['a.js:helper', 'a.js:main', 'b.js:process']);
  assert.ok(!json.results.includes('c.js:store'), 'seed excluded from its own blast radius');
  assert.deepEqual(json.domains, ['app', 'core'], 'distinct domains, sorted');
  assert.equal(json.count, 3);
});

test('SC5b: --impact on an ambiguous label seeds from ALL matches, excluding every seed', () => {
  const { status, json } = jq('--impact', 'run');
  assert.equal(status, 0);
  assert.deepEqual(json.matched, ['dup.js:run', 'dup2.js:run'], 'both nodes are seeds');
  // reverse closure of {dup.js:run, dup2.js:run}: validate -> process -> main
  assert.deepEqual(json.results, ['a.js:main', 'b.js:process', 'b.js:validate']);
  assert.ok(!json.results.includes('dup.js:run') && !json.results.includes('dup2.js:run'), 'all seeds excluded');
  assert.deepEqual(json.domains, ['app', 'core']);
});

test('SC5c: --impact terminates on recursion (self-loop) and excludes the seed', () => {
  const g = {
    nodes: [
      { id: 'r.js:loop',   label: 'loop',   file: 'r.js', domain: 'r', exports: false },
      { id: 'r.js:caller', label: 'caller', file: 'r.js', domain: 'r', exports: false },
    ],
    edges: [
      { from: 'r.js:loop',   to: 'r.js:loop', kind: 'call' }, // self-loop must not hang the BFS
      { from: 'r.js:caller', to: 'r.js:loop', kind: 'call' },
    ],
  };
  const { status, json } = onGraphJson(g, '--impact', 'r.js:loop');
  assert.equal(status, 0, 'a visited-guard makes the traversal terminate');
  assert.deepEqual(json.results, ['r.js:caller'], 'self excluded, real caller found');
});

test('SC6: --cycles finds a file-level dependency cycle (SCC size >= 2)', () => {
  const { status, json } = jq('--cycles');
  assert.equal(status, 0);
  assert.equal(json.query, 'cycles');
  assert.deepEqual(json.cycles, [['x.js', 'y.js']], 'the x<->y cycle, files sorted');
  assert.equal(json.count, 1);
});

test('SC6b: multiple cycles are emitted in a deterministic order (sorted)', () => {
  const g = {
    nodes: [
      { id: 'x.js:fx', label: 'fx', file: 'x.js', domain: 'm', exports: true },
      { id: 'y.js:fy', label: 'fy', file: 'y.js', domain: 'm', exports: true },
      { id: 'p.js:fp', label: 'fp', file: 'p.js', domain: 'n', exports: true },
      { id: 'q.js:fq', label: 'fq', file: 'q.js', domain: 'n', exports: true },
    ],
    edges: [
      { from: 'x.js:fx', to: 'y.js:fy', kind: 'import' }, { from: 'y.js:fy', to: 'x.js:fx', kind: 'import' },
      { from: 'p.js:fp', to: 'q.js:fq', kind: 'import' }, { from: 'q.js:fq', to: 'p.js:fp', kind: 'import' },
    ],
  };
  const { status, json } = onGraphJson(g, '--cycles');
  assert.equal(status, 0);
  assert.deepEqual(json.cycles, [['p.js', 'q.js'], ['x.js', 'y.js']], 'cycles sorted by first member');
  assert.equal(json.count, 2);
});

test('SC7: --orphans = no incoming edges AND not exported (exported-unused excluded)', () => {
  const { status, json } = jq('--orphans');
  assert.equal(status, 0);
  assert.equal(json.query, 'orphans');
  const ids = json.results.map((o) => o.id);
  assert.ok(ids.includes('c.js:dead'), 'unexported + uncalled is an orphan');
  assert.ok(!ids.includes('c.js:publicUnused'), 'exported-but-unused is NOT an orphan');
  assert.ok(!ids.includes('x.js:fx'), 'has an import in-edge -> not an orphan');
  // exact set (a.js:main / a.js:helper are uncalled, unexported entrypoints — surface by design)
  assert.deepEqual(ids, ['a.js:helper', 'a.js:main', 'c.js:dead']);
  assert.equal(json.results[0].domain, 'app', 'orphan rows carry file/domain context');
});

test('SC7b: --orphans returns [] at exit 0 (not 1) when every node has an in-edge', () => {
  const g = {
    nodes: [
      { id: 'o.js:a', label: 'a', file: 'o.js', domain: 'd', exports: false },
      { id: 'o.js:b', label: 'b', file: 'o.js', domain: 'd', exports: false },
    ],
    edges: [
      { from: 'o.js:a', to: 'o.js:b', kind: 'call' }, { from: 'o.js:b', to: 'o.js:a', kind: 'call' },
    ],
  };
  const { status, json } = onGraphJson(g, '--orphans');
  assert.equal(status, 0, 'empty result on a valid graph is success, not not-found');
  assert.deepEqual(json.results, []);
  assert.equal(json.count, 0);
});

test('SC8a: a bare ambiguous label resolves to ALL matching nodes (union of results)', () => {
  const { status, json } = jq('--callers', 'run');
  assert.equal(status, 0);
  assert.deepEqual(json.matched, ['dup.js:run', 'dup2.js:run'], 'both nodes matched by label');
  assert.deepEqual(json.results, ['b.js:validate'], 'union of callers, deduped');
});

test('SC8b: unknown symbol exits 1 with found:false', () => {
  const { status, json } = jq('--callers', 'doesNotExist');
  assert.equal(status, 1, 'distinct exit code for not-found vs. found-but-empty');
  assert.equal(json.found, false);
});

test('SC8c: a found symbol with zero results returns exit 0 + [] (not not-found)', () => {
  const { status, json } = jq('--callees', 'c.js:store'); // leaf: no call out-edges
  assert.equal(status, 0);
  assert.notEqual(json.found, false, 'symbol exists');
  assert.deepEqual(json.results, []);
  assert.equal(json.count, 0);
});

test('SC8d: import edges never leak into call adjacency (callers/callees)', () => {
  const inn = jq('--callers', 'x.js:fx');
  assert.equal(inn.status, 0);
  assert.deepEqual(inn.json.results, [], 'import in-edge from y.js is excluded');
  const out = jq('--callees', 'x.js:fx');
  assert.equal(out.status, 0);
  assert.deepEqual(out.json.results, [], 'import out-edge to y.js is excluded');
});

test('SC9: --json output is byte-stable across runs (deterministic for agents)', () => {
  const a = q('--impact', 'c.js:store', '--json');
  const b = q('--impact', 'c.js:store', '--json');
  assert.equal(a.status, 0);
  assert.equal(a.stdout, b.stdout, 'identical input -> identical bytes');
});

test('SC-robust: missing node fields (exports/domain/file) default sanely, no crash', () => {
  const g = { nodes: [{ id: 'm.js:bare', label: 'bare' }], edges: [] }; // no meta/domains, bare node
  const { status, json } = onGraphJson(g, '--orphans');
  assert.equal(status, 0, 'normalizes missing top-level + node fields instead of throwing');
  const row = json.results.find((o) => o.id === 'm.js:bare');
  assert.ok(row, 'exports defaults to false -> bare uncalled node is an orphan');
  assert.equal(typeof row.domain, 'string', 'missing domain defaults to a string, never undefined');
});

test('SC-edgeless: a graph with no edges yields empty cycles/callers and all unexported orphans', () => {
  const g = {
    nodes: [
      { id: 'e.js:a', label: 'a', file: 'e.js', domain: 'd', exports: false },
      { id: 'e.js:b', label: 'b', file: 'e.js', domain: 'd', exports: true },
    ],
    edges: [],
  };
  assert.deepEqual(onGraphJson(g, '--cycles').json.cycles, [], 'no edges -> no cycles');
  const callers = onGraphJson(g, '--callers', 'e.js:a');
  assert.equal(callers.status, 0);
  assert.deepEqual(callers.json.results, [], 'found, but no callers');
  const orphans = onGraphJson(g, '--orphans');
  assert.deepEqual(orphans.json.results.map((o) => o.id), ['e.js:a'], 'only the unexported node');
});
