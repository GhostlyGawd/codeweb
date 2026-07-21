// Spec N (docs/specs/overlap-lsh.md): LSH banding restores the twin/near-miss coverage the scale
// caps sacrificed. The planted corpus below is built so the OLD path provably never examines the
// planted twin pair: every label the twins share is a >50-caller hub, and hub labels are excluded
// from twin seeding wholesale. LSH buckets the pair anyway (their callee sets are identical), and
// the SAME exact confirmation math then accepts it.
//
// N4: old path (CODEWEB_LSH=0) emits no twin for the planted pair; LSH (CODEWEB_LSH=1) finds and
//     confirms it, and the overlap.md header declares the method. Both facts asserted.
// N4b: LSH output is byte-identical across two runs (determinism through bucket iteration).
// N5: small inputs keep the exact path by default — no LSH marker, bytes equal a forced-exact run.
// N6: Signal C (near-miss clones): LSH path and exact path produce the same finding on a small
//     t3 corpus — LSH changes candidate generation, never confirmation.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, tmpDir, cleanup, writeTree, script, PLUGIN_ROOT } from './helpers.mjs';

// N6 exercises Signal C (Type-3 near-miss clones), which only the AST tier produces — without the
// optional web-tree-sitter the finding cannot exist on EITHER path, so the test must skip exactly
// like the type3-clones suite does (IMPROVEMENTS.md #4: a fresh zero-dep clone ran red here).
const hasEngine = existsSync(join(PLUGIN_ROOT, 'scripts', 'grammars', 'tree-sitter-typescript.wasm')) && existsSync(join(PLUGIN_ROOT, 'node_modules', 'web-tree-sitter'));

const RUN = script('run.mjs');

// 5 hub labels x 62 callers each (60 fillers + the 2 twins) -> every hub group is past
// TWIN_HUB_CAP(50); the twins share ONLY hub labels, so the capped path never pairs them.
function hubCorpus() {
  const files = {};
  files['src/hubs.js'] = Array.from({ length: 5 }, (_, k) => `export function h${k + 1}() {\n  return ${k + 1};\n}`).join('\n') + '\n';
  // 5 statements — deliberately BELOW the t3 floor (>=6), so Signal C cannot pair the twins and
  // the test isolates Signal B's candidate generation.
  const twin = (name) => `import { h1, h2, h3, h4, h5 } from './hubs.js';\nexport function ${name}() {\n  h1();\n  h2();\n  h3();\n  h4();\n  h5();\n}\n`;
  files['src/twinA.js'] = twin('twinAlpha');
  files['src/twinB.js'] = twin('twinBeta');
  for (let f = 0; f < 10; f++) {
    const lines = [`import { h1, h2, h3, h4, h5 } from './hubs.js';`];
    for (let i = 0; i < 30; i++) {
      const j = f * 30 + i;
      const k = (j % 5) + 1;
      lines.push(`export function filler${j}() {\n  h${k}();\n  u${j}a();\n  u${j}b();\n  u${j}c();\n  return ${j};\n}`);
      lines.push(`function u${j}a() {\n  return ${j};\n}\nfunction u${j}b() {\n  return ${j + 1};\n}\nfunction u${j}c() {\n  return ${j + 2};\n}`);
    }
    files[`src/fillers${f}.js`] = lines.join('\n') + '\n';
  }
  return files;
}

const norm = (buf) => String(buf).replace(/"generatedAt":\s*"[^"]*"/g, '"generatedAt":"<t>"');

function runPipeline(dir, ws, env) {
  const r = runNode(RUN, [join(dir, 'src'), '--out-dir', ws], { env });
  assert.equal(r.status, 0, r.stderr);
  return readFileSync(join(ws, 'overlap.md'), 'utf8');
}

