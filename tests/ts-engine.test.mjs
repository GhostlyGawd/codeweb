// Tests for the optional tree-sitter complexity engine (scripts/lib/ts-engine.mjs).
//
// The engine is an OPTIONAL tier: web-tree-sitter is an optionalDependency, so it may be absent in a
// --no-optional install. Every value assertion is guarded on the engine actually loading; when it is
// unavailable the suite still asserts the contract that loadTsEngine() returns null (the signal the
// extractor uses to fall back to regex). This keeps `npm test` green in both install modes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
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
