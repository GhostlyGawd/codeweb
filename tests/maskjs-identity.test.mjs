// Round 2, finding #20 (T-20.3) — the maskJs byte-identity oracle. The optimization contract for
// the throughput work (charCode word-class + span-copy) is ZERO byte diffs: the reference below is
// the pre-#20 maskJs EMBEDDED VERBATIM (frozen — do not "sync" it with lib/masking.mjs; drift is
// the point), and the live maskJs must reproduce it byte-for-byte, in BOTH keepValues modes, over
//   (a) every mask-eligible file in this repo (the js-family SRC set the extractor dispatches to
//       maskJs — the audit's 874-file-class differential, committed as a test), .php in
//       hashComment mode, and
//   (b) a writeLoadedCorpus tree (the bench-corpus generator all #20 numbers run on), plus
//   (c) the adversarial hand fixtures (regex/template/expr/escape/PHP-# shapes).
// This test lands GREEN against the pre-#20 masker (live === reference trivially) and then GATES
// the optimization: byte-identity here is why #20 needs no SCANNER_VERSION bump (T-19.1's ladder
// owns non-identical mask changes).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { maskJs } from '../scripts/lib/masking.mjs';
import { writeLoadedCorpus } from '../bench/lib/loaded-corpus.mjs';
import { PLUGIN_ROOT, tmpDir, cleanup } from './helpers.mjs';

// ---- frozen reference oracle: pre-#20 maskJs, verbatim (state machine as of WS-C final) --------
const REGEX_PREV_KW = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
function referenceMaskJs(text, { keepValues = false, hashComment = false } = {}) {
  const lines = text.split(/\r?\n/);
  const out = [];
  let inBlock = false;
  const tpl = [];
  let lastSig = null;
  let lastWord = '';
  const note = (ch) => { if (ch !== ' ' && ch !== '\t') { lastWord = /[A-Za-z0-9_$]/.test(ch) ? lastWord + ch : ''; lastSig = ch; } };
  const noteValue = () => { lastSig = ')'; lastWord = ''; };
  const regexCanFollow = () =>
    lastSig === null ? true
      : /[A-Za-z0-9_$]/.test(lastSig) ? REGEX_PREV_KW.has(lastWord)
        : !(lastSig === ')' || lastSig === ']' || lastSig === '.' || lastSig === '<');
  const scanRegex = (line, i) => {
    const n = line.length;
    let cls = false;
    for (let j = i + 1; j < n; j++) {
      const cj = line[j];
      if (cj === '\\') { j++; continue; }
      if (cls) { if (cj === ']') cls = false; continue; }
      if (cj === '[') { cls = true; continue; }
      if (cj === '/') { let k = j + 1; while (k < n && /[a-z]/i.test(line[k])) k++; return { close: j, end: k }; }
    }
    return null;
  };
  const value = (s) => (keepValues ? s : ' '.repeat(s.length));
  for (const line of lines) {
    const n = line.length; let res = '', i = 0;
    while (i < n) {
      if (inBlock) {
        const end = line.indexOf('*/', i);
        if (end === -1) { res += ' '.repeat(n - i); i = n; }
        else { res += ' '.repeat(end + 2 - i); i = end + 2; inBlock = false; }
        continue;
      }
      const top = tpl.length ? tpl[tpl.length - 1] : null;
      if (top && top.depth === 0) {
        const ch = line[i];
        if (ch === '`') { res += keepValues ? '`' : ' '; i++; tpl.pop(); noteValue(); continue; }
        if (ch === '\\') {
          const stop = Math.min(i + 2, n);
          res += keepValues ? line.slice(i, stop) : ' '.repeat(stop - i); i = stop; continue;
        }
        if (ch === '$' && line[i + 1] === '{') { res += '${'; i += 2; top.depth = 1; lastSig = '{'; lastWord = ''; continue; }
        res += keepValues ? ch : ' '; i++; continue;
      }
      if (top) {
        const ch = line[i];
        if (ch === '"' || ch === "'") {
          let j = i + 1; while (j < n && line[j] !== ch) { if (line[j] === '\\') j++; j++; }
          const stop = Math.min(j + 1, n); res += value(line.slice(i, stop)); i = stop; noteValue(); continue;
        }
        if (ch === '/' && regexCanFollow()) {
          const m = scanRegex(line, i);
          if (m) { res += '/' + value(line.slice(i + 1, m.close)) + '/' + value(line.slice(m.close + 1, m.end)); i = m.end; noteValue(); continue; }
        }
        if (ch === '`') { res += keepValues ? '`' : ' '; i++; tpl.push({ depth: 0 }); continue; }
        if (ch === '{') top.depth++;
        else if (ch === '}') { top.depth--; if (top.depth === 0) { res += ch; i++; note(ch); continue; } }
        note(ch); res += ch; i++; continue;
      }
      const ch = line[i];
      if (ch === '/' && line[i + 1] === '/') { res += ' '.repeat(n - i); i = n; continue; }
      if (hashComment && ch === '#') { res += ' '.repeat(n - i); i = n; continue; }
      if (ch === '/' && line[i + 1] === '*') {
        const end = line.indexOf('*/', i + 2);
        if (end === -1) { inBlock = true; res += ' '.repeat(n - i); i = n; }
        else { res += ' '.repeat(end + 2 - i); i = end + 2; }
        continue;
      }
      if (ch === '/' && regexCanFollow()) {
        const m = scanRegex(line, i);
        if (m) { res += '/' + value(line.slice(i + 1, m.close)) + '/' + value(line.slice(m.close + 1, m.end)); i = m.end; noteValue(); continue; }
      }
      if (ch === '"' || ch === "'") {
        let j = i + 1; while (j < n && line[j] !== ch) { if (line[j] === '\\') j++; j++; }
        const stop = Math.min(j + 1, n); res += value(line.slice(i, stop)); i = stop; noteValue(); continue;
      }
      if (ch === '`') { res += keepValues ? '`' : ' '; i++; tpl.push({ depth: 0 }); continue; }
      note(ch); res += ch; i++;
    }
    out.push(res);
  }
  return out.join('\n');
}

