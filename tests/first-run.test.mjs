// Growth playbook Batch 2 — the install hard-fails and the first session (FUNNEL 1-3, SEO F3,
// ACTIVATION A1-A7, FORMS cut #4).
//
// FR1: .claude-plugin/marketplace.json exists and matches plugin.json (the #1 CTA's contract).
// FR2: bare `codeweb` maps the CURRENT DIRECTORY into ./.codeweb — zero required fields; the
//      usage text tells the truth about both defaults.
// FR3: the first-run banner is a result, not logistics: headline counts, an open hint, a
//      3-line `next:` block — and none of the fossil debug strings ("was 32", "top 18", NaN%).
// FR4: one findings vocabulary — overlap, optimize, and build-report print the same
//      actionable / needs-review / dismissed triple.
// FR5: an --allow-empty map is announced as EMPTY by the session brief (never "this repo is
//      mapped ... ask codeweb before guessing"), and the empty-target error routes non-native
//      languages to the agent fallback.
// FR6: the bin wrappers guard the Node version and forward: `codeweb --help` exits 0 with
//      usage; `codeweb-mcp` completes a JSON-RPC initialize handshake.
// FR7-FR9 (CLI.md 5.1/6.1): the stream contract — the result block rides stdout (pipe- and
//      `2>/dev/null`-surviving) while stage progress stays on stderr; `--json` emits exactly one
//      machine-readable line; a memo-reuse run still puts its result on stdout and reports
//      reused:true.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { runNode, tmpDir, cleanup, writeTree, script, readJSON, PLUGIN_ROOT } from './helpers.mjs';

const RUN = script('run.mjs');

const FIXTURE = {
  'src/a.js': 'export function alpha(x) {\n  return beta(x) + 1;\n}\n',
  'src/b.js': "import { alpha } from './a.js';\nexport function beta(x) {\n  return x * 2;\n}\nexport function gamma() {\n  return alpha(3);\n}\n",
};

// A fixture with one REAL duplicate pair so the findings triple is non-zero end to end.
const DUP_FIXTURE = {
  'src/one.js': 'export function packOrders(list) {\n  const out = [];\n  let total = 0;\n  for (const it of list) {\n    total += it.qty;\n    out.push(it.qty * 2);\n  }\n  const avg = total / list.length;\n  out.sort();\n  console.log(avg);\n  return out;\n}\n',
  'src/two.js': 'export function packOrders(list) {\n  const out = [];\n  let total = 0;\n  for (const it of list) {\n    total += it.qty;\n    out.push(it.qty * 2);\n  }\n  const avg = total / list.length;\n  out.sort();\n  console.log(avg);\n  return out;\n}\n',
};

