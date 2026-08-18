// Distribution hardening for the gate Action: what a stranger copies out of our docs must pin a
// released tag, and the counter that watches gate adoption must never fail silently.
//
// Two regression classes, both already shipped once:
//   1. Copy-paste examples floated on `@main`, and the ones that did pin rotted at v0.12.0 while
//      v0.13.0 shipped — a moving ref changes a consumer's verdict semantics under them, and a
//      stale one sends them to superseded engine code. The pins are now version-synced, so this
//      file asserts they equal the shipped version rather than a hardcoded string.
//   2. `gateReposExternal` fail-softed to null on ANY API error with no signal — the Teams demand
//      counter could read "unknown" forever and nobody would know. The status must be observable.
//
// The action's own input default stays 'main' on purpose: the functional fallback for someone who
// sets no ref must keep working. Pinning is guidance for consumers, not a hard requirement.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { PLUGIN_ROOT } from './helpers.mjs';

const read = (p) => readFileSync(join(PLUGIN_ROOT, p), 'utf8');
const VERSION = JSON.parse(read('package.json')).version;
const TAG = `v${VERSION}`;
const ACTION = '.github/actions/codeweb-gate/action.yml';

// The surfaces a consumer copies from: the contract's grep scope (README.md docs/ .github/) plus
// site/content, which is the AUTHORED source for the built docs/*.html pages.
const SCAN_ROOTS = ['README.md', 'docs', '.github', 'site/content'];
const TEXT_EXT = /\.(md|ya?ml|html)$/;

function walk(rel) {
  const abs = join(PLUGIN_ROOT, rel);
  if (statSync(abs).isFile()) return TEXT_EXT.test(rel) ? [rel] : [];
  return readdirSync(abs).flatMap((entry) => walk(join(rel, entry)));
}

const FILES = SCAN_ROOTS.flatMap(walk).map((p) => relative('.', p).split('\\').join('/'));

// YAML examples inside the site's <pre><code> blocks end at a closing tag, and the reference
// docs write the input in YAML flow form (`{ codeweb-ref: v1.2.3 }`) — strip both so the value
// captured is the ref itself, never markup or a delimiter.
const refValue = (raw) => raw.replace(/<[^>]*>?.*$/, '').replace(/[,}\]]+$/, '');

/** Every `codeweb-ref:` occurrence, classified. A bare `codeweb-ref:` with nothing after the
 *  colon is the action's input DECLARATION; anything else sets a value a consumer would copy. */
function codewebRefUses() {
  const hits = [];
  for (const file of FILES) {
    read(file).split('\n').forEach((line, i) => {
      const m = /codeweb-ref:[ \t]*(\S*)/.exec(line);
      if (!m) return;
      const value = refValue(m[1]);
      hits.push({ file, line: i + 1, value, text: line.trim(), declaration: value === '' });
    });
  }
  return hits;
}

/** Every `…/codeweb-gate@<ref>` usage example — the Action ref itself, distinct from the input. */
function actionRefUses() {
  const hits = [];
  for (const file of FILES) {
    read(file).split('\n').forEach((line, i) => {
      const m = /codeweb-gate@(\S+)/.exec(line);
      if (m) hits.push({ file, line: i + 1, value: refValue(m[1]), text: line.trim() });
    });
  }
  return hits;
}

// ---- the examples pin, and they pin the version that actually shipped -------------------------

test('every value-setting codeweb-ref: example pins the shipped release tag', () => {
  const uses = codewebRefUses().filter((h) => !h.declaration);
  assert.ok(uses.length > 0, 'the docs must demonstrate the input at least once, or the guidance is abstract');
  const bad = uses.filter((h) => h.value !== TAG);
  assert.deepEqual(bad.map((h) => `${h.file}:${h.line} ${h.text}`), [],
    `codeweb-ref examples must read "${TAG}" (a moving or stale ref changes verdict semantics)`);
});

