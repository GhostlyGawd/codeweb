import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, utimesSync } from 'node:fs';
import { sameLineDeclarations, extractionAnalysis, DIAGNOSTIC_CAP } from '../scripts/lib/analysis-completeness.mjs';
import { maskJs } from '../scripts/lib/masking.mjs';
import { runExtract as extractSymbols } from '../scripts/extract-symbols.mjs';
import { normalizeGraph, gateVerdict } from '../scripts/lib/graph-ops.mjs';
import { diffGraphs } from '../scripts/lib/diff-core.mjs';
import { gateComment } from '../scripts/lib/gate-md.mjs';
import { tmpDir, cleanup, script, runNode, writeTree } from './helpers.mjs';
import { startServer, initServer } from './mcp-harness.mjs';

const inspect = (s, f = 'a.ts') => sameLineDeclarations(maskJs(s, { statementRegex: true }), f);
const aGreen = 'export function a() { return 1; }\n';
const b = "import { a } from './a.js';\nexport function b() { return a(); }\n";
const aBad = "import { b } from './b.js'; export function a() { return b(); }\n";
const aRed = "import { b } from './b.js';\nexport function a() { return b(); }\n";
const partial = (source = aBad) => {
  const root = tmpDir('cw-incomplete-'), src = join(root, 'src'), ws = join(root, '.codeweb');
  mkdirSync(src); mkdirSync(ws); writeTree(src, { 'a.js': source, 'b.js': b });
  const gp = join(ws, 'graph.json');
  writeFileSync(gp, JSON.stringify({ meta: { root: src }, nodes: [], edges: [], overlaps: [] }));
  return { root, src, ws, gp };
};

test('ac_27: unsupported statement layouts are detected with masked, bounded evidence', () => {
  for (const source of [aBad, 'function helper() {} export function a() {}',
    'function helper() {} function a() {}', "import x from 'x'; export const a = () => x();",
    'const helper = () => 1; export const a = async () => helper();',
    'class Helper {} export class A {}', 'function outer() { function inner() {} }',
    "import x from 'x'; export function*a() { yield x(); }",
    "import x from 'x'; export async function*a() { yield x(); }"]) {
    const p = inspect(source); assert.equal(p.count, 1, source);
    assert.equal(p.diagnostics[0].file, 'a.ts'); assert.equal(p.diagnostics[0].line, 1);
    assert.ok(p.diagnostics[0].column > 1);
    assert.ok(p.diagnostics[0].evidence.length <= 160);
  }
  const huge = inspect(Array(100).fill(aBad).join('\n'));
  assert.equal(huge.count, 100); assert.equal(huge.diagnostics.length, DIAGNOSTIC_CAP);
  assert.equal(extractionAnalysis([huge, huge]).diagnosticCount, 200);
  assert.equal(extractionAnalysis([huge, huge]).diagnostics.length, DIAGNOSTIC_CAP);
  const secret = inspect("import x from 'private-value'; /* private-comment */ export function a() {} ");
  assert.equal(secret.count, 1); assert.doesNotMatch(JSON.stringify(secret), /private-/);
});

test('ac_27: masking negatives and ordinary supported syntax are not flagged', () => {
  const sources = [
    '// import x; export function fake() {}\n' + aGreen,
    '/* function first() {} function fake() {} */\n' + aGreen,
    '/* start\n import x; export const fake = () => {};\n*/\n' + aGreen,
    `const text = "import x; export function fake() {}";\n${aGreen}`,
    'const text = `function first() {} function fake() {}`;\n' + aGreen,
    'const re = /; export function fake() {}/g;\n' + aGreen,
    'const re = /[\\/]; export const fake = () => {}/;\n' + aGreen,
    'if (ok) /; export function fake() {}/.test(text);\n' + aGreen,
    'const divided = value / other;\n' + aGreen,
    'const value = 1; functionality();\n' + aGreen,
    aRed, 'export async function a(\n x\n) {\n return x;\n}\n',
    'export class A {\n  method() { return 1; }\n}\n',
    'const f = function named() {};\nconst cb = (x) => x;\n',
    'items.map(function named(x) { return x; });\n',
    'export default function a() {}\n',
  ];
  for (const s of sources) assert.equal(inspect(s).count, 0, s);
});

