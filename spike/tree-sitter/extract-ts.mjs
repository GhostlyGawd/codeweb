// codeweb tree-sitter SPIKE extractor (TypeScript only).
//
// Goal: prove that a parse tree can ENRICH the existing {nodes, edges} schema with two things the
// zero-dependency regex engine structurally cannot produce precisely:
//   1. EXACT cyclomatic complexity (McCabe from real control-flow nodes) — same decision DEFINITION
//      as scripts/lib/complexity.mjs, so any gap is a precision gap, not a definitional one.
//   2. DYNAMIC-DISPATCH call edges — `this.m()` and typed-receiver `x.m()` resolved to the method,
//      which the regex extractor deliberately DROPS ("a method call obj.fn() is NOT wired").
//
// It NEVER executes the target (tree-sitter parses statically). Deterministic given the pinned
// grammar (see grammars/ + GO-NO-GO.md). This is quarantined spike code — not wired into the engine.

import { Parser, Language } from 'web-tree-sitter';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
// Prefer the vendored (pinned) grammar; fall back to the npm copy so a fresh `npm install` runs with
// no manual vendor step. The adoption PR would commit the vendored .wasm and drop the fallback.
const VENDORED = join(HERE, 'grammars', 'tree-sitter-typescript.wasm');
const FROM_NPM = join(HERE, 'node_modules', '@vscode', 'tree-sitter-wasm', 'wasm', 'tree-sitter-typescript.wasm');
const GRAMMAR_PATH = existsSync(VENDORED) ? VENDORED : FROM_NPM;

let _parser = null;
export async function loadParser() {
  if (_parser) return _parser;
  await Parser.init();
  const p = new Parser();
  p.setLanguage(await Language.load(readFileSync(GRAMMAR_PATH)));
  _parser = p;
  return p;
}

// --- decision set: held byte-identical to scripts/lib/complexity.mjs (non-py branch) ---
// keywords if/for/while/case/catch  +  && || ??  +  ternary.  do…while is a `do_statement` whose
// internal `while` the regex counts once → count do_statement once too. `switch_default` carries no
// `case` keyword → excluded, matching the regex.
const DECISION_TYPES = new Set([
  'if_statement', 'for_statement', 'for_in_statement', 'while_statement', 'do_statement',
  'switch_case', 'catch_clause', 'ternary_expression',
]);
const DECISION_OPS = new Set(['&&', '||', '??']);

function isDecision(node) {
  if (DECISION_TYPES.has(node.type)) return true;
  if (node.type === 'binary_expression') {
    const op = node.childForFieldName('operator');
    return !!op && DECISION_OPS.has(op.text);
  }
  return false;
}

// Count decisions in a body subtree. Matches F4's "whole body slice" scope: decisions inside nested
// arrows/functions roll up into the enclosing named symbol (the regex counts every token in the body
// lines too). Exact cyclomatic = 1 + decisions.
function cyclomaticExact(bodyNode) {
  if (!bodyNode) return 1;
  let decisions = 0;
  const stack = [bodyNode];
  while (stack.length) {
    const n = stack.pop();
    if (n !== bodyNode && isDecision(n)) decisions++;
    for (let i = 0; i < n.childCount; i++) stack.push(n.child(i));
  }
  return 1 + decisions;
}

const isExported = (decl) => decl.parent?.type === 'export_statement';

// Map a function/method's typed parameters: identifier -> declared class type name.
// `p: Pipeline` => {p: 'Pipeline'}. Only simple `type_identifier` annotations (a named class/type);
// array/generic/union types are left out (no receiver class to dispatch on) — precision over recall.
function paramTypes(fnNode) {
  const params = fnNode.childForFieldName('parameters');
  const map = new Map();
  if (!params) return map;
  for (let i = 0; i < params.childCount; i++) {
    const p = params.child(i);
    if (p.type !== 'required_parameter' && p.type !== 'optional_parameter') continue;
    const pat = p.childForFieldName('pattern');
    const typeAnn = p.childForFieldName('type'); // type_annotation
    const typeId = typeAnn && typeAnn.child(1); // ':' then the type node
    if (pat?.type === 'identifier' && typeId?.type === 'type_identifier') {
      map.set(pat.text, typeId.text);
    }
  }
  return map;
}

// Nearest enclosing NAMED symbol of a node: a method_definition or function_declaration. Returns
// {name, classNode|null, fnNode} or null (top-level / inside an anonymous arrow with no named owner).
function enclosingSymbol(node) {
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
}

