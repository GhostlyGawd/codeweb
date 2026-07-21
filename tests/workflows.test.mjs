// Round-2 WS-A: text-level invariants over the CI/release workflow files. Deliberately regex-on-
// text, not YAML-parsed: the regression class these pin is finding #1's — gates silently DROPPED
// from workflow files (round 1's #29-#32 vanished without anything noticing). An exact-text pin
// fails loudly the moment a gate line disappears in a refactor. Behavior proof is CI itself:
// ci.yml/codeweb-gate.yml run on the PR; release.yml fires at the next real tag/dispatch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ROOT } from './helpers.mjs';

const wf = (name) => readFileSync(join(PLUGIN_ROOT, '.github', 'workflows', name), 'utf8');
const release = wf('release.yml');
const ci = wf('ci.yml');
const gate = wf('codeweb-gate.yml');

// ---- finding #2: the release path runs the suite, guards dispatch, pins its toolchain ----------

test('release.yml: publish needs the test job — no publish path skips the suite', () => {
  assert.match(release, /^\s*needs:\s*test\s*$/m, 'publish must declare needs: test');
  assert.match(release, /npm test/, 'a release job step must run the suite');
  assert.match(release, /check-consistency/, 'a release job step must run the consistency gate');
});

test('release.yml: dispatched refs must be ancestors of origin/main, checked before tag creation', () => {
  assert.match(release, /merge-base --is-ancestor HEAD origin\/main/);
  assert.match(release, /fetch-depth: 0/, 'merge-base needs history; depth 0 materializes origin/main');
  const guardAt = release.indexOf('merge-base --is-ancestor');
  const tagAt = release.indexOf('Create tag');
  assert.ok(guardAt !== -1 && tagAt !== -1 && guardAt < tagAt, 'ancestor guard must sit before tag creation');
});

test('release.yml: vsce is exact-pinned at both call sites, never @latest', () => {
  assert.equal((release.match(/@vscode\/vsce@3\.9\.2/g) || []).length, 2, 'both npx call sites carry the exact pin');
  assert.ok(!release.includes('vsce@latest'), 'no call site may float on @latest');
});

// ---- finding #3: CI breadth (matrix), AST tier can't silently un-test itself, gate sees deps ---

test('ci.yml: the test job runs an os x node matrix', () => {
  assert.match(ci, /strategy:/);
  assert.match(ci, /matrix:/);
});

// Count-free on purpose: EVERY setup-node block, in every workflow, present and future, must
// enable the npm cache — a new block without it fails here without touching a count.
test('every actions/setup-node block across all three workflows enables the npm cache', () => {
  for (const [name, text] of [['release.yml', release], ['ci.yml', ci], ['codeweb-gate.yml', gate]]) {
    const blocks = text.split(/uses:\s*actions\/setup-node@v4/).slice(1);
    assert.ok(blocks.length > 0, `${name} has at least one setup-node block`);
    blocks.forEach((b, i) => {
      const head = b.split(/\n\s*- /)[0]; // the `with:` block, up to the next step
      assert.ok(/cache:\s*'npm'/.test(head), `${name}: setup-node block ${i + 1} missing cache: 'npm'`);
    });
  }
});

test('ci.yml: post-install AST probe + skip ceiling — an install hiccup cannot green-skip the AST tier', () => {
  assert.match(ci, /web-tree-sitter/, 'the import probe must name the engine');
  assert.match(ci, /# skipped/, 'the TAP skip summary must be parsed and bounded');
});

test('ci.yml: a no-optional-deps job exercises the regex fallback for real', () => {
  assert.match(ci, /--omit=optional/, 'the job must install without the optional AST tier');
  assert.match(ci, /tee "\$RUNNER_TEMP\/test\.log"/, 'the test log must actually be captured (the grep needs it)');
  assert.match(ci, /graceful fallback/, 'the fallback-equivalence test must be asserted to have run');
  assert.match(ci, /# SKIP/, 'the grep must exclude skipped-but-printed TAP lines');
});

test('codeweb-gate.yml: the structural self-gate installs deps (AST-aware, not regex-blind)', () => {
  assert.match(gate, /npm ci/);
});
