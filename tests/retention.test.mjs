// Growth playbook Batch 4 — Retention (RETENTION.md). The map earns its keep when the code
// CHANGES; these tests pin the machinery that makes the second map happen at the right time and
// feel like progress: honest refresh (R2), change-based nudge (R3), the "since last map" delta +
// history.jsonl (R1/R8), the workspace memory contract (R6), report age + version (R9/R10), and
// the map timestamps the nudges need (instrumentation §4).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { tmpDir, cleanup, script, runNode, writeTree, readJSON, PLUGIN_ROOT } from './helpers.mjs';

// v1 has ONE real duplicate pair (identical packOrders in two files) -> 1 confirmed duplication.
const DUP_BODY = 'export function packOrders(list) {\n  const out = [];\n  let total = 0;\n  for (const it of list) {\n    total += it.qty;\n    out.push(it.qty * 2);\n  }\n  const avg = total / list.length;\n  out.sort();\n  console.log(avg);\n  return out;\n}\n';
const V1 = { 'src/one.js': DUP_BODY, 'src/two.js': DUP_BODY };
// v2 rewrites two.js to unrelated logic -> the duplication is FIXED (confirmed 1 -> 0).
const TWO_V2 = 'export function tallyRefunds(rows) {\n  let sum = 0;\n  for (const r of rows) {\n    if (r.refunded) sum += r.amount;\n  }\n  return sum;\n}\n';

const RUN = script('run.mjs');

function mapProject(dir, ws) {
  return runNode(RUN, [join(dir, 'src'), '--out-dir', ws]);
}

// ---- R2 — refresh is honest about what it dropped ---------------------------------------------

test('R2: refresh stamps overlapsDroppedAt, and the brief says "not recounted" instead of 0', async () => {
  const dir = tmpDir('codeweb-ret-');
  try {
    writeTree(dir, V1);
    const ws = join(dir, 'src', '.codeweb');
    const r = mapProject(dir, ws);
    assert.equal(r.status, 0, r.stderr);
    const before = readJSON(join(ws, 'graph.json'));
    assert.ok((before.overlaps || []).length >= 1, 'fixture yields a real finding pre-refresh');

    const ref = runNode(script('refresh.mjs'), [join(ws, 'graph.json')]);
    assert.equal(ref.status, 0, ref.stderr);
    const after = readJSON(join(ws, 'graph.json'));
    assert.equal((after.overlaps || []).length, 0, 'refresh still drops overlaps');
    assert.ok(after.meta.overlapsDroppedAt, 'the drop is STAMPED, not silent');

    const { preview } = await import('../hooks/session-brief.mjs');
    const msg = preview(JSON.stringify({ cwd: join(dir, 'src') }));
    assert.ok(msg, 'brief speaks');
    assert.match(msg, /not recounted/i, 'the brief renders the pending recount');
    assert.ok(!/0 duplication finding/.test(msg), '"0 duplication findings" is the lie this fix removes');
  } finally { cleanup(dir); }
});

test('R2: a fresh full map clears the stamp and recounts', () => {
  const dir = tmpDir('codeweb-ret-');
  try {
    writeTree(dir, V1);
    const ws = join(dir, 'src', '.codeweb');
    assert.equal(mapProject(dir, ws).status, 0);
    assert.equal(runNode(script('refresh.mjs'), [join(ws, 'graph.json')]).status, 0);
    const r2 = runNode(RUN, [join(dir, 'src'), '--out-dir', ws, '--full']);
    assert.equal(r2.status, 0, r2.stderr);
    const g = readJSON(join(ws, 'graph.json'));
    assert.ok(!g.meta.overlapsDroppedAt, 'the full pipeline recounts — stamp gone');
    assert.ok((g.overlaps || []).length >= 1, 'findings are back');
  } finally { cleanup(dir); }
});

// ---- R3 — the nudge fires on change, not on a calendar ----------------------------------------

