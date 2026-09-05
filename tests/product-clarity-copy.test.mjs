import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ROOT } from './helpers.mjs';
const read = p => readFileSync(join(PLUGIN_ROOT,p),'utf8');
const headline = 'See what your AI edits affect.';
const descriptor = 'Structural checks for AI code changes.';
test('AC-13 active public descriptions share the scoped identity', () => {
  for (const path of ['README.md','package.json','.claude-plugin/plugin.json','.claude-plugin/marketplace.json','server.json','.github/repo-settings.json','assets/brand/README.md']) {
    assert.ok(read(path).includes(headline), `${path}: headline`);
    assert.ok(read(path).includes(descriptor), `${path}: descriptor`);
  }
  const data = JSON.parse(read('site/data/product.json'));
  assert.equal(data.tagline,headline);
  assert.equal(data.descriptor,descriptor);
  assert.equal((read('CHARTER.md').match(/\*\*"([^"]+)"\*\*/) || [])[1],headline);
  assert.match(read('CHARTER.md'), /2026-09-05[\s\S]*user.authorized/i);
});
test('AC-13 gate and context claims state measurement limits', () => {
  for (const path of ['README.md','site/content/index.html','site/content/lsp.html']) {
    const text=read(path).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
    assert.doesNotMatch(text,/never hallucinates/i,path);
    assert.match(text,/does not prove (?:that )?(?:the )?(?:program|code) works/i,path);
  }
  for (const path of ['README.md','site/content/index.html','site/content/compare.html']) {
    const text=read(path).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
    assert.match(text,/simulated.*grep|grep.*simulated/i,path);
    assert.match(text,/context.size/i,path);
    assert.match(text,/total (?:agent.session|session) (?:token )?(?:savings|cost)/i,path);
  }
});
