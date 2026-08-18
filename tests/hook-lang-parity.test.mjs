// The Claude-plugin edit hooks must treat a newly first-class language exactly like a long-standing
// one. `SRC_RE` (scripts/lib/common.mjs) is the single gate both hooks consult, so an extension it
// does not match is not "unsupported" in any visible way — the hook simply returns null and the
// agent edits a load-bearing C file with no blast-radius card and no post-edit cycle check. That is
// a SILENT loss of the guard, which is why this file proves the hooks fire behaviorally rather than
// asserting the regex alone: the regex is already pinned by extract-c/extract-cpp, but a regex hit
// says nothing about whether the hook downstream of it produced a card.
//
// The comparison is against a `.js` fixture of identical SHAPE (a depended-on definition in one
// file, its caller in another), so "the same class of guard output" is a claim about structure —
// same fields, same counts, same channel — not about wording.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, script, tmpDir, cleanup, writeTree, PLUGIN_ROOT } from './helpers.mjs';
import { preview } from '../hooks/pre-edit-impact.mjs';
import { SRC_RE } from '../scripts/lib/common.mjs';

// The VAL-HARD-020 probe: every C and C++ extension the extractor claims must be a mappable
// source file to the hooks. Eight extensions, eight trues.
test('SRC_RE matches every C/C++ extension the extractor claims', () => {
  const exts = ['a.c', 'a.h', 'a.cpp', 'a.cc', 'a.cxx', 'a.hpp', 'a.hh', 'a.hxx'];
  assert.deepEqual(exts.map((f) => SRC_RE.test(f)), exts.map(() => true),
    'a hook gate that misses an extension silently drops the guard for that language');
});

/** Map a fixture tree and return its root — the hooks are inert until `.codeweb/graph.json` exists. */
function mapped(prefix, files) {
  const dir = tmpDir(prefix);
  writeTree(dir, files);
  mkdirSync(join(dir, '.codeweb'), { recursive: true });
  const r = runNode(script('run.mjs'), [dir, '--out-dir', join(dir, '.codeweb')]);
  assert.equal(r.status, 0, r.stderr);
  return dir;
}

// Same shape in both languages: `used`/`runner` in separate files, the caller importing/including
// the definition's header. Anything the hook says about one it must say about the other.
// Names are ≥3 chars in both trees — the extractor drops 1-2-char bare cross-file names as the
// measured ambiguity magnet, which would silence the cycle case for reasons unrelated to language.
const C_TREE = {
  'core/util.h': '#ifndef UTIL_H\n#define UTIL_H\n\nint used(void);\n\n#endif\n',
  'core/util.c': '#include "util.h"\n\nint used(void) {\n  return 1;\n}\n',
  'app/main.c': '#include "../core/util.h"\n\nint runner(void) {\n  return used();\n}\n',
};
const JS_TREE = {
  'core/util.js': 'export function used() {\n  return 1;\n}\n',
  'app/main.js': 'import { used } from "../core/util.js";\nexport function runner() {\n  return used();\n}\n',
};

const CARD_FIELDS = [
  [/(\d+) symbol\(s\)/, 'symbol count'],
  [/(\d+) in-repo dependent edge\(s\)/, 'dependent-edge count'],
  [/most depended-on: (\w+) ×(\d+)/, 'the most-depended-on symbol'],
  [/top callers: (\S+)/, 'the top-caller list'],
  [/codeweb_context/, 'the bounded-window pointer'],
  [/codeweb_impact/, 'the blast-radius pointer'],
];

test('pre-edit hook: a .c edit produces the same class of card as a .js edit', async () => {
  const cDir = mapped('codeweb-hook-c-', C_TREE);
  const jsDir = mapped('codeweb-hook-js-', JS_TREE);
  try {
    const payload = (fp) => JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: fp } });
    const cCard = await preview(payload(join(cDir, 'core/util.c')));
    const jsCard = await preview(payload(join(jsDir, 'core/util.js')));

    assert.ok(cCard, 'the .c edit is guarded — a null here is the silent skip this test exists for');
    assert.ok(jsCard, 'the .js control is guarded');

    for (const [re, what] of CARD_FIELDS) {
      assert.match(jsCard, re, `the .js control card carries ${what}`);
      assert.match(cCard, re, `the .c card carries ${what} — same guard class`);
    }
    // Same fixture shape ⇒ the same numbers, not merely the same fields.
    assert.match(cCard, /core\/util\.c: 1 symbol\(s\), 1 in-repo dependent edge\(s\) \(most depended-on: used ×1\)/);
    assert.match(jsCard, /core\/util\.js: 1 symbol\(s\), 1 in-repo dependent edge\(s\) \(most depended-on: used ×1\)/);
    assert.match(cCard, /top callers: app\/main\.c:runner/, 'the C caller is named across the header boundary');
    assert.match(jsCard, /top callers: app\/main\.js:runner/);
  } finally {
    cleanup(cDir);
    cleanup(jsDir);
  }
});

test('pre-edit hook: the .c card ships on the same structured channel, still advisory', () => {
  const dir = mapped('codeweb-hook-c-env-', C_TREE);
  try {
    const r = spawnSync(process.execPath, [join(PLUGIN_ROOT, 'hooks', 'pre-edit-impact.mjs')], {
      input: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: join(dir, 'core/util.c') } }),
      encoding: 'utf8',
    });
    assert.equal(r.status, 0, 'always non-blocking');
    const envelope = JSON.parse(r.stdout);
    assert.equal(envelope.hookSpecificOutput.hookEventName, 'PreToolUse');
    assert.match(envelope.hookSpecificOutput.additionalContext, /editing core\/util\.c/);
    assert.equal(envelope.hookSpecificOutput.permissionDecision, undefined,
      'API.md F10: an advisory surface issues no permission verdict, in any language');
  } finally { cleanup(dir); }
});

test('post-edit hook: a cycle introduced by a .c edit is flagged, as it is for .js', () => {
  const cDir = mapped('codeweb-hook-c-cyc-', C_TREE);
  const jsDir = mapped('codeweb-hook-js-cyc-', JS_TREE);
  try {
    // Close the loop in each tree: the definition file now calls back into its caller.
    writeFileSync(join(cDir, 'app/main.h'), '#ifndef MAIN_H\n#define MAIN_H\n\nint runner(void);\n\n#endif\n');
    writeFileSync(join(cDir, 'core/util.c'), '#include "util.h"\n#include "../app/main.h"\n\nint used(void) {\n  return runner();\n}\n');
    writeFileSync(join(jsDir, 'core/util.js'), 'import { runner } from "../app/main.js";\nexport function used() {\n  return runner();\n}\n');

    const runHook = (fp) => spawnSync(process.execPath, [join(PLUGIN_ROOT, 'hooks', 'post-edit-diff.mjs')], {
      input: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: fp } }),
      encoding: 'utf8',
    });
    const cRes = runHook(join(cDir, 'core/util.c'));
    const jsRes = runHook(join(jsDir, 'core/util.js'));

    for (const [res, label] of [[jsRes, '.js control'], [cRes, '.c edit']]) {
      assert.equal(res.status, 0, `${label}: fail-open exit 0`);
      assert.match(res.stdout || '', /additionalContext/, `${label}: warning rides the structured channel`);
      assert.match(res.stdout || '', /cycle/i, `${label}: the new dependency cycle is named`);
    }
  } finally {
    cleanup(cDir);
    cleanup(jsDir);
  }
});
