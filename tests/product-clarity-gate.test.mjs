import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, script, tmpDir, cleanup, writeTree, PLUGIN_ROOT, fixtureGitIdentity } from './helpers.mjs';

const gitTest = { skip: spawnSync('git', ['--version']).status === 0 ? false : 'git not available' };
const bashTest = { skip: spawnSync('bash', ['--version']).status === 0 ? false : 'bash not available' };

function fixture() {
  const dir = tmpDir('codeweb-report-only-');
  const git = (...args) => { const r = spawnSync('git', ['-C', dir, ...args], {encoding:'utf8'}); assert.equal(r.status,0,r.stderr); return r.stdout.trim(); };
  git('init','-q'); const id = fixtureGitIdentity();
  git('config','user.name',id.name); git('config','user.email',id.email); git('config','commit.gpgsign','false');
  writeTree(dir, {'src/a.js': 'export function calc(x) {\n let n = 0;\n for (let i = 0; i < x; i++) {\n  if (i % 2) n += i * 3;\n  else n -= i;\n }\n const r = n * 2 + 7;\n return r > 100 ? r - 100 : r;\n}\n'});
  git('add','-A'); git('commit','-qm','base');
  return {dir, base:git('rev-parse','HEAD')};
}

test('AC-19 report-only keeps finding verdict and comment while allowing a completed regression', gitTest, () => {
  const {dir,base} = fixture();
  try {
    writeTree(dir, {'src/b.js': readFileSync(join(dir,'src/a.js'),'utf8')});
    const args = ['--repo',dir,'--target','src','--base',base];
    const block = runNode(script('ci-gate.mjs'),args);
    assert.equal(block.status,1,block.stderr + block.stdout);
    const md = join(dir,'gate.md');
    const advisory = runNode(script('ci-gate.mjs'), [...args,'--report-only','--md',md]);
    assert.equal(advisory.status,0,advisory.stderr + advisory.stdout);
    assert.match(advisory.stdout + advisory.stderr,/report-only.*regression|regression.*report-only/i);
    assert.match(readFileSync(md,'utf8'),/❌ \d+ regression type/);
  } finally { cleanup(dir); }
});

test('AC-19 report-only never suppresses usage, missing ref, or build failure', gitTest, () => {
  const {dir,base} = fixture();
  try {
    for (const args of [[],['--base','missing-ref'],['--base',base,'--target','absent']]) {
      const r = runNode(script('ci-gate.mjs'), ['--repo',dir,'--report-only',...args]);
      assert.equal(r.status,2,r.stderr);
    }
  } finally { cleanup(dir); }
});

test('AC-19 Action keeps real verdict output and restricts report-only to exit 1', () => {
  const action = readFileSync(join(PLUGIN_ROOT,'.github/actions/codeweb-gate/action.yml'),'utf8');
  assert.match(action,/report-only:\n/);
  assert.match(action,/CODEWEB_REPORT_ONLY: \$\{\{ inputs.report-only \}\}/);
  assert.match(action,/"\$GATE_CODE" = "1".*"\$CODEWEB_REPORT_ONLY" = "true"/);
  assert.doesNotMatch(action,/continue-on-error:/);
});

test('AC-19 report-only fails interrupted or errored diff and removes its worktree', gitTest, () => {
  const {dir,base} = fixture();
  try {
    writeTree(dir, {'fault.cjs': `const cp = require('node:child_process');
const original = cp.spawnSync;
cp.spawnSync = function(command, args, options) {
 if (args && args[0] && args[0].endsWith(require('node:path').sep + 'diff.mjs')) return process.env.FAULT === 'signal'
   ? {status:null,signal:'SIGTERM'} : {status:2,stdout:'',stderr:''};
 return original(command,args,options);
};
require('node:module').syncBuiltinESMExports();`});
    for (const fault of ['signal','error']) {
      const r = runNode(script('ci-gate.mjs'), ['--repo',dir,'--target','src','--base',base,'--report-only'], {
        env: {NODE_OPTIONS: `--require=${JSON.stringify(join(dir,'fault.cjs'))}`, FAULT:fault},
      });
      assert.equal(r.status,2,r.stderr);
      assert.doesNotMatch(r.stderr,/completed finding does not block/);
      const list = spawnSync('git',['-C',dir,'worktree','list','--porcelain'],{encoding:'utf8'});
      assert.equal((list.stdout.match(/^worktree /gm)||[]).length,1);
    }
  } finally { cleanup(dir); }
});

test('AC-19 Action enforcement executes expected blocking and report-only policy', bashTest, () => {
  const action = readFileSync(join(PLUGIN_ROOT,'.github/actions/codeweb-gate/action.yml'),'utf8');
  const step = action.split('    - name: Enforce gate verdict\n')[1];
  const shell = step.split('      run: |\n')[1].split('\n').map(line => line.replace(/^        /,'')).join('\n');
  for (const mode of ['true','false']) for (const code of ['1','2','137']) {
    const r = spawnSync('bash',['-c',shell],{encoding:'utf8',env:{...process.env,GATE_CODE:code,CODEWEB_REPORT_ONLY:mode}});
    assert.equal(r.status,code==='1' && mode==='true' ? 0 : 1,`${mode} / ${code}: ${r.stdout}`);
  }
});

test('AC-19 exit 1 without a completed structured verdict remains an analysis error', gitTest, () => {
  const {dir,base} = fixture();
  try {
    writeTree(dir, {'crash.cjs': `const cp = require('node:child_process');
const original = cp.spawnSync;
cp.spawnSync = function(command, args, options) {
 if (args && args[0] && args[0].endsWith(require('node:path').sep + 'diff.mjs')) {
  return {status:1,stdout:process.env.FAULT === 'partial' ? '{"ok":false,"regressions":["fake"]}' : '',stderr:'uncaught analysis exception'};
 }
 return original(command,args,options);
};
require('node:module').syncBuiltinESMExports();`});
    for (const mode of [[],['--report-only']]) for (const fault of ['crash','partial']) {
      const r = runNode(script('ci-gate.mjs'), ['--repo',dir,'--target','src','--base',base,...mode], {
        env:{NODE_OPTIONS:`--require=${JSON.stringify(join(dir,'crash.cjs'))}`,FAULT:fault},
      });
      assert.equal(r.status,2,r.stdout+r.stderr);
      assert.doesNotMatch(r.stderr,/completed finding does not block/);
    }
  } finally { cleanup(dir); }
});
