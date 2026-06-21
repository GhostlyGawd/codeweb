// Regression suite for module-scope extraction.
//
// Locks in the fix for the EOF-absorbing range bug: the extractor gave the LAST named symbol in a
// file the range [start, end-of-file], so it absorbed all the trailing top-level code and was
// credited with calls it never made (real-world repro: query.mjs:parseArgs — a self-contained arg
// parser — surfaced with 9 outgoing call edges to lib/graph-ops.mjs, every one fabricated).
//
// The fix: detect each symbol's REAL body extent (brace-matching for JS/TS, dedent for Python) and
// route calls made in module/top-level scope to a synthetic per-file `module` node (kind already in
// graph-schema.md and already excluded by overlap.mjs) instead of mis-attributing them to a function.
//
// All runs force --no-ctags so extraction is deterministic regardless of host tooling.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runNode, tmpDir, cleanup, writeTree, readJSON, script, hasEdge } from './helpers.mjs';

// cli.mjs mirrors the real query.mjs shape: a small self-contained `parseArgs`, a non-exported
// helper `fmt`, then a block of TOP-LEVEL dispatch that calls parseArgs, an imported helper, and
// fmt. Pre-fix, parseArgs (the last symbol) absorbed lines 8+ and was credited with those calls.
const FILES = {
  'ops.mjs': 'export function runImpact(o) {\n  return o.n;\n}\n',
  'cli.mjs':
    'import { runImpact } from "./ops.mjs";\n' + // 1  module-scope import
    'function fmt(x) {\n' +                       // 2  local helper, NOT exported  (body 2-4)
    '  return "[" + x + "]";\n' +                 // 3
    '}\n' +                                       // 4
    'function parseArgs(argv) {\n' +              // 5  self-contained, calls nothing (body 5-7)
    '  return { n: argv.length };\n' +            // 6
    '}\n' +                                       // 7
    'const opts = parseArgs(process.argv);\n' +   // 8  module -> parseArgs
    'const out = runImpact(opts);\n' +            // 9  module -> ops:runImpact
    'const s = fmt(out);\n' +                     // 10 module -> fmt
    'process.stdout.write(s);\n',                 // 11
  // app.py exercises Python dedent-based body extent: two defs, then top-level calls to both.
  'app.py':
    'def parse(args):\n' +    // 1  body 1-2
    '    return len(args)\n' + // 2
    '\n' +                     // 3
    'def run(opts):\n' +      // 4  body 4-5
    '    return opts\n' +      // 5
    '\n' +                     // 6
    'cfg = parse(["a"])\n' +  // 7  module -> app.py:parse
    'run(cfg)\n',             // 8  module -> app.py:run
  // rx.mjs pins a dogfood-found bug: a function whose body contains a regex literal with braces
  // (escaped \{ and a {2,} quantifier) must not corrupt brace-matching and absorb trailing
  // top-level code. The real extract-symbols.mjs:scanSymbols hit exactly this.
  'rx.mjs':
    'function scan(s) {\n' +              // 1  body 1-3
    '  return /^\\s{2,}\\{/.test(s);\n' + // 2  regex: {2,} balanced + escaped \{ (stray brace)
    '}\n' +                               // 3
    'const ok = scan("  {");\n',          // 4  module -> scan (pre-fix: scan absorbed this as a self-call)
};

let SRC, OUT;
before(() => { SRC = tmpDir('codeweb-modscope-'); writeTree(SRC, FILES); OUT = join(SRC, 'fragment.json'); });
after(() => cleanup(SRC));

function extract() {
  const res = runNode(script('extract-symbols.mjs'), [SRC, '--target', 'mod-x', '--no-ctags', '--out', OUT]);
  assert.equal(res.status, 0, `extractor exited non-zero:\n${res.stderr}`);
  return readJSON(OUT);
}

const MOD = 'cli.mjs:<module>';
const PYMOD = 'app.py:<module>';

test('emits a per-file `module` node for files with top-level calls', () => {
  const frag = extract();
  const mod = frag.nodes.find((n) => n.id === MOD);
  assert.ok(mod, 'cli.mjs:<module> node exists');
  assert.equal(mod.kind, 'module', 'kind is "module"');
  assert.equal(mod.file, 'cli.mjs', 'file points at the owning file');
});

test('top-level calls attribute to the module node, not the trailing function', () => {
  const frag = extract();
  assert.ok(hasEdge(frag.edges, MOD, 'cli.mjs:parseArgs', 'call'), 'module -> parseArgs');
  assert.ok(hasEdge(frag.edges, MOD, 'ops.mjs:runImpact', 'call'), 'module -> ops:runImpact (alias-resolved)');
  assert.ok(hasEdge(frag.edges, MOD, 'cli.mjs:fmt', 'call'), 'module -> fmt');
});

test('PRECISION: the trailing function does NOT absorb top-level calls (the EOF-range bug)', () => {
  const frag = extract();
  const fromParseArgs = frag.edges.filter((e) => e.from === 'cli.mjs:parseArgs' && e.kind === 'call');
  assert.equal(fromParseArgs.length, 0, 'parseArgs calls nothing within its real body [5,7]');
  assert.ok(!hasEdge(frag.edges, 'cli.mjs:parseArgs', 'ops.mjs:runImpact'), 'no fabricated parseArgs -> runImpact');
  assert.ok(!hasEdge(frag.edges, 'cli.mjs:parseArgs', 'cli.mjs:fmt'), 'no fabricated parseArgs -> fmt');
});

test('RECALL: a non-exported helper called only from module scope is not a false orphan', () => {
  const frag = extract();
  // fmt is not exported and only called at top level -> its sole caller must be the module node.
  // Pre-fix this edge dropped or mis-attributed, making fmt look like dead code to --orphans.
  const callersOfFmt = frag.edges.filter((e) => e.to === 'cli.mjs:fmt' && e.kind === 'call').map((e) => e.from);
  assert.deepEqual(callersOfFmt, [MOD], 'fmt has exactly the module node as its caller');
});

test('Python: dedent body extent + module attribution', () => {
  const frag = extract();
  const mod = frag.nodes.find((n) => n.id === PYMOD);
  assert.ok(mod && mod.kind === 'module', 'app.py:<module> node exists');
  assert.ok(hasEdge(frag.edges, PYMOD, 'app.py:parse', 'call'), 'module -> parse');
  assert.ok(hasEdge(frag.edges, PYMOD, 'app.py:run', 'call'), 'module -> run');
  // run() is the last def; pre-fix its range ran to EOF and absorbed the top-level calls.
  assert.equal(frag.edges.filter((e) => e.from === 'app.py:run' && e.kind === 'call').length, 0,
    'run absorbs no top-level calls');
});

test('regex literals with braces do not corrupt body-end (scanSymbols repro)', () => {
  const frag = extract();
  // scan's real body is [1,3]; the line-4 call must attribute to the module, not be swallowed as a
  // self-call. Pre-fix, the `\{` in scan's regex left brace depth > 0 so scan ran past line 3.
  assert.ok(hasEdge(frag.edges, 'rx.mjs:<module>', 'rx.mjs:scan', 'call'), 'module -> scan');
  assert.equal(frag.edges.filter((e) => e.from === 'rx.mjs:scan' && e.kind === 'call').length, 0,
    'scan absorbs no trailing top-level call');
});
