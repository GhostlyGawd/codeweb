// extract-symbols.mjs must run main() when it is invoked through a SYMLINKED path.
//
// The guard compares argv[1] to import.meta.url. A lexical compare makes them differ whenever the
// caller reaches the script through a symlink (macOS `/tmp` -> `/private/tmp` is the everyday case),
// so the script exits 0 having written NOTHING — a silent no-op that looks like success. The
// benchmark harnesses sandbox under os.tmpdir() and were mis-measuring the pipeline because of it.
//
// Portable construction: build our own symlink to the scripts directory rather than relying on the
// host's /tmp being one, then invoke through it and assert the extractor actually produced output.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, symlinkSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, tmpDir, cleanup, writeTree, readJSON, SCRIPTS, script } from './helpers.mjs';

const FIXTURE = {
  'alpha.js': 'export function alpha() {\n  return beta();\n}\n',
  'beta.js': 'export function beta() {\n  return 1;\n}\n',
};

test('extract-symbols writes output when invoked through a symlinked script path', () => {
  const dir = tmpDir('codeweb-symlink-');
  try {
    const src = join(dir, 'src');
    writeTree(src, FIXTURE);
    const linkedScripts = join(dir, 'scripts-link');
    symlinkSync(realpathSync(SCRIPTS), linkedScripts, 'dir');

    const out = join(dir, 'fragment.json');
    const r = runNode(join(linkedScripts, 'extract-symbols.mjs'), [src, '--no-ctags', '--out', out]);

    assert.equal(r.status, 0, r.stderr);
    assert.ok(existsSync(out), 'invocation through a symlinked path must produce the fragment, not exit 0 silently');
    const frag = readJSON(out);
    assert.deepEqual(frag.nodes.map((n) => n.label).sort(), ['alpha', 'beta']);
  } finally { cleanup(dir); }
});

test('symlinked and real invocation paths produce the same fragment', () => {
  const dir = tmpDir('codeweb-symlink-');
  try {
    const src = join(dir, 'src');
    writeTree(src, FIXTURE);
    const linkedScripts = join(dir, 'scripts-link');
    symlinkSync(realpathSync(SCRIPTS), linkedScripts, 'dir');

    const viaLink = join(dir, 'via-link.json');
    const viaReal = join(dir, 'via-real.json');
    const a = runNode(join(linkedScripts, 'extract-symbols.mjs'), [src, '--no-ctags', '--out', viaLink]);
    const b = runNode(script('extract-symbols.mjs'), [src, '--no-ctags', '--out', viaReal]);

    assert.equal(a.status, 0, a.stderr);
    assert.equal(b.status, 0, b.stderr);
    const norm = (p) => { const g = readJSON(p); return { nodes: g.nodes.map((n) => n.id).sort(), edges: g.edges.map((e) => `${e.from} ${e.to} ${e.kind}`).sort() }; };
    assert.deepEqual(norm(viaLink), norm(viaReal));
  } finally { cleanup(dir); }
});
