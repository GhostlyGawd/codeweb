// Upgrade-moment placements (REVENUE.md §3, charter § "The boundary: free forever / Teams").
//
// The regression class is a placement LEAKING. REVENUE §3's anti-placement list is not style
// advice: an ask inside an MCP payload burns the tokens the product exists to save, an ask on a
// hook card interrupts mid-work trust, and an ask on an error path reads as ransom. Those three
// surfaces are swept here by construction — every shipped script, hook, and bin entry is walked,
// and only the sanctioned files may name a placement string.
//
// The two conditional placements are pinned behaviorally, not by reading the source: the trend
// rail's threshold (5 snapshots), its silence below it, its absence from `--json`, and the
// suppression lever on both it and the gate footer.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, script, tmpDir, cleanup, writeTree, PLUGIN_ROOT } from './helpers.mjs';
import {
  TEAMS_URL,
  TEAMS_DASHBOARD_LINE,
  TEAMS_TREND_NUDGE,
  NO_PROMO_ENV,
  placementsSuppressed,
} from '../scripts/lib/product-copy.mjs';
import { gateComment } from '../scripts/lib/gate-md.mjs';

const read = (p) => readFileSync(join(PLUGIN_ROOT, p), 'utf8');
const SPONSOR_URL = 'https://github.com/sponsors/GhostlyGawd';
const ATTRIBUTION = '<sub>codeweb structural review';

const payload = (over = {}) => ({
  before: 'before', after: 'after',
  nodes: { added: [], removed: [], renamed: [] },
  edges: { added: 0, removed: 0 },
  domains: { before: 1, after: 1 },
  crossDomainEdges: { before: 0, after: 0, delta: 0 },
  overlaps: { added: [], removed: [] },
  cycles: { added: [], removed: [] },
  orphans: { added: [], removed: [] },
  regressions: [], ok: true,
  ...over,
});