test('R3: the session brief nudges when the tree has changed since the map', async () => {
  const dir = tmpDir('codeweb-ret-');
  try {
    writeTree(dir, V1);
    const ws = join(dir, 'src', '.codeweb');
    assert.equal(mapProject(dir, ws).status, 0);

    const { preview } = await import('../hooks/session-brief.mjs');
    const fresh = preview(JSON.stringify({ cwd: join(dir, 'src') }));
    assert.ok(fresh && !/behind by \d+/.test(fresh), 'an untouched repo gets no change nudge');

    appendFileSync(join(dir, 'src', 'one.js'), '\nexport function extraThing() {\n  return 42;\n}\n');
    const stale = preview(JSON.stringify({ cwd: join(dir, 'src') }));
    assert.ok(stale, 'brief still speaks');
    assert.match(stale, /behind by \d+\+? changed file/i, 'the nudge is change-based');
    assert.match(stale, /\/codeweb|codeweb_map|re-map/i, 'and names the way back');
  } finally { cleanup(dir); }
});

// ---- R1 + R8 — the second map is a progress report, and history persists ----------------------

test('R1/R8: a re-map prints the since-last-map delta and appends history.jsonl', async () => {
  const dir = tmpDir('codeweb-ret-');
  try {
    writeTree(dir, V1);
    const ws = join(dir, 'src', '.codeweb');
    assert.equal(mapProject(dir, ws).status, 0);

    writeFileSync(join(dir, 'src', 'two.js'), TWO_V2); // the user FIXED the duplication
    const r2 = mapProject(dir, ws);
    assert.equal(r2.status, 0, r2.stderr);
    // CLI.md 6.1: the delta is part of the RESULT block — stdout, not stderr.
    assert.match(r2.stdout, /since last map/i, 'the re-map acknowledges the previous one');
    assert.match(r2.stdout, /dups 1 -> 0/, 'the fixed duplication is CELEBRATED, not silent');

    const hp = join(ws, 'history.jsonl');
    assert.ok(existsSync(hp), 'history.jsonl exists');
    const rows = readFileSync(hp, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    assert.equal(rows.length, 2, 'one row per full map');
    assert.equal(rows[0].confirmed, 1);
    assert.equal(rows[1].confirmed, 0);
    assert.ok(rows.every((x) => typeof x.symbols === 'number' && typeof x.cycles === 'number'), 'rows carry the trend metrics');

    const { preview } = await import('../hooks/session-brief.mjs');
    const msg = preview(JSON.stringify({ cwd: join(dir, 'src') }));
    assert.match(msg, /last 2 maps: 1 -> 0/, 'the next session opens with the progression');
  } finally { cleanup(dir); }
});

test('R8: trend reads history.jsonl instantly (no pipeline runs)', () => {
  const dir = tmpDir('codeweb-ret-');
  try {
    writeTree(dir, V1);
    const ws = join(dir, 'src', '.codeweb');
    assert.equal(mapProject(dir, ws).status, 0);
    writeFileSync(join(dir, 'src', 'two.js'), TWO_V2);
    assert.equal(mapProject(dir, ws).status, 0);

    const t = runNode(script('trend.mjs'), ['--history', join(ws, 'history.jsonl')]);
    assert.equal(t.status, 0, t.stderr);
    assert.match(t.stdout, /confirmed/, 'renders the metric series');
    assert.match(t.stdout, /↓1|1 -> 0/, 'shows the consolidation win');
  } finally { cleanup(dir); }
});

test('R8: a reused (memo-hit) run does not double-append history', () => {
  const dir = tmpDir('codeweb-ret-');
  try {
    writeTree(dir, V1);
    const ws = join(dir, 'src', '.codeweb');
    assert.equal(mapProject(dir, ws).status, 0);
    assert.equal(mapProject(dir, ws).status, 0); // unchanged -> stages reused
    const rows = readFileSync(join(ws, 'history.jsonl'), 'utf8').split('\n').filter(Boolean);
    assert.equal(rows.length, 1, 'the reused run appended nothing (the map did not change)');
  } finally { cleanup(dir); }
});

// ---- R6 — the workspace self-declares what is cache and what is memory ------------------------

test('R6: the workspace writes its own .gitignore whitelisting the non-regenerable memory', () => {
  const dir = tmpDir('codeweb-ret-');
  try {
    writeTree(dir, V1);
    const ws = join(dir, 'src', '.codeweb');
    assert.equal(mapProject(dir, ws).status, 0);
    const gi = join(ws, '.gitignore');
    assert.ok(existsSync(gi), '.codeweb/.gitignore written on map');
    const txt = readFileSync(gi, 'utf8');
    assert.match(txt, /^\*$/m, 'everything ignored by default (cache)');
    assert.match(txt, /^!annotations\.json$/m, 'triaged judgement is MEMORY — committable');
    assert.match(txt, /^!history\.jsonl$/m, 'the progression ledger is MEMORY — committable');
    assert.match(txt, /^!\.gitignore$/m, 'the contract file survives itself');
  } finally { cleanup(dir); }
});

// ---- R9 / R10 — the return surfaces say their age and version ---------------------------------

test('R9/R10: the report renders its own age (view-time, byte-clean) and the building version', () => {
  const dir = tmpDir('codeweb-ret-');
  try {
    writeTree(dir, V1);
    const ws = join(dir, 'src', '.codeweb');
    assert.equal(mapProject(dir, ws).status, 0);
    const html = readFileSync(join(ws, 'report.html'), 'utf8');
    assert.ok(!html.includes('generatedAt'), 'the byte-determinism property holds — no embedded timestamp');
    assert.match(html, /document\.lastModified/, 'age comes from the FILE at view time');
    assert.match(html, /mapped/, 'the masthead names the age');
    const pkg = readJSON(join(PLUGIN_ROOT, 'package.json'));
    assert.ok(html.includes(`codeweb v${pkg.version}`), 'the report names the version that built it');
  } finally { cleanup(dir); }
});

test('R10: the run banner names the version', () => {
  const dir = tmpDir('codeweb-ret-');
  try {
    writeTree(dir, V1);
    const r = mapProject(dir, join(dir, 'src', '.codeweb'));
    assert.equal(r.status, 0);
    // CLI.md 6.1: the done banner is the RESULT — stdout, not stderr.
    assert.match(r.stdout, /codeweb v\d+\.\d+\.\d+/, 'users can self-diagnose being behind');
  } finally { cleanup(dir); }
});

test('R10: README and the site ask for a release-watch, not just a star', () => {
  const readme = readFileSync(join(PLUGIN_ROOT, 'README.md'), 'utf8');
  assert.match(readme, /[Ww]atch.{0,40}[Rr]eleases/s, 'README carries the one channel that notifies');
  const site = readFileSync(join(PLUGIN_ROOT, 'site', 'content', 'index.html'), 'utf8');
  assert.match(site, /[Ww]atch.{0,60}[Rr]eleases/s, 'the site CTA too');
});

// ---- R4 — the post-edit hook surfaces each regression ONCE per baseline -----------------------

test('R4: the same regression is flagged once, not on every subsequent edit', () => {
  const dir = tmpDir('codeweb-ret-');
  try {
    writeTree(dir, {
      'src/a.js': 'export function alpha(x) {\n  return x + 1;\n}\n',
      'src/b.js': "import { alpha } from './a.js';\nexport function beta() {\n  return alpha(3);\n}\n",
    });
    const ws = join(dir, 'src', '.codeweb');
    assert.equal(mapProject(dir, ws).status, 0);
    // The edit removes alpha's ONLY caller -> a lost-callers regression vs the map baseline.
    writeFileSync(join(dir, 'src', 'b.js'), 'export function beta() {\n  return 3;\n}\n');
    const payload = JSON.stringify({ tool_input: { file_path: join(dir, 'src', 'b.js') } });
    const hook = join(PLUGIN_ROOT, 'hooks', 'post-edit-diff.mjs');
    const first = spawnSync(process.execPath, [hook], { encoding: 'utf8', input: payload });
    assert.match(first.stderr + first.stdout, /lost all callers/, 'the FIRST fire warns');
    const second = spawnSync(process.execPath, [hook], { encoding: 'utf8', input: payload });
    assert.ok(!/lost all callers/.test(second.stderr + second.stdout),
      'the SECOND identical fire is silent — repeated identical warnings train dismissal');
  } finally { cleanup(dir); }
});

// ---- R5 — suppression memory reaches every surface via the overlap output ---------------------

test('R5: a suppressed finding disappears from graph.overlaps and reports a suppressedCount', () => {
  const dir = tmpDir('codeweb-ret-');
  try {
    writeTree(dir, V1);
    const ws = join(dir, 'src', '.codeweb');
    assert.equal(mapProject(dir, ws).status, 0);
    const g1 = readJSON(join(ws, 'graph.json'));
    assert.ok(g1.overlaps.length >= 1, 'the finding exists');
    assert.ok(g1.overlaps[0].fingerprint, 'findings carry their annotation fingerprint');

    const ann = runNode(script('annotate.mjs'), ['--dir', ws, '--suppress', g1.overlaps[0].fingerprint, '--note', 'intentional twin']);
    assert.equal(ann.status, 0, ann.stderr);

    const r2 = runNode(RUN, [join(dir, 'src'), '--out-dir', ws, '--full']);
    assert.equal(r2.status, 0, r2.stderr);
    assert.match(r2.stderr + r2.stdout, /suppressed 1/, 'the count is visible, as the README promises');
    const g2 = readJSON(join(ws, 'graph.json'));
    assert.equal(g2.overlaps.length, 0, 'report/brief/trend/gate all inherit the suppression from graph.overlaps');
    assert.equal(g2.meta.suppressedOverlaps, 1, 'the graph records how many were triaged away');
  } finally { cleanup(dir); }
});

// ---- R7 — the gate comment recruits and remembers ---------------------------------------------

test('R7: the gate comment links home and can render a cross-PR trend line', async () => {
  const { gateComment } = await import('../scripts/lib/gate-md.mjs');
  const p = {
    ok: true, regressions: [], before: 'before', after: 'after',
    nodes: { added: [], removed: [], renamed: [] },
    edges: { added: 0, removed: 0 },
    crossDomainEdges: { delta: 0 },
    cycles: { added: [], removed: [] },
    overlaps: { added: [], removed: [] },
    orphans: { added: [] },
  };
  const plain = gateComment(p);
  assert.match(plain, /github\.com\/GhostlyGawd\/codeweb/, 'the highest-frequency impression finally links home');
  const withHistory = gateComment(p, { history: [{ confirmed: 12 }, { confirmed: 9 }, { confirmed: 9 }] });
  assert.match(withHistory, /12 → 9 → 9|12 -> 9 -> 9/, 'trajectory: the reason teams keep a gate through its first red X');
  assert.ok(!/undefined/.test(withHistory));
});

test('R7: ci-gate documents the --history flag', () => {
  const r = runNode(script('ci-gate.mjs'), ['--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /--history/, 'the gate ledger is wired, not hidden');
});

// ---- R11a — the unsupported-repo wall is remembered -------------------------------------------

test('R11a: a failed unsupported-language map leaves a marker that routes to the agent fallback', () => {
  const dir = tmpDir('codeweb-ret-');
  try {
    writeTree(dir, { 'proj/readme.txt': 'no supported sources\n' });
    const proj = join(dir, 'proj');
    const ws = join(proj, '.codeweb');
    const INIT = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } };
    const call = (id, name, args) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
    const input = [INIT, call(2, 'codeweb_map', { target: proj, out: ws })].map((m) => JSON.stringify(m)).join('\n') + '\n';
    const r = spawnSync(process.execPath, [script('mcp-server.mjs')], { encoding: 'utf8', input, cwd: dir, env: { ...process.env, CODEWEB_WS: ws } });
    const replies = r.stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const mapReply = replies.find((x) => x.id === 2);
    assert.equal(mapReply.result.isError, true, 'the map fails (unsupported language)');
    assert.ok(existsSync(join(ws, 'unsupported.json')), 'the failure is REMEMBERED');

    const input2 = [INIT, call(3, 'codeweb_callers', { symbol: 'anything' })].map((m) => JSON.stringify(m)).join('\n') + '\n';
    const r2 = spawnSync(process.execPath, [script('mcp-server.mjs')], { encoding: 'utf8', input: input2, cwd: dir, env: { ...process.env, CODEWEB_WS: ws } });
    const reply2 = r2.stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l)).find((x) => x.id === 3);
    assert.equal(reply2.result.isError, true);
    assert.match(reply2.result.content[0].text, /agent fallback|unsupported/i,
      'the next session routes to the fallback instead of hitting the same wall');
  } finally { cleanup(dir); }
});

