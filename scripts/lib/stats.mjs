// stats — the local outcome ledger: what codeweb actually DID during real work, counted where
// it happened. This is the value receipt ("3 regressions blocked before landing, 14 pre-edit
// cards, 87 queries served") — evidence from real use with a real denominator, not a lab.
//
// STRICTLY LOCAL: written beside the graph (<workspace>/stats.json), never transmitted,
// nothing identifying — counter names and integers only. CODEWEB_NO_STATS=1 disables all
// writes. Every operation is fail-open (a ledger must never break the tool it measures);
// concurrent writers are last-write-wins (counters may undercount under races — acceptable
// for a receipt, documented here).

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const statsPathOf = (graphPath) => join(dirname(graphPath), 'stats.json');
const monthNow = () => new Date().toISOString().slice(0, 7);

/** Read the ledger beside a graph.json, or null. Never throws. */
export function readStats(graphPath) {
  try { return JSON.parse(readFileSync(statsPathOf(graphPath), 'utf8')); } catch { return null; }
}

/** Increment a counter in the current month's bucket. Silent no-op on opt-out or any error. */
export function bump(graphPath, counter, n = 1) {
  if (process.env.CODEWEB_NO_STATS === '1' || !graphPath || !counter) return;
  try {
    const s = readStats(graphPath) || { since: monthNow(), months: {} };
    const m = monthNow();
    if (!s.months[m]) s.months[m] = {};
    s.months[m][counter] = (s.months[m][counter] || 0) + n;
    writeFileSync(statsPathOf(graphPath), JSON.stringify(s));
  } catch { /* a receipt must never break the tool */ }
}

const LABELS = [
  ['briefInjected', (v) => `${v} session brief(s)`],
  ['cardsDelivered', (v) => `${v} pre-edit card(s)`],
  ['postEditChecks', (v) => `${v} post-edit check(s)`],
  ['regressionsFlagged', (v) => `${v} regression(s) flagged before landing`],
  ['queriesServed', (v) => `${v} quer${v === 1 ? 'y' : 'ies'} served`],
  ['autoRefreshes', (v) => `${v} auto-refresh(es)`],
];

/** One line for a month's counters, or null when the bucket is empty. */
export function monthLine(counters) {
  if (!counters) return null;
  const parts = LABELS.filter(([k]) => counters[k] > 0).map(([k, f]) => f(counters[k]));
  for (const k of Object.keys(counters)) if (!LABELS.some(([l]) => l === k) && counters[k] > 0) parts.push(`${counters[k]} ${k}`);
  return parts.length ? parts.join(' · ') : null;
}

/** Attach the current month's activity to a brief object (mutates + returns it). */
export function attachActivity(brief, graphPath) {
  const s = readStats(graphPath);
  const m = monthNow();
  if (s?.months?.[m] && monthLine(s.months[m])) brief.activity = { month: m, counters: s.months[m] };
  return brief;
}
