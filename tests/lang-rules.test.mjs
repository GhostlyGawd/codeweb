// finding 25 — the extractor's decomposed modules are testable IN-PROCESS.
// Before the split, every extractor test shelled out (`runNode` spawn per case) because symbol
// discovery and import resolution lived as module-global state inside a script. These cases
// import lib/lang-rules.mjs and lib/import-resolve.mjs directly: no spawn, no tmp dir, no JSON
// round-trip — the first extractor tests that run at function-call speed. They pin the moved
// behavior at its new seams; the byte-level guarantee stays with the A/B fragment equivalence.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanSymbols, bodyEnd, parseSignature, KEYWORDS, langOf } from '../scripts/lib/lang-rules.mjs';
import { createImportResolver, defaultExportOf } from '../scripts/lib/import-resolve.mjs';
import { maskPy } from '../scripts/lib/masking.mjs';

const noMask = () => { throw new Error('masked() must not be called for non-Python files'); };

test('LR1: scanSymbols — JS functions/classes/methods/field-arrows, in-process', () => {
  const text = [
    'export function alpha(a, b) {',
    '  return a + b;',
    '}',
    'const beta = (x) => x * 2;',
    'export class Gamma {',
    '  run(job) {',
    '    return job;',
    '  }',
    '  handleClick = () => {',
    '    this.run(1);',
    '  };',
    '}',
  ].join('\n');
  const syms = scanSymbols('/x/a.js', text, noMask);
  const by = new Map(syms.map((s) => [s.name, s]));
  assert.equal(by.get('alpha').kind, 'function');
  assert.equal(by.get('alpha').exports, true);
  assert.equal(by.get('beta').kind, 'function');
  assert.equal(by.get('beta').exports, false);
  assert.equal(by.get('Gamma').kind, 'class');
  assert.equal(by.get('run').kind, 'method');
  // class-field arrow: discovered as a method CANDIDATE (field flag) — the orchestrator keeps it
  // only when an enclosing class confirms it.
  assert.equal(by.get('handleClick').field, true);
});

test('LR2: scanSymbols — Python defs inside docstrings are masked away', () => {
  const text = [
    'def real():',
    '    """docstring with a decoy:',
    '    def fake():',
    '    """',
    '    return 1',
    'class Thing:',
    '    def method(self):',
    '        return 2',
  ].join('\n');
  const syms = scanSymbols('/x/m.py', text, (kind) => { assert.equal(kind, 'py'); return maskPy(text); });
  const names = syms.map((s) => s.name).sort();
  assert.deepEqual(names, ['Thing', 'method', 'real']); // no `fake`
  assert.equal(syms.find((s) => s.name === 'method').kind, 'method');
});

test('LR3: scanSymbols — Rust impl owners and Go receivers qualify methods', () => {
  const rust = scanSymbols('/x/l.rs', ['impl Widget {', '    pub fn new() -> Self {', '    }', '}'].join('\n'), noMask);
  assert.deepEqual(rust.find((s) => s.name === 'new').owner, 'Widget');
  const go = scanSymbols('/x/l.go', 'func (w *Widget) Render() {}\nfunc Free() {}', noMask);
  assert.equal(go.find((s) => s.name === 'Render').owner, 'Widget');
  assert.equal(go.find((s) => s.name === 'Free').kind, 'function');
});

test('LR4: bodyEnd — brace matching survives destructured params; Python dedents', () => {
  const js = ['function f({ a, b }) {', '  if (a) {', '    b();', '  }', '}', 'const next = 1;'];
  assert.equal(bodyEnd(js, 0, false), 4); // ends at the real closing brace, not the param `}`
  const py = ['def f():', '    x = 1', '', '    return x', 'def g():'];
  assert.equal(bodyEnd(py, 0, true), 3); // blank line doesn't end the body; dedent does
});

test('LR5: parseSignature — declaration and arrow forms, NBSP whitespace preserved', () => {
  assert.deepEqual(parseSignature('function f(a, b = 2) {', 'f', false).params, ['a', 'b']);
  assert.deepEqual(parseSignature('const g = async (x) => x', 'g', false).params, ['x']);
  assert.equal(parseSignature('const h = (', 'h', false), null); // multi-line params -> null, never a guess
  // finding 11 regression: U+00A0 between name and `=` must still parse (isWs includes NBSP).
  assert.deepEqual(parseSignature('const nb = (q) => q', 'nb', false).params, ['q']);
  assert.equal(parseSignature('def p(a, *args, **kw) -> int:', 'p', true).returns, 'int');
});

