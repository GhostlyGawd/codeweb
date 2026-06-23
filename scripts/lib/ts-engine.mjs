// codeweb optional tree-sitter engine (TypeScript/JavaScript) — exact cyclomatic complexity.
//
// This is the ADDITIVE, opt-in tier from docs/backlog-ast-tree-sitter.md (spike: spike/tree-sitter/,
// PR #17). The regex engine (scripts/lib/complexity.mjs) remains the default and the fallback; this
// module is loaded only when `--engine tree-sitter` is requested. web-tree-sitter is an
// OPTIONAL dependency — if it (or the vendored grammar) is unavailable, loadTsEngine() returns null
// and the caller falls back to regex per-file. It NEVER executes the target (static parse) and is
// deterministic given the pinned, vendored grammar.
//
// cyclomaticExact(src) counts McCabe decisions on a function/method BODY SLICE — the SAME text the
// regex extractor feeds cyclomatic() — using a decision set held byte-identical to complexity.mjs, so
// swapping engines changes precision, not definition. tree-sitter's error recovery means a bare body
// snippet (not a valid top-level program) still yields the correct decision nodes.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const GRAMMAR = join(HERE, '..', 'grammars', 'tree-sitter-typescript.wasm');

// Decision set — MUST stay identical to scripts/lib/complexity.mjs (non-py branch):
// if/for/while/case/catch + && || ?? + ternary. `switch_default` carries no `case` keyword → excluded.
// `do_statement` maps to the one `while` token the regex counts in do…while.
const DECISION_TYPES = new Set([
  'if_statement', 'for_statement', 'for_in_statement', 'while_statement', 'do_statement',
  'switch_case', 'catch_clause', 'ternary_expression',
]);
const DECISION_OPS = new Set(['&&', '||', '??']);

let _engine; // undefined = not tried, null = unavailable, object = ready (memoized)

// Lazily build the engine. Returns { cyclomaticExact, version } or null. Never throws.
export async function loadTsEngine() {
  if (_engine !== undefined) return _engine;
  try {
    if (!existsSync(GRAMMAR)) { _engine = null; return _engine; }
    const ts = await import('web-tree-sitter');
    const { Parser, Language } = ts;
    await Parser.init();
    const parser = new Parser();
    parser.setLanguage(await Language.load(readFileSync(GRAMMAR)));

    // Record the runtime version (the grammar version below is the determinism-critical pin). The
    // package's exports map blocks the package.json subpath, so resolve the entry and walk up to it.
    let rt = 'unknown';
    try {
      let dir = dirname(createRequire(import.meta.url).resolve('web-tree-sitter'));
      for (let i = 0; i < 5; i++) {
        const pj = join(dir, 'package.json');
        if (existsSync(pj)) { const p = JSON.parse(readFileSync(pj, 'utf8')); if (p.name === 'web-tree-sitter') { rt = p.version; break; } }
        dir = dirname(dir);
      }
    } catch { /* version is cosmetic */ }
    const version = `tree-sitter(web-tree-sitter@${rt}, typescript@vscode-tree-sitter-wasm@0.3.1/abi14)`;

    const cyclomaticExact = (src) => {
      const tree = parser.parse(String(src || ''));
      let decisions = 0;
      const stack = [tree.rootNode];
      while (stack.length) {
        const n = stack.pop();
        if (DECISION_TYPES.has(n.type)) decisions++;
        else if (n.type === 'binary_expression') {
          const op = n.childForFieldName('operator');
          if (op && DECISION_OPS.has(op.text)) decisions++;
        }
        for (let i = 0; i < n.childCount; i++) stack.push(n.child(i));
      }
      return 1 + decisions;
    };

    _engine = { cyclomaticExact, version };
  } catch {
    _engine = null; // any failure (missing dep, init error) → graceful fallback signal
  }
  return _engine;
}

// Test-only: reset the memoized engine so a test can re-exercise the load path.
export function _resetForTest() { _engine = undefined; }
