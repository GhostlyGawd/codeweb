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
// Visit every node once (iterative DFS). Named walkTree (not `walk`) so codeweb's own regex extractor
// can't confuse it with extract-symbols.mjs's directory `walk` — a generic name collides into a
// spurious duplication finding / dep cycle when the engine dogfoods itself.
const walkTree = (root, visit) => {
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

let _engine; // undefined = not tried, null = unavailable, object = ready (memoized)

// Runtime + version discovery WITHOUT WASM instantiation — shared by the probe and the loader so
// the version string stamped into meta from a probe can never diverge from a loaded engine's. The
// package's exports map blocks the package.json subpath, so resolve the entry and walk up to it.
function runtimeInfo() {
  try {
    let dir = dirname(createRequire(import.meta.url).resolve('web-tree-sitter'));
    for (let i = 0; i < 5; i++) {
      const pj = join(dir, 'package.json');
      if (existsSync(pj)) { const p = JSON.parse(readFileSync(pj, 'utf8')); if (p.name === 'web-tree-sitter') return { present: true, version: p.version }; }
      dir = dirname(dir);
    }
    return { present: true, version: 'unknown' }; // resolvable but package.json not found
  } catch { return { present: false, version: null }; }
}
const tsVersionString = (rt) => `tree-sitter(web-tree-sitter@${rt}, typescript@vscode-tree-sitter-wasm@0.3.1/abi14)`;

/**
 * Cheap availability probe (Spec A) — file existence + module resolution only, no Parser.init, no
 * Language.load. Lets extraction decide cache namespaces, meta stamps, and banner text up front
 * while the real (expensive) engine loads lazily on first need. Never throws.
 */
export function probeAst() {
  const rt = runtimeInfo();
  const ts = rt.present && existsSync(GRAMMAR);
  return {
    ts,
    java: rt.present && existsSync(LANG_GRAMMARS.java),
    csharp: rt.present && existsSync(LANG_GRAMMARS.csharp),
    python: rt.present && existsSync(LANG_GRAMMARS.python),
    go: rt.present && existsSync(LANG_GRAMMARS.go),
    rust: rt.present && existsSync(LANG_GRAMMARS.rust),
    ruby: rt.present && existsSync(LANG_GRAMMARS.ruby),   // #14
    php: rt.present && existsSync(LANG_GRAMMARS.php),     // #14
    tsVersion: ts ? tsVersionString(rt.version) : null,
  };
}

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

    const version = tsVersionString(runtimeInfo().version);

    // finding 6: web-tree-sitter has no FinalizationRegistry — every parse tree must be .delete()d
    // or its WASM pages leak for the process lifetime (measured: 1,312MB vs 217MB peak RSS on an
    // 11MB corpus; the fix is also ~9% faster from reduced GC pressure). All returned data is plain
    // strings/numbers, so freeing the tree after each call is strictly safe.
    const cyclomaticExact = (src) => {
      const tree = parser.parse(String(src || ''));
      try { return 1 + countDecisions(tree.rootNode); }
      finally { if (tree) tree.delete(); }
    };

    // Whole-file JS/TS extractor (Increment 2): the source of truth for METHOD nodes (class-qualified
    // ids `<rel>:Class.method`, BARE labels) + the dynamic-dispatch call edges the regex engine drops
    // (`this.m()` and typed-receiver `x.m()`). One parse per file; ported from the proven precision
    // contract in spike/tree-sitter/extract-ts.mjs. Returns null on any failure so the caller falls
    // back to the regex scanner per-file. Classes/functions keep bare ids (regex still owns them).
    // Spec H helpers: statement normalization + FNV-1a hash for Type-3 fingerprints.
    const FN_LIKE = new Set(['function_declaration', 'generator_function_declaration', 'function_expression', 'arrow_function', 'method_definition']);
    const JS_KW = new Set(['if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'return', 'break', 'continue', 'throw', 'try', 'catch', 'finally', 'new', 'delete', 'typeof', 'instanceof', 'in', 'of', 'void', 'yield', 'await', 'async', 'function', 'class', 'extends', 'super', 'this', 'const', 'let', 'var', 'null', 'undefined', 'true', 'false']);
    const TPL_STR_RE = /`(?:[^`\\]|\\[^])*`/g, SQ_STR_RE = /'(?:[^'\\]|\\[^])*'/g, DQ_STR_RE = /"(?:[^"\\]|\\[^])*"/g;
    const stmtHash = (text) => {
      // one tokenizing pass: keywords keep identity (uppercased), identifiers -> I, numbers -> N,
      // string/template contents -> S, whitespace dropped. Statement STRUCTURE survives; naming
      // and literals do not — Type-2 normalization per statement, Type-3 via the multiset.
      const t = String(text)
        .replace(TPL_STR_RE, 'S').replace(SQ_STR_RE, 'S').replace(DQ_STR_RE, 'S')
        .replace(/\b[A-Za-z_$][\w$]*\b/g, (m) => (JS_KW.has(m) ? m.toUpperCase() : 'I'))
        .replace(/\b\d[\w.]*\b/g, 'N')
        .replace(/\s+/g, '');
      if (t.length < 3) return null; // bare punctuation carries no signal
      let h = 0x811c9dc5;
      for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
      return h.toString(16).padStart(8, '0');
    };
    // finding 7: ONE cursor traversal replaces the previous three full-tree walks (methods, t3
    // fingerprints, dispatch) AND the per-symbol body re-parse for exact complexity. The old
    // walkTree pattern crossed the JS<->WASM boundary once per child per walk (profiled at 62% of
    // AST extract self-time), and cyclomaticExact re-parsed every regex-owned body from scratch
    // (28%). The cursor visits each node once with cheap nodeType/nodeId reads; ancestor STACKS
    // replace upward parent-walks; decision counts accumulate on every open function frame, so
    // exact complexity becomes a by-start-row lookup (cxByLine) instead of a re-parse. Dispatch
    // candidates are collected during the walk and resolved AFTER it — methodsByClass must be
    // complete before resolution, which the old three-walk ordering guaranteed implicitly.
    const extractJsTs = (text, relPath) => {
      let tree = null;
      try {
        tree = parser.parse(String(text || ''));
        const r = String(relPath).replace(/\\/g, '/');
        const mkId = (name) => `${r}:${name}`;
        const methods = [];
        const methodIds = new Set();
        const methodsByClass = new Map(); // className -> Set(methodName)
        const t3ByLine = {};              // Spec H statement fingerprints, keyed by owner fn start row
        const decisionRows = {};          // row -> McCabe decision-node count. A regex symbol's exact
                                          // complexity = 1 + sum over its extent rows — the same set the
                                          // old per-body slice re-parse counted, without the re-parse.
        const pendingCalls = [];          // {from, cls, prop} — this-calls + typed-receiver calls, resolved post-walk
        const classStack = [];            // {name, id, bodyId} — nearest enclosing class = top
        const fnStack = [];               // FN_LIKE frames: {id, row, body, bodyId, inBody, type, methodRec?}
        const ownerStack = [];            // dispatch attribution (method_definition/function_declaration only): {name, className, node, params}
        const parentTypes = [];           // ancestor node types (top = current node's parent)
        const parentIds = [];             // ancestor node ids (parallel to parentTypes)

        const enter = () => {
          const type = cursor.nodeType;
          const parentType = parentTypes.length ? parentTypes[parentTypes.length - 1] : null;
          const topFn = fnStack.length ? fnStack[fnStack.length - 1] : null;
          if (topFn && topFn.bodyId === cursor.nodeId) topFn.inBody = true; // entering the method's own body block

          // McCabe decisions: tallied per START ROW (regex symbols sum their extent rows — the same
          // decision set the old slice re-parse saw), and onto every open method frame whose body
          // block is active (method complexity = its block's descendants, the old complexityOf
          // contract — nested functions included).
          {
            let dec = DECISION_TYPES.has(type);
            if (!dec && type === 'binary_expression') {
              const op = cursor.currentNode.childForFieldName('operator');
              dec = !!op && DECISION_OPS.has(op.text);
            }
            if (dec) {
              const row = cursor.startPosition.row + 1;
              decisionRows[row] = (decisionRows[row] || 0) + 1;
              for (const fr of fnStack) if (fr.inBody) fr.body++;
            }
          }

          if (type === 'class_declaration') {
            const node = cursor.currentNode;
            classStack.push({
              name: node.childForFieldName('name')?.text || null,
              id: cursor.nodeId,
              bodyId: node.childForFieldName('body')?.id ?? -1,
            });
            const top = classStack[classStack.length - 1];
            if (top.name && !methodsByClass.has(top.name)) methodsByClass.set(top.name, new Set());
          } else if (FN_LIKE.has(type)) {
            const frame = { id: cursor.nodeId, row: cursor.startPosition.row + 1, body: 0, bodyId: -1, inBody: false, type };
            if (type === 'method_definition') {
              const node = cursor.currentNode;
              const cls = classStack.length ? classStack[classStack.length - 1] : null;
              const mname = node.childForFieldName('name')?.text || null;
              frame.bodyId = node.childForFieldName('body')?.id ?? -1;
              // a METHOD NODE is emitted only for direct class-body children (object-literal
              // methods etc. still attribute dispatch, but are not class methods)
              if (cls?.name && mname && parentIds.length && parentIds[parentIds.length - 1] === cls.bodyId) {
                methodsByClass.get(cls.name)?.add(mname);
                const mid = mkId(`${cls.name}.${mname}`);
                if (!methodIds.has(mid)) { // overloads collapse to one node
                  methodIds.add(mid);
                  frame.methodRec = { id: mid, label: mname, line: frame.row, endLine: node.endPosition.row + 1, complexity: 1 };
                  methods.push(frame.methodRec);
                }
              }
              ownerStack.push({ name: mname, className: cls?.name || null, node, params: null });
            } else if (type === 'function_declaration') {
              const node = cursor.currentNode;
              ownerStack.push({ name: node.childForFieldName('name')?.text || null, className: null, node, params: null });
            }
            fnStack.push(frame);
          } else if (type === 'call_expression') {
            const node = cursor.currentNode;
            const fn = node.childForFieldName('function');
            if (fn && fn.type === 'member_expression') { // plain identifier calls = regex's job
              const obj = fn.childForFieldName('object');
              const prop = fn.childForFieldName('property')?.text;
              const own = ownerStack.length ? ownerStack[ownerStack.length - 1] : null;
              if (obj && prop && own && own.name) {
                const from = mkId(own.className ? `${own.className}.${own.name}` : own.name);
                if (obj.type === 'this' && own.className) {
                  pendingCalls.push({ from, cls: own.className, prop });
                } else if (obj.type === 'identifier') {
                  if (own.params == null) own.params = paramTypes(own.node); // one field-walk per owner, not per call
                  const t = own.params.get(obj.text);
                  if (t) pendingCalls.push({ from, cls: t, prop });
                }
              }
            }
          }

          // Spec H: a statement that is a DIRECT child of a statement_block inside a function-like
          // node contributes its normalized hash to that function's Type-3 multiset.
          if (parentType === 'statement_block' && fnStack.length && cursor.nodeIsNamed && !FN_LIKE.has(type) && type !== 'comment') {
            const row = fnStack[fnStack.length - 1].row;
            const h = stmtHash(cursor.nodeText);
            if (h) (t3ByLine[row] || (t3ByLine[row] = [])).push(h);
          }
        };

        const exitNode = (id) => {
          const topFn = fnStack.length ? fnStack[fnStack.length - 1] : null;
          if (topFn && topFn.id === id) {
            const fr = fnStack.pop();
            if (fr.methodRec) fr.methodRec.complexity = 1 + fr.body;    // method complexity = its body block only (old complexityOf contract)
            if (fr.type === 'method_definition' || fr.type === 'function_declaration') ownerStack.pop();
          } else if (topFn && topFn.bodyId === id) topFn.inBody = false;
          if (classStack.length && classStack[classStack.length - 1].id === id) classStack.pop();
        };

        const cursor = tree.walk();
        try {
          let done = false;
          while (!done) {
            enter();
            parentTypes.push(cursor.nodeType); parentIds.push(cursor.nodeId);
            if (cursor.gotoFirstChild()) continue;
            parentTypes.pop(); exitNode(parentIds.pop());
            for (;;) {
              if (cursor.gotoNextSibling()) break;
              if (!cursor.gotoParent()) { done = true; break; }
              parentTypes.pop(); exitNode(parentIds.pop());
            }
          }
        } finally { cursor.delete(); }

        for (const k of Object.keys(t3ByLine)) { t3ByLine[k].sort(); if (t3ByLine[k].length < 6) delete t3ByLine[k]; }

        // Resolve dispatch candidates against the now-complete method tables.
        const dispatch = [];
        const seen = new Set();
        for (const c of pendingCalls) {
          if (!methodsByClass.get(c.cls)?.has(c.prop)) continue;
          const to = mkId(`${c.cls}.${c.prop}`);
          if (c.from === to || !methodIds.has(to)) continue; // only wire to an emitted method (precision)
          const k = c.from + '\t' + to;
          if (seen.has(k)) continue;
          seen.add(k);
          dispatch.push({ from: c.from, to });
        }

        // Canonical order so the merged graph is deterministic regardless of DFS direction.
        methods.sort((a, b) => a.line - b.line || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        dispatch.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.to < b.to ? -1 : a.to > b.to ? 1 : 0));
        return { methods, dispatch, t3ByLine, decisionRows };
      } catch {
        return null; // any parse/traversal failure -> regex fallback for this file
      } finally { if (tree) tree.delete(); } // finding 6: free the WASM tree either way
    };

    _engine = { cyclomaticExact, extractJsTs, version };
  } catch {
    _engine = null; // any failure (missing dep, init error) → graceful fallback signal
  }
  return _engine;
}

// ---- Java / C# dispatch tier (docs/specs/java-cs-tree-sitter.md) -------------------------------
// The regex tier owns Java/C# NODES (proven in the v8 expansion); this tier contributes only the
// DISPATCH information regex deliberately drops: same-file `this.m()` calls resolved immediately,
// and typed-receiver `helper.compute()` calls emitted as INTENTS {from, recvType, method} for the
// extractor's global pass to resolve against the whole graph (unique class name -> edge; anything
// ambiguous is dropped and counted — the same precision contract as the JS tier). Grammar absent
// or web-tree-sitter missing -> null, and regex output stays byte-identical.

const LANG_GRAMMARS = {
  java: join(HERE, '..', 'grammars', 'tree-sitter-java.wasm'),
  csharp: join(HERE, '..', 'grammars', 'tree-sitter-c-sharp.wasm'),
  python: join(HERE, '..', 'grammars', 'tree-sitter-python.wasm'),
  go: join(HERE, '..', 'grammars', 'tree-sitter-go.wasm'),
  rust: join(HERE, '..', 'grammars', 'tree-sitter-rust.wasm'),
  ruby: join(HERE, '..', 'grammars', 'tree-sitter-ruby.wasm'),
  php: join(HERE, '..', 'grammars', 'tree-sitter-php.wasm'),
};
const LANG_SHAPES = {
  java: { classes: new Set(['class_declaration']), method: 'method_declaration', invoke: 'method_invocation', param: 'formal_parameter', typeNode: 'type_identifier', thisNode: 'this' },
  csharp: { classes: new Set(['class_declaration']), method: 'method_declaration', invoke: 'invocation_expression', param: 'parameter', typeNode: 'identifier', thisNode: 'this_expression' },
};

// Spec F: Python/Go/Rust dispatch walkers — the shape table fits the Java/C# family; these three
// need dedicated tree shapes (probed empirically, pinned by tests). Same contract as the shape
// path: regex owns nodes; the walker returns ONLY {thisCalls, typedIntents}, self/receiver calls
// resolved in-file, typed intents resolved globally by extract-symbols under the one-owner rule.
// Receivers/types accepted only as bare identifiers (precision over recall, as everywhere).
const BARE_TYPE = /^[A-Za-z_][\w]*$/;
const stripRustRef = (t) => t.replace(/^&\s*(?:mut\s+)?/, '').trim();
const LANG_WALKERS = {
  // #14: Ruby — no static types, so the dispatch win is self./implicit-receiver calls INSIDE a
  // class (the parser has already disambiguated `prepare(1)` as a CALL, so wiring it to a sibling
  // method is precision-safe; a bare `other` identifier is NOT a call node and stays unwired).
  // `def self.x` (singleton_method) groups with the class like the regex tier does.
  ruby: (parser) => (text, relPath) => {
    let tree = null;
    try {
      tree = parser.parse(String(text || ''));
      const r = String(relPath).replace(/\\/g, '/');
      const up = (n, types) => { let c = n.parent; while (c && !types.has(c.type)) c = c.parent; return c; };
      const CLASSY = new Set(['class', 'module']);
      const METHODY = new Set(['method', 'singleton_method']);
      const nameOf = (n) => { const f = n.childForFieldName('name'); if (f) return f.text; for (let i = 0; i < n.childCount; i++) if (n.child(i).type === 'identifier') return n.child(i).text; return null; };
      const classNameOf = (c) => { for (let i = 0; i < c.childCount; i++) if (c.child(i).type === 'constant') return c.child(i).text; return null; };
      const methodsByClass = new Map();
      walkTree(tree.rootNode, (n) => {
        if (!CLASSY.has(n.type)) return;
        const cn = classNameOf(n); if (!cn) return;
        const set = methodsByClass.get(cn) || new Set();
        walkTree(n, (m) => { if (METHODY.has(m.type) && up(m, CLASSY)?.id === n.id) { const mn = nameOf(m); if (mn) set.add(mn); } }); // .id: tree-sitter nodes are not reference-equal across traversals
        methodsByClass.set(cn, set);
      });
      const thisCalls = [], seen = new Set();
      walkTree(tree.rootNode, (n) => {
        if (n.type !== 'call') return;
        const recv = n.childForFieldName('receiver');
        const mname = n.childForFieldName('method')?.text;
        if (!mname) return;
        if (recv && recv.type !== 'self') return; // typed receivers don't exist in Ruby — self/implicit only
        const encl = up(n, METHODY); if (!encl) return;
        const enclCls = up(encl, CLASSY); if (!enclCls) return;
        const cls = classNameOf(enclCls); if (!cls) return;
        if (!methodsByClass.get(cls)?.has(mname)) return;
        const from = `${r}:${cls}.${nameOf(encl)}`;
        const to = `${r}:${cls}.${mname}`;
        const k = from + '\t' + to;
        if (from !== to && !seen.has(k)) { seen.add(k); thisCalls.push({ from, to }); }
      });
      thisCalls.sort((a, b) => (a.from + a.to < b.from + b.to ? -1 : 1));
      return { thisCalls, typedIntents: [] };
    } catch { return null; } finally { if (tree) tree.delete(); } // finding 6
  },
  // #14: PHP — `$this->m()` resolves in-class; `$p->m()` where the enclosing method declares
  // `Type $p` becomes a typed intent, resolved globally under the one-owner rule.
  php: (parser) => (text, relPath) => {
    let tree = null;
    try {
      tree = parser.parse(String(text || ''));
      const r = String(relPath).replace(/\\/g, '/');
      const up = (n, type) => { let c = n.parent; while (c && c.type !== type) c = c.parent; return c; };
      const varName = (vn) => { if (!vn || vn.type !== 'variable_name') return null; for (let i = 0; i < vn.childCount; i++) if (vn.child(i).type === 'name') return vn.child(i).text; return null; };
      const methodsByClass = new Map();
      walkTree(tree.rootNode, (n) => {
        if (n.type !== 'class_declaration') return;
        const cn = n.childForFieldName('name')?.text; if (!cn) return;
        const set = methodsByClass.get(cn) || new Set();
        walkTree(n, (m) => { if (m.type === 'method_declaration' && up(m, 'class_declaration')?.id === n.id) { const mn = m.childForFieldName('name')?.text; if (mn) set.add(mn); } }); // .id: see ruby note
        methodsByClass.set(cn, set);
      });
      const typedParamsOf = (fn) => {
        const map = new Map();
        const params = fn?.childForFieldName('parameters');
        if (!params) return map;
        walkTree(params, (p) => {
          if (p.type !== 'simple_parameter') return;
          const ty = p.childForFieldName('type');
          const nm = varName(p.childForFieldName('name'));
          const tyText = ty?.text?.replace(/^\?/, ''); // ?Filter -> Filter (nullable)
          if (nm && tyText && BARE_TYPE.test(tyText)) map.set(nm, tyText);
        });
        return map;
      };
      const thisCalls = [], typedIntents = [], seen = new Set();
      walkTree(tree.rootNode, (n) => {
        if (n.type !== 'member_call_expression') return;
        const objName = varName(n.childForFieldName('object'));
        const prop = n.childForFieldName('name')?.text;
        if (!objName || !prop) return;
        const encl = up(n, 'method_declaration'); if (!encl) return;
        const enclCls = up(encl, 'class_declaration');
        const cls = enclCls?.childForFieldName('name')?.text;
        const from = `${r}:${cls ? cls + '.' : ''}${encl.childForFieldName('name')?.text}`;
        if (objName === 'this') {
          if (cls && methodsByClass.get(cls)?.has(prop)) {
            const to = `${r}:${cls}.${prop}`;
            const k = from + '\t' + to;
            if (from !== to && !seen.has(k)) { seen.add(k); thisCalls.push({ from, to }); }
          }
          return;
        }
        const t = typedParamsOf(encl).get(objName);
        if (t) { const k = from + '\t' + t + '\t' + prop; if (!seen.has(k)) { seen.add(k); typedIntents.push({ from, recvType: t, method: prop }); } }
      });
      thisCalls.sort((a, b) => (a.from + a.to < b.from + b.to ? -1 : 1));
      typedIntents.sort((a, b) => ((a.from + a.recvType + a.method) < (b.from + b.recvType + b.method) ? -1 : 1));
      return { thisCalls, typedIntents };
    } catch { return null; } finally { if (tree) tree.delete(); } // finding 6
  },

  python: (parser) => (text, relPath) => {
    let tree = null;
    try {
      tree = parser.parse(String(text || ''));
      const r = String(relPath).replace(/\\/g, '/');
      const name = (n) => n?.childForFieldName('name')?.text || null;
      const up = (n, type) => { let c = n.parent; while (c && c.type !== type) c = c.parent; return c; };
      const methodsByClass = new Map();
      walkTree(tree.rootNode, (n) => {
        if (n.type !== 'class_definition') return;
        const cn = name(n); if (!cn) return;
        const set = methodsByClass.get(cn) || new Set();
        const body = n.childForFieldName('body');
        if (body) for (let i = 0; i < body.childCount; i++) { const m = body.child(i); if (m.type === 'function_definition') { const mn = name(m); if (mn) set.add(mn); } }
        methodsByClass.set(cn, set);
      });
      const typedParamsOf = (fn) => {
        const map = new Map();
        const params = fn?.childForFieldName('parameters');
        if (!params) return map;
        for (let i = 0; i < params.childCount; i++) {
          const p = params.child(i);
          if (p.type !== 'typed_parameter') continue;
          const id = p.child(0), ty = p.childForFieldName('type');
          if (id?.type === 'identifier' && ty && BARE_TYPE.test(ty.text)) map.set(id.text, ty.text);
        }
        return map;
      };
      const thisCalls = [], typedIntents = [], seen = new Set();
      walkTree(tree.rootNode, (n) => {
        if (n.type !== 'call') return;
        const fn = n.childForFieldName('function');
        if (!fn || fn.type !== 'attribute') return;
        const obj = fn.childForFieldName('object'), prop = fn.childForFieldName('attribute')?.text;
        if (!obj || obj.type !== 'identifier' || !prop) return;
        const encl = up(n, 'function_definition'); if (!encl) return;
        const enclCls = up(encl, 'class_definition');
        const from = `${r}:${enclCls ? name(enclCls) + '.' : ''}${name(encl)}`;
        if (obj.text === 'self' || obj.text === 'cls') {
          const cls = enclCls && name(enclCls);
          if (cls && methodsByClass.get(cls)?.has(prop)) {
            const to = `${r}:${cls}.${prop}`;
            const k = from + '\t' + to;
            if (from !== to && !seen.has(k)) { seen.add(k); thisCalls.push({ from, to }); }
          }
          return;
        }
        const t = typedParamsOf(encl).get(obj.text);
        if (t) { const k = from + '\t' + t + '\t' + prop; if (!seen.has(k)) { seen.add(k); typedIntents.push({ from, recvType: t, method: prop }); } }
      });
      thisCalls.sort((a, b) => (a.from + a.to < b.from + b.to ? -1 : 1));
      typedIntents.sort((a, b) => ((a.from + a.recvType + a.method) < (b.from + b.recvType + b.method) ? -1 : 1));
      return { thisCalls, typedIntents };
    } catch { return null; } finally { if (tree) tree.delete(); } // finding 6
  },
  go: (parser) => (text, relPath) => {
    let tree = null;
    try {
      tree = parser.parse(String(text || ''));
      const r = String(relPath).replace(/\\/g, '/');
      const up = (n, types) => { let c = n.parent; while (c && !types.has(c.type)) c = c.parent; return c; };
      const FN_TYPES = new Set(['method_declaration', 'function_declaration']);
      const recvOf = (m) => { // -> {varName, typeName} | null, pointer stripped
        const recv = m.childForFieldName('receiver');
        if (!recv) return null;
        for (let i = 0; i < recv.childCount; i++) {
          const p = recv.child(i);
          if (p.type !== 'parameter_declaration') continue;
          const nm = p.childForFieldName('name')?.text;
          let ty = p.childForFieldName('type');
          if (ty?.type === 'pointer_type') ty = ty.child(1) || ty;
          const tn = ty?.text?.replace(/^\*/, '');
          if (nm && tn && BARE_TYPE.test(tn)) return { varName: nm, typeName: tn };
        }
        return null;
      };
      const methodsByType = new Map();
      walkTree(tree.rootNode, (n) => {
        if (n.type !== 'method_declaration') return;
        const rec = recvOf(n), mn = n.childForFieldName('name')?.text;
        if (!rec || !mn) return;
        const set = methodsByType.get(rec.typeName) || new Set();
        set.add(mn);
        methodsByType.set(rec.typeName, set);
      });
      const typedParamsOf = (fn) => {
        const map = new Map();
        const params = fn?.childForFieldName('parameters');
        if (!params) return map;
        for (let i = 0; i < params.childCount; i++) {
          const p = params.child(i);
          if (p.type !== 'parameter_declaration') continue;
          const nm = p.childForFieldName('name')?.text;
          let ty = p.childForFieldName('type');
          if (ty?.type === 'pointer_type') ty = ty.child(1) || ty;
          const tn = ty?.text?.replace(/^\*/, '');
          if (nm && tn && BARE_TYPE.test(tn)) map.set(nm, tn);
        }
        return map;
      };
      const thisCalls = [], typedIntents = [], seen = new Set();
      walkTree(tree.rootNode, (n) => {
        if (n.type !== 'call_expression') return;
        const fn = n.childForFieldName('function');
        if (!fn || fn.type !== 'selector_expression') return;
        const obj = fn.childForFieldName('operand'), prop = fn.childForFieldName('field')?.text;
        if (!obj || obj.type !== 'identifier' || !prop) return;
        const encl = up(n, FN_TYPES); if (!encl) return;
        const enclName = encl.childForFieldName('name')?.text; if (!enclName) return;
        const enclRecv = encl.type === 'method_declaration' ? recvOf(encl) : null;
        const from = `${r}:${enclRecv ? enclRecv.typeName + '.' : ''}${enclName}`;
        if (enclRecv && obj.text === enclRecv.varName) {
          if (methodsByType.get(enclRecv.typeName)?.has(prop)) {
            const to = `${r}:${enclRecv.typeName}.${prop}`;
            const k = from + '\t' + to;
            if (from !== to && !seen.has(k)) { seen.add(k); thisCalls.push({ from, to }); }
          }
          return;
        }
        const t = typedParamsOf(encl).get(obj.text);
        if (t) { const k = from + '\t' + t + '\t' + prop; if (!seen.has(k)) { seen.add(k); typedIntents.push({ from, recvType: t, method: prop }); } }
      });
      thisCalls.sort((a, b) => (a.from + a.to < b.from + b.to ? -1 : 1));
      typedIntents.sort((a, b) => ((a.from + a.recvType + a.method) < (b.from + b.recvType + b.method) ? -1 : 1));
      return { thisCalls, typedIntents };
    } catch { return null; } finally { if (tree) tree.delete(); } // finding 6
  },
  rust: (parser) => (text, relPath) => {
    let tree = null;
    try {
      tree = parser.parse(String(text || ''));
      const r = String(relPath).replace(/\\/g, '/');
      const up = (n, type) => { let c = n.parent; while (c && c.type !== type) c = c.parent; return c; };
      const implType = (imp) => { const t = imp.childForFieldName('type'); return t && BARE_TYPE.test(t.text) ? t.text : null; };
      const methodsByType = new Map();
      walkTree(tree.rootNode, (n) => {
        if (n.type !== 'impl_item') return;
        const tn = implType(n); if (!tn) return;
        const set = methodsByType.get(tn) || new Set();
        const body = n.childForFieldName('body');
        if (body) for (let i = 0; i < body.childCount; i++) { const f = body.child(i); if (f.type === 'function_item') { const fn = f.childForFieldName('name')?.text; if (fn) set.add(fn); } }
        methodsByType.set(tn, set);
      });
      const typedParamsOf = (fn) => {
        const map = new Map();
        const params = fn?.childForFieldName('parameters');
        if (!params) return map;
        for (let i = 0; i < params.childCount; i++) {
          const p = params.child(i);
          if (p.type !== 'parameter') continue;
          const nm = p.childForFieldName('pattern')?.text;
          const tn = p.childForFieldName('type') ? stripRustRef(p.childForFieldName('type').text) : null;
          if (nm && tn && BARE_TYPE.test(nm) && BARE_TYPE.test(tn)) map.set(nm, tn);
        }
        return map;
      };
      const thisCalls = [], typedIntents = [], seen = new Set();
      walkTree(tree.rootNode, (n) => {
        if (n.type !== 'call_expression') return;
        const fn = n.childForFieldName('function');
        if (!fn || fn.type !== 'field_expression') return;
        const obj = fn.childForFieldName('value'), prop = fn.childForFieldName('field')?.text;
        if (!obj || !prop) return;
        const encl = up(n, 'function_item'); if (!encl) return;
        const enclImpl = up(encl, 'impl_item');
        const implName = enclImpl && implType(enclImpl);
        const from = `${r}:${implName ? implName + '.' : ''}${encl.childForFieldName('name')?.text}`;
        if (obj.type === 'self' || obj.text === 'self') {
          if (implName && methodsByType.get(implName)?.has(prop)) {
            const to = `${r}:${implName}.${prop}`;
            const k = from + '\t' + to;
            if (from !== to && !seen.has(k)) { seen.add(k); thisCalls.push({ from, to }); }
          }
          return;
        }
        if (obj.type !== 'identifier') return;
        const t = typedParamsOf(encl).get(obj.text);
        if (t) { const k = from + '\t' + t + '\t' + prop; if (!seen.has(k)) { seen.add(k); typedIntents.push({ from, recvType: t, method: prop }); } }
      });
      thisCalls.sort((a, b) => (a.from + a.to < b.from + b.to ? -1 : 1));
      typedIntents.sort((a, b) => ((a.from + a.recvType + a.method) < (b.from + b.recvType + b.method) ? -1 : 1));
      return { thisCalls, typedIntents };
    } catch { return null; } finally { if (tree) tree.delete(); } // finding 6
  },
};

const _langEngines = {}; // key -> undefined(not tried)/null(unavailable)/engine

/** Lazily load the dispatch engine for 'java'|'csharp'|'python'|'go'|'rust'. Returns { extractDispatch } or null. */
export async function loadLangEngine(key) {
  if (_langEngines[key] !== undefined) return _langEngines[key];
  try {
    const grammarPath = LANG_GRAMMARS[key];
    const shape = LANG_SHAPES[key];
    if (!grammarPath || (!shape && !LANG_WALKERS[key]) || !existsSync(grammarPath)) { _langEngines[key] = null; return null; }
    const ts = await import('web-tree-sitter');
    const { Parser, Language } = ts;
    await Parser.init();
    const parser = new Parser();
    parser.setLanguage(await Language.load(readFileSync(grammarPath)));

    if (LANG_WALKERS[key]) { // Spec F: dedicated tree-shape walker (python/go/rust)
      _langEngines[key] = { extractDispatch: LANG_WALKERS[key](parser) };
      return _langEngines[key];
    }

    const className = (n) => n.childForFieldName('name')?.text || null;
    const enclosing = (node, types) => { let c = node.parent; while (c && !types.has(c.type)) c = c.parent; return c; };
    const METHOD_SET = new Set([shape.method]);

    const extractDispatch = (text, relPath) => {
      let tree = null;
      try {
        tree = parser.parse(String(text || ''));
        const r = String(relPath).replace(/\\/g, '/');
        const qualId = (cls, m) => `${r}:${cls}.${m}`;
        const methodsByClass = new Map(); // class -> Set(method names) in THIS file
        walkTree(tree.rootNode, (n) => {
          if (!shape.classes.has(n.type)) return;
          const cname = className(n);
          if (!cname) return;
          const set = methodsByClass.get(cname) || new Set();
          const body = n.childForFieldName('body');
          if (body) for (let i = 0; i < body.childCount; i++) {
            const m = body.child(i);
            if (m.type === shape.method) { const mn = className(m); if (mn) set.add(mn); }
          }
          methodsByClass.set(cname, set);
        });

        // declared param types of the enclosing method: identifier -> class/type name
        const paramTypesOf = (methodNode) => {
          const map = new Map();
          const params = methodNode?.childForFieldName('parameters');
          if (!params) return map;
          for (let i = 0; i < params.childCount; i++) {
            const p = params.child(i);
            if (p.type !== shape.param) continue;
            const tNode = p.childForFieldName('type');
            const nNode = p.childForFieldName('name');
            if (tNode?.type === shape.typeNode && nNode) map.set(nNode.text, tNode.text);
          }
          return map;
        };

        const thisCalls = [], typedIntents = [];
        const seen = new Set();
        walkTree(tree.rootNode, (n) => {
          if (n.type !== shape.invoke) return;
          let obj, prop;
          if (key === 'java') {
            obj = n.childForFieldName('object');
            prop = n.childForFieldName('name')?.text;
          } else {
            const fn = n.childForFieldName('function');
            if (!fn || fn.type !== 'member_access_expression') return;
            obj = fn.childForFieldName('expression');
            prop = fn.childForFieldName('name')?.text;
          }
          if (!obj || !prop) return;
          const mNode = enclosing(n, METHOD_SET);
          const cNode = mNode && enclosing(mNode, shape.classes);
          const mName = mNode && className(mNode), cName = cNode && className(cNode);
          if (!mName || !cName) return;
          const from = qualId(cName, mName);
          if (obj.type === shape.thisNode) {
            if (methodsByClass.get(cName)?.has(prop)) {
              const to = qualId(cName, prop);
              const k = from + '\t' + to;
              if (from !== to && !seen.has(k)) { seen.add(k); thisCalls.push({ from, to }); }
            }
            return;
          }
          if (obj.type === 'identifier') {
            const t = paramTypesOf(mNode).get(obj.text);
            if (t) {
              const k = from + '\t' + t + '\t' + prop;
              if (!seen.has(k)) { seen.add(k); typedIntents.push({ from, recvType: t, method: prop }); }
            }
          }
        });
        thisCalls.sort((a, b) => (a.from + a.to < b.from + b.to ? -1 : 1));
        typedIntents.sort((a, b) => ((a.from + a.recvType + a.method) < (b.from + b.recvType + b.method) ? -1 : 1));
        return { thisCalls, typedIntents };
      } catch { return null; } finally { if (tree) tree.delete(); } // per-file fallback: regex output stands alone (finding 6: free either way)
    };

    _langEngines[key] = { extractDispatch };
  } catch { _langEngines[key] = null; }
  return _langEngines[key];
}

// Test-only: reset the memoized engine so a test can re-exercise the load path.
export function _resetForTest() { _engine = undefined; for (const k of Object.keys(_langEngines)) delete _langEngines[k]; }
