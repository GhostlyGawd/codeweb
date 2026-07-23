// Round 2, finding #12 — accessors, overload stubs, annotated methods:
//   T-12.1 — the AST tier's methodIds dedupe silently DROPPED the second method_definition with the
//            same id (get/set pairs; static/instance same-name). TS overload SIGNATURES are
//            method_signature nodes (never framed), so a collision is always two real bodies. The
//            second now suffixes '@' + 1-based start line — the same scheme the regex tier's
//            file-level disambiguator already used, so both tiers emit identical ids. The
//            cross-tier defensive dedupe in extract-symbols does the same instead of `continue`.
//   T-12.2 — the self-definition guard covered only a node's own start line, so getter/setter/impl
//            declaration lines were scanned as calls with the CLASS as scope, fabricating
//            `Widget -> Widget.value` phantom callers (hiding accessors from deadcode). declStarts
//            now skips any same-named declaration line; body-less overload stubs (no range) are
//            killed by a class-enclosed stub-line guard covering callRe AND refRe.
//   T-12.3 — the regex method matcher failed on any return annotation or default param
//            (`get value(): number {`, `compute(n: any): number {`, `render(x = 1) {` were
//            invisible; their bodies' calls re-attributed to the class node). Modifiers now stack,
//            the param interior widens to [^;]* (NOT [^;{}] — that would regress destructured
//            params like `move({ x, y })`, pinned below), and a `: Type` return annotation is
//            allowed before the brace.
//
// --no-ctags forces the deterministic regex scanner; the AST leg runs the same fixture under the
// default tree-sitter engine (skip-guarded on availability, the suite convention) and the id sets
// must be identical across tiers (the engine A/B extended to this fixture).
//
// Review addition (WS-B build review): over.ts pins the MODULE-LEVEL overload-stub direction of the
// T-12.2 class-gate decision. `export function f(x: number): string;` stubs match the function rule
// in BOTH tiers (functions are regex-scanner-owned even under tree-sitter), so every stub line is a
// declaration start — declStarts suppresses its own-name callRe match and the @line scheme dedupes
// ids. The class gate never needs to fire there, and narrowing it to class enclosings reintroduced
// no <module> fabrication (verified empirically against both tiers before pinning).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { scanSymbols } from '../scripts/lib/lang-rules.mjs';
import { runNode, tmpDir, cleanup, writeTree, readJSON, script, hasEdge, PLUGIN_ROOT } from './helpers.mjs';

const hasEngine = existsSync(join(PLUGIN_ROOT, 'scripts', 'grammars', 'tree-sitter-typescript.wasm'))
  && existsSync(join(PLUGIN_ROOT, 'node_modules', 'web-tree-sitter'));
const noMask = () => { throw new Error('masked() must not be called for non-masked languages'); };

const W_TS =
  'export function normalize(v: number): number { return v | 0; }\n' +
  'export class Widget {\n' +
  '  private v = 0;\n' +
  '  get value(): number { return this.v; }\n' +
  '  set value(v: number) { this.v = normalize(v); }\n' +
  '  compute(n: number): number;\n' +
  '  compute(n: string): number;\n' +
  '  compute(n: any): number { return normalize(n); }\n' +
  '  render(x = 1) { return this.value + x; }\n' +
  '  move({ x, y }) { return normalize(x + y); }\n' +
  '}\n';

const OVER_TS =
  'export function f(x: number): string;\n' +
  'export function f(x: string): number;\n' +
  'export function f(x: any): any { return g(x); }\n' +
  'export function g(v: number): number { return v; }\n' +
  'export function caller() { return f(1); }\n';

let DIR;
const frags = new Map();
function extract(engine) {
  if (frags.has(engine)) return frags.get(engine);
  if (!DIR) { DIR = tmpDir('codeweb-accessor-'); writeTree(DIR, { 'w.ts': W_TS, 'over.ts': OVER_TS }); }
  const out = join(DIR, `fragment-${engine}.json`);
  const res = runNode(script('extract-symbols.mjs'), [DIR, '--target', 'accessor-x', '--no-ctags', '--out', out],
    { env: { CODEWEB_ENGINE: engine } });
  assert.equal(res.status, 0, `extractor (${engine}) exited non-zero:\n${res.stderr}`);
  const f = readJSON(out);
  frags.set(engine, f);
  return f;
}
test('cleanup marker', () => { assert.ok(true); }); // DIR cleanup happens in the last test below

const TIERS = [
  ['regex', 'regex tier', false],
  ['tree-sitter', 'ast tier', !hasEngine && 'tree-sitter engine unavailable'],
];

