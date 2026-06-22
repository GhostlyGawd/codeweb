// F7 integration — deadcode.mjs honors a .codeweb/annotations.json false-positive suppression written
// by annotate.mjs: a suppressed orphan is hidden + counted, --show-suppressed reveals it, and changing
// the symbol's id resurfaces it (the anti-stale-suppression lock). The lib is unit-tested in
// annotations.test.mjs; this proves the end-to-end CLI workflow.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runNode, script, tmpDir, cleanup, readJSON } from './helpers.mjs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const GRAPH = {
  meta: { target: 'supp' }, domains: [], overlaps: [],
  nodes: [
    { id: 'a.js:used', label: 'used', kind: 'function', file: 'a.js', exports: true, loc: 3 },
    { id: 'b.js:dead', label: 'dead', kind: 'function', file: 'b.js', exports: false, loc: 4 },
  ],
  edges: [],
};

function stage() {
  const dir = tmpDir('codeweb-supp-');
  const gp = join(dir, 'graph.json'); writeFileSync(gp, JSON.stringify(GRAPH));
  return { dir, gp };
}

test('F7-SUPPRESS: annotate a deadcode finding -> deadcode hides + counts it; --show-suppressed reveals', () => {
  const { dir, gp } = stage();
  try {
    // 1. deadcode reports b.js:dead as safe, with a stable fingerprint
    const before = JSON.parse(runNode(script('deadcode.mjs'), [gp, '--annotations', dir, '--json']).stdout);
    const dead = before.safe.find((o) => o.id === 'b.js:dead');
    assert.ok(dead && dead.fingerprint, 'finding carries a fingerprint');
    assert.equal(before.totals.suppressed, 0);

    // 2. annotate it as a false positive (writes <dir>/annotations.json — never touches source)
    const ann = runNode(script('annotate.mjs'), ['--suppress', dead.fingerprint, '--dir', dir, '--note', 'framework entrypoint', '--json']);
    assert.equal(ann.status, 0, ann.stderr);

    // 3. deadcode now hides it and counts the suppression
    const after = JSON.parse(runNode(script('deadcode.mjs'), [gp, '--annotations', dir, '--json']).stdout);
    assert.ok(!after.safe.some((o) => o.id === 'b.js:dead'), 'suppressed finding is hidden from safe');
    assert.equal(after.totals.suppressed, 1);
    assert.ok(after.suppressed.some((o) => o.id === 'b.js:dead'));

    // 4. --show-suppressed brings it back
    const shown = JSON.parse(runNode(script('deadcode.mjs'), [gp, '--annotations', dir, '--show-suppressed', '--json']).stdout);
    assert.ok(shown.safe.some((o) => o.id === 'b.js:dead'), '--show-suppressed reveals it again');
  } finally { cleanup(dir); }
});

test('F7-RESURFACE: changing the orphan id changes its fingerprint -> not silently suppressed', () => {
  const { dir, gp } = stage();
  try {
    const before = JSON.parse(runNode(script('deadcode.mjs'), [gp, '--annotations', dir, '--json']).stdout);
    const fp = before.safe.find((o) => o.id === 'b.js:dead').fingerprint;
    runNode(script('annotate.mjs'), ['--suppress', fp, '--dir', dir, '--json']);
    // rename the dead symbol (id changes) and re-write the graph
    const g2 = { ...GRAPH, nodes: GRAPH.nodes.map((n) => (n.id === 'b.js:dead' ? { ...n, id: 'b.js:deadRenamed', label: 'deadRenamed' } : n)) };
    writeFileSync(gp, JSON.stringify(g2));
    const after = JSON.parse(runNode(script('deadcode.mjs'), [gp, '--annotations', dir, '--json']).stdout);
    assert.ok(after.safe.some((o) => o.id === 'b.js:deadRenamed'), 'a new identity resurfaces — an old suppression cannot hide it');
    assert.equal(after.totals.suppressed, 0);
  } finally { cleanup(dir); }
});
