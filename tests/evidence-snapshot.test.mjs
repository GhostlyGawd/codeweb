import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, statSync, utimesSync, symlinkSync, readdirSync, cpSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { captureSnapshot } from '../scripts/lib/evidence-snapshot.mjs';
import { buildContextPack } from '../scripts/lib/context-core.mjs';
import { buildIndex } from '../scripts/lib/graph-ops.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'cw-evidence-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'helper.js'), 'export function helper() { return 1; }\n');
  writeFileSync(join(root, 'caller.js'), 'import { helper } from "./helper.js";\nexport function caller() { return helper(); }\n');
  return root;
}

test('ac_31: snapshot detects new source, preserved-stamp bytes, rules and manifest separately', async t => {
  const root = fixture(t), before = await captureSnapshot(root);
  const p = join(root, 'helper.js'), st = statSync(p);
  writeFileSync(p, readFileSync(p, 'utf8').replace('return 1', 'return 2'));
  utimesSync(p, st.atime, st.mtime);
  const bytes = await captureSnapshot(root);
  assert.notEqual(bytes.inventoryDigest, before.inventoryDigest);
  assert.notEqual(bytes.sourceHashes['helper.js'], before.sourceHashes['helper.js']);
  writeFileSync(join(root, 'new.js'), 'import { helper } from "./helper.js";\nfunction another() { return helper(); }\n');
  const added = await captureSnapshot(root);
  assert.ok(added.graph.nodes.some(n => n.label === 'another'));
  assert.notEqual(added.inventoryDigest, bytes.inventoryDigest);
  writeFileSync(join(root, 'package.json'), '{"name":"fixture"}');
  const manifest = await captureSnapshot(root);
  assert.notEqual(manifest.inventoryDigest, added.inventoryDigest);
  assert.equal(manifest.optionsDigest, added.optionsDigest);
  writeFileSync(join(root, 'codeweb.rules.json'), '{"roles":[]}');
  assert.notEqual((await captureSnapshot(root)).optionsDigest, manifest.optionsDigest);
});

test('isolated snapshot ignores ignore contents, excludes artifact store and performs no writes', async t => {
  const root = fixture(t);
  writeFileSync(join(root, '.gitignore'), 'caller.js\n');
  mkdirSync(join(root, '.codeweb'));
  writeFileSync(join(root, '.codeweb', 'graph.json'), '{"baseline":"preserve"}');
  const before = await captureSnapshot(root);
  assert.ok(before.graph.nodes.some(n => n.file === 'caller.js'));
  writeFileSync(join(root, '.gitignore'), 'helper.js\n');
  writeFileSync(join(root, '.codeweb', 'ignored.js'), 'function shouldNotExist() {}');
  const after = await captureSnapshot(root);
  assert.equal(before.inventoryDigest, after.inventoryDigest);
  assert.equal(before.analyzerIdentity.runtimeDigest, after.analyzerIdentity.runtimeDigest);
  assert.equal(readFileSync(join(root, '.codeweb', 'graph.json'), 'utf8'), '{"baseline":"preserve"}');
  assert.deepEqual(readdirSync(join(root, '.codeweb')).sort(), ['graph.json', 'ignored.js']);
  assert.equal(after.profile, 'native-regex-snapshot-v1');
  assert.equal(after.graph.meta.engine, 'regex');
});

test('ABA source change during extraction derives only captured bytes', async t => {
  const root = fixture(t), p = join(root, 'helper.js'), original = readFileSync(p);
  const before = await captureSnapshot(root);
  const result = await captureSnapshot(root, {
    beforeExtract() { writeFileSync(p, 'export function replaced() { return 9; }\n'); },
    afterExtract() { writeFileSync(p, original); },
  });
  assert.equal(result.inventoryDigest, before.inventoryDigest);
  assert.deepEqual(result.graph, before.graph);
});

test('one changed-source retry is allowed; repeated changes fail explicitly', async t => {
  const root = fixture(t);
  let count = 0;
  const result = await captureSnapshot(root, { beforeExtract() {
    if (++count === 1) writeFileSync(join(root, 'later.js'), 'function later() {}\n');
  } });
  assert.equal(count, 2);
  assert.ok(result.graph.nodes.some(n => n.label === 'later'));
  await assert.rejects(captureSnapshot(root, { beforeExtract({ attempt }) {
    writeFileSync(join(root, 'helper.js'), `export function helper() { return ${attempt + 3}; }\n`);
  } }), e => e.code === 'source-changing');
});

test('eligible source and directory symlinks are rejected without following them', async t => {
  const root = fixture(t);
  symlinkSync(join(root, 'helper.js'), join(root, 'linked.js'));
  await assert.rejects(captureSnapshot(root), e => e.code === 'unsupported-source-layout');
  rmSync(join(root, 'linked.js'));
  symlinkSync(root, join(root, 'loop'));
  await assert.rejects(captureSnapshot(root), e => e.code === 'unsupported-source-layout');
});

test('source deletion, hidden source and nested package boundary membership are captured', async t => {
  const root = fixture(t);
  writeFileSync(join(root, '.hidden.js'), 'function hidden() {}\n');
  mkdirSync(join(root, 'nested'));
  writeFileSync(join(root, 'nested', 'Cargo.toml'), '[package]\nname="nested"\n');
  writeFileSync(join(root, 'nested', 'use.js'), 'function nested() {}\n');
  const before = await captureSnapshot(root);
  assert.ok(before.graph.nodes.some(n => n.file === '.hidden.js'));
  rmSync(join(root, 'caller.js'));
  const after = await captureSnapshot(root);
  assert.notEqual(before.inventoryDigest, after.inventoryDigest);
  assert.ok(!after.graph.nodes.some(n => n.file === 'caller.js'));
});

