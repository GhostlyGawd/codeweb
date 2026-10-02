#!/usr/bin/env node
// codeweb PreToolUse hook — one line of blast-radius awareness BEFORE an edit lands.
//
// The post-edit gate catches a regression after the fact; this is the missing other half: when the
// agent is about to edit a file in a `.codeweb`-mapped target, surface how load-bearing that file
// is (symbols + in-repo callers + the top symbol) so contract-changing edits get checked with
// codeweb_impact/codeweb_context FIRST. One line, advisory, never blocks.
//
// Advisory and non-blocking: unmapped/excluded targets and supported quiet
// symbols are no-ops. Unavailable mapped evidence gets bounded recovery context.

import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, relative } from 'node:path';
import { bump, recordPendingCard } from '../scripts/lib/stats.mjs';

// set by preview() when a card is embedded — the caller FILES the card warned about
// (docs/specs/card-correlation.md: a later edit touching one = advice followed)
let lastCardMeta = null;

import { SRC_RE, findTarget, sourceReader, sameFile } from '../scripts/lib/cli.mjs'; // Spec E: one truth
import { buildIndex, callersOf } from '../scripts/lib/graph-ops.mjs';
import { hookFileInScope, readHookGraph, hookIssue, formatHookIssue } from '../scripts/lib/hook-evidence.mjs';
import { loadStaleStamps } from '../scripts/lib/stale-stamps.mjs'; // RETENTION R3: per-file freshness for the card
import { loadStamped } from '../scripts/lib/sidecar-stamp.mjs'; // D3a: THE stamp rule, one reader

// Spec P (docs/specs/fastpath-decision.md): two data sources, ONE format path. The sidecar
// (index-lite.json, written at map time) serves in ~10ms; the graph path (13.5MB parse + explain
// subprocess, ~350ms at 16k symbols) is the fallback whenever the sidecar is missing, stale
// (mtime+size stamp vs a statSync — never a parse), or unreadable. Both produce the same fields,
// built by the same underlying card assembler, so output is byte-identical either way.

// Sidecar lookup: undefined = sidecar unusable (fall back); null = fresh sidecar says no-signal;
// object = the file's entry. Name + version 1 are owned by lib/index-lite.mjs (buildIndexLite);
// the literals stay here so the hook's boot path keeps importing only fs-light modules
// (index-lite.mjs pulls in graph-ops + explain-core).
function sidecarEntry(t, rel) {
  const lite = loadStamped(t.baseline, 'index-lite.json', 1);
  if (!lite) return undefined;
  if (lite.nodeCount === 0) return { issue: hookIssue(t, 'empty-map') };
  // Older sidecars cannot distinguish an empty map from a supported quiet file,
  // and do not carry true caller totals. They remain usable through graph fallback.
  if (lite.nodeCount == null) return undefined;
  return lite.files?.[rel] || null;
}

// Resolve a bounded edit window using already mapped symbol spans. This does not
// parse the language or infer semantic ownership. Duplicate/multi-symbol matches
// remain a qualified file summary rather than a guessed edited symbol.
function editedNode(nodes, edit, text) {
  if (typeof edit.symbol === 'string' && edit.symbol) {
    const exact = nodes.find((n) => n.id === edit.symbol);
    const matched = exact ? [exact] : nodes.filter((n) => n.label === edit.symbol);
    return matched.length === 1 ? { node: matched[0] } : { unresolved: true };
  }
  const changes = Array.isArray(edit.edits) ? edit.edits : [edit];
  const snippets = changes.map((e) => e?.old_string).filter((s) => typeof s === 'string' && s.length);
  if (!snippets.length) return { fileOnly: true };
  if (text == null) return { unresolved: true };
  const selected = new Set();
  for (const snippet of snippets) {
    const at = text.indexOf(snippet);
    if (at < 0 || text.indexOf(snippet, at + 1) >= 0) return { unresolved: true };
    const start = text.slice(0, at).split('\n').length;
    const end = text.slice(0, at + snippet.length - 1).split('\n').length;
    const spans = nodes.filter((n) => n.line > 0 && n.loc > 0 && n.line <= start && n.line + n.loc - 1 >= end)
      .sort((a, b) => a.loc - b.loc);
    if (!spans.length || (spans[1] && spans[1].loc === spans[0].loc)) return { unresolved: true };
    selected.add(spans[0]);
  }
  return selected.size === 1 ? { node: [...selected][0] } : { unresolved: true };
}

