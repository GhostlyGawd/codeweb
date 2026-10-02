import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { runExtract } from '../scripts/extract-symbols.mjs';
import { normalizeGraph, buildIndex, impactOf } from '../scripts/lib/graph-ops.mjs';
import { tmpDir, cleanup, writeTree, runNode, script, hasEdge } from './helpers.mjs';

const target = 'function target() {\n return 1;\n}\n';
async function fixture(files, engine = 'regex') {
  const dir = tmpDir('codeweb-inversion-'); writeTree(dir, files);
  try { return { dir, graph: normalizeGraph((await runExtract({ path: dir, ctags: false, engine })).fragment) }; }
  catch (e) { cleanup(dir); throw e; }
}
function proposals(f) {
  const gp = join(f.dir, 'graph.json'); writeFileSync(gp, JSON.stringify(f.graph));
  const dead = runNode(script('deadcode.mjs'), [gp, '--json']);
  const campaign = runNode(script('campaign.mjs'), [gp, '--json']);
  assert.equal(dead.status, 0, dead.stderr); assert.equal(campaign.status, 0, campaign.stderr);
  return { safe: JSON.parse(dead.stdout).safe, steps: JSON.parse(campaign.stdout).steps };
}
for (const engine of ['regex', 'tree-sitter']) {
  test(`ac_37 ${engine}: completed lexical blocks preserve live outer calls and prohibit cleanup`, async () => {
    const f = await fixture({ 'a.js': target + 'export function invoke() {\n { const target = 99; }\n return target();\n}\n' }, engine);
    try {
      assert.ok(hasEdge(f.graph.edges, 'a.js:invoke', 'a.js:target', 'call'));
      assert.ok(impactOf(buildIndex(f.graph), ['a.js:target']).includes('a.js:invoke'));
      const p = proposals(f); assert.ok(!p.safe.some(n => n.id === 'a.js:target'));
      assert.ok(!p.steps.some(s => s.type === 'delete' && s.op.ids.includes('a.js:target')));
    } finally { cleanup(f.dir); }
  });
  test(`ac_37 ${engine}: JSX literal declarations are not symbols or cleanup targets`, async () => {
    const f = await fixture({ 'a.tsx': 'const help = <pre>\nfunction pretend()\n</pre>;\nexport function Page() {\n return help;\n}\n' }, engine);
    try {
      assert.deepEqual(f.graph.nodes.filter(n => n.kind === 'function').map(n => n.label), ['Page']);
      const p = proposals(f); assert.ok(!p.safe.some(n => n.id.endsWith(':pretend')));
      assert.ok(!p.steps.some(s => s.type === 'delete' && s.op.ids.some(id => id.endsWith(':pretend'))));
    } finally { cleanup(f.dir); }
  });
  test(`ac_37 ${engine}: parameters shadow same-file and imported callable declarations`, async () => {
    const f = await fixture({ 'a.js': target + 'export function invoke(target) {\n return target();\n}\nexport function valid() {\n return target();\n}\n',
      'b.js': "import { target } from './a.js';\nexport function invoke(target) {\n return target();\n}\n" }, engine);
    try {
      for (const from of ['a.js:invoke','b.js:invoke']) assert.ok(!hasEdge(f.graph.edges, from, 'a.js:target', 'call'));
      assert.ok(hasEdge(f.graph.edges, 'a.js:valid', 'a.js:target', 'call'));
    } finally { cleanup(f.dir); }
  });
  test(`ac_37 ${engine}: namespace exports resolve; private members are diagnosed`, async () => {
    const f = await fixture({ 'ui.js': 'function Hidden() {\n return null;\n}\nexport function Visible() {\n return null;\n}\n',
      'page.tsx': "import * as UI from './ui.js';\nexport function Page() {\n return <><UI.Hidden /><UI.Visible /></>;\n}\n" }, engine);
    try {
      assert.ok(!hasEdge(f.graph.edges, 'page.tsx:Page', 'ui.js:Hidden', 'call'));
      assert.ok(hasEdge(f.graph.edges, 'page.tsx:Page', 'ui.js:Visible', 'call'));
      assert.ok(f.graph.meta.analysis.diagnostics.some(d => d.code === 'unresolved-jsx-component'));
    } finally { cleanup(f.dir); }
  });
  test(`ac_37 ${engine}: immutable local/imported aliases expose the invoking consumer`, async () => {
    const f = await fixture({ 'a.js': target + 'const alias = target;\nconst next = alias;\nexport function invoke() {\n return next();\n}\n',
      'b.js': "import { target as original } from './a.js';\nconst alias = original;\nexport function invoke() {\n return alias();\n}\n" }, engine);
    try {
      for (const from of ['a.js:invoke','b.js:invoke']) {
        assert.ok(hasEdge(f.graph.edges, from, 'a.js:target', 'call'));
        assert.ok(impactOf(buildIndex(f.graph), ['a.js:target']).includes(from));
      }
    } finally { cleanup(f.dir); }
  });
  test(`ac_37 ${engine}: literal decorators contribute the decorated function dependency`, async () => {
    const f = await fixture({ 'a.py': 'def decorate(fn):\n    return fn\n\n@decorate\ndef action():\n    return 1\n' }, engine);
    try {
      assert.ok(hasEdge(f.graph.edges, 'a.py:action', 'a.py:decorate', 'ref'));
      assert.ok(impactOf(buildIndex(f.graph), ['a.py:decorate']).includes('a.py:action'));
    } finally { cleanup(f.dir); }
  });
}
test('ac_37 block scope controls: inner, sibling, var and destructured bindings remain distinct', async () => {
  const f = await fixture({ 'a.js': target +
    'export function inner() {\n { const target = () => 9;\n target(); }\n}\n' +
    'export function sibling() {\n { const renamed = 99; }\n return target();\n}\n' +
    'export function hoisted() {\n { var target = () => 9; }\n return target();\n}\n' +
    'export function destructured() {\n { const { target } = source;\n target(); }\n return target();\n}\n' });
  try {
    for (const from of ['inner','hoisted']) assert.ok(!hasEdge(f.graph.edges, `a.js:${from}`, 'a.js:target', 'call'), from);
    for (const from of ['sibling','destructured']) assert.ok(hasEdge(f.graph.edges, `a.js:${from}`, 'a.js:target', 'call'), from);
  } finally { cleanup(f.dir); }
});
test('ac_37 alias negative controls: mutable and shadowed aliases never fabricate known consumers', async () => {
  const f = await fixture({ 'a.js': target + 'let changing = target;\nchanging = external;\nconst stable = target;\n' +
    'export function mutable() {\n return changing();\n}\nexport function parameter(stable) {\n return stable();\n}\n' +
    'export function block() {\n { const stable = other;\n stable(); }\n return stable();\n}\n' });
  try {
    for (const from of ['mutable','parameter']) assert.ok(!hasEdge(f.graph.edges, `a.js:${from}`, 'a.js:target', 'call'));
    assert.ok(hasEdge(f.graph.edges, 'a.js:block', 'a.js:target', 'call'));
    assert.ok(f.graph.meta.analysis.diagnostics.some(d => /alias/.test(d.code)));
  } finally { cleanup(f.dir); }
});
test('ac_37 executable JSX expressions survive literal-text masking', async () => {
  const f = await fixture({ 'a.tsx': target + 'export function Page() {\n return <pre>function pretend() {target()}</pre>;\n}\n' });
  try {
    assert.ok(!f.graph.nodes.some(n => n.label === 'pretend'));
    assert.ok(hasEdge(f.graph.edges, 'a.tsx:Page', 'a.tsx:target', 'call'));
  } finally { cleanup(f.dir); }
});
test('ac_37 cache controls: cold, warm and full agree; exporting a private member invalidates resolution', async () => {
  const dir = tmpDir('codeweb-inversion-cache-');
  try {
    writeTree(dir, { 'ui.js': 'function Card() {\n return null;\n}\n', 'page.tsx': "import * as UI from './ui.js';\nexport function Page() {\n return <UI.Card />;\n}\n" });
    const opts = { path: dir, ctags: false, engine: 'regex', cache: join(dir, 'scan.json') };
    const cold = (await runExtract(opts)).fragment; const warm = (await runExtract(opts)).fragment;
    const full = (await runExtract({ ...opts, full: true })).fragment;
    assert.deepEqual(warm.edges, cold.edges); assert.deepEqual(full.edges, cold.edges);
    assert.deepEqual(warm.meta.analysis, cold.meta.analysis); assert.equal(cold.meta.analysis.status, 'incomplete');
    writeFileSync(join(dir, 'ui.js'), 'export function Card() {\n return null;\n}\n');
    const fixed = (await runExtract(opts)).fragment;
    assert.ok(hasEdge(fixed.edges, 'page.tsx:Page', 'ui.js:Card', 'call'));
    assert.equal(fixed.meta.analysis.status, 'no-known-incompleteness');
  } finally { cleanup(dir); }
});