/** Run body with env vars set, restoring whatever was there (including "unset") afterwards. */
function withEnv(vars, body) {
  const prior = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  Object.assign(process.env, vars);
  try {
    return body();
  } finally {
    for (const [k, v] of Object.entries(prior)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
}

// ---- placement 1: the gate-comment footer (REVENUE §3 row 1) ---------------------------------

test('the gate comment carries the org-dashboard line in its footer, beside the attribution', () => {
  const body = gateComment(payload({
    ok: false,
    regressions: ['1 new dependency cycle(s)'],
    cycles: { added: [['a.js', 'b.js', 'a.js']], removed: [] },
  }));

  assert.equal((body.match(/org dashboard →/g) || []).length, 1, 'exactly one upgrade line — one line is the budget');
  assert.ok(body.includes(TEAMS_DASHBOARD_LINE), 'the line is the single-sourced constant, not a fork of it');
  assert.ok(body.includes(TEAMS_URL), 'and it points at the Teams surface');

  // Footer region only: after the attribution line, and the last thing in the comment. A reader
  // scanning the verdict or the findings must never meet it.
  const lines = body.trimEnd().split('\n');
  const upgradeAt = lines.findIndex((l) => l.includes('org dashboard →'));
  const attributionAt = lines.findIndex((l) => l.startsWith(ATTRIBUTION));
  assert.ok(attributionAt !== -1, 'the attribution footer is retained');
  assert.ok(upgradeAt > attributionAt, 'the upgrade line sits below the attribution, not above the review');
  assert.equal(upgradeAt, lines.length - 1, 'nothing follows it — it is the footer, not a section');

  const review = lines.slice(0, attributionAt).join('\n');
  assert.doesNotMatch(review, /org dashboard|codeweb Teams/i, 'the verdict and finding sections stay placement-free');
  assert.match(review, /❌ 1 regression type/, 'sanity: the verdict this comment carries');
});

test('the gate comment keeps its attribution footer when the upgrade line is suppressed', () => {
  // REVENUE §3 row 1: the footer is attribution, not solicitation — it is unconditional. Only the
  // upgrade line answers the lever.
  const suppressed = withEnv({ [NO_PROMO_ENV]: '1' }, () => gateComment(payload()));
  assert.doesNotMatch(suppressed, /org dashboard →/, `${NO_PROMO_ENV}=1 removes the upgrade line`);
  assert.ok(suppressed.includes(SPONSOR_URL), 'attribution survives suppression');
  assert.ok(suppressed.includes('https://github.com/GhostlyGawd/codeweb'), 'and so does the link home');

  const optedOut = withEnv({ CODEWEB_NO_STATS: '1' }, () => gateComment(payload()));
  assert.doesNotMatch(optedOut, /org dashboard →/, 'the existing privacy lever suppresses placements too');
});

test('a caller rendering its own dashboard link can turn the upgrade line off', () => {
  // The hosted service embeds this renderer and appends a footer linking the customer's REAL
  // dashboard; two dashboard links in one comment, one of them pointing at marketing copy, is a
  // worse comment than either alone.
  const off = gateComment(payload(), { upgrade: false });
  assert.doesNotMatch(off, /org dashboard →/);
  assert.ok(off.includes(SPONSOR_URL), 'the attribution footer is not what the flag controls');
});

// ---- placement 2: the trend rail at 5+ snapshots (REVENUE §3 row 4) --------------------------

const historyRow = (i, confirmed) => JSON.stringify({
  at: `2026-07-${String(10 + i).padStart(2, '0')}T00:00:00Z`,
  symbols: 100 + i, files: 10, confirmed, candidates: confirmed, coupling: 5, cycles: 0,
});

/** Write N history rows and run trend over them. */
function trend(dir, count, args = [], env = {}) {
  const hp = join(dir, `history-${count}-${args.join('') || 'text'}.jsonl`);
  writeFileSync(hp, Array.from({ length: count }, (_, i) => historyRow(i + 1, 5 - i)).join('\n') + '\n');
  return runNode(script('trend.mjs'), ['--history', hp, ...args], { env });
}

test('the trend nudge fires at 5 snapshots and stays silent at 4', () => {
  const dir = tmpDir('codeweb-placement-');
  try {
    const four = trend(dir, 4);
    assert.equal(four.status, 0, four.stderr);
    assert.match(four.stdout, /4 snapshots/, 'sanity: four snapshots rendered');
    assert.doesNotMatch(four.stdout, /codeweb Teams/, 'four snapshots is not a habit — no nudge');
    assert.ok(!four.stdout.includes(TEAMS_URL), 'and no link either');

    const five = trend(dir, 5);
    assert.equal(five.status, 0, five.stderr);
    assert.match(five.stdout, /5 snapshots/, 'sanity: five snapshots rendered');
    assert.ok(five.stdout.includes(TEAMS_TREND_NUDGE), 'five snapshots = the hosted-rollup job, done by hand');

    const six = trend(dir, 6);
    assert.ok(six.stdout.includes(TEAMS_TREND_NUDGE), 'the threshold is a floor, not an equality');
  } finally { cleanup(dir); }
});

test('the trend nudge is exactly one line, printed once, after the table', () => {
  const dir = tmpDir('codeweb-placement-');
  try {
    const shown = trend(dir, 5).stdout;
    const hidden = trend(dir, 5, [], { [NO_PROMO_ENV]: '1' }).stdout;

    // Everything the nudge adds, measured against the same render with the nudge off.
    const added = shown.split('\n').filter((l) => l.trim()).filter((l) => !hidden.split('\n').includes(l));
    assert.equal(added.length, 1, `the placement budget is one line; got ${added.length}: ${JSON.stringify(added)}`);
    assert.equal(added[0], TEAMS_TREND_NUDGE, 'and it is the single-sourced constant');

    const lines = shown.trimEnd().split('\n');
    assert.equal(lines[lines.length - 1], TEAMS_TREND_NUDGE, 'it trails the table — the reader gets the data first');
  } finally { cleanup(dir); }
});

test('trend --json stays pure JSON at any snapshot count', () => {
  const dir = tmpDir('codeweb-placement-');
  try {
    for (const count of [4, 5, 6]) {
      const r = trend(dir, count, ['--json']);
      assert.equal(r.status, 0, r.stderr);
      const parsed = JSON.parse(r.stdout); // the whole stdout, not a prefix of it
      assert.equal(parsed.snapshots.length, count, 'the machine surface renders the rows and nothing else');
      assert.doesNotMatch(r.stdout, /codeweb Teams|org dashboard/, 'no placement contaminates a consumed payload');
    }
  } finally { cleanup(dir); }
});

test('both documented levers suppress the trend nudge at 5 snapshots', () => {
  const dir = tmpDir('codeweb-placement-');
  try {
    for (const env of [{ [NO_PROMO_ENV]: '1' }, { CODEWEB_NO_STATS: '1' }]) {
      const r = trend(dir, 5, [], env);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /5 snapshots/, 'the trend itself still renders — the lever mutes the ask, not the tool');
      assert.doesNotMatch(r.stdout, /codeweb Teams/, `${Object.keys(env)[0]}=1 suppresses the nudge`);
    }
  } finally { cleanup(dir); }
});

test('placementsSuppressed reads the environment at call time, and only on "1"', () => {
  assert.equal(placementsSuppressed({}), false);
  assert.equal(placementsSuppressed({ [NO_PROMO_ENV]: '1' }), true);
  assert.equal(placementsSuppressed({ CODEWEB_NO_STATS: '1' }), true);
  assert.equal(placementsSuppressed({ [NO_PROMO_ENV]: '0' }), false, 'an explicit 0 is not opt-out');
  assert.equal(withEnv({ [NO_PROMO_ENV]: '1' }, () => placementsSuppressed()), true, 'defaults to process.env');
});

// ---- placement 3: the report footer keeps its attribution (REVENUE §3 row 3) ------------------

test('the shared report artifact keeps its attribution footer', () => {
  for (const file of ['scripts/report-template.html', 'docs/demo/index.html']) {
    const html = read(file);
    assert.ok(html.includes(SPONSOR_URL), `${file} lost its sponsor rail`);
    assert.match(html, /Mapped by codeweb/, `${file} lost its attribution line`);
    assert.doesNotMatch(html, /org dashboard/i, `${file} is attribution — an upgrade line does not belong in a shared artifact`);
  }
});

// ---- the anti-placements (REVENUE §3, "churn-risk flags") -------------------------------------

/** Every shipped executable surface, so a new script cannot quietly escape the sweep. */
function shippedScripts() {
  const out = [];
  for (const dir of ['scripts', 'scripts/lib', 'hooks', 'bin']) {
    const abs = join(PLUGIN_ROOT, dir);
    if (!existsSync(abs)) continue;
    for (const f of readdirSync(abs)) {
      if (f.endsWith('.mjs')) out.push(`${dir}/${f}`);
    }
  }
  return out;
}

// The only files allowed to name a placement: the constants themselves, the three sanctioned
// renderers, and the receipt high-point ask run.mjs already shipped (REVENUE §3 row 2).
const SANCTIONED = new Set([
  'scripts/lib/product-copy.mjs',
  'scripts/lib/gate-md.mjs',
  'scripts/trend.mjs',
  'scripts/run.mjs',
]);

test('no placement string reaches any unsanctioned script, hook, or bin entry', () => {
  const tokens = [TEAMS_URL, SPONSOR_URL, 'org dashboard', 'codeweb Teams'];
  const hits = [];
  for (const rel of shippedScripts()) {
    if (SANCTIONED.has(rel)) continue;
    const text = read(rel);
    for (const t of tokens) if (text.includes(t)) hits.push(`${rel} names "${t}"`);
  }
  assert.deepEqual(hits, [], `MCP payloads, hook cards, and error paths are ask-free zones: ${hits.join('; ')}`);
});

test('the sweep actually covers the three anti-placement surfaces', () => {
  // A sweep that silently stopped listing files would pass forever. Pin that the surfaces
  // REVENUE §3 names by hand are inside the walked set.
  const covered = new Set(shippedScripts());
  for (const rel of [
    'scripts/mcp-server.mjs',
    'scripts/lib/tool-specs.mjs',
    'scripts/lib/brief-core.mjs',
    'hooks/pre-edit-impact.mjs',
    'hooks/post-edit-diff.mjs',
    'hooks/session-brief.mjs',
    'bin/codeweb-mcp.mjs',
  ]) {
    assert.ok(covered.has(rel), `${rel} escaped the anti-placement sweep`);
  }
});

test('behavioral: an MCP tool response carries no placement', () => {
  const dir = tmpDir('codeweb-placement-');
  try {
    const graph = join(dir, 'graph.json');
    writeFileSync(graph, JSON.stringify({
      meta: { target: 'fx' },
      nodes: [
        { id: 'a.js:alpha', label: 'alpha', kind: 'function', file: 'a.js', line: 1, loc: 3, domain: 'core' },
        { id: 'b.js:beta', label: 'beta', kind: 'function', file: 'b.js', line: 1, loc: 3, domain: 'core' },
      ],
      edges: [{ from: 'b.js:beta', to: 'a.js:alpha', kind: 'call', weight: 1 }],
      domains: [], overlaps: [],
    }));
    const msgs = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'codeweb_impact', arguments: { graph, symbol: 'alpha' } } },
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'codeweb_stats', arguments: { graph } } },
    ];
    const r = spawnSync(process.execPath, [script('mcp-server.mjs')], {
      encoding: 'utf8', maxBuffer: 1 << 28,
      input: msgs.map((m) => JSON.stringify(m)).join('\n') + '\n',
      env: { ...process.env, CODEWEB_NO_AUTOREFRESH: '1' },
    });
    assert.match(r.stdout, /codeweb_impact/, 'sanity: the server answered');
    for (const stream of [r.stdout, r.stderr]) {
      assert.doesNotMatch(stream, /org dashboard|codeweb Teams/i, 'agent-consumed output is ask-free');
      assert.ok(!stream.includes(SPONSOR_URL), 'agent-consumed output carries no sponsor rail');
      assert.ok(!stream.includes(TEAMS_URL), 'agent-consumed output carries no Teams link');
    }
  } finally { cleanup(dir); }
});

