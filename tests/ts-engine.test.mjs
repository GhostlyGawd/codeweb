// Tests for the optional tree-sitter complexity engine (scripts/lib/ts-engine.mjs).
//
// The engine is an OPTIONAL tier: web-tree-sitter is an optionalDependency, so it may be absent in a
// --no-optional install. Every value assertion is guarded on the engine actually loading; when it is
// unavailable the suite still asserts the contract that loadTsEngine() returns null (the signal the
// extractor uses to fall back to regex). This keeps `npm test` green in both install modes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { script } from './helpers.mjs';
import { loadTsEngine } from '../scripts/lib/ts-engine.mjs';
import { cyclomatic } from '../scripts/lib/complexity.mjs';

const engine = await loadTsEngine();
const have = engine !== null;

test('loadTsEngine returns null OR a {cyclomaticExact, version} engine — never throws', () => {
  if (!have) { assert.equal(engine, null); return; }
  assert.equal(typeof engine.cyclomaticExact, 'function');
  assert.equal(typeof engine.version, 'string');
  assert.match(engine.version, /tree-sitter/);
});

// Exact McCabe on body slices — the SAME text the regex extractor feeds cyclomatic(). Decision set is
// held identical to complexity.mjs, so these are precision checks, not definitional ones.
const CASES = [
  { name: 'no decisions', src: 'run(): void {\n  this.validate();\n}', exact: 1 },
  { name: 'if + &&', src: 'validate(cfg?: Config): boolean {\n  if (cfg && cfg.enabled) { return true; }\n  return false;\n}', exact: 3 },
  { name: 'switch cases + catch', src: 'f(x): number {\n  try { g(); } catch (e) { h(); }\n  switch (x) { case 1: return 1; case 2: return 2; default: return 0; }\n}', exact: 4 },
  { name: 'loops + nullish', src: 'f(x) {\n  for (const k in o) { while (x > 0) { x--; } }\n  return x ?? 0;\n}', exact: 4 },
];

for (const c of CASES) {
  test(`cyclomaticExact: ${c.name} → ${c.exact}`, { skip: !have && 'tree-sitter engine unavailable' }, () => {
    assert.equal(engine.cyclomaticExact(c.src), c.exact);
  });
}

// The precision wins — cases where the regex F4 is provably WRONG and the AST is right.
const DIVERGENCES = [
  {
    name: 'optional param `?:` is not a ternary',
    src: 'validate(cfg?: Config): boolean {\n  if (cfg && cfg.enabled) { return true; }\n  return false;\n}',
    exact: 3, // regex counts the `?` of cfg?: as a ternary → 4
  },
  {
    name: '`.catch(` is a Promise method, not try/catch',
    src: 'execute(): void {\n  doWork().catch(onError);\n}',
    exact: 1, // regex matches \bcatch\b → 2
  },
  {
    name: 'logic inside a template interpolation is real branching',
    src: "render(items: string[]): string {\n  return `${items.map((x) => (x && x.length > 0 ? x : 'none')).join(',')}`;\n}",
    exact: 3, // regex strips the whole template → 1
  },
];

for (const d of DIVERGENCES) {
  test(`precision: ${d.name}`, { skip: !have && 'tree-sitter engine unavailable' }, () => {
    const exact = engine.cyclomaticExact(d.src);
    const regex = cyclomatic(d.src, 'js');
    assert.equal(exact, d.exact, `exact should be ${d.exact}, got ${exact}`);
    assert.notEqual(regex, exact, 'this case must demonstrate a regex divergence');
  });
}

test('determinism: identical input → identical value', { skip: !have && 'tree-sitter engine unavailable' }, () => {
  const src = 'f(x) { if (x) { for (;;) {} } return x ? 1 : 2; }';
  assert.equal(engine.cyclomaticExact(src), engine.cyclomaticExact(src));
});

test('always >= 1, and empty/garbage input does not throw', { skip: !have && 'tree-sitter engine unavailable' }, () => {
  assert.ok(engine.cyclomaticExact('') >= 1);
  assert.ok(engine.cyclomaticExact('}{ not valid (((') >= 1);
});

