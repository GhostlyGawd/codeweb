import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { runExtract } from '../scripts/extract-symbols.mjs';
import { normalizeGraph, buildIndex, impactOf, impactCountOf, allBlastCounts } from '../scripts/lib/graph-ops.mjs';
import { runQuery } from '../scripts/lib/query-core.mjs';
import { tmpDir, cleanup, writeTree, runNode, script, hasEdge } from './helpers.mjs';
import { startServer, initServer } from './mcp-harness.mjs';
import { captureSnapshot } from '../scripts/lib/evidence-snapshot.mjs';
import { createReceipt, reconcileReceipt, validateRecord } from '../scripts/lib/evidence-core.mjs';

const REACT = {
  'shell.tsx': 'export default function AppShell(props) {\n  return <section>{props.children}</section>;\n}\n',
  'ui.tsx': 'export function Header() {\n  return <h1>Title</h1>;\n}\n',
  'routes.tsx': "import Shell from './shell.js';\nimport * as UI from './ui.js';\nfunction handleClick() {\n  return 1;\n}\nfunction LocalCard() {\n  return <div />;\n}\nexport function AppRoutes() {\n  return <Shell onClick={handleClick}><UI.Header /><LocalCard /></Shell>;\n}\nfunction UnwiredComponent() {\n  return <div />;\n}\nfunction unusedUtility() {\n  return 1;\n}\n",
  'entry.tsx': "import { AppRoutes as Routes } from './routes.js';\nexport function mount() {\n  return <Routes />;\n}\n",
};
const PYTHON = {
  'commands.py': 'def command_doctor(args):\n    return 1\n\ndef command_propose(args):\n    return 2\n\ndef configure(parser):\n    parser.set_defaults(func=command_doctor)\n    dispatch = {"propose": command_propose}\n    handlers = [command_doctor, command_propose]\n    return dispatch\n\ndef main(args):\n    args.func(args)\n',
};

async function mapped(files, engine = 'regex') {
  const dir = tmpDir('codeweb-usage-'); writeTree(dir, files);
  try { return { dir, graph: normalizeGraph((await runExtract({ path: dir, ctags: false, engine })).fragment) }; }
  catch (error) { cleanup(dir); throw error; }
}

for (const engine of ['regex', 'tree-sitter']) {
  test(`ac_36 JSX: ${engine} maps imported, namespace, local and aliased component use`, async () => {
    const { dir, graph } = await mapped(REACT, engine);
    try {
      for (const [from, to] of [['routes.tsx:AppRoutes', 'shell.tsx:AppShell'], ['routes.tsx:AppRoutes', 'ui.tsx:Header'], ['routes.tsx:AppRoutes', 'routes.tsx:LocalCard'], ['entry.tsx:mount', 'routes.tsx:AppRoutes']]) {
        assert.ok(hasEdge(graph.edges, from, to, 'call'), `${from} -> ${to}`);
      }
      assert.ok(hasEdge(graph.edges, 'routes.tsx:AppRoutes', 'routes.tsx:handleClick', 'ref'));
      assert.ok(!hasEdge(graph.edges, 'routes.tsx:AppRoutes', 'routes.tsx:handleClick', 'call'));
      const ix = buildIndex(graph);
      assert.deepEqual(impactOf(ix, ['shell.tsx:AppShell']), ['entry.tsx:mount', 'routes.tsx:AppRoutes']);
      assert.deepEqual(impactOf(ix, ['routes.tsx:handleClick']), ['entry.tsx:mount', 'routes.tsx:AppRoutes']);
    } finally { cleanup(dir); }
  });
  test(`ac_36 values: ${engine} captures Python handlers without inventing direct invocations`, async () => {
    const { dir, graph } = await mapped(PYTHON, engine);
    try {
      const ix = buildIndex(graph);
      for (const name of ['command_doctor', 'command_propose']) {
        const id = `commands.py:${name}`;
        assert.ok(hasEdge(graph.edges, 'commands.py:configure', id, 'ref'), name);
        assert.ok(!hasEdge(graph.edges, 'commands.py:configure', id, 'call'), name);
        assert.deepEqual(impactOf(ix, [id]), ['commands.py:configure']);
        const { payload } = runQuery(graph, ix, { query: 'callers', symbol: id });
        assert.equal(payload.count, 0); assert.equal(payload.referenceCount, 1);
      }
    } finally { cleanup(dir); }
  });
}

