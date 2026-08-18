// C on the deterministic fast path (charter non-goal 8 as amended by A2 — the second trusted
// grammar source, an official tree-sitter org release, is what makes the AST tier possible here).
// C reuses the C++ scanner branch: the two languages share a lexis, a definition shape, and the
// `#include "…"` binding, so one rule set serves both and neither can silently drift from the other.
//
// What C does NOT share is ownership. C has no classes and no member functions, so every symbol is
// a free function at file scope, and `struct Ops { int (*compute)(int); }` is a plain aggregate —
// its members are DATA (function POINTERS), not definitions. The C-specific pins below are
// therefore about what must NOT appear: no owner qualification, no method kind, no phantom symbol
// minted from a struct field, and no call edge guessed from `ops.compute(v)` (the target of that
// call is whatever the initializer assigned, which is evidence the regex tier does not hold).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpDir, cleanup, writeTree, hasEdge } from './helpers.mjs';
import { runExtract } from '../scripts/extract-symbols.mjs';
import { langOf } from '../scripts/lib/lang-rules.mjs';
import { SRC_RE } from '../scripts/lib/common.mjs';

// The VAL-HARD-002/003 shape: a header declaring a function, its definition in a second
// translation unit, and a third file calling it through the header.
const FIXTURE = {
  'helper.h': `#ifndef HELPER_H
#define HELPER_H

int helper(int x);

#endif
`,
  'helper.c': `#include "helper.h"

int helper(int x) {
  return x + 1;
}

static int scale(int v) {
  return v * 2;
}
`,
  'main.c': `#include "helper.h"

int main(void) {
  return helper(1);
}
`,
};

async function extract(files = FIXTURE, opts = {}) {
  const dir = tmpDir('codeweb-c-');
  try {
    writeTree(dir, files);
    const { fragment } = await runExtract({ path: dir, ctags: false, ...opts });
    return fragment;
  } finally {
    cleanup(dir);
  }
}

test('C1: functions are extracted from .c and .h with C linkage as the export rule', async () => {
  const g = await extract();
  const byId = new Map(g.nodes.map((n) => [n.id, n]));

  const helper = byId.get('helper.c:helper');
  assert.ok(helper, `helper() discovered (ids: ${g.nodes.map((n) => n.id).join(', ')})`);
  assert.equal(helper.kind, 'function', 'a C function is a function, never a method');
  assert.equal(helper.exports, true, 'external linkage -> exported');
  assert.equal(helper.owner, undefined, 'C has no owners — nothing qualifies a free function');

  assert.equal(byId.get('helper.c:scale')?.exports, false, '`static` is internal linkage');
  assert.ok(byId.get('main.c:main'), 'main() is an ordinary function node');

  // C shares the prototype rule with C++: a declaration is not a definition, so the header's
  // `int helper(int x);` mints nothing and the call below has exactly one target to resolve to.
  assert.ok(!byId.get('helper.h:helper'), 'the header PROTOTYPE mints no node');
  assert.equal(g.nodes.filter((n) => n.label === 'helper').length, 1, 'one definition, one node');

  assert.deepEqual(g.meta.languages, ['c'], 'meta.languages names the language');
});

test('C2: a cross-file call through a header resolves to the definition', async () => {
  const g = await extract();
  assert.ok(hasEdge(g.edges, 'main.c:main', 'helper.c:helper', 'call'),
    `main() calls helper() across translation units (call edges: ${JSON.stringify(g.edges.filter((e) => e.kind === 'call'))})`);
});

test('C3: #include "…" becomes an import edge to the header module', async () => {
  const g = await extract();
  assert.ok(g.nodes.some((n) => n.id === 'helper.h:<module>'), 'the included header gets a module node');
  assert.ok(g.edges.some((e) => e.kind === 'import' && e.from.startsWith('main.c:') && e.to === 'helper.h:<module>'),
    `main.c imports helper.h (import edges: ${JSON.stringify(g.edges.filter((e) => e.kind === 'import'))})`);
  assert.ok(g.edges.some((e) => e.kind === 'import' && e.from.startsWith('helper.c:') && e.to === 'helper.h:<module>'),
    'the implementation file imports its own header');
});

test('C3b: system includes and unresolvable headers are dropped, never guessed', async () => {
  const g = await extract({
    'app.c': '#include <stdio.h>\n#include "not-here.h"\n#include "lib/util.h"\n\nint run(void) {\n  return util_helper();\n}\n',
    'lib/util.h': 'static inline int util_helper(void) {\n  return 1;\n}\n',
  });
  assert.ok(g.edges.some((e) => e.kind === 'import' && e.to === 'lib/util.h:<module>'), 'a resolvable quoted include edges');
  assert.ok(!g.edges.some((e) => /stdio|not-here/.test(e.to)), 'system + unresolvable includes mint nothing');
});

