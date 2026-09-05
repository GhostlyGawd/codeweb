// Spec J (docs/specs/reach-surfaces.md): the npm package is publish-ready — reach beyond the
// Claude plugin marketplace to every MCP client (`npx codeweb`, `codeweb-mcp`).
//
// P1: manifest shape — not private, bins exist with shebangs, files whitelist entries exist,
//     zero runtime dependencies (the standing stance).
// P2: `npm pack --dry-run` (offline) ships the engine + plugin surfaces and none of the
//     repo-only trees (bench/site/docs/tests).
// P3: the real packed artifact installs offline without optional dependencies, and every
//     installed bin answers --help.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { PLUGIN_ROOT, cleanup, tmpDir, writeTree, fixtureGitIdentity } from './helpers.mjs';

const pkg = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'package.json'), 'utf8'));

test('P1: manifest is publishable — bins, files, no runtime deps, not private', () => {
  assert.ok(!pkg.private, 'private flag removed');
  assert.ok(pkg.publishConfig?.access === 'public');
  for (const [name, rel] of Object.entries(pkg.bin || {})) {
    const p = join(PLUGIN_ROOT, rel);
    assert.ok(existsSync(p), `bin ${name} -> ${rel} exists`);
    assert.match(readFileSync(p, 'utf8').slice(0, 30), /^#!\/usr\/bin\/env node/, `${rel} carries a shebang`);
  }
  assert.ok(Object.keys(pkg.bin || {}).includes('codeweb-mcp'), 'the MCP server ships as a bin for non-Claude clients');
  // Negation entries (ADR-0001c: "!scripts/check" keeps harness files out of the tarball)
  // must point at a real path too — a negation for a ghost file is a manifest bug.
  for (const f of pkg.files || []) {
    const rel = f.startsWith('!') ? f.slice(1) : f;
    assert.ok(existsSync(join(PLUGIN_ROOT, rel)), `files entry exists: ${f}`);
  }
  assert.deepEqual(pkg.dependencies || {}, {}, 'zero runtime dependencies — the stance holds');
  assert.ok(pkg.optionalDependencies?.['web-tree-sitter'], 'the AST tier stays optional');
});

test('P2: npm pack ships engine + plugin surfaces, excludes repo-only trees', () => {
  // Platform-honest spawn: on windows npm is npm.cmd — a bare 'npm' is ENOENT (status null), and
  // .cmd files need a shell since Node's CVE-2024-27980 hardening. Assertions unchanged.
  const WIN = process.platform === 'win32';
  const r = spawnSync(WIN ? 'npm.cmd' : 'npm', ['pack', '--dry-run', '--json'], { cwd: PLUGIN_ROOT, encoding: 'utf8', maxBuffer: 1 << 26, shell: WIN });
  assert.equal(r.status, 0, r.stderr);
  const files = JSON.parse(r.stdout)[0].files.map((f) => f.path);
  for (const must of ['scripts/mcp-server.mjs', 'scripts/run.mjs', 'scripts/extract-symbols.mjs', '.claude-plugin/plugin.json', 'hooks/hooks.json', 'LICENSE', 'README.md']) {
    assert.ok(files.includes(must), `tarball carries ${must}`);
  }
  for (const banned of ['bench/', 'site/', 'docs/', 'tests/', 'assets/', 'spike/']) {
    assert.ok(!files.some((f) => f.startsWith(banned)), `tarball excludes ${banned}`);
  }
  // ADR-0001c: the harness layer is dev tooling — nothing shell/Python ships in the
  // "zero deps, runs 100% locally" package.
  for (const harness of ['scripts/check', 'scripts/spec_lint.py', 'scripts/hook-check', 'scripts/hook-protect']) {
    assert.ok(!files.includes(harness), `tarball excludes harness file ${harness}`);
  }
});

test('P3: packed release installs offline and each installed bin answers --help', () => {
  const packDir = tmpDir('codeweb-pack-');
  const prefix = tmpDir('codeweb-install-');
  const WIN = process.platform === 'win32';
  const npm = WIN ? 'npm.cmd' : 'npm';
  const spawnOptions = {
    cwd: PLUGIN_ROOT,
    encoding: 'utf8',
    maxBuffer: 1 << 26,
    shell: WIN,
    env: {
      ...process.env,
      npm_config_audit: 'false',
      npm_config_fund: 'false',
    },
  };

  try {
    const packed = spawnSync(
      npm,
      ['pack', '--json', '--pack-destination', packDir],
      spawnOptions,
    );
    assert.equal(packed.status, 0, packed.stderr);
    const tarball = join(packDir, JSON.parse(packed.stdout)[0].filename);

    const installed = spawnSync(
      npm,
      [
        'install',
        '--offline',
        '--ignore-scripts',
        '--omit=optional',
        '--no-audit',
        '--no-fund',
        '--prefix',
        prefix,
        tarball,
      ],
      spawnOptions,
    );
    assert.equal(installed.status, 0, installed.stderr);

    for (const name of Object.keys(pkg.bin || {})) {
      const installedBin = join(
        prefix,
        'node_modules',
        '.bin',
        WIN ? `${name}.cmd` : name,
      );
      const help = spawnSync(installedBin, ['--help'], {
        ...spawnOptions,
        cwd: prefix,
      });
      assert.equal(
        help.status,
        0,
        `${name} --help failed after offline installation\n${help.stderr}`,
      );
    }
    // P3 exercises the shipped package entry, outside the checkout and without optional deps.
    const project = join(prefix, 'fixture');
    const body = 'export function compute(x) {\n let total = 0;\n for (let i = 0; i < x; i++) {\n  if (i % 2) total += i * 3;\n  else total -= i;\n }\n const scaled = total * 2 + 7;\n return scaled > 100 ? scaled - 100 : scaled;\n}\n';
    writeTree(project, {'src/a.js': body, 'src/caller.js': 'import { compute } from "./a.js";\nexport function caller(x) { return compute(x); }\n'});
    const bin = join(prefix, 'node_modules', '.bin', WIN ? 'codeweb.cmd' : 'codeweb');
    const run = (...args) => spawnSync(bin, args, {...spawnOptions, cwd: project, env: {...spawnOptions.env, CODEWEB_WS: ''}});
    for (const client of ['claude','cursor','windsurf','gemini','codex']) {
      const result = run('setup','--client',client,'--json');
      assert.equal(result.status,0,result.stderr);
      const setup = JSON.parse(result.stdout);
      assert.equal(setup.recipe.id,client); assert.equal(setup.written,false);
    }
    const mapped = run('src','--out-dir','.codeweb','--json');
    assert.equal(mapped.status,0,mapped.stderr);
    const diagnosis = run('doctor','--json');
    assert.equal(diagnosis.status,0,diagnosis.stdout + diagnosis.stderr);
    const health = JSON.parse(diagnosis.stdout);
    assert.equal(health.ok,true); assert.equal(health.editorConnection,'unverified');
    assert.equal(health.checks.find(check => check.name === 'server').status,'pass');
    const graph = join(project,'.codeweb','graph.json');
    const before = join(project,'before.json');
    writeFileSync(before,readFileSync(graph));
    const html = join(project,'review.html');
    const review = run('review',graph,'--changed','a.js','--before',before,'--json','--html',html);
    assert.equal(review.status,0,review.stderr);
    const summary = JSON.parse(review.stdout);
    assert.equal(summary.analysis.status,'complete');
    assert.match(JSON.stringify(summary.review),/caller/);
    assert.match(readFileSync(html,'utf8'),/Changed symbols/);
    assert.match(readFileSync(html,'utf8'),/Affected callers/);
    if (spawnSync('git',['--version']).status === 0) {
      const git = (...args) => { const r = spawnSync('git',['-C',project,...args],{encoding:'utf8'}); assert.equal(r.status,0,r.stderr); return r.stdout.trim(); };
      git('init','-q'); const identity = fixtureGitIdentity();
      git('config','user.name',identity.name); git('config','user.email',identity.email); git('config','commit.gpgsign','false');
      git('add','src'); git('commit','-qm','base'); const base = git('rev-parse','HEAD');
      writeTree(project,{'src/b.js':body});
      const blocking = run('gate','--base',base,'--target','src');
      assert.equal(blocking.status,1,blocking.stdout + blocking.stderr);
      const advisory = run('gate','--base',base,'--target','src','--report-only');
      assert.equal(advisory.status,0,advisory.stdout + advisory.stderr);
      assert.match(advisory.stdout,/regression type/);
      const broken = run('gate','--base','missing-ref','--target','src','--report-only');
      assert.equal(broken.status,2,broken.stdout + broken.stderr);
    }
  } finally {
    cleanup(packDir);
    cleanup(prefix);
  }
});
