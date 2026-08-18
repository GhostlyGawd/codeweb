// VAL-HARD-010: duplication detection reaches the two new languages. This runs the REAL pipeline
// (run.mjs: extract -> cluster -> overlap -> optimize -> report) over a fixture with a planted
// clone in C and another in C++, then asserts the findings the gate consumes.
//
// Why the full pipeline rather than overlap.mjs against a hand-built graph (tests/overlap.test.mjs's
// approach): body confirmation reads the REAL bodies via node.line + node.loc, so the finding only
// appears if the extractor measured each function's extent correctly in these languages. A
// hand-built graph would assert the detector's math, which is language-agnostic and already
// covered; what is genuinely new here is whether C and C++ symbols arrive with the right spans.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runNode, script, tmpDir, cleanup, writeTree, readJSON } from './helpers.mjs';

// One ~15-line body, planted twice per language under different names and files. The names must
// not collide across languages, or the C and C++ clusters would merge into one finding.
const C_BODY = (name) => `int ${name}(const int *items, int count) {
  int total = 0;
  int seen = 0;
  for (int i = 0; i < count; i++) {
    if (items[i] < 0) {
      continue;
    }
    total += items[i];
    seen += 1;
  }
  if (seen == 0) {
    return 0;
  }
  return total / seen;
}
`;

const CPP_BODY = (name) => `int ${name}(const std::vector<int>& items) {
  int total = 0;
  int seen = 0;
  for (std::size_t i = 0; i < items.size(); i++) {
    if (items[i] < 0) {
      continue;
    }
    total += items[i];
    seen += 1;
  }
  if (seen == 0) {
    return 0;
  }
  return total / seen;
}
`;

const FIXTURE = {
  'src/alpha.c': C_BODY('c_average'),
  'src/beta.c': C_BODY('c_average'),
  'src/alpha.cpp': '#include <vector>\n#include <cstddef>\n\n' + CPP_BODY('cpp_average'),
  'src/beta.cpp': '#include <vector>\n#include <cstddef>\n\n' + CPP_BODY('cpp_average'),
};

let SRC, WS, graph;
before(() => {
  SRC = tmpDir('codeweb-ccppdup-src-');
  WS = tmpDir('codeweb-ccppdup-ws-');
  writeTree(SRC, FIXTURE);
  const res = runNode(script('run.mjs'), [SRC, '--out-dir', WS]);
  assert.equal(res.status, 0, `the pipeline exited non-zero:\n${res.stderr}`);
  graph = readJSON(join(WS, 'graph.json'));
});
after(() => { cleanup(SRC); cleanup(WS); });

const find = (label) => (graph.overlaps || []).find((o) => o.title.includes(`\`${label}\``));

test('OCC1: a planted C duplicate across two .c files is reported', () => {
  const o = find('c_average');
  assert.ok(o, `the C clone surfaced (findings: ${JSON.stringify((graph.overlaps || []).map((x) => x.title))})`);
  assert.equal(o.kind, 'duplicate-logic');
  assert.equal(o.confidence, 'high', `byte-identical bodies confirm high, got bodySim ${o.bodySim}`);
  assert.deepEqual(o.nodes.slice().sort(), ['src/alpha.c:c_average', 'src/beta.c:c_average'],
    'the finding names both C files');
});

test('OCC2: a planted C++ duplicate across two .cpp files is reported', () => {
  const o = find('cpp_average');
  assert.ok(o, `the C++ clone surfaced (findings: ${JSON.stringify((graph.overlaps || []).map((x) => x.title))})`);
  assert.equal(o.kind, 'duplicate-logic');
  assert.equal(o.confidence, 'high', `byte-identical bodies confirm high, got bodySim ${o.bodySim}`);
  assert.deepEqual(o.nodes.slice().sort(), ['src/alpha.cpp:cpp_average', 'src/beta.cpp:cpp_average'],
    'the finding names both C++ files');
});

test('OCC3: body confirmation read REAL bodies — the extents the extractor measured are right', () => {
  // The anti-cheat for the two tests above: `high` here comes from token-shingle Jaccard over the
  // source slice [line, line+loc), so a wrong extent (e.g. a body run to EOF) would either refute
  // the pair or silently confirm on the wrong text. Pinning loc proves the span is the function.
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  for (const id of ['src/alpha.c:c_average', 'src/alpha.cpp:cpp_average']) {
    const n = byId.get(id);
    assert.ok(n, `${id} is in the graph`);
    // Signature line through closing brace inclusive — the whole definition and nothing after it.
    assert.equal(n.loc, 15, `${id} spans exactly its definition, not the whole file`);
  }
  assert.ok(find('c_average').bodySim >= 0.6, 'C bodySim is a real measurement above the high bar');
  assert.ok(find('cpp_average').bodySim >= 0.6, 'C++ bodySim likewise');
});

test('OCC4: the report the gate consumes names both languages', () => {
  assert.deepEqual(graph.meta.languages, ['c', 'cpp'], 'both languages reached the graph');
});