for (const [engine, label, skip] of TIERS) {
  test(`accessors (${label}): getter keeps the bare id, setter gets @5`, { skip }, () => {
    const f = extract(engine);
    const ids = new Set(f.nodes.map((n) => n.id));
    assert.ok(ids.has('w.ts:Widget.value'), 'getter node w.ts:Widget.value exists');
    assert.ok(ids.has('w.ts:Widget.value@5'), 'setter node w.ts:Widget.value@5 exists (1-based start line)');
    assert.ok(ids.has('w.ts:Widget.compute'), 'overload impl node exists');
    assert.ok(ids.has('w.ts:Widget.render'), 'annotated/default-param method visible');
    assert.ok(ids.has('w.ts:Widget.move'), 'destructured-param method still visible (guards [^;]* vs [^;{}])');
  });

  test(`decl lines (${label}): no class -> own-member phantom callers; setter call attributes to @5`, { skip }, () => {
    const f = extract(engine);
    for (const member of ['w.ts:Widget.value', 'w.ts:Widget.value@5', 'w.ts:Widget.compute', 'w.ts:Widget.render']) {
      assert.ok(!hasEdge(f.edges, 'w.ts:Widget', member),
        `declaration/stub lines fabricate nothing: Widget -> ${member} must not exist`);
    }
    assert.ok(hasEdge(f.edges, 'w.ts:Widget.value@5', 'w.ts:normalize'),
      "the setter's normalize(v) call attributes to the @5 id");
    assert.ok(hasEdge(f.edges, 'w.ts:Widget.compute', 'w.ts:normalize'), 'impl body call survives');
    assert.ok(hasEdge(f.edges, 'w.ts:Widget.move', 'w.ts:normalize'), 'destructured-param body call survives');
  });

  test(`module-level overload stubs (${label}): stubs get @line ids; no <module> or self fabrication`, { skip }, () => {
    const f = extract(engine);
    const ids = new Set(f.nodes.map((n) => n.id));
    assert.ok(ids.has('over.ts:f') && ids.has('over.ts:f@2') && ids.has('over.ts:f@3'),
      'each stub line is a declaration with its own range; ids dedupe via @line');
    assert.ok(!f.edges.some((e) => e.from === 'over.ts:<module>'),
      'no <module> caller in over.ts — stub lines are declaration lines (declStarts), not free code');
    assert.ok(!f.edges.some((e) => e.from.startsWith('over.ts:f') && e.to.startsWith('over.ts:f')),
      'no f -> f self edges from stub/impl declaration lines');
    assert.ok(hasEdge(f.edges, 'over.ts:f@3', 'over.ts:g'), "the impl body's g(x) call edges from the impl id");
    assert.ok(hasEdge(f.edges, 'over.ts:caller', 'over.ts:f@3'),
      'caller() resolves to the impl id (sameFileByName keeps the last same-named range)');
  });
}

test('A/B: both tiers emit the identical id set for the accessor fixture', { skip: !hasEngine && 'tree-sitter engine unavailable' }, () => {
  const a = extract('regex').nodes.map((n) => n.id).sort();
  const b = extract('tree-sitter').nodes.map((n) => n.id).sort();
  assert.deepEqual(b, a, 'tier id sets must byte-match (the @line scheme is tier-symmetric)');
});

// T-12.3 probe table (in-process): the widenings must not admit the callback-noise shapes.
test('regex method matcher probes: describe() never matches; it(...) noise is pre-existing; if dies in KEYWORDS', () => {
  const sym = (line) => scanSymbols('/x/probe.ts', 'class C {\n' + line + '\n}', noMask)
    .filter((s) => s.kind === 'method').map((s) => s.name);
  assert.deepEqual(sym("  describe('x', () => {"), [], 'describe(cb-open) matches in no variant');
  assert.deepEqual(sym("  it('works', function () {"), ['it'],
    'pre-existing noise class (matched today too) — do not "fix" here, do not regress silently');
  assert.deepEqual(sym('  if (cond) {'), [], 'control flow dies in the KEYWORDS filter');
  assert.deepEqual(sym('  get() {'), ['get'], 'a method actually NAMED get keeps matching (modifier group requires trailing space)');
  assert.deepEqual(sym('  *gen() {'), ['gen'], 'generator star outside the modifier group');
  assert.deepEqual(sym('  static *gen2() {'), ['gen2'], 'stacked modifier + star');
  assert.deepEqual(sym('  render(props = {}) {'), ['render'], 'object-literal default param admitted by [^;]*');
});

test('teardown', () => { if (DIR) cleanup(DIR); assert.ok(true); });