// ---- R3 (pre-edit) — the card says when its numbers are behind for THIS file ------------------

test('R3: the pre-edit card marks a file whose stamps no longer match the map', async () => {
  const dir = tmpDir('codeweb-ret-');
  try {
    writeTree(dir, {
      'src/a.js': 'export function alpha(x) {\n  return x + 1;\n}\n',
      'src/b.js': "import { alpha } from './a.js';\nexport function beta() {\n  return alpha(3);\n}\n",
    });
    const ws = join(dir, 'src', '.codeweb');
    assert.equal(mapProject(dir, ws).status, 0);
    const { preview } = await import('../hooks/pre-edit-impact.mjs');
    const payload = JSON.stringify({ tool_input: { file_path: join(dir, 'src', 'a.js') } });
    const current = preview(payload);
    assert.ok(current && !/map behind/.test(current), 'a fresh map gets no warning');
    appendFileSync(join(dir, 'src', 'a.js'), '\nexport function gamma() {\n  return 7;\n}\n');
    const behind = preview(payload);
    assert.ok(behind, 'card still speaks');
    assert.match(behind, /map behind for this file/i, 'the card admits its numbers are stale for this file');
  } finally { cleanup(dir); }
});

// ---- instrumentation — the timestamps the nudges and deltas need ------------------------------

