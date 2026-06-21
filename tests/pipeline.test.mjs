// End-to-end regression for scripts/run.mjs — the orchestrator the /codeweb command calls.
// Runs the full deterministic pipeline (extract -> cluster -> overlap -> build-report) on a small
// self-contained fixture into an isolated workspace, and asserts every artifact is produced and
// internally consistent. This is the only test that exercises run.mjs and build-report.mjs.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, tmpDir, cleanup, writeTree, readJSON, script } from './helpers.mjs';

const FILES = {
  // identical compute() in two directories -> a high-confidence cross-domain duplicate
  'core/calc.js': 'export function compute(items) {\n  const total = items.reduce((s, x) => s + x, 0);\n  return total / items.length;\n}\n',
  'util/calc.js': 'export function compute(items) {\n  const total = items.reduce((s, x) => s + x, 0);\n  return total / items.length;\n}\n',
  'core/app.js': 'import { compute } from "./calc.js";\nexport function run(data) {\n  return compute(data);\n}\n',
  'util/helpers.js': 'export function format(v) {\n  return String(v);\n}\nexport function clamp(v) {\n  return Math.max(0, v);\n}\n',
};

let SRC, WS, res;
before(() => {
  SRC = tmpDir('codeweb-pipe-src-');
  writeTree(SRC, FILES);
  WS = tmpDir('codeweb-pipe-ws-');
  res = runNode(script('run.mjs'), [SRC, '--target', 'pipe-fixture', '--out-dir', WS]);
});
after(() => { cleanup(SRC); cleanup(WS); });

test('run.mjs completes and emits all five artifacts', () => {
  assert.equal(res.status, 0, `pipeline exited non-zero:\n${res.stderr}`);
  for (const f of ['fragment.json', 'graph.json', 'overlap.md', 'report.html', 'report.md']) {
    assert.ok(existsSync(join(WS, f)), `missing artifact: ${f}`);
  }
});

test('graph carries the target through every stage', () => {
  const g = readJSON(join(WS, 'graph.json'));
  assert.equal(g.meta.target, 'pipe-fixture', 'target label survives extract->cluster->overlap');
  assert.ok(g.nodes.length >= 5, `discovered the fixture symbols (${g.nodes.length})`);
  assert.ok(g.domains.length >= 2, 'core/util clustered into >=2 directory domains');
});

test('the cross-domain duplicate is surfaced and body-confirmed high', () => {
  const g = readJSON(join(WS, 'graph.json'));
  const o = g.overlaps.find((x) => x.title.includes('`compute`'));
  assert.ok(o, 'compute duplicate surfaced');
  assert.equal(o.kind, 'duplicate-logic');
  assert.equal(o.confidence, 'high', `identical bodies -> high (sim ${o.bodySim})`);
});

test('report.html is a self-contained, non-trivial document', () => {
  const html = readFileSync(join(WS, 'report.html'), 'utf8');
  assert.ok(statSync(join(WS, 'report.html')).size > 5000, 'report has real content');
  assert.match(html, /<html/i, 'is an HTML document');
  assert.match(html, /pipe-fixture/, 'renders the target label in the report');
});

test('overlap.md lists the finding for human review', () => {
  const md = readFileSync(join(WS, 'overlap.md'), 'utf8');
  assert.match(md, /overlap \/ consolidation/i, 'overlap report header present');
  assert.match(md, /compute/, 'the duplicate is documented');
});
