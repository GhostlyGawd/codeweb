// P03-R01–R07: source fixtures and negative controls independent of the frozen
// P-02 packet. These test handler/CLI/MCP contracts, not actual host delivery.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync, chmodSync } from 'node:fs';
import { join, delimiter } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { script, PLUGIN_ROOT } from './helpers.mjs';
import { runExtract } from '../scripts/extract-symbols.mjs';
import { normalizeGraph } from '../scripts/lib/graph-ops.mjs';
import { writeSidecars } from '../scripts/lib/sidecars.mjs';
import { computeHookBaseline, writeHookBaselineBeside } from '../scripts/lib/hook-baseline.mjs';
import { statSync } from 'node:fs';

const env = { ...process.env, CODEWEB_ENGINE: 'regex', CODEWEB_NO_STATS: '1', CODEWEB_NO_AUTOREFRESH: '1', CODEWEB_NO_RECEIPTS: '1', CODEWEB_NO_PROMO: '1' };
const digest = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const run = (entry, args = [], input, extra = {}) => spawnSync(process.execPath, [entry, ...args], { input, encoding: 'utf8', env: { ...env, ...extra }, maxBuffer: 8 << 20 });
const cli = (name, args) => run(script(name), args);
const hook = (name, f, fields = {}, entry) => run(entry || join(PLUGIN_ROOT, 'hooks', name + '.mjs'), [], JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: f, ...fields } }));
const context = (r) => r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.additionalContext : null;
function rpc(name, graph, args = {}) {
  const messages = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: { graph, ...args } } },
  ];
  const r = run(script('mcp-server.mjs'), [], messages.map((m) => JSON.stringify(m)).join('\n') + '\n');
  assert.equal(r.status, 0, r.stderr);
  const result = r.stdout.split('\n').filter(Boolean).map(JSON.parse).find((m) => m.id === 2).result;
  return result;
}
function fixture(files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'codeweb-ned-repair-'));
  mkdirSync(join(root, '.codeweb'));
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(join(root, file, '..'), { recursive: true });
    writeFileSync(join(root, file), text);
  }
  return { root, graph: join(root, '.codeweb', 'graph.json'), baseline: join(root, '.codeweb', 'graph.baseline.json') };
}
function save(f, g, sidecars = true) {
  const graph = normalizeGraph(g), bytes = JSON.stringify(graph);
  writeFileSync(f.graph, bytes);
  if (sidecars) {
    writeSidecars(f.graph, graph);
    writeHookBaselineBeside(f.graph, computeHookBaseline(graph, bytes, statSync(f.graph).mtimeMs));
  }
  return graph;
}
async function map(f, sidecars = true) {
  const { fragment } = await runExtract({ path: f.root, ctags: false, engine: 'regex' });
  return save(f, fragment, sidecars);
}
const source = {
  'access.mjs': 'export function permit(role) {\n  return role === "owner";\n}\nexport function decorate(value) {\n  return value.trim();\n}\nfunction localAccess(role) {\n  return permit(role);\n}\nexport function unused(value) {\n  return value * 9;\n}\n',
  'decision.mjs': 'import { permit } from "./access.mjs";\nexport function decide(role) {\n  return permit(role);\n}\n',
  ...Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`format${i}.mjs`, `import { decorate } from "./access.mjs";\nexport function formatter${i}(value) {\n  return decorate(value);\n}\n`])),
};