test('ac_37 loop scope: let ends with the loop; var remains function scoped', async () => {
  const f = await fixture({ 'a.js': target +
    'export function lexical() {\n for (let target of values) {\n target();\n }\n return target();\n}\n' +
    'export function hoisted() {\n for (var target of values) {\n target();\n }\n return target();\n}\n' });
  try {
    assert.ok(hasEdge(f.graph.edges, 'a.js:lexical', 'a.js:target', 'call'));
    assert.ok(!hasEdge(f.graph.edges, 'a.js:hoisted', 'a.js:target', 'call'));
  } finally { cleanup(f.dir); }
});

test('ac_37 callback, catch and comma-declaration bindings suppress false outer calls', async () => {
  const f = await fixture({ 'a.js': target +
    'export function callbacks(items) {\n items.map(target => target());\n items.map(function(target) { return target(); });\n}\n' +
    'export function caught() {\n try { throw external; } catch (target) { target(); }\n}\n' +
    'export function comma() {\n const value = 1, target = external;\n return target();\n}\n' +
    'export function untouched() {\n return target();\n}\n' });
  try {
    for (const from of ['callbacks','caught','comma']) assert.ok(!hasEdge(f.graph.edges,`a.js:${from}`,'a.js:target','call'),from);
    assert.ok(hasEdge(f.graph.edges,'a.js:untouched','a.js:target','call'));
  } finally { cleanup(f.dir); }
});