test('behavioral: error paths carry no placement', () => {
  const dir = tmpDir('codeweb-placement-');
  try {
    // An unmapped target, a missing graph, and a mapped-but-unknown symbol: the three shapes of
    // "codeweb could not help you" REVENUE §3 forbids upselling on.
    writeTree(dir, { 'notes/readme.txt': 'no source here\n' });
    const failures = [
      runNode(script('run.mjs'), [join(dir, 'notes'), '--out-dir', join(dir, 'ws')]),
      runNode(script('query.mjs'), ['--graph', join(dir, 'missing.json'), '--symbol', 'nope']),
      runNode(script('trend.mjs'), []),
      runNode(script('stats.mjs'), [join(dir, 'missing.json')]),
    ];
    assert.ok(failures.some((f) => f.status !== 0), 'sanity: at least one of these really failed');
    for (const f of failures) {
      for (const stream of [f.stdout, f.stderr]) {
        assert.doesNotMatch(stream, /org dashboard|codeweb Teams/i, 'no upsell on a failure path');
        assert.ok(!stream.includes(TEAMS_URL), 'no Teams link on a failure path');
      }
    }
  } finally { cleanup(dir); }
});

// ---- the charter ruling the placements answer to ---------------------------------------------

test('the charter records which surfaces may carry an upgrade line, and which may never', () => {
  // Same discipline as tests/charter-amendments.test.mjs: the decisions are pinned, the wording is
  // free. Without this the sweep above could be relaxed by an agent with no ruling to cite.
  const charter = read('CHARTER.md');
  const start = charter.indexOf('## The boundary: free forever / Teams');
  assert.notEqual(start, -1, 'CHARTER.md lost its boundary section');
  const boundary = charter.slice(start, charter.indexOf('\n## ', start + 10));

  assert.match(boundary, /2026-08-2\d/, 'the placement ruling carries its date');
  assert.match(boundary, /operator/i, 'and its attribution — never an agent decision');
  for (const [what, re] of [
    ['the gate-comment footer', /gate comment'?s? footer/i],
    ['the trend rail and its threshold', /trend\.mjs[\s\S]{0,80}five or more snapshots/i],
    ['the receipt high point', /receipt high point/i],
    ['MCP responses as ask-free', /MCP tool responses/i],
    ['hook cards as ask-free', /hook cards/i],
    ['error paths as ask-free', /error path/i],
    ['the local-counters rule', /local counters only/i],
    ['the suppression lever', new RegExp(NO_PROMO_ENV)],
  ]) {
    assert.match(boundary, re, `the ruling must name ${what}`);
  }
  assert.match(boundary, /non-goal 4 untouched/i,
    'the ruling must say it does not loosen the no-accounts/no-telemetry invariant');
});

// ---- the lever is documented ------------------------------------------------------------------

test('the suppression lever is documented where every other environment knob is', () => {
  const cli = read('docs/cli.md');
  assert.match(cli, new RegExp(`\`${NO_PROMO_ENV}=1\``), `docs/cli.md must name ${NO_PROMO_ENV}`);
  const row = new RegExp(`^\\|\\s*\`${NO_PROMO_ENV}=1\`\\s*\\|(.+)\\|\\s*$`, 'm').exec(cli);
  assert.ok(row, 'it belongs in the environment-variable table, not a stray mention');
  assert.match(row[1], /upgrade|placement|nudge/i, 'and the row says what it turns off');
});
