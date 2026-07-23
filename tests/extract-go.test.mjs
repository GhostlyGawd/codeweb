import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runNode, script, tmpDir, cleanup, writeTree, readJSON, hasEdge } from './helpers.mjs';
import { runExtract } from '../scripts/extract-symbols.mjs'; // finding #40 (T-40.5): extractor in-process

// Go on the deterministic fast path: func/type(struct|interface) become nodes; a func with a
// receiver `func (r R) M()` is a method, a plain `func F()` is a function; Go visibility (an
// uppercase initial) sets exports. In-body calls wire by name with the same ambiguity-drop
// precision as the other paths. Body extent is brace-matched (Go is braced) — no separate pipeline.
const FIXTURE = {
  'math.go': `package math

type Calculator struct {
	value int
}

func Add(a int, b int) int {
	return a + b
}

func helper() int {
	return Add(1, 2)
}

func (c Calculator) Compute() int {
	return helper()
}

func (c *Calculator) Reset() {
	c.value = 0
}

type Shape interface {
	Area() float64
}
`,
};

async function extract() {
  const dir = tmpDir('codeweb-go-');
  writeTree(dir, FIXTURE);
  const { fragment } = await runExtract({ path: dir, ctags: false });
  return { dir, g: fragment };
}

test('Go: func/method/struct/interface become nodes with the right kind and Go visibility', async () => {
  const { dir, g } = await extract();
  try {
    const byId = new Map(g.nodes.map((n) => [n.id, n]));
    const add = byId.get('math.go:Add');
    const helper = byId.get('math.go:helper');
    const calc = byId.get('math.go:Calculator');
    const compute = byId.get('math.go:Calculator.Compute');
    const reset = byId.get('math.go:Calculator.Reset');
    const shape = byId.get('math.go:Shape');

    assert.ok(add && add.kind === 'function', 'plain func -> function');
    assert.equal(add.exports, true, 'uppercase initial -> exported');
    assert.ok(helper && helper.kind === 'function', 'lowercase func -> function');
    assert.equal(helper.exports, false, 'lowercase initial -> not exported');
    assert.ok(calc && calc.kind === 'class', 'struct -> class');
    assert.ok(compute && compute.kind === 'method', 'func with value receiver -> method (receiver-qualified id)');
    assert.ok(reset && reset.kind === 'method', 'func with pointer receiver -> method');
    assert.ok(shape && shape.kind === 'class', 'interface -> class');
    assert.deepEqual(add.signature && add.signature.params, ['a', 'b'], 'space-typed Go params parsed');
  } finally {
    cleanup(dir);
  }
});

test('Go: in-body calls wire by name (with ambiguity drop)', async () => {
  const { dir, g } = await extract();
  try {
    assert.ok(hasEdge(g.edges, 'math.go:helper', 'math.go:Add', 'call'), 'helper() calls Add()');
    assert.ok(hasEdge(g.edges, 'math.go:Calculator.Compute', 'math.go:helper', 'call'), 'Compute() calls helper()');
  } finally {
    cleanup(dir);
  }
});

test('Go: meta.languages reports go', async () => {
  const { dir, g } = await extract();
  try {
    assert.ok(g.meta.languages.includes('go'), 'languages includes go');
  } finally {
    cleanup(dir);
  }
});