test('ac_27: default partial extraction and cold/stamp/hash caches retain diagnostics; edits clear them', async () => {
  const f = partial();
  try {
    const cache = join(f.ws, 'scan.json');
    const opts = { path: f.src, cache, ctags: false, engine: 'regex' };
    const cold = await extractSymbols(opts);
    assert.ok(cold.fragment.nodes.length > 0);
    assert.equal(cold.fragment.meta.analysis.status, 'incomplete');
    const warm = await extractSymbols(opts);
    assert.match(warm.banner, /scanned 0\/2/);
    assert.deepEqual(warm.fragment.meta.analysis, cold.fragment.meta.analysis);
    utimesSync(join(f.src, 'a.js'), new Date(), new Date(Date.now() + 10000));
    const hash = await extractSymbols(opts);
    assert.deepEqual(hash.fragment.meta.analysis, cold.fragment.meta.analysis);
    writeFileSync(join(f.src, 'a.js'), aGreen);
    const fixed = await extractSymbols(opts);
    assert.equal(fixed.fragment.meta.analysis.status, 'no-known-incompleteness');
    assert.equal(fixed.fragment.meta.analysis.diagnosticCount, 0);
  } finally { cleanup(f.root); }
});

test('ac_27: default CLI partial maps and both snapshot sides are inconclusive; supported red/green controls remain', async () => {
  const f = partial(aGreen);
  try {
    const opts = { path: f.src, ctags: false, engine: 'regex' };
    const before = normalizeGraph((await extractSymbols(opts)).fragment);
    writeFileSync(join(f.src, 'a.js'), aBad);
    const r = runNode(script('extract-symbols.mjs'), [f.src, '--no-ctags', '--engine', 'regex']);
    assert.equal(r.status, 0, r.stderr); assert.match(r.stderr, /analysis incomplete/);
    const after = normalizeGraph(JSON.parse(r.stdout));
    const d = diffGraphs(before, after);
    assert.deepEqual(d.payload.cycles.added, [], 'reproduces the missing cycle, contained by diagnostics');
    assert.equal(d.code, 2); assert.equal(d.payload.ok, false); assert.equal(d.payload.verdict.ok, false);
    assert.equal(d.payload.status, 'inconclusive');
    assert.equal(d.payload.analysis.checks.cycles, 'incomplete');
    assert.equal(d.payload.analysis.completeness.diagnostics[0].snapshot, 'after');
    assert.equal(diffGraphs(after, before).code, 2, 'incomplete baseline also blocks');
    assert.equal(gateVerdict(before, after).ok, false, 'shared simulation/codemod gate cannot claim clean');
    const md = gateComment(d.payload, { graph: after, upgrade: false });
    assert.match(md, /gate inconclusive/); assert.match(md, /a\.js:1/); assert.doesNotMatch(md, /✅ no structural regressions/);
    writeFileSync(join(f.src, 'a.js'), aRed);
    const red = normalizeGraph((await extractSymbols(opts)).fragment);
    assert.equal(diffGraphs(before, red).code, 1); assert.equal(diffGraphs(before, red).payload.cycles.added.length, 1);
    assert.equal(diffGraphs(before, before).code, 0);
  } finally { cleanup(f.root); }
});

