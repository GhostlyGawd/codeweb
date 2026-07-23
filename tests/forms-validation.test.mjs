// Growth playbook Batch 3 — FORMS: the input surfaces validate as well as the outputs claim
// (FORMS.md F1-F14). Written RED against the pre-batch behavior; each test names its finding.
//
// F1: the prescribed pre-refactor check (codeweb_simulate) never returns an empty success.
// F2: required-arg errors distinguish missing / wrong type / empty — no misleading retries.
// F3: garbage or negative limit/offset/window/budget is an error, never a silently-disabled budget.
// F4: a misconfigured fitness rule kills the gate loudly — its failure mode must never be passing.
// F5: a roles-only codeweb.rules.json is "0 rules configured", not a malformed-file rejection.
// F6: a broken target rules file names itself; unknown top-level keys warn instead of no-oping.
// F7: release.mjs joins the house parser — unknown flags die, --version is semver-checked.
// F8: reading-order --scope enumerates its valid kinds like run.mjs --stages already does.
// F9: run.mjs --coverage validates the path at parse time, not five stages later.
// F10: --help documents every real flag on the four advisors that hid theirs.
// F11: codeweb_review's schema stops advertising params that do nothing.
// F12: codemod infers the merge survivor; fitness discovers its rules file — MCP parity with CLI.
// F13: near-miss suggestions catch a 1-2 edit typo (levenshtein tier behind the token tiers).
// F14: codemod usage brackets --into; CLI negative --limit dies at parse like the MCP clamp.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { tmpDir, cleanup, script, runNode, writeTree } from './helpers.mjs';

const GRAPH = {
  meta: { target: 'forms-fixture' },
  nodes: [
    { id: 'a.js:main', label: 'main', file: 'a.js', domain: 'app', exports: false, loc: 4 },
    { id: 'b.js:helper', label: 'helper', file: 'b.js', domain: 'lib', exports: true, loc: 4 },
    { id: 'c.js:helper2', label: 'helper2', file: 'c.js', domain: 'lib', exports: true, loc: 4 },
  ],
  edges: [
    { from: 'a.js:main', to: 'b.js:helper', kind: 'call' },
    { from: 'a.js:main', to: 'c.js:helper2', kind: 'call' },
  ],
  domains: [], overlaps: [],
};

let WS, GP;      // bare fixture (no rules file beside it)
let RWS, RGP;    // fixture WITH a valid codeweb.rules.json beside the graph (F12 discovery)
before(() => {
  WS = tmpDir('codeweb-forms-');
  GP = join(WS, 'graph.json');
  writeFileSync(GP, JSON.stringify(GRAPH));
  RWS = tmpDir('codeweb-forms-rules-');
  RGP = join(RWS, 'graph.json');
  writeFileSync(RGP, JSON.stringify(GRAPH));
  writeFileSync(join(RWS, 'codeweb.rules.json'),
    JSON.stringify({ rules: [{ id: 'fan-in-cap', type: 'max-fan-in', severity: 'error', limit: 100 }] }));
});
after(() => { if (WS) cleanup(WS); if (RWS) cleanup(RWS); });

// ---- MCP harness (mirrors tests/mcp.test.mjs) ------------------------------------------------
function rpc(messages) {
  const input = messages.map((m) => JSON.stringify(m)).join('\n') + '\n';
  const r = spawnSync(process.execPath, [script('mcp-server.mjs')], { encoding: 'utf8', input, maxBuffer: 1 << 28 });
  if (r.error) throw new Error(`mcp-server.mjs spawn failed: ${r.error.message}`);
  const responses = (r.stdout || '').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return { status: r.status, stderr: r.stderr || '', responses, byId: new Map(responses.map((x) => [x.id, x])) };
}
const INIT = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } };
const callTool = (id, name, args) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
const textOf = (msg) => msg?.result?.content?.[0]?.text ?? '';

// ---- F1 — the empty success on the highest-traffic surface -----------------------------------

