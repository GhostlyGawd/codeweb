// File-target regression boundaries for CLI and MCP; also runnable on installed packages.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, rmSync, symlinkSync, readFileSync, readdirSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const pkg = resolve(process.env.CODEWEB_TEST_PACKAGE || '.');
const scratch = process.env.PAPERCLIP_RUN_SCRATCH_DIR || tmpdir();
const source = 'export function greet() {\n  return "hello";\n}\n';
function fixture(fn) {
  const dir = mkdtempSync(join(scratch, 'cod24-target-'));
  writeFileSync(join(dir, 'app.js'), source);
  try { fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
function invoke(bin, args, dir, input, env = {}) {
  const r = spawnSync(process.execPath, [join(pkg, 'bin', bin), ...args], {
    cwd: dir, input, encoding: 'utf8', timeout: 30000,
    env: { ...process.env, CODEWEB_NO_STATS: '1', CODEWEB_NO_PROMO: '1', CODEWEB_MCP_TRACE: '1', ...env },
  });
  assert.ifError(r.error); return r;
}
function diagnostic(text) {
  assert.match(text, /not a directory/i);
  assert.match(text, /app\.js|file-link/);
  assert.match(text, /directory|code root/i);
  assert.match(text, /pass|point|use|choose/i, 'provide a recovery action');
  assert.doesNotMatch(text, /\bat (?:file:|mkdirSync|ModuleJob)|node:fs:|ENOTDIR|\[run\] extract/);
}
for (const customOut of [false, true]) test(`ac_28 CLI file-target boundary (explicit output ${customOut})`, () => fixture(dir => {
  const before = readdirSync(dir).sort();
  const out = join(dir, 'new-output');
  const r = invoke('codeweb.mjs', ['app.js', ...(customOut ? ['--out-dir', out] : [])], dir);
  if (customOut) {
    assert.equal(r.status, 0, r.stderr); assert.ok(existsSync(join(out, 'graph.json'))); return;
  }
  assert.equal(r.status, 2); assert.equal(r.stdout, ''); diagnostic(r.stderr);
  assert.deepEqual(readdirSync(dir).sort(), before, 'rejected input must not create workspace or other fixture files');
  assert.equal(existsSync(out), false); assert.equal(existsSync(join(dir, '.codeweb')), false);
  assert.equal(readFileSync(join(dir, 'app.js'), 'utf8'), source);
}));
test('ac_28 CLI rejects file symlinks and preserves missing-target exit 2', () => fixture(dir => {
  symlinkSync(join(dir, 'app.js'), join(dir, 'file-link'));
  const r = invoke('codeweb.mjs', ['file-link'], dir);
  assert.equal(r.status, 2); diagnostic(r.stderr);
  assert.equal(invoke('codeweb.mjs', ['missing'], dir).status, 2);
}));
for (const customOut of [false, true]) test(`ac_29 MCP file-target boundary (explicit output ${customOut})`, () => fixture(dir => {
  const before = readdirSync(dir).sort();
  const out = join(dir, 'new-output');
  const requests = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'cod24-acceptance', version: '1' } } },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'codeweb_map', arguments: { target: 'app.js', ...(customOut ? { out } : {}) } } },
  ];
  const r = invoke('codeweb-mcp.mjs', [], dir, requests.map(x => JSON.stringify(x)).join('\n')+'\n');
  assert.equal(r.status, 0);
  const result = r.stdout.trim().split('\n').map(x => JSON.parse(x)).find(x => x.id === 2)?.result;
  if (customOut) {
    assert.notEqual(result?.isError, true); assert.equal(JSON.parse(result.content[0].text).ok, true);
    assert.match(r.stderr, /"ev":"start"/, 'trace must observe the successful child');
    assert.ok(existsSync(join(out, 'graph.json'))); return;
  }
  assert.equal(r.stderr, '', 'invalid target must not enqueue/start a child or emit pipeline progress');
  assert.equal(result?.isError, true); diagnostic(result.content.map(x => x.text || '').join('\n'));
  assert.deepEqual(readdirSync(dir).sort(), before, 'rejected input must not create workspace or other fixture files');
  assert.equal(existsSync(out), false); assert.equal(readFileSync(join(dir, 'app.js'), 'utf8'), source);
}));
test('ac_28 supported directory and directory symlink remain mappable', () => fixture(dir => {
  symlinkSync(dir, join(dir, 'directory-link'));
  const r = invoke('codeweb.mjs', ['directory-link'], dir);
  assert.equal(r.status, 0, r.stderr);
  const graph = JSON.parse(readFileSync(join(dir, '.codeweb/graph.json'), 'utf8'));
  assert.ok(graph.nodes.some(n => n.label === 'greet'));
  assert.ok(existsSync(join(dir, '.codeweb/report.html')));
}));

