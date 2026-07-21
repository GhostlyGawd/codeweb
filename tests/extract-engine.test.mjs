// Integration test for the engine tiers through the REAL extractor (run as a subprocess, like the
// rest of the suite). v9: tree-sitter is the DEFAULT when web-tree-sitter (an optionalDependency)
// is installed — dispatch recall was the measured gap — and `--engine regex` forces the old tier.
// When the dependency is absent, the default degrades to regex byte-identically (CI without
// npm install keeps working).

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

const dflt = extract('regex'); // the forced-regex tier (the pre-v9 default)
const ts = extract('tree-sitter');
const auto = extract(null); // the actual default: tree-sitter when available, regex otherwise
const cx = (frag, label) => frag.nodes.find((n) => n.label === label)?.complexity;
const tsAvailable = ts.meta.complexityEngine !== undefined;

test('forced --engine regex: no complexityEngine field (output shape unchanged)', () => {
  assert.equal(dflt.meta.engine, 'regex'); // --no-ctags
  assert.equal(dflt.meta.complexityEngine, undefined);
  assert.equal(cx(dflt, 'run'), 1); // a non-divergent control symbol
});

test('default (no flag) = tree-sitter when installed, regex fallback otherwise', () => {
  if (tsAvailable) assert.match(auto.meta.complexityEngine || '', /tree-sitter/, 'default engages the AST tier');
  else assert.equal(auto.meta.complexityEngine, undefined, 'absent dependency degrades to regex');
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

// Round 2, finding #7: README documented an `--engine read` mode that never existed — and any
// unknown value (a CODEWEB_ENGINE typo included) silently ENABLED the AST tier, the opposite of
// the documented intent. Unknown engines are now a loud exit 2, the #24 arg policy.
test('unknown --engine exits 2 with the valid set; --engine regex still works', () => {
  const bad = runNode(script('extract-symbols.mjs'), [FIXTURE, '--no-ctags', '--engine', 'read']);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /unknown --engine .*valid: regex, tree-sitter/);
  const ok = runNode(script('extract-symbols.mjs'), [FIXTURE, '--no-ctags', '--engine', 'regex']);
  assert.equal(ok.status, 0, ok.stderr);
});

// --- Increment 2: class-qualified method ids + dynamic-dispatch edges (opt-in tree-sitter) -------
const idsEndingWith = (frag, suffix) => frag.nodes.some((n) => n.id.endsWith(suffix));
const hasEdge = (frag, fromSuf, toSuf) =>
  frag.edges.some((e) => e.from.endsWith(fromSuf) && e.to.endsWith(toSuf) && (e.kind === 'call' || e.kind === 'test'));

test('tree-sitter: method node ids are class-qualified; class/function ids stay bare', { skip: !tsAvailable && 'web-tree-sitter unavailable' }, () => {
  assert.ok(idsEndingWith(ts, ':Pipeline.run'), 'qualified method id');
  assert.ok(idsEndingWith(ts, ':Pipeline.validate'));
  assert.ok(idsEndingWith(ts, ':Pipeline.execute'));
  assert.ok(idsEndingWith(ts, ':Pipeline'), 'class id stays bare');
  assert.ok(idsEndingWith(ts, ':render'), 'top-level function id stays bare');
  // label stays bare even though the id is qualified (so existing label lookups & byName keep working)
  assert.ok(ts.nodes.some((n) => n.label === 'run' && n.id.endsWith(':Pipeline.run')));
});

test('tree-sitter: dynamic-dispatch call edges (this.* + typed receiver) are wired', { skip: !tsAvailable && 'web-tree-sitter unavailable' }, () => {
  assert.ok(hasEdge(ts, ':Pipeline.run', ':Pipeline.validate'), 'this.validate()');
  assert.ok(hasEdge(ts, ':Pipeline.run', ':Pipeline.execute'), 'this.execute()');
  assert.ok(hasEdge(ts, ':bootstrap', ':Pipeline.run'), 'typed receiver p: Pipeline');
});

// v6: the regex tier ALSO owner-qualifies method ids (same `file:Class.method` scheme as the
// tree-sitter tier — same-file same-name methods must never collide). What stays tree-sitter-only
// is DISPATCH: this.* and typed-receiver member calls are still dropped by the regex tier.
test('default (regex) run: method ids match the tree-sitter qualification scheme; still NO dispatch edges', () => {
  assert.ok(idsEndingWith(dflt, ':Pipeline.run'), 'regex tier qualifies method ids (id parity with ts tier)');
  assert.ok(idsEndingWith(dflt, ':Pipeline.validate'));
  assert.ok(dflt.nodes.some((n) => n.label === 'run' && n.id.endsWith(':Pipeline.run')), 'label stays bare');
  assert.ok(!hasEdge(dflt, ':run', ':validate'), 'regex drops this.* member calls (no dispatch)');
  assert.ok(!hasEdge(dflt, ':bootstrap', ':run'), 'regex drops typed-receiver member calls');
});
