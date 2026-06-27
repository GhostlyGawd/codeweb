import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runNode, script, tmpDir, cleanup, writeTree, readJSON, hasEdge } from './helpers.mjs';

// Rust `use` imports: a `use crate::m::foo;` (a) becomes a module-scope import edge (a dependent of
// the imported symbol, attributed to the Rust module node `<file>:<stem>`) and (b) registers an alias
// so a later bare `foo(...)` in that file resolves cross-file to the imported symbol's id — mirroring
// the JS/Python alias+importEdges path. PRECISION: `foo` is defined twice here (m.rs + other_mod.rs),
// so a bare `foo(...)` in a file that did NOT `use` it stays ambiguous -> dropped (no phantom edge).
const FIXTURE = {
  // crate root: declares the modules and re-exports foo (`pub use` -> re-export import edge).
  'src/lib.rs': `mod m;
mod consumer;
mod other_mod;
mod stranger;

pub use crate::m::foo;
`,
  // def file: the canonical foo.
  'src/m.rs': `pub fn foo(a: i32) -> i32 {
    a + 1
}
`,
  // second foo -> makes the bare name AMBIGUOUS across the crate.
  'src/other_mod.rs': `pub fn foo(b: i32) -> i32 {
    b + 2
}
`,
  // imports foo via `use` then calls it -> cross-file CALL edge to m.rs:foo.
  'src/consumer.rs': `use crate::m::foo;

pub fn run_it(v: i32) -> i32 {
    foo(v)
}
`,
  // calls foo WITHOUT a use and WITHOUT a local foo -> ambiguous -> must NOT edge to m.rs:foo.
  'src/stranger.rs': `pub fn stray(v: i32) -> i32 {
    foo(v)
}
`,
};

function extract() {
  const dir = tmpDir('codeweb-rust-use-');
  writeTree(dir, FIXTURE);
  const frag = join(dir, 'fragment.json');
  const r = runNode(script('extract-symbols.mjs'), [dir, '--out', frag, '--no-ctags']);
  assert.equal(r.status, 0, r.stderr);
  return { dir, g: readJSON(frag) };
}

test('Rust use: cross-file call resolves via the use alias', () => {
  const { dir, g } = extract();
  try {
    assert.ok(
      hasEdge(g.edges, 'src/consumer.rs:run_it', 'src/m.rs:foo', 'call'),
      'foo() resolves to m.rs:foo because consumer `use`d it',
    );
  } finally {
    cleanup(dir);
  }
});

test('Rust use: the use site becomes a module-scope import edge', () => {
  const { dir, g } = extract();
  try {
    const byId = new Map(g.nodes.map((n) => [n.id, n]));
    assert.ok(byId.get('src/consumer.rs:consumer'), 'a Rust module node (file stem) is created on demand');
    assert.equal(byId.get('src/consumer.rs:consumer').kind, 'module', 'module node kind');
    assert.ok(
      hasEdge(g.edges, 'src/consumer.rs:consumer', 'src/m.rs:foo', 'import'),
      'use crate::m::foo -> import edge from the consumer module',
    );
  } finally {
    cleanup(dir);
  }
});

test('Rust use: pub use re-export is an import edge from the crate root module', () => {
  const { dir, g } = extract();
  try {
    assert.ok(
      hasEdge(g.edges, 'src/lib.rs:lib', 'src/m.rs:foo', 'import'),
      'pub use crate::m::foo -> import edge from lib.rs:lib',
    );
  } finally {
    cleanup(dir);
  }
});

test('Rust use: a bare same-name call WITHOUT a use stays ambiguous (no phantom edge)', () => {
  const { dir, g } = extract();
  try {
    assert.ok(
      !hasEdge(g.edges, 'src/stranger.rs:stray', 'src/m.rs:foo'),
      'stranger did not `use` foo and foo is ambiguous -> no edge',
    );
    assert.ok(
      !hasEdge(g.edges, 'src/stranger.rs:stray', 'src/other_mod.rs:foo'),
      'no phantom edge to the sibling foo either',
    );
  } finally {
    cleanup(dir);
  }
});
