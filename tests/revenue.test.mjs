// Growth playbook Batch 7 — Revenue rails (REVENUE.md §3-§5 quick wins). The boundary rule under
// test everywhere: anything that runs on your laptop against one repo is FREE FOREVER; money buys
// maintainer attention and the bench spend. Asks appear only at success high points, computed
// only from local counters, throttled, and NEVER on agent-facing or failure surfaces.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpDir, cleanup, script, runNode, writeTree, PLUGIN_ROOT } from './helpers.mjs';

const read = (p) => readFileSync(join(PLUGIN_ROOT, p), 'utf8');
const SPONSOR_URL = 'github.com/sponsors/GhostlyGawd';

const FIXTURE = { 'src/a.js': 'export function alpha(x) {\n  return x + 1;\n}\n' };

test('RV1: FUNDING.yml exists — payment friction drops from infinite to zero', () => {
  const p = join(PLUGIN_ROOT, '.github', 'FUNDING.yml');
  assert.ok(existsSync(p), 'the single highest-leverage file in REVENUE.md');
  assert.match(readFileSync(p, 'utf8'), /github:\s*\[?\s*GhostlyGawd/, 'GitHub Sponsors rail');
});

test('RV2: README states the free-forever contract and the enterprise doorway', () => {
  const readme = read('README.md');
  assert.match(readme, /free forever/i, 'the still-generous contract is WRITTEN, not implied');
  assert.match(readme, /sponsors\/GhostlyGawd/, 'the sponsor rail is linked');
  assert.match(readme, /support contract|enterprise support/i, 'the maintainer\'s time is priced, not given away in issues');
});

test('RV3: the support page states what money funds, as jobs — and rides the sitemap', () => {
  const page = read('site/content/support.html');
  assert.match(page, /bench|benchmark/i, 'names the real fundable cost (the multi-agent bench spend)');
  assert.match(page, /free forever/i, 'the contract leads');
  assert.match(page, /\$5|\$25|\$250/, 'tiers are jobs with prices, not naked numbers');
  assert.match(page, /(\$|USD ?)3[,.]?0?0?0|3-6k|3–6k/i, 'the enterprise price anchor filters tire-kickers');
  assert.match(read('docs/sitemap.xml'), /support\.html/, 'crawlable');
});

test('RV4: the receipt-high-point ask fires on real value, once a month, local-only', () => {
  const dir = tmpDir('codeweb-rev-');
  try {
    writeTree(dir, FIXTURE);
    const ws = join(dir, 'src', '.codeweb');
    // First map: no history, no receipt -> never an ask on first contact.
    // CLI.md 6.1: the receipt/ask lines ride the RESULT block — stdout, not stderr.
    const first = runNode(script('run.mjs'), [join(dir, 'src'), '--out-dir', ws]);
    assert.equal(first.status, 0, first.stderr);
    assert.ok(!first.stdout.includes(SPONSOR_URL), 'no ask before value is proven');

    // Seed a ledger that crosses the threshold (3 regressions flagged before landing).
    const stats = JSON.parse(readFileSync(join(ws, 'stats.json'), 'utf8'));
    stats.months['2026-01'] = { regressionsFlagged: 3, cardsDelivered: 10 };
    writeFileSync(join(ws, 'stats.json'), JSON.stringify(stats));
    const second = runNode(script('run.mjs'), [join(dir, 'src'), '--out-dir', ws, '--full']);
    assert.equal(second.status, 0, second.stderr);
    assert.ok(second.stdout.includes(SPONSOR_URL), 'the one honest in-product ask, at the receipt high point');

    // Throttle: the very next run must NOT ask again (lastSponsorAskAt stamped).
    const third = runNode(script('run.mjs'), [join(dir, 'src'), '--out-dir', ws, '--full']);
    assert.equal(third.status, 0, third.stderr);
    assert.ok(!third.stdout.includes(SPONSOR_URL), 'asks are throttled to once a month — repetition is nagging');
  } finally { cleanup(dir); }
});

test('RV5: trend (the team-lead surface) carries the ask only with a real series', () => {
  const dir = tmpDir('codeweb-rev-');
  try {
    const hp = join(dir, 'history.jsonl');
    const row = (i, c) => JSON.stringify({ at: `2026-07-${String(10 + i).padStart(2, '0')}T00:00:00Z`, symbols: 100 + i, files: 10, confirmed: c, candidates: c, coupling: 5, cycles: 0 });
    writeFileSync(hp, [row(1, 5), row(2, 4)].join('\n') + '\n');
    const short = runNode(script('trend.mjs'), ['--history', hp]);
    assert.ok(!short.stdout.includes(SPONSOR_URL), 'two snapshots is not a habit — no ask');

    writeFileSync(hp, [row(1, 5), row(2, 4), row(3, 4), row(4, 3), row(5, 2)].join('\n') + '\n');
    const long = runNode(script('trend.mjs'), ['--history', hp]);
    assert.equal(long.status, 0, long.stderr);
    assert.ok(long.stdout.includes(SPONSOR_URL), 'five snapshots = the codeweb-Teams buyer, doing the job by hand');
  } finally { cleanup(dir); }
});

test('RV6: the two shared artifacts carry the sponsor rail (attribution, not solicitation)', async () => {
  const { gateComment } = await import('../scripts/lib/gate-md.mjs');
  const p = {
    ok: true, regressions: [], before: 'b', after: 'a',
    nodes: { added: [], removed: [], renamed: [] }, edges: { added: 0, removed: 0 },
    crossDomainEdges: { delta: 0 }, cycles: { added: [], removed: [] },
    overlaps: { added: [], removed: [] }, orphans: { added: [] },
  };
  assert.match(gateComment(p), /sponsors\/GhostlyGawd/, 'the gate comment — read by whole teams — carries the rail');
  assert.match(read('scripts/report-template.html'), /sponsors\/GhostlyGawd/, 'the report footer too');
});

test('RV7: anti-placements hold — no ask on agent-facing or trust surfaces', () => {
  assert.ok(!read('scripts/mcp-server.mjs').includes(SPONSOR_URL), 'MCP payloads are ask-free (budgeted, agent-consumed)');
  for (const h of ['hooks/pre-edit-impact.mjs', 'hooks/post-edit-diff.mjs', 'hooks/session-brief.mjs']) {
    assert.ok(!read(h).includes(SPONSOR_URL), `${h} is a mid-work trust surface — ask-free`);
  }
  assert.ok(!read('scripts/lib/brief-core.mjs').includes(SPONSOR_URL), 'the session brief stays ask-free');
});
