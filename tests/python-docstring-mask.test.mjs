// Regression suite for PYTHON docstring/comment masking. The scanner ran the def/class/call regexes
// over raw source, so code INSIDE a triple-quoted docstring or a `#` comment was treated as real:
// flask's make_response docstring (a `def index(): return render_template(...)` example) fabricated a
// phantom `index` symbol AND a make_response -> render_template caller edge — a false dependent the
// efficiency pilot's render_template target had to triage. Mask docstrings + comments (column- and
// line-preserving) before BOTH symbol discovery and edge derivation; real code is untouched.
//
// --no-ctags forces the deterministic regex scanner (the path that does the masking).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runNode, tmpDir, cleanup, writeTree, readJSON, script, hasEdge } from './helpers.mjs';

const FILES = {
  'lib.py':
    'def render_template(name):\n' +
    '    return name\n',
  'app.py':
    'def make_response(*args):\n' +
    '    """Set headers on a view response.\n' +
    '\n' +
    '    Example::\n' +
    '\n' +
    '        def index():\n' +                                 // phantom symbol (in docstring)
    "            return render_template('index.html')\n" +      // fabricated edge (in docstring)
    '\n' +
    "        response = make_response(render_template('x.html'))\n" +  // fabricated edge (in docstring)
    '    """\n' +
    '    return real_helper()\n' +                             // REAL call -> app.py:real_helper
    '\n' +
    'def real_helper():\n' +
    '    return 1\n' +
    '\n' +
    'def commented():\n' +
    "    # render_template('commented.html') is only a comment\n" +  // fabricated edge (in comment)
    '    return 0\n' +
    '\n' +
    'def actual():\n' +
    "    return render_template('y.html')\n",                  // REAL call -> lib.py:render_template
};

let SRC, OUT;
before(() => { SRC = tmpDir('codeweb-pydoc-'); writeTree(SRC, FILES); OUT = join(SRC, 'fragment.json'); });
after(() => cleanup(SRC));

function extract() {
  const res = runNode(script('extract-symbols.mjs'), [SRC, '--target', 'pydoc-x', '--no-ctags', '--out', OUT]);
  assert.equal(res.status, 0, `extractor exited non-zero:\n${res.stderr}`);
  return readJSON(OUT);
}

test('no phantom symbol is extracted from inside a docstring', () => {
  const frag = extract();
  assert.ok(!frag.nodes.some((n) => n.id === 'app.py:index'),
    'the `def index()` inside make_response\'s docstring must not become a symbol');
});

test('no call edge is fabricated from inside a docstring', () => {
  const frag = extract();
  assert.ok(!hasEdge(frag.edges, 'app.py:make_response', 'lib.py:render_template'),
    'the render_template() calls live in make_response\'s docstring -> no edge');
});

test('no call edge is fabricated from inside a # comment', () => {
  const frag = extract();
  assert.ok(!hasEdge(frag.edges, 'app.py:commented', 'lib.py:render_template'),
    'the render_template() is only in a comment -> no edge');
});

test('a REAL call after the docstring is still extracted', () => {
  const frag = extract();
  assert.ok(hasEdge(frag.edges, 'app.py:actual', 'lib.py:render_template', 'call'),
    'actual() really calls render_template -> edge preserved');
  assert.ok(hasEdge(frag.edges, 'app.py:make_response', 'app.py:real_helper', 'call'),
    'make_response really calls real_helper after the docstring -> edge preserved');
});

test('real symbols around the docstring are intact', () => {
  const frag = extract();
  for (const id of ['app.py:make_response', 'app.py:real_helper', 'app.py:commented', 'app.py:actual', 'lib.py:render_template'])
    assert.ok(frag.nodes.some((n) => n.id === id), `real symbol ${id} present`);
});

test('DEPENDENTS: render_template no longer lists the docstring/comment false callers', () => {
  const frag = extract();
  const GP = join(SRC, 'graph.json');
  writeTree(SRC, { 'graph.json': JSON.stringify(frag) });
  const dep = runNode(script('query.mjs'), [GP, '--dependents', 'lib.py:render_template', '--json']);
  assert.equal(dep.status, 0, dep.stderr);
  const j = JSON.parse(dep.stdout);
  assert.ok(j.results.includes('app.py:actual'), 'the real caller is present');
  assert.ok(!j.results.includes('app.py:make_response'), 'the docstring false caller is gone');
  assert.ok(!j.results.includes('app.py:commented'), 'the comment false caller is gone');
});
