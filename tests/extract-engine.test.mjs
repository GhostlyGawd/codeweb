// Integration test: the --engine tree-sitter opt-in flows exact cyclomatic through the REAL extractor
// (run as a subprocess, like the rest of the suite). Covers both modes: when web-tree-sitter (an
// optionalDependency) is present the exact values + meta.complexityEngine appear; when it is absent the
// flag must fall back to byte-identical regex output. The DEFAULT (no flag) path is asserted unchanged.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runNode, script, PLUGIN_ROOT } from './helpers.mjs';

const FIXTURE = join(PLUGIN_ROOT, 'tests', 'fixtures', 'ts-engine');

function extract(engine) {
  const args = [FIXTURE, '--no-ctags'];
  if (engine) args.push('--engine', engine);
  const res = runNode(script('extract-symbols.mjs'), args);
  assert.equal(res.status, 0, `extractor exited ${res.status}: ${res.stderr}`);
  return JSON.parse(res.stdout);
}

const dflt = extract(null);
const ts = extract('tree-sitter');
const cx = (frag, label) => frag.nodes.find((n) => n.label === label)?.complexity;
const tsAvailable = ts.meta.complexityEngine !== undefined;

test('default run: regex F4, no complexityEngine field (output shape unchanged)', () => {
  assert.equal(dflt.meta.engine, 'regex'); // --no-ctags
  assert.equal(dflt.meta.complexityEngine, undefined);
  assert.equal(cx(dflt, 'run'), 1); // a non-divergent control symbol
});

test('tree-sitter run: exact complexity + meta records the pinned engine', { skip: !tsAvailable && 'web-tree-sitter unavailable' }, () => {
  assert.match(ts.meta.complexityEngine, /tree-sitter/);
  assert.equal(cx(ts, 'validate'), 3); // if + && (optional param NOT a ternary)
  assert.equal(cx(ts, 'execute'), 1);  // .catch is not a try/catch
  assert.equal(cx(ts, 'render'), 3);   // && + ternary inside the template ARE counted
  assert.equal(cx(ts, 'run'), 1);
});

test('the opt-in demonstrably changes behavior: regex diverges from exact on the marked symbols', { skip: !tsAvailable && 'web-tree-sitter unavailable' }, () => {
  assert.notEqual(cx(dflt, 'validate'), 3); // regex over-counts (optional-param `?`)
  assert.notEqual(cx(dflt, 'execute'), 1);  // regex over-counts (.catch)
  assert.notEqual(cx(dflt, 'render'), 3);   // regex under-counts (template stripped)
});

test('graceful fallback: with the engine unavailable, --engine tree-sitter == regex output', { skip: tsAvailable && 'engine available — fallback path not exercised here' }, () => {
  assert.equal(ts.meta.complexityEngine, undefined);
  assert.deepEqual(ts.nodes.map((n) => n.complexity), dflt.nodes.map((n) => n.complexity));
});
