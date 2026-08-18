// C tree-sitter dispatch tier — same edges-only contract every other language tier carries
// (docs/specs/java-cs-tree-sitter.md): the regex tier keeps owning NODES, the AST contributes only
// the call edges regex precision-gates away.
//
// C's dispatch shape is not a receiver call, because C has no methods. It is the FUNCTION-POINTER
// TABLE — `struct Ops ops = { .compute = impl_compute };` then `ops.compute(v)` — which is how C
// does polymorphism (driver ops structs, plugin vtables). The designated initializer literally
// names the implementation, so the edge rests on evidence rather than a guess; the regex tier
// drops the same call because `.`/`->` receivers are gated there, and it has no way to read the
// initializer.
//
// Pins: CA1 a bound table call wires (and does NOT under CODEWEB_ENGINE=regex), CA2 an UNBOUND
// receiver wires nothing, CA3 an ambiguous binding wires nothing, CA4 the node sets are identical
// across engines. All skip gracefully when the grammar/runtime is unavailable.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runNode, script, tmpDir, cleanup, writeTree, readJSON } from './helpers.mjs';
import { loadLangEngine, _resetForTest } from '../scripts/lib/ts-engine.mjs';

const HAVE_C = !!(await loadLangEngine('c'));
_resetForTest();

function extract(files, extraArgs = []) {
  const dir = tmpDir('codeweb-astc-');
  writeTree(dir, files);
  const out = join(dir, 'fragment.json');
  const r = runNode(script('extract-symbols.mjs'), [dir, '--no-ctags', '--out', out, ...extraArgs]);
  assert.equal(r.status, 0, r.stderr);
  const frag = readJSON(out);
  cleanup(dir);
  return { frag, banner: r.stderr };
}
const hasEdge = (frag, fromEnd, toEnd, kind = 'call') =>
  frag.edges.some((e) => e.kind === kind && e.from.endsWith(fromEnd) && e.to.endsWith(toEnd));

const TABLE_FIX = {
  'ops.h': 'struct Ops {\n  int (*compute)(int);\n  void (*reset)(void);\n};\n',
  'driver.c': `#include "ops.h"

static int impl_compute(int x) {
  return x * 2;
}

static void impl_reset(void) {
}

static const struct Ops ops = {
  .compute = impl_compute,
  .reset = impl_reset,
};

int run(int v) {
  return ops.compute(v);
}
`,
};

test('CA1 (c): a bound function-pointer table wires the call to its implementation', { skip: HAVE_C ? false : 'c grammar unavailable' }, () => {
  const ast = extract(TABLE_FIX);
  assert.ok(hasEdge(ast.frag, 'driver.c:run', 'driver.c:impl_compute'),
    `the AST tier follows .compute to impl_compute (call edges: ${JSON.stringify(ast.frag.edges.filter((e) => e.kind === 'call'))})`);

  const rx = extract(TABLE_FIX, ['--engine', 'regex']);
  assert.ok(!hasEdge(rx.frag, 'driver.c:run', 'driver.c:impl_compute'),
    'the regex tier still precision-gates the receiver call (the delta this tier exists for)');
});

test('CA2 (c): an UNBOUND receiver wires nothing — a pointer parameter is not evidence', { skip: HAVE_C ? false : 'c grammar unavailable' }, () => {
  // `o` is a parameter: what it points at is decided by the caller, at runtime. There is no
  // initializer to read, so there is nothing to resolve and the honest output is no edge.
  const { frag } = extract({
    'ops.h': 'struct Ops {\n  int (*compute)(int);\n};\n',
    'use.c': `#include "ops.h"

static int impl_compute(int x) {
  return x * 2;
}

int dispatch(struct Ops *o, int v) {
  return o->compute(v);
}
`,
  });
  assert.ok(!frag.edges.some((e) => e.kind === 'call' && /impl_compute$/.test(e.to)),
    `an unbound receiver is never guessed (edges: ${JSON.stringify(frag.edges.filter((e) => e.kind === 'call'))})`);
});

test('CA3 (c): a field bound TWO ways in one file is ambiguous — neither wires', { skip: HAVE_C ? false : 'c grammar unavailable' }, () => {
  const { frag } = extract({
    'ops.h': 'struct Ops {\n  int (*compute)(int);\n};\n',
    'two.c': `#include "ops.h"

static int impl_a(int x) {
  return x + 1;
}

static int impl_b(int x) {
  return x + 2;
}

static struct Ops ops = { .compute = impl_a };

int rebind(int v) {
  struct Ops ops = { .compute = impl_b };
  return ops.compute(v);
}
`,
  });
  assert.ok(!frag.edges.some((e) => e.kind === 'call' && /impl_(a|b)$/.test(e.to)),
    `one name bound to two implementations is a genuine ambiguity (edges: ${JSON.stringify(frag.edges.filter((e) => e.kind === 'call'))})`);
});

test('CA4 (c): the tier adds EDGES only — node sets are identical across engines', { skip: HAVE_C ? false : 'c grammar unavailable' }, () => {
  const ast = extract(TABLE_FIX);
  const rx = extract(TABLE_FIX, ['--engine', 'regex']);
  assert.deepEqual(
    ast.frag.nodes.map((n) => n.id).sort(), rx.frag.nodes.map((n) => n.id).sort(),
    'node extraction stays the regex tier verbatim');
});

