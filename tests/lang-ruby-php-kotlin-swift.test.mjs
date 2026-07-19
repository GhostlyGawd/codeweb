// Spec I (docs/specs/lang-ruby-php-kotlin-swift.md): four more first-class languages on the
// deterministic regex fast path — discovery (owner-qualified methods), visibility-as-export,
// call edges under the same precision gate, test roles, package manifests. Per language:
// discovery fixture, phantom guard (keywords/comments produce no nodes), determinism.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, tmpDir, cleanup, writeTree, script, readJSON } from './helpers.mjs';

const EXTRACT = script('extract-symbols.mjs');

function extract(dir, args = []) {
  const out = join(dir, `f${Math.random().toString(36).slice(2, 8)}.json`);
  const r = runNode(EXTRACT, [join(dir, 'src'), '--no-ctags', '--engine', 'regex', '--out', out, ...args]);
  assert.equal(r.status, 0, r.stderr);
  return { frag: readJSON(out), bytes: readFileSync(out, 'utf8'), stderr: r.stderr };
}
const ids = (frag) => new Set(frag.nodes.map((n) => n.id));
const node = (frag, id) => frag.nodes.find((n) => n.id === id);
const hasCall = (frag, from, to) => frag.edges.some((e) => e.kind === 'call' && e.from === from && e.to === to);

test('ruby: classes, owner-qualified methods, self methods, top-level defs, calls, spec role', () => {
  const dir = tmpDir('codeweb-rb-');
  try {
    writeTree(dir, {
      'src/lib/order.rb': [
        'class Order',
        '  def total',
        '    tax_for(100)',
        '  end',
        '  def self.build',
        '    Order.new',
        '  end',
        'end',
        '',
        'def tax_for(amount)',
        '  amount * 0.2',
        'end',
        '',
        '# def commented_out',
        '',
      ].join('\n'),
      'src/spec/order_spec.rb': 'def test_total\n  tax_for(1)\nend\n',
    })
    const { frag } = extract(dir);
    assert.ok(ids(frag).has('lib/order.rb:Order'), 'class discovered');
    assert.ok(ids(frag).has('lib/order.rb:Order.total'), 'instance method owner-qualified');
    assert.ok(ids(frag).has('lib/order.rb:Order.build'), 'self. method owner-qualified');
    assert.ok(ids(frag).has('lib/order.rb:tax_for'), 'top-level def is a function');
    assert.equal(node(frag, 'lib/order.rb:tax_for').kind, 'function');
    assert.ok(!frag.nodes.some((n) => n.label === 'commented_out'), 'comments produce no nodes');
    assert.ok(hasCall(frag, 'lib/order.rb:Order.total', 'lib/order.rb:tax_for'), 'unique-global call wired');
    assert.equal(node(frag, 'spec/order_spec.rb:test_total').role, 'test', 'spec/ + _spec.rb is a test role');
  } finally { cleanup(dir); }
});

test('php: classes + visibility-as-export methods, functions, calls, test role', () => {
  const dir = tmpDir('codeweb-php-');
  try {
    writeTree(dir, {
      'src/lib/Cart.php': [
        '<?php',
        'class Cart {',
        '  public function total() {',
        '    return taxFor(100);',
        '  }',
        '  private function secret() {',
        '    return 1;',
        '  }',
        '}',
        'function taxFor($amount) {',
        '  return $amount * 0.2;',
        '}',
        '// function commentedOut() {}',
        '',
      ].join('\n'),
      'src/tests/CartTest.php': '<?php\nfunction test_total() {\n  return taxFor(1);\n}\n',
    });
    const { frag } = extract(dir);
    assert.ok(ids(frag).has('lib/Cart.php:Cart'), 'class discovered');
    assert.ok(ids(frag).has('lib/Cart.php:Cart.total'), 'method owner-qualified');
    assert.equal(node(frag, 'lib/Cart.php:Cart.total').exports, true, 'public method exported');
    assert.equal(node(frag, 'lib/Cart.php:Cart.secret').exports, false, 'private method not exported');
    assert.ok(!frag.nodes.some((n) => n.label === 'commentedOut'), 'comments produce no nodes');
    assert.ok(hasCall(frag, 'lib/Cart.php:Cart.total', 'lib/Cart.php:taxFor'), 'call wired');
    assert.equal(node(frag, 'tests/CartTest.php:test_total').role, 'test', '*Test.php is a test role');
  } finally { cleanup(dir); }
});

