// Confidence calibration — a correct answer delivered with the wrong confidence produces wrong
// decisions. "0 callers" must carry its asterisk: public API (external callers invisible by
// construction), exported (external use possible), or dynamic dispatch present (absence of
// edges is weaker evidence). Pins the extractor's pub/dynamic stamps and the answer-time caveats.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, script, tmpDir, cleanup, writeTree, readJSON } from './helpers.mjs';

const FIXTURE = {
  'package.json': '{ "name": "fixture-pkg", "version": "1.0.0", "main": "./index.js" }\n',
  'index.js': "export { api } from './lib/core.js';\nexport * from './lib/extra.js';\n",
  'lib/core.js': 'export function api(x) {\n  return internal(x);\n}\nexport function internal(x) {\n  return x;\n}\n',
  'lib/extra.js': 'export function extraApi() {\n  return 1;\n}\n',
  'lib/dyn.js': 'const registry = {};\nexport function dispatch(name) {\n  return registry[name]();\n}\nfunction ghost() {\n  return 2;\n}\n',
};

function buildMapped() {
  const dir = tmpDir('codeweb-confidence-');
  writeTree(dir, FIXTURE);
  const ws = join(dir, '.codeweb');
  mkdirSync(ws, { recursive: true });
  const r = runNode(script('extract-symbols.mjs'), [dir, '--no-ctags', '--out', join(ws, 'fragment.json')]);
  assert.equal(r.status, 0, r.stderr);
  const frag = readJSON(join(ws, 'fragment.json'));
  writeFileSync(join(ws, 'graph.json'), JSON.stringify({ ...frag, domains: [], overlaps: [] }));
  return { dir, ws, graph: join(ws, 'graph.json'), frag };
}

test('extractor stamps pub through named and star re-export chains, and meta.dynamic', () => {
  const { dir, frag } = buildMapped();
  try {
    const byId = new Map(frag.nodes.map((n) => [n.id, n]));
    assert.equal(byId.get('lib/core.js:api')?.pub, true, 'named re-export from the entry is public');
    assert.equal(byId.get('lib/extra.js:extraApi')?.pub, true, 'star re-export from the entry is public');
    assert.equal(byId.get('lib/core.js:internal')?.pub, undefined, 'exported-but-not-reachable-from-entry is NOT public');
    assert.equal(byId.get('lib/dyn.js:ghost')?.pub, undefined, 'unexported stays unmarked');
    assert.ok(frag.meta.dynamic && frag.meta.dynamic.files >= 1, 'dynamic-dispatch file detected');
    assert.ok(frag.meta.dynamic.sample.includes('lib/dyn.js'), `sample names the file (${JSON.stringify(frag.meta.dynamic)})`);
  } finally { cleanup(dir); }
});

test('explain: public API and dynamic-dispatch caveats calibrate the card', () => {
  const { dir, graph } = buildMapped();
  try {
    const pub = JSON.parse(runNode(script('explain.mjs'), [graph, 'extraApi', '--json']).stdout).cards[0];
    assert.equal(pub.publicApi, true);
    assert.match(pub.caveat, /public API .* external callers likely; renames are breaking/);
    assert.match(pub.summary, /⚠ public API/, 'the warning rides the summary (ambient via the hook)');

    const ghost = JSON.parse(runNode(script('explain.mjs'), [graph, 'ghost', '--json']).stdout).cards[0];
    assert.match(ghost.caveat, /dynamically in \d+ file\(s\) — absence of callers is weaker evidence/);
  } finally { cleanup(dir); }
});

test('callers/dependents: a zero answer carries its asterisk instead of false confidence', () => {
  const { dir, graph } = buildMapped();
  try {
    const callers = JSON.parse(runNode(script('query.mjs'), [graph, '--callers', 'extraApi', '--json']).stdout);
    assert.equal(callers.count, 0);
    assert.match(callers.caveat, /public API/, 'callers=0 on a public symbol is flagged');
    assert.match(callers.summary, /⚠/);

    const deps = JSON.parse(runNode(script('query.mjs'), [graph, '--dependents', 'ghost', '--json']).stdout);
    assert.equal(deps.count, 0);
    assert.match(deps.caveat, /dynamically/, 'unexported zero in a dynamic repo cites the weaker evidence');

    // a normally-called symbol stays caveat-free — no noise on confident answers
    const called = JSON.parse(runNode(script('query.mjs'), [graph, '--callers', 'internal', '--json']).stdout);
    assert.ok(called.count >= 1 && called.caveat === undefined, `confident answers stay clean (${called.summary})`);
  } finally { cleanup(dir); }
});
