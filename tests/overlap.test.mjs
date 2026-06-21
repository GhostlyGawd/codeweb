// Regression suite for scripts/overlap.mjs — locks in the body-confirmed precision gate:
// same-name clusters are banded by token-shingle Jaccard of the REAL bodies
// (>=0.6 high · 0.35-0.6 medium/drifted · 0.15-0.35 low · <0.15 refuted), CLI-scaffold names
// fold into one shared-responsibility finding, and when source is absent it falls back to
// structural scoring. Bodies are written to disk and meta.root points at them.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { runNode, tmpDir, cleanup, writeTree, readJSON, script } from './helpers.mjs';

// Each fixture file holds exactly one function, so node.line=1 and node.loc=<file line count>.
const SPECS = [
  // HIGH: byte-identical bodies -> shingles identical -> mean ~1.0
  { file: 'aa/dup.js', label: 'compute', body:
`function compute(items) {
  const total = items.reduce((sum, it) => sum + it.value, 0);
  const avg = total / items.length;
  return { total: total, average: avg, count: items.length };
}` },
  { file: 'bb/dup.js', label: 'compute', body:
`function compute(items) {
  const total = items.reduce((sum, it) => sum + it.value, 0);
  const avg = total / items.length;
  return { total: total, average: avg, count: items.length };
}` },
  // REFUTED: same name, disjoint vocabulary -> mean < 0.15
  { file: 'cc/coin.js', label: 'mismatch', body:
`function mismatch(alpha) {
  const beta = alpha.gamma + alpha.delta;
  return beta.toUpperCase();
}` },
  { file: 'dd/coin.js', label: 'mismatch', body:
`function mismatch(zeta) {
  while (zeta.eta > zeta.theta) zeta.iota();
  return zeta.kappa;
}` },
  // MEDIUM/drifted: body2 = body1 + extra distinct lines -> mean ~0.4-0.5
  { file: 'ee/drift.js', label: 'transform', body:
`function transform(rows) {
  const out = [];
  for (const r of rows) out.push(r.id);
  return out;
}` },
  { file: 'ff/drift.js', label: 'transform', body:
`function transform(rows) {
  const out = [];
  for (const r of rows) out.push(r.id);
  const extra = rows.map((r) => r.name);
  const merged = out.concat(extra);
  return merged;
}` },
  // SCAFFOLD: a CLI name in >=2 files -> folded into one shared-responsibility finding
  { file: 'gg/cli.js', label: 'parseArgs', body:
`function parseArgs(argv) {
  return argv.slice(2);
}` },
  { file: 'hh/cli.js', label: 'parseArgs', body:
`function parseArgs(args) {
  return args.filter(Boolean);
}` },
];

function buildGraph(root) {
  const nodes = SPECS.map((s) => ({
    id: `${s.file}:${s.label}`, label: s.label, kind: 'function', file: s.file,
    line: 1, loc: s.body.split('\n').length + 1, exports: true, domain: '', summary: '',
  }));
  return { meta: { root, target: 'ov-fixture', engine: 'regex', languages: ['javascript'], symbols: nodes.length, mode: 'internal', depth: 'symbol' }, nodes, edges: [] };
}

let SRC, WS, graph;
before(() => {
  SRC = tmpDir('codeweb-ovsrc-');
  writeTree(SRC, Object.fromEntries(SPECS.map((s) => [s.file, s.body + '\n'])));
  WS = tmpDir('codeweb-ovws-');
  const rootFwd = SRC.replace(/\\/g, '/');
  writeFileSync(join(WS, 'graph.json'), JSON.stringify(buildGraph(rootFwd)));
  const res = runNode(script('overlap.mjs'), [], { env: { CODEWEB_WS: WS } });
  assert.equal(res.status, 0, `overlap exited non-zero:\n${res.stderr}`);
  assert.match(res.stdout, /source: FOUND/, 'overlap found the on-disk source');
  graph = readJSON(join(WS, 'graph.json'));
});
after(() => { cleanup(SRC); cleanup(WS); });

const find = (sub) => graph.overlaps.find((o) => o.title.includes(sub));

test('identical bodies -> high confidence duplicate-logic', () => {
  const o = find('`compute`');
  assert.ok(o, 'compute cluster surfaced');
  assert.equal(o.kind, 'duplicate-logic');
  assert.equal(o.confidence, 'high', `body sim was ${o.bodySim}`);
  assert.ok(o.bodySim >= 0.6, `bodySim ${o.bodySim} >= 0.6`);
});