// --- Increment 2: whole-file extractor — class-qualified method ids + dispatch edges -------------
// extractJsTs(text, rel) is the source of truth for JS/TS METHOD nodes (qualified ids) and the
// dynamic-dispatch call edges the regex engine drops. Ported from spike/tree-sitter/extract-ts.mjs.
const G_SRC = `export class Pipeline {
  run() {
    this.validate();
    this.execute();
  }
  validate(cfg?: Config) {
    if (cfg && cfg.enabled) { return true; }
    return false;
  }
  execute() {
    doWork().catch(onError);
  }
}
export function render(items) {
  return items.join(',');
}
export function bootstrap(p: Pipeline) {
  p.run();
}
`;
const skipG = !have && 'tree-sitter engine unavailable';

test('extractJsTs: method ids are class-qualified (file:Class.method), labels stay bare', { skip: skipG }, () => {
  const g = engine.extractJsTs(G_SRC, 'x.ts');
  assert.ok(g && Array.isArray(g.methods), 'returns {methods, dispatch} when available');
  assert.deepEqual(
    g.methods.map((m) => m.id).sort(),
    ['x.ts:Pipeline.execute', 'x.ts:Pipeline.run', 'x.ts:Pipeline.validate'],
  );
  const run = g.methods.find((m) => m.id === 'x.ts:Pipeline.run');
  assert.equal(run.label, 'run', 'label stays bare for byName/codemod/overlap compatibility');
  assert.equal(run.complexity, 1);
  assert.equal(g.methods.find((m) => m.id === 'x.ts:Pipeline.validate').complexity, 3); // if + &&
});

test('extractJsTs: this.m() + typed-receiver dispatch resolve to qualified method ids', { skip: skipG }, () => {
  const g = engine.extractJsTs(G_SRC, 'x.ts');
  const has = (from, to) => g.dispatch.some((e) => e.from === from && e.to === to);
  assert.ok(has('x.ts:Pipeline.run', 'x.ts:Pipeline.validate'), 'this.validate()');
  assert.ok(has('x.ts:Pipeline.run', 'x.ts:Pipeline.execute'), 'this.execute()');
  assert.ok(has('x.ts:bootstrap', 'x.ts:Pipeline.run'), 'typed receiver p: Pipeline');
  // precision contract: every emitted edge targets a real qualified method (no guesses)
  const ids = new Set(g.methods.map((m) => m.id));
  assert.ok(g.dispatch.every((e) => ids.has(e.to)), 'dispatch targets only emitted methods');
  assert.equal(g.dispatch.length, 3, 'no spurious edges (doWork().catch / items.join are dropped)');
});

test('extractJsTs: deterministic across runs', { skip: skipG }, () => {
  assert.deepEqual(engine.extractJsTs(G_SRC, 'x.ts'), engine.extractJsTs(G_SRC, 'x.ts'));
});

test('extractJsTs: garbage input never throws (graceful per-file fallback signal)', { skip: skipG }, () => {
  const g = engine.extractJsTs('}{ not valid (((', 'x.ts');
  assert.ok(g === null || (Array.isArray(g.methods) && Array.isArray(g.dispatch)));
});

// Perf-quality finding 6 — web-tree-sitter trees must be freed (no FinalizationRegistry): an
// undeleted tree leaks WASM pages for the process lifetime (measured 1,312MB vs 217MB peak RSS on
// an 11MB corpus). Static tripwire: every parser.parse( site in the engine must have a matching
// tree.delete() (try/finally), so a new parse site can't quietly reintroduce the leak.
test('L-MEM: every parser.parse site in ts-engine.mjs frees its tree', () => {
  const src = readFileSync(script('lib/ts-engine.mjs'), 'utf8');
  const parses = (src.match(/parser\.parse\(/g) || []).length;
  const deletes = (src.match(/tree\.delete\(\)/g) || []).length;
  assert.ok(parses >= 1, 'sanity: engine still parses');
  assert.ok(deletes >= parses, `${parses} parse sites but only ${deletes} tree.delete() calls`);
});