test('ac_36 impact: references participate transitively and all counting paths agree', () => {
  const g = normalizeGraph({ nodes: ['leaf', 'register', 'entry'].map(id => ({ id, file: `${id}.js`, label: id })), edges: [{ from: 'register', to: 'leaf', kind: 'ref' }, { from: 'entry', to: 'register', kind: 'call' }] });
  const ix = buildIndex(g);
  assert.deepEqual(impactOf(ix, ['leaf']), ['entry', 'register']);
  assert.equal(impactCountOf(ix, ['leaf']), 2); assert.equal(allBlastCounts(ix).get('leaf'), 2);
});

test('ac_36 cleanup: JSX component orphans require review and mapped live components are absent', async () => {
  const { dir, graph } = await mapped(REACT);
  try {
    const gp = join(dir, 'graph.json'); writeFileSync(gp, JSON.stringify(graph));
    const r = runNode(script('deadcode.mjs'), [gp, '--json']); assert.equal(r.status, 0, r.stderr);
    const p = JSON.parse(r.stdout);
    for (const id of ['shell.tsx:AppShell', 'routes.tsx:LocalCard', 'routes.tsx:handleClick']) assert.ok(![...p.safe, ...p.review].some(n => n.id === id), id);
    assert.ok(!p.safe.some(n => n.id === 'routes.tsx:UnwiredComponent'));
    assert.match(p.review.find(n => n.id === 'routes.tsx:UnwiredComponent')?.reason || '', /JSX|component/i);
  } finally { cleanup(dir); }
});

test('ac_36 cleanup: incomplete and dynamic graphs cannot supply deletion proposals', async () => {
  for (const condition of ['incomplete', 'dynamic']) {
    const dir = tmpDir('codeweb-usage-containment-');
    try {
      writeTree(dir, { 'unused.js': 'function unused() {\n  return 1;\n}\n' });
      const graph = normalizeGraph((await runExtract({ path: dir, ctags: false })).fragment);
      if (condition === 'incomplete') graph.meta.analysis = { status: 'incomplete', diagnosticCount: 1, diagnostics: [{ code: 'unresolved-jsx-component', file: 'unused.js', line: 1 }] };
      else graph.meta.dynamic = { files: 1, sample: ['router.js'] };
      const gp = join(dir, 'graph.json'); writeFileSync(gp, JSON.stringify(graph));
      const p = JSON.parse(runNode(script('deadcode.mjs'), [gp, '--json']).stdout);
      assert.equal(p.safe.length, 0, condition); assert.ok(p.review.some(n => n.id === 'unused.js:unused'));
    } finally { cleanup(dir); }
  }
});

test('ac_36 precision: shadowed values, strings and generic type syntax never invent uses', async () => {
  const { dir, graph } = await mapped({ 'negative.tsx': 'function handler() {\n  return 1;\n}\nfunction Card() {\n  return null;\n}\nfunction configure(handler, Card) {\n  const options = { onClick: handler };\n  return <Card />;\n}\nfunction typed() {\n  const value = "<Card />";\n  // const opts = {onClick: handler};\n  return value;\n}\nconst identity = <T,>(value: T) => value;\n' });
  try {
    assert.ok(!graph.edges.some(e => e.from === 'negative.tsx:configure' && ['negative.tsx:handler', 'negative.tsx:Card'].includes(e.to)));
    assert.ok(!graph.edges.some(e => e.from === 'negative.tsx:typed' && ['negative.tsx:handler', 'negative.tsx:Card'].includes(e.to)));
    assert.ok(!graph.meta.analysis.diagnostics.some(d => d.evidence?.includes('<T,')));
  } finally { cleanup(dir); }
});