test('ac_37 nested binding patterns shadow values while property keys and defaults remain distinct', async () => {
  const f = await fixture({ 'a.js': target +
    'export function nested(input) {\n const { outer: { target }, rest: [other] } = input;\n return target();\n}\n' +
    'export function property(input) {\n const { target: local } = input;\n return target();\n}\n' +
    'export function callbacks(items) {\n items.map(({ target, other }) => target());\n}\n' });
  try {
    for (const from of ['nested','callbacks']) assert.ok(!hasEdge(f.graph.edges,`a.js:${from}`,'a.js:target','call'),from);
    assert.ok(hasEdge(f.graph.edges,'a.js:property','a.js:target','call'));
    assert.equal(f.graph.meta.analysis.status,'no-known-incompleteness');
  } finally { cleanup(f.dir); }
});

test('ac_37 callback braces and semicolons do not end an enclosing function or arrow expression', async () => {
  const f = await fixture({ 'a.js': target +
    'export function invoke(items) {\n const mapper = (values) => values.map((value) => {\n return { value };\n }).filter(Boolean);\n const mapped = mapper(items);\n return target();\n}\n' });
  try {
    assert.ok(hasEdge(f.graph.edges,'a.js:invoke','a.js:target','call'));
    assert.ok(hasEdge(f.graph.edges,'a.js:invoke','a.js:mapper','call'));
    assert.ok(!f.graph.edges.some(e=>e.from==='a.js:<module>' && e.to==='a.js:target'));
    assert.equal(f.graph.meta.analysis.status,'no-known-incompleteness');
  } finally { cleanup(f.dir); }
});
test('ac_37 namespace precision: parameter shadows suppress member calls and call/apply chains', async () => {
  const f = await fixture({ 'ui.js': 'export function Card() {\n return null;\n}\n',
    'a.js': "import * as UI from './ui.js';\nexport function shadow(UI) {\n UI.Card();\n UI.Card.call(null);\n}\nexport function valid() {\n UI.Card();\n}\n" });
  try {
    assert.ok(!f.graph.edges.some(e => e.from === 'a.js:shadow' && e.to === 'ui.js:Card'));
    assert.ok(hasEdge(f.graph.edges, 'a.js:valid', 'ui.js:Card', 'call'));
  } finally { cleanup(f.dir); }
});
test('ac_37 local export aliases change cached namespace resolution without defining new symbols', async () => {
  const dir = tmpDir('codeweb-export-alias-');
  try {
    writeTree(dir, { 'ui.js': 'function Card() {\n return null;\n}\nexport { Card as View };\n',
      'a.tsx': "import * as UI from './ui.js';\nexport function Page() {\n return <UI.View />;\n}\n" });
    const opts = { path: dir, ctags: false, engine: 'regex', cache: join(dir,'scan.json') };
    assert.ok(hasEdge((await runExtract(opts)).fragment.edges, 'a.tsx:Page','ui.js:Card','call'));
    writeFileSync(join(dir,'ui.js'),'function Card() {\n return null;\n}\nexport { Card as Different };\n');
    const warm = (await runExtract(opts)).fragment, full = (await runExtract({...opts,full:true})).fragment;
    assert.ok(!hasEdge(warm.edges,'a.tsx:Page','ui.js:Card','call'));
    assert.equal(warm.meta.analysis.status,'incomplete'); assert.deepEqual(warm.edges,full.edges);
  } finally { cleanup(dir); }
});
test('ac_37 export-star ambiguity is diagnosed while default object member controls remain valid', async () => {
  const f = await fixture({ 'one.js':'export function Card() {\n return 1;\n}\n',
    'two.js':'export function Card() {\n return 2;\n}\n',
    'barrel.js':"export * from './one.js';\nexport * from './two.js';\n",
    'page.tsx':"import * as UI from './barrel.js';\nexport function Page() {\n return <UI.Card />;\n}\n",
    'default.js':'function render() {\n return 1;\n}\nexport default { render };\n',
    'consumer.js':"import api from './default.js';\nexport function invoke() {\n return api.render();\n}\n" });
  try {
    assert.ok(!f.graph.edges.some(e => e.from==='page.tsx:Page' && e.kind==='call'));
    assert.ok(f.graph.meta.analysis.diagnostics.some(d=>d.code==='unresolved-jsx-component'));
    assert.ok(hasEdge(f.graph.edges,'consumer.js:invoke','default.js:render','call'));
  } finally { cleanup(f.dir); }
});
test('ac_37 decorator factory dependencies are useful but their runtime wrapper remains qualified', async () => {
  const f = await fixture({'a.py':'def decorate():\n    return external\n\n@decorate()\ndef action():\n    return 1\n'});
  try {
    assert.ok(hasEdge(f.graph.edges,'a.py:action','a.py:decorate','ref'));
    assert.ok(f.graph.meta.analysis.diagnostics.some(d=>d.code==='unsupported-decorator-factory'));
  } finally { cleanup(f.dir); }
});
