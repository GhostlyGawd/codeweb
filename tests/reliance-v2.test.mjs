// Spec G (docs/specs/reliance-v2.md): three more contract classes agents break —
// exceptions callers already handle, parameter objects the callee mutates, and results
// callers null-check. Same conservatism as v1: only line-visible patterns count; a control
// fixture with none of the evidence must produce NO new claims.
//
// G1: try/catch + .catch() call sites -> handlesErrors, with the card line.
// G2: callee body mutating a named parameter -> mutatesParams, with the card line.
// G3: null-checked results (?. / ?? / == null / if(!f(...))) -> nullChecked, with the card line.
// G4 (control): plain calls -> none of the v2 fields, none of the v2 card lines.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, script, tmpDir, cleanup, writeTree, readJSON } from './helpers.mjs';

function buildMapped(fixture) {
  const dir = tmpDir('codeweb-relv2-');
  writeTree(dir, fixture);
  const ws = join(dir, '.codeweb');
  mkdirSync(ws, { recursive: true });
  const r = runNode(script('extract-symbols.mjs'), [dir, '--no-ctags', '--out', join(ws, 'fragment.json')]);
  assert.equal(r.status, 0, r.stderr);
  const frag = readJSON(join(ws, 'fragment.json'));
  writeFileSync(join(ws, 'graph.json'), JSON.stringify({ ...frag, domains: [], overlaps: [] }));
  return { dir, graph: join(ws, 'graph.json') };
}

function explain(graph, symbol) {
  const r = runNode(script('explain.mjs'), [graph, symbol, '--json']);
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout).cards[0];
}

test('G1: callers that try/catch or .catch() the call surface as exception reliance', () => {
  const { dir, graph } = buildMapped({
    'util.js': 'export function risky(x) {\n  if (!x) throw new Error("no");\n  return x;\n}\n',
    'a.js': 'import { risky } from "./util.js";\nexport function useA() {\n  try {\n    return risky(1);\n  } catch (e) {\n    return 0;\n  }\n}\n',
    'b.js': 'import { risky } from "./util.js";\nexport function useB() {\n  return risky(2).catch(() => 0);\n}\n',
    'c.js': 'import { risky } from "./util.js";\nexport function useC() {\n  return risky(3);\n}\n',
  });
  try {
    const card = explain(graph, 'risky');
    assert.equal(card.callersRelyOn.handlesErrors, 2, 'try/catch site + .catch site, not the plain one');
    assert.match(card.summary, /2 caller\(s\) handle errors from this — thrown types are contract/);
  } finally { cleanup(dir); }
});

test('G2: a callee that mutates its parameter is flagged — callers share that object', () => {
  const { dir, graph } = buildMapped({
    'util.js': 'export function decorate(opts) {\n  opts.decorated = true;\n  opts.items.push(1);\n  return opts;\n}\n',
    'a.js': 'import { decorate } from "./util.js";\nexport function useA() {\n  return decorate({ items: [] });\n}\n',
  });
  try {
    const card = explain(graph, 'decorate');
    assert.deepEqual(card.callersRelyOn.mutatesParams, ['opts'], 'the mutated parameter is named');
    assert.match(card.summary, /mutates its argument "opts" — callers share that object/);
  } finally { cleanup(dir); }
});

test('G3: null-checked results surface as nullability reliance', () => {
  const { dir, graph } = buildMapped({
    'util.js': 'export function findUser(id) {\n  return id > 0 ? { id } : null;\n}\n',
    'a.js': 'import { findUser } from "./util.js";\nexport function useA() {\n  return findUser(1)?.id;\n}\n',
    'b.js': 'import { findUser } from "./util.js";\nexport function useB() {\n  return findUser(2) ?? { id: 0 };\n}\n',
    'c.js': 'import { findUser } from "./util.js";\nexport function useC() {\n  if (!findUser(3)) {\n    return null;\n  }\n  return 1;\n}\n',
    'd.js': 'import { findUser } from "./util.js";\nexport function useD() {\n  return findUser(4);\n}\n',
  });
  try {
    const card = explain(graph, 'findUser');
    assert.equal(card.callersRelyOn.nullChecked, 3, '?. and ?? and if(!…) sites, not the plain one');
    assert.match(card.summary, /3 caller\(s\) null-check the result — keep null\/undefined returns possible/);
  } finally { cleanup(dir); }
});

test('G4 (control): none of the evidence -> none of the claims', () => {
  const { dir, graph } = buildMapped({
    'util.js': 'export function plain(x) {\n  const y = x + 1;\n  return y;\n}\n',
    'a.js': 'import { plain } from "./util.js";\nexport function useA() {\n  return plain(1);\n}\n',
  });
  try {
    const card = explain(graph, 'plain');
    assert.equal(card.callersRelyOn.handlesErrors, undefined, 'no exception claim');
    assert.equal(card.callersRelyOn.mutatesParams, undefined, 'no mutation claim');
    assert.equal(card.callersRelyOn.nullChecked, undefined, 'no nullability claim');
    assert.ok(!/handle errors|mutates its argument|null-check/.test(card.summary), 'no v2 card lines');
  } finally { cleanup(dir); }
});
