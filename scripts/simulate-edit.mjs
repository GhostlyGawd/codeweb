#!/usr/bin/env node
// codeweb simulate-edit — predict the regression gate's STRUCTURAL verdict for a hypothetical edit,
// WITHOUT performing it. Lets an agent discard doomed edits for ~zero cost before generating a line.
// Scoped to structuralRegressions (new file-cycles + symbols that lose all callers) — the same
// subset the post-edit hook enforces. Duplication delta needs the full body-confirmed pipeline and
// is intentionally OUT OF SCOPE (documented, not silently dropped). Read-only; never writes.
// Built on ./lib/graph-ops.mjs (shares applyEdit with optimize.mjs — one truth).
//
// Usage:
//   node simulate-edit.mjs <graph.json> --delete <symbol>
//   node simulate-edit.mjs <graph.json> --merge <s1,s2,...> [--into <id>]   (default canonical = smallest id)
//   node simulate-edit.mjs <graph.json> --move <symbol> --to <file>
//   (or set CODEWEB_WS instead of <graph.json>)   add --json for machine output.
// Exit: 0 ok (verdict lives in projected.ok), 1 symbol not found, 2 usage/IO.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeGraph, resolveSymbol, suggestSymbols, applyEdit, structuralRegressions } from './lib/graph-ops.mjs';

const USAGE = 'usage: simulate-edit.mjs <graph.json> (--delete <sym> | --merge <s1,s2,..> [--into <id>] | --move <sym> --to <file>) [--json]';
import { die, emitJson, finish, loadGraph, parseArgs } from './lib/cli.mjs';

// finding 24: THE flag loop (lib/cli.mjs parseArgs) — one unknown-flag policy, --help included.
const { opts, pos } = parseArgs(process.argv.slice(2), {
  usage: USAGE,
  flags: {
    json: { type: 'bool', default: false },
    delete: { type: 'string', default: null },
    merge: { type: 'string', default: null },
    into: { type: 'string', default: null },
    move: { type: 'string', default: null },
    to: { type: 'string', default: null },
  },
});
const { json, merge, into, move, to } = opts, del = opts.delete;
if ([del, merge, move].filter((x) => x != null).length !== 1) die(USAGE, 2);
if (move != null && to == null) die('move requires --to <file>', 2);

const { graph, abs } = loadGraph(pos[0], { usage: USAGE });

// FORMS F1: a miss must NEVER be an empty stdout — this is the tool the INSTRUCTIONS prescribe
// before every refactor, and an empty MCP reply read as "no objections" before a doomed edit.
// JSON mode emits the same found:false + suggestions contract query/explain use (exit 1);
// text mode keeps the classic stderr line.
const missPayload = (symArg) => {
  const suggestions = suggestSymbols(graph, symArg);
  const p = { symbol: symArg, found: false, hint: `no symbol matches "${symArg}" — try codeweb_find "<free text>" (concept search, no name needed)${suggestions.length ? ' or a near-match below' : ''}` };
  if (suggestions.length) p.suggestions = suggestions;
  return p;
};

let opName, after, target, intoOut = null, toOut = null, miss = null;
if (del != null) {
  const ids = resolveSymbol(graph, del);
  if (!ids.length) miss = missPayload(del);
  else { opName = 'delete'; target = ids; after = applyEdit(graph, { kind: 'delete', ids }); }
} else if (merge != null) {
  const syms = merge.split(',').map((s) => s.trim()).filter(Boolean);
  const ids = [...new Set(syms.flatMap((s) => resolveSymbol(graph, s)))].sort();
  if (ids.length === 0) miss = missPayload(merge);
  else if (ids.length < 2) die(`merge needs >=2 resolved symbols (got ${ids.length})`, 2);
  else {
    const canonical = into != null ? (resolveSymbol(graph, into)[0] || into) : ids[0]; // default: smallest id
    opName = 'merge'; target = ids; intoOut = canonical; after = applyEdit(graph, { kind: 'merge', ids, into: canonical });
  }
} else {
  const ids = resolveSymbol(graph, move);
  if (!ids.length) miss = missPayload(move);
  else {
    opName = 'move'; target = ids; toOut = to;
    after = ids.reduce((g, id) => applyEdit(g, { kind: 'move', id, to }), graph); // move every matched def
  }
}

if (miss) {
  if (json) { emitJson(miss, 1); }
  else { die(`symbol not found: ${miss.symbol}${miss.suggestions ? ` (near: ${miss.suggestions.join(', ')})` : ''}`, 1); }
} else {

const { newCycles, lostCallers } = structuralRegressions(graph, after);
const projected = { newCycles, lostCallers, ok: newCycles.length === 0 && lostCallers.length === 0 };
const payload = { op: opName, target, into: intoOut, to: toOut, projected };

if (json) { emitJson(payload); } else {

console.log(`simulate-edit: ${opName} ${target.join(', ')}${intoOut ? ` -> ${intoOut}` : ''}${toOut ? ` -> ${toOut}` : ''}`);
console.log(`projected gate: ${projected.ok ? 'PASS — the gate would accept this edit (exit 0)' : 'BLOCK — the gate would reject this edit (exit 1)'}`);
if (newCycles.length) console.log(`  new file cycle(s): ${newCycles.map((c) => c.join(' -> ')).join(' | ')}`);
if (lostCallers.length) console.log(`  symbol(s) left with no callers: ${lostCallers.join(', ')}`);
console.log('  (structural pre-flight: duplication delta is out of scope — run the full pipeline for that.)');
finish();
}
}