test('snapshot derivation ignores ambient engine and legacy fallback toggles', async t => {
  const root = fixture(t);
  writeFileSync(join(root, 'a.js'), 'function duplicate() {}\n');
  writeFileSync(join(root, 'b.js'), 'function duplicate() {}\n');
  writeFileSync(join(root, 'use.js'), 'function use() { duplicate(); }\n');
  const baseline = await captureSnapshot(root);
  const priorEngine = process.env.CODEWEB_ENGINE, priorLegacy = process.env.CODEWEB_LEGACY_FALLBACK;
  try {
    process.env.CODEWEB_ENGINE = 'invalid-ambient-engine';
    process.env.CODEWEB_LEGACY_FALLBACK = '1';
    const result = await captureSnapshot(root);
    assert.deepEqual(result.graph, baseline.graph);
  } finally {
    if (priorEngine === undefined) delete process.env.CODEWEB_ENGINE; else process.env.CODEWEB_ENGINE = priorEngine;
    if (priorLegacy === undefined) delete process.env.CODEWEB_LEGACY_FALLBACK; else process.env.CODEWEB_LEGACY_FALLBACK = priorLegacy;
  }
});

test('snapshot exclusions are relative to target, not a parent directory name', async t => {
  const root = fixture(t), target = join(root, 'build');
  mkdirSync(target);
  writeFileSync(join(target, 'entry.js'), 'function entry() {}\n');
  const snapshot = await captureSnapshot(target);
  assert.ok(snapshot.graph.nodes.some(n => n.label === 'entry'));
});

test('rules and package resolution also use immutable bytes during ABA changes', async t => {
  const root = fixture(t), rules = join(root, 'codeweb.rules.json'), pkg = join(root, 'package.json');
  writeFileSync(rules, '{"roles":[]}');
  writeFileSync(pkg, '{"name":"snapshot","main":"helper.js"}');
  const baseline = await captureSnapshot(root);
  const snapshot = await captureSnapshot(root, {
    beforeExtract() { writeFileSync(rules, 'not JSON'); writeFileSync(pkg, '{"name":"snapshot","main":"caller.js"}'); },
    afterExtract() { writeFileSync(rules, '{"roles":[]}'); writeFileSync(pkg, '{"name":"snapshot","main":"helper.js"}'); },
  });
  assert.deepEqual(snapshot.graph, baseline.graph);
  assert.equal(snapshot.optionsDigest, baseline.optionsDigest);
});

test('snapshot source reader serves shared caller windows from captured bytes after live edits', async t => {
  const root = fixture(t), snapshot = await captureSnapshot(root);
  writeFileSync(join(root, 'caller.js'), 'function unrelated() { return 99; }\n');
  const target = snapshot.graph.nodes.find(n => n.label === 'helper');
  const pack = buildContextPack(snapshot.graph, buildIndex(snapshot.graph), snapshot.sourceReader, [target.id], { symbol: 'helper', limit: null, staleInfo: null });
  assert.equal(pack.sourceAvailable, true);
  assert.equal(pack.callers[0].windowEvidence.status, 'shown');
  assert.match(pack.callers[0].windows[0].text, /return helper\(\)/);
  const lines = snapshot.sourceReader.linesOf('caller.js');
  lines[1] = 'mutated outside';
  assert.match(snapshot.sourceReader.linesOf('caller.js')[1], /return helper\(\)/);
  assert.equal(snapshot.sourceReader.linesOf('../outside.js'), null);
  assert.equal(snapshot.sourceReader.linesOf('missing.js'), null);
});

test('loaded analyzer identity rejects later runtime replacement; fresh process captures new identity', async t => {
  const root = fixture(t), runtime = join(root, '.codeweb', 'runtime'), scripts = join(runtime, 'scripts');
  mkdirSync(scripts, { recursive: true });
  const originals = fileURLToPath(new URL('../scripts/', import.meta.url));
  cpSync(join(originals, 'lib'), join(scripts, 'lib'), { recursive: true });
  for (const name of ['extract-symbols.mjs', 'context-pack.mjs', 'review.mjs']) cpSync(join(originals, name), join(scripts, name));
  const entry = pathToFileURL(join(scripts, 'lib', 'evidence-snapshot.mjs')).href;
  const { captureSnapshot: isolatedCapture } = await import(entry);
  const old = await isolatedCapture(root);
  appendFileSync(join(scripts, 'lib', 'lang-rules.mjs'), '\n// disposable runtime revision\n');
  await assert.rejects(isolatedCapture(root), e => e.code === 'analysis-incompatible');
  const fresh = spawnSync(process.execPath, ['--input-type=module', '-e',
    'const {captureSnapshot}=await import(process.argv[1]);const s=await captureSnapshot(process.argv[2]);process.stdout.write(s.analyzerIdentity.runtimeDigest);', entry, root], { encoding: 'utf8' });
  assert.equal(fresh.status, 0, fresh.stderr);
  assert.match(fresh.stdout, /^[a-f0-9]{64}$/);
  assert.notEqual(fresh.stdout, old.analyzerIdentity.runtimeDigest);
});
