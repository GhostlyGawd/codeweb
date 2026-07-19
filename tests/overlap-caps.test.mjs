// Spec B addendum (docs/specs/perf-stage-memo-scale.md): overlap's two pairwise passes get
// deterministic, REPORTED caps — the TypeScript-scale fix. Signal A samples big same-name groups
// for body confirmation (12 by id, evidence says so); Signal B skips twin-seeding through hub
// labels (>50 callers — utility hubs are weak twin evidence and quadratic dynamite). No silent
// truncation: both caps surface in the overlap.md header.
//
// OC1: a 16-copy same-name group body-confirms on a 12 sample and SAYS so.
// OC2: a 60-caller hub label is excluded from twin seeding, counted once, and the run stays fast.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, tmpDir, cleanup, script } from './helpers.mjs';

const BODY = 'function dup(x) {\n  const a = x + 1;\n  const b = a * 2;\n  const c = b - 3;\n  const d = c / 4;\n  return a + b + c + d;\n}\n';

function buildFixture(dir) {
  const src = join(dir, 'src'); mkdirSync(src, { recursive: true });
  const nodes = [], edges = [];
  const N = (id, label, file, line = 1, loc = 7) => { nodes.push({ id, label, kind: 'function', file, line, loc, exports: false, domain: 'app', summary: '', role: 'product' }); };

  // Signal A: 16 identical copies of `dup` across 16 files (write real bodies for confirmation).
  for (let i = 0; i < 16; i++) {
    const f = `d${i}.js`;
    writeFileSync(join(src, f), BODY);
    N(`${f}:dup`, 'dup', f);
  }

  // Signal B: one hub label with 60 callers; each caller also calls 3 unique targets so it clears
  // TWIN_MIN_OUT and enters candidate seeding. Five callers also call dup copies, keeping the dup
  // group's uncalled ratio under the interface-pattern bar (so it reaches body confirmation).
  writeFileSync(join(src, 'hub.js'), 'function hubfn() {\n  return 1;\n}\n');
  N('hub.js:hubfn', 'hubfn', 'hub.js');
  for (let i = 0; i < 60; i++) {
    const cf = `c${i}.js`;
    writeFileSync(join(src, cf), `function caller${i}() {\n  return hubfn();\n}\n`);
    N(`${cf}:caller${i}`, `caller${i}`, cf);
    edges.push({ from: `${cf}:caller${i}`, to: 'hub.js:hubfn', kind: 'call' });
    for (let u = 0; u < 3; u++) {
      const uf = `u${i}_${u}.js`;
      writeFileSync(join(src, uf), `function uniq${i}_${u}() {\n  return ${u};\n}\n`);
      N(`${uf}:uniq${i}_${u}`, `uniq${i}_${u}`, uf);
      edges.push({ from: `${cf}:caller${i}`, to: `${uf}:uniq${i}_${u}`, kind: 'call' });
    }
    if (i < 5) edges.push({ from: `${cf}:caller${i}`, to: `d${i}.js:dup`, kind: 'call' });
  }

  const ws = join(dir, 'ws'); mkdirSync(ws, { recursive: true });
  writeFileSync(join(ws, 'graph.json'), JSON.stringify({
    meta: { target: 'caps-fixture', root: src.replace(/\\/g, '/') },
    nodes, edges, domains: [{ name: 'app', nodes: nodes.map((n) => n.id) }], overlaps: [],
  }));
  return ws;
}

test('OC1+OC2: big-group sampling and hub-label twin cap, both reported', () => {
  const dir = tmpDir('codeweb-ovcap-');
  try {
    const ws = buildFixture(dir);
    const t0 = performance.now();
    const r = runNode(script('overlap.mjs'), [], { env: { CODEWEB_WS: ws } });
    const ms = performance.now() - t0;
    assert.equal(r.status, 0, r.stderr);
    const md = readFileSync(join(ws, 'overlap.md'), 'utf8');
    assert.match(md, /sampled 12\/16/, 'OC1: the dup finding declares its sample');
    assert.match(md, /1 hub label\(s\)/, 'OC2: the skipped hub label is counted in the header');
    const g = JSON.parse(readFileSync(join(ws, 'graph.json'), 'utf8'));
    const dupFinding = (g.overlaps || []).find((o) => /`dup`/.test(o.title || ''));
    assert.ok(dupFinding, 'the sampled group still yields its finding');
    assert.equal(dupFinding.confidence, 'high', 'identical bodies confirm high even under sampling');
    assert.ok(ms < 30000, `caps keep the run bounded (took ${Math.round(ms)}ms)`);
  } finally { cleanup(dir); }
});
