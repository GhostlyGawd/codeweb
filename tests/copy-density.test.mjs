// Copy-density gate: marketing surfaces stay scannable on a phone.
//
// A ~45-character mobile line means a 55-word paragraph renders as ~5 lines — a wall.
// The 2026-07 readability pass broke fourteen such walls in the README (worst: 84 words,
// twelve rendered lines at the Install decision). This test keeps them broken: any prose
// paragraph on a current writing surface that exceeds the cap fails the build, same as a drifted
// tool count. Historical records, normative specifications, generated output, and research
// evidence are deliberately not gated.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { PLUGIN_ROOT } from './helpers.mjs';

const CAP = 55;

const CURRENT_MARKDOWN = [
  'README.md',
  'CONTRIBUTING.md',
  'OPERATOR-ACTIONS.md',
  'SECURITY.md',
  'CLAUDE.md',
  'docs/case-study-axios.md',
  'docs/ci-gate.md',
  'docs/cli.md',
  'docs/reference.md',
  'docs/ROADMAP.md',
  'commands/apply.md',
  'commands/codeweb.md',
  'commands/narrate.md',
  'commands/pitch.md',
  'agents/codeweb-dissector.md',
  'agents/codeweb-domain-mapper.md',
  'skills/codebase-anatomy/SKILL.md',
  'skills/codebase-anatomy/references/engine-detection.md',
  'skills/codebase-anatomy/references/graph-schema.md',
  'skills/codebase-anatomy/references/overlap-heuristics.md',
  'assets/brand/README.md',
  'editor/vscode-codeweb/README.md',
  'tests/README.md',
];

const CURRENT_HTML = [
  'site/content/index.html',
  'site/content/product.html',
  'site/content/start.html',
  'site/content/support.html',
  'site/content/downloads.html',
  'site/content/case-study.html',
  'site/templates/base.html',
  'site/templates/footer.html',
  'site/templates/nav.html',
];

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

test(`current Markdown prose stays under ${CAP} words per paragraph`, () => {
  const bad = CURRENT_MARKDOWN.flatMap((file) => overlong(mdParagraphs(read(file)), file));
  assert.deepEqual(bad, [], `walls: ${bad.map((b) => `${b.words}w "${b.head}…"`).join('; ')}`);
});

test(`current authored HTML prose stays under ${CAP} words per paragraph`, () => {
  const bad = CURRENT_HTML.flatMap((file) => overlong(htmlParagraphs(read(file)), file));
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