// Graph-path lookup: the historical computation, shaped like a sidecar entry so preview()
// formats once. #18b's motion, pre-edit edition: the explain.mjs subprocess re-parsed the
// multi-MB graph THIS function had just parsed — buildCards now runs in-process against the
// already-parsed graph (the same assembler the sidecar's cards came from, so parity holds by
// construction). explain-core stays a lazy import so the sidecar fast path never loads it.
async function graphEntry(t, rel, edit) {
  let graph; try { graph = readHookGraph(t); } catch { return { issue: hookIssue(t, 'invalid-map') }; }
  if (!graph.nodes.length) return { issue: hookIssue(t, 'empty-map') };
  // JSON tier: a json file's <module> node IS the file (no symbols exist) — include it, so config
  // edits get their importer count. Must mirror buildIndexLite's aggregation (byte-parity contract).
  const nodes = (graph.nodes || []).filter((n) => n.file === rel && (n.kind !== 'module' || rel.endsWith('.json')));
  if (!nodes.length) return null;
  if (nodes.every((n) => n.role === 'generated' || n.role === 'vendored')) return null;
  let text = null; try { text = readFileSync(resolve(t.root, rel), 'utf8'); } catch { /* unresolved */ }
  if (text == null) return { issue: hookIssue(t, 'source-unavailable') };
  let selection = editedNode(nodes, edit, text);
  if (selection.node && !edit.symbol && graph.meta?.analysis?.status === 'incomplete') selection = { unresolved: true };
  // Changed source can move recorded spans; an exact selector still identifies a
  // mapped symbol, but content containment against old line numbers cannot.
  const st = graph.meta?.sources?.[rel];
  if (selection.node && !edit.symbol && st) {
    try {
      const cur = statSync(resolve(t.root, rel));
      if (cur.size !== st.s || Math.round(cur.mtimeMs) !== st.m || graph.meta?.analysis?.status === 'incomplete') selection = { unresolved: true };
    } catch { selection = { unresolved: true }; }
  }
  const inCount = new Map();
  for (const e of graph.edges || []) {
    if (e.kind !== 'call' && e.kind !== 'import' && e.kind !== 'ref') continue;
    inCount.set(e.to, (inCount.get(e.to) || 0) + 1);
  }
  let total = 0, top = null;
  for (const n of nodes) {
    const c = inCount.get(n.id) || 0;
    total += c;
    if (!top || c > top.c) top = { label: n.label, c };
  }
  if (selection.node) {
    const c = inCount.get(selection.node.id) || 0;
    if (c === 0) return null; // known quiet target must not show an unrelated popular card
    top = { label: selection.node.label, c };
  } else if (total === 0) return null;
  const entry = { symbols: nodes.length, total, top, freshnessMeta: graph.meta,
    ...(selection.node ? { selectedId: selection.node.id } : {}),
    ...(selection.unresolved ? { unresolved: true } : {}) };
  if (rel.endsWith('.json')) {
    // JSON tier: no card (the card speaks caller-of-symbol; a json file's dependents are its
    // importers) — ship the importer list, the from-ids of the in-edge set counted above.
    // Mirrors buildIndexLite exactly (byte-parity contract).
    const mid = nodes[0].id;
    const importers = [];
    for (const e of graph.edges || []) {
      if (e.to !== mid || (e.kind !== 'call' && e.kind !== 'import' && e.kind !== 'ref')) continue;
      if (!importers.includes(e.from)) importers.push(e.from);
    }
    if (importers.length) entry.importers = importers.slice(0, 4);
    return entry;
  }
  if (top && top.c > 0) {
    try {
      const topNode = selection.node || nodes.slice().sort((a, b) => (inCount.get(b.id) || 0) - (inCount.get(a.id) || 0))[0];
      const { buildCards } = await import('../scripts/lib/explain-core.mjs');
      const index = buildIndex(graph);
      const card = buildCards(graph, index, sourceReader(graph.meta?.root), [topNode.id])[0];
      if (card) {
        if (selection.node) {
          const callers = callersOf(index, [topNode.id]);
          // Retain a same-file and external-file consumer when both exist, then
          // fill the remaining budget. Full expansion uses the existing tools.
          const local = callers.find((id) => index.byId.get(id)?.file === rel);
          const external = callers.find((id) => index.byId.get(id)?.file !== rel);
          card.topCallers = [...new Set([external, local, ...callers].filter(Boolean))].slice(0, 4);
        }
        entry.card = { summary: card.summary, topCallers: card.topCallers, tests: card.tests, callerCount: card.dependents.callers };
        entry.topId = topNode.id;
        const callerFiles = [...new Set((card.topCallers || [])
          .map((id) => id.slice(0, id.lastIndexOf(':')))
          .filter((f) => f && f !== rel))]; // the SUBJECT file never counts as "following the advice"
        if (callerFiles.length) entry.cardFiles = callerFiles;
      }
    } catch { /* card is a bonus, never a blocker */ }
  }
  return entry;
}

