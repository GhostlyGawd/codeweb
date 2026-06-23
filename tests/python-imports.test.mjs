// Regression suite for PYTHON import resolution. The import pass was JS/TS-only (require/ESM), so a
// Python file's `from .mod import f` / `from . import sub` / `import pkg.mod as m` produced no alias
// and no `m.member()` resolution — cross-module Python recall was lost (the pilot's render_template
// target lagged). This wires a Python pass that feeds the SAME machinery: named imports -> precise
// alias (pins the exact symbol even when the bare name is ambiguous), submodule/aliased-module imports
// -> namespace binding so `m.member()` resolves, all precision-safe (a param `obj.method()` stays
// unresolved). Absolute imports require >=2 segments so `import json` can't grab a local json package.
//
// --no-ctags forces deterministic extraction regardless of host tooling.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runNode, tmpDir, cleanup, writeTree, readJSON, script, hasEdge } from './helpers.mjs';

const FILES = {
  'pkg/__init__.py': '',
  'pkg/utils.py':
    'def helper(x):\n' +
    '    return x + 1\n' +
    '\n' +
    'def shout(s):\n' +
    '    return s.upper()\n',
  // a second `helper` makes the BARE name ambiguous -> only the import alias can pin the right one.
  'pkg/other.py':
    'def helper(y):\n' +
    '    return y - 1\n',
  'pkg/models.py':
    'def build(n):\n' +
    '    return n * 2\n',
  'pkg/services.py':
    'from .utils import helper\n' +       // relative named import -> alias helper = pkg/utils.py:helper
    'from . import models\n' +            // relative submodule import -> namespace binding for models.*
    'def process(n):\n' +
    '    a = helper(n)\n' +               //   -> pkg/utils.py:helper (alias), NOT pkg/other.py:helper
    '    b = models.build(n)\n' +         //   -> pkg/models.py:build  (submodule member access)
    '    return a + b\n' +
    'def run(obj):\n' +
    '    return obj.helper(1)\n',         //   obj is a PARAM -> must NOT edge to any helper
  'pkg/handlers.py':
    'import pkg.models as m\n' +          // absolute (>=2 segments) aliased module import
    'def handle(n):\n' +
    '    return m.build(n)\n',            //   -> pkg/models.py:build (member via alias)
};

let SRC, OUT;
before(() => { SRC = tmpDir('codeweb-pyimp-'); writeTree(SRC, FILES); OUT = join(SRC, 'fragment.json'); });
after(() => cleanup(SRC));

function extract() {
  const res = runNode(script('extract-symbols.mjs'), [SRC, '--target', 'pyimp-x', '--no-ctags', '--out', OUT]);
  assert.equal(res.status, 0, `extractor exited non-zero:\n${res.stderr}`);
  return readJSON(OUT);
}

test('RECALL+PRECISION: a relative named import pins the bare call to the exact symbol', () => {
  const frag = extract();
  assert.ok(hasEdge(frag.edges, 'pkg/services.py:process', 'pkg/utils.py:helper', 'call'),
    'helper() resolves to pkg/utils.py:helper via `from .utils import helper`');
  assert.ok(!hasEdge(frag.edges, 'pkg/services.py:process', 'pkg/other.py:helper', 'call'),
    'the alias pins utils.helper, not the same-named other.helper');
});

test('RECALL: a relative submodule member call resolves (from . import models; models.build())', () => {
  const frag = extract();
  assert.ok(hasEdge(frag.edges, 'pkg/services.py:process', 'pkg/models.py:build', 'call'),
    'models.build() -> pkg/models.py:build');
});

test('RECALL: an absolute aliased module member call resolves (import pkg.models as m; m.build())', () => {
  const frag = extract();
  assert.ok(hasEdge(frag.edges, 'pkg/handlers.py:handle', 'pkg/models.py:build', 'call'),
    'm.build() -> pkg/models.py:build');
});

test('the submodule import emits a coarse <module> edge (not a symbol edge)', () => {
  const frag = extract();
  assert.ok(frag.nodes.some((n) => n.id === 'pkg/models.py:<module>' && n.kind === 'module'),
    'a <module> node exists for the imported submodule');
  assert.ok(hasEdge(frag.edges, 'pkg/services.py:process', 'pkg/models.py:<module>', 'import'),
    '`from . import models` lands a coarse edge on pkg/models.py:<module>');
});

test('PRECISION: a param obj.helper() fabricates no edge', () => {
  const frag = extract();
  assert.ok(!hasEdge(frag.edges, 'pkg/services.py:run', 'pkg/utils.py:helper'),
    'obj is a param, not an import alias -> no edge to utils.helper');
  assert.ok(!hasEdge(frag.edges, 'pkg/services.py:run', 'pkg/other.py:helper'),
    'obj is a param, not an import alias -> no edge to other.helper');
});

test('DEPENDENTS: --dependents build includes both the submodule and absolute-alias callers', () => {
  const frag = extract();
  const GP = join(SRC, 'graph.json');
  writeTree(SRC, { 'graph.json': JSON.stringify(frag) });
  const dep = runNode(script('query.mjs'), [GP, '--dependents', 'pkg/models.py:build', '--json']);
  assert.equal(dep.status, 0, dep.stderr);
  const j = JSON.parse(dep.stdout);
  assert.ok(j.results.includes('pkg/services.py:process'), 'process depends on build');
  assert.ok(j.results.includes('pkg/handlers.py:handle'), 'handle depends on build');
});