test('FR1: marketplace.json exists and satisfies the marketplace-add contract', () => {
  const p = join(PLUGIN_ROOT, '.claude-plugin', 'marketplace.json');
  assert.ok(existsSync(p), '.claude-plugin/marketplace.json must ship — the #1 install CTA depends on it');
  const m = readJSON(p);
  const plugin = readJSON(join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'));
  assert.ok(Array.isArray(m.plugins) && m.plugins.length >= 1, 'plugins array present');
  const entry = m.plugins.find((x) => x.name === plugin.name);
  assert.ok(entry, `an entry named "${plugin.name}" matching plugin.json`);
  assert.equal(entry.source, './', 'the plugin is this repo root');
});

test('FR2: bare run maps the current directory into ./.codeweb; usage states both defaults', () => {
  const dir = tmpDir('codeweb-firstrun-');
  try {
    writeTree(dir, FIXTURE);
    const cwd = join(dir, 'src');
    const r = runNode(RUN, [], { cwd });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(existsSync(join(cwd, '.codeweb', 'graph.json')), 'graph landed in <cwd>/.codeweb');
    assert.ok(existsSync(join(cwd, '.codeweb', 'report.html')), 'report landed beside it');

    const help = runNode(RUN, ['--help']);
    assert.equal(help.status, 0);
    assert.match(help.stdout + help.stderr, /default: current directory|default: \./i, 'SRC default stated');
    assert.match(help.stdout + help.stderr, /<SRC>\/\.codeweb/, 'out-dir default stated truthfully');
    assert.ok(!/\.live\/<slug>/.test(help.stdout + help.stderr), 'the old false default is gone');
  } finally { cleanup(dir); }
});

test('FR3: the first-run banner leads with the result and a next: block — no fossil strings', () => {
  const dir = tmpDir('codeweb-firstrun-');
  try {
    writeTree(dir, DUP_FIXTURE);
    const ws = join(dir, 'ws');
    const r = runNode(RUN, [join(dir, 'src'), '--out-dir', ws]);
    assert.equal(r.status, 0, r.stderr);
    // CLI.md 6.1: the result block is stdout; the fossil negatives sweep BOTH streams.
    assert.match(r.stdout, /mapped \d+ symbols/, 'headline result line present');
    assert.match(r.stdout, /actionable/, 'findings vocabulary reaches the banner');
    assert.match(r.stdout, /next:/, 'the next: block exists on a first run');
    assert.match(r.stdout, /claude mcp add codeweb/, 'the living-map bridge is named');
    assert.match(r.stdout, /re-run/, 'the habit loop is named');
    const out = r.stderr + r.stdout;
    assert.ok(!/was 32/.test(out), 'fossil "(was 32)" is gone');
    assert.ok(!/top 18 domains/.test(out) || /--- top \d+ domains ---/.test(out.replace(/top 18 domains/g, '')), 'hardcoded "top 18" header is gone');
    assert.ok(!/NaN/.test(out), 'no NaN ever reaches the user');
  } finally { cleanup(dir); }
});

test('FR4: overlap, optimize, and build-report print one findings vocabulary', () => {
  const dir = tmpDir('codeweb-firstrun-');
  try {
    writeTree(dir, DUP_FIXTURE);
    const ws = join(dir, 'ws');
    const r = runNode(RUN, [join(dir, 'src'), '--out-dir', ws]);
    assert.equal(r.status, 0, r.stderr);
    const out = r.stderr + r.stdout;
    const triples = [...out.matchAll(/actionable (\d+) · needs review (\d+) · dismissed (\d+)/g)];
    assert.ok(triples.length >= 2, `the shared triple appears on at least two stage surfaces (found ${triples.length})`);
    const first = triples[0].slice(1).join(',');
    for (const t of triples) {
      assert.equal(t.slice(1).join(','), first, 'every surface reports the SAME numbers');
    }
  } finally { cleanup(dir); }
});

test('FR5: an empty map is announced as EMPTY; the empty-target error routes to the agent fallback', async () => {
  const dir = tmpDir('codeweb-firstrun-');
  try {
    writeTree(dir, { 'proj/readme.txt': 'no supported sources here\n' });
    const proj = join(dir, 'proj');

    const refused = runNode(RUN, [proj, '--out-dir', join(proj, '.codeweb')]);
    assert.notEqual(refused.status, 0, 'empty target refused by default');
    assert.match(refused.stderr, /agent fallback|\/codeweb/i, 'the real escape (agent fallback) is named');

    const allowed = runNode(RUN, [proj, '--out-dir', join(proj, '.codeweb'), '--allow-empty']);
    assert.equal(allowed.status, 0, allowed.stderr);
    const { preview } = await import('../hooks/session-brief.mjs');
    const msg = preview(JSON.stringify({ cwd: proj }));
    assert.ok(msg, 'brief still speaks for an empty map');
    assert.match(msg, /EMPTY/i, 'the brief says the map is empty');
    assert.ok(!/ask codeweb before guessing/.test(msg), 'the empty map never instructs agents to consult it');
  } finally { cleanup(dir); }
});

test('FR6: bin wrappers guard the Node version and forward faithfully', async () => {
  const help = runNode(join(PLUGIN_ROOT, 'bin', 'codeweb.mjs'), ['--help']);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout + help.stderr, /usage: run\.mjs|<SRC>/, 'codeweb bin forwards to run.mjs');

  // minimal JSON-RPC handshake through the mcp wrapper
  const child = spawn(process.execPath, [join(PLUGIN_ROOT, 'bin', 'codeweb-mcp.mjs')], { stdio: ['pipe', 'pipe', 'pipe'] });
  const reply = await new Promise((resolveP) => {
    let buf = '';
    const timer = setTimeout(() => { child.kill(); resolveP(buf); }, 8000);
    child.stdout.on('data', (d) => {
      buf += String(d);
      if (buf.includes('serverInfo')) { clearTimeout(timer); child.kill(); resolveP(buf); }
    });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '0' } } }) + '\n');
  });
  assert.match(reply, /serverInfo/, 'codeweb-mcp bin boots the real server');
});