// Returns the one-line advisory for an edit payload, or null (not mapped / not source / no signal).
// Async since the in-process fallback (#18b motion): the sidecar path never awaits anything real.
export async function preview(raw) {
  lastCardMeta = null;
  let input; try { input = JSON.parse(raw); } catch { return null; }
  const fp = input?.tool_input?.file_path || input?.tool_input?.filePath;
  // JSON tier: .json edits pass the gate too — an imported config file has real blast radius.
  // (An unmapped/orphan json file yields no entry below, so the hook stays quiet for those.)
  if (!fp || !(SRC_RE.test(fp) || fp.endsWith('.json'))) return null;
  const t = findTarget(fp);
  if (!t) return null;
  if (!hookFileInScope(fp, t)) return null;
  const rel = relative(t.root, resolve(fp)).replace(/\\/g, '/');
  const edit = input.tool_input;
  const hasTarget = !!edit.symbol || typeof edit.old_string === 'string' || Array.isArray(edit.edits);
  const side = hasTarget ? undefined : sidecarEntry(t, rel);
  const entry = side === undefined ? await graphEntry(t, rel, edit) : side;
  if (!entry) return null;
  if (entry.issue) return formatHookIssue(entry.issue);
  const { symbols, total, top, card, topId, cardFiles } = entry;
  // RETENTION R3: when THIS file's stamp no longer matches the map, the card says so — quoting
  // week-old blast radii with full confidence is how dashboards die. Stat-only, fail-open.
  let behind = '';
  try {
    let meta = loadStaleStamps(t.baseline) || entry.freshnessMeta;
    if (!meta) { try { meta = readHookGraph(t).meta; } catch { /* unknown */ } }
    const st = meta?.sources?.[rel];
    if (st) {
      const cur = statSync(resolve(fp));
      if (cur.size !== st.s || Math.round(cur.mtimeMs) !== st.m) behind = ' — map behind for this file (numbers are from the last map; /codeweb re-maps in seconds)';
    } else behind = ' — freshness unknown for this file; refresh before relying on recorded locations';
  } catch { behind = ' — source unavailable; freshness unknown; restore source and refresh'; }
  // A json file's one node is its <module> — "1 symbol(s), most depended-on: <module>" would read
  // as noise, so the config-file line speaks in importers. Entry data is identical either way
  // (the sidecar/graph byte-parity contract lives in the entry, and both paths format HERE).
  let msg = rel.endsWith('.json')
    ? `[codeweb] editing ${rel}: config file, ${total} in-repo importer(s).` + behind +
      (entry.importers?.length ? `\n  importers: ${entry.importers.join(', ')}` : '')
    : `[codeweb] editing ${rel}: ${symbols} symbol(s), ${total} in-repo dependent edge(s)` +
      (top && top.c > 0 ? ` (most depended-on: ${top.label} ×${top.c})` : '') + '.' + behind;
  if (entry.selectedId) msg = `[codeweb] editing ${rel}: mapped edit target ${entry.selectedId} (${top.c} in-repo dependent edge(s)).` + behind;
  else if (!rel.endsWith('.json')) msg += `\n  scope: file summary${entry.unresolved ? ' — edit target unresolved/ambiguous; inspect source to select it' : ' — edited symbol unspecified'}.`;
  // AMBIENT context: the ~1KB explain card for the file's most-depended-on symbol, so the blast
  // radius arrives without the agent having to ask. Fail-open either path.
  if (card) {
    msg += `\n  ${card.summary}`;
    if (card.topCallers?.length) msg += `\n  top callers: ${card.topCallers.slice(0, 4).join(', ')}`;
    const omitted = (card.callerCount ?? card.topCallers?.length ?? 0) - Math.min(4, card.topCallers?.length || 0);
    if (omitted > 0) msg += ` (+${omitted} more; expand with codeweb_context/codeweb_impact)`;
    if (card.tests?.length) msg += `\n  tests: ${card.tests.slice(0, 2).join(', ')}`;
    if (cardFiles?.length) lastCardMeta = { baseline: t.baseline, symbol: topId, files: cardFiles };
  }
  msg += `\n  → codeweb_context for a bounded edit window; codeweb_impact for the full blast radius.`;
  return msg;
}

// Execute as a hook only when run directly (not when imported by tests).
if (process.argv[1] && sameFile(process.argv[1], fileURLToPath(import.meta.url))) {
  let raw = '';
  try { raw = readFileSync(0, 'utf8'); } catch { /* no stdin */ }
  let msg = null;
  try { msg = await preview(raw); } catch { /* fail-open */ }
  if (msg) {
    try {
      const fp = JSON.parse(raw)?.tool_input?.file_path || JSON.parse(raw)?.tool_input?.filePath;
      const t = fp && findTarget(fp);
      if (t) bump(t.baseline, 'cardsDelivered');
      if (lastCardMeta) recordPendingCard(lastCardMeta.baseline, lastCardMeta.symbol, lastCardMeta.files);
    } catch { /* receipt only */ }
    try {
      // API.md F10: this hook is ADVISORY — context only. permissionDecision:'allow' silently
      // auto-approved edits to mapped load-bearing files, overriding whatever permission flow the
      // user configured; no doc claimed that power. The card now ships alone and the host's own
      // permission decision stands.
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: msg },
      }) + '\n');
    } catch { /* ignore */ }
  }
  process.exit(0); // ALWAYS non-blocking
}
