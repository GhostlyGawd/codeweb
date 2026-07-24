// Copy-density gate: marketing surfaces stay scannable on a phone.
//
// A ~45-character mobile line means a 55-word paragraph renders as ~5 lines — a wall.
// The 2026-07 readability pass broke fourteen such walls in the README (worst: 84 words,
// twelve rendered lines at the Install decision). This test keeps them broken: any prose
// paragraph on a funnel surface that exceeds the cap fails the build, same as a drifted
// tool count. Reference material (docs/, research.html, reports/) is deliberately not gated.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { PLUGIN_ROOT } from './helpers.mjs';

const CAP = 55;

const read = (p) => readFileSync(join(PLUGIN_ROOT, p), 'utf8');
const words = (s) => s.split(/\s+/).filter(Boolean).length;

function overlong(paras, file) {
  return paras
    .map((p) => ({ file, words: words(p), head: p.split(/\s+/).slice(0, 8).join(' ') }))
    .filter((p) => p.words > CAP);
}

// Markdown: prose paragraphs only — code fences, tables, headings, lists, and raw HTML
// blocks are not prose; blockquote markers are stripped so quoted prose still counts.
function mdParagraphs(md) {
  const noCode = md.replace(/```[\s\S]*?```/g, '');
  return noCode
    .split(/\n\s*\n/)
    .map((p) => p.trim().replace(/^> ?/gm, ''))
    .filter((p) => p && !/^[|#<\-_]|^\d+\. /.test(p));
}

// HTML content files: the text inside each <p>…</p>, tags stripped. Template
// placeholders ({{toolCount}}) count as one word each — close enough to the rendered size.
function htmlParagraphs(html) {
  return [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, ' ').trim())
    .filter(Boolean);
}

test(`README prose paragraphs stay under ${CAP} words`, () => {
  const bad = overlong(mdParagraphs(read('README.md')), 'README.md');
  assert.deepEqual(bad, [], `walls: ${bad.map((b) => `${b.words}w "${b.head}…"`).join('; ')}`);
});

test(`site funnel pages (index/product/start) stay under ${CAP} words per paragraph`, () => {
  const bad = ['index', 'product', 'start'].flatMap((slug) =>
    overlong(htmlParagraphs(read(`site/content/${slug}.html`)), `site/content/${slug}.html`));
  assert.deepEqual(bad, [], `walls: ${bad.map((b) => `${b.file} ${b.words}w "${b.head}…"`).join('; ')}`);
});

test(`listing descriptions (package/plugin/marketplace) stay under ${CAP} words`, () => {
  const descs = [
    ['package.json', JSON.parse(read('package.json')).description],
    ['.claude-plugin/plugin.json', JSON.parse(read('.claude-plugin/plugin.json')).description],
    ['.claude-plugin/marketplace.json',
      JSON.parse(read('.claude-plugin/marketplace.json')).plugins[0].description],
  ];
  // Listings render as one block with no line breaks — same cap, plus a sentence-length
  // guard: no single sentence over 30 words (a one-sentence listing is its own wall).
  for (const [file, d] of descs) {
    assert.ok(words(d) <= 80, `${file} description is ${words(d)} words (cap 80)`);
    for (const s of d.split(/(?<=[.!?])\s+/)) {
      assert.ok(words(s) <= 30, `${file} has a ${words(s)}-word sentence: "${s.slice(0, 60)}…"`);
    }
  }
});