function walk(node, visit) {
  const stack = [node];
  while (stack.length) {
    const n = stack.pop();
    visit(n);
    for (let i = 0; i < n.childCount; i++) stack.push(n.child(i));
  }
}

// Extract {nodes, edges} for one TypeScript file. relPath is the id prefix (schema: `<relpath>:<name>`).
export async function extractFile(absPath, relPath) {
  const parser = await loadParser();
  const src = readFileSync(absPath, 'utf8');
  const tree = parser.parse(src);
  const rel = relPath.replace(/\\/g, '/');
  const id = (name) => `${rel}:${name}`;

  const nodes = [];
  const methodsByClass = new Map(); // className -> Set(methodName)
  const nodeIds = new Set();

  const addNode = (name, kind, declNode, bodyNode, exported) => {
    const nid = id(name);
    if (nodeIds.has(nid)) return;
    nodeIds.add(nid);
    const node = {
      id: nid, label: name, kind, file: rel,
      line: declNode.startPosition.row + 1,
      loc: declNode.endPosition.row - declNode.startPosition.row + 1,
      exports: exported, domain: '', summary: '',
    };
    if (kind === 'function' || kind === 'method') node.complexity = cyclomaticExact(bodyNode);
    nodes.push(node);
  };

  // --- symbol discovery: classes + their methods, top-level functions ---
  walk(tree.rootNode, (n) => {
    if (n.type === 'class_declaration') {
      const cname = n.childForFieldName('name')?.text;
      if (!cname) return;
      addNode(cname, 'class', n, null, isExported(n));
      const body = n.childForFieldName('body');
      const methods = new Set();
      if (body) {
        for (let i = 0; i < body.childCount; i++) {
          const m = body.child(i);
          if (m.type !== 'method_definition') continue;
          const mname = m.childForFieldName('name')?.text;
          if (!mname) continue;
          methods.add(mname);
          addNode(mname, 'method', m, m.childForFieldName('body'), false);
        }
      }
      methodsByClass.set(cname, methods);
    } else if (n.type === 'function_declaration') {
      const fname = n.childForFieldName('name')?.text;
      if (fname) addNode(fname, 'function', n, n.childForFieldName('body'), isExported(n));
    }
  });

  // --- dispatch call edges: this.m() and typed-receiver x.m() ---
  const edgeKey = new Map(); // "from\tto\tkind" -> {from,to,kind,weight,via}
  const addEdge = (from, to, via) => {
    if (!nodeIds.has(to)) return; // only wire to a symbol we actually emitted (precision)
    const k = `${from}\t${to}\tcall`;
    const e = edgeKey.get(k);
    if (e) { e.weight++; return; }
    edgeKey.set(k, { from, to, kind: 'call', weight: 1, via });
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
    const from = id(owner.name);

    if (obj.type === 'this' && owner.classNode) {
      const cname = owner.classNode.childForFieldName('name')?.text;
      if (cname && methodsByClass.get(cname)?.has(prop)) addEdge(from, id(prop), 'this');
      return;
    }
    if (obj.type === 'identifier') {
      const typeName = paramTypes(owner.fnNode).get(obj.text);
      if (typeName && methodsByClass.get(typeName)?.has(prop)) addEdge(from, id(prop), `typed:${typeName}`);
    }
  });

  const edges = [...edgeKey.values()];
  return { nodes, edges };
}

// Deterministic serialization: sort nodes by id, edges by (from,to,kind), stable key order.
export function serialize(graph) {
  const nodes = [...graph.nodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const edges = [...graph.edges].sort((a, b) => {
    const ka = `${a.from}\t${a.to}\t${a.kind}`, kb = `${b.from}\t${b.to}\t${b.kind}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  return JSON.stringify({ nodes, edges }, null, 2);
}

// CLI: node extract-ts.mjs <file.ts> [--out graph.json]
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  const target = process.argv[2];
  if (!target) { console.error('usage: extract-ts.mjs <file.ts> [--out f.json]'); process.exit(1); }
  const abs = resolve(target);
  const rel = relative(HERE, abs).replace(/\\/g, '/');
  const graph = await extractFile(abs, rel);
  const out = serialize(graph);
  const outFlag = process.argv.indexOf('--out');
  if (outFlag !== -1 && process.argv[outFlag + 1]) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(process.argv[outFlag + 1], out);
    console.error(`[spike] wrote ${process.argv[outFlag + 1]}`);
  } else {
    console.log(out);
  }
}
