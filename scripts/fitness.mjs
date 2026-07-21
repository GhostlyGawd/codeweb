#!/usr/bin/env node
// codeweb fitness (F6) — architecture-as-code. Check a graph against declared invariants and fail
// review on violation. Rule types: forbidden-dependency {from,to} (domain match), no-cycles,
// max-fan-in {limit}, max-symbol-loc {limit}, layer {order:[top..bottom]} (a domain may depend only
// on domains at/below it). Read-only, deterministic. Built on ./lib/graph-ops.mjs.
//
// Usage: node fitness.mjs <graph.json> [--rules codeweb.rules.json] [--json]
//   rules file: { "rules": [ { "id", "type", "severity"?, ...params } ] }   (severity default "error")
// Exit: 0 ok, 1 when >=1 error-severity violation, 2 usage/IO/unknown-rule.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { normalizeGraph, buildIndex, fileCycles } from './lib/graph-ops.mjs';

const USAGE = 'usage: fitness.mjs <graph.json> [--rules codeweb.rules.json] [--json]';
if (process.argv.includes('--help') || process.argv.includes('-h')) { console.log(USAGE); process.exit(0); } // #5: every CLI answers --help
import { die, emitJson, finish } from './lib/cli.mjs';

const argv = process.argv.slice(2);
let json = false, rulesArg = null; const pos = [];
for (let i = 0; i < argv.length; i++) { const t = argv[i]; if (t === '--json') json = true; else if (t === '--rules') rulesArg = argv[++i]; else if (!t.startsWith('-')) pos.push(t); }
const graphPath = pos[0] || (process.env.CODEWEB_WS ? `${process.env.CODEWEB_WS}/graph.json` : null);
if (!graphPath) die(USAGE, 2);

const gAbs = resolve(graphPath);
if (!existsSync(gAbs)) die(`graph not found: ${gAbs}`, 2);
let graph;
try { graph = normalizeGraph(JSON.parse(readFileSync(gAbs, 'utf8'))); }
catch (e) { die(`invalid JSON in ${gAbs}: ${e.message}`, 2); }

// locate rules: --rules, else codeweb.rules.json beside the graph, else in cwd
const rulesPath = rulesArg ? resolve(rulesArg)
  : [join(dirname(gAbs), 'codeweb.rules.json'), resolve('codeweb.rules.json')].find(existsSync);
if (!rulesPath || !existsSync(rulesPath)) die('no rules file (pass --rules <codeweb.rules.json>)', 2);
let rules;
try { rules = JSON.parse(readFileSync(rulesPath, 'utf8')).rules; }
catch (e) { die(`invalid rules JSON in ${rulesPath}: ${e.message}`, 2); }
if (!Array.isArray(rules)) die('rules file must be { "rules": [ ... ] }', 2);

const index = buildIndex(graph);
const domOf = (id) => index.byId.get(id)?.domain || 'unassigned';
const violations = [];
const add = (rule, message, subjects) => { if (subjects.length) violations.push({ ruleId: rule.id, severity: rule.severity || 'error', type: rule.type, message, subjects }); };

for (const rule of rules) {
  switch (rule.type) {
    case 'forbidden-dependency': {
      const subj = graph.edges.filter((e) => domOf(e.from) === rule.from && domOf(e.to) === rule.to).map((e) => `${e.from} -> ${e.to}`).sort();
      add(rule, `${subj.length} forbidden edge(s) from '${rule.from}' to '${rule.to}'`, subj);
      break;
    }
    case 'layer': {
      const rank = new Map((rule.order || []).map((d, i) => [d, i])); // index 0 = top layer
      const subj = graph.edges.filter((e) => { const rf = rank.get(domOf(e.from)), rt = rank.get(domOf(e.to)); return rf != null && rt != null && rt < rf; }).map((e) => `${e.from} -> ${e.to}`).sort();
      add(rule, `${subj.length} edge(s) depend on a higher layer (order: ${(rule.order || []).join(' > ')})`, subj);
      break;
    }
    case 'no-cycles': {
      const subj = fileCycles(graph).map((c) => c.join(' <-> '));
      add(rule, `${subj.length} file dependency cycle(s)`, subj);
      break;
    }
    case 'max-fan-in': {
      const subj = graph.nodes.filter((n) => (index.callIn.get(n.id)?.size || 0) > rule.limit).map((n) => `${n.id} (${index.callIn.get(n.id).size} callers)`).sort();
      add(rule, `${subj.length} symbol(s) exceed fan-in limit ${rule.limit}`, subj);
      break;
    }
    case 'max-symbol-loc': {
      const subj = graph.nodes.filter((n) => (n.loc || 0) > rule.limit).map((n) => `${n.id} (${n.loc} loc)`).sort();
      add(rule, `${subj.length} symbol(s) exceed loc limit ${rule.limit}`, subj);
      break;
    }
    default: die(`unknown rule type: ${rule.type} (rule id '${rule.id}')`, 2);
  }
}

const errors = violations.filter((v) => v.severity === 'error');
const payload = { target: graph.meta?.target || 'target', rulesChecked: rules.length, violations, ok: errors.length === 0, errorCount: errors.length, warningCount: violations.length - errors.length };
const code = errors.length ? 1 : 0;

if (json) { emitJson(payload, code); } else {

console.log(`codeweb fitness: ${payload.target} — ${rules.length} rule(s), ${violations.length} violation(s) (${payload.errorCount} error, ${payload.warningCount} warning)`);
for (const v of violations) {
  console.log(`\n[${v.severity.toUpperCase()}] ${v.ruleId} — ${v.message}`);
  for (const s of v.subjects.slice(0, 12)) console.log(`    ${s}`);
  if (v.subjects.length > 12) console.log(`    …+${v.subjects.length - 12} more`);
}
if (payload.ok) console.log('\nok — no error-level violations');
finish(code);
}
