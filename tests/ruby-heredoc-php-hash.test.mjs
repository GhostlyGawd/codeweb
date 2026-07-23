// Round 2, finding #13 — two languages fed unmasked text to the scanners:
//   T-13.1 — Ruby's symbol scan ran on RAW text (only .py used the mask) and maskRuby had no
//            heredoc state: a `<<~SQL` body containing `helper(1)` and `def phantom_method`
//            produced a phantom NODE and a fabricated `<module> -> helper` call edge. maskRuby is
//            now a stateful line loop (FIFO queue of pending heredoc tags; body/terminator lines
//            emit as empty lines; the opener TOKEN masks to the literal '' so `<<~SQL.strip`
//            stays live code), and lang-rules routes .rb through masked('rb').
//   T-13.2 — PHP routes through maskJs, which did not know `#` comments: `# legacy note:
//            helper(1)` fabricated a module -> helper call. maskJs gains {hashComment} (set for
//            .php only — JS private fields are unaffected).
//
// --no-ctags forces the deterministic regex scanner (the path that does the masking).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runNode, tmpDir, cleanup, writeTree, readJSON, script, hasEdge } from './helpers.mjs';

function extract(files, tag) {
  const dir = tmpDir(`codeweb-hdphp-${tag}-`);
  writeTree(dir, files);
  const out = join(dir, 'fragment.json');
  const res = runNode(script('extract-symbols.mjs'), [dir, '--target', `hdphp-${tag}`, '--no-ctags', '--out', out]);
  assert.equal(res.status, 0, `extractor exited non-zero:\n${res.stderr}`);
  return { dir, frag: readJSON(out) };
}

test('T-13.1: a Ruby heredoc body fabricates no symbol and no edge; real code stays live', () => {
  const { dir, frag: f } = extract({
    'db.rb':
      'def helper(x)\n' +
      '  x\n' +
      'end\n' +
      'SQL = <<~SQL\n' +
      '  SELECT helper(1) FROM t\n' +
      '  def phantom_method\n' +
      'SQL\n' +
      'def real_caller\n' +
      '  helper(2)\n' +
      'end\n',
  }, 'rb');
  try {
    assert.ok(!f.nodes.some((n) => n.label === 'phantom_method'),
      'a `def` inside a heredoc body must not become a node');
    assert.ok(!hasEdge(f.edges, 'db.rb:<module>', 'db.rb:helper'),
      'the heredoc body call helper(1) must fabricate no module-scope edge');
    assert.ok(hasEdge(f.edges, 'db.rb:real_caller', 'db.rb:helper'),
      'real_caller -> helper survives the masking');
  } finally { cleanup(dir); }
});

test('T-13.2: a PHP `#` comment fabricates no edge; the real call edges', () => {
  const { dir, frag: f } = extract({
    'x.php':
      '<?php\n' +
      'function helper($x) { return $x; }\n' +
      '# legacy note: helper(1)\n' +
      'function real() { return helper(2); }\n',
  }, 'php');
  try {
    const toHelper = f.edges.filter((e) => e.kind === 'call' && e.to === 'x.php:helper');
    assert.equal(toHelper.length, 1, `exactly one call edge to helper, got ${JSON.stringify(toHelper)}`);
    assert.equal(toHelper[0].from, 'x.php:real', 'the one caller is real() (module-scope fabrication gone)');
  } finally { cleanup(dir); }
});
