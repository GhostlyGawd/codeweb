#!/usr/bin/env node
// codeweb explain — ONE bounded card answering "tell me about X before I touch it": identity,
// role, contract (signature/complexity), who depends on it (fan-in/out, tests, blast radius),
// the top callers/callees by fan-in, and any duplication/pattern findings it belongs to.
// The question agents ask most, previously 3-4 separate calls. Read-only, deterministic, small
// by construction (~1KB) — counts + top-5s, never exhaustive lists (those stay one tool away).
//
// Usage: node explain.mjs <graph.json> <symbol> [--json]   (or set CODEWEB_WS and pass <symbol>)
// Exit: 0 ok, 1 symbol not found, 2 usage/IO.

import { buildIndex, resolveSymbol, callersOf, calleesOf, testersOf, impactOf } from './lib/graph-ops.mjs';

const USAGE = 'usage: explain.mjs <graph.json> <symbol> [--json]   (or set CODEWEB_WS)';
import { die, emitJson, finish, loadGraph, checkStaleness } from './lib/cli.mjs';

const argv = process.argv.slice(2);
let json = false; const pos = [];
for (const t of argv) { if (t === '--json') json = true; else if (!t.startsWith('-')) pos.push(t); }
let graphArg = null, symbol = null;
if (pos.length >= 2) { graphArg = pos[0]; symbol = pos[1]; }
else if (pos.length === 1) { symbol = pos[0]; }
if (!symbol) die(USAGE, 2);
const { graph } = loadGraph(graphArg, { usage: USAGE });

const ids = resolveSymbol(graph, symbol);
if (!ids.length) { if (json) emitJson({ symbol, found: false }, 1); else die(`symbol not found: ${symbol}`, 1); }
else {
  const index = buildIndex(graph);
  const fanIn = (id) => index.callIn.get(id)?.size || 0;
  const topBy = (list, n) => list.slice().sort((a, b) => fanIn(b) - fanIn(a) || (a < b ? -1 : 1)).slice(0, n);

  const cards = ids.map((id) => {
    const n = index.byId.get(id);
    const callers = callersOf(index, [id]);
    const callees = calleesOf(index, [id]);
    const tests = testersOf(index, [id]);
    const blast = impactOf(index, [id]);
    const blastDomains = [...new Set(blast.map((x) => index.byId.get(x)?.domain || 'unassigned'))];
    const findings = (graph.overlaps || []).filter((o) => (o.nodes || []).includes(id))
      .map((o) => ({ id: o.id, kind: o.kind, title: o.title, confidence: o.confidence }));
    return {
      id, label: n.label, kind: n.kind, role: n.role || 'product', domain: n.domain,
      at: `${n.file}:${n.line}`, loc: n.loc, exports: n.exports,
      signature: n.signature ?? null,
      ...(n.complexity != null ? { complexity: n.complexity, maxDepth: n.maxDepth } : {}),
      dependents: { callers: callers.length, tests: tests.length, blastRadius: blast.length, blastDomains: blastDomains.length },
      topCallers: topBy(callers, 5),
      topCallees: topBy(callees, 5),
      tests: tests.slice(0, 3),
      findings,
      summary: `${n.kind} ${n.label} (${n.role || 'product'}, ${n.domain}) — ${callers.length} caller(s), ${tests.length} test(s), blast ${blast.length} across ${blastDomains.length} domain(s)${findings.length ? `; in ${findings.length} finding(s)` : ''}`,
    };
  });
  const payload = { symbol, matched: ids, cards, summary: cards.map((c) => c.summary).join(' | ') };
  const stale = checkStaleness(graph);
  if (stale) { payload.stale = stale; payload.summary += ` — graph is stale for ${stale.count}+ file(s); run codeweb_refresh`; }

  if (json) emitJson(payload);
  else {
    for (const c of cards) {
      console.log(`# ${c.id}`);
      console.log(`  ${c.summary}`);
      console.log(`  at ${c.at} · ${c.loc} loc${c.exports ? ' · exported' : ''}${c.signature ? ` · (${(c.signature.params || []).join(', ')})${c.signature.returns ? ' -> ' + c.signature.returns : ''}` : ''}${c.complexity != null ? ` · cx ${c.complexity}` : ''}`);
      if (c.topCallers.length) console.log(`  top callers: ${c.topCallers.join(', ')}`);
      if (c.topCallees.length) console.log(`  calls: ${c.topCallees.join(', ')}`);
      if (c.tests.length) console.log(`  tests: ${c.tests.join(', ')}`);
      for (const f of c.findings) console.log(`  finding: [${f.kind}/${f.confidence}] ${f.title}`);
    }
    if (payload.stale) console.log(`  ⚠ graph stale for ${payload.stale.count}+ file(s) — run codeweb_refresh`);
    finish();
  }
}
