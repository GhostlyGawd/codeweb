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
import { dirname } from 'node:path';
import { normalizeGraph, buildIndex, orphans, isTestFile, productScope, scopeNote } from './lib/graph-ops.mjs';
import { fingerprint, loadAnnotations } from './lib/annotations.mjs'; // F7: false-positive suppression memory

// Entrypoint-like names that may be invoked by a framework / CLI / test runner rather than via a
// code edge — so an uncalled one is "review", not "safe to delete". (Mirrored by the test oracle.)
const ENTRYPOINTS = new Set(['main', 'default', 'index', 'setup', 'teardown', 'init']);
// A/B lever (mirrors CODEWEB_LEGACY_FALLBACK / CODEWEB_HUB_INDEG): restore the pre-fix behavior where
// a function DEFINED IN a test file falls through to `safe`. Defaults OFF (shipped: test-file -> review).
// The effectiveness study flips this on to prove the H13 fix is load-bearing (safe-tier precision drops).
const DEADCODE_LEGACY = process.env.CODEWEB_DEADCODE_LEGACY === '1';
// FORMS F10: the usage names EVERY real flag — the parser rejects unknown flags loudly, so a
// flag missing from --help was undiscoverable except by reading source.
const USAGE = 'usage: deadcode.mjs <graph.json> [--limit N] [--all] [--show-suppressed] [--annotations <dir>] [--json]   (or set CODEWEB_WS)';
import { die, emitJson, finish, capList, loadGraph, manifestEntryFiles, parseArgs, sourceReader, checkStaleness } from './lib/cli.mjs';
import { incompleteAnalysis } from './lib/analysis-completeness.mjs';

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
const CAVEAT = 'mapped orphan candidates only; extraction can miss ambiguous or dynamic calls. No tier establishes safe deletion — inspect source, runtime entrypoints and relevant tests before deleting';

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
  else safe.push({ id: o.id, file: o.file, domain: o.domain, loc, reason: 'no mapped production caller, not exported, no mapped test edge, not in a test file — candidate for source review' });
}

// Preserve the historical tier keys/membership, but carry uncertainty IN the
// answer: MCP consumers do not receive loadGraph's stderr diagnostic.
const reader = sourceReader(graph.meta?.root);
const missingFiles = [...new Set(graph.nodes.map((n) => n.file).filter((file) => !file || !reader.linesOf(file)))].sort();
for (const o of [...safe, ...review]) o.sourceEvidence = reader.linesOf(o.file) ? 'available' : 'unavailable';
const completeness = incompleteAnalysis(graph);
const stale = checkStaleness(graph);
const stamped = reader.available && Object.keys(graph.meta?.sources || {}).length > 0;
const analysis = {
  scope: 'mapped-orphans',
  status: completeness || !reader.available || missingFiles.length ? 'incomplete' : !graph.nodes.length ? 'empty' : 'bounded',
  engine: graph.meta?.engine || 'unknown',
  sourceAvailable: reader.available && missingFiles.length === 0,
  missingSourceCount: missingFiles.length,
  missingSourceFiles: missingFiles.slice(0, 8),
  freshness: stale ? 'stale' : stamped ? 'unchanged-stamps' : 'unknown',
  ...(completeness ? { completeness } : {}),
  ...(stale ? { stale } : {}),
  legacyTierMeaning: '`safe` and totals.safe count structural candidates without the listed review flags; they are not deletion guarantees.',
  nextSteps: [
    ...(!reader.available || missingFiles.length ? ['Restore the mapped source files before assessing deletion candidates.'] : []),
    ...(completeness ? completeness.nextSteps : []),
    ...(stale || !stamped ? ['Refresh the map with codeweb_refresh; preserve the original pre-edit baseline.'] : []),
    'Inspect dynamic callers, runtime entrypoints and relevant tests before deleting any candidate.',
  ],
};

