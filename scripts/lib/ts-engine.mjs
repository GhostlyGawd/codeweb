// codeweb optional tree-sitter engine (TypeScript/JavaScript) — exact cyclomatic complexity.
//
// This is the ADDITIVE, opt-in tier from docs/backlog-ast-tree-sitter.md (spike: spike/tree-sitter/
// in PR #17 — graduated here and since removed; git history keeps it). The regex engine
// (scripts/lib/complexity.mjs) remains the default and the fallback; this
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
    cpp: rt.present && existsSync(LANG_GRAMMARS.cpp),     // charter non-goal 8 / amendment A2
    c: rt.present && existsSync(LANG_GRAMMARS.c),         // charter non-goal 8 / amendment A2 (second source)
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
    // contract the spike established (spike/tree-sitter/extract-ts.mjs, PR #17 — now history-only). Returns null on any failure so the caller falls
    // back to the regex scanner per-file. Classes/functions keep bare ids (regex still owns them).
    // Spec H helpers: statement normalization + FNV-1a hash for Type-3 fingerprints.
    const FN_LIKE = new Set(['function_declaration', 'generator_function_declaration', 'function_expression', 'arrow_function', 'method_definition']);
    const JS_KW = new Set(['if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'return', 'break', 'continue', 'throw', 'try', 'catch', 'finally', 'new', 'delete', 'typeof', 'instanceof', 'in', 'of', 'void', 'yield', 'await', 'async', 'function', 'class', 'extends', 'super', 'this', 'const', 'let', 'var', 'null', 'undefined', 'true', 'false']);
    // Round 2, finding #15: unrolled-loop form (escape atom `\\[^]`) — the alternation form recursed
    // per character in V8; a >=8.4MB single-line string in any statement RangeError'd stmtHash.
    const TPL_STR_RE = /`[^`\\]*(?:\\[^][^`\\]*)*`/g, SQ_STR_RE = /'[^'\\]*(?:\\[^][^'\\]*)*'/g, DQ_STR_RE = /"[^"\\]*(?:\\[^][^"\\]*)*"/g;
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
                let mid = mkId(`${cls.name}.${mname}`);
                // Round 2, finding #12: a mid collision here is always TWO REAL BODIES (get/set
                // pair, or static/instance same-name) — TS overload *signatures* are
                // method_signature nodes, never framed by FN_LIKE. The second body was silently
                // dropped; it now suffixes the method's 1-based start line (frame.row is already
                // startPosition.row + 1 — do NOT add 1 again: the suffix must byte-match the regex
                // tier's '@' + start for A/B id equality). First occurrence keeps the bare id, so
                // existing queries/fingerprints don't churn.
                if (methodIds.has(mid)) mid += '@' + frame.row;
                if (!methodIds.has(mid)) { // same-line collision (minified pair) would still clash: ids must stay unique
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
  cpp: join(HERE, '..', 'grammars', 'tree-sitter-cpp.wasm'),
  c: join(HERE, '..', 'grammars', 'tree-sitter-c.wasm'),
};
// ---- one dispatch skeleton, nine language tables (finding 26) -------------------------------
// Every dispatch tier answers the same two questions — "is this a self/receiver call to a
// sibling method?" (thisCalls, resolved in-file) and "is the receiver a typed parameter?"
// (typedIntents, resolved globally by extract-symbols under the one-owner rule) — but the walker
// skeleton (ancestor climb, owner index, dedupe, sort) was previously copy-pasted per language,
// with `up()` defined five times in two drifted signatures and `typedParamsOf` four times.
// One skeleton now; each language declares only its genuine tree shape: how to index owners,
// what a member-call node looks like, what "self" is, and how typed params read. Same contract
// as before: receivers/types accepted only as bare identifiers (precision over recall), regex
// owns the nodes, walkers return ONLY {thisCalls, typedIntents}.
const BARE_TYPE = /^[A-Za-z_][\w]*$/;
const stripRustRef = (t) => t.replace(/^&\s*(?:mut\s+)?/, '').trim();
/** THE ancestor climb (was five per-language copies): nearest ancestor whose type is in `types`. */
const upTo = (n, types) => { let c = n.parent; while (c && !types.has(c.type)) c = c.parent; return c; };
/**
 * THE typed-parameter reader: `entry(p)` -> {nm, ty}|null per `paramType` node (deep for PHP).
 * `paramsNode` overrides where the list hangs — C++ puts it on the declarator, not the definition.
 */
const typedParamsFrom = (T) => (methodNode) => {
  const map = new Map();
  const params = T.paramsNode ? T.paramsNode(methodNode) : methodNode?.childForFieldName('parameters');
  if (!params) return map;
  const each = (p) => { if (p.type === T.paramType) { const e = T.entry(p); if (e) map.set(e.nm, e.ty); } };
  if (T.deep) walkTree(params, each);
  else for (let i = 0; i < params.childCount; i++) each(params.child(i));
  return map;
};

// Per-language helpers the tables share with their collectOwners
const RUBY_CLASSY = new Set(['class', 'module']);
const RUBY_METHODY = new Set(['method', 'singleton_method']);
const rubyNameOf = (n) => { const f = n.childForFieldName('name'); if (f) return f.text; for (let i = 0; i < n.childCount; i++) if (n.child(i).type === 'identifier') return n.child(i).text; return null; };
const rubyClassNameOf = (c) => { for (let i = 0; i < c.childCount; i++) if (c.child(i).type === 'constant') return c.child(i).text; return null; };
const phpVarName = (vn) => { if (!vn || vn.type !== 'variable_name') return null; for (let i = 0; i < vn.childCount; i++) if (vn.child(i).type === 'name') return vn.child(i).text; return null; };
const goRecvOf = (m) => { // -> {varName, typeName} | null, pointer stripped
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
const GO_FN_TYPES = new Set(['method_declaration', 'function_declaration']);
const PHP_METHOD = new Set(['method_declaration']), PHP_CLASS = new Set(['class_declaration']);
// C++ (non-goal 8 / A2). Its two shapes the other tiers don't have: a member body may sit INSIDE
// the class (like Java) or OUT OF LINE behind a `Type::` qualifier (like nothing else here), and a
// receiver may be a reference (`r.m()`) or a pointer (`p->m()`) — one `field_expression` either way.
const CPP_FN = new Set(['function_definition']);
const CPP_CLASS = new Set(['class_specifier', 'struct_specifier', 'union_specifier']);
/** Unwrap `*`/`&`/`[]`/parenthesized declarator layers down to the identifier-bearing node. */
const cppDeclCore = (d) => {
  let c = d;
  while (c && ['pointer_declarator', 'reference_declarator', 'array_declarator', 'parenthesized_declarator', 'init_declarator'].includes(c.type)) {
    c = c.childForFieldName('declarator') || c.namedChild(0);
  }
  return c;
};
/** The innermost name of a `qualified_identifier` (`geo::Shape` -> `Shape`), else null. */
const cppQualTail = (q) => {
  let id = q;
  while (id && id.type === 'qualified_identifier') id = id.childForFieldName('name');
  return id && (id.type === 'type_identifier' || id.type === 'identifier') && BARE_TYPE.test(id.text) ? id.text : null;
};
/** A function_definition's `{name, owner}` — owner from the `Type::` qualifier, else null. */
const cppFnName = (fn) => {
  let d = cppDeclCore(fn.childForFieldName('declarator'));
  if (!d || d.type !== 'function_declarator') return null;
  let id = cppDeclCore(d.childForFieldName('declarator'));
  // A qualified name nests scope-first (`geo::Shape::area`): walk to the innermost name, keeping
  // the LAST scope seen — namespaces are outer, so what remains adjacent to the name is the class.
  let owner = null;
  while (id && id.type === 'qualified_identifier') {
    const scope = id.childForFieldName('scope');
    if (scope && BARE_TYPE.test(scope.text)) owner = scope.text;
    id = id.childForFieldName('name');
  }
  if (!id || !['identifier', 'field_identifier', 'destructor_name', 'operator_name'].includes(id.type)) return null;
  return { name: id.text, owner };
};
/** The class a member DEFINITION belongs to: its `Type::` qualifier, else the enclosing class. */
const cppOwnerOf = (fn) => {
  const nm = cppFnName(fn);
  if (!nm) return null;
  if (nm.owner) return nm.owner;
  const cls = upTo(fn, CPP_CLASS);
  const cn = cls && fieldName(cls);
  return cn && BARE_TYPE.test(cn) ? cn : null;
};
// C (non-goal 8 / A2, second source). C has no methods, so it has no receiver dispatch at all —
// its polymorphism is the FUNCTION-POINTER TABLE (`struct Ops ops = { .compute = impl };` then
// `ops.compute(v)`), the shape every driver/plugin/vtable in C is built from. The designated
// initializer NAMES the implementation, so this is evidence, not inference: the same standard the
// other tiers hold to. Bindings are collected per FILE and keyed by the field name; a field bound
// two different ways in one file is a genuine ambiguity and wires nothing.
const C_FN = new Set(['function_definition']);
/** `.field = impl` / `.field = &impl` -> the bare implementation name, else null. */
const cInitTarget = (v) => {
  if (!v) return null;
  // `&impl` is the same binding as `impl` — the address-of is noise on a function name.
  const inner = v.type === 'pointer_expression' ? v.childForFieldName('argument') : v;
  return inner && inner.type === 'identifier' && BARE_TYPE.test(inner.text) ? inner.text : null;
};
const AMBIGUOUS_BINDING = Symbol('ambiguous');
const PY_FN = new Set(['function_definition']), PY_CLASS = new Set(['class_definition']);
const RS_FN = new Set(['function_item']), RS_IMPL = new Set(['impl_item']);
const JC_METHOD = new Set(['method_declaration']), JC_CLASS = new Set(['class_declaration']);
const rustImplType = (imp) => { const t = imp.childForFieldName('type'); return t && BARE_TYPE.test(t.text) ? t.text : null; };
const fieldName = (n) => n?.childForFieldName('name')?.text || null;

// Each table: collectOwners(root) -> Map(owner -> Set(members)); callSite(n) -> {obj, prop}|null;
// enclosingOf(n) -> {owner, name, methodNode, ...}|null (its own null-guards match the old
// walker exactly); isSelf(obj, ctx); identName(obj) -> bare receiver name|null (typed path);
// typedParams -> {paramType, deep?, entry} or absent (no typed tier, e.g. Ruby);
// localTarget(site, ctx, owners) -> callee label|null for a language whose in-file dispatch does
// not land on a sibling method (C's function-pointer table), absent for every other language.
const LANG_DISPATCH = {
  // #14: Ruby — no static types, so the dispatch win is self./implicit-receiver calls INSIDE a
  // class (the parser has already disambiguated `prepare(1)` as a CALL, so wiring it to a sibling
  // method is precision-safe; a bare `other` identifier is NOT a call node and stays unwired).
  // `def self.x` (singleton_method) groups with the class like the regex tier does.
  ruby: {
    collectOwners(root) {
      const methodsByClass = new Map();
      walkTree(root, (n) => {
        if (!RUBY_CLASSY.has(n.type)) return;
        const cn = rubyClassNameOf(n); if (!cn) return;
        const set = methodsByClass.get(cn) || new Set();
        walkTree(n, (m) => { if (RUBY_METHODY.has(m.type) && upTo(m, RUBY_CLASSY)?.id === n.id) { const mn = rubyNameOf(m); if (mn) set.add(mn); } }); // .id: tree-sitter nodes are not reference-equal across traversals
        methodsByClass.set(cn, set);
      });
      return methodsByClass;
    },
    callSite(n) {
      if (n.type !== 'call') return null;
      const recv = n.childForFieldName('receiver');
      const prop = n.childForFieldName('method')?.text;
      if (!prop) return null;
      if (recv && recv.type !== 'self') return null; // typed receivers don't exist in Ruby — self/implicit only
      return { obj: recv, prop };
    },
    enclosingOf(n) {
      const encl = upTo(n, RUBY_METHODY); if (!encl) return null;
      const enclCls = upTo(encl, RUBY_CLASSY); if (!enclCls) return null;
      const cls = rubyClassNameOf(enclCls); if (!cls) return null;
      return { owner: cls, name: rubyNameOf(encl), methodNode: encl };
    },
    isSelf: () => true, // callSite already filtered to self/implicit
    identName: () => null,
  },
  // #14: PHP — `$this->m()` resolves in-class; `$p->m()` where the enclosing method declares
  // `Type $p` becomes a typed intent, resolved globally under the one-owner rule.
  php: {
    collectOwners(root) {
      const methodsByClass = new Map();
      walkTree(root, (n) => {
        if (n.type !== 'class_declaration') return;
        const cn = fieldName(n); if (!cn) return;
        const set = methodsByClass.get(cn) || new Set();
        walkTree(n, (m) => { if (m.type === 'method_declaration' && upTo(m, PHP_CLASS)?.id === n.id) { const mn = fieldName(m); if (mn) set.add(mn); } }); // .id: see ruby note
        methodsByClass.set(cn, set);
      });
      return methodsByClass;
    },
    callSite(n) {
      if (n.type !== 'member_call_expression') return null;
      const objName = phpVarName(n.childForFieldName('object'));
      const prop = fieldName(n);
      if (!objName || !prop) return null;
      return { obj: objName, prop };
    },
    enclosingOf(n) {
      const encl = upTo(n, PHP_METHOD); if (!encl) return null;
      const enclCls = upTo(encl, PHP_CLASS);
      return { owner: enclCls ? fieldName(enclCls) : null, name: encl.childForFieldName('name')?.text, methodNode: encl };
    },
    isSelf: (obj) => obj === 'this',
    identName: (obj) => obj,
    typedParams: {
      paramType: 'simple_parameter', deep: true, // parameters nest (defaults/attributes) — walk, don't index
      entry(p) {
        const nm = phpVarName(p.childForFieldName('name'));
        const ty = p.childForFieldName('type')?.text?.replace(/^\?/, ''); // ?Filter -> Filter (nullable)
        return nm && ty && BARE_TYPE.test(ty) ? { nm, ty } : null;
      },
    },
  },
  // C++ — `this->m()` / `(*this).m()` resolve in-class; `r.m()` and `p->m()` where the enclosing
  // function declares `Type& r` / `Type* p` / `Type v` become typed intents, resolved globally
  // under the one-owner rule. Owners are collected from DEFINITIONS only (in-class bodies and
  // out-of-line `Type::m` bodies), never from prototypes — the regex tier mints nodes on exactly
  // the same rule, so a wired `to` always names a node that exists.
  cpp: {
    collectOwners(root) {
      const methodsByClass = new Map();
      walkTree(root, (n) => {
        if (n.type !== 'function_definition') return;
        const nm = cppFnName(n);
        const owner = cppOwnerOf(n);
        if (!nm || !owner) return;
        const set = methodsByClass.get(owner) || new Set();
        set.add(nm.name);
        methodsByClass.set(owner, set);
      });
      return methodsByClass;
    },
    callSite(n) {
      if (n.type !== 'call_expression') return null;
      const fn = n.childForFieldName('function');
      if (!fn || fn.type !== 'field_expression') return null; // `.` and `->` are one node type
      const obj = fn.childForFieldName('argument'), prop = fn.childForFieldName('field')?.text;
      if (!obj || !prop) return null;
      return { obj, prop };
    },
    enclosingOf(n) {
      const encl = upTo(n, CPP_FN); if (!encl) return null;
      const nm = cppFnName(encl); if (!nm) return null;
      return { owner: cppOwnerOf(encl), name: nm.name, methodNode: encl };
    },
    isSelf: (obj) => obj.type === 'this' || (obj.type === 'parenthesized_expression' && /^\(\s*\*\s*this\s*\)$/.test(obj.text)),
    identName: (obj) => (obj.type === 'identifier' ? obj.text : null),
    typedParams: {
      paramType: 'parameter_declaration',
      // C++ hangs `parameters` off the function_declarator inside the definition, not off the
      // definition node — and the declarator may sit under pointer/reference wrappers.
      paramsNode: (fn) => cppDeclCore(fn?.childForFieldName('declarator'))?.childForFieldName('parameters'),
      entry(p) {
        const ty = p.childForFieldName('type');
        const nm = cppDeclCore(p.childForFieldName('declarator'));
        // A `primitive_type` (int/double) names no class to dispatch on, and a template type has no
        // single owner — both stay out. A `qualified_identifier` (`const geo::Shape&`) resolves to
        // its TAIL: the leading scopes are namespaces, which are never symbols here, so the tail is
        // the class exactly as the regex tier records it.
        const tyName = ty?.type === 'type_identifier' ? ty.text
          : ty?.type === 'qualified_identifier' ? cppQualTail(ty) : null;
        return tyName && nm?.type === 'identifier' && BARE_TYPE.test(tyName)
          ? { nm: nm.text, ty: tyName } : null;
      },
    },
  },
  // C — the function-pointer table. `collectOwners` here indexes FIELD BINDINGS rather than class
  // members (one namespace per file, which is what a designated initializer scopes to), and
  // `localTarget` resolves `ops.compute(v)` / `p->compute(v)` to whatever the initializer assigned.
  // No typedParams: a `struct Ops *o` PARAMETER is not evidence — what it points at is the
  // caller's runtime choice, so an unbound receiver wires nothing.
  c: {
    collectOwners(root) {
      // field name -> implementation name, or AMBIGUOUS_BINDING once a second, different binding
      // for the same field appears. Same rule the typed tiers use for a repeated class name: two
      // candidates is a genuine ambiguity, and a guess would be worse than an absent edge.
      const byField = new Map();
      walkTree(root, (n) => {
        if (n.type !== 'initializer_pair') return;
        const target = cInitTarget(n.childForFieldName('value'));
        if (!target) return;
        // `.a.b = f` carries several designators; the LAST one names the field being assigned.
        let field = null;
        for (let i = 0; i < n.namedChildCount; i++) { const c = n.namedChild(i); if (c.type === 'field_designator') field = c.text.replace(/^\./, ''); }
        if (!field || !BARE_TYPE.test(field)) return;
        const prev = byField.get(field);
        if (prev === undefined) byField.set(field, target);
        else if (prev !== target) byField.set(field, AMBIGUOUS_BINDING);
      });
      return byField;
    },
    callSite(n) {
      if (n.type !== 'call_expression') return null;
      const fn = n.childForFieldName('function');
      if (!fn || fn.type !== 'field_expression') return null; // `.` and `->` are one node type
      const prop = fn.childForFieldName('field')?.text;
      if (!prop) return null;
      return { obj: fn.childForFieldName('argument'), prop };
    },
    enclosingOf(n) {
      const encl = upTo(n, C_FN); if (!encl) return null;
      const d = cppDeclCore(encl.childForFieldName('declarator'));
      if (!d || d.type !== 'function_declarator') return null;
      const id = cppDeclCore(d.childForFieldName('declarator'));
      if (!id || id.type !== 'identifier') return null;
      return { owner: null, name: id.text, methodNode: encl };
    },
    localTarget(site, ctx, bindings) {
      const bound = bindings.get(site.prop);
      return typeof bound === 'string' ? bound : null; // unbound or AMBIGUOUS_BINDING -> no edge
    },
    isSelf: () => false,
    identName: () => null,
  },
  python: {
    collectOwners(root) {
      const methodsByClass = new Map();
      walkTree(root, (n) => {
        if (n.type !== 'class_definition') return;
        const cn = fieldName(n); if (!cn) return;
        const set = methodsByClass.get(cn) || new Set();
        const body = n.childForFieldName('body');
        if (body) for (let i = 0; i < body.childCount; i++) { const m = body.child(i); if (m.type === 'function_definition') { const mn = fieldName(m); if (mn) set.add(mn); } }
        methodsByClass.set(cn, set);
      });
      return methodsByClass;
    },
    callSite(n) {
      if (n.type !== 'call') return null;
      const fn = n.childForFieldName('function');
      if (!fn || fn.type !== 'attribute') return null;
      const obj = fn.childForFieldName('object'), prop = fn.childForFieldName('attribute')?.text;
      if (!obj || obj.type !== 'identifier' || !prop) return null;
      return { obj, prop };
    },
    enclosingOf(n) {
      const encl = upTo(n, PY_FN); if (!encl) return null;
      const enclCls = upTo(encl, PY_CLASS);
      return { owner: enclCls ? fieldName(enclCls) : null, name: fieldName(encl), methodNode: encl };
    },
    isSelf: (obj) => obj.text === 'self' || obj.text === 'cls',
    identName: (obj) => obj.text,
    typedParams: {
      paramType: 'typed_parameter',
      entry(p) {
        const id = p.child(0), ty = p.childForFieldName('type');
        return id?.type === 'identifier' && ty && BARE_TYPE.test(ty.text) ? { nm: id.text, ty: ty.text } : null;
      },
    },
  },
  go: {
    collectOwners(root) {
      const methodsByType = new Map();
      walkTree(root, (n) => {
        if (n.type !== 'method_declaration') return;
        const rec = goRecvOf(n), mn = fieldName(n);
        if (!rec || !mn) return;
        const set = methodsByType.get(rec.typeName) || new Set();
        set.add(mn);
        methodsByType.set(rec.typeName, set);
      });
      return methodsByType;
    },
    callSite(n) {
      if (n.type !== 'call_expression') return null;
      const fn = n.childForFieldName('function');
      if (!fn || fn.type !== 'selector_expression') return null;
      const obj = fn.childForFieldName('operand'), prop = fn.childForFieldName('field')?.text;
      if (!obj || obj.type !== 'identifier' || !prop) return null;
      return { obj, prop };
    },
    enclosingOf(n) {
      const encl = upTo(n, GO_FN_TYPES); if (!encl) return null;
      const name = fieldName(encl); if (!name) return null;
      const rec = encl.type === 'method_declaration' ? goRecvOf(encl) : null;
      return { owner: rec ? rec.typeName : null, name, methodNode: encl, recvVar: rec ? rec.varName : null };
    },
    isSelf: (obj, ctx) => !!ctx.recvVar && obj.text === ctx.recvVar, // the receiver VARIABLE is Go's `this`
    identName: (obj) => obj.text,
    typedParams: {
      paramType: 'parameter_declaration',
      entry(p) {
        const nm = p.childForFieldName('name')?.text;
        let ty = p.childForFieldName('type');
        if (ty?.type === 'pointer_type') ty = ty.child(1) || ty;
        const tn = ty?.text?.replace(/^\*/, '');
        return nm && tn && BARE_TYPE.test(tn) ? { nm, ty: tn } : null;
      },
    },
  },
  rust: {
    collectOwners(root) {
      const methodsByType = new Map();
      walkTree(root, (n) => {
        if (n.type !== 'impl_item') return;
        const tn = rustImplType(n); if (!tn) return;
        const set = methodsByType.get(tn) || new Set();
        const body = n.childForFieldName('body');
        if (body) for (let i = 0; i < body.childCount; i++) { const f = body.child(i); if (f.type === 'function_item') { const fn = fieldName(f); if (fn) set.add(fn); } }
        methodsByType.set(tn, set);
      });
      return methodsByType;
    },
    callSite(n) {
      if (n.type !== 'call_expression') return null;
      const fn = n.childForFieldName('function');
      if (!fn || fn.type !== 'field_expression') return null;
      const obj = fn.childForFieldName('value'), prop = fn.childForFieldName('field')?.text;
      if (!obj || !prop) return null;
      return { obj, prop };
    },
    enclosingOf(n) {
      const encl = upTo(n, RS_FN); if (!encl) return null;
      const enclImpl = upTo(encl, RS_IMPL);
      const implName = enclImpl && rustImplType(enclImpl);
      return { owner: implName || null, name: encl.childForFieldName('name')?.text, methodNode: encl };
    },
    isSelf: (obj) => obj.type === 'self' || obj.text === 'self',
    identName: (obj) => (obj.type === 'identifier' ? obj.text : null),
    typedParams: {
      paramType: 'parameter',
      entry(p) {
        const nm = p.childForFieldName('pattern')?.text;
        const tn = p.childForFieldName('type') ? stripRustRef(p.childForFieldName('type').text) : null;
        return nm && tn && BARE_TYPE.test(nm) && BARE_TYPE.test(tn) ? { nm, ty: tn } : null;
      },
    },
  },
  // Java/C# (docs/specs/java-cs-tree-sitter.md): both REQUIRE an enclosing class (a top-level
  // function doesn't exist), so enclosingOf null-guards owner AND name — matching the old shape
  // walker's `if (!mName || !cName) return`.
  java: {
    collectOwners(root) {
      const methodsByClass = new Map();
      walkTree(root, (n) => {
        if (n.type !== 'class_declaration') return;
        const cn = fieldName(n); if (!cn) return;
        const set = methodsByClass.get(cn) || new Set();
        const body = n.childForFieldName('body');
        if (body) for (let i = 0; i < body.childCount; i++) { const m = body.child(i); if (m.type === 'method_declaration') { const mn = fieldName(m); if (mn) set.add(mn); } }
        methodsByClass.set(cn, set);
      });
      return methodsByClass;
    },
    callSite(n) {
      if (n.type !== 'method_invocation') return null;
      const obj = n.childForFieldName('object');
      const prop = fieldName(n);
      if (!obj || !prop) return null;
      return { obj, prop };
    },
    enclosingOf(n) {
      const encl = upTo(n, JC_METHOD); if (!encl) return null;
      const enclCls = upTo(encl, JC_CLASS);
      const owner = enclCls && fieldName(enclCls), name = fieldName(encl);
      if (!owner || !name) return null;
      return { owner, name, methodNode: encl };
    },
    isSelf: (obj) => obj.type === 'this',
    identName: (obj) => (obj.type === 'identifier' ? obj.text : null),
    typedParams: {
      paramType: 'formal_parameter',
      entry(p) {
        const tNode = p.childForFieldName('type');
        const nNode = p.childForFieldName('name');
        return tNode?.type === 'type_identifier' && nNode ? { nm: nNode.text, ty: tNode.text } : null;
      },
    },
  },
  csharp: {
    collectOwners(root) {
      const methodsByClass = new Map();
      walkTree(root, (n) => {
        if (n.type !== 'class_declaration') return;
        const cn = fieldName(n); if (!cn) return;
        const set = methodsByClass.get(cn) || new Set();
        const body = n.childForFieldName('body');
        if (body) for (let i = 0; i < body.childCount; i++) { const m = body.child(i); if (m.type === 'method_declaration') { const mn = fieldName(m); if (mn) set.add(mn); } }
        methodsByClass.set(cn, set);
      });
      return methodsByClass;
    },
    callSite(n) {
      if (n.type !== 'invocation_expression') return null;
      const fn = n.childForFieldName('function');
      if (!fn || fn.type !== 'member_access_expression') return null;
      const obj = fn.childForFieldName('expression');
      const prop = fieldName(fn);
      if (!obj || !prop) return null;
      return { obj, prop };
    },
    enclosingOf(n) {
      const encl = upTo(n, JC_METHOD); if (!encl) return null;
      const enclCls = upTo(encl, JC_CLASS);
      const owner = enclCls && fieldName(enclCls), name = fieldName(encl);
      if (!owner || !name) return null;
      return { owner, name, methodNode: encl };
    },
    isSelf: (obj) => obj.type === 'this_expression',
    identName: (obj) => (obj.type === 'identifier' ? obj.text : null),
    typedParams: {
      paramType: 'parameter',
      entry(p) {
        const tNode = p.childForFieldName('type');
        const nNode = p.childForFieldName('name');
        return tNode?.type === 'identifier' && nNode ? { nm: nNode.text, ty: tNode.text } : null;
      },
    },
  },
};

/** THE dispatch walk (was seven copies): owner index -> call sites -> dedupe -> sorted result. */
const makeDispatchWalker = (parser, L) => (text, relPath) => {
  let tree = null;
  try {
    tree = parser.parse(String(text || ''));
    const r = String(relPath).replace(/\\/g, '/');
    const owners = L.collectOwners(tree.rootNode);
    const paramsOf = L.typedParams ? typedParamsFrom(L.typedParams) : null;
    const thisCalls = [], typedIntents = [], seen = new Set();
    walkTree(tree.rootNode, (n) => {
      const site = L.callSite(n); if (!site) return;
      const ctx = L.enclosingOf(n); if (!ctx) return;
      const from = `${r}:${ctx.owner ? ctx.owner + '.' : ''}${ctx.name}`;
      // A language whose in-file dispatch does not land on a sibling METHOD supplies `localTarget`
      // and names its own callee label (C resolves a function-pointer field to a free function).
      // Dedupe, ordering and endpoint guarding stay shared.
      if (L.localTarget) {
        const label = L.localTarget(site, ctx, owners);
        if (label) {
          const to = `${r}:${label}`;
          const k = from + '\t' + to;
          if (from !== to && !seen.has(k)) { seen.add(k); thisCalls.push({ from, to }); }
        }
        return;
      }
      if (L.isSelf(site.obj, ctx)) {
        if (ctx.owner && owners.get(ctx.owner)?.has(site.prop)) {
          const to = `${r}:${ctx.owner}.${site.prop}`;
          const k = from + '\t' + to;
          if (from !== to && !seen.has(k)) { seen.add(k); thisCalls.push({ from, to }); }
        }
        return;
      }
      if (!paramsOf) return;
      const id = L.identName(site.obj);
      if (id == null) return;
      const t = paramsOf(ctx.methodNode).get(id);
      if (t) { const k = from + '\t' + t + '\t' + site.prop; if (!seen.has(k)) { seen.add(k); typedIntents.push({ from, recvType: t, method: site.prop }); } }
    });
    thisCalls.sort((a, b) => (a.from + a.to < b.from + b.to ? -1 : 1));
    typedIntents.sort((a, b) => ((a.from + a.recvType + a.method) < (b.from + b.recvType + b.method) ? -1 : 1));
    return { thisCalls, typedIntents };
  } catch { return null; } finally { if (tree) tree.delete(); } // per-file fallback: regex output stands alone (finding 6: free either way)
};

const _langEngines = {}; // key -> undefined(not tried)/null(unavailable)/engine

/** Lazily load the dispatch engine for any LANG_DISPATCH key (java/csharp/python/go/rust/ruby/php/cpp/c). Returns { extractDispatch } or null. */
export async function loadLangEngine(key) {
  if (_langEngines[key] !== undefined) return _langEngines[key];
  try {
    const grammarPath = LANG_GRAMMARS[key];
    if (!grammarPath || !LANG_DISPATCH[key] || !existsSync(grammarPath)) { _langEngines[key] = null; return null; }
    const ts = await import('web-tree-sitter');
    const { Parser, Language } = ts;
    await Parser.init();
    const parser = new Parser();
    parser.setLanguage(await Language.load(readFileSync(grammarPath)));

    _langEngines[key] = { extractDispatch: makeDispatchWalker(parser, LANG_DISPATCH[key]) };
  } catch { _langEngines[key] = null; }
  return _langEngines[key];
}

// Test-only: reset the memoized engine so a test can re-exercise the load path.
export function _resetForTest() { _engine = undefined; for (const k of Object.keys(_langEngines)) delete _langEngines[k]; }