// ---- VAL-HARD-005: the C and C++ fixtures hold in BOTH tiers -------------------------------
// The engine is selected by CODEWEB_ENGINE (there is no --engine flag on the codeweb CLI front
// door; extract-symbols.mjs accepts one, and reads the env var as its default). What must be true
// is that neither tier is a different LANGUAGE: the same symbols, the same cross-file call edge,
// the same include edge, whichever tier ran.

const C_FIXTURE = {
  'helper.h': 'int helper(int x);\n',
  'helper.c': '#include "helper.h"\n\nint helper(int x) {\n  return x + 1;\n}\n',
  'main.c': '#include "helper.h"\n\nint main(void) {\n  return helper(1);\n}\n',
};

const CPP_FIXTURE = {
  'shape.hpp': 'namespace geo {\nclass Shape {\n public:\n  double area() const;\n};\nShape make_shape(double w);\n}\n',
  'shape.cpp': '#include "shape.hpp"\n\nnamespace geo {\ndouble Shape::area() const {\n  return 1.0;\n}\nShape make_shape(double w) {\n  return Shape();\n}\n}\n',
  'main.cpp': '#include "shape.hpp"\n\nint main() {\n  geo::Shape s = geo::make_shape(2.0);\n  return 0;\n}\n',
};

for (const engine of ['tree-sitter', 'regex']) {
  test(`CA5 (c): the C fixture holds under CODEWEB_ENGINE=${engine}`, () => {
    const dir = tmpDir('codeweb-cenv-');
    writeTree(dir, C_FIXTURE);
    const out = join(dir, 'fragment.json');
    const r = runNode(script('extract-symbols.mjs'), [dir, '--no-ctags', '--out', out], { env: { CODEWEB_ENGINE: engine } });
    assert.equal(r.status, 0, r.stderr);
    const frag = readJSON(out);
    cleanup(dir);

    assert.deepEqual(frag.meta.languages, ['c'], 'the language is reported in both tiers');
    const ids = frag.nodes.map((n) => n.id);
    assert.ok(ids.includes('helper.c:helper'), `helper is extracted (${engine}): ${ids.join(', ')}`);
    assert.ok(ids.includes('main.c:main'), `main is extracted (${engine})`);
    assert.ok(hasEdge(frag, 'main.c:main', 'helper.c:helper'), `the cross-file call holds (${engine})`);
    assert.ok(frag.edges.some((e) => e.kind === 'import' && e.to === 'helper.h:<module>'),
      `the include->import edge holds (${engine})`);
  });

  test(`CA6 (c++): the C++ fixture holds under CODEWEB_ENGINE=${engine}`, () => {
    const dir = tmpDir('codeweb-cppenv-');
    writeTree(dir, CPP_FIXTURE);
    const out = join(dir, 'fragment.json');
    const r = runNode(script('extract-symbols.mjs'), [dir, '--no-ctags', '--out', out], { env: { CODEWEB_ENGINE: engine } });
    assert.equal(r.status, 0, r.stderr);
    const frag = readJSON(out);
    cleanup(dir);

    assert.deepEqual(frag.meta.languages, ['cpp'], 'the language is reported in both tiers');
    const ids = frag.nodes.map((n) => n.id);
    assert.ok(ids.includes('shape.hpp:Shape'), `the class is extracted (${engine}): ${ids.join(', ')}`);
    assert.ok(ids.includes('shape.cpp:Shape.area'), `the out-of-line member is owner-qualified (${engine})`);
    assert.ok(ids.includes('shape.cpp:make_shape'), `the free function is extracted (${engine})`);
    assert.ok(hasEdge(frag, 'main.cpp:main', 'shape.cpp:make_shape'), `the cross-file call holds (${engine})`);
    assert.ok(frag.edges.some((e) => e.kind === 'import' && e.to === 'shape.hpp:<module>'),
      `the include->import edge holds (${engine})`);
  });
}

test('CA7: the tree-sitter run never claims a tier it did not use', { skip: HAVE_C ? false : 'c grammar unavailable' }, () => {
  // The failure this guards is a SILENT fallback: the engine fails to load, the run quietly
  // degrades to regex, and the artifact still advertises the AST tier. The banner's `ast:` state
  // is the honest record, so a loaded tier must say so.
  const dir = tmpDir('codeweb-cbanner-');
  writeTree(dir, TABLE_FIX);
  const out = join(dir, 'fragment.json');
  const r = runNode(script('extract-symbols.mjs'), [dir, '--no-ctags', '--out', out], { env: { CODEWEB_ENGINE: 'tree-sitter' } });
  assert.equal(r.status, 0, r.stderr);
  cleanup(dir);
  assert.match(r.stderr, /ast: loaded/, `the AST tier reports itself loaded (banner: ${r.stderr})`);
  assert.doesNotMatch(r.stderr, /engine failed to load/, 'and no engine reported a failed load');
});
