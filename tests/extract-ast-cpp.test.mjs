// C++ tree-sitter dispatch tier — the same edges-only contract Java/C#/Go/Rust/Python/Ruby/PHP
// carry (docs/specs/java-cs-tree-sitter.md): the regex tier keeps owning NODES, the AST contributes
// only the member-call edges regex precision-gates away. C++ adds one receiver form the others
// don't have — `p->m()` through a pointer is the same dispatch as `r.m()` through a reference.
// Pins: X1 unique typed-receiver dispatch resolves cross-file (and does NOT under --engine regex),
// X2 an ambiguous receiver class wires nothing, X3 this-calls resolve in-file and the node sets are
// IDENTICAL across engines. All skip gracefully when the grammar/runtime is unavailable.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runNode, script, tmpDir, cleanup, writeTree, readJSON } from './helpers.mjs';
import { loadLangEngine, _resetForTest } from '../scripts/lib/ts-engine.mjs';

const HAVE_CPP = !!(await loadLangEngine('cpp'));
_resetForTest();

function extract(files, extraArgs = []) {
  const dir = tmpDir('codeweb-astcpp-');
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

const CPP_FIX = {
  'helper.hpp': 'class Helper {\n public:\n  int compute(int x);\n};\n',
  'helper.cpp': '#include "helper.hpp"\n\nint Helper::compute(int x) {\n  return x * 2;\n}\n',
  'app.hpp': '#include "helper.hpp"\n\nclass App {\n public:\n  int run(Helper& helper);\n  int runPtr(Helper* helper);\n};\n',
  'app.cpp': '#include "app.hpp"\n\nint App::run(Helper& helper) {\n  return helper.compute(21);\n}\n\nint App::runPtr(Helper* helper) {\n  return helper->compute(21);\n}\n',
};

test('X1 (c++): unique typed-receiver dispatch resolves cross-file with the AST tier only', { skip: HAVE_CPP ? false : 'cpp grammar unavailable' }, () => {
  const ast = extract(CPP_FIX);
  assert.ok(hasEdge(ast.frag, 'app.cpp:App.run', 'helper.cpp:Helper.compute'),
    `AST tier wires helper.compute() through a reference (edges: ${JSON.stringify(ast.frag.edges.filter((e) => e.kind === 'call'))})`);
  assert.ok(hasEdge(ast.frag, 'app.cpp:App.runPtr', 'helper.cpp:Helper.compute'),
    'and through a pointer (`->`) — the C++-only receiver form');
  assert.match(ast.banner, /typed-dispatch \([^)]*cpp[^)]*\) 2 wired/, 'the banner reports both wires');

  const rx = extract(CPP_FIX, ['--engine', 'regex']);
  assert.ok(!hasEdge(rx.frag, 'app.cpp:App.run', 'helper.cpp:Helper.compute'),
    'the regex tier still precision-gates it (the delta this tier exists for)');
});

test('X1b (c++): a NAMESPACE-QUALIFIED parameter type dispatches on its tail', { skip: HAVE_CPP ? false : 'cpp grammar unavailable' }, () => {
  // `const geo::Shape& s` is how C++ is actually written once namespaces are in play — the very
  // shape this language tier is for. The type node is a `qualified_identifier`, whose tail is the
  // class; the leading scopes are namespaces, which are never symbols here (same rule the regex
  // tier applies when it declines to qualify `geo::make_shape` as owned by `geo`).
  const { frag, banner } = extract({
    'shape.hpp': 'namespace geo {\nclass Shape {\n public:\n  double area() const;\n};\n}\n',
    'shape.cpp': '#include "shape.hpp"\n\nnamespace geo {\ndouble Shape::area() const {\n  return 1.0;\n}\n}\n',
    'main.cpp': '#include "shape.hpp"\n\nint report(const geo::Shape& s) {\n  return static_cast<int>(s.area());\n}\n',
  });
  assert.ok(hasEdge(frag, 'main.cpp:report', 'shape.cpp:Shape.area'),
    `a qualified param type dispatches (edges: ${JSON.stringify(frag.edges.filter((e) => e.kind === 'call'))})`);
  assert.match(banner, /typed-dispatch \([^)]*cpp[^)]*\) 1 wired/);
});

test('X1c (c++): a class SPLIT across header and .cpp is one class, not an ambiguity', { skip: HAVE_CPP ? false : 'cpp grammar unavailable' }, () => {
  // `Shape` has one member defined inline in the header and the rest out of line in the .cpp —
  // the header/implementation split, which is how essentially every real C++ class is written.
  // Asking "is this class defined in exactly one file?" answers NO for all of them, so the tier
  // would wire nothing on real code. The precision question is about the METHOD being dispatched:
  // exactly one `Shape.area` in the repo is the evidence, and X2 pins that two still wire nothing.
  const { frag, banner } = extract({
    'shape.hpp': 'namespace geo {\nclass Shape {\n public:\n  double area() const;\n  double twice() const { return area() * 2; }\n};\n}\n',
    'shape.cpp': '#include "shape.hpp"\n\nnamespace geo {\ndouble Shape::area() const {\n  return 1.0;\n}\n}\n',
    'main.cpp': '#include "shape.hpp"\n\nint report(const geo::Shape& s) {\n  return static_cast<int>(s.area());\n}\n',
  });
  assert.ok(frag.nodes.some((n) => n.id === 'shape.hpp:Shape.twice'), 'the inline member is defined in the header');
  assert.ok(frag.nodes.some((n) => n.id === 'shape.cpp:Shape.area'), 'the out-of-line member is defined in the .cpp');
  assert.ok(hasEdge(frag, 'main.cpp:report', 'shape.cpp:Shape.area'),
    `the split does not defeat dispatch (edges: ${JSON.stringify(frag.edges.filter((e) => e.kind === 'call'))})`);
  assert.match(banner, /typed-dispatch \([^)]*cpp[^)]*\) 1 wired/);
});

test('X2 (c++): an ambiguous receiver class wires NOTHING', { skip: HAVE_CPP ? false : 'cpp grammar unavailable' }, () => {
  const { frag, banner } = extract({
    ...CPP_FIX,
    'other/helper.hpp': 'class Helper {\n public:\n  int compute(int x);\n};\n',
    'other/helper.cpp': '#include "helper.hpp"\n\nint Helper::compute(int x) {\n  return x + 1;\n}\n',
  });
  assert.ok(!frag.edges.some((e) => e.kind === 'call' && e.from.endsWith('app.cpp:App.run') && /Helper\.compute$/.test(e.to)),
    'two Helper classes -> never guess');
  assert.match(banner, /typed-dispatch \([^)]*cpp[^)]*\) 0 wired, 2 dropped/, 'the drops are counted, not silent');
});

test('X3 (c++): this-calls resolve in-file; the node set is identical across engines', { skip: HAVE_CPP ? false : 'cpp grammar unavailable' }, () => {
  const FIX = {
    'svc.hpp': 'class Svc {\n public:\n  int a();\n  int b();\n};\n',
    'svc.cpp': '#include "svc.hpp"\n\nint Svc::a() {\n  return this->b();\n}\n\nint Svc::b() {\n  return 1;\n}\n',
  };
  const ast = extract(FIX);
  assert.ok(hasEdge(ast.frag, 'svc.cpp:Svc.a', 'svc.cpp:Svc.b'), 'this->b() wires in-file');
  const rx = extract(FIX, ['--engine', 'regex']);
  assert.deepEqual(
    ast.frag.nodes.map((n) => n.id).sort(), rx.frag.nodes.map((n) => n.id).sort(),
    'the tier adds EDGES only — node extraction stays the regex tier verbatim');
});
