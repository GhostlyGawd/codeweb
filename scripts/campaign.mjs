#!/usr/bin/env node
// codeweb campaign CLI (F5) — run the three advisors (optimize / deadcode / break-cycles) and compose
// their outputs into ONE ordered, gated, ROI-ranked optimization worklist with cumulative projected
// deltas. Read-only PLAN: it never writes source — each step is for the agent + gate to execute. Built
// on ./lib/campaign.mjs. The advisors stay authoritative (one truth); campaign only orchestrates.
//
// Usage: node campaign.mjs <graph.json> [--json] [--budget N] [--git]   (or set CODEWEB_WS)
// Exit: 0 ok (advisory), 2 usage/IO.

import { readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeGraph } from './lib/graph-ops.mjs';
import { planCampaign } from './lib/campaign.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const USAGE = 'usage: campaign.mjs <graph.json> [--json] [--budget N] [--git]   (or set CODEWEB_WS)';
import { die, emitJson, finish, loadGraph, parseArgs } from './lib/cli.mjs';

// finding 24: THE flag loop (lib/cli.mjs parseArgs) — one unknown-flag policy, --help included.
const { opts, pos } = parseArgs(process.argv.slice(2), {
  usage: USAGE,
  flags: {
    json: { type: 'bool', default: false },
    budget: { type: 'number', default: Infinity },
    git: { type: 'bool', default: false },
    all: { type: 'bool', default: false }, // #6: advisors include non-product roles
  },
});
const { json, git, all } = opts, budget = Math.max(0, opts.budget);
const { graph, abs } = loadGraph(pos[0], { usage: USAGE });

// run each advisor as its tested artifact (--json); a failed advisor degrades to empty (the campaign
// still composes whatever the others found). finding #27: the three run CONCURRENTLY (async spawn +
// Promise.all) instead of three blocking spawnSync calls — wall drops to ~max(child) + compose. Each
// child's stdout is collected; stderr is drained and DISCARDED (spawnSync collected-and-discarded
// child stderr — preserve exactly that; an UNDRAINED stderr pipe blocks a child at ~64KB and
// deadlocks the run, so we must read it and emit nothing). Exit code is IGNORED — parse stdout
// regardless of status, exactly as spawnSync did; a spawn 'error' or non-JSON stdout yields null ->
// the existing `|| {…}` default. Chunk collection has no maxBuffer cliff (superset of the old 1<<28).
// Child argv + env are unchanged. Promise.all's array order fixes the payload composition order, so
// campaign's own stdout is composed only after all three settle — byte-identical to the sequential run.
const advise = (script, extra = []) => new Promise((res) => {
  const child = spawn(process.execPath, [join(HERE, script), abs, ...extra, '--json'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const out = [];
  child.stdout.on('data', (c) => out.push(c));
  child.stderr.on('data', () => {}); // drain + discard: match spawnSync's collect-and-discard; never interleave, never deadlock
  child.on('error', () => res(null)); // spawn failure -> null -> default (resolve is idempotent if 'close' also fires)
  child.on('close', () => { try { res(JSON.parse(Buffer.concat(out).toString('utf8'))); } catch { res(null); } });
});
const allFlag = all ? ['--all'] : [];
const [optimize, deadcode, breakCycles] = await Promise.all([
  advise('optimize.mjs'),
  advise('deadcode.mjs', allFlag), // #6: deadcode is role-scoped; campaign passes the choice through
  advise('break-cycles.mjs'),
]).then(([o, d, b]) => [o || { opportunities: [] }, d || { safe: [] }, b || { cycles: [] }]);

// clone:false — campaign OWNS this freshly-parsed graph (loadGraph already normalized it), and
// normalizeGraph is idempotent additive default-filling that never touches `meta`, so re-normalizing
// in place is safe and the `graph.meta?.target` read below still sees the real target (finding #27,
// −260 ms at 15.7k by skipping the structuredClone). Every OTHER planCampaign caller keeps the default.
const plan = planCampaign(graph, { optimize, deadcode, breakCycles, budget, clone: false });
const t0 = plan.totals;
const payload = {
  target: graph.meta?.target || 'target',
  summary: `${t0.steps} step(s): ${t0.cuts} cut, ${t0.deletes} delete, ${t0.merges} merge — projected -${t0.locReclaimed} LOC, ${t0.cyclesBroken} cycle(s) broken (gate-green in order)`,
  ...plan,
};

if (json) { emitJson(payload); } else {

const t = plan.totals;
console.log(`codeweb campaign: ${payload.target} — ${t.steps} step(s): ${t.cuts} cut, ${t.deletes} delete, ${t.merges} merge`);
console.log(`  projected: -${t.locReclaimed} LOC, ${t.cyclesBroken} cycle(s) broken (all steps stay gate-green in order)`);
for (const s of plan.steps) {
  const tag = s.type.toUpperCase().padEnd(6);
  const what = s.type === 'cut' ? `${s.files.join(' <-> ')}` : s.type === 'delete' ? s.op.ids.join(', ') : `${s.op.ids.join(' + ')} -> ${s.op.into}`;
  console.log(`  [${tag}] ${what}  (roi ${s.roi}; +${s.delta.locReclaimed} LOC, +${s.delta.cyclesBroken} cycle; cumulative -${s.cumulative.locReclaimed} LOC)`);
}
finish();
}
