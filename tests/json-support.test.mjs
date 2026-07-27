// JSON config tier (scanner v18) — imported .json files are first-class, FILE-LEVEL map nodes.
// The contract under test:
//   - a .json file something imports becomes `<path>:<module>` (created on demand, like barrels);
//     an orphan json file never becomes a node (no package-lock noise)
//   - every JS/TS import form reaches it: default, named (TS resolveJsonModule — coarse module
//     edge, since a json file defines no symbol nodes), namespace, require, and extensionless
//     require (`./data` -> data.json, Node's own probe order — .js always wins over .json)
//   - a test-file importer reclassifies the edge to `test`, like every other import
//   - mapped json files carry meta.sources staleness stamps (edits and deletions get flagged);
//     meta.languages says 'json' only when json nodes exist
//   - json content is NEVER parsed — support is membership + stat + hash, no grammar in the loop
//     (fragment stays deterministic run-over-run)
//   - the pre-edit hook speaks for an imported json file (importer count + card), byte-identical
//     from the index-lite sidecar and the graph fallback (the Spec P parity contract)
// All extracts force ctags off so symbol discovery is deterministic regardless of the host.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { appendFileSync, rmSync, existsSync } from 'node:fs';
import { runNode, tmpDir, cleanup, writeTree, script, hasEdge } from './helpers.mjs';
import { runExtract } from '../scripts/extract-symbols.mjs';
import { checkStaleness } from '../scripts/lib/cli.mjs';
import { preview } from '../hooks/pre-edit-impact.mjs';

const RUN = script('run.mjs');

const FILES = {
  'config.json': '{\n  "port": 8080\n}\n',
  'pkg/package.json': '{\n  "version": "1.2.3"\n}\n',
  'data.json': '{\n  "rows": []\n}\n',
  'orphan.json': '{\n  "unused": true\n}\n',
  'golden.json': '{\n  "expect": 42\n}\n',
  'app.mjs': "import cfg from './config.json';\nexport function start() {\n  return cfg.port;\n}\n",
  'ns.mjs': "import * as all from './config.json';\nexport function dump() {\n  return all;\n}\n",
  'ver.ts': "import { version } from './pkg/package.json';\nexport function ver() {\n  return version;\n}\n",
  'legacy.cjs': "const d = require('./data');\nfunction load() {\n  return d.rows;\n}\nmodule.exports = { load };\n",
  'app.test.mjs': "import fx from './golden.json';\nimport { start } from './app.mjs';\nexport function checkGolden() {\n  return start() === fx.expect;\n}\n",
};

let SRC;
before(() => { SRC = tmpDir('codeweb-json-'); writeTree(SRC, FILES); });
after(() => cleanup(SRC));

const extract = () => runExtract({ path: SRC, ctags: false });

test('imported json files become <module> nodes; orphans never do', async () => {
  const { fragment: frag } = await extract();
  const ids = new Set(frag.nodes.map((n) => n.id));
  assert.ok(ids.has('config.json:<module>'), 'default-imported json is a node');
  assert.ok(ids.has('pkg/package.json:<module>'), 'named-imported json is a node');
  assert.ok(ids.has('data.json:<module>'), 'extensionless require resolves to the json');
  assert.ok(ids.has('golden.json:<module>'), 'test-imported json is a node');
  assert.ok(!ids.has('orphan.json:<module>'), 'an orphan json file is NOT a node (no lock-file noise)');
});

test('every import form wires the file-level edge with the right kind', async () => {
  const { fragment: frag } = await extract();
  assert.ok(hasEdge(frag.edges, 'app.mjs:start', 'config.json:<module>', 'import'), 'default import');
  assert.ok(hasEdge(frag.edges, 'ns.mjs:dump', 'config.json:<module>', 'import'), 'namespace import');
  assert.ok(hasEdge(frag.edges, 'ver.ts:ver', 'pkg/package.json:<module>', 'import'),
    'named import from json emits the coarse module edge (no symbol nodes to bind)');
  assert.ok(hasEdge(frag.edges, 'legacy.cjs:load', 'data.json:<module>', 'import'), 'extensionless require');
  assert.ok(hasEdge(frag.edges, 'app.test.mjs:checkGolden', 'golden.json:<module>', 'test'),
    'a test-file importer reclassifies to a test edge');
  assert.ok(!frag.edges.some((e) => e.to === 'orphan.json:<module>' || e.from === 'orphan.json:<module>'));
});