test('kotlin: classes/objects, methods, expression-bodied funs, internal/private visibility', () => {
  const dir = tmpDir('codeweb-kt-');
  try {
    writeTree(dir, {
      'src/main/Order.kt': [
        'class Order {',
        '  fun total(): Int {',
        '    return taxFor(100)',
        '  }',
        '  private fun secret() = 1',
        '}',
        'object Registry {',
        '  fun lookup(id: Int) = id',
        '}',
        'fun taxFor(amount: Int) = amount / 5',
        'internal fun helper() = 2',
        '// fun commentedOut() = 3',
        '',
      ].join('\n'),
    });
    const { frag } = extract(dir);
    assert.ok(ids(frag).has('main/Order.kt:Order'), 'class discovered');
    assert.ok(ids(frag).has('main/Order.kt:Order.total'), 'method owner-qualified');
    assert.ok(ids(frag).has('main/Order.kt:Registry.lookup'), 'object member owner-qualified');
    assert.equal(node(frag, 'main/Order.kt:taxFor').kind, 'function');
    assert.equal(node(frag, 'main/Order.kt:taxFor').exports, true, 'public-by-default exported');
    assert.equal(node(frag, 'main/Order.kt:Order.secret').exports, false, 'private not exported');
    assert.equal(node(frag, 'main/Order.kt:helper').exports, false, 'internal not exported');
    assert.ok(!frag.nodes.some((n) => n.label === 'commentedOut'), 'comments produce no nodes');
    assert.ok(hasCall(frag, 'main/Order.kt:Order.total', 'main/Order.kt:taxFor'), 'call wired');
  } finally { cleanup(dir); }
});

test('swift: structs/classes/extensions, methods, public/open visibility, Tests role', () => {
  const dir = tmpDir('codeweb-swift-');
  try {
    writeTree(dir, {
      'src/Sources/Order.swift': [
        'public struct Order {',
        '  public func total() -> Int {',
        '    return taxFor(100)',
        '  }',
        '  private func secret() -> Int { return 1 }',
        '}',
        'extension Order {',
        '  public func formatted() -> String {',
        '    return String(total())',
        '  }',
        '}',
        'public func taxFor(_ amount: Int) -> Int {',
        '  return amount / 5',
        '}',
        'func internalHelper() -> Int { return 2 }',
        '// func commentedOut() {}',
        '',
      ].join('\n'),
      'src/Tests/OrderTests.swift': 'func testTotal() -> Int {\n  return taxFor(1)\n}\n',
    });
    const { frag } = extract(dir);
    assert.ok(ids(frag).has('Sources/Order.swift:Order'), 'struct discovered');
    assert.ok(ids(frag).has('Sources/Order.swift:Order.total'), 'method owner-qualified');
    assert.ok(ids(frag).has('Sources/Order.swift:Order.formatted'), 'extension method qualifies to the extended type');
    assert.equal(node(frag, 'Sources/Order.swift:Order.total').exports, true, 'public exported');
    assert.equal(node(frag, 'Sources/Order.swift:Order.secret').exports, false, 'private not exported');
    assert.equal(node(frag, 'Sources/Order.swift:internalHelper').exports, false, 'default internal not exported');
    assert.ok(!frag.nodes.some((n) => n.label === 'commentedOut'), 'comments produce no nodes');
    assert.ok(hasCall(frag, 'Sources/Order.swift:Order.total', 'Sources/Order.swift:taxFor'), 'call wired');
    assert.equal(node(frag, 'Tests/OrderTests.swift:testTotal').role, 'test', 'Tests/ + *Tests.swift is a test role');
  } finally { cleanup(dir); }
});

test('determinism: all four languages, two runs, byte-identical fragments', () => {
  const dir = tmpDir('codeweb-4lang-');
  try {
    writeTree(dir, {
      'src/a.rb': 'def alpha\n  1\nend\n',
      'src/b.php': '<?php\nfunction beta() {\n  return 1;\n}\n',
      'src/c.kt': 'fun gamma() = 1\n',
      'src/d.swift': 'func delta() -> Int {\n  return 1\n}\n',
    });
    const one = extract(dir), two = extract(dir);
    assert.equal(one.bytes, two.bytes);
    assert.equal(one.frag.nodes.filter((n) => n.kind !== 'module').length, 4, 'all four discovered');
  } finally { cleanup(dir); }
});
