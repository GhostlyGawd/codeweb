// v8 — Java + C# discovery. Same contract as the other language tiers: types -> 'class'
// (visibility -> exports), methods owner-qualified (`file:Type.method`), control-flow never becomes
// a phantom method, in-body calls wire by name under the precision gate, and inheritance edges out
// of `extends` (Java) / the base list (C#).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runNode, script, tmpDir, cleanup, writeTree, readJSON, hasEdge } from './helpers.mjs';
import { join } from 'node:path';

const EXTRACT = script('extract-symbols.mjs');

function extract(files) {
  const dir = tmpDir('codeweb-jvcs-');
  try {
    writeTree(dir, files);
    const out = join(dir, 'fragment.json');
    const r = runNode(EXTRACT, [dir, '--no-ctags', '--out', out]);
    assert.equal(r.status, 0, r.stderr);
    return readJSON(out);
  } finally { cleanup(dir); }
}

const JAVA = [
  'public class Calculator extends BaseCalc {',
  '  private int total;',
  '',
  '  public Calculator(int seed) {',
  '    this.total = seed;',
  '  }',
  '',
  '  public int compute(int x) {',
  '    if (x > 0) {',
  '      return helper(x);',
  '    }',
  '    synchronized (this) {',
  '      return 0;',
  '    }',
  '  }',
  '',
  '  static int helper(int x) {',
  '    return x * 2;',
  '  }',
  '}',
  '',
  'class BaseCalc {',
  '  public void reset() {',
  '  }',
  '}',
  '',
].join('\n');

test('Java: types/methods/constructors with visibility, owner-qualified ids, no control-flow phantoms', () => {
  const frag = extract({ 'Calculator.java': JAVA });
  const byId = new Map(frag.nodes.map((n) => [n.id, n]));
  const calc = byId.get('Calculator.java:Calculator');
  assert.ok(calc && calc.kind === 'class', 'class discovered');
  assert.equal(calc.exports, true, 'public -> exported');
  assert.ok(byId.get('Calculator.java:BaseCalc'), 'package-private class discovered');
  assert.equal(byId.get('Calculator.java:BaseCalc').exports, false, 'no public -> not exported');
  const compute = byId.get('Calculator.java:Calculator.compute');
  assert.ok(compute && compute.kind === 'method', 'method owner-qualified');
  assert.ok(byId.get('Calculator.java:Calculator.Calculator'), 'constructor is a method of its class');
  assert.ok(byId.get('Calculator.java:Calculator.helper'), 'package-private method discovered');
  assert.ok(byId.get('Calculator.java:BaseCalc.reset'), 'method of the second class owner-qualifies to IT');
  const labels = frag.nodes.map((n) => n.label);
  for (const ctrl of ['if', 'synchronized', 'for', 'while']) assert.ok(!labels.includes(ctrl), `no phantom '${ctrl}' method`);
  assert.equal(compute.role, 'product');
  // in-body call wires by name; inheritance from extends
  assert.ok(hasEdge(frag.edges, 'Calculator.java:Calculator.compute', 'Calculator.java:Calculator.helper', 'call'), 'compute() calls helper()');
  assert.ok(hasEdge(frag.edges, 'Calculator.java:Calculator', 'Calculator.java:BaseCalc', 'inherit'), 'extends -> inherit edge');
  assert.equal(frag.meta.languages.includes('java'), true);
});

test('Java: FooTest.java and src/test/ classify as test role', () => {
  const frag = extract({
    'src/main/java/App.java': 'public class App {\n  public void run() {\n  }\n}\n',
    'src/test/java/AppTest.java': 'public class AppTest {\n  public void testRun() {\n  }\n}\n',
  });
  const role = (id) => frag.nodes.find((n) => n.id === id)?.role;
  assert.equal(role('src/main/java/App.java:App'), 'product');
  assert.equal(role('src/test/java/AppTest.java:AppTest'), 'test');
});

const CSHARP = [
  'namespace Demo;',
  '',
  'public class OrderService : ServiceBase',
  '{',
  '    public int Total { get; set; }',
  '',
  '    public OrderService(int seed)',
  '    {',
  '        Total = seed;',
  '    }',
  '',
  '    public async Task<int> ComputeAsync(int x)',
  '    {',
  '        foreach (var i in Items(x))',
  '        {',
  '            Total += i;',
  '        }',
  '        lock (this)',
  '        {',
  '            return Total;',
  '        }',
  '    }',
  '',
  '    private static int[] Items(int x) => new[] { x, x + 1 };',
  '}',
  '',
  'public class ServiceBase',
  '{',
  '    public void Reset()',
  '    {',
  '    }',
  '}',
  '',
].join('\n');

test('C#: Allman-brace + expression-bodied members, owner-qualified, base-list inherit, no phantoms', () => {
  const frag = extract({ 'OrderService.cs': CSHARP });
  const byId = new Map(frag.nodes.map((n) => [n.id, n]));
  assert.ok(byId.get('OrderService.cs:OrderService')?.kind === 'class');
  const compute = byId.get('OrderService.cs:OrderService.ComputeAsync');
  assert.ok(compute && compute.kind === 'method', 'Allman-style method discovered + owner-qualified');
  assert.ok(byId.get('OrderService.cs:OrderService.Items'), 'expression-bodied member discovered');
  assert.ok(byId.get('OrderService.cs:OrderService.OrderService'), 'constructor discovered');
  assert.ok(byId.get('OrderService.cs:ServiceBase.Reset'), 'second class owns its method');
  const labels = frag.nodes.map((n) => n.label);
  for (const ctrl of ['foreach', 'lock', 'if', 'using']) assert.ok(!labels.includes(ctrl), `no phantom '${ctrl}' method`);
  assert.ok(!labels.includes('Total'), 'properties are not symbols');
  assert.ok(hasEdge(frag.edges, 'OrderService.cs:OrderService.ComputeAsync', 'OrderService.cs:OrderService.Items', 'call'), 'ComputeAsync calls Items');
  assert.ok(hasEdge(frag.edges, 'OrderService.cs:OrderService', 'OrderService.cs:ServiceBase', 'inherit'), 'base list -> inherit edge');
  assert.equal(frag.meta.languages.includes('csharp'), true);
});

test('C#: .csproj marks a package boundary (no cross-project bare-name edges)', () => {
  const frag = extract({
    'App/App.csproj': '<Project />',
    'App/Program.cs': 'public class Program\n{\n    public static void Main()\n    {\n        Normalize();\n    }\n}\n',
    'Lib/Lib.csproj': '<Project />',
    'Lib/Util.cs': 'public class Util\n{\n    public static void Normalize()\n    {\n    }\n}\n',
  });
  assert.ok(!frag.edges.some((e) => e.from.startsWith('App/') && e.to.startsWith('Lib/')),
    'bare-name resolution must not cross .csproj boundaries');
});