test('mapped json files are stamped into meta.sources; languages gains json', async () => {
  const { fragment: frag } = await extract();
  for (const r of ['config.json', 'pkg/package.json', 'data.json', 'golden.json']) {
    const st = frag.meta.sources[r];
    assert.ok(st && st.s > 0 && st.h, `${r} carries a full {s,m,h} staleness stamp`);
  }
  assert.equal(frag.meta.sources['orphan.json'], undefined, 'orphans are not stamped (not in the map)');
  assert.ok(frag.meta.languages.includes('json'), "meta.languages includes 'json' when json nodes exist");
});

test('a json edit after mapping is flagged stale (the map admits it is behind)', async () => {
  const { fragment: frag } = await extract();
  assert.equal(checkStaleness(frag), null, 'fresh right after extract');
  appendFileSync(join(SRC, 'config.json'), '\n');
  try {
    const stale = checkStaleness(frag);
    assert.ok(stale && stale.files.includes('config.json'), 'the edited json file is named');
  } finally {
    // restore byte size for the fixtures that re-extract after this test
    writeTree(SRC, { 'config.json': FILES['config.json'] });
  }
});

test('json is never parsed: a syntactically broken json file still maps identically', async () => {
  writeTree(SRC, { 'config.json': '{ this is not json\n' });
  try {
    const { fragment: frag } = await extract();
    assert.ok(frag.nodes.some((n) => n.id === 'config.json:<module>'),
      'file-level support does not care about content validity (no parser in the loop)');
  } finally { writeTree(SRC, { 'config.json': FILES['config.json'] }); }
});

test('fragment is deterministic run-over-run', async () => {
  const a = await extract();
  const b = await extract();
  assert.equal(JSON.stringify(a.fragment), JSON.stringify(b.fragment));
});

test('a json-only tree still refuses to masquerade as a map (json is a tier, not a language)', () => {
  const dir = tmpDir('codeweb-json-only-');
  try {
    writeTree(dir, { 'a.json': '{}\n', 'b/c.json': '{}\n' });
    const r = runNode(script('extract-symbols.mjs'), [dir, '--no-ctags']);
    assert.notEqual(r.status, 0, 'no supported source -> the empty-map guard still fires');
    assert.match(r.stderr, /no supported source files/);
  } finally { cleanup(dir); }
});

// ---- pre-edit hook: the config-file card, sidecar/graph byte-parity (Spec P) ----------------

test('pre-edit hook speaks for an imported json file, byte-identical sidecar vs graph', () => {
  const dir = tmpDir('codeweb-json-hook-');
  try {
    writeTree(dir, {
      'config.json': '{\n  "port": 8080\n}\n',
      'app.mjs': "import cfg from './config.json';\nexport function start() {\n  return cfg.port;\n}\n",
      'srv.mjs': "import cfg from './config.json';\nexport function srv() {\n  return cfg;\n}\n",
      'orphan.json': '{}\n',
    });
    const r = runNode(RUN, [dir, '--out-dir', join(dir, '.codeweb')]);
    assert.equal(r.status, 0, r.stderr);
    const payloadFor = (fp) => JSON.stringify({ tool_input: { file_path: fp } });

    const fromSidecar = preview(payloadFor(join(dir, 'config.json')));
    assert.ok(fromSidecar, 'hook speaks for an imported config file');
    assert.match(fromSidecar, /editing config\.json: config file, 2 in-repo importer\(s\)/);
    assert.match(fromSidecar, /importers: /, 'card lists the importing modules');

    const sidecar = join(dir, '.codeweb', 'index-lite.json');
    assert.ok(existsSync(sidecar));
    rmSync(sidecar);
    const fromGraph = preview(payloadFor(join(dir, 'config.json')));
    assert.equal(fromSidecar, fromGraph, 'sidecar path and graph path produce identical bytes');

    assert.equal(preview(payloadFor(join(dir, 'orphan.json'))), null, 'hook stays quiet for an orphan json');
  } finally { cleanup(dir); }
});
