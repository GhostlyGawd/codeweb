// The language count is DATA (site/data/product.json's `languages` array) and every public
// surface must agree with it. `scanProseCounts` already fails a drifted NUMBER inside PROSE_FILES;
// what it cannot see is a drifted LIST — a surface that names ten of the thirteen languages reads
// as perfectly consistent to a count scanner while telling an agent the wrong fast path. The v0.10.0
// changelog records exactly that failure ("the /codeweb command steered agents off the fast path for
// 8 of the 11 native languages"), which is why the named lists are pinned here by NAME, not by count.
//
// Three surfaces are load-bearing for routing and get the strictest pin: `commands/codeweb.md` (read
// on every /codeweb run), the anatomy skill, and its engine-detection reference. A language missing
// from any of them sends that language's repos down the agent fallback the fast path exists to avoid.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { PLUGIN_ROOT } from './helpers.mjs';

const read = (p) => readFileSync(join(PLUGIN_ROOT, p), 'utf8');
const product = JSON.parse(read('site/data/product.json'));

// How each canonical language name is written in prose. C# and C++ carry punctuation that a bare
// `includes(name)` would match inside the other ("C" matches "C#", "C++" and "C-family"), so the
// C row needs a word-boundary probe that rejects the punctuated neighbours.
const PROSE_ALIASES = {
  JavaScript: /\bJavaScript\b/,
  TypeScript: /\bTypeScript\b/,
  Python: /\bPython\b/,
  Rust: /\bRust\b/,
  Go: /\bGo\b/,
  Java: /\bJava\b(?!Script)/,
  'C#': /C#/,
  Ruby: /\bRuby\b/,
  PHP: /\bPHP\b/,
  Kotlin: /\bKotlin\b/,
  Swift: /\bSwift\b/,
  C: /(?<![A-Za-z#+])C(?![A-Za-z#+])/,
  'C++': /C\+\+/,
};

test('product.json is the canonical language list — thirteen, C and C++ included', () => {
  assert.equal(product.languages.length, 13, 'the canonical count the whole gate derives from');
  assert.ok(product.languages.includes('C'), 'C is first-class (charter non-goal 8 / amendment A2)');
  assert.ok(product.languages.includes('C++'), 'C++ is first-class (charter non-goal 8 / amendment A2)');
  // Every canonical name needs a prose probe, or a later addition would silently skip the list pins.
  for (const lang of product.languages) {
    assert.ok(PROSE_ALIASES[lang], `no prose probe for "${lang}" — add one so the list pins keep covering it`);
  }
});

// The routing surfaces. A named list here is what an agent acts on, so each must name every
// canonical language — the count matching is not enough.
for (const file of [
  'commands/codeweb.md',
  'skills/codebase-anatomy/SKILL.md',
  'skills/codebase-anatomy/references/engine-detection.md',
]) {
  test(`${file} names every one of the thirteen native languages`, () => {
    const text = read(file);
    const missing = product.languages.filter((l) => !PROSE_ALIASES[l].test(text));
    assert.deepEqual(missing, [], `${file} omits ${missing.join(', ')} from its fast-path language list`);
  });
}

test('README names every native language in its fast-path and roadmap lists', () => {
  const text = read('README.md');
  const missing = product.languages.filter((l) => !PROSE_ALIASES[l].test(text));
  assert.deepEqual(missing, [], `README.md omits ${missing.join(', ')}`);
});

// The extension README writes the list in the editor's own shorthand (JS/TS/JSX/TSX), so it is
// pinned on the two languages this change adds rather than on the full canonical spelling.
test('the extension README covers C and C++ at the canonical count', () => {
  const text = read('editor/vscode-codeweb/README.md');
  assert.match(text, /\bC\b(?![A-Za-z#+])/, 'C is named');
  assert.match(text, /C\+\+/, 'C++ is named');
  assert.match(text, new RegExp(`all ${product.languages.length}\\b`), 'the count matches product.json');
});

// ---- the stale-count sweep -------------------------------------------------------------------
// `scanProseCounts` only reads PROSE_FILES; this walks the whole publishable surface for the
// superseded count in any phrasing. HISTORICAL is the one legitimate exemption: a v0.9.0 changelog
// entry saying eleven languages shipped is a dated record, and rewriting it would make the release
// notes lie about what that release contained. The exemption is therefore per-FILE and each hit
// must PROVE its historicity (a dated version heading above it, or a dated report header), so the
// allowance cannot quietly widen to a live surface.
const STALE_COUNT_RE = /\b(11|eleven)[- ](native|first-class|languages?)\b/i;
const SWEEP_ROOTS = ['README.md', 'site', 'docs', '.claude-plugin', 'commands', 'skills', 'editor'];
const TEXT_EXT = /\.(md|html|json|mjs|js|css|txt|yml|yaml|svg|xml)$/i;

/** Files whose stale hits are dated historical records, with the evidence each hit must satisfy. */
const HISTORICAL = {
  // Generated from CHANGELOG.md: every entry sits under its released `[x.y.z] - date` heading.
  'docs/changelog.html': /<h2 class="cl-ver">\[\d+\.\d+\.\d+\] - \d{4}-\d\d-\d\d<\/h2>/,
  // An archived discovery report, dated in its own header and excluded from crawling by robots.txt.
  'docs/product-review-2026-07-20.md': /\*\*Date:\*\* 2026-07-20/,
};

// `join` yields `docs\changelog.html` on Windows, so every key in HISTORICAL and every expected
// path in the non-vacuity list missed — the exemption silently stopped applying and the sweep
// reported four dated changelog entries as live regressions on every windows leg of ci.yml.
// Paths are compared as data here, so they are normalized to one separator at the boundary.
const toPosix = (p) => p.split(sep).join('/');

function walk(rel, out = []) {
  const abs = join(PLUGIN_ROOT, rel);
  if (statSync(abs).isFile()) { if (TEXT_EXT.test(rel)) out.push(toPosix(rel)); return out; }
  for (const entry of readdirSync(abs)) walk(join(rel, entry), out);
  return out;
}

test('no live surface still claims eleven languages (historical records exempt, and proven so)', () => {
  const live = [];
  const historicalSeen = new Set();
  for (const root of SWEEP_ROOTS) {
    for (const rel of walk(root)) {
      const text = readFileSync(join(PLUGIN_ROOT, rel), 'utf8');
      const hits = text.split('\n')
        .map((line, i) => (STALE_COUNT_RE.test(line) ? `${rel}:${i + 1}: ${line.trim()}` : null))
        .filter(Boolean);
      if (!hits.length) continue;
      const evidence = HISTORICAL[rel];
      if (!evidence) { live.push(...hits); continue; }
      assert.match(text, evidence, `${rel} is exempt as a historical record — it must carry its date`);
      historicalSeen.add(rel);
    }
  }
  assert.deepEqual(live, [], `these surfaces still claim eleven languages:\n${live.join('\n')}`);
  // A stale exemption is its own rot: once a historical file no longer carries the phrase, its
  // entry must go, or the next live regression in that file would be silently allowed.
  const unused = Object.keys(HISTORICAL).filter((f) => !historicalSeen.has(f));
  assert.deepEqual(unused, [], `these historical exemptions no longer match anything — delete them: ${unused.join(', ')}`);
});

test('the sweep actually reads the surfaces it claims to (non-vacuity)', () => {
  const files = SWEEP_ROOTS.flatMap((r) => walk(r));
  for (const expected of [
    'README.md',
    'commands/codeweb.md',
    'skills/codebase-anatomy/references/engine-detection.md',
    'editor/vscode-codeweb/extension.js',
    'site/content/product.html',
    'docs/reference.md',
  ]) {
    assert.ok(files.includes(expected), `the sweep must cover ${expected}`);
  }
  assert.ok(files.length > 40, `the walk found only ${files.length} files — the roots are not resolving`);
  // The regex must be the thing finding hits, not an always-empty scan.
  assert.ok(STALE_COUNT_RE.test('the eleven native languages'), 'word form matches');
  assert.ok(STALE_COUNT_RE.test('all 11 native languages'), 'digit form matches');
  assert.ok(STALE_COUNT_RE.test('the 11-language regex scan'), 'hyphenated singular matches');
  assert.ok(!STALE_COUNT_RE.test('thirteen native languages'), 'the current count is not a hit');
});

// The sweep's exemption lookup and its non-vacuity list are both keyed by PATH STRING, so the
// separator the walk emits is load-bearing. Under `join`, both keys missed on Windows: the dated
// changelog entries read as live regressions and the whole windows leg of ci.yml went red while
// ubuntu stayed green. Asserted as a property of the emitted paths rather than of the platform,
// so it fails on the posix runners too if the normalization is ever dropped.
test('the walk emits separator-independent keys, so the exemptions apply on every platform', () => {
  const files = SWEEP_ROOTS.flatMap((r) => walk(r));
  const backslashed = files.filter((f) => f.includes('\\'));
  assert.deepEqual(backslashed, [], 'walk() must emit posix-separated paths on every platform');
  // Every exemption key must be a path the walk can actually produce, or it silently stops
  // exempting the moment the separator changes — which is precisely how this regressed.
  for (const key of Object.keys(HISTORICAL)) {
    assert.ok(files.includes(key), `HISTORICAL key ${key} is not a path the walk emits`);
  }
});

// The homepage lead and the product page chips both render from product.languages, so the built
// pages carry the new languages the moment `site/build.mjs` runs. Pinning the OUTPUT is what
// catches a committed docs/ that was never rebuilt (the CI failure mode site rule 5 exists for).
test('the built site renders all thirteen languages, not a stale snapshot', () => {
  const productPage = read('docs/product.html');
  for (const lang of product.languages) {
    assert.ok(productPage.includes(`<span class="chip">${lang}</span>`),
      `docs/product.html is missing the ${lang} chip — rebuild with node site/build.mjs`);
  }
  const home = read('docs/index.html');
  assert.match(home, /Kotlin, Swift, C, and C\+\+/, 'the homepage inline list ends with the two new languages');
});