test('same name, disjoint bodies -> refuted (dismissed as coincidental)', () => {
  const o = find('`mismatch`');
  assert.ok(o, 'mismatch cluster surfaced');
  assert.equal(o.confidence, 'refuted', `body sim was ${o.bodySim}`);
  assert.ok(o.bodySim < 0.15, `bodySim ${o.bodySim} < 0.15`);
});

test('partially diverged bodies -> medium/drifted', () => {
  const o = find('`transform`');
  assert.ok(o, 'transform cluster surfaced');
  assert.equal(o.confidence, 'medium', `body sim was ${o.bodySim}`);
  assert.equal(o.drifted, true, 'flagged as drifted (copies have diverged)');
  assert.ok(o.bodySim >= 0.35 && o.bodySim < 0.6, `bodySim ${o.bodySim} in [0.35,0.6)`);
});

test('CLI-scaffold names fold into one shared-responsibility finding', () => {
  const o = graph.overlaps.find((x) => x.kind === 'shared-responsibility');
  assert.ok(o, 'scaffold finding surfaced');
  assert.equal(o.severity, 'high');
  assert.equal(o.confidence, 'high', 'scaffold finding is always high-confidence');
  assert.match(o.title, /CLI scaffolding/);
  assert.match(o.evidence, /parseArgs/, 'names the hand-rolled parser');
});

test('overlaps are ranked, id-stamped, and written back into the graph', () => {
  // Exactly four findings from the fixture: compute(high) + mismatch(refuted) + transform(medium)
  // as duplicate-logic, plus the folded parseArgs scaffold as shared-responsibility.
  const kinds = graph.overlaps.reduce((m, o) => ((m[o.kind] = (m[o.kind] || 0) + 1), m), {});
  assert.equal(graph.overlaps.length, 4, 'exactly four findings');
  assert.equal(kinds['duplicate-logic'], 3, 'three same-name clusters');
  assert.equal(kinds['shared-responsibility'], 1, 'one folded scaffold finding');
  for (const o of graph.overlaps) assert.match(o.id, /^ov\d+$/, 'each finding id-stamped');
  // sorted by severity desc then confidence desc — verify non-increasing severity rank
  const sev = { low: 1, medium: 2, high: 3 };
  for (let i = 1; i < graph.overlaps.length; i++) {
    assert.ok(sev[graph.overlaps[i - 1].severity] >= sev[graph.overlaps[i].severity], 'severity non-increasing');
  }
});

test('structural fallback when source is absent', () => {
  // A separate graph whose meta.root does not exist -> HAVE_SOURCE false -> structural scoring.
  const ws2 = tmpDir('codeweb-ovstruct-');
  try {
    const nodes = [
      { id: 'p/a.js:render', label: 'render', kind: 'function', file: 'p/a.js', line: 1, loc: 3, domain: '', summary: '' },
      { id: 'q/b.js:render', label: 'render', kind: 'function', file: 'q/b.js', line: 1, loc: 3, domain: '', summary: '' },
      { id: 'p/a.js:helper', label: 'helper', kind: 'function', file: 'p/a.js', line: 5, loc: 2, domain: '', summary: '' },
      { id: 'q/b.js:helper', label: 'helper', kind: 'function', file: 'q/b.js', line: 5, loc: 2, domain: '', summary: '' },
    ];
    // both render() call a same-named helper -> shared downstream call name -> structural high
    const edges = [
      { from: 'p/a.js:render', to: 'p/a.js:helper', kind: 'call', weight: 1 },
      { from: 'q/b.js:render', to: 'q/b.js:helper', kind: 'call', weight: 1 },
    ];
    const g = { meta: { root: '/codeweb/does/not/exist-xyz', target: 't', engine: 'regex', languages: ['javascript'], symbols: nodes.length }, nodes, edges };
    writeFileSync(join(ws2, 'graph.json'), JSON.stringify(g));
    const res = runNode(script('overlap.mjs'), [], { env: { CODEWEB_WS: ws2 } });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /source: absent/, 'falls back when root is missing');
    const g2 = readJSON(join(ws2, 'graph.json'));
    const o = g2.overlaps.find((x) => x.title.includes('`render`'));
    assert.ok(o, 'render duplicate still surfaced structurally');
    assert.match(o.evidence, /structural/, 'basis is structural, not body-confirmed');
  } finally {
    cleanup(ws2);
  }
});
