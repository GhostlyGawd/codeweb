// Round 2, finding #14 — maskPy treated f-strings as plain strings, blanking `{compute(x)}`
// interpolations that are EXECUTING code (the exact analogue of the JS `${}` the JS masker keeps
// live). Functions invoked only from f-strings (logging/formatting — idiomatic Python) showed 0
// callers, poisoning caller counts and blast radii. The fix detects the 1-3 char [rRbBuUfF] prefix
// run containing f/F at every quote sighting (single-line and triple), keeps `{…}` expr code
// verbatim in both modes with a brace-depth counter ({{ / }} stay text), and routes quoted runs
// INSIDE the expr through the keepValues gate — NOT verbatim, or `f"{'compute(1)'}"` would
// fabricate an edge from string CONTENT (decoy2 pins that) and re-masking the kept quotes would
// break the shared idempotence property.
//
// --no-ctags forces the deterministic regex scanner (the path that does the masking).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runNode, tmpDir, cleanup, writeTree, readJSON, script, hasEdge } from './helpers.mjs';

const FILES = {
  'rep.py':
    'def compute(x):\n' +
    '    return x * 2\n' +
    'def report(x):\n' +
    '    return f"total={compute(x)}"\n' +
    'def multi(x):\n' +
    '    return f"""\n' +
    '    header {compute(x)} not{{code}}\n' +
    '    """\n' +
    'def prefixed(x):\n' +
    '    return rf"raw {compute(x)}"\n' +
    'def decoy(x):\n' +
    '    return "compute(x)"\n' +
    'def decoy2(x):\n' +
    "    return f\"{'compute(1)'} ok\"\n",
};

let SRC, frag;
before(() => {
  SRC = tmpDir('codeweb-fstring-');
  writeTree(SRC, FILES);
  const out = join(SRC, 'fragment.json');
  const res = runNode(script('extract-symbols.mjs'), [SRC, '--target', 'fstring-x', '--no-ctags', '--out', out]);
  assert.equal(res.status, 0, `extractor exited non-zero:\n${res.stderr}`);
  frag = readJSON(out);
});
after(() => cleanup(SRC));

test('single-line f-string: report -> compute edges', () => {
  assert.ok(hasEdge(frag.edges, 'rep.py:report', 'rep.py:compute', 'call'),
    'f"total={compute(x)}" executes compute — the edge must exist');
});

test('triple-quoted f-string: multi -> compute edges; {{code}} stays text', () => {
  assert.ok(hasEdge(frag.edges, 'rep.py:multi', 'rep.py:compute', 'call'),
    'f""" … {compute(x)} … """ executes compute across lines');
});

test('rf prefix: prefixed -> compute edges', () => {
  assert.ok(hasEdge(frag.edges, 'rep.py:prefixed', 'rep.py:compute', 'call'),
    'rf"raw {compute(x)}" is an f-string too (prefix set covers rf/fr/Rf/…)');
});

test('plain strings stay blanked: no decoy -> compute edge', () => {
  assert.ok(!hasEdge(frag.edges, 'rep.py:decoy', 'rep.py:compute'),
    '"compute(x)" without an f prefix is content, not code');
});

test('expr-interior string content stays blanked: no decoy2 -> compute edge', () => {
  assert.ok(!hasEdge(frag.edges, 'rep.py:decoy2', 'rep.py:compute'),
    "f\"{'compute(1)'} ok\" — the quoted run inside the expr is a VALUE (pins the value()-routing decision)");
});
