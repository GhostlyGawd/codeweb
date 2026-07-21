// #14 (IMPROVEMENTS.md): Ruby + PHP join the dispatch tier, same contract as Spec F —
// the regex tier keeps owning NODES; the AST tier contributes only the receiver-attributed
// call edges regex precision-gates away.
//
// Ruby has no static types, so its win is self./IMPLICIT-receiver calls inside a class (the
// parser has already decided `prepare(1)` is a call, so wiring it to a sibling method is
// precision-safe; a bare identifier is not a call node and stays unwired). PHP gets both
// `$this->m()` and the `Type $p` typed-receiver intent under the one-owner rule.
// Kotlin/Swift stay regex-only: no trusted ABI-14/15 wasm exists (grammar repos ship C sources
// and native prebuilds only) — recorded in scripts/grammars/PROVENANCE.md, revisit when
// @vscode/tree-sitter-wasm grows them.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, tmpDir, cleanup, writeTree, script, readJSON, PLUGIN_ROOT } from './helpers.mjs';

const EXTRACT = script('extract-symbols.mjs');
const hasEngine = (lang) => existsSync(join(PLUGIN_ROOT, 'scripts', 'grammars', `tree-sitter-${lang}.wasm`)) && existsSync(join(PLUGIN_ROOT, 'node_modules', 'web-tree-sitter'));

const FIXTURES = {
  ruby: {
    files: {
      'src/pipe.rb': "class Pipe\n  def run(x)\n    self.check(x)\n    prepare(x)\n  end\n  def check(v)\n    v\n  end\n  def prepare(v)\n    v\n  end\nend\n",
      'src/loose.rb': "def loose(q)\n  q.run(3)\nend\n",
    },
    edges: [
      ['pipe.rb:Pipe.run', 'pipe.rb:Pipe.check'],   // self.check
      ['pipe.rb:Pipe.run', 'pipe.rb:Pipe.prepare'], // implicit receiver, parser-verified call
    ],
  },
  php: {
    files: {
      'src/Pipe.php': "<?php\nclass Pipe {\n  public function run(int $x) {\n    $this->check($x);\n    return $x;\n  }\n  public function check($v) { return $v; }\n}\n",
      'src/Boot.php': "<?php\nrequire 'Pipe.php';\nclass Boot {\n  public function go(Pipe $p) {\n    return $p->run(2);\n  }\n}\n",
      'src/Loose.php': "<?php\nclass Loose {\n  public function anything($q) {\n    return $q->run(3);\n  }\n}\n",
    },
    edges: [
      ['Pipe.php:Pipe.run', 'Pipe.php:Pipe.check'], // $this->check
      ['Boot.php:Boot.go', 'Pipe.php:Pipe.run'],    // typed receiver Pipe $p, one owner
    ],
  },
};

function extract(dir, args = []) {
  const out = join(dir, `f${args.length}.json`);
  const r = runNode(EXTRACT, [join(dir, 'src'), '--no-ctags', '--out', out, ...args]);
  assert.equal(r.status, 0, r.stderr);
  return { frag: readJSON(out), stderr: r.stderr, bytes: readFileSync(out, 'utf8') };
}
const callEdges = (frag) => new Set(frag.edges.filter((e) => e.kind === 'call').map((e) => `${e.from}>${e.to}`));

for (const [lang, fx] of Object.entries(FIXTURES)) {
  test(`${lang}: dispatch wires self/implicit/typed calls; engines stay node-identical; deterministic`, { skip: hasEngine(lang) ? false : `${lang} grammar unavailable` }, () => {
    const dir = tmpDir(`codeweb-disp-${lang}-`);
    try {
      writeTree(dir, fx.files);
      const ast = extract(dir);
      const edges = callEdges(ast.frag);
      for (const [from, to] of fx.edges) {
        assert.ok(edges.has(`${from}>${to}`), `${from} -> ${to} wired (have: ${[...edges].join(' | ') || 'none'})`);
      }
      assert.ok(![...edges].some((e) => e.includes('loose') || e.includes('Loose')), 'untyped receivers wire nothing');
      const regex = extract(dir, ['--engine', 'regex']);
      assert.deepEqual(ast.frag.nodes, regex.frag.nodes, 'regex owns the nodes in both engines');
      const again = extract(dir);
      assert.equal(ast.bytes, again.bytes, 'byte-identical across runs');
    } finally { cleanup(dir); }
  });
}

test('php: two same-named owners -> the typed call is dropped, never guessed', { skip: hasEngine('php') ? false : 'php grammar unavailable' }, () => {
  const dir = tmpDir('codeweb-dispamb-php-');
  try {
    writeTree(dir, {
      'src/A.php': "<?php\nclass Store {\n  public function save() { return 1; }\n}\n",
      'src/B.php': "<?php\nclass Store {\n  public function save() { return 2; }\n}\n",
      'src/Use.php': "<?php\nclass UseIt {\n  public function u(Store $s) {\n    return $s->save();\n  }\n}\n",
    });
    const out = join(dir, 'f.json');
    const r = runNode(EXTRACT, [join(dir, 'src'), '--no-ctags', '--out', out]);
    assert.equal(r.status, 0, r.stderr);
    const frag = readJSON(out);
    const bad = frag.edges.filter((e) => e.kind === 'call' && /Use\.php/.test(e.from) && /Store\.save/.test(e.to));
    assert.deepEqual(bad, [], `ambiguous receiver type wired nothing (${JSON.stringify(bad)})`);
  } finally { cleanup(dir); }
});

test('ruby: a bare identifier (not a call node) never wires; cross-class names never wire implicitly', { skip: hasEngine('ruby') ? false : 'ruby grammar unavailable' }, () => {
  const dir = tmpDir('codeweb-dispamb-ruby-');
  try {
    writeTree(dir, {
      // `other` is a bare identifier statement (could be a local); `helper` exists only on the
      // OTHER class — neither may wire.
      'src/a.rb': "class A\n  def run\n    other\n    helper(1)\n  end\nend\n",
      'src/b.rb': "class B\n  def helper(x)\n    x\n  end\nend\n",
    });
    const out = join(dir, 'f.json');
    const r = runNode(EXTRACT, [join(dir, 'src'), '--no-ctags', '--out', out]);
    assert.equal(r.status, 0, r.stderr);
    const frag = readJSON(out);
    const bad = frag.edges.filter((e) => e.kind === 'call' && /a\.rb:A\.run/.test(e.from) && /(other|B\.helper)/.test(e.to));
    assert.deepEqual(bad, [], `no cross-class or bare-identifier dispatch (${JSON.stringify(bad)})`);
  } finally { cleanup(dir); }
});