test('ac_35 R01: incomplete/missing-source CLI and MCP deadcode retain structural tiers and in-band provenance', async () => {
  const f = fixture({ 'stray.mjs': 'function abandoned() {\n  return 42;\n}\n' });
  try {
    const original = await map(f);
    writeFileSync(f.baseline, readFileSync(f.graph)); const before = digest(f.baseline);
    for (const condition of ['available', 'incomplete', 'missing-source', 'missing-root']) {
      const g = structuredClone(original);
      if (condition === 'incomplete') g.meta.analysis = { status: 'incomplete', diagnosticCount: 1, diagnostics: [{ code: 'unsupported-same-line-declaration', file: 'stray.mjs', line: 1 }] };
      if (condition === 'missing-source') rmSync(join(f.root, 'stray.mjs'));
      if (condition === 'missing-root') g.meta.root = join(f.root, 'absent');
      save(f, g, false);
      const r = cli('deadcode.mjs', [f.graph, '--json']);
      assert.equal(r.status, 0, r.stderr);
      const out = JSON.parse(r.stdout);
      assert.deepEqual(out.safe.map((n) => n.id), ['stray.mjs:abandoned']);
      assert.deepEqual(out.totals, { orphans: 1, safe: 1, review: 0, suppressed: 0 });
      assert.doesNotMatch(r.stdout, /safe to delete|high-confidence dead/);
      assert.match(out.summary, /deletion safety not established/);
      assert.match(out.analysis.legacyTierMeaning, /not deletion guarantees/);
      if (condition !== 'available') assert.equal(out.analysis.status, 'incomplete');
      if (condition.startsWith('missing')) {
        assert.equal(out.analysis.sourceAvailable, false);
        assert.equal(out.safe[0].sourceEvidence, 'unavailable');
        assert.ok(out.analysis.nextSteps.some((s) => /Restore/.test(s)));
      }
      if (condition === 'incomplete') assert.equal(out.analysis.completeness.diagnostics[0].code, 'unsupported-same-line-declaration');
      const m = rpc('codeweb_deadcode', f.graph);
      assert.equal(m.isError, undefined);
      assert.deepEqual(JSON.parse(m.content[0].text), out);
      assert.equal(digest(f.baseline), before);
    }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('R01/R04: valid empty, supported-zero and legacy maps stay distinct from malformed shapes on CLI/MCP', () => {
  const f = fixture();
  try {
    const malformed = [null, [], 'map', { nodes: {} }, { nodes: null }, { nodes: [null] }, { nodes: ['node'] }, { nodes: [{}] }, { nodes: [{ id: 'a:f', file: 5 }] }, { nodes: [], edges: {} }];
    for (const value of malformed) {
      writeFileSync(f.graph, JSON.stringify(value));
      const r = cli('query.mjs', [f.graph, '--impact', 'alpha', '--json']);
      assert.equal(r.status, 2);
      assert.match(r.stderr, /invalid graph/);
      assert.equal(r.stdout, '');
      const m = rpc('codeweb_impact', f.graph, { symbol: 'alpha' });
      assert.equal(m.isError, true);
      assert.match(m.content[0].text, /invalid graph/);
      assert.doesNotMatch(m.content[0].text, /EMPTY|built with --allow-empty/);
    }
    writeFileSync(f.graph, '{broken');
    assert.match(cli('query.mjs', [f.graph, '--impact', 'alpha']).stderr, /invalid JSON/);
    assert.equal(rpc('codeweb_impact', f.graph, { symbol: 'alpha' }).isError, true);
    // Legitimate old maps omit optional metadata, spans, roles and even edges.
    writeFileSync(f.graph, JSON.stringify({ nodes: [{ id: 'legacy.mjs:alpha', label: 'alpha' }] }));
    const legacy = cli('query.mjs', [f.graph, '--impact', 'alpha', '--json']);
    assert.equal(legacy.status, 0, legacy.stderr);
    assert.equal(rpc('codeweb_impact', f.graph, { symbol: 'alpha' }).isError, undefined);
    writeFileSync(f.graph, JSON.stringify({ nodes: [], edges: [] }));
    const empty = JSON.parse(cli('deadcode.mjs', [f.graph, '--json']).stdout);
    assert.equal(empty.totals.orphans, 0);
    assert.match(empty.summary, /deletion safety not established/);
    assert.equal(empty.analysis.sourceAvailable, false);
    assert.match(rpc('codeweb_impact', f.graph, { symbol: 'alpha' }).content[0].text, /EMPTY/);
    // Pre-existing sparse graphs omit collection fields entirely. That legacy
    // default differs from an explicitly malformed/null node collection.
    for (const sparse of [{}, { meta: { target: 'legacy-sparse' } }]) {
      writeFileSync(f.graph, JSON.stringify(sparse));
      const diff = cli('diff.mjs', [f.graph, f.graph, '--json']);
      assert.equal(diff.status, 0, diff.stderr);
      assert.equal(JSON.parse(diff.stdout).ok, true);
      assert.deepEqual(JSON.parse(diff.stdout).nodes.added, []);
      const dead = cli('deadcode.mjs', [f.graph, '--json']);
      assert.equal(dead.status, 0, dead.stderr);
      assert.equal(JSON.parse(dead.stdout).totals.orphans, 0);
      const empty = rpc('codeweb_impact', f.graph, { symbol: 'alpha' });
      assert.equal(empty.isError, true);
      assert.match(empty.content[0].text, /EMPTY/);
      assert.doesNotMatch(empty.content[0].text, /invalid graph/);
    }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('R02: known low target shows consequential external and same-file callers, not unrelated popularity', async () => {
  const f = fixture(source);
  try {
    await map(f); writeFileSync(f.baseline, readFileSync(f.graph)); const before = digest(f.baseline);
    const file = join(f.root, 'access.mjs');
    for (const fields of [{ old_string: 'return role === "owner";', new_string: 'return false;' }, { symbol: 'access.mjs:permit' }, { symbol: 'permit' }, { edits: [{ old_string: 'return role === "owner";', new_string: 'return false;' }] }]) {
      const r = hook('pre-edit-impact', file, fields), msg = context(r);
      assert.equal(r.status, 0);
      assert.match(msg, /mapped edit target access\.mjs:permit/);
      assert.match(msg, /decision\.mjs:decide/);
      assert.match(msg, /access\.mjs:localAccess/);
      assert.doesNotMatch(msg, /formatter|most depended-on/);
      assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, undefined);
      assert.ok(msg.length < 2000);
      assert.equal(context(hook('pre-edit-impact', file, fields)), msg, 'repeat stays relevant');
    }
    const high = context(hook('pre-edit-impact', file, { old_string: 'return value.trim();' }));
    assert.match(high, /mapped edit target access\.mjs:decorate/);
    assert.match(high, /\+3 more; expand/);
    assert.doesNotMatch(high, /decision\.mjs:decide/);
    const summary = context(hook('pre-edit-impact', file));
    assert.match(summary, /scope: file summary.*edited symbol unspecified/);
    assert.match(summary, /most depended-on: decorate/);
    const unresolved = context(hook('pre-edit-impact', file, { old_string: 'not in this source' }));
    assert.match(unresolved, /edit target unresolved\/ambiguous/);
    const multi = context(hook('pre-edit-impact', file, { edits: [{ old_string: 'return role === "owner";' }, { old_string: 'return value.trim();' }] }));
    assert.match(multi, /edit target unresolved\/ambiguous/);
    for (let i = 0; i < 2; i++) assert.equal(context(hook('pre-edit-impact', file, { old_string: 'return value * 9;' })), null, 'known supported-zero does not show the popular card');
    assert.equal(digest(f.baseline), before);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('R02: repeated edit text in different symbols stays ambiguous; explicit selector remains usable', async () => {
  const f = fixture({
    'access.mjs': 'export function first() {\n  return true;\n}\nexport function second() {\n  return true;\n}\n',
    'decision.mjs': 'import { first, second } from "./access.mjs";\nexport function decide() {\n  return first() && second();\n}\n',
  });
  try {
    await map(f);
    const file = join(f.root, 'access.mjs');
    assert.match(context(hook('pre-edit-impact', file, { old_string: 'return true;' })), /unresolved\/ambiguous/);
    assert.match(context(hook('pre-edit-impact', file, { symbol: 'access.mjs:second' })), /mapped edit target access\.mjs:second/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('R03: mapped corrupt/empty/failed extraction states are recoverable; unmapped/excluded/quiet cases stay silent', async () => {
  const f = fixture({ 'quiet.mjs': 'export function quiet(value) {\n  return value;\n}\n' });
  try {
    await map(f); writeFileSync(f.baseline, readFileSync(f.graph)); const before = digest(f.baseline), original = readFileSync(f.graph);
    const file = join(f.root, 'quiet.mjs');
    for (const name of ['pre-edit-impact', 'post-edit-diff']) assert.equal(context(hook(name, file)), null);
    for (const [bytes, reason] of [['{broken', 'invalid-map'], [JSON.stringify({ nodes: {}, edges: [] }), 'invalid-map'], [JSON.stringify({ nodes: [], edges: [] }), 'empty-map']]) {
      writeFileSync(f.graph, bytes);
      for (const name of ['pre-edit-impact', 'post-edit-diff']) {
        const r = hook(name, file), msg = context(r);
        assert.equal(r.status, 0);
        assert.match(msg, new RegExp(`mapped evidence unavailable \\(${reason}\\)`));
        assert.match(msg, /structural result unknown/);
        assert.match(msg, /codeweb_map.*preserve the original pre-edit baseline/);
        assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, undefined);
        assert.equal(context(hook(name, join(f.root, 'dist', 'generated.mjs'))), null);
        assert.equal(context(hook(name, join(f.root, 'generated', 'bindings.mjs'))), null);
      }
    }
    writeFileSync(f.graph, original);
    rmSync(file);
    const failed = hook('post-edit-diff', file);
    assert.equal(failed.status, 0);
    assert.match(context(failed), /extraction-failed/);
    assert.equal(failed.stderr, '');
    const refresh = cli('refresh.mjs', [f.graph, '--json']);
    assert.equal(refresh.status, 2, refresh.stderr);
    assert.match(refresh.stderr, /no supported source|no symbols/i);
    assert.equal(digest(f.baseline), before);
    rmSync(join(f.root, '.codeweb'), { recursive: true });
    for (const name of ['pre-edit-impact', 'post-edit-diff']) assert.equal(context(hook(name, file)), null, 'no map is outside hook scope');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('R05: graph-only and sidecar hooks expose stale/unknown freshness without rewriting the original baseline', async () => {
  const f = fixture(source);
  try {
    const g = await map(f); writeFileSync(f.baseline, readFileSync(f.graph)); const before = digest(f.baseline);
    const file = join(f.root, 'access.mjs');
    const fresh = context(hook('pre-edit-impact', file));
    assert.doesNotMatch(fresh, /map behind|freshness unknown/);
    writeFileSync(file, '// moved lines\n' + source['access.mjs']);
    const stale = context(hook('pre-edit-impact', file));
    assert.match(stale, /map behind/);
    assert.match(context(hook('pre-edit-impact', file, { old_string: 'return role === "owner";' })), /unresolved\/ambiguous/);
    rmSync(join(f.root, '.codeweb', 'index-lite.json')); rmSync(join(f.root, '.codeweb', 'stale-stamps.json'));
    assert.equal(context(hook('pre-edit-impact', file)), stale);
    const legacy = structuredClone(g); delete legacy.meta.sources;
    save(f, legacy, false);
    assert.match(context(hook('pre-edit-impact', file)), /freshness unknown/);
    assert.equal(digest(f.baseline), before);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('R03/R05: legacy sidecars fall back correctly and explicit generated roles stay quiet on both paths', async () => {
  const f = fixture({ ...source, 'codeweb.rules.json': JSON.stringify({ roles: [{ glob: 'access.mjs', role: 'generated' }] }) });
  try {
    await map(f);
    const file = join(f.root, 'access.mjs');
    for (const name of ['pre-edit-impact', 'post-edit-diff']) assert.equal(context(hook(name, file)), null, 'mapped generated-role file is excluded');
    const litePath = join(f.root, '.codeweb', 'index-lite.json'), baselinePath = join(f.root, '.codeweb', 'hook-baseline.json');
    const lite = JSON.parse(readFileSync(litePath)); delete lite.nodeCount;
    writeFileSync(litePath, JSON.stringify(lite));
    const baseline = JSON.parse(readFileSync(baselinePath));
    delete baseline.nodeCount; delete baseline.excludedFiles; delete baseline.analysisIncomplete;
    writeFileSync(baselinePath, JSON.stringify(baseline));
    for (const name of ['pre-edit-impact', 'post-edit-diff']) assert.equal(context(hook(name, file)), null, 'legacy sidecars retain graph-role exclusion');
    rmSync(join(f.root, 'codeweb.rules.json')); await map(f);
    const expected = context(hook('pre-edit-impact', file));
    const old = JSON.parse(readFileSync(litePath)); delete old.nodeCount;
    for (const entry of Object.values(old.files)) if (entry.card) delete entry.card.callerCount;
    writeFileSync(litePath, JSON.stringify(old));
    assert.equal(context(hook('pre-edit-impact', file)), expected, 'legacy lite fallback retains true omitted counts and file summary');
    const oldPost = JSON.parse(readFileSync(baselinePath)); delete oldPost.nodeCount; delete oldPost.excludedFiles; delete oldPost.analysisIncomplete;
    writeFileSync(baselinePath, JSON.stringify(oldPost));
    assert.equal(context(hook('post-edit-diff', file)), null, 'valid old baseline summary still produces an ordinary quiet check');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('R06: canonical and aliased handler entrypoints deliver the same Claude envelope; Codex-shaped payload stays unclaimed', async () => {
  const f = fixture(source);
  try {
    await map(f);
    const alias = join(f.root, 'hook-alias'); symlinkSync(join(PLUGIN_ROOT, 'hooks'), alias, process.platform === 'win32' ? 'junction' : 'dir');
    const file = join(f.root, 'access.mjs');
    const fields = { old_string: 'return role === "owner";' };
    assert.equal(hook('pre-edit-impact', file, fields, join(alias, 'pre-edit-impact.mjs')).stdout, hook('pre-edit-impact', file, fields).stdout);
    const sessionInput = JSON.stringify({ cwd: f.root });
    const canonical = run(join(PLUGIN_ROOT, 'hooks', 'session-brief.mjs'), [], sessionInput);
    const aliased = run(join(alias, 'session-brief.mjs'), [], sessionInput);
    assert.ok(canonical.stdout);
    assert.equal(aliased.stdout, canonical.stdout);
    rmSync(join(f.root, 'decision.mjs'));
    for (let i = 0; i < 7; i++) rmSync(join(f.root, `format${i}.mjs`));
    writeFileSync(file, source['access.mjs'].replace('return permit(role);', 'return true;'));
    const post = hook('post-edit-diff', file);
    assert.match(context(post), /lost all callers/);
    rmSync(join(f.root, '.codeweb', 'flagged.json'), { force: true });
    assert.equal(hook('post-edit-diff', file, {}, join(alias, 'post-edit-diff.mjs')).stdout, post.stdout);
    const codex = run(join(PLUGIN_ROOT, 'hooks', 'pre-edit-impact.mjs'), [], JSON.stringify({ tool_name: 'apply_patch', tool_input: { command: '*** Begin Patch\n*** Update File: ' + file + '\n@@\n-return true;\n+return false;\n*** End Patch' } }));
    assert.equal(codex.stdout, '', 'the shipped Claude adapter does not assert Codex runtime support');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('R07: unsupported optional ctags stderr stays quiet while genuine extraction failures stay observable', async () => {
  const f = fixture({ 'quiet.mjs': 'export function quiet(value) {\n  return value;\n}\n' });
  try {
    await map(f);
    const bin = join(f.root, 'tools'); mkdirSync(bin);
    const shim = join(bin, 'ctags');
    writeFileSync(shim, '#!/bin/sh\necho "ctags: illegal option -- version; usage: ctags" >&2\nexit 1\n'); chmodSync(shim, 0o755);
    // Windows cannot exec a shebang accelerator. An isolated PATH covers its
    // unavailable-tool fallback; the Unix condition actually emits usage stderr.
    const extra = { PATH: process.platform === 'win32' ? bin : bin + delimiter + process.env.PATH };
    for (let i = 0; i < 2; i++) {
      const r = run(join(PLUGIN_ROOT, 'hooks', 'post-edit-diff.mjs'), [], JSON.stringify({ tool_input: { file_path: join(f.root, 'quiet.mjs') } }), extra);
      assert.equal(r.status, 0); assert.equal(r.stdout, ''); assert.equal(r.stderr, '');
    }
    const extracted = run(script('extract-symbols.mjs'), [f.root, '--engine', 'regex'], undefined, extra);
    assert.equal(extracted.status, 0);
    assert.equal(JSON.parse(extracted.stdout).meta.engine, 'regex');
    assert.doesNotMatch(extracted.stderr, /illegal option|usage: ctags/);
    rmSync(join(f.root, 'quiet.mjs'));
    const failed = run(script('extract-symbols.mjs'), [f.root, '--engine', 'regex'], undefined, extra);
    assert.equal(failed.status, 1, 'direct extractor preserves its existing no-source exit');
    assert.match(failed.stderr, /no supported source/);
    const after = run(join(PLUGIN_ROOT, 'hooks', 'post-edit-diff.mjs'), [], JSON.stringify({ tool_input: { file_path: join(f.root, 'quiet.mjs') } }), extra);
    assert.match(context(after), /extraction-failed/);
    assert.doesNotMatch(after.stderr, /usage: ctags/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