test('N4: LSH finds the planted twin pair the capped path provably never examines', () => {
  const dir = tmpDir('codeweb-lsh-');
  try {
    writeTree(dir, hubCorpus());
    const mdOld = runPipeline(dir, join(dir, 'ws-old'), { CODEWEB_LSH: '0' });
    assert.ok(!/twinAlpha[\s\S]{0,120}twinBeta|twinBeta[\s\S]{0,120}twinAlpha/.test(mdOld),
      'capped path: the planted pair is never examined (all shared labels are hubs)');
    assert.match(mdOld, /hub label/i, 'the capped run declares the hub exclusion');
    assert.ok(!/candidates: lsh/i.test(mdOld), 'no LSH marker on the exact path');

    const mdLsh = runPipeline(dir, join(dir, 'ws-lsh'), { CODEWEB_LSH: '1' });
    assert.match(mdLsh, /`twinAlpha` and `twinBeta`|`twinBeta` and `twinAlpha`/,
      'LSH path finds and confirms the planted pair');
    assert.match(mdLsh, /candidates: lsh/i, 'the LSH run declares its method in the header');
  } finally { cleanup(dir); }
});

test('N4b: the LSH path is byte-deterministic across runs', () => {
  const dir = tmpDir('codeweb-lsh-');
  try {
    writeTree(dir, hubCorpus());
    const md1 = runPipeline(dir, join(dir, 'ws-1'), { CODEWEB_LSH: '1' });
    const md2 = runPipeline(dir, join(dir, 'ws-2'), { CODEWEB_LSH: '1' });
    assert.equal(md1, md2, 'overlap.md byte-identical');
    assert.equal(
      norm(readFileSync(join(dir, 'ws-1', 'graph.json'))),
      norm(readFileSync(join(dir, 'ws-2', 'graph.json'))),
      'graph.json byte-identical (mod generatedAt)');
  } finally { cleanup(dir); }
});

test('N5: small inputs keep the exact path by default — bytes equal a forced-exact run', () => {
  const dir = tmpDir('codeweb-lsh-');
  try {
    writeTree(dir, {
      'src/a.js': 'export function alpha(x) {\n  return beta(x) + 1;\n}\n',
      'src/b.js': "import { alpha } from './a.js';\nexport function beta(x) {\n  return x * 2;\n}\nexport function gamma() {\n  return alpha(3);\n}\n",
    });
    const mdDefault = runPipeline(dir, join(dir, 'ws-def'), {});
    const mdExact = runPipeline(dir, join(dir, 'ws-exact'), { CODEWEB_LSH: '0' });
    assert.ok(!/candidates: lsh/i.test(mdDefault), 'auto threshold keeps tiny inputs exact');
    assert.equal(mdDefault, mdExact, 'default == forced-exact, byte for byte');
  } finally { cleanup(dir); }
});

test('N6: Signal C near-miss clones — LSH and exact paths confirm the same finding', { skip: hasEngine ? false : 'tree-sitter unavailable' }, () => {
  const dir = tmpDir('codeweb-lsh-');
  try {
    // Two near-identical 8-statement bodies in different files, different names: a Type-3 pair.
    const bodyA = 'export function packOrders(list) {\n  const out = [];\n  let total = 0;\n  for (const it of list) {\n    total += it.qty;\n    out.push(it.qty * 2);\n  }\n  const avg = total / list.length;\n  out.sort();\n  console.log(avg);\n  return out;\n}\n';
    const bodyB = 'export function packInvoices(rows) {\n  const out = [];\n  let total = 0;\n  for (const it of rows) {\n    total += it.qty;\n    out.push(it.qty * 2);\n  }\n  const avg = total / rows.length;\n  out.sort();\n  console.log(avg);\n  return out;\n}\n';
    writeTree(dir, { 'src/orders.js': bodyA, 'src/invoices.js': bodyB });
    const mdExact = runPipeline(dir, join(dir, 'ws-exact'), { CODEWEB_LSH: '0' });
    const mdLsh = runPipeline(dir, join(dir, 'ws-lsh'), { CODEWEB_LSH: '1' });
    for (const md of [mdExact, mdLsh]) {
      assert.match(md, /near-miss clones/i, 'the Type-3 pair is found');
      assert.match(md, /packOrders|packInvoices/, 'names in the finding');
    }
    const finding = (md) => (md.match(/^### .*near-miss clones.*$/m) || [''])[0];
    assert.equal(finding(mdExact), finding(mdLsh), 'identical finding either path');
  } finally { cleanup(dir); }
});