test('ac_27: CLI refresh/baseline, query and review carry incomplete analysis through repair', () => {
  const f = partial(aGreen);
  try {
    const run = (name, args) => runNode(script(name), args, { env: { CODEWEB_ENGINE: 'regex' } });
    assert.equal(run('refresh.mjs', [f.gp, '--baseline', '--json']).status, 0);
    const baseline = join(f.ws, 'graph.baseline.json'), original = readFileSync(baseline, 'utf8');
    writeFileSync(join(f.src, 'a.js'), aBad);
    const refresh = run('refresh.mjs', [f.gp, '--json']);
    assert.equal(refresh.status, 0); assert.equal(JSON.parse(refresh.stdout).analysis.status, 'incomplete');
    for (const [name, args] of [
      ['diff.mjs', ['baseline', f.gp, '--refresh', '--json']],
      ['query.mjs', [f.gp, '--cycles', '--json']],
      ['review.mjs', [f.gp, '--changed', 'a.js', '--gate', '--json']],
      ['review.mjs', [f.gp, '--changed', 'a.js', '--before', baseline, '--gate', '--json']],
    ]) {
      const r = run(name, args); assert.equal(r.status, 2, r.stderr + r.stdout);
      const p = JSON.parse(r.stdout); assert.equal(p.analysis?.status || p.analysis?.completeness?.status, 'incomplete');
    }
    const htmlPath = join(f.root, 'review.html');
    const html = run('review.mjs', [f.gp, '--changed', 'a.js', '--before', baseline, '--gate', '--html', htmlPath, '--json']);
    assert.equal(html.status, 2, html.stderr);
    assert.equal(JSON.parse(html.stdout).verdict.status, 'inconclusive');
    assert.match(readFileSync(htmlPath, 'utf8'), /Analysis is inconclusive/);
    assert.doesNotMatch(readFileSync(htmlPath, 'utf8'), /No regression found by the checks that ran/);
    const text = run('diff.mjs', [baseline, f.gp]);
    assert.match(text.stdout, /INCONCLUSIVE/); assert.doesNotMatch(text.stdout, /ok — no structural regressions/);
    assert.equal(readFileSync(baseline, 'utf8'), original);
    writeFileSync(join(f.src, 'a.js'), aGreen);
    const fixed = run('diff.mjs', ['baseline', f.gp, '--refresh', '--json']);
    assert.equal(fixed.status, 0, fixed.stderr); assert.equal(JSON.parse(fixed.stdout).ok, true);
    assert.equal(readFileSync(baseline, 'utf8'), original);
    assert.equal(JSON.parse(readFileSync(f.gp)).meta.analysis.status, 'no-known-incompleteness');
  } finally { cleanup(f.root); }
});

const call = (id, name, args) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
const payload = (r) => { assert.ok(!r.result.isError, r.result.content?.[0]?.text); return JSON.parse(r.result.content[0].text); };
test('ac_27: MCP fast and spawned gate paths preserve structured inconclusive results and baseline bytes', async () => {
  const f = partial(aGreen);
  const h = startServer({ cwd: f.root, env: { CODEWEB_WS: f.ws, CODEWEB_ENGINE: 'regex', CODEWEB_NO_AUTOREFRESH: '1', CODEWEB_NO_STATS: '1' } });
  try {
    await initServer(h);
    h.send(call(2, 'codeweb_refresh', { baseline: true })); payload(await h.reply(2));
    const baseline = join(f.ws, 'graph.baseline.json'), original = readFileSync(baseline, 'utf8');
    writeFileSync(join(f.src, 'a.js'), aBad);
    h.send(call(3, 'codeweb_diff', { before: 'baseline', refresh: true }));
    const spawned = payload(await h.reply(3));
    assert.equal(spawned.status, 'inconclusive'); assert.equal(spawned.ok, false);
    h.send(call(4, 'codeweb_diff', { before: 'baseline' }));
    const fast = payload(await h.reply(4)); assert.equal(fast.ok, false);
    assert.deepEqual(fast.analysis, spawned.analysis);
    h.send(call(5, 'codeweb_cycles', {}));
    assert.equal(payload(await h.reply(5)).analysis.status, 'incomplete');
    h.send(call(6, 'codeweb_review', { changed: 'a.js', gate: true }));
    assert.equal(payload(await h.reply(6)).verdict.status, 'inconclusive');
    writeFileSync(join(f.src, 'a.js'), aGreen);
    h.send(call(7, 'codeweb_diff', { before: 'baseline', refresh: true }));
    assert.equal(payload(await h.reply(7)).ok, true);
    assert.equal(readFileSync(baseline, 'utf8'), original);
  } finally { h.close(); await h.exited; cleanup(f.root); }
});

