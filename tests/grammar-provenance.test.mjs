// LNG-F2: the provenance table's digests are machine-checked. PROVENANCE.md records
// source/version/ABI/sha256 for every vendored grammar; this test recomputes each file's
// sha256 against the table, both ways — a wasm with no table row and a table row with no
// wasm both fail. Determinism tests prove same-input-same-output; THIS proves the grammar
// is the one the table claims.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ROOT } from './helpers.mjs';

const DIR = join(PLUGIN_ROOT, 'scripts', 'grammars');
const TABLE = readFileSync(join(DIR, 'PROVENANCE.md'), 'utf8');

const recorded = new Map(
  [...TABLE.matchAll(/\|\s*`([a-z0-9-]+\.wasm)`\s*\|[^\n]*`([0-9a-f]{64})`\s*\|/g)]
    .map((m) => [m[1], m[2]]),
);

test('every vendored grammar matches its recorded sha256', () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.wasm'));
  assert.ok(files.length >= 8, `expected the vendored grammar set, found ${files.length}`);
  for (const f of files) {
    const want = recorded.get(f);
    assert.ok(want, `${f} has no sha256 row in PROVENANCE.md — record its provenance before vendoring`);
    const got = createHash('sha256').update(readFileSync(join(DIR, f))).digest('hex');
    assert.equal(got, want, `${f} does not match its recorded digest — the vendored bytes changed without a provenance update`);
  }
});

test('every recorded digest has its wasm on disk (no phantom rows)', () => {
  const files = new Set(readdirSync(DIR).filter((f) => f.endsWith('.wasm')));
  for (const f of recorded.keys()) {
    assert.ok(files.has(f), `PROVENANCE.md records ${f}, which is not vendored`);
  }
});

test('the runtime version the table pins is the one package.json declares', () => {
  const pkg = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'package.json'), 'utf8'));
  const runtime = (TABLE.match(/`web-tree-sitter@([\d.]+)`/) || [])[1];
  assert.ok(runtime, 'PROVENANCE.md names the pinned runtime');
  assert.equal(pkg.optionalDependencies['web-tree-sitter'], runtime,
    'the ABI window is defined by this pair — bump both together');
});
