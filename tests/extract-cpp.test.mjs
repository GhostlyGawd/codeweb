// C++ on the deterministic fast path (charter non-goal 8 — the grammar bar A2 amended, not
// lowered). Same contract as the other language tiers: class/struct/union/enum -> 'class',
// member-function DEFINITIONS owner-qualified (`file:Type.method`) — in-class bodies via the
// enclosing class range, out-of-line `Type::method` bodies via their own qualifier — free
// functions at namespace scope stay 'function', control flow never becomes a phantom symbol, and
// in-body calls wire by name under the existing precision gate.
//
// The load-bearing C++-specific decision: a PROTOTYPE is not a symbol. `double area() const;` in a
// header and `double Shape::area() const { … }` in the .cpp would otherwise be two same-named
// nodes, and every call to them would drop as ambiguous — the header/implementation split would
// make the language's most ordinary shape unmappable.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpDir, cleanup, writeTree, hasEdge } from './helpers.mjs';
import { runExtract } from '../scripts/extract-symbols.mjs';
import { langOf } from '../scripts/lib/lang-rules.mjs';
import { SRC_RE } from '../scripts/lib/common.mjs';

// The VAL-HARD-004 shape: a namespaced class declared in a header with one inline member, its
// out-of-line definitions in the .cpp, a free factory function, and a caller in a third file.
const FIXTURE = {
  'shape.hpp': `#ifndef GEO_SHAPE_HPP
#define GEO_SHAPE_HPP

namespace geo {

class Shape {
 public:
  explicit Shape(double width);
  double area() const;
  double twice() const { return area() * 2; }

 private:
  double scale() const { return width_; }
  double width_;
};

struct Point {
  double x;
  double y;
};

Shape make_shape(double width);

}  // namespace geo

#endif
`,
  'shape.cpp': `#include "shape.hpp"

namespace geo {

Shape::Shape(double width) : width_(width) {}

double Shape::area() const {
  return width_ * width_;
}

Shape make_shape(double width) {
  return Shape(width);
}

static double unused_helper(double v) {
  return v;
}

}  // namespace geo
`,
  'main.cpp': `#include "shape.hpp"

int main() {
  geo::Shape s = geo::make_shape(2.0);
  return static_cast<int>(s.area());
}
`,
};

async function extract(files = FIXTURE, opts = {}) {
  const dir = tmpDir('codeweb-cpp-');
  try {
    writeTree(dir, files);
    const { fragment } = await runExtract({ path: dir, ctags: false, ...opts });
    return fragment;
  } finally {
    cleanup(dir);
  }
}

test('CPP1: classes, in-class methods, out-of-line methods, and namespace-scope functions', async () => {
  const g = await extract();
  const byId = new Map(g.nodes.map((n) => [n.id, n]));

  const shape = byId.get('shape.hpp:Shape');
  assert.ok(shape, `class Shape discovered (ids: ${g.nodes.map((n) => n.id).join(', ')})`);
  assert.equal(shape.kind, 'class', 'class -> class kind');
  assert.ok(byId.get('shape.hpp:Point')?.kind === 'class', 'struct -> class kind');

  // in-class definition: the owner comes from the enclosing class range (the Java/C#/Python path)
  const twice = byId.get('shape.hpp:Shape.twice');
  assert.ok(twice, 'inline member definition in the header is a method');
  assert.equal(twice.kind, 'method');
  assert.equal(twice.exports, true, 'a member under `public:` is externally visible');
  assert.equal(byId.get('shape.hpp:Shape.scale')?.exports, false, 'a member under `private:` is not');

  // out-of-line definitions: the owner comes from the definition's own `Type::` qualifier, with
  // the enclosing namespace stripped — there is no class range in this file to fall back on.
  const area = byId.get('shape.cpp:Shape.area');
  assert.ok(area, `out-of-line definition owner-qualifies (ids: ${g.nodes.map((n) => n.id).join(', ')})`);
  assert.equal(area.kind, 'method');
  assert.ok(byId.get('shape.cpp:Shape.Shape'), 'a constructor is a method of its class');

  // namespace scope is scope, not ownership: a function inside `namespace geo {` stays a function
  const mk = byId.get('shape.cpp:make_shape');
  assert.ok(mk, 'namespace-scope function stays unqualified');
  assert.equal(mk.kind, 'function');
  assert.equal(mk.exports, true, 'external linkage -> exported');
  assert.equal(byId.get('shape.cpp:unused_helper')?.exports, false, '`static` is internal linkage');

  // a namespace never becomes a symbol: it would own every class in the file and collide across files
  assert.ok(!g.nodes.some((n) => n.label === 'geo'), 'namespaces are scope, not symbols');
  // Signatures parse off the definition line. `params` takes each entry's FIRST token, so a
  // type-first language reports the type — pre-existing behavior C++ shares verbatim with Java
  // and C# (`int x` -> `int`), which is why `raw` is what pins the real parse here.
  assert.deepEqual(area.signature?.params, [], 'a no-arg member signature parses to no params');
  assert.equal(byId.get('shape.cpp:make_shape').signature?.raw, 'double width');
  assert.equal(twice.signature?.raw, '', 'an in-class no-arg definition parses too');
});