// One file's identity check, all mode combinations the extractor/codemod actually use.
function assertIdentical(text, label) {
  for (const hashComment of [false, true]) {
    for (const keepValues of [false, true]) {
      const want = referenceMaskJs(text, { keepValues, hashComment });
      const got = maskJs(text, { keepValues, hashComment });
      if (got !== want) {
        // pinpoint the first diverging line for a debuggable failure message
        const wl = want.split('\n'), gl = got.split('\n');
        let ln = 0; while (ln < wl.length && wl[ln] === gl[ln]) ln++;
        assert.fail(`${label} (keepValues=${keepValues}, hashComment=${hashComment}): first diff at line ${ln + 1}\n  ref:  ${JSON.stringify(wl[ln])}\n  live: ${JSON.stringify(gl[ln])}`);
      }
    }
  }
}

// The extractor's maskJs dispatch set (extract-symbols isBraceLang + maskAligned): everything the
// masker sees in production. .php normally runs hashComment:true — the sweep runs BOTH modes for
// every file anyway, which strictly covers that.
const JS_FAMILY_RE = /\.(jsx?|mjs|cjs|tsx?|mts|cts|java|cs|php|kt|kts|swift)$/;
const SKIP_RE = /(^|[\\/])(node_modules|\.git|dist|build|out|vendor|third_party|\.codeweb|coverage|\.live)([\\/]|$)/;
function listRepoJsFamily() {
  const files = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (SKIP_RE.test(p)) continue;
      if (e.isDirectory()) walk(p);
      else if (JS_FAMILY_RE.test(p)) files.push(p);
    }
  };
  walk(PLUGIN_ROOT);
  return files.sort();
}

test('MASK-ID repo: maskJs is byte-identical to the frozen reference over every mask-eligible repo file', () => {
  const files = listRepoJsFamily();
  assert.ok(files.length >= 200, `repo sweep is a real corpus (got ${files.length} files)`);
  for (const f of files) assertIdentical(readFileSync(f, 'utf8'), f.slice(PLUGIN_ROOT.length + 1));
});

test('MASK-ID corpus: maskJs is byte-identical to the frozen reference over a loaded bench-corpus tree', () => {
  const dir = tmpDir('codeweb-maskid-');
  try {
    writeLoadedCorpus(dir, { files: 120 });
    for (const f of readdirSync(dir).sort()) assertIdentical(readFileSync(join(dir, f), 'utf8'), `corpus/${f}`);
  } finally { cleanup(dir); rmSync(dir, { recursive: true, force: true }); }
});

test('MASK-ID fixtures: adversarial shapes (regex, templates, expr nesting, escapes, PHP #)', () => {
  const fixtures = {
    'regex-after-keyword': 'function f(s) { return /ab"c\\/[/]d/gi.test(s) ? 1 : 2; }\n',
    'division-vs-regex': 'const a = b / c / d;\nconst e = (x) / 2;\nlet f = g[0] / h;\nreturn /x/;\n',
    'template-text-with-escapes': 'const t = `a \\` b \\$ ${fmt(x)} c ${`inner ${y}`} d`;\n',
    'expr-string-and-regex': 'const u = `${s.split(/`/).join("q\'x")} ${"a}b"} tail`;\n',
    'multiline-template': 'const m = `line1 {\nline2 ${call(\n arg)} }\nline3`;\nafter();\n',
    'block-comment-span': 'a(); /* c1 { " ` \n still comment /\n*/ b();\n',
    'line-comment-url': 'const u = "http://x.example/";// trailing /* not open\nnext();\n',
    'php-hash': '<?php\n# comment "with quotes\n$x = f(1); # tail\necho "a # not comment";\n',
    'foo-bar-lastword-quirk': 'else\tfoo bar /x/;\nreturn foo /y/z;\n',
    'unterminated-string': 'const s = "never closed\nnext(1);\n',
    'unterminated-template': 'const t = `never closed\nstill text $ {\n',
    'crlf-and-tabs': 'a();\r\nif (x)\t{ return /r/ }\r\n\tdone();\r\n',
    'empty-and-blank': '\n\n   \n\t\n',
    'spread-and-jsx': 'const el = a < b ? c : d;\nfn(...args);\nconst j = x</RegExp>/g;\n',
    'nested-expr-braces': 'const q = `${ { a: { b: 1 } }.a.b } end`;\n',
    'value-span-modes': 'const s1 = \'it\\\'s\';\nconst s2 = "q\\"q";\nconst r = /[\\]"]+/g;\n',
  };
  for (const [name, text] of Object.entries(fixtures)) assertIdentical(text, `fixture:${name}`);
});