// ---- CLI.md 5.1/6.1 — the stream contract + machine mode --------------------------------------

test('FR7: the result block rides stdout (2>/dev/null-surviving); stage progress stays off it', () => {
  const dir = tmpDir('codeweb-firstrun-');
  try {
    writeTree(dir, DUP_FIXTURE);
    const ws = join(dir, 'ws');
    const r = runNode(RUN, [join(dir, 'src'), '--out-dir', ws]);
    assert.equal(r.status, 0, r.stderr);
    // stdout = the result page: done line, banner, artifact list, guidance.
    assert.match(r.stdout, /\[run\] done -> /, 'the done line survives 2>/dev/null');
    assert.match(r.stdout, /mapped \d+ symbols/, 'the banner survives 2>/dev/null (| grep mapped works)');
    // stderr = progress: per-stage lines and children's chatter never pollute the result channel.
    assert.match(r.stderr, /\[run\] extract/, 'stage progress is on stderr');
    assert.match(r.stderr, /\[run\] extract done in \d+ms/, 'stage timings are on stderr');
    assert.ok(!/\[run\] extract/.test(r.stdout), 'no stage lines on stdout');
    assert.ok(!/done in \d+ms/.test(r.stdout), 'no stage timings on stdout');
    assert.ok(!/\[extract\]|hubs stripped/.test(r.stdout), "children's chatter is stderr, not stdout");
  } finally { cleanup(dir); }
});

test('FR8: --json emits exactly one parseable line on stdout with the five keys — no text block', () => {
  const dir = tmpDir('codeweb-firstrun-');
  try {
    writeTree(dir, DUP_FIXTURE);
    const ws = join(dir, 'ws');
    const r = runNode(RUN, [join(dir, 'src'), '--out-dir', ws, '--json']);
    assert.equal(r.status, 0, r.stderr);
    const lines = r.stdout.split('\n').filter((l) => l.trim());
    assert.equal(lines.length, 1, `exactly one stdout line (got ${lines.length}: ${r.stdout})`);
    const j = JSON.parse(lines[0]);
    assert.deepEqual(Object.keys(j).sort(), ['actionable', 'reused', 'symbols', 'version', 'ws'], 'the five keys, nothing else');
    assert.equal(j.ws, ws, 'ws is the workspace path');
    assert.ok(typeof j.symbols === 'number' && j.symbols > 0, 'symbols from the banner');
    assert.ok(typeof j.actionable === 'number', 'actionable from the banner');
    assert.equal(j.reused, false, 'a fresh map is not a reuse');
    assert.match(j.version, /^\d+\.\d+\.\d+/, 'version = VERSION');
    assert.ok(!/\[run\] /.test(r.stdout), 'none of the [run] text block on stdout');
    assert.match(r.stderr, /\[run\] extract/, 'stage chatter still goes to stderr in --json mode');
  } finally { cleanup(dir); }
});

test('FR9: a memo-reuse run still prints the done line on stdout, and --json says reused:true', () => {
  const dir = tmpDir('codeweb-firstrun-');
  try {
    writeTree(dir, DUP_FIXTURE);
    const ws = join(dir, 'ws');
    assert.equal(runNode(RUN, [join(dir, 'src'), '--out-dir', ws]).status, 0);
    const second = runNode(RUN, [join(dir, 'src'), '--out-dir', ws]);
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stderr, /stages reused/, 'precondition: the second run hit the memo');
    assert.match(second.stdout, /\[run\] done -> /, 'a memo-hit run is no longer stdout-silent');
    assert.match(second.stdout, /mapped \d+ symbols/, 'the banner rides the reuse path too');
    const third = runNode(RUN, [join(dir, 'src'), '--out-dir', ws, '--json']);
    assert.equal(third.status, 0, third.stderr);
    assert.equal(JSON.parse(third.stdout.trim()).reused, true, '--json reports the memo hit');
  } finally { cleanup(dir); }
});