// F7: every finding carries a stable fingerprint (kind 'orphan' + its id). A '.codeweb/annotations.json'
// false-positive suppression hides a safe finding by default (so a confirmed not-dead symbol stops
// resurfacing) and is COUNTED; --show-suppressed reveals them. Suppression keys on identity, so if the
// symbol id changes the fingerprint changes and it is NOT silently hidden.
for (const o of safe) o.fingerprint = fingerprint({ kind: 'orphan', nodes: [o.id] });
for (const o of review) o.fingerprint = fingerprint({ kind: 'orphan', nodes: [o.id] });
// D8 follow-through: annotations live BESIDE the graph — exactly where annotate.mjs writes them
// (annDir = the workspace dir). The old default joined another '.codeweb' onto the workspace
// (<ws>/.codeweb/annotations.json), a path no writer ever used, so default-path suppressions
// were never applied; tests/annotations.test.mjs now pins the write->read roundtrip.
const dir = annDir || dirname(abs);
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
  summary: `${visibleSafe.length + review.length} mapped orphan candidate(s): ${visibleSafe.length} without listed review flags, ${review.length} need review${suppressed.length ? `, ${suppressed.length} suppressed` : ''} — deletion safety not established${analysis.status === 'incomplete' ? '; evidence incomplete' : ''}`,
  totals: { orphans: visibleSafe.length + review.length, safe: visibleSafe.length, review: review.length, suppressed: suppressed.length },
  excluded: deadScope.excluded, excludedByRole: deadScope.excludedByRole, // #6: counted, never silent
  note: CAVEAT,
  analysis,
  safe: capSafe.items, review: capReview.items, suppressed,
};
// Match the existing MCP advisor annotation instead of leaving CLI consumers
// with freshness only in nested provenance.
if (stale) { payload.stale = stale; payload.summary += ` — graph is stale for ${stale.count}+ file(s); run codeweb_refresh`; }
// API F3 (§4 convention: nextOffset rides wherever `remaining` is emitted). A single --offset
// paging BOTH tiers in lockstep would over-skip the shorter tier — genuinely ambiguous — so the
// tiers carry nextOffset only (the page boundary), without an offset param.
if (capSafe.truncated) payload.moreSafe = { remaining: capSafe.remaining, nextOffset: capSafe.offset + capSafe.items.length };
if (capReview.truncated) payload.moreReview = { remaining: capReview.remaining, nextOffset: capReview.offset + capReview.items.length };

if (json) { emitJson(payload); } else {

const t = payload.totals;
console.log(`codeweb deadcode: ${payload.target} — ${t.orphans} mapped orphan candidate(s): ${t.safe} without listed review flags, ${t.review} review${t.suppressed ? `, ${t.suppressed} suppressed` : ''}`);
console.log(`  analysis: ${analysis.status}; freshness: ${analysis.freshness}; source ${analysis.sourceAvailable ? 'available' : 'unavailable/incomplete'} — deletion safety not established`);
if (analysis.status === 'incomplete') console.log(`  → ${analysis.nextSteps[0]}`);
if (deadScope.excluded) console.log(`  scope: product — ${scopeNote(deadScope)}`); // #6: counted, never silent
// MICROCOPY A4: the heading is the label people act on — the hedge rides IN it, before the
// list, not in a note after both lists. "safe to delete" asserted safety the caveat then undid.
console.log(`\ndelete candidates (no caller, not exported, no test — extraction can miss dynamic calls; cross-check before deleting):`);
for (const o of payload.safe) console.log(`  ${o.id}  [${o.domain}]  (${o.loc} loc)`);
if (payload.moreSafe) console.log(`  … +${payload.moreSafe.remaining} more`);
if (!safe.length) console.log('  (none)');
console.log(`\nreview first (tests reference it, or entrypoint-like):`);
for (const o of payload.review) console.log(`  ${o.id}  — ${o.reason}`);
if (payload.moreReview) console.log(`  … +${payload.moreReview.remaining} more`);
if (!review.length) console.log('  (none)');
// MICROCOPY A5: the false-positive door, visible where the false positive is staring at you.
console.log(`\nfalse positive? suppress it: node scripts/annotate.mjs --suppress <fingerprint> --note "why"  (fingerprints: --json)`);
finish();
}
