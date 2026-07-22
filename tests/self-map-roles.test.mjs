// Finding #10 property test — the SELF-MAP as the adversarial corpus. Extracts the real repo root
// and asserts the cross-role ref invariant the #10 gates establish: a product-role symbol never
// REF-resolves into non-product code (test/bench/fixture short names were magnets — 209 violations
// before the fix). Runs the shipped extractor as a child process, ~4-5 s, single-extract shared by
// both tests.
//
// Roles come from the STAMPED node.role — the same truth the gate consults (roleFor = rules-file
// overrides + roleOf path heuristics; codeweb.rules.json maps docs/** to generated here).
//
// ALLOWLIST grows ONLY with a justifying comment — an empty list is the finding's success bar.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runNode, tmpDir, cleanup, script, readJSON, PLUGIN_ROOT } from './helpers.mjs';

const ALLOWLIST = []; // "from -> to" edge strings; each entry needs a comment justifying it

let frag;
before(() => {
  const dir = tmpDir('codeweb-selfroles-');
  const out = join(dir, 'fragment.json');
  const res = runNode(script('extract-symbols.mjs'), [PLUGIN_ROOT, '--no-ctags', '--out', out]);
  assert.equal(res.status, 0, `self-extract exited non-zero:\n${res.stderr}`);
  frag = readJSON(out);
  cleanup(dir);
});

test('PROPERTY: every product-role ref edge lands on a product-role target', () => {
  const roleById = new Map(frag.nodes.map((n) => [n.id, n.role]));
  const violations = frag.edges
    .filter((e) => e.kind === 'ref'
      && roleById.get(e.from) === 'product'
      && roleById.get(e.to) !== 'product'
      && !ALLOWLIST.includes(`${e.from} -> ${e.to}`))
    .map((e) => `${e.from} -> ${e.to}`);
  assert.deepEqual(violations, [],
    `product code must never ref-resolve into test/bench/fixture code (add to ALLOWLIST only with a justifying comment)`);
});

// T-10.5 — the finding's own success proof. cli.mjs's sourceReader and import-resolve.mjs's
// factory destructure RENAMED their parameters (relPath / relPathOf / recTextOf / maskTextOf)
// purely to dodge the bare-ref magnet: `rel`, `textOf`, and `maskedOnce` are real symbols in
// extract-symbols.mjs, and the pre-fix fallback read every use as a reference INTO the
// orchestrator — a false lib -> extract-symbols edge closing a dependency cycle. The natural
// names are restored; this pins that the exact cycle class stays gone. If it ever reappears,
// extend the shadow set — never re-rename.
test('no lib/import-resolve or lib/cli edge into extract-symbols rel/textOf/maskedOnce', () => {
  const targets = new Set([
    'scripts/extract-symbols.mjs:rel',
    'scripts/extract-symbols.mjs:textOf',
    'scripts/extract-symbols.mjs:maskedOnce',
  ]);
  const offenders = frag.edges
    .filter((e) => /^scripts\/lib\/(import-resolve|cli)\.mjs:/.test(e.from) && targets.has(e.to))
    .map((e) => `${e.from} -> ${e.to} (${e.kind})`);
  assert.deepEqual(offenders, [],
    'the renamed-parameter workaround is deleted; its false-edge class must not return');
});
