// Spec F (docs/specs/dispatch-py-go-rust.md): the dispatch recall gap closes for Python, Go,
// and Rust the same way it did for Java/C# — the regex tier keeps owning NODES; the AST tier
// contributes only the receiver-attributed call edges regex precision-gates away.
//
// Per language: (a) self/receiver-typed calls wire to the owner-qualified method id;
// (b) an ambiguous receiver type (two same-named owners) wires NOTHING and is counted;
// (c) untyped/expression receivers wire nothing; (d) node sets are byte-identical between
// engines; (e) two runs are byte-identical; (f) --engine regex carries zero dispatch edges.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, tmpDir, cleanup, writeTree, script, readJSON, PLUGIN_ROOT } from './helpers.mjs';

const EXTRACT = script('extract-symbols.mjs');
const hasEngine = (lang) => existsSync(join(PLUGIN_ROOT, 'scripts', 'grammars', `tree-sitter-${lang}.wasm`)) && existsSync(join(PLUGIN_ROOT, 'node_modules', 'web-tree-sitter'));

const FIXTURES = {
  python: {
    files: {
      'src/pipe.py': 'class Pipe:\n    def run(self, x):\n        return self.check(x)\n    def check(self, v):\n        return v\n',
      'src/boot.py': 'from .pipe import Pipe\n\ndef boot(p: Pipe):\n    return p.run(2)\n',
      'src/loose.py': 'def loose(q):\n    return q.run(3)\n',
    },
    edges: [
      ['pipe.py:Pipe.run', 'pipe.py:Pipe.check'],
      ['boot.py:boot', 'pipe.py:Pipe.run'],
    ],
    ambig: {
      'src/a.py': 'class Store:\n    def save(self):\n        return 1\n',
      'src/b.py': 'class Store:\n    def save(self):\n        return 2\n',
      'src/use.py': 'def use(s: Store):\n    return s.save()\n',
    },
  },
  go: {
    files: {
      'src/pipe.go': 'package m\n\ntype Pipe struct{}\n\nfunc (p *Pipe) Run(x int) int {\n\treturn p.Check(x)\n}\n\nfunc (p *Pipe) Check(v int) int {\n\treturn v\n}\n',
      'src/boot.go': 'package m\n\nfunc Boot(q Pipe) int {\n\treturn q.Run(2)\n}\n',
      'src/loose.go': 'package m\n\nfunc Loose(z interface{}) int {\n\treturn 0\n}\n',
    },
    edges: [
      ['pipe.go:Pipe.Run', 'pipe.go:Pipe.Check'],
      ['boot.go:Boot', 'pipe.go:Pipe.Run'],
    ],
    ambig: {
      'src/a.go': 'package m\n\ntype Store struct{}\n\nfunc (s *Store) Save() int {\n\treturn 1\n}\n',
      'src/b.go': 'package n\n\ntype Store struct{}\n\nfunc (s *Store) Save() int {\n\treturn 2\n}\n',
      'src/use.go': 'package m\n\nfunc Use(s Store) int {\n\treturn s.Save()\n}\n',
    },
  },
  rust: {
    files: {
      'src/pipe.rs': 'pub struct Pipe;\n\nimpl Pipe {\n    pub fn run(&self, x: i32) -> i32 {\n        self.check(x)\n    }\n    pub fn check(&self, v: i32) -> i32 {\n        v\n    }\n}\n',
      'src/boot.rs': 'use crate::pipe::Pipe;\n\npub fn boot(p: &Pipe) -> i32 {\n    p.run(2)\n}\n',
      'src/loose.rs': 'pub fn loose(v: i32) -> i32 {\n    v\n}\n',
    },
    edges: [
      ['pipe.rs:Pipe.run', 'pipe.rs:Pipe.check'],
      ['boot.rs:boot', 'pipe.rs:Pipe.run'],
    ],
    ambig: {
      'src/a.rs': 'pub struct Store;\nimpl Store {\n    pub fn save(&self) -> i32 {\n        1\n    }\n}\n',
      'src/b.rs': 'pub struct Store;\nimpl Store {\n    pub fn save(&self) -> i32 {\n        2\n    }\n}\n',
      'src/use.rs': 'pub fn use_it(s: &Store) -> i32 {\n    s.save()\n}\n',
    },
  },
};

function extract(dir, args = []) {
  const out = join(dir, `f${Math.random().toString(36).slice(2, 8)}.json`);
  const r = runNode(EXTRACT, [join(dir, 'src'), '--no-ctags', '--out', out, ...args]);
  assert.equal(r.status, 0, r.stderr);
  return { frag: readJSON(out), stderr: r.stderr, bytes: readFileSync(out, 'utf8') };
}
const callEdges = (frag) => new Set(frag.edges.filter((e) => e.kind === 'call').map((e) => `${e.from}>${e.to}`));

for (const [lang, fx] of Object.entries(FIXTURES)) {
  test(`${lang}: dispatch wires self+typed calls, drops ambiguity, keeps engines node-identical`, { skip: hasEngine(lang) ? false : `${lang} grammar unavailable` }, () => {
    const dir = tmpDir(`codeweb-disp-${lang}-`);
    try {
      writeTree(dir, fx.files);
      const ast = extract(dir);
      const edges = callEdges(ast.frag);
      for (const [from, to] of fx.edges) {
        assert.ok(edges.has(`${from}>${to}`), `(a) ${from} -> ${to} wired (have: ${[...edges].join(' | ')})`);
      }
      // (c) the untyped/loose file contributed no dispatch edge
      assert.ok(![...edges].some((e) => e.startsWith(`loose.`)), '(c) untyped receivers wire nothing');
      // (d) node sets byte-identical between engines
      const regex = extract(dir, ['--engine', 'regex']);
      assert.deepEqual(ast.frag.nodes, regex.frag.nodes, '(d) regex owns the nodes in both engines');
      // (f) regex opts out of every dispatch edge — the cross-file typed edge cannot exist there
      const [xFrom, xTo] = fx.edges[1];
      assert.ok(!callEdges(regex.frag).has(`${xFrom}>${xTo}`), '(f) the typed-receiver edge is AST-only');
      assert.ok(!/wired [1-9]/.test(regex.stderr), '(f) regex engine wires no dispatch edges');
      // (e) determinism
      const again = extract(dir);
      assert.equal(ast.bytes, again.bytes, '(e) byte-identical across runs');
    } finally { cleanup(dir); }
  });

  test(`${lang}: two same-named owners -> the typed call is dropped and counted, never guessed`, { skip: hasEngine(lang) ? false : `${lang} grammar unavailable` }, () => {
    const dir = tmpDir(`codeweb-dispamb-${lang}-`);
    try {
      writeTree(dir, fx.ambig);
      const { frag, stderr } = extract(dir);
      const bad = [...callEdges(frag)].filter((e) => /use[^>]*>.*Store\.[Ss]ave/.test(e));
      assert.deepEqual(bad, [], `(b) ambiguous receiver type wired nothing (${bad.join(',')})`);
      assert.match(stderr, /dropped \d+ \(ambiguous\/absent\)|typed-dispatch/, '(b) the drop is visible in the banner');
    } finally { cleanup(dir); }
  });
}