test('F1: MCP simulate on an unknown symbol never returns an empty success', () => {
  const { byId } = rpc([INIT, callTool(2, 'codeweb_simulate', { graph: GP, delete: 'nonexistentSymbol' })]);
  const res = byId.get(2).result;
  const text = textOf(byId.get(2)).trim();
  assert.ok(text.length > 0, 'reply carries text (the observed bug: {"text":""} with no isError)');
  if (!res.isError) {
    const p = JSON.parse(text);
    assert.equal(p.found, false, 'a non-error miss must say found:false like query/explain do');
  }
});

test('F1: simulate-edit --json emits found:false JSON on stdout for an unknown symbol', () => {
  const r = runNode(script('simulate-edit.mjs'), [GP, '--delete', 'nope', '--json']);
  assert.equal(r.status, 1);
  const p = JSON.parse(r.stdout || 'null');
  assert.ok(p, 'stdout is JSON, not empty (die() used to print to stderr only)');
  assert.equal(p.found, false);
  assert.match(String(p.hint || ''), /find|concept/i, 'redirects to concept search like the query family');
});

// ---- F2 — missing vs wrong type vs empty ------------------------------------------------------

test('F2: required-arg errors distinguish missing / wrong type / empty', () => {
  const { byId } = rpc([INIT,
    callTool(2, 'codeweb_explain', { graph: GP }),
    callTool(3, 'codeweb_explain', { graph: GP, symbol: 42 }),
    callTool(4, 'codeweb_explain', { graph: GP, symbol: '' }),
  ]);
  assert.match(textOf(byId.get(2)), /missing required argument: symbol/, 'absent stays "missing"');
  const wrongType = textOf(byId.get(3));
  assert.doesNotMatch(wrongType, /missing/, 'present-but-wrong-type is NOT "missing" (misleads the retry)');
  assert.match(wrongType, /must be a string/i);
  assert.match(wrongType, /number/i, 'names the offending type');
  const empty = textOf(byId.get(4));
  assert.doesNotMatch(empty, /missing/, 'empty string is present, not missing');
  assert.match(empty, /non-empty/i);
});

// ---- F3 — the numeric clamp ------------------------------------------------------------------

test('F3: garbage/negative limit, offset, window are errors — never a silently-disabled budget', () => {
  const { byId } = rpc([INIT,
    callTool(2, 'codeweb_find', { graph: GP, query: 'helper', limit: 'abc' }),
    callTool(3, 'codeweb_find', { graph: GP, query: 'helper', limit: -3 }),
    callTool(4, 'codeweb_callers', { graph: GP, symbol: 'helper', offset: 'x' }),
    callTool(5, 'codeweb_context', { graph: GP, symbol: 'helper', window: 'huge' }),
    callTool(6, 'codeweb_find', { graph: GP, query: 'helper', limit: 1 }),
  ]);
  for (const [id, param] of [[2, 'limit'], [3, 'limit'], [4, 'offset'], [5, 'window']]) {
    const res = byId.get(id).result;
    assert.equal(res.isError, true, `bad ${param} (id ${id}) is an error, not silence`);
    assert.match(textOf(byId.get(id)), new RegExp(param), `the error names ${param}`);
  }
  const ok = JSON.parse(textOf(byId.get(6)));
  assert.equal(ok.results.length, 1, 'a valid numeric limit still budgets normally');
});

// ---- F4 / F5 — the fitness gate must fail loudly, never pass silently -------------------------

test('F4: a misconfigured fitness rule dies at load — the gate never passes while checking nothing', () => {
  const dir = tmpDir('codeweb-forms-fit-');
  try {
    const gp = join(dir, 'graph.json');
    writeFileSync(gp, JSON.stringify(GRAPH));
    const run = (rules) => {
      const p = join(dir, 'rules.json');
      writeFileSync(p, JSON.stringify({ rules }));
      return runNode(script('fitness.mjs'), [gp, '--rules', p]);
    };
    const noLimit = run([{ id: 'r1', type: 'max-fan-in', severity: 'error' }]);
    assert.equal(noLimit.status, 2, 'max-fan-in without numeric limit dies (it used to report ok)');
    assert.match(noLimit.stderr, /r1/, 'names the broken rule');
    assert.match(noLimit.stderr, /limit/, 'names the missing param');

    const typoSev = run([{ id: 'r2', type: 'max-fan-in', severity: 'eror', limit: 1 }]);
    assert.equal(typoSev.status, 2, 'a typo severity dies (it used to silently demote to warning)');
    assert.match(typoSev.stderr, /severity/);
    assert.match(typoSev.stderr, /error.*warning|warning.*error/, 'lists the valid values');

    const noId = run([{ type: 'no-cycles', severity: 'error' }]);
    assert.equal(noId.status, 2, 'a rule without id dies');
    assert.match(noId.stderr, /id/);

    const noFrom = run([{ id: 'r4', type: 'forbidden-dependency', severity: 'error', to: 'lib' }]);
    assert.equal(noFrom.status, 2, 'forbidden-dependency without from/to dies');
    assert.match(noFrom.stderr, /from/);
  } finally { cleanup(dir); }
});