test('C4: a struct of function POINTERS mints no symbols and guesses no call', async () => {
  // This is C's substitute for methods, and it is the one shape where a rule copied from C++
  // would fabricate: `int (*compute)(int);` has a definition's exact silhouette (a name, a paren
  // list) and `ops.compute(v)` has a call's. Neither is one. The field is DATA, and the call's
  // real target is whatever the initializer assigned — evidence the regex tier does not hold, so
  // the honest output is no node and no edge rather than a guess.
  const g = await extract({
    'ops.h': `#ifndef OPS_H
#define OPS_H

struct Ops {
  int (*compute)(int);
  void (*log)(const char *m);
};

#endif
`,
    'ops.c': `#include "ops.h"

static int impl_compute(int x) {
  return x * 2;
}

int dispatch(struct Ops *o, int v) {
  return o->compute(v);
}
`,
  });
  const labels = g.nodes.map((n) => n.label);
  assert.ok(!labels.includes('compute'), `a function-POINTER field is data, not a definition (labels: ${labels.join(', ')})`);
  assert.ok(!labels.includes('log'), 'nor is the second field');
  assert.ok(g.nodes.some((n) => n.id === 'ops.h:Ops'), 'the struct itself is a node');
  assert.ok(g.nodes.some((n) => n.id === 'ops.c:dispatch'), 'and the real function is');
  assert.ok(!g.edges.some((e) => e.kind === 'call' && /compute/.test(e.to)),
    `o->compute(v) resolves through a pointer the map cannot follow — absent, not guessed (edges: ${JSON.stringify(g.edges)})`);
});

test('C5: control flow, macros and casts never become phantom symbols', async () => {
  const g = await extract({
    'noise.h': 'int classify(int x);\n',
    'noise.c': `#include "noise.h"
#include <stdlib.h>

#define MAX(a, b) ((a) > (b) ? (a) : (b))

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
  return (int)sizeof(int);
}
`,
  });
  const labels = g.nodes.map((n) => n.label);
  for (const ctrl of ['if', 'for', 'while', 'switch', 'else', 'return', 'sizeof', 'MAX', 'define']) {
    assert.ok(!labels.includes(ctrl), `no phantom '${ctrl}' symbol (labels: ${labels.join(', ')})`);
  }
  assert.deepEqual(labels.filter((l) => l === 'classify'), ['classify'], 'exactly one classify — the definition');
});

test('C6: a .h holding a real definition is scanned like any other translation unit', async () => {
  // `static inline` in a header is idiomatic C, and it IS a definition — the prototype rule must
  // not swallow it just because the file is a header.
  const g = await extract({
    'inline.h': 'static inline int twice(int v) {\n  return v * 2;\n}\n',
    'use.c': '#include "inline.h"\n\nint quad(int v) {\n  return twice(twice(v));\n}\n',
  });
  assert.ok(g.nodes.some((n) => n.id === 'inline.h:twice'), 'a definition in a header is a node');
  assert.ok(hasEdge(g.edges, 'use.c:quad', 'inline.h:twice', 'call'), 'and calls to it wire');
});

test('C7: SRC_RE and langOf agree on the C extension family (and C++ is untouched)', () => {
  for (const f of ['a.c', 'a.h', 'src/deep/path/a.c']) {
    assert.equal(SRC_RE.test(f), true, `${f} is a mappable source file`);
    assert.equal(langOf(f), 'c', `${f} -> c`);
  }
  for (const f of ['a.cpp', 'a.cc', 'a.cxx', 'a.hpp', 'a.hh', 'a.hxx']) {
    assert.equal(SRC_RE.test(f), true, `${f} is a mappable source file`);
    assert.equal(langOf(f), 'cpp', `${f} -> cpp`);
  }
  assert.equal(langOf('a.cs'), 'csharp', 'C# is untouched by the C extensions');
  assert.equal(langOf('a.js'), 'javascript', 'the JS fallback still answers for JS');
});

test('C8: a mixed C and C++ tree reports both languages, each with its own rules', async () => {
  // The `.h` ambiguity made concrete: a header included by a .cpp is still classified `c` by
  // extension (the only evidence a static reader has), and both languages map in one pass.
  const g = await extract({
    'core.h': 'int core_init(void);\n',
    'core.c': '#include "core.h"\n\nint core_init(void) {\n  return 0;\n}\n',
    'app.cpp': '#include "core.h"\n\nclass App {\n public:\n  int boot() { return core_init(); }\n};\n',
  });
  assert.deepEqual(g.meta.languages, ['c', 'cpp'], 'both languages are reported');
  assert.ok(g.nodes.some((n) => n.id === 'app.cpp:App'), 'the C++ class is a class');
  assert.ok(g.nodes.some((n) => n.id === 'app.cpp:App.boot'), 'and its member is owner-qualified');
  assert.ok(g.nodes.some((n) => n.id === 'core.c:core_init'), 'the C function is a bare function');
  assert.ok(hasEdge(g.edges, 'app.cpp:App.boot', 'core.c:core_init', 'call'),
    `a C++ member calling a C function wires across the language boundary (edges: ${JSON.stringify(g.edges.filter((e) => e.kind === 'call'))})`);
});