test('ac_36 diagnostics: unresolved local JSX members and ambiguous calls survive cache replay', async () => {
  const dir = tmpDir('codeweb-usage-cache-');
  try {
    writeTree(dir, { 'a.tsx': 'function Factory() {\n  return null;\n}\nexport function Page() {\n  return <Factory.Part />;\n}\n', 'one.js': 'export function collide() {\n  return 1;\n}\n', 'two.js': 'export function collide() {\n  return 2;\n}\n', 'invoke.js': 'export function run() {\n  return collide();\n}\n' });
    const opts = { path: dir, ctags: false, cache: join(dir, 'scan.json') };
    const cold = await runExtract(opts); const warm = await runExtract(opts);
    assert.equal(cold.fragment.meta.analysis.status, 'incomplete');
    assert.ok(cold.fragment.meta.analysis.diagnostics.some(d => d.code === 'unresolved-jsx-component'));
    assert.ok(cold.fragment.meta.analysis.diagnostics.some(d => d.code === 'ambiguous-call-target'));
    assert.deepEqual(warm.fragment.meta.analysis, cold.fragment.meta.analysis);
    assert.match(warm.banner, /scanned 0\//);
    const full = await runExtract({ ...opts, full: true }); assert.deepEqual(full.fragment.meta.analysis, cold.fragment.meta.analysis);
    writeFileSync(join(dir, 'a.tsx'), 'function Factory() {\n  return null;\n}\nexport function Page() {\n  return <Factory />;\n}\n');
    writeFileSync(join(dir, 'invoke.js'), "import { collide } from './one.js';\nexport function run() {\n  return collide();\n}\n");
    const fixed = await runExtract(opts); assert.equal(fixed.fragment.meta.analysis.status, 'no-known-incompleteness');
  } finally { cleanup(dir); }
});

test('ac_36 JSX precision: child text, fragments, multiline properties and type arguments', async () => {
  const { dir, graph } = await mapped({ 'view.tsx': 'function handler() {\n  return 1;\n}\nfunction Card(props) {\n  return <div>{props.children}</div>;\n}\nexport function Page() {\n  return <>handler() literal text<Card<{ value: number }>\n    onClick={handler}\n  >literal handler() {handler()}</Card></>;\n}\nexport function compare() {\n  return left < Card > right;\n}\n' });
  try {
    assert.ok(hasEdge(graph.edges, 'view.tsx:Page', 'view.tsx:Card', 'call'));
    assert.ok(hasEdge(graph.edges, 'view.tsx:Page', 'view.tsx:handler', 'ref'));
    assert.ok(hasEdge(graph.edges, 'view.tsx:Page', 'view.tsx:handler', 'call'), 'expression container is executable');
    assert.ok(!graph.edges.some(e => e.from === 'view.tsx:compare' && e.to === 'view.tsx:Card'));
  } finally { cleanup(dir); }
  const f = await mapped({ 'text.tsx': 'function handler() {\n  return 1;\n}\nexport function Page() {\n  return <><p>handler() text</p></>;\n}\n' });
  try { assert.ok(!f.graph.edges.some(e => e.to === 'text.tsx:handler')); } finally { cleanup(f.dir); }
});

test('ac_36 bindings: nested scopes and Python local assignments do not fabricate global references', async () => {
  const f = await mapped({ 'scope.js': 'function handler() {\n  return 1;\n}\nexport function outer() {\n  function inner() {\n    const handler = external;\n    return handler;\n  }\n  return handler;\n}\n', 'shadow.py': 'def handler():\n    return 1\n\ndef configure(parser):\n    handler = external\n    parser.set_defaults(func=handler)\n' });
  try {
    assert.ok(hasEdge(f.graph.edges, 'scope.js:outer', 'scope.js:handler', 'ref'));
    assert.ok(!hasEdge(f.graph.edges, 'scope.js:inner', 'scope.js:handler', 'ref'));
    assert.ok(!hasEdge(f.graph.edges, 'shadow.py:configure', 'shadow.py:handler', 'ref'));
  } finally { cleanup(f.dir); }
});

test('ac_36 imports: namespace re-exports resolve and external packages stay outside the local map', async () => {
  const dir = tmpDir('codeweb-usage-barrel-');
  try {
    writeTree(dir, { 'component.tsx': 'export function Header() {\n  return <h1 />;\n}\n', 'barrel.ts': "export { Header } from './component.js';\n", 'page.tsx': "import * as UI from './barrel.js';\nimport React, { Fragment } from 'react';\nexport function Page() {\n  return <React.Fragment><Fragment><UI.Header /></Fragment></React.Fragment>;\n}\n" });
    const opts = { path: dir, ctags: false, cache: join(dir, 'scan.json') };
    const cold = await runExtract(opts); const warm = await runExtract(opts);
    assert.ok(hasEdge(cold.fragment.edges, 'page.tsx:Page', 'component.tsx:Header', 'call'));
    assert.equal(cold.fragment.meta.analysis.status, 'no-known-incompleteness');
    assert.deepEqual(warm.fragment.meta.analysis, cold.fragment.meta.analysis);
  } finally { cleanup(dir); }
});

test('ac_36 MCP: actual server returns the same JSX/reference impact and cleanup classifications', async () => {
  const f = await mapped(REACT); let server;
  try {
    const gp = join(f.dir, 'graph.json'); writeFileSync(gp, JSON.stringify(f.graph));
    server = startServer({ cwd: f.dir, env: { CODEWEB_NO_STATS: '1', CODEWEB_NO_AUTOREFRESH: '1' } });
    await initServer(server);
    const call = async (id, name, args) => {
      server.send({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: { graph: gp, ...args } } });
      const reply = await server.reply(id); assert.ok(!reply.result.isError, reply.result.content[0]?.text);
      return JSON.parse(reply.result.content[0].text);
    };
    const impact = await call(2, 'codeweb_impact', { symbol: 'routes.tsx:handleClick' });
    assert.equal(impact.count, 2); assert.match(impact.closure, /call\+inherit\+ref/);
    const callers = await call(3, 'codeweb_callers', { symbol: 'routes.tsx:handleClick' });
    assert.equal(callers.count, 0); assert.equal(callers.referenceCount, 1);
    const dead = await call(4, 'codeweb_deadcode', {});
    assert.ok(dead.safe.some(n => n.id === 'routes.tsx:unusedUtility'));
    assert.ok(!dead.safe.some(n => n.id === 'routes.tsx:UnwiredComponent'));
    assert.ok(dead.review.some(n => n.id === 'routes.tsx:UnwiredComponent'));
    f.graph.meta.analysis = { status: 'incomplete', diagnosticCount: 1, diagnostics: [{ code: 'unresolved-jsx-component', file: 'routes.tsx', line: 9 }] };
    writeFileSync(gp, JSON.stringify(f.graph));
    const incomplete = await call(5, 'codeweb_deadcode', {}); assert.equal(incomplete.safe.length, 0);
  } finally { if (server) { server.close(); await server.exited; } cleanup(f.dir); }
});

