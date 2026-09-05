import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  'docs/graphify-comparison.md',
  'docs/guides/product-clarity-pilot.md',
  'docs/guides/product-clarity-case-study.md',
  'docs/guides/product-clarity-demo.md',
];
const read = (file) => readFileSync(resolve(root, file), 'utf8');

test('evidence documents link to real local sources and identify current primary comparison sources', () => {
  for (const file of files) {
    const body = read(file);
    for (const [, href] of body.matchAll(/\]\(([^)]+)\)/g)) {
      if (/^https?:\/\//.test(href) || href.startsWith('#')) continue;
      assert.ok(existsSync(resolve(root, dirname(file), href.split('#')[0])), `${file}: broken link ${href}`);
    }
  }
  const comparison = read(files[0]);
  assert.match(comparison, /Reviewed: 2026-09-05/);
  assert.match(comparison, /https:\/\/github\.com\/Graphify-Labs\/graphify\/blob\//);
  assert.match(comparison, /graphify prs/);
  assert.match(comparison, /not a performance benchmark/i);
  assert.match(comparison, /context bytes/i);
  assert.match(comparison, /not total agent-session/i);
  assert.doesNotMatch(comparison, /CodeWeb is (?:\d|faster|more accurate|cheaper)/i);
});

test('pilot protocol and case-study template keep human outcomes unmeasured and voluntary', () => {
  const pilot = read(files[1]);
  for (const criterion of [/five participants/i, /consent/i, /no telemetry/i, /not yet run/i,
    /first useful result/i, /false blocking rate/i, /accepted findings/i, /week two/i, /denominator/i]) {
    assert.match(pilot, criterion);
  }
  const study = read(files[2]);
  assert.match(study, /Status: template; no completed study/i);
  for (const field of [/source commit/i, /engine version/i, /accept.*reject.*defer/i,
    /independent.*test/i, /publication permission/i, /\[not recorded\]/i]) assert.match(study, field);
});

test('demo names the executable walkthrough and does not present a fixture as a maintainer decision', () => {
  const demo = read(files[3]);
  assert.match(demo, /node scripts\/product-demo\.mjs/);
  assert.match(demo, /synthetic fixture/i);
  assert.match(demo, /not a maintainer-approved case study/i);
  assert.match(demo, /60-second/i);
  const result = spawnSync(process.execPath, ['scripts/product-demo.mjs', '--help'], {
    cwd: root, encoding: 'utf8', timeout: 10000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /product-demo/);
});