test('CPP2: prototypes are not symbols — a declaration and its definition never collide', async () => {
  const g = await extract();
  const ids = g.nodes.map((n) => n.id);
  assert.ok(!ids.includes('shape.hpp:Shape.area'), 'the header PROTOTYPE mints no node');
  assert.ok(!ids.includes('shape.hpp:make_shape'), 'the header declaration of a free function mints no node');
  assert.ok(!ids.includes('shape.hpp:Shape.Shape'), 'the constructor declaration mints no node');
  // one definition per name is exactly what keeps the call edges below resolvable
  assert.equal(ids.filter((id) => id.endsWith(':Shape.area')).length, 1);
  assert.equal(ids.filter((id) => id.endsWith(':make_shape')).length, 1);

  // …and a prototype is not a CALL either. `double area() const;` has a call's exact shape, so an
  // ungated deriver fabricates an edge from whatever encloses the header line to the real
  // definition: the class node "calling" its own methods, and a namespace-scope declaration
  // hanging its edge on <module>. Both are pure noise on the most ordinary C++ file there is.
  const fabricated = g.edges.filter((e) => e.from === 'shape.hpp:Shape' || e.from === 'shape.hpp:<module>');
  assert.deepEqual(fabricated, [], 'header prototypes fabricate no call edges');
});

test('CPP3: cross-file call edges resolve to the definition', async () => {
  const g = await extract();
  assert.ok(hasEdge(g.edges, 'main.cpp:main', 'shape.cpp:make_shape', 'call'),
    `main() calls geo::make_shape() (call edges: ${JSON.stringify(g.edges.filter((e) => e.kind === 'call'))})`);
  assert.ok(hasEdge(g.edges, 'shape.hpp:Shape.twice', 'shape.cpp:Shape.area', 'call'),
    'an unqualified member call in a header body reaches the out-of-line definition');
});

test('CPP4: #include "…" becomes an import edge to the header module', async () => {
  const g = await extract();
  assert.ok(g.nodes.some((n) => n.id === 'shape.hpp:<module>'), 'the included header gets a module node');
  assert.ok(g.edges.some((e) => e.kind === 'import' && e.from.startsWith('main.cpp:') && e.to === 'shape.hpp:<module>'),
    `main.cpp imports shape.hpp (import edges: ${JSON.stringify(g.edges.filter((e) => e.kind === 'import'))})`);
  assert.ok(g.edges.some((e) => e.kind === 'import' && e.from.startsWith('shape.cpp:') && e.to === 'shape.hpp:<module>'),
    'the implementation file imports its own header');
});

test('CPP4b: the include/ + src/ split resolves — the dominant real-world C++ layout', async () => {
  // `#include "shape.hpp"` from src/main.cpp is neither relative to the includer nor to the root.
  // Every such project builds with `-I include`, which codeweb cannot read, so the header is found
  // by unique basename — the same evidence rule Python's absolute-import resolver already uses.
  const g = await extract({
    'include/shape.hpp': 'namespace geo {\nclass Shape {\n public:\n  double area() const;\n};\nShape make_shape(double w);\n}\n',
    'src/shape.cpp': '#include "shape.hpp"\n\nnamespace geo {\ndouble Shape::area() const {\n  return 1.0;\n}\nShape make_shape(double w) {\n  return Shape();\n}\n}\n',
    'src/main.cpp': '#include "shape.hpp"\n\nint main() {\n  geo::Shape s = geo::make_shape(2.0);\n  return 0;\n}\n',
  });
  assert.ok(g.edges.some((e) => e.kind === 'import' && e.from.startsWith('src/main.cpp:') && e.to === 'include/shape.hpp:<module>'),
    `src/main.cpp resolves the header across the include/ split (import edges: ${JSON.stringify(g.edges.filter((e) => e.kind === 'import'))})`);
  assert.ok(hasEdge(g.edges, 'src/main.cpp:main', 'src/shape.cpp:make_shape', 'call'), 'and the call it stands for wires');
});

