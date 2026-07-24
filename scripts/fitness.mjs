#!/usr/bin/env node
// codeweb fitness (F6) — architecture-as-code. Check a graph against declared invariants and fail
// review on violation. Rule types: forbidden-dependency {from,to} (domain match), no-cycles,
// max-fan-in {limit}, max-symbol-loc {limit}, layer {order:[top..bottom]} (a domain may depend only
// on domains at/below it). Read-only, deterministic. Built on ./lib/graph-ops.mjs.
//
// Usage: node fitness.mjs [graph.json] [--rules codeweb.rules.json] [--json]   (or set CODEWEB_WS, or run from a mapped repo)
//   rules file: { "rules": [ { "id", "type", "severity"?, ...params } ] }   (severity default "error")
// Exit: 0 ok, 1 when >=1 error-severity violation, 2 usage/IO/unknown-rule.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { buildIndex, fileCycles } from './lib/graph-ops.mjs';

const USAGE = 'usage: fitness.mjs [graph.json] [--rules codeweb.rules.json] [--json]   (or set CODEWEB_WS, or run from a mapped repo)';
import { die, emitJson, finish, loadGraph, parseArgs } from './lib/cli.mjs';

// finding 24: THE flag loop (lib/cli.mjs parseArgs) — one unknown-flag policy, --help included.
const { opts, pos } = parseArgs(process.argv.slice(2), {
  usage: USAGE,
  flags: { json: { type: 'bool', default: false }, rules: { type: 'string', default: null } },
});
const { json } = opts, rulesArg = opts.rules;

// API F7: fitness honored CODEWEB_WS but not the walk-up, with hand-rolled load errors. THE one
// loader now (arg -> env -> nearest .codeweb above cwd, shared not-found/corrupt messages).
const { graph, abs: gAbs } = loadGraph(pos[0], { usage: USAGE });

// locate rules: --rules, else codeweb.rules.json beside the graph, else in cwd
const rulesPath = rulesArg ? resolve(rulesArg)
  : [join(dirname(gAbs), 'codeweb.rules.json'), resolve('codeweb.rules.json')].find(existsSync);
if (!rulesPath || !existsSync(rulesPath)) die('no rules file (pass --rules <codeweb.rules.json>)', 2);
let rulesDoc;
try { rulesDoc = JSON.parse(readFileSync(rulesPath, 'utf8')); }
catch (e) { die(`invalid rules JSON in ${rulesPath}: ${e.message}`, 2); }
let rules = rulesDoc.rules;
// FORMS F5: codeweb.rules.json legitimately carries `roles` (extractor config, Spec E) without
// `rules` — codeweb's own root file is exactly that. Rejecting the user's VALID product config
// as malformed was the worst message on the gate persona's favorite form.
let rulesNote = null;
if (rules === undefined && rulesDoc.roles !== undefined) {
  rules = [];
  rulesNote = `0 rules configured — ${rulesPath} has \`roles\` (extractor config); add a "rules": [] section for fitness`;
}
if (!Array.isArray(rules)) die(`rules file must be { "rules": [ ... ] } — found top-level key(s): ${Object.keys(rulesDoc).join(', ') || 'none'} in ${rulesPath}`, 2);

// FORMS F4: a gate whose failure mode is PASSING is worse than no gate. Every rule's params are
// validated at load — missing numeric `limit` used to compare against undefined (always ok),
// a typo'd severity silently demoted to warning, a missing id rendered "ruleId: undefined".
// Unknown TYPE already died loudly; the same rigor now applies one level down.
const SEVERITIES = new Set(['error', 'warning']);
rules.forEach((rule, i) => {
  const where = `rule ${i}${typeof rule.id === 'string' && rule.id ? ` ('${rule.id}')` : ''}`;
  const bad = (msg) => die(`invalid rule: ${where} ${msg} in ${rulesPath}`, 2);
  if (typeof rule.id !== 'string' || !rule.id) bad('needs a string `id`');
  if (rule.severity !== undefined && !SEVERITIES.has(rule.severity)) bad(`has unknown severity "${rule.severity}" (valid: error | warning)`);
  switch (rule.type) {
    case 'max-fan-in': case 'max-symbol-loc':
      if (typeof rule.limit !== 'number' || !Number.isFinite(rule.limit)) bad('needs a numeric `limit`'); break;
    case 'forbidden-dependency':
      if (typeof rule.from !== 'string' || typeof rule.to !== 'string') bad('needs string `from` and `to` domains'); break;
    case 'layer':
      if (!Array.isArray(rule.order) || rule.order.length < 2) bad('needs `order` (an array of >=2 domain names, top first)'); break;
    case 'no-cycles': break;
    default: bad(`has unknown type "${rule.type}" (valid: forbidden-dependency | layer | no-cycles | max-fan-in | max-symbol-loc)`);
  }
});

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
const payload = { target: graph.meta?.target || 'target', rulesChecked: rules.length, violations, ok: errors.length === 0, errorCount: errors.length, warningCount: violations.length - errors.length, ...(rulesNote ? { note: rulesNote } : {}) };
const code = errors.length ? 1 : 0;

if (json) { emitJson(payload, code); } else {

console.log(`codeweb fitness: ${payload.target} — ${rules.length} rule(s), ${violations.length} violation(s) (${payload.errorCount} error, ${payload.warningCount} warning)`);
if (rulesNote) console.log(`  note: ${rulesNote}`);
for (const v of violations) {
  console.log(`\n[${v.severity.toUpperCase()}] ${v.ruleId} — ${v.message}`);
  for (const s of v.subjects.slice(0, 12)) console.log(`    ${s}`);
  if (v.subjects.length > 12) console.log(`    …+${v.subjects.length - 12} more`);
}
if (payload.ok) console.log('\nok — no error-level violations');
finish(code);
}
