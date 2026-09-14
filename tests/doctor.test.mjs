import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { diagnoseSetup } from '../scripts/doctor.mjs';
import { tmpDir, cleanup, runNode, script, PLUGIN_ROOT } from './helpers.mjs';

test('ac_24: diagnostics from the installed front door are read-only and name exact missing-map repair arguments', () => {
  const root = tmpDir('cw-doctor-');
  try {
    const r = runNode(join(PLUGIN_ROOT, 'bin/codeweb.mjs'), [root, '--doctor', '--json'], { env: { CODEWEB_WS: '' } });
    assert.equal(r.status, 2, r.stderr);
    const p = JSON.parse(r.stdout);
    assert.equal(p.graph.status, 'missing');
    assert.equal(p.installation.root, PLUGIN_ROOT);
    assert.equal(p.installation.version, JSON.parse(readFileSync(join(PLUGIN_ROOT, 'package.json'), 'utf8')).version);
    assert.ok(p.installation.entrypoint.endsWith('bin/codeweb.mjs'));
    assert.equal(p.parsers.regex, true);
    assert.equal(p.parsers.probeOnly, true);
    assert.deepEqual(p.issues.find((i) => i.code === 'graph-missing').command, [process.execPath, script('run.mjs'), root]);
    assert.deepEqual(readdirSync(root), [], 'doctor never creates a workspace');
  } finally { cleanup(root); }
});

test('ac_24: diagnostics distinguish stale, unstamped, invalid, and unavailable-source graphs without changing them', () => {
  const root = tmpDir('cw-doctor-states-');
  try {
    const path = join(root, 'graph.json'), file = join(root, 'a.js');
    writeFileSync(file, 'function a() {}');
    const st = statSync(file);
    const g = { meta: { root, engine: 'regex', sources: { 'a.js': { s: st.size, m: Math.round(st.mtimeMs) } } }, nodes: [{ id: 'a.js:a' }], edges: [] };
    writeFileSync(path, JSON.stringify(g));
    let p = diagnoseSetup({ cwd: root, graphPath: path });
    assert.equal(p.graph.freshness, 'unchanged-stamps'); assert.equal(p.ok, true);
    writeFileSync(file, 'function a() { return 42; }');
    p = diagnoseSetup({ cwd: root, graphPath: path });
    assert.equal(p.graph.freshness, 'stale');
    assert.deepEqual(p.issues.find((i) => i.code === 'graph-stale').command, [process.execPath, script('refresh.mjs'), path]);
    assert.equal(readFileSync(path, 'utf8'), JSON.stringify(g));
    delete g.meta.sources; writeFileSync(path, JSON.stringify(g));
    assert.equal(diagnoseSetup({ cwd: root, graphPath: path }).graph.freshness, 'unknown');
    g.meta.root = join(root, 'missing'); writeFileSync(path, JSON.stringify(g));
    assert.ok(diagnoseSetup({ cwd: root, graphPath: path }).issues.some((i) => i.code === 'source-unavailable'));
    writeFileSync(path, '{bad');
    assert.equal(diagnoseSetup({ cwd: root, graphPath: path }).graph.status, 'invalid');
    assert.equal(readFileSync(path, 'utf8'), '{bad');
  } finally { cleanup(root); }
});

test('ac_24: directory discovery and explicit workspace override are visible', () => {
  const root = tmpDir('cw-doctor-discovery-');
  try {
    const ws = join(root, '.codeweb'); mkdirSync(ws);
    const nested = join(root, 'src'); mkdirSync(nested);
    writeFileSync(join(ws, 'graph.json'), JSON.stringify({ meta: { root }, nodes: [{ id: 'a' }], edges: [] }));
    let r = runNode(script('doctor.mjs'), [nested, '--json'], { env: { CODEWEB_WS: '' } });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).graph.path, join(ws, 'graph.json'));
    r = runNode(script('doctor.mjs'), [nested, '--json'], { env: { CODEWEB_WS: join(root, 'wrong') } });
    assert.equal(r.status, 2);
    assert.equal(JSON.parse(r.stdout).graph.path, join(root, 'wrong', 'graph.json'));
  } finally { cleanup(root); }
});