test('F5: a roles-only codeweb.rules.json is "0 rules configured", not a rejection', () => {
  const dir = tmpDir('codeweb-forms-roles-');
  try {
    const gp = join(dir, 'graph.json');
    writeFileSync(gp, JSON.stringify(GRAPH));
    writeFileSync(join(dir, 'codeweb.rules.json'), JSON.stringify({ roles: [] }));
    const r = runNode(script('fitness.mjs'), [gp]);
    assert.equal(r.status, 0, `a valid roles-only file must not fail fitness (stderr: ${r.stderr})`);
    assert.match(r.stdout + r.stderr, /0 rules|no rules configured/i);
    assert.match(r.stdout + r.stderr, /roles/, 'explains WHY it is empty (the file is extractor config)');
  } finally { cleanup(dir); }
});

// ---- F6 — the target rules file errors name the file ------------------------------------------

test('F6: a malformed target rules file names itself; an unknown top-level key warns', () => {
  const dir = tmpDir('codeweb-forms-target-');
  try {
    writeTree(dir, { 'a.js': 'export function alpha() { return 1; }\n' });
    writeFileSync(join(dir, 'codeweb.rules.json'), '{"roles": [');
    const broken = runNode(script('extract-symbols.mjs'), [dir, '--out', join(dir, 'f.json')]);
    assert.notEqual(broken.status, 0);
    assert.match(broken.stderr, /codeweb\.rules\.json/, 'the parse error names the file');

    writeFileSync(join(dir, 'codeweb.rules.json'), JSON.stringify({ rolez: [] }));
    const typo = runNode(script('extract-symbols.mjs'), [dir, '--out', join(dir, 'f.json')]);
    assert.equal(typo.status, 0, typo.stderr);
    assert.match(typo.stderr, /unknown.*rolez|rolez.*unknown/i, 'a misspelled key warns instead of silently no-oping');
  } finally { cleanup(dir); }
});

// ---- F7 — release.mjs joins the house parser --------------------------------------------------

test('F7: release.mjs — --help works, unknown flags die, --version is semver-validated', () => {
  const rel = script('release.mjs');
  const help = runNode(rel, ['--help']);
  assert.equal(help.status, 0, 'release.mjs answers --help like every other script');
  assert.match(help.stdout, /usage:/);

  const typo = runNode(rel, ['--patch', '--dryrun']);
  assert.equal(typo.status, 2, 'a typo\'d --dryrun dies instead of running the REAL prep');
  assert.match(typo.stderr, /unknown flag: --dryrun/);

  const banana = runNode(rel, ['--version=banana', '--dry-run']);
  assert.equal(banana.status, 2, '"banana" is not a version');
  assert.match(banana.stderr, /\d+\.\d+\.\d+|semver|X\.Y\.Z/i, 'names the expected shape');
});

// ---- F8 — scope enum -------------------------------------------------------------------------

test('F8: reading-order rejects an invalid --scope kind with the valid set', () => {
  const r = runNode(script('reading-order.mjs'), [GP, '--scope', 'bogus', 'whatever']);
  assert.equal(r.status, 2, 'a typo scope must not silently answer a different question');
  assert.match(r.stderr, /domain.*file.*symbol/s, 'lists the valid kinds');
});

// ---- F9 — coverage pre-check ------------------------------------------------------------------

