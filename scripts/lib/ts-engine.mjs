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

// A control-flow decision node (McCabe). Same set as scripts/lib/complexity.mjs (non-py branch).
const isDecision = (n) => {
  if (DECISION_TYPES.has(n.type)) return true;
  if (n.type === 'binary_expression') {
    const op = n.childForFieldName('operator');
    return !!op && DECISION_OPS.has(op.text);
  }
  return false;
};

// Count decisions strictly INSIDE `root` (root itself never counts — a program/body is not a
// decision). Exact cyclomatic = 1 + this. Iterative DFS so a deep tree can't blow the stack.
const countDecisions = (root) => {
  let d = 0;
  const stack = [root];
  while (stack.length) {
    const n = stack.pop();
    if (n !== root && isDecision(n)) d++;
    for (let i = 0; i < n.childCount; i++) stack.push(n.child(i));
  }
  return d;
};
const complexityOf = (bodyNode) => (bodyNode ? 1 + countDecisions(bodyNode) : 1);

// Visit every node once (iterative DFS).
const walk = (root, visit) => {
  const stack = [root];
  while (stack.length) {
    const n = stack.pop();
    visit(n);
    for (let i = 0; i < n.childCount; i++) stack.push(n.child(i));
  }
};

// Map a function/method's typed parameters: identifier -> declared class/type name (`p: Pipeline`
// -> {p:'Pipeline'}). Only simple `type_identifier` annotations (a named class) — array/generic/union
// types have no single receiver class to dispatch on, so they're left out (precision over recall).
const paramTypes = (fnNode) => {
  const map = new Map();
  const params = fnNode?.childForFieldName('parameters');
  if (!params) return map;
  for (let i = 0; i < params.childCount; i++) {
    const p = params.child(i);
    if (p.type !== 'required_parameter' && p.type !== 'optional_parameter') continue;
    const pat = p.childForFieldName('pattern');
    const typeAnn = p.childForFieldName('type'); // type_annotation: ':' then the type node
    const typeId = typeAnn && typeAnn.child(1);
    if (pat?.type === 'identifier' && typeId?.type === 'type_identifier') map.set(pat.text, typeId.text);
  }
  return map;
};

// Nearest enclosing NAMED symbol of a node: a method_definition (with its class) or a
// function_declaration. Returns {name, classNode|null, fnNode} or null (top level / anonymous arrow).
const enclosingSymbol = (node) => {
  let cur = node.parent;
  while (cur) {
    if (cur.type === 'method_definition') {
      let c = cur.parent;
      while (c && c.type !== 'class_declaration') c = c.parent;
      return { name: cur.childForFieldName('name')?.text, classNode: c || null, fnNode: cur };
    }
    if (cur.type === 'function_declaration') {
      return { name: cur.childForFieldName('name')?.text, classNode: null, fnNode: cur };
    }
    cur = cur.parent;
  }
  return null;
};

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

    const cyclomaticExact = (src) => 1 + countDecisions(parser.parse(String(src || '')).rootNode);

    // Whole-file JS/TS extractor (Increment 2): the source of truth for METHOD nodes (class-qualified
    // ids `<rel>:Class.method`, BARE labels) + the dynamic-dispatch call edges the regex engine drops
    // (`this.m()` and typed-receiver `x.m()`). One parse per file; ported from the proven precision
    // contract in spike/tree-sitter/extract-ts.mjs. Returns null on any failure so the caller falls
    // back to the regex scanner per-file. Classes/functions keep bare ids (regex still owns them).
    const extractJsTs = (text, rel) => {
      try {
        const tree = parser.parse(String(text || ''));
        const r = String(rel).replace(/\\/g, '/');
        const id = (name) => `${r}:${name}`;
        const methods = [];
        const methodIds = new Set();
        const methodsByClass = new Map(); // className -> Set(methodName)

        walk(tree.rootNode, (n) => {
          if (n.type !== 'class_declaration') return;
          const cname = n.childForFieldName('name')?.text;
          if (!cname) return;
          const set = methodsByClass.get(cname) || new Set();
          const body = n.childForFieldName('body');
          if (body) {
            for (let i = 0; i < body.childCount; i++) {
              const m = body.child(i);
              if (m.type !== 'method_definition') continue;
              const mname = m.childForFieldName('name')?.text;
              if (!mname) continue;
              set.add(mname);
              const mid = id(`${cname}.${mname}`);
              if (methodIds.has(mid)) continue; // overloads collapse to one node
              methodIds.add(mid);
              methods.push({
                id: mid, label: mname,
                line: m.startPosition.row + 1,
                endLine: m.endPosition.row + 1,
                complexity: complexityOf(m.childForFieldName('body')),
              });
            }
          }
          methodsByClass.set(cname, set);
        });

        const dispatch = [];
        const seen = new Set();
        const addDispatch = (from, to) => {
          if (from === to || !methodIds.has(to)) return; // only wire to an emitted method (precision)
          const k = from + '\t' + to;
          if (seen.has(k)) return;
          seen.add(k);
          dispatch.push({ from, to });
        };
        walk(tree.rootNode, (n) => {
          if (n.type !== 'call_expression') return;
          const fn = n.childForFieldName('function');
          if (!fn || fn.type !== 'member_expression') return; // plain identifier calls = regex's job
          const obj = fn.childForFieldName('object');
          const prop = fn.childForFieldName('property')?.text;
          if (!obj || !prop) return;
          const owner = enclosingSymbol(n);
          if (!owner?.name) return;
          const ownerClass = owner.classNode?.childForFieldName('name')?.text;
          const from = id(ownerClass ? `${ownerClass}.${owner.name}` : owner.name);
          if (obj.type === 'this' && ownerClass) {
            if (methodsByClass.get(ownerClass)?.has(prop)) addDispatch(from, id(`${ownerClass}.${prop}`));
            return;
          }
          if (obj.type === 'identifier') {
            const t = paramTypes(owner.fnNode).get(obj.text);
            if (t && methodsByClass.get(t)?.has(prop)) addDispatch(from, id(`${t}.${prop}`));
          }
        });

        // Canonical order so the merged graph is deterministic regardless of DFS direction.
        methods.sort((a, b) => a.line - b.line || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        dispatch.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.to < b.to ? -1 : a.to > b.to ? 1 : 0));
        return { methods, dispatch };
      } catch {
        return null; // any parse/traversal failure -> regex fallback for this file
      }
    };

    _engine = { cyclomaticExact, extractJsTs, version };
  } catch {
    _engine = null; // any failure (missing dep, init error) → graceful fallback signal
  }
  return _engine;
}

// Test-only: reset the memoized engine so a test can re-exercise the load path.
export function _resetForTest() { _engine = undefined; }
