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

// R5 (round-2 WS-C review): edge derivation became role-DEPENDENT with finding #10 — the ref
// role gate's verdicts are baked into cached per-file edges. A rules-file role flip changes no
// node id (symbolSig is blind to it), so the edge cache must ALSO key on rulesSig, mirroring the
// stamp tier ("a rules change invalidates the stamp tier wholesale"). Pre-fix, run 2 replayed
// run 1's bench-scoped verdict and shipped a product->bench ref the gate now forbids.
test('R5: a rules-file role flip with a warm cache re-derives edges (the #10 gate sees fresh roles)', () => {
  const dir = tmpDir('codeweb-roles-');
  try {
    writeTree(dir, {
      'src/lib/prod.js': 'export function useIt() {\n  return probe(helper);\n}\n',
      'src/bench/helper.js': 'export function helper() { return 1; }\n',
    });
    const cache = join(dir, 'cache.json');
    // run 1: lib/** demoted to bench -> the from-side is not product, the gate is off, the bare
    // ref resolves via the unique-in-package fallback (positive control that the fallback fires).
    writeFileSync(join(dir, 'src', 'codeweb.rules.json'),
      JSON.stringify({ roles: [{ glob: 'lib/**', role: 'bench' }] }));
    const out1 = join(dir, 'f1.json');
    let r = runNode(EXTRACT, [join(dir, 'src'), '--no-ctags', '--cache', cache, '--out', out1]);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(readJSON(out1).edges.some((e) => e.from === 'lib/prod.js:useIt' && e.to === 'bench/helper.js:helper' && e.kind === 'ref'),
      'positive control: with lib/** demoted, the bench->bench ref resolves');
    // run 2 (warm cache): rules file gone -> lib/prod.js is product again. Same node ids, same
    // file hashes — only rulesSig moved. The #10 gate must reject the product->bench ref.
    rmSync(join(dir, 'src', 'codeweb.rules.json'));
    const out2 = join(dir, 'f2.json');
    r = runNode(EXTRACT, [join(dir, 'src'), '--no-ctags', '--cache', cache, '--out', out2]);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!readJSON(out2).edges.some((e) => e.from === 'lib/prod.js:useIt' && e.to === 'bench/helper.js:helper'),
      'the role flip must invalidate cached edges — product never ref-resolves into bench');
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
