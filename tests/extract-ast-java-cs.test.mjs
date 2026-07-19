// Java/C# tree-sitter dispatch tier (docs/specs/java-cs-tree-sitter.md). The regex tier keeps
// owning NODES; the AST contributes the dispatch edges regex precision-gates away. Pins:
// T1 unique typed-receiver dispatch resolves cross-file (and does NOT under --engine regex),
// T2 an ambiguous receiver class wires nothing (precision over recall),
// T3 this-calls resolve in-file; node sets are IDENTICAL between engines (edges-only tier).
// All tests skip gracefully when the tier is unavailable (no web-tree-sitter / grammar).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runNode, script, tmpDir, cleanup, writeTree, readJSON } from './helpers.mjs';
import { loadLangEngine, _resetForTest } from '../scripts/lib/ts-engine.mjs';

const HAVE = { java: !!(await loadLangEngine('java')), csharp: !!(await loadLangEngine('csharp')) };
_resetForTest();

function extract(files, extraArgs = []) {
  const dir = tmpDir('codeweb-astjcs-');
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

const JAVA_FIX = {
  'Helper.java': 'public class Helper {\n  public int compute(int x) {\n    return x * 2;\n  }\n}\n',
  'App.java': 'public class App {\n  public int run(Helper helper) {\n    return helper.compute(21);\n  }\n}\n',
};

test('T1 (java): unique typed-receiver dispatch resolves cross-file with the AST tier only', { skip: HAVE.java ? false : 'java grammar unavailable' }, () => {
  const ast = extract(JAVA_FIX);
  assert.ok(hasEdge(ast.frag, 'App.java:App.run', 'Helper.java:Helper.compute'),
    `AST tier wires helper.compute() (edges: ${JSON.stringify(ast.frag.edges.filter((e) => e.kind === 'call'))})`);
  assert.match(ast.banner, /typed-dispatch \(java\) 1 wired/, 'the banner reports the wire');

  const rx = extract(JAVA_FIX, ['--engine', 'regex']);
  assert.ok(!hasEdge(rx.frag, 'App.java:App.run', 'Helper.java:Helper.compute'),
    'the regex tier still precision-gates it (the delta this tier exists for)');
});

test('T2 (java): an ambiguous receiver class wires NOTHING', { skip: HAVE.java ? false : 'java grammar unavailable' }, () => {
  const { frag, banner } = extract({
    ...JAVA_FIX,
    'other/Helper.java': 'public class Helper {\n  public int compute(int x) {\n    return x + 1;\n  }\n}\n',
  });
  assert.ok(!frag.edges.some((e) => e.kind === 'call' && e.from.endsWith('App.java:App.run') && /Helper\.compute$/.test(e.to)),
    'two Helper classes -> never guess');
  assert.match(banner, /typed-dispatch \(java\) 0 wired, 1 dropped/, 'the drop is counted, not silent');
});

test('T3 (java): this-calls resolve in-file; the node set is identical across engines', { skip: HAVE.java ? false : 'java grammar unavailable' }, () => {
  const FIX = {
    'Svc.java': 'public class Svc {\n  public int a() {\n    return this.b();\n  }\n  public int b() {\n    return 1;\n  }\n}\n',
  };
  const ast = extract(FIX);
  assert.ok(hasEdge(ast.frag, 'Svc.java:Svc.a', 'Svc.java:Svc.b'), 'this.b() wires in-file');
  const rx = extract(FIX, ['--engine', 'regex']);
  assert.deepEqual(
    ast.frag.nodes.map((n) => n.id).sort(), rx.frag.nodes.map((n) => n.id).sort(),
    'the tier adds EDGES only — node extraction stays the regex tier verbatim');
});

test('T1-cs (c#): typed-receiver dispatch, Allman style', { skip: HAVE.csharp ? false : 'c# grammar unavailable' }, () => {
  const CS_FIX = {
    'Helper.cs': 'public class Helper\n{\n    public int Compute(int x)\n    {\n        return x * 2;\n    }\n}\n',
    'App.cs': 'public class App\n{\n    public int Run(Helper helper)\n    {\n        return helper.Compute(21);\n    }\n}\n',
  };
  const ast = extract(CS_FIX);
  assert.ok(hasEdge(ast.frag, 'App.cs:App.Run', 'Helper.cs:Helper.Compute'),
    `AST tier wires helper.Compute() (edges: ${JSON.stringify(ast.frag.edges.filter((e) => e.kind === 'call'))})`);
  const rx = extract(CS_FIX, ['--engine', 'regex']);
  assert.ok(!hasEdge(rx.frag, 'App.cs:App.Run', 'Helper.cs:Helper.Compute'), 'regex tier gates it');
});
