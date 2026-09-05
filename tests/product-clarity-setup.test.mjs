import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, script, tmpDir, cleanup, writeTree } from './helpers.mjs';

const call = (name, args, cwd) => runNode(script(name), args, { cwd, env: { ...process.env, CODEWEB_WS: '' } });
const check = (report, name) => report.checks.find(c => c.name === name);

test('AC-15 setup prints one canonical recipe for all five clients without writing config', async () => {
  const { clientRecipes } = await import('../scripts/lib/client-setup.mjs');
  assert.equal(clientRecipes.length, 5);
  const dir = tmpDir('codeweb-setup-');
  try {
    for (const recipe of clientRecipes) {
      const r = call('setup.mjs', ['--client', recipe.id, '--json'], dir);
      assert.equal(r.status, 0, r.stderr);
      const data = JSON.parse(r.stdout);
      assert.equal(data.recipe.content, recipe.content);
      assert.equal(data.written, false);
    }
    assert.equal(existsSync(join(dir, '.mcp.json')), false);
    assert.equal(call('setup.mjs', ['--client', 'missing'], dir).status, 2);
  } finally { cleanup(dir); }
});

test('AC-15 doctor checks local handshake and fresh map, then rejects stale or unknown freshness', () => {
  const dir = tmpDir('codeweb-doctor-');
  try {
    writeTree(dir, { 'src/a.js': 'export function add(a, b) { return a + b; }\nexport function twice(x) { return add(x, x); }\n' });
    const ws = join(dir, '.codeweb');
    const mapped = call('run.mjs', [join(dir, 'src'), '--out-dir', ws], dir);
    assert.equal(mapped.status, 0, mapped.stderr);
    const callers = call('query.mjs', [join(ws, 'graph.json'), '--callers', 'add', '--json'], dir);
    assert.equal(callers.status, 0, callers.stderr);
    assert.match(callers.stdout, /twice/);
    const good = call('doctor.mjs', ['--json'], dir);
    assert.equal(good.status, 0, good.stdout + good.stderr);
    const report = JSON.parse(good.stdout);
    assert.equal(report.ok, true);
    for (const name of ['runtime', 'server', 'graph', 'freshness']) assert.equal(check(report, name).status, 'pass');
    assert.equal(check(report, 'editor').status, 'unknown');
    assert.match(check(report, 'editor').message, /unverified/);
    writeFileSync(join(dir, 'src/a.js'), 'export function changed() {}\n');
    const stale = call('doctor.mjs', ['--json'], dir);
    assert.equal(stale.status, 2);
    assert.equal(check(JSON.parse(stale.stdout), 'freshness').status, 'fail');
    const gp = join(ws, 'graph.json');
    const graph = JSON.parse(readFileSync(gp, 'utf8')); delete graph.meta.sources;
    writeFileSync(gp, JSON.stringify(graph));
    const unknown = call('doctor.mjs', ['--json'], dir);
    assert.equal(unknown.status, 2);
    assert.equal(check(JSON.parse(unknown.stdout), 'freshness').status, 'unknown');
  } finally { cleanup(dir); }
});

test('AC-15 doctor checks only explicit config, never executes or prints its values', async () => {
  const { clientRecipes } = await import('../scripts/lib/client-setup.mjs');
  const dir = tmpDir('codeweb-doctor-config-');
  try {
    const missing = call('doctor.mjs', ['--json'], dir);
    assert.equal(missing.status, 2);
    assert.equal(check(JSON.parse(missing.stdout), 'graph').status, 'fail');
    for (const recipe of clientRecipes) {
      const file = join(dir, 'config'); writeFileSync(file, recipe.content);
      const r = call('doctor.mjs', ['--json', '--client', recipe.id, '--config', file], dir);
      assert.equal(check(JSON.parse(r.stdout), 'configuration').status, 'pass', r.stdout);
    }
    const file = join(dir, 'config');
    writeFileSync(file, JSON.stringify({mcpServers:{codeweb:{command:'SECRET_EXECUTABLE',args:['SECRET_VALUE']}}}));
    const bad = call('doctor.mjs', ['--json', '--client', 'cursor', '--config', file], dir);
    assert.equal(bad.status, 2); assert.doesNotMatch(bad.stdout + bad.stderr, /SECRET_/);
    assert.equal(check(JSON.parse(bad.stdout), 'configuration').status, 'fail');
    assert.equal(call('doctor.mjs', ['--client', 'cursor'], dir).status, 2);
    const marker = join(dir, 'executed');
    writeFileSync(file, JSON.stringify({mcpServers:{codeweb:{command:process.execPath,args:['-e',`require('fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`]}}}));
    const dangerous = call('doctor.mjs', ['--json', '--client', 'cursor', '--config', file], dir);
    assert.equal(check(JSON.parse(dangerous.stdout), 'server').status, 'pass');
    assert.equal(existsSync(marker), false);
    writeFileSync(file, '{ invalid SECRET_VALUE');
    const malformed = call('doctor.mjs', ['--json', '--client', 'cursor', '--config', file], dir);
    assert.doesNotMatch(malformed.stdout + malformed.stderr, /SECRET_/);
    assert.equal(check(JSON.parse(malformed.stdout), 'configuration').status, 'fail');
  } finally { cleanup(dir); }
});

test('AC-15 doctor handles initialization timeout with bounded child cleanup', () => {
  const dir = tmpDir('codeweb-doctor-timeout-');
  try {
    writeTree(dir, {'fault.cjs': `const cp = require('node:child_process');
const original = cp.spawnSync;
cp.spawnSync = function(command, args, options) {
 if (args && args[0] && args[0].endsWith(require('node:path').sep + 'mcp-server.mjs')) {
  if (options.timeout !== 8000 || options.killSignal !== 'SIGKILL') throw new Error('unbounded child');
  return {status:null,signal:'SIGKILL',error:{code:'ETIMEDOUT'},stdout:''};
 }
 return original(command,args,options);
};
require('node:module').syncBuiltinESMExports();`});
    const r = runNode(script('doctor.mjs'), ['--json'], {cwd:dir,env:{CODEWEB_WS:'',NODE_OPTIONS:`--require=${JSON.stringify(join(dir,'fault.cjs'))}`}});
    assert.equal(r.status,2,r.stderr);
    assert.equal(check(JSON.parse(r.stdout),'server').status,'fail');
    assert.match(check(JSON.parse(r.stdout),'server').message,/timed out/);
  } finally { cleanup(dir); }
});