test('the codeweb-ref input declaration lives only in action.yml, and still defaults to main', () => {
  const declarations = codewebRefUses().filter((h) => h.declaration);
  assert.deepEqual(declarations.map((h) => h.file), [ACTION],
    'only the action manifest declares the input; every other mention sets a value');

  const yml = read(ACTION);
  // The functional default is load-bearing: a consumer who sets no ref must still get a working
  // gate. Pinning is guidance, never a hard requirement that breaks the zero-config path.
  assert.match(yml, /default:\s*'main'/, "action.yml must keep default: 'main' — the zero-config path");
  const block = yml.slice(yml.indexOf('codeweb-ref:'), yml.indexOf('history:'));
  assert.match(block, /[Pp]in a release tag/, 'the description keeps the pinning guidance');
  assert.match(block, new RegExp(TAG.replace('.', '\\.')), `the description's example tag tracks the shipped ${TAG}`);
});

test('every codeweb-gate@ usage example pins a release tag, never @main', () => {
  const uses = actionRefUses();
  assert.ok(uses.length > 0, 'the docs must show how to reference the Action');
  const bad = uses.filter((h) => h.value !== TAG);
  assert.deepEqual(bad.map((h) => `${h.file}:${h.line} ${h.text}`), [],
    `every Action ref must pin ${TAG}`);
});

test('the pinned tag is a released version, not an unreleased bump', () => {
  // CHANGELOG is the release receipt: a pin may only name a version that has a dated section.
  const changelog = read('CHANGELOG.md');
  assert.match(changelog, new RegExp(`\\[${VERSION.replace(/\./g, '\\.')}\\]`),
    `${TAG} must appear in CHANGELOG.md before docs send strangers to it`);
});

test('the doc pins are version-synced, so a release cannot leave them behind', () => {
  // The rot this closes: docs sat on v0.12.0 through the whole v0.13.0 release because nothing
  // rewrote them. syncTargets now owns every pinned surface.
  const utils = read('scripts/release-utils.mjs');
  const synced = utils.slice(utils.indexOf('export function syncTargets'));
  for (const file of ['docs/ci-gate.md', 'docs/reference.md', 'site/content/product.html', ACTION]) {
    assert.ok(synced.includes(file), `syncTargets must own ${file} so its pin rolls with the release`);
  }
});

// ---- the adoption counter is observable, not silently null ------------------------------------

test('the ledger records gateReposExternal and surfaces WHY when it cannot', () => {
  const wf = read('.github/workflows/acquisition-ledger.yml');
  assert.match(wf, /gateReposExternal/, 'the Teams demand signal is computed');
  assert.match(wf, /search\/code/, 'from public code search, per REVENUE §2');
  // The silent-null bug: `curl -sf … || echo '{}'` swallowed the status, so an unusable
  // credential looked identical to a genuine zero-adoption reading.
  assert.match(wf, /%\{http_code\}/, 'the search response status must be captured, not swallowed');
  assert.match(wf, /::warning::/, 'a failed search must announce itself in the run log');
  assert.doesNotMatch(wf, /curl -sf[^\n]*search\/code/, 'the -f swallow-the-status form must be gone');
  // curl -w already prints 000 on a transport failure, so an `|| echo '000'` fallback concatenates
  // a second one and the warning reads "HTTP 000000" — a status that does not exist.
  assert.doesNotMatch(wf, /\|\|\s*echo\s*'000'/,
    'the transport-failure fallback must replace the status, not append a second one');
});

test('the ledger accepts an operator-supplied search credential, gated like every other secret', () => {
  const wf = read('.github/workflows/acquisition-ledger.yml');
  // Global code search rejects the Actions installation token; the repo's established escape
  // hatch for that class is an optional secret that no-ops when absent (NPM_TOKEN pattern).
  assert.match(wf, /secrets\.CODE_SEARCH_TOKEN/, 'an optional PAT overrides the installation token');
  assert.match(wf, /github\.token/, 'and it still falls back to the built-in token');
});

test('the newest ledger row carries the gateReposExternal field', () => {
  const rows = read('bench/acquisition-ledger.jsonl').trim().split('\n');
  const newest = JSON.parse(rows[rows.length - 1]);
  assert.ok('gateReposExternal' in newest,
    'the newest snapshot must carry the field (number, or null when the search was unavailable)');
  const v = newest.gateReposExternal;
  assert.ok(v === null || Number.isInteger(v), `gateReposExternal must be an integer or null, got ${v}`);
});
