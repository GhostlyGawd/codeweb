#!/usr/bin/env node
// codeweb deadcode (F10) — turn the orphans candidate list into a confidence-tiered action plan.
// Partitions orphans (no production caller, not exported) into `safe` (no test edge, not defined in
// a test file, not an entrypoint-like name — high-confidence dead) and `review` (referenced by a
// test, defined in a test file (helper/mock/case registration), or an entrypoint-like name a
// framework/CLI may invoke without a code edge). Honestly surfaces the
// orphans caveat (extraction drops ambiguous call edges, so cross-check). Read-only, advisory,
// deterministic. Built on ./lib/graph-ops.mjs (uses the SAME orphans + testIn as query.mjs — one truth).
//
// Usage: node deadcode.mjs <graph.json> [--json]   (or set CODEWEB_WS)
// Exit: 0 (advisory), 2 usage/IO.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { normalizeGraph, buildIndex, orphans, isTestFile, productScope, scopeNote } from './lib/graph-ops.mjs';
import { fingerprint, loadAnnotations } from './lib/annotations.mjs'; // F7: false-positive suppression memory

// Entrypoint-like names that may be invoked by a framework / CLI / test runner rather than via a
// code edge — so an uncalled one is "review", not "safe to delete". (Mirrored by the test oracle.)
const ENTRYPOINTS = new Set(['main', 'default', 'index', 'setup', 'teardown', 'init']);
// A/B lever (mirrors CODEWEB_LEGACY_FALLBACK / CODEWEB_HUB_INDEG): restore the pre-fix behavior where
// a function DEFINED IN a test file falls through to `safe`. Defaults OFF (shipped: test-file -> review).
// The effectiveness study flips this on to prove the H13 fix is load-bearing (safe-tier precision drops).
const DEADCODE_LEGACY = process.env.CODEWEB_DEADCODE_LEGACY === '1';
const USAGE = 'usage: deadcode.mjs <graph.json> [--all] [--json]   (or set CODEWEB_WS)';
import { die, emitJson, finish, capList, loadGraph, manifestEntryFiles, parseArgs } from './lib/cli.mjs';

// finding 24: THE flag loop (lib/cli.mjs parseArgs) — one unknown-flag policy, --help included.
const { opts, pos } = parseArgs(process.argv.slice(2), {
  usage: USAGE,
  flags: {
    json: { type: 'bool', default: false },
    'show-suppressed': { type: 'bool', default: false },
    annotations: { type: 'string', default: null },
    limit: { type: 'number', default: null },
    all: { type: 'bool', default: false }, // #6: include non-product roles
  },
});
const { json, limit, all } = opts, showSuppressed = opts['show-suppressed'], annDir = opts.annotations;
const { graph, abs } = loadGraph(pos[0], { usage: USAGE });

const index = buildIndex(graph);
const CAVEAT = 'extraction drops ambiguous call edges (precision over recall), so a genuinely-called symbol can surface here — cross-check before deleting';

// #6a: product scope by default — bench/fixture/generated orphans are their own cleanup problem,
// not a delete list to hand an agent. Counted, --all restores the everything view.
const allOrphans = orphans(graph, index);
const deadScope = productScope(allOrphans.map((o) => ({ ...o, ...index.byId.get(o.id) })), all);

// #6b: manifest-declared entrypoint files — a host (npm bin/main/exports, Claude hooks, plugin
// mcpServers) invokes these without a code edge; nothing in them is ever "safe to delete".
const manifestEntries = manifestEntryFiles(graph.meta?.root, [...new Set(graph.nodes.map((n) => n.file).filter(Boolean))]);

// #6c: closure-scoped orphans — a function DEFINED INSIDE a reachable parent's span is reachable
// via the closure even with zero direct edges (cli.mjs's sourceReader().bodyOf was listed "safe").
const nodesByFile = new Map();
for (const n of graph.nodes) { if (!nodesByFile.has(n.file)) nodesByFile.set(n.file, []); nodesByFile.get(n.file).push(n); }
function closureParent(node) {
  if (!node?.line) return null;
  for (const p of nodesByFile.get(node.file) || []) {
    if (p.id === node.id || !p.loc || !p.line || p.line >= node.line) continue;
    if (node.line + (node.loc || 1) - 1 <= p.line + p.loc - 1) {
      if (p.exports || index.hasIncoming?.has?.(p.id) || (index.callIn.get(p.id)?.size || 0) > 0) return p;
    }
  }
  return null;
}

