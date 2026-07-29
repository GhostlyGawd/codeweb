import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseAcquisitionLedger,
  parseNpmDownloadsRange,
  renderAcquisitionSvg,
} from '../scripts/render-acquisition.mjs';
import { PLUGIN_ROOT } from './helpers.mjs';

test('acquisition ledger parser keeps valid npm snapshots, de-duplicates dates, and skips torn rows', () => {
  const rows = parseAcquisitionLedger([
    '{"at":"2026-07-20","npmWeeklyDownloads":12,"npmPeriodStart":"2026-07-11","npmPeriodEnd":"2026-07-17"}',
    '{"at":"2026-07-20","npmWeeklyDownloads":15,"npmPeriodStart":"2026-07-11","npmPeriodEnd":"2026-07-17"}',
    '{"at":"2026-07-27","npmWeeklyDownloads":310}',
    '{"at":"bad","npmWeeklyDownloads":99}',
    '{"at":"2026-08-03","npmWeeklyDownloads":',
  ].join('\n'));
  assert.deepEqual(rows, [
    { at: '2026-07-20', downloads: 15, periodStart: '2026-07-11', periodEnd: '2026-07-17' },
    { at: '2026-07-27', downloads: 310, periodStart: null, periodEnd: null },
  ]);
});

test('npm range parser keeps valid daily values, de-duplicates dates, and skips invalid rows', () => {
  const rows = parseNpmDownloadsRange(JSON.stringify({
    downloads: [
      { day: '2026-07-19', downloads: 143 },
      { day: '2026-07-20', downloads: 8 },
      { day: '2026-07-20', downloads: 9 },
      { day: 'bad', downloads: 99 },
      { day: '2026-07-21', downloads: -1 },
    ],
  }));
  assert.deepEqual(rows, [
    { day: '2026-07-19', downloads: 143 },
    { day: '2026-07-20', downloads: 9 },
  ]);
  assert.deepEqual(parseNpmDownloadsRange('{'), []);
});

test('acquisition SVG is a mobile-readable line chart with honest source and cutoff metadata', () => {
  const svg = renderAcquisitionSvg([
    { day: '2026-07-19', downloads: 143 },
    { day: '2026-07-20', downloads: 8 },
    { day: '2026-07-21', downloads: 4 },
    { day: '2026-07-22', downloads: 3 },
    { day: '2026-07-23', downloads: 117 },
    { day: '2026-07-24', downloads: 35 },
    { day: '2026-07-25', downloads: 266 },
  ], { capturedAt: '2026-07-28' });
  assert.match(svg, /aria-labelledby="title desc"/);
  assert.match(svg, /viewBox="0 0 840 600"/);
  assert.match(svg, /<polyline/);
  assert.match(svg, /266/);
  assert.match(svg, /576 downloads in the displayed range/);
  assert.match(svg, /Data period: 2026-07-19 to 2026-07-25/);
  assert.match(svg, /Captured 2026-07-28/);
  assert.match(svg, /package retrievals, not users/);
  assert.match(svg, /npm's public downloads range API/);
  assert.doesNotMatch(svg, /\brx="/, 'the generated chart follows the square-corner brand rule');
});

test('README puts the generated npm trend in the opening proof section', () => {
  const readme = readFileSync(join(PLUGIN_ROOT, 'README.md'), 'utf8');
  assert.match(readme, /assets\/brand\/proof-strip\.svg/);
  assert.match(readme, /Try_it_with_npx/);
  assert.match(readme, /assets\/metrics\/npm-downloads\.svg/);
  assert.match(readme, /package downloads are retrievals, not a count of users/i);
  assert.ok(
    readme.indexOf('assets/metrics/npm-downloads.svg') < readme.indexOf('codeweb reads your code'),
    'the npm trend should appear before the long product explanation',
  );
  assert.equal(
    readme.match(/assets\/metrics\/npm-downloads\.svg/g)?.length,
    1,
    'the trend should have one prominent placement',
  );
});

test('proof-strip claims carry existing evidence paths and obey the brand shape rule', () => {
  const proof = readFileSync(join(PLUGIN_ROOT, 'assets', 'brand', 'proof-strip.svg'), 'utf8');
  const sources = [
    'bench/experiments/efficiency-pilot.reps5-v090.json',
    'bench/results/oracle-ab.json',
    'bench/results/correctness-query.json',
  ];
  for (const source of sources) {
    assert.match(proof, new RegExp(source.replaceAll('.', '\\.')));
    assert.ok(existsSync(join(PLUGIN_ROOT, source)), `missing proof-strip source ${source}`);
  }
  assert.doesNotMatch(proof, /\brx="/);
  assert.doesNotMatch(proof, /<circle|<ellipse/);
});
