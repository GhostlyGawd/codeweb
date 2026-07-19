// Spec A (docs/specs/perf-lazy-ast.md): the tree-sitter tier initializes LAZILY — a run that
// scans zero JS/TS files (warm cache, or a target with none) never pays the WASM init, yet the
// fragment stays byte-identical to a cold run. The AST products (qualified methods, dispatch,
// per-node complexity) ride the scan cache so warm refreshes cost ~the regex baseline.
//
// L1: cold-vs-warm byte identity + ast: loaded -> ast: idle.
// L2: a target with no JS/TS files never loads the engine, even cold.
// L3: --engine regex reports ast: off and keeps the regex cache namespace.
// L4: the probe's version string is exactly the loaded engine's version (meta can't drift).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, tmpDir, cleanup, writeTree, script, PLUGIN_ROOT } from './helpers.mjs';

const EXTRACT = script('extract-symbols.mjs');
const GRAMMAR = join(PLUGIN_ROOT, 'scripts', 'grammars', 'tree-sitter-typescript.wasm');
const hasEngine = existsSync(GRAMMAR) && existsSync(join(PLUGIN_ROOT, 'node_modules', 'web-tree-sitter'));

const TS_FIXTURE = {
  'src/pipeline.ts': [
    'export class Pipeline {',
    '  run(x: number): number {',
    '    if (x > 0) { return this.validate(x); }',
    '    return 0;',
    '  }',
    '  validate(v: number): number { return v && v > 1 ? v : 1; }',
    '}',
    'export function bootstrap(p: Pipeline): number { return p.run(2); }',
    '',
  ].join('\n'),
  'src/util.ts': 'export function clamp(n: number): number {\n  return n < 0 ? 0 : n;\n}\n',
};

function extract(dir, args = []) {
  const out = join(dir, 'frag.json');
  const r = runNode(EXTRACT, [join(dir, 'src'), '--out', out, ...args]);
  assert.equal(r.status, 0, r.stderr);
  return { bytes: readFileSync(out), stderr: r.stderr };
}

test('L1: warm cached run never initializes the AST engine and is byte-identical to cold', { skip: hasEngine ? false : 'tree-sitter unavailable' }, () => {
  const dir = tmpDir('codeweb-lazyast-');
  try {
    writeTree(dir, TS_FIXTURE);
    const cache = join(dir, 'cache.json');
    const cold = extract(dir, ['--cache', cache]);
    assert.match(cold.stderr, /ast: loaded/, `cold run parses, so the engine loads (stderr: ${cold.stderr})`);
    const warm = extract(dir, ['--cache', cache]);
    assert.match(warm.stderr, /scanned 0\/2 file/, 'warm run rescans nothing');
    assert.match(warm.stderr, /ast: idle/, `warm run must not initialize the engine (stderr: ${warm.stderr})`);
    assert.ok(cold.bytes.equals(warm.bytes), 'fragments byte-identical with the engine unloaded');
    const frag = JSON.parse(warm.bytes);
    assert.ok(frag.meta.complexityEngine, 'meta still records the tier that owns complexity');
    assert.ok(frag.nodes.some((n) => n.id.endsWith('pipeline.ts:Pipeline.run')), 'qualified method ids survive the cache');
    assert.ok(frag.edges.some((e) => e.to.endsWith('Pipeline.validate')), 'dispatch edges survive the cache');
  } finally { cleanup(dir); }
});

// (Spec F made Python/Go/Rust AST-dispatch languages, so a cold Python run now loads the tier
// legitimately — the lazy contract for them is the same as JS/TS's: WARM runs stay idle.)
test('L2: a warm cached run of a dispatch-tier language never re-initializes the engine', { skip: hasEngine ? false : 'tree-sitter unavailable' }, () => {
  const dir = tmpDir('codeweb-lazyast-');
  try {
    writeTree(dir, { 'src/only.py': 'class Solo:\n    def a(self):\n        return self.b()\n    def b(self):\n        return 1\n' });
    const cache = join(dir, 'cache.json');
    const cold = extract(dir, ['--cache', cache]);
    assert.match(cold.stderr, /ast: loaded/, `cold python run parses for dispatch (stderr: ${cold.stderr})`);
    const warm = extract(dir, ['--cache', cache]);
    assert.match(warm.stderr, /ast: idle/, `warm python run rides the cache (stderr: ${warm.stderr})`);
    assert.ok(cold.bytes.equals(warm.bytes), 'byte-identical either way');
  } finally { cleanup(dir); }
});

test('L3: --engine regex reports ast: off and the regex cache namespace', () => {
  const dir = tmpDir('codeweb-lazyast-');
  try {
    writeTree(dir, TS_FIXTURE);
    const cache = join(dir, 'cache.json');
    const r = extract(dir, ['--engine', 'regex', '--cache', cache]);
    assert.match(r.stderr, /ast: off/, r.stderr);
    const c = JSON.parse(readFileSync(cache, 'utf8'));
    assert.ok(!c.engine.includes('+ts'), `regex runs keep the regex namespace (got ${c.engine})`);
  } finally { cleanup(dir); }
});

test('L4: probe version string equals the loaded engine version', { skip: hasEngine ? false : 'tree-sitter unavailable' }, async () => {
  const mod = await import('../scripts/lib/ts-engine.mjs');
  assert.equal(typeof mod.probeAst, 'function', 'probeAst is exported');
  const probe = mod.probeAst();
  assert.equal(probe.ts, true, 'probe sees the vendored TS grammar');
  mod._resetForTest();
  const eng = await mod.loadTsEngine();
  assert.ok(eng, 'engine loads in this environment');
  assert.equal(probe.tsVersion, eng.version, 'meta stamped from the probe can never diverge from the loaded tier');
});