test('ac_27: same-line multiple declarations remain incomplete with nonempty default graphs', () => {
  const f = partial('function helper() {} export function a() { return b(); }\n');
  try {
    const r = runNode(script('extract-symbols.mjs'), [f.src, '--no-ctags', '--engine', 'regex']);
    assert.equal(r.status, 0, r.stderr);
    const g = JSON.parse(r.stdout);
    assert.ok(g.nodes.some((n) => n.label === 'helper'));
    assert.equal(g.meta.analysis.status, 'incomplete');
    assert.equal(g.meta.analysis.diagnostics[0].file, 'a.js');
  } finally { cleanup(f.root); }
});

test('ac_27: wholly omitted declarations still fail default extraction with diagnostic locations', () => {
  const f = partial();
  try {
    writeFileSync(join(f.src, 'b.js'), "import { a } from './a.js'; export function b() { return a(); }\n");
    const r = runNode(script('extract-symbols.mjs'), [f.src, '--no-ctags', '--engine', 'regex']);
    assert.equal(r.status, 1); assert.match(r.stderr, /analysis incomplete/); assert.match(r.stderr, /a\.js/);
  } finally { cleanup(f.root); }
});


test('ac_27: inline generator declarations cannot produce a clean partial-graph verdict', async () => {
  const f = partial("import { b } from './b.js'; export function*a() { yield b(); }\n");
  try {
    const graph = normalizeGraph((await extractSymbols({ path: f.src, ctags: false, engine: 'regex' })).fragment);
    assert.ok(graph.nodes.length > 0, 'partial map must exercise more than the empty guard');
    assert.equal(graph.meta.analysis.status, 'incomplete');
    const before = normalizeGraph({ meta: { root: f.src }, nodes: [], edges: [], overlaps: [] });
    const result = diffGraphs(before, graph);
    assert.equal(result.code, 2);
    assert.equal(result.payload.ok, false);
    assert.equal(result.payload.status, 'inconclusive');
  } finally { cleanup(f.root); }
});


test('ac_27: diagnostic regex masking survives multiline control heads without masking division', async () => {
  const literal = '/; export function fake() {}/.test(text);';
  for (const head of ['if (ok)\n', 'if (\n check(value)\n)\n', 'while (ok)\n',
    'for (let i = 0; i < 1; i++)\n', 'if (ok) /* comment\n continued */\n', 'for await (const x of items)\n']) {
    const source = aGreen + head + '  ' + literal + '\n';
    assert.equal(inspect(source).count, 0, head);
    assert.doesNotMatch(maskJs(source, { statementRegex: true }), /fake/, 'regex text must not enter evidence');
  }
  for (const call of ['compute()', 'obj.if(ok)']) {
    const source = `const ratio = ${call}\n / divisor / other; export function actual() {}\n`;
    const masked = maskJs(source, { statementRegex: true });
    assert.match(masked, /divisor/, 'division operands remain code');
    assert.equal(inspect(source).count, 1, 'the real same-line declaration remains diagnosed');
  }
  const f = partial(aGreen + 'if (ok)\n  ' + literal + '\n');
  try {
    const graph = normalizeGraph((await extractSymbols({ path: f.src, ctags: false, engine: 'regex' })).fragment);
    assert.equal(graph.meta.analysis.diagnosticCount, 0);
    const result = diffGraphs(graph, graph);
    assert.equal(result.code, 0);
    assert.equal(result.payload.ok, true);
  } finally { cleanup(f.root); }
});
