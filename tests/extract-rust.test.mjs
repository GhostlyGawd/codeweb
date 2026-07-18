import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runNode, script, tmpDir, cleanup, writeTree, readJSON, hasEdge } from './helpers.mjs';

// Rust on the deterministic fast path: fn/struct/enum/trait become nodes, indented `fn` inside an
// impl is a method, `pub` sets exports, and bare in-body calls wire by name with the same
// ambiguity-drop precision as the JS/Python paths. Body extent is brace-matched (Rust is braced),
// reusing the existing engine — no separate Rust pipeline.
const FIXTURE = {
  'math.rs': `
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

fn helper() -> i32 {
    add(1, 2)
}

pub struct Calculator {
    value: i32,
}

impl Calculator {
    pub fn new() -> Self {
        Calculator { value: 0 }
    }

    fn compute(&self) -> i32 {
        helper()
    }
}
`,
};

function extract() {
  const dir = tmpDir('codeweb-rust-');
  writeTree(dir, FIXTURE);
  const frag = join(dir, 'fragment.json');
  const r = runNode(script('extract-symbols.mjs'), [dir, '--out', frag, '--no-ctags']);
  assert.equal(r.status, 0, r.stderr);
  return { dir, g: readJSON(frag) };
}

test('Rust: fn/struct/impl-method become nodes with the right kind and exports', () => {
  const { dir, g } = extract();
  try {
    const byId = new Map(g.nodes.map((n) => [n.id, n]));
    const add = byId.get('math.rs:add');
    const helper = byId.get('math.rs:helper');
    const calc = byId.get('math.rs:Calculator');
    const ctor = byId.get('math.rs:Calculator.new');
    const compute = byId.get('math.rs:Calculator.compute');

    assert.ok(add && add.kind === 'function', 'top-level fn -> function');
    assert.equal(add.exports, true, 'pub fn is exported');
    assert.ok(helper && helper.kind === 'function', 'non-pub top-level fn -> function');
    assert.equal(helper.exports, false, 'non-pub fn is not exported');
    assert.ok(calc && calc.kind === 'class', 'struct -> class kind');
    assert.ok(ctor && ctor.kind === 'method', 'fn inside impl -> method');
    assert.ok(compute && compute.kind === 'method', 'indented fn -> method');
    // signature params are extracted even though Rust returns (-> T) are not
    assert.deepEqual(add.signature && add.signature.params, ['a', 'b'], 'params parsed from a Rust fn');
  } finally {
    cleanup(dir);
  }
});

test('Rust: in-body calls wire by name (with ambiguity drop)', () => {
  const { dir, g } = extract();
  try {
    assert.ok(hasEdge(g.edges, 'math.rs:helper', 'math.rs:add', 'call'), 'helper() calls add()');
    assert.ok(hasEdge(g.edges, 'math.rs:Calculator.compute', 'math.rs:helper', 'call'), 'compute() calls helper()');
  } finally {
    cleanup(dir);
  }
});

test('Rust: meta.languages reports rust', () => {
  const { dir, g } = extract();
  try {
    assert.ok(g.meta.languages.includes('rust'), 'languages includes rust');
  } finally {
    cleanup(dir);
  }
});
