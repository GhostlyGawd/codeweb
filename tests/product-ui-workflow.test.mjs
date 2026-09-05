import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ROOT, runNode, tmpDir, cleanup } from './helpers.mjs';
const script=join(PLUGIN_ROOT,'scripts/verify-product-ui.mjs');
test('UI verifier answers help without a browser and refuses an existing output directory', () => {
  const help=runNode(script,['--help']);
  assert.equal(help.status,0,help.stderr);
  assert.match(help.stdout,/--out/);
  const dir=tmpDir('codeweb-ui-existing-');
  try {
    const result=runNode(script,['--out',dir]);
    assert.equal(result.status,2,result.stderr);
    assert.match(result.stderr,/new output directory/i);
  } finally { cleanup(dir); }
});
test('UI workflow has read-only permission and runs browser gates before uploading evidence', () => {
  const workflow=readFileSync(join(PLUGIN_ROOT,'.github/workflows/product-ui.yml'),'utf8');
  assert.match(workflow,/permissions:\s*\n\s*contents: read/);
  assert.doesNotMatch(workflow,/pull_request_target|contents: write|continue-on-error/);
  assert.match(workflow,/tests\/report-scale-bench\.test\.mjs/);
  assert.match(workflow,/CODEWEB_PLAYWRIGHT_DIR/);
  assert.match(workflow,/verify-product-ui\.mjs/);
  assert.match(workflow,/actions\/upload-artifact@v4/);
});

test('UI workflow initializes runner paths in a step, after runner context becomes available', () => {
  const workflow=readFileSync(join(PLUGIN_ROOT,'.github/workflows/product-ui.yml'),'utf8');
  const jobEnv=workflow.slice(workflow.indexOf('    env:'),workflow.indexOf('    steps:'));
  assert.doesNotMatch(jobEnv,/\$\{\{\s*runner\./,'GitHub rejects runner context in job-level env');
  assert.match(workflow,/CODEWEB_PLAYWRIGHT_DIR=.*RUNNER_TEMP/);
  assert.match(workflow,/PLAYWRIGHT_BROWSERS_PATH=.*RUNNER_TEMP/);
  assert.match(workflow,/GITHUB_ENV/);
  assert.ok(workflow.indexOf('GITHUB_ENV') < workflow.indexOf('Install isolated development browser tools'));
});