test('F9: run.mjs --coverage validates the path before any stage runs', () => {
  const dir = tmpDir('codeweb-forms-cov-');
  try {
    writeTree(dir, { 'a.js': 'export function alpha() { return 1; }\n' });
    const r = runNode(script('run.mjs'), [dir, '--out-dir', join(dir, 'ws'), '--coverage', '/nope.lcov']);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /coverage/i);
    assert.match(r.stderr, /[\\/]nope\.lcov/, 'names the bad path (either separator — resolve() is drive-lettered on Windows)');
    assert.ok(!/\[run\] extract/.test(r.stderr), 'died at parse time — not after five stages of work');
  } finally { cleanup(dir); }
});

// ---- F10 — --help tells the whole truth -------------------------------------------------------

test('F10: --help documents every real flag on the advisors that hid theirs', () => {
  const cases = [
    ['deadcode.mjs', ['--limit', '--show-suppressed', '--annotations']],
    ['risk.mjs', ['--limit']],
    ['hotspots.mjs', ['--limit']],
    ['find.mjs', ['--full']],
  ];
  for (const [s, flags] of cases) {
    const r = runNode(script(s), ['--help']);
    assert.equal(r.status, 0, `${s} --help exits 0`);
    for (const f of flags) assert.ok(r.stdout.includes(f), `${s} --help documents ${f}`);
  }
});

// ---- F11 / F12 — the tools/list contract tells the truth --------------------------------------

test('F11: codeweb_review stops advertising params that do nothing', () => {
  const tools = rpc([INIT, { jsonrpc: '2.0', id: 2, method: 'tools/list' }]).byId.get(2).result.tools;
  const review = tools.find((t) => t.name === 'codeweb_review');
  assert.ok(review, 'codeweb_review listed');
  assert.ok(!('limit' in review.inputSchema.properties), 'limit is dead on review — not advertised');
  assert.ok(!('full' in review.inputSchema.properties), 'full is dead on review — not advertised');
});

test('F12: codemod infers the survivor when into is omitted; fitness discovers its rules file', () => {
  const { byId } = rpc([INIT,
    callTool(2, 'codeweb_codemod', { graph: GP, merge: 'helper,helper2' }),
    callTool(3, 'codeweb_fitness', { graph: RGP }),
    callTool(4, 'codeweb_fitness', { graph: GP }),
  ]);
  const cm = byId.get(2);
  assert.doesNotMatch(textOf(cm), /missing required argument/, 'into is optional — the CLI already infers it');
  const cmP = JSON.parse(textOf(cm));
  assert.ok(cmP.canonical, 'the inferred canonical survivor is reported');

  const fit = byId.get(3);
  assert.doesNotMatch(textOf(fit), /missing required argument/, 'rules is optional — the CLI already discovers it');
  const fitP = JSON.parse(textOf(fit));
  assert.equal(fitP.rulesChecked, 1, 'the beside-graph codeweb.rules.json was discovered');

  const none = byId.get(4);
  assert.doesNotMatch(textOf(none), /missing required argument/);
  assert.match(textOf(none), /rules/i, 'no discoverable rules explains itself (not a schema error)');
});

// ---- F13 — the typo net -----------------------------------------------------------------------

test('F13: near-miss suggestions catch a 1-2 edit typo', async () => {
  const { suggestSymbols } = await import('../scripts/lib/graph-ops.mjs');
  const s = suggestSymbols(GRAPH, 'helpr');
  assert.ok(JSON.stringify(s).includes('helper'), `levenshtein<=2 tier catches the dropped letter (got ${JSON.stringify(s)})`);
});

// ---- F14 — ergonomics -------------------------------------------------------------------------

test('F14a: codemod usage brackets --into as optional', () => {
  const r = runNode(script('codemod.mjs'), ['--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /\[--into[^\]]*\]/, 'usage shows --into as optional (the engine infers the survivor)');
});

test('F14c: CLI negative --limit dies at parse, matching the MCP clamp', () => {
  const r = runNode(script('query.mjs'), ['--callers', 'main', '--limit', '-5', GP]);
  assert.equal(r.status, 2, 'a negative limit is nonsense, not an empty page with nextOffset:0');
  assert.match(r.stderr, /--limit/);
});
