// F4 (node-field half) — the extractor must emit complexity + maxDepth on function/method nodes,
// computed from the SAME body extent it already finds. Written BEFORE the impl (RED). Drives the real
// shipped extractor as a subprocess against a crafted fixture (helpers ethos: what ships is tested).
//
// Intent locks: EX-CX-MATCHES-LIB (the graph's complexity equals lib/complexity.cyclomatic of the
// real body — no second formula) and EX-CX-ONLY-CALLABLE (classes/modules carry no complexity, so the
// field means "control-flow complexity of a function body", nothing fuzzier). Additive: the existing
// 210 tests must stay green (asserted by the suite as a whole).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runNode, script, tmpDir, cleanup, writeTree, readJSON } from './helpers.mjs';
import { cyclomatic, nestingDepth } from '../scripts/lib/complexity.mjs';
import { join } from 'node:path';

const SRC = {
  'simple.js': 'export function straight(a, b) {\n  const c = a + b;\n  return c;\n}\n',
  'branchy.js': 'export function branchy(x) {\n  if (x > 0) {\n    for (let i = 0; i < x; i++) {\n      if (i % 2 === 0 && i > 1) doThing(i);\n    }\n  }\n  return x;\n}\nfunction doThing(i) { return i; }\n',
  'klass.js': 'export class Widget {\n  render() {\n    if (this.visible) return draw();\n    return null;\n  }\n}\nfunction draw() { return 1; }\n',
};

function extractGraph() {
  const dir = tmpDir('codeweb-cx-');
  const root = join(dir, 'src');
  writeTree(root, SRC);
  const out = join(dir, 'fragment.json');
  const r = runNode(script('extract-symbols.mjs'), [root, '--out', out, '--no-ctags']);
  assert.equal(r.status, 0, `extract failed: ${r.stderr}`);
  return { dir, graph: readJSON(out), root };
}

test('EX-CX-PRESENT: every function/method node carries integer complexity (>=1) and maxDepth (>=0)', () => {
  const { dir, graph } = extractGraph();
  try {
    const fns = graph.nodes.filter((n) => n.kind === 'function' || n.kind === 'method');
    assert.ok(fns.length >= 3, 'fixture has several functions/methods');
    for (const n of fns) {
      assert.equal(typeof n.complexity, 'number', `${n.id} has complexity`);
      assert.ok(Number.isInteger(n.complexity) && n.complexity >= 1, `${n.id} complexity >=1`);
      assert.ok(Number.isInteger(n.maxDepth) && n.maxDepth >= 0, `${n.id} maxDepth >=0`);
    }
  } finally { cleanup(dir); }
});

test('EX-CX-VALUES: a straight-line fn is complexity 1; a branchy fn is clearly higher', () => {
  const { dir, graph } = extractGraph();
  try {
    const straight = graph.nodes.find((n) => n.label === 'straight');
    const branchy = graph.nodes.find((n) => n.label === 'branchy');
    assert.equal(straight.complexity, 1, 'no decisions -> 1');
    assert.ok(branchy.complexity >= 4, `if + for + if + && -> >=4 (got ${branchy.complexity})`);
    assert.ok(branchy.maxDepth >= 2, `nested if/for -> depth >=2 (got ${branchy.maxDepth})`);
  } finally { cleanup(dir); }
});

test('EX-CX-MATCHES-LIB: graph complexity == lib/complexity.cyclomatic of the real body lines', () => {
  const { dir, graph, root } = extractGraph();
  try {
    for (const n of graph.nodes.filter((n) => n.kind === 'function' || n.kind === 'method')) {
      const lines = readFileSync(join(root, n.file), 'utf8').split(/\r?\n/);
      const body = lines.slice(n.line - 1, n.line - 1 + n.loc).join('\n');
      const lang = n.file.endsWith('.py') ? 'py' : 'js';
      assert.equal(n.complexity, cyclomatic(body, lang), `complexity mismatch for ${n.id}`);
      assert.equal(n.maxDepth, nestingDepth(body, lang), `maxDepth mismatch for ${n.id}`);
    }
  } finally { cleanup(dir); }
});

test('EX-CX-ONLY-CALLABLE: class and module nodes carry no complexity field', () => {
  const { dir, graph } = extractGraph();
  try {
    for (const n of graph.nodes.filter((n) => n.kind === 'class' || n.kind === 'module')) {
      assert.ok(n.complexity == null, `${n.kind} ${n.id} must not carry complexity`);
    }
  } finally { cleanup(dir); }
});