test('ac_36 receipts: reference impact has valid witnesses; legacy records remain readable and incompatible', async () => {
  const f = await mapped(REACT);
  try {
    const snapshot = await captureSnapshot(f.dir);
    const receipt = createReceipt(snapshot, { symbol: 'routes.tsx:handleClick', task: 'reference-impact', graphRelativePath: 'graph.json' });
    assert.equal(receipt.query.relationVersion, 2); assert.deepEqual(receipt.query.edgeKinds.impact, ['call', 'inherit', 'ref']);
    assert.equal(receipt.relations.impact.length, 2);
    assert.ok(receipt.relations.impact.every(r => r.witnessPath.some(e => e.kind === 'ref')));
    assert.doesNotThrow(() => validateRecord(receipt, 'receipt'));
    const legacySnapshot = { ...snapshot, analyzerIdentity: { ...snapshot.analyzerIdentity, relationVersion: 1 } };
    const legacy = createReceipt(legacySnapshot, { symbol: 'routes.tsx:handleClick', task: 'legacy-impact', graphRelativePath: 'graph.json' });
    assert.equal(legacy.query.relationVersion, 1); assert.equal(legacy.relations.impact.length, 0);
    const bytes = JSON.stringify(legacy);
    const result = reconcileReceipt(legacy, snapshot);
    assert.equal(result.state, 'inconclusive'); assert.ok(result.reasons.includes('analysis-incompatible'));
    assert.equal(JSON.stringify(legacy), bytes); assert.doesNotThrow(() => validateRecord(legacy, 'receipt'));
    const bad = structuredClone(receipt); bad.query.relationVersion = 1; bad.query.edgeKinds.impact = ['call', 'inherit']; bad.baseline.analyzerIdentity.relationVersion = 1;
    assert.throws(() => validateRecord(bad, 'receipt'), /semantics/);
  } finally { cleanup(f.dir); }
});

test('ac_36 bindings: import declarations are not callback references; registered Python dispatch stays qualified', async () => {
  const f = await mapped({ 'handler.js': 'export function handler() {\n  return 1;\n}\n', 'import.js': "import {\n  handler\n} from './handler.js'\nexport function unused() {\n  return 1;\n}\n", ...PYTHON });
  try {
    assert.ok(!f.graph.edges.some(e => e.kind === 'ref' && e.to === 'handler.js:handler'));
    assert.ok(f.graph.meta.dynamic?.sample.includes('commands.py'));
  } finally { cleanup(f.dir); }
});