test('CPP4c: an AMBIGUOUS basename is dropped — a guess is worse than an absent edge', async () => {
  const g = await extract({
    'a/util.hpp': 'int helper_a();\n',
    'b/util.hpp': 'int helper_b();\n',
    'src/app.cpp': '#include "util.hpp"\n\nint run() {\n  return 0;\n}\n',
  });
  assert.ok(!g.edges.some((e) => e.kind === 'import' && /util\.hpp/.test(e.to)),
    'two headers share the basename, so neither is guessed');
});

test('CPP5: angle-bracket and unresolvable includes are dropped, never guessed', async () => {
  const g = await extract({
    'app.cpp': '#include <vector>\n#include "not-here.hpp"\n#include "lib/util.hpp"\n\nint run() {\n  return helper();\n}\n',
    'lib/util.hpp': 'inline int helper() {\n  return 1;\n}\n',
  });
  assert.ok(g.edges.some((e) => e.kind === 'import' && e.to === 'lib/util.hpp:<module>'), 'a resolvable quoted include edges');
  assert.ok(!g.edges.some((e) => /vector|not-here/.test(e.to)), 'system + unresolvable includes mint nothing');
});

test('CPP6: control flow, lambdas and statements never become phantom symbols', async () => {
  const g = await extract({
    'noise.cpp': `#include "noise.hpp"

int classify(int x) {
  if (x > 0) {
    return 1;
  } else if (x < 0) {
    return -1;
  }
  for (int i = 0; i < 3; i++) {
    switch (i) {
      case 0:
        break;
      default:
        break;
    }
  }
  while (x > 100) {
    x = x / 2;
  }
  try {
    auto fn = [](int v) { return v + 1; };
    return fn(x);
  } catch (const std::exception& e) {
    return 0;
  }
}
`,
    'noise.hpp': 'int classify(int x);\n',
  });
  const labels = g.nodes.map((n) => n.label);
  for (const ctrl of ['if', 'for', 'while', 'switch', 'catch', 'try', 'else', 'return', 'sizeof', 'namespace']) {
    assert.ok(!labels.includes(ctrl), `no phantom '${ctrl}' symbol (labels: ${labels.join(', ')})`);
  }
  assert.deepEqual(labels.filter((l) => l === 'classify'), ['classify'], 'exactly one classify — the definition');
});

test('CPP7: meta.languages reports cpp for every C++ extension', async () => {
  const g = await extract({
    'a.cpp': 'int a() {\n  return 1;\n}\n',
    'b.cc': 'int b() {\n  return 2;\n}\n',
    'c.cxx': 'int c() {\n  return 3;\n}\n',
    'd.hpp': 'inline int d() {\n  return 4;\n}\n',
    'e.hh': 'inline int e() {\n  return 5;\n}\n',
    'f.hxx': 'inline int f() {\n  return 6;\n}\n',
  });
  assert.deepEqual(g.meta.languages, ['cpp'], 'all six extensions map to one language name');
  assert.equal(g.nodes.filter((n) => n.kind === 'function').length, 6, 'every extension is scanned, not just enumerated');
});

test('CPP8: SRC_RE and langOf agree on the C++ extension family', () => {
  for (const f of ['a.cpp', 'a.cc', 'a.cxx', 'a.hpp', 'a.hh', 'a.hxx']) {
    assert.equal(SRC_RE.test(f), true, `${f} is a mappable source file`);
    assert.equal(langOf(f), 'cpp', `${f} -> cpp`);
  }
  assert.equal(langOf('a.cs'), 'csharp', 'C# is untouched by the C++ extensions');
});