test('stats: full maps stamp firstMapAt/lastMapAt/mapCount (and only fresh computes count)', () => {
  const dir = tmpDir('codeweb-ret-');
  try {
    writeTree(dir, V1);
    const ws = join(dir, 'src', '.codeweb');
    assert.equal(mapProject(dir, ws).status, 0);
    const s1 = readJSON(join(ws, 'stats.json'));
    assert.ok(s1.firstMapAt && s1.lastMapAt, 'map timestamps recorded');
    assert.equal(s1.mapCount, 1);

    assert.equal(mapProject(dir, ws).status, 0); // memo hit — the map did not change
    const s2 = readJSON(join(ws, 'stats.json'));
    assert.equal(s2.mapCount, 1, 'a reused run is not a new map');
    assert.equal(s2.firstMapAt, s1.firstMapAt);

    writeFileSync(join(dir, 'src', 'two.js'), TWO_V2);
    assert.equal(mapProject(dir, ws).status, 0);
    const s3 = readJSON(join(ws, 'stats.json'));
    assert.equal(s3.mapCount, 2, 'a fresh compute is');
    assert.equal(s3.firstMapAt, s1.firstMapAt, 'firstMapAt never moves');
    assert.ok(s3.lastMapAt >= s1.lastMapAt, 'lastMapAt advances');
    const months = Object.values(s3.months || {});
    assert.ok(months.some((m) => (m.fullMaps || 0) >= 2), 'fullMaps counter accrues (the refresh-vs-remap ratio denominator)');
  } finally { cleanup(dir); }
});
