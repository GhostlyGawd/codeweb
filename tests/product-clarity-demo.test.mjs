import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const read = path => readFileSync(resolve(path), 'utf8');
const pin = JSON.parse(read('bench/corpus.manifest.json')).find(item => item.name === 'axios');
test('AC18 current demo records pinned extraction and renderer provenance', () => {
  const graph = JSON.parse(read('docs/demo/axios.graph.json'));
  const version = JSON.parse(read('package.json')).version;
  assert.equal(graph.meta.sourceCommit, pin.sha);
  assert.equal(graph.meta.sourceUrl, `https://github.com/axios/axios/tree/${pin.sha}/lib`);
  assert.equal(graph.meta.extractorVersion, version);
  assert.equal(graph.meta.rendererVersion, version);
  assert.equal(graph.meta.engine, 'regex');
  for (const field of ['root', 'sources', 'dirs']) assert.equal(graph.meta[field], undefined);
  assert.doesNotMatch(JSON.stringify(graph), /\/workspace\/|\/home\/|\/tmp\//);
  const html = read('docs/demo/index.html');
  assert.match(html, new RegExp(pin.sha));
  assert.match(html, /source commit:/);
  assert.match(html, /extractor version:/);
});
test('AC18 refresh script rejects an unpinned checkout before it can overwrite the demo', () => {
  const original = read('docs/demo/axios.graph.json');
  const help = spawnSync(process.execPath, ['scripts/refresh-demo.mjs', '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0, help.stderr);
  const bad = spawnSync(process.execPath, ['scripts/refresh-demo.mjs', '--source', '.'], { encoding: 'utf8' });
  assert.equal(bad.status, 2, bad.stderr);
  assert.match(bad.stderr, /pinned Axios commit/);
  assert.equal(read('docs/demo/axios.graph.json'), original);
});