test('ac_36 CLI: zero direct callers expose reference use and impact names mapped consumers', async () => {
  const f = await mapped(REACT);
  try {
    const gp = join(f.dir, 'graph.json'); writeFileSync(gp, JSON.stringify(f.graph));
    const callers = runNode(script('query.mjs'), [gp, '--callers', 'routes.tsx:handleClick']);
    assert.equal(callers.status, 0); assert.match(callers.stdout, /callers.*: 0/); assert.match(callers.stdout, /1 mapped reference user/);
    const impact = runNode(script('query.mjs'), [gp, '--impact', 'routes.tsx:handleClick']);
    assert.equal(impact.status, 0); assert.match(impact.stdout, /2 mapped consumers/); assert.match(impact.stdout, /zero does not establish no runtime consumers/);
  } finally { cleanup(f.dir); }
});

test('ac_36 defaults and callbacks: default values count as use; bound callback parameters stay distinct', async () => {
  const f = await mapped({
    'defaults.js': 'function handler() {\n  return 1;\n}\nexport function make(callback = handler) {\n  return callback;\n}\nexport function shadowed(handler, items) {\n  return items.map(handler);\n}\nexport const singleArrow = handler => items.map(handler);\n',
    'defaults.py': 'def handler():\n    return 1\n\ndef make(callback=handler):\n    return callback\n\ndef shadowed(handler, items):\n    return map(handler, items)\n',
  });
  try {
    assert.ok(hasEdge(f.graph.edges, 'defaults.js:make', 'defaults.js:handler', 'ref'));
    assert.ok(hasEdge(f.graph.edges, 'defaults.py:make', 'defaults.py:handler', 'ref'));
    for (const file of ['defaults.js', 'defaults.py']) assert.ok(!hasEdge(f.graph.edges, `${file}:shadowed`, `${file}:handler`, 'ref'));
    assert.ok(!hasEdge(f.graph.edges, 'defaults.js:singleArrow', 'defaults.js:handler', 'ref'));
  } finally { cleanup(f.dir); }
});

test('ac_36 local bindings: destructured external functions do not collide with repository names', async () => {
  const f = await mapped({
    'one.js': 'export function run() {\n  return 1;\n}\n',
    'two.js': 'export function run() {\n  return 2;\n}\n',
    'external.js': 'export function configure() {\n  const { execFileSync: run } = external;\n  return run();\n}\n',
    'consumer.js': "const { run } = require('./one.js');\nexport function configure() {\n  return run();\n}\n",
  });
  try {
    assert.equal(f.graph.meta.analysis.status, 'no-known-incompleteness');
    assert.ok(!f.graph.edges.some(e => e.from === 'external.js:configure' && e.to.endsWith(':run')));
    assert.ok(hasEdge(f.graph.edges, 'consumer.js:configure', 'one.js:run', 'call'));
  } finally { cleanup(f.dir); }
});

test('ac_36 imports: explicit external bindings never fall back to similarly named project functions', async () => {
  const f = await mapped({
    'external.js': "import { writeFileSync } from 'node:fs';\nexport function save(path, text) {\n  writeFileSync(path, text);\n}\n",
    'one.js': 'export function writeFileSync() {\n  return 1;\n}\n',
    'two.js': 'export function writeFileSync() {\n  return 2;\n}\n',
  });
  try {
    assert.equal(f.graph.meta.analysis.status, 'no-known-incompleteness');
    assert.ok(!f.graph.edges.some(e => e.from === 'external.js:save' && e.to.endsWith(':writeFileSync')));
  } finally { cleanup(f.dir); }
});

test('ac_36 expression bindings: named IIFE recursion and object methods are not ambiguous global calls', async () => {
  const f = await mapped({
    'one.js': 'export function walk() {\n  return 1;\n}\nexport function focus() {\n  return 1;\n}\n',
    'two.js': 'export function walk() {\n  return 2;\n}\nexport function focus() {\n  return 2;\n}\n',
    'local.js': 'export function visit(input) {\n  (function walk(value) {\n    if (value) walk(null);\n  })(input);\n  const api = { focus() { return 1; } };\n  return api;\n}\n',
  });
  try {
    assert.equal(f.graph.meta.analysis.status, 'no-known-incompleteness');
    assert.ok(!f.graph.edges.some(e => e.from === 'local.js:visit' && /:(?:walk|focus)$/.test(e.to)));
  } finally { cleanup(f.dir); }
});