const safe = [], review = [];
for (const o of deadScope.kept) {                  // orphans = no call|import|inherit incoming, not exported
  const node = index.byId.get(o.id);
  const label = node?.label || o.id;
  const testers = index.testIn.get(o.id)?.size || 0;
  const file = node?.file || o.file;
  const loc = node?.loc || 0; // deleting this orphan reclaims its span — campaign's delete-ROI signal
  const manifest = manifestEntries.get(file);
  const parent = closureParent(node);
  if (testers > 0) review.push({ id: o.id, file: o.file, domain: o.domain, loc, reason: `referenced only by ${testers} test(s) — the test may be its only user; remove the test too, or it is genuinely used` });
  else if (!DEADCODE_LEGACY && isTestFile(file)) review.push({ id: o.id, file: o.file, domain: o.domain, loc, reason: `defined in a test file '${file}' — a test runner may invoke it (helper, mock, or case registration) without a code edge, so deleting it can break tests` });
  else if (manifest) review.push({ id: o.id, file: o.file, domain: o.domain, loc, reason: `'${file}' is a declared entrypoint of ${manifest} — the host invokes it without a code edge (activate/bin/hook), so it is never safe-tier` });
  else if (parent) review.push({ id: o.id, file: o.file, domain: o.domain, loc, reason: `defined inside ${parent.label || parent.id}'s span — reachable through the closure even with no direct edge` });
  else if (ENTRYPOINTS.has(label)) review.push({ id: o.id, file: o.file, domain: o.domain, loc, reason: `entrypoint-like name '${label}' — may be invoked by a framework/CLI/test runner, not via a code edge` });
  else safe.push({ id: o.id, file: o.file, domain: o.domain, loc, reason: 'no production caller, not exported, no test edge, not in a test file — high-confidence dead' }); // the shared caveat lives once in payload.note
}

// F7: every finding carries a stable fingerprint (kind 'orphan' + its id). A '.codeweb/annotations.json'
// false-positive suppression hides a safe finding by default (so a confirmed not-dead symbol stops
// resurfacing) and is COUNTED; --show-suppressed reveals them. Suppression keys on identity, so if the
// symbol id changes the fingerprint changes and it is NOT silently hidden.
for (const o of safe) o.fingerprint = fingerprint({ kind: 'orphan', nodes: [o.id] });
for (const o of review) o.fingerprint = fingerprint({ kind: 'orphan', nodes: [o.id] });
const dir = annDir || join(dirname(abs), '.codeweb');
const killed = new Set(loadAnnotations(dir).suppressions.filter((s) => s.verdict === 'false-positive').map((s) => s.fingerprint));
const suppressed = safe.filter((o) => killed.has(o.fingerprint));
const visibleSafe = showSuppressed ? safe : safe.filter((o) => !killed.has(o.fingerprint));

// Budget: totals stay TRUE; the lists cap at --limit each, biggest spans first (the deletes worth
// doing first), with an explicit remainder — never a silent cut.
const byLocDesc = (a, b) => (b.loc || 0) - (a.loc || 0) || (a.id < b.id ? -1 : 1);
const capSafe = capList(limit != null ? visibleSafe.slice().sort(byLocDesc) : visibleSafe, limit);
const capReview = capList(limit != null ? review.slice().sort(byLocDesc) : review, limit);
const payload = {
  target: graph.meta?.target || 'target',
  summary: `${visibleSafe.length + review.length} orphan(s): ${visibleSafe.length} safe to delete, ${review.length} need review${suppressed.length ? `, ${suppressed.length} suppressed` : ''}`,
  totals: { orphans: visibleSafe.length + review.length, safe: visibleSafe.length, review: review.length, suppressed: suppressed.length },
  excluded: deadScope.excluded, excludedByRole: deadScope.excludedByRole, // #6: counted, never silent
  note: CAVEAT,
  safe: capSafe.items, review: capReview.items, suppressed,
};
if (capSafe.truncated) payload.moreSafe = { remaining: capSafe.remaining };
if (capReview.truncated) payload.moreReview = { remaining: capReview.remaining };

if (json) { emitJson(payload); } else {

const t = payload.totals;
console.log(`codeweb deadcode: ${payload.target} — ${t.orphans} orphan(s): ${t.safe} safe, ${t.review} review${t.suppressed ? `, ${t.suppressed} suppressed` : ''}`);
if (deadScope.excluded) console.log(`  scope: product — ${scopeNote(deadScope)}`); // #6: counted, never silent
console.log(`\nsafe to delete (no caller, not exported, no test):`);
for (const o of payload.safe) console.log(`  ${o.id}  [${o.domain}]  (${o.loc} loc)`);
if (payload.moreSafe) console.log(`  … +${payload.moreSafe.remaining} more`);
if (!safe.length) console.log('  (none)');
console.log(`\nreview first (tests reference it, or entrypoint-like):`);
for (const o of payload.review) console.log(`  ${o.id}  — ${o.reason}`);
if (payload.moreReview) console.log(`  … +${payload.moreReview.remaining} more`);
if (!review.length) console.log('  (none)');
console.log(`\nnote: ${CAVEAT}.`);
finish();
}
