import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PLUGIN_ROOT, tmpDir, cleanup } from './helpers.mjs';

const read = (path) => readFileSync(join(PLUGIN_ROOT, path), 'utf8');

test('ac_25: README and agent rules preserve the baseline through repair', () => {
  for (const path of ['README.md', 'site/content/start.html']) {
    const copy = read(path);
    assert.ok(copy.includes('codeweb_refresh {baseline:true}'), path);
    assert.ok(copy.includes('codeweb_diff {before:"baseline",refresh:true}'), path);
    assert.match(copy, /Do not capture another baseline during repair/);
    assert.match(copy, /skipped.*(?:not a pass|not passed)/);
    assert.match(copy, /does not prove behavio(?:r|ral)/);
    assert.ok(!copy.includes('snapshot:true'), 'first-use advice must not revert to the moving snapshot');
  }
});

test('ac_25: the published cycle commands find the caller, go red, then repair to green', { skip: process.platform === 'win32' ? 'walkthrough requires a POSIX shell' : false }, () => {
  const temp = tmpDir('cw-walkthrough-');
  try {
    const html = read('site/content/start.html');
    const snippet = /<!-- cycle-walkthrough: executable fixture -->\s*<pre><code>([\s\S]*?)<\/code><\/pre>/.exec(html)?.[1];
    assert.ok(snippet, 'the tested commands are the actual published walkthrough');
    // Record real diff exit codes without stopping at the expected red. Other failures abort.
    const commands = snippet.split('\n').map((line) => {
      // The harness owns temporary allocation; all documented product commands run unchanged.
      if (line.startsWith('demo=')) return `demo='${temp.replaceAll("'", "'\\''")}'`;
      if (line.startsWith('node scripts/query.mjs')) return `echo WALKTHROUGH_CALLERS_BEGIN\n${line} || exit $?\necho WALKTHROUGH_CALLERS_END`;
      if (line.startsWith('node scripts/diff.mjs')) return `${line}\necho "WALKTHROUGH_DIFF_EXIT=$?"`;
      if (line.startsWith('node ')) return `${line} || exit $?`;
      return line;
    }).join('\n');
    const r = spawnSync('sh', ['-c', commands], { cwd: PLUGIN_ROOT, env: { ...process.env, TMPDIR: temp, CODEWEB_NO_STATS: '1', CODEWEB_NO_PROMO: '1' }, encoding: 'utf8', timeout: 60000 });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual([...r.stdout.matchAll(/WALKTHROUGH_DIFF_EXIT=(\d+)/g)].map((m) => Number(m[1])), [1, 0], r.stdout);
    const callers = JSON.parse(/WALKTHROUGH_CALLERS_BEGIN\n([\s\S]*?)\nWALKTHROUGH_CALLERS_END/.exec(r.stdout)[1]);
    assert.equal(callers.query, 'callers');
    assert.equal(callers.symbol, 'beta');
    assert.deepEqual(callers.results, ['a.js:alpha']);
    assert.match(r.stdout, /REGRESSIONS/);
    assert.match(r.stdout, /ok — no structural regressions/);
    assert.match(r.stdout, /duplication|overlap/);
  } finally { cleanup(temp); }
});
