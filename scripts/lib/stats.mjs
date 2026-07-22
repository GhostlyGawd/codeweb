// stats — the local outcome ledger: what codeweb actually DID during real work, counted where
// it happened. This is the value receipt ("3 regressions blocked before landing, 14 pre-edit
// cards, 87 queries served") — evidence from real use with a real denominator, not a lab.
//
// STRICTLY LOCAL: written beside the graph (<workspace>/stats.json), never transmitted,
// nothing identifying — counter names and integers only. CODEWEB_NO_STATS=1 disables all
// writes. Every operation is fail-open (a ledger must never break the tool it measures);
// concurrent writers are last-write-wins (counters may undercount under races — acceptable
// for a receipt, documented here).

import { readFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { atomicWrite } from './cli.mjs'; // finding #42: crash-safe writes for the local receipts (bytes unchanged)

const statsPathOf = (graphPath) => join(dirname(graphPath), 'stats.json');
const monthNow = () => new Date().toISOString().slice(0, 7);

/** Read the ledger beside a graph.json, or null. Never throws. */
export function readStats(graphPath) {
  try { return JSON.parse(readFileSync(statsPathOf(graphPath), 'utf8')); } catch { return null; }
}

/** The JSON receipt payload: the ledger, or the empty-note shape. THE one place the empty note lives
 *  (finding #33: stats.mjs --json and the MCP codeweb_stats fast path both serve this, byte-identical). */
export function receiptPayload(graphPath) {
  return readStats(graphPath) || { empty: true, note: 'no activity recorded yet — counters accrue as the hooks and MCP server run (CODEWEB_NO_STATS=1 disables)' };
}

/** Increment a counter in the current month's bucket. Silent no-op on opt-out or any error. */
export function bump(graphPath, counter, n = 1) {
  if (process.env.CODEWEB_NO_STATS === '1' || !graphPath || !counter) return;
  try {
    const s = readStats(graphPath) || { since: monthNow(), months: {} };
    const m = monthNow();
    if (!s.months[m]) s.months[m] = {};
    s.months[m][counter] = (s.months[m][counter] || 0) + n;
    atomicWrite(statsPathOf(graphPath), JSON.stringify(s));
  } catch { /* a receipt must never break the tool */ }
}

const LABELS = [
  ['briefInjected', (v) => `${v} session brief(s)`],
  ['cardsDelivered', (v) => `${v} pre-edit card(s)`],
  ['cardCallersFollowed', (v) => `${v} card-named caller(s) followed`],
  ['postEditChecks', (v) => `${v} post-edit check(s)`],
  ['regressionsFlagged', (v) => `${v} regression(s) flagged before landing`],
  ['queriesServed', (v) => `${v} quer${v === 1 ? 'y' : 'ies'} served`],
  ['autoRefreshes', (v) => `${v} auto-refresh(es)`],
];

// ---- pending card (docs/specs/card-correlation.md) ---------------------------------------------
// The pre-edit hook records which caller files the card WARNED about; when a later edit touches
// one, the ledger records that the advice steered real work. One pending card at a time (a new
// card replaces it), 30-minute expiry, each file counts once. Same rules as the ledger it feeds:
// local-only, fail-open, CODEWEB_NO_STATS=1 disables.
const PENDING_TTL_MS = 30 * 60 * 1000;
const pendingPathOf = (graphPath) => join(dirname(graphPath), 'pending-card.json');

/** Record the card's named caller files as the active pending set (replaces any previous). */
export function recordPendingCard(graphPath, symbol, files) {
  if (process.env.CODEWEB_NO_STATS === '1' || !graphPath || !files || !files.length) return;
  try { atomicWrite(pendingPathOf(graphPath), JSON.stringify({ t: Date.now(), symbol, files })); }
  catch { /* receipt only */ }
}

/**
 * An edit landed on `editedRel` — if the pending card named it (and the card is fresh, and the
 * edit is not the card's own subject file), count it once and consume it. Never throws.
 */
export function correlateEdit(graphPath, editedRel) {
  if (process.env.CODEWEB_NO_STATS === '1' || !graphPath || !editedRel) return;
  try {
    const p = pendingPathOf(graphPath);
    const card = JSON.parse(readFileSync(p, 'utf8'));
    if (Date.now() - card.t > PENDING_TTL_MS) { try { unlinkSync(p); } catch {} return; }
    const ix = (card.files || []).indexOf(editedRel);
    if (ix === -1) return;
    card.files.splice(ix, 1);
    bump(graphPath, 'cardCallersFollowed');
    if (card.files.length) atomicWrite(p, JSON.stringify(card));
    else { try { unlinkSync(p); } catch {} }
  } catch { /* no pending card / unreadable — fine */ }
}

/** One line for a month's counters, or null when the bucket is empty. */
export function monthLine(counters) {
  if (!counters) return null;
  const parts = LABELS.filter(([k]) => counters[k] > 0).map(([k, f]) => f(counters[k]));
  for (const k of Object.keys(counters)) if (!LABELS.some(([l]) => l === k) && counters[k] > 0) parts.push(`${counters[k]} ${k}`);
  return parts.length ? parts.join(' · ') : null;
}

/** #10: sum every month — the receipt should never zero out on the 1st of a month. */
export function lifetimeTotals(s) {
  const out = {};
  for (const m of Object.keys(s?.months || {})) {
    for (const [k, v] of Object.entries(s.months[m])) out[k] = (out[k] || 0) + v;
  }
  return out;
}

/**
 * Attach activity to a brief object (mutates + returns it). #10: carries BOTH the lifetime
 * totals (never empty once codeweb has done anything here) and the current month's bucket —
 * a returning user's receipt no longer resets to silence every calendar month.
 */
export function attachActivity(brief, graphPath) {
  const s = readStats(graphPath);
  if (!s) return brief;
  const life = lifetimeTotals(s);
  if (!monthLine(life)) return brief;
  const m = monthNow();
  brief.activity = { since: s.since || null, lifetime: life, month: m, counters: s.months?.[m] || {} };
  return brief;
}