// Restrict child discovery to a private PATH: optional npm dependencies do not
// control OS tools. Exercise both ENOENT and a native executable returning failure.
for (const discovery of ['absent', 'failed']) {
  for (const transport of ['CLI', 'MCP']) {
    for (const target of ['app.js', '.']) {
      test(`ac_${transport === 'CLI' ? 28 : 29} ${transport} fallback ${discovery} tools target ${target}`, (t) => fixture(dir => {
        const bin = join(dir, 'tools'); mkdirSync(bin);
        symlinkSync(process.execPath, join(bin, 'node'));
        if (discovery === 'failed') {
          // A native executable works with execFile on Windows too; shell scripts
          // and .cmd files do not. Node rejects rg's --files option before parsing.
          if (process.platform === 'win32') copyFileSync(process.execPath, join(bin, 'rg.exe'));
          else symlinkSync(process.execPath, join(bin, 'rg')); // preserve loader-relative libraries
        }
        const env = { PATH: bin, CODEWEB_ENGINE: 'regex' };
        let calibration;
        if (discovery === 'failed') {
          // Independently calibrate the exact command used by listFiles. A failed
          // spawn (including ENOENT) must never masquerade as an executable failure.
          calibration = spawnSync('rg', ['--files', resolve(dir, target)], { cwd: dir, env, encoding: 'utf8' });
          assert.ifError(calibration.error);
          assert.equal(calibration.signal, null);
          assert.ok(Number.isInteger(calibration.status) && calibration.status !== 0);
          assert.match(calibration.stderr, /bad option: --files/);
          t.diagnostic(JSON.stringify({ discovery, target, executable: process.platform === 'win32' ? 'rg.exe' : 'rg', status: calibration.status, stderr: calibration.stderr.trim() }));
        }
        assert.equal(spawnSync('ctags', ['--version'], { env }).error?.code, 'ENOENT');
        if (discovery === 'absent') assert.equal(spawnSync('rg', ['--version'], { env }).error?.code, 'ENOENT');
        const out = join(dir, '.codeweb');
        let r;
        if (transport === 'CLI') {
          r = invoke('codeweb.mjs', [target, '--out-dir', out], dir, undefined, env);
          assert.equal(r.status, 0, r.stderr);
        } else {
          const requests = [
            { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'fallback-regression', version: '1' } } },
            { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'codeweb_map', arguments: { target, out } } },
          ];
          r = invoke('codeweb-mcp.mjs', [], dir, requests.map(x => JSON.stringify(x)).join('\n')+'\n', env);
          assert.equal(r.status, 0, r.stderr);
          const result = r.stdout.trim().split('\n').map(JSON.parse).find(x => x.id === 2)?.result;
          assert.notEqual(result?.isError, true, JSON.stringify(result));
          assert.equal(JSON.parse(result.content[0].text).ok, true);
        }
        const graph = JSON.parse(readFileSync(join(out, 'graph.json'), 'utf8'));
        assert.ok(graph.nodes.some(n => n.label === 'greet'));
        assert.equal(readFileSync(join(dir, 'app.js'), 'utf8'), source);
        if (discovery === 'failed') assert.match(calibration.stderr, /--files/);
      }));
    }
  }
}
