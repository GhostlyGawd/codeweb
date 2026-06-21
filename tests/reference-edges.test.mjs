// Regression suite for higher-order reference edges + method-call precision.
//
// (1) RECALL — a function passed by NAME as an argument (arr.map(fn), rl.on('x', fn)) is a real
//     dependency: fn gets invoked by the callee. The call regex (`name(`) misses it, so fn looks
//     like dead code to --orphans (real repro: overlap.mjs:bodyShingles via nodes.map(bodyShingles),
//     mcp-server.mjs:handle via rl.on('line', handle)). Capture these as call edges.
// (2) PRECISION — a method call obj.fn() must NOT resolve to a top-level fn(): the call regex ignored
//     a leading `.`, fabricating edges (nodes.push -> a local push, data.format -> a top-level format).
//
// --no-ctags forces deterministic extraction regardless of host tooling.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runNode, tmpDir, cleanup, writeTree, readJSON, script, hasEdge, indegree } from './helpers.mjs';

const FILES = {
  'ho.mjs':
    'function handle(line) {\n' +            // 1   body 1-3
    '  return line.length;\n' +             // 2
    '}\n' +                                 // 3
    'function format(x) {\n' +              // 4   body 4-6 — ONLY ever used as data.format() (a method)
    '  return String(x);\n' +               // 5
    '}\n' +                                 // 6
    'const score = (n) => n * 2;\n' +       // 7   body 7
    'function setup(items, rl, data) {\n' + // 8   body 8-13
    '  const sizes = items.map(score);\n' + // 9   setup -> score   (ref arg to .map)
    '  rl.on("line", handle);\n' +          // 10  setup -> handle  (ref as 2nd arg)
    '  const t = data.format(sizes);\n' +   // 11  data.format() is a METHOD -> NO edge to ho:format
    '  return t || sizes;\n' +              // 12
    '}\n' +                                 // 13
    'export { setup };\n',                  // 14
};

let SRC, OUT;
before(() => { SRC = tmpDir('codeweb-ref-'); writeTree(SRC, FILES); OUT = join(SRC, 'fragment.json'); });
after(() => cleanup(SRC));

function extract() {
  const res = runNode(script('extract-symbols.mjs'), [SRC, '--target', 'ref-x', '--no-ctags', '--out', OUT]);
  assert.equal(res.status, 0, `extractor exited non-zero:\n${res.stderr}`);
  return readJSON(OUT);
}

test('RECALL: a function passed to .map(fn) is captured as a reference edge', () => {
  const frag = extract();
  assert.ok(hasEdge(frag.edges, 'ho.mjs:setup', 'ho.mjs:score', 'call'),
    'setup -> score via items.map(score)');
});

test('RECALL: a function passed as a callback argument is captured', () => {
  const frag = extract();
  assert.ok(hasEdge(frag.edges, 'ho.mjs:setup', 'ho.mjs:handle', 'call'),
    'setup -> handle via rl.on("line", handle)');
});

test('PRECISION: a method call obj.fn() does NOT resolve to a top-level fn()', () => {
  const frag = extract();
  // format is only ever written as `data.format(...)` — a method on the `data` param, not the
  // module's top-level format. The leading-dot guard must keep this edge from being fabricated.
  assert.equal(indegree(frag.edges, 'ho.mjs:format', 'call'), 0,
    'data.format() must not fabricate an edge to the top-level format');
});