test('LR6: shared tables — KEYWORDS filters control flow; langOf keys the meta vocabulary', () => {
  assert.ok(KEYWORDS.has('if') && KEYWORDS.has('return'));
  assert.equal(langOf('a/b.py'), 'python');
  assert.equal(langOf('x.tsx'), 'typescript');
  assert.equal(langOf('m.cjs'), 'javascript');
});

// ---- import-resolve: a synthetic three-file JS universe + a Python package, no disk ----
function makeUniverse() {
  const root = '/r';
  const filesAbs = ['/r/src/impl.js', '/r/src/barrel.js', '/r/app.js', '/r/pkg/__init__.py', '/r/pkg/core.py'];
  const rel = (f) => f.startsWith(root + '/') ? f.slice(root.length + 1) : f;
  const relSet = new Set(filesAbs.map(rel));
  const absByRel = new Map(filesAbs.map((f) => [rel(f), f]));
  const texts = new Map([
    ['/r/src/impl.js', 'export function doWork() { return 1; }\n'],
    ['/r/src/barrel.js', "export { doWork as work } from './impl.js';\n"],
    ['/r/app.js', "import { work } from './src/barrel.js';\nexport function main() { work(); }\n"],
    ['/r/pkg/__init__.py', 'from .core import render as render\n'],
    ['/r/pkg/core.py', 'def render():\n    return 1\n'],
  ]);
  const fileSyms = new Map(filesAbs.map((f) => [f, { text: texts.get(f), ranges: [] }]));
  const nodes = [
    { id: 'src/impl.js:doWork', label: 'doWork', file: 'src/impl.js' },
    { id: 'app.js:main', label: 'main', file: 'app.js' },
    { id: 'pkg/core.py:render', label: 'render', file: 'pkg/core.py' },
  ];
  const resolver = createImportResolver({
    rel, relSet, absByRel, fileSyms,
    textOf: (fAbs, rec) => rec.text,
    maskedOnce: (relPath, kind, text) => (kind === 'py' ? maskPy(text) : text),
    nodeIdSet: new Set(nodes.map((n) => n.id)),
    nodes,
  });
  return { resolver, texts };
}

test('IR1: re-export chain — renamed barrel export resolves to the real symbol, in-process', () => {
  const { resolver, texts } = makeUniverse();
  const { map } = resolver.scanJsReExports('/r/src/barrel.js', 'src/barrel.js', texts.get('/r/src/barrel.js'));
  assert.deepEqual(map.get('work'), { target: 'src/impl.js', orig: 'doWork' });
  assert.equal(resolver.resolveReExport('src/barrel.js', 'work'), 'src/impl.js:doWork');
  assert.equal(resolver.resolveReExport('src/barrel.js', 'missing'), null); // unknown name -> null, no phantom
});

test('IR2: bindFileImports — a named import through the barrel binds the alias and the edge', () => {
  const { resolver, texts } = makeUniverse();
  resolver.scanJsReExports('/r/src/barrel.js', 'src/barrel.js', texts.get('/r/src/barrel.js'));
  const { amap, edges } = resolver.bindFileImports({
    fAbs: '/r/app.js', r: 'app.js', isPy: false, text: texts.get('/r/app.js'),
    aId: 'app.js:main', defaultExportByFile: new Map(), kindById: new Map(),
  });
  assert.equal(amap.get('work'), 'src/impl.js:doWork');
  assert.deepEqual(edges, [['app.js:main', 'src/impl.js:doWork']]);
});

test('IR3: Python re-export table — pkg/__init__ from-import chains to the defining module', () => {
  const { resolver } = makeUniverse();
  assert.equal(resolver.pyReExportResolve('pkg/__init__.py', 'render'), 'pkg/core.py:render');
  assert.equal(resolver.resolveFileMember('pkg/__init__.py', 'render'), 'pkg/core.py:render');
});

test('IR4: defaultExportOf — single-symbol defaults resolve, object defaults do not', () => {
  assert.equal(defaultExportOf('a.js', 'export default function Boot() {}', new Set(['Boot'])), 'a.js:Boot');
  assert.equal(defaultExportOf('a.js', 'export default { merge };', new Set(['merge'])), null);
});
