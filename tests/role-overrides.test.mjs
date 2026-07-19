// Spec E (docs/specs/role-overrides-self-campaign.md): heuristics can't know a repo's private
// layout ("docs/ here is generated site output") — so codeweb.rules.json gains a `roles` map:
// glob -> role, applied by extraction AFTER path heuristics (override wins, first match wins).
//
// R1: an override turns heuristically-product files into `generated`, and product-scoped
//     findings stop ranking them.
// R2: overlapping globs -> the FIRST match wins, deterministically.
// R3: an unknown role value fails loudly at extract time (exit 2, entry named).
// R4 (property): no `roles` section == no rules file at all — byte-identical fragments.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, tmpDir, cleanup, writeTree, script, readJSON } from './helpers.mjs';

const EXTRACT = script('extract-symbols.mjs');

const SRC = {
  'src/lib/core.js': 'export function core(x) {\n  return x + 1;\n}\n',
  'src/docs/gen.js': 'export function genHelper(x) {\n  return x + 1;\n}\n',
};

function extract(dir, rules) {
  if (rules !== undefined) writeFileSync(join(dir, 'src', 'codeweb.rules.json'), JSON.stringify(rules));
  const out = join(dir, `frag-${Math.random().toString(36).slice(2, 8)}.json`);
  const r = runNode(EXTRACT, [join(dir, 'src'), '--out', out]);
  return { r, out };
}
const roleOfNode = (frag, file) => frag.nodes.find((n) => n.file === file && n.kind !== 'module')?.role;

test('R1: override maps docs/** to generated; heuristics keep the rest', () => {
  const dir = tmpDir('codeweb-roles-');
  try {
    writeTree(dir, SRC);
    const { r, out } = extract(dir, { roles: [{ glob: 'docs/**', role: 'generated' }] });
    assert.equal(r.status, 0, r.stderr);
    const frag = readJSON(out);
    assert.equal(roleOfNode(frag, 'docs/gen.js'), 'generated', 'override wins over the product heuristic');
    assert.equal(roleOfNode(frag, 'lib/core.js'), 'product', 'non-matching files keep their heuristic role');
  } finally { cleanup(dir); }
});

test('R2: first matching glob wins, in config order', () => {
  const dir = tmpDir('codeweb-roles-');
  try {
    writeTree(dir, SRC);
    const { r, out } = extract(dir, { roles: [
      { glob: 'docs/gen.js', role: 'bench' },
      { glob: 'docs/**', role: 'generated' },
    ] });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(roleOfNode(readJSON(out), 'docs/gen.js'), 'bench', 'the earlier, more specific entry took it');
  } finally { cleanup(dir); }
});

test('R3: an unknown role value fails loudly, naming the entry', () => {
  const dir = tmpDir('codeweb-roles-');
  try {
    writeTree(dir, SRC);
    const { r } = extract(dir, { roles: [{ glob: 'docs/**', role: 'sparkly' }] });
    assert.equal(r.status, 2, 'bad config is a hard error, not a silent skip');
    assert.match(r.stderr, /sparkly/, 'the offending role is named');
  } finally { cleanup(dir); }
});

test('R4: absent roles section == absent rules file (byte-identical fragments)', () => {
  const dir = tmpDir('codeweb-roles-');
  try {
    writeTree(dir, SRC);
    const a = extract(dir, { fitness: { maxFanIn: 50 } }); // rules file present, no roles section
    assert.equal(a.r.status, 0, a.r.stderr);
    rmSync(join(dir, 'src', 'codeweb.rules.json'));
    const b = extract(dir, undefined); // no rules file at all
    assert.equal(b.r.status, 0, b.r.stderr);
    assert.equal(readFileSync(a.out, 'utf8'), readFileSync(b.out, 'utf8'));
  } finally { cleanup(dir); }
});
