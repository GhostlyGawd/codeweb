// Spec Q (docs/specs/flask-python-import-edges.md): the flask render_template regression.
// Bisect verdict (recorded in the spec): REAL — c892f50 wired 14 dependents, v0.9.0 wired 7.
// Root causes, each pinned here on a synthetic src-layout package:
//   Q1  `from <pkg> import name` (single-segment ABSOLUTE import of the repo's OWN top-level
//       package) resolved to nothing — the >=2-segment guard that protects against stdlib
//       collisions also refused the repo's own src-layout package.
//   Q2  the public re-export (`from .templating import render_template as render_template` in
//       __init__.py) was a dead end — names had no re-export following on the Python side.
//   Q3  call sites in a SUB-PACKAGE (examples/ with its own manifest) refused to wire across the
//       package boundary even though the file EXPLICITLY imports the name — the alias from an
//       explicit import is evidence, not a name coincidence.
//   Q4  module-level `from pkg import x` sites now attribute their import edge to the importing
//       file's `<module>` node (the site), not the file's largest symbol.
// Stdlib safety stays: `import json` must NOT grab an in-repo nested json/ package.

import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runNode, script, tmpDir, cleanup, writeTree, readJSON, hasEdge } from './helpers.mjs';
import { runExtract } from '../scripts/extract-symbols.mjs'; // finding #40 (T-40.5): extractor in-process

async function extract(files) {
  const dir = tmpDir('codeweb-pysrc-');
  writeTree(dir, files);
  let frag;
  try { frag = (await runExtract({ path: dir })).fragment; }
  catch (e) { cleanup(dir); throw new Error(`extract failed: ${e.message}`); }
  cleanup(dir);
  return frag;
}

const FIXTURE = {
  'pyproject.toml': '[project]\nname = "mypkg"\n',
  'src/mypkg/__init__.py': 'from .templating import render_template as render_template\n',
  'src/mypkg/templating.py': 'def render_template(name):\n    return name\n',
  // a nested json package that `import json` must NOT resolve to (stdlib guard)
  'src/mypkg/json/__init__.py': 'def dumps(x):\n    return x\n',
  // a sub-package with its own manifest — a PACKAGE BOUNDARY for bare-name resolution
  'examples/app/pyproject.toml': '[project]\nname = "app"\n',
  'examples/app/views.py': 'from mypkg import render_template\nBANNER = render_template("boot")\n\ndef index():\n    return render_template("index")\n',
  'examples/app/other.py': 'import json\n\ndef fine():\n    return json\n',
};

test('Q1+Q2: from <own-pkg> import name resolves through the src-layout __init__ re-export', async () => {
  const frag = await extract(FIXTURE);
  const target = 'src/mypkg/templating.py:render_template';
  assert.ok(frag.nodes.some((n) => n.id === target), 'target exists');
  const importEdges = frag.edges.filter((e) => e.kind === 'import' && e.to === target);
  assert.ok(importEdges.length >= 1, `the from-import wires an import edge to the re-exported def (got: ${JSON.stringify(frag.edges.filter((e) => e.to === target))})`);
});

test('Q3: an explicit import binds calls across a package boundary', async () => {
  const frag = await extract(FIXTURE);
  const target = 'src/mypkg/templating.py:render_template';
  assert.ok(hasEdge(frag.edges, 'examples/app/views.py:index', target, 'call'),
    `index() call wires despite examples/ being its own package (edges to target: ${JSON.stringify(frag.edges.filter((e) => e.to === target))})`);
});

test('Q4: the module-level import site attributes to <module>, matching site granularity', async () => {
  const frag = await extract(FIXTURE);
  const target = 'src/mypkg/templating.py:render_template';
  // (from,to) dedupe means a module-level CALL to the same target subsumes the import edge —
  // the site is a dependent either way; kind is not the contract here.
  assert.ok(hasEdge(frag.edges, 'examples/app/views.py:<module>', target, null),
    'the importing module node is a dependent of the target');
  // and the re-export site itself is a dependent (the truth counts src/flask/__init__.py:<module>)
  assert.ok(hasEdge(frag.edges, 'src/mypkg/__init__.py:<module>', target, 'import'),
    'the __init__ re-export site is itself an import dependent');
});

test('Q-guard: `import json` never grabs an in-repo NESTED json package', async () => {
  const frag = await extract(FIXTURE);
  const bad = frag.edges.filter((e) => e.from.startsWith('examples/app/other.py') && e.to.startsWith('src/mypkg/json/'));
  assert.equal(bad.length, 0, `stdlib name must not wire into a nested package: ${JSON.stringify(bad)}`);
});
