import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runNode, script, tmpDir, cleanup, writeTree, readJSON, hasEdge } from './helpers.mjs';

// Go cross-package QUALIFIED calls: `pkg.Func(...)` where `pkg` is the package name of files IN THIS
// REPO resolves to the symbol `Func` defined in that package. gorilla-mux's library declares
// `package mux`; its example tests are `package mux_test` and call `mux.NewRouter()` — same recovery.
// PRECISION (standing rule): resolve ONLY when `pkg` is an in-repo package AND the leaf maps to
// exactly ONE exported top-level symbol there. External packages (os/fmt/http) are not in the in-repo
// package map -> skipped, even when an unrelated in-repo symbol shares the leaf name. 0 or >1
// candidates -> nothing (no phantom edge, no byName guessing).
const FIXTURE = {
  // package `lib` declares the canonical exported DoThing.
  'lib/lib.go': `package lib

func DoThing() int {
	return 42
}
`,
  // package `osutil` declares an EXPORTED Getenv -> a same-leaf in-repo symbol in a DIFFERENT package.
  // A call `os.Getenv()` must NOT conflate to this: `os` is not an in-repo package.
  'osutil/osutil.go': `package osutil

func Getenv(key string) string {
	return ""
}
`,
  // non-test consumer in package `main`: lib.DoThing() -> cross-package CALL edge; os.Getenv() -> none.
  'app/main.go': `package main

import "example.com/lib"

func Run() {
	lib.DoThing()
	os.Getenv("KEY")
	amb.Thing()
}
`,
  // external-test consumer (package lib_test) mirroring gorilla-mux's example_*_test.go.
  'lib/example_test.go': `package lib_test

import "example.com/lib"

func ExampleDoThing() {
	lib.DoThing()
}
`,
  // package `amb` declares DoThing's leaf "Thing" TWICE -> ambiguous (>1) -> a qualified amb.Thing()
  // resolves to nothing.
  'amb/a.go': `package amb

func Thing() int {
	return 1
}
`,
  'amb/b.go': `package amb

func Thing() int {
	return 2
}
`,
  // pure package-doc file (gorilla-mux's doc.go shape): example code INSIDE comments must NOT edge.
  // A block-comment qualified call, a block-comment bare call, and a line-comment qualified call.
  'docs/doc.go': `/*
Package docs is documentation only.

	r := lib.DoThing()
	x := DoThing()
*/
package docs

// also commented: lib.DoThing()
func Placeholder() {
	_ = "lib.DoThing() inside a string is not a call"
}
`,
};

function extract() {
  const dir = tmpDir('codeweb-go-qual-');
  writeTree(dir, FIXTURE);
  const frag = join(dir, 'fragment.json');
  const r = runNode(script('extract-symbols.mjs'), [dir, '--out', frag, '--no-ctags']);
  assert.equal(r.status, 0, r.stderr);
  return { dir, g: readJSON(frag) };
}

test('Go qualified call: pkg.Func() resolves cross-package to the in-repo symbol', () => {
  const { dir, g } = extract();
  try {
    assert.ok(
      hasEdge(g.edges, 'app/main.go:Run', 'lib/lib.go:DoThing', 'call'),
      'lib.DoThing() resolves to lib/lib.go:DoThing (lib is an in-repo package)',
    );
  } finally {
    cleanup(dir);
  }
});

test('Go qualified call: a package-external test file (package lib_test) recovers the dependent', () => {
  const { dir, g } = extract();
  try {
    // _test.go caller -> non-test target reclassifies the call as a `test` edge (still a dependency,
    // exactly the gorilla-mux example_*_test.go -> mux.go:NewRouter recovery).
    assert.ok(
      hasEdge(g.edges, 'lib/example_test.go:ExampleDoThing', 'lib/lib.go:DoThing'),
      'mux_test-style qualified call still becomes a dependent edge',
    );
  } finally {
    cleanup(dir);
  }
});

test('Go qualified call: external package (os) is NOT conflated with a same-leaf in-repo symbol', () => {
  const { dir, g } = extract();
  try {
    assert.ok(
      !hasEdge(g.edges, 'app/main.go:Run', 'osutil/osutil.go:Getenv'),
      'os.Getenv() must not edge to osutil.Getenv — os is not an in-repo package',
    );
  } finally {
    cleanup(dir);
  }
});

test('Go qualified call: calls inside // and /* */ comments (and strings) produce NO edge', () => {
  const { dir, g } = extract();
  try {
    // block-comment qualified `lib.DoThing()`, block-comment bare `DoThing()`, line-comment
    // `lib.DoThing()`, and a string-literal `lib.DoThing()` must all be masked before the scan.
    assert.ok(!hasEdge(g.edges, 'docs/doc.go:<module>', 'lib/lib.go:DoThing'), 'no module-scope edge from commented call');
    assert.ok(!hasEdge(g.edges, 'docs/doc.go:Placeholder', 'lib/lib.go:DoThing'), 'no edge from comment/string inside Placeholder');
    assert.ok(
      !g.edges.some((e) => e.from.startsWith('docs/doc.go') && e.to === 'lib/lib.go:DoThing'),
      'doc.go contributes no dependents of DoThing',
    );
  } finally {
    cleanup(dir);
  }
});

test('Go qualified call: an ambiguous leaf (>1 candidate in the package) resolves to nothing', () => {
  const { dir, g } = extract();
  try {
    assert.ok(!hasEdge(g.edges, 'app/main.go:Run', 'amb/a.go:Thing'), 'ambiguous -> no edge (a)');
    assert.ok(!hasEdge(g.edges, 'app/main.go:Run', 'amb/b.go:Thing'), 'ambiguous -> no edge (b)');
  } finally {
    cleanup(dir);
  }
});
