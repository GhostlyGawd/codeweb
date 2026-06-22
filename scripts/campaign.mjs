#!/usr/bin/env node
// codeweb campaign CLI (F5) — run the three advisors (optimize / deadcode / break-cycles) and compose
// their outputs into ONE ordered, gated, ROI-ranked optimization worklist with cumulative projected
// deltas. Read-only PLAN: it never writes source — each step is for the agent + gate to execute. Built
// on ./lib/campaign.mjs. The advisors stay authoritative (one truth); campaign only orchestrates.
//
// Usage: node campaign.mjs <graph.json> [--json] [--budget N] [--git]   (or set CODEWEB_WS)
// Exit: 0 ok (advisory), 2 usage/IO.

import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeGraph } from './lib/graph-ops.mjs';
import { planCampaign } from './lib/campaign.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const USAGE = 'usage: campaign.mjs <graph.json> [--json] [--budget N] [--git]   (or set CODEWEB_WS)';
function die(msg, code) { console.error(msg); process.exit(code); }

const argv = process.argv.slice(2);
let json = false, budget = Infinity, git = false; const pos = [];
for (let i = 0; i < argv.length; i++) {
  const t = argv[i];
  if (t === '--json') json = true;
  else if (t === '--budget') budget = Math.max(0, parseInt(argv[++i], 10) || 0);
  else if (t === '--git') git = true;
  else if (!t.startsWith('-')) pos.push(t);
}
const graphPath = pos[0] || (process.env.CODEWEB_WS ? `${process.env.CODEWEB_WS}/graph.json` : null);
if (!graphPath) die(USAGE, 2);
const abs = resolve(graphPath);
if (!existsSync(abs)) die(`graph not found: ${abs}`, 2);
let graph;
try { graph = normalizeGraph(JSON.parse(readFileSync(abs, 'utf8'))); }
catch (e) { die(`invalid JSON in ${abs}: ${e.message}`, 2); }

// run each advisor as its tested artifact (--json); a failed advisor degrades to empty (the campaign
// still composes whatever the others found).
const advise = (script, extra = []) => {
  const r = spawnSync(process.execPath, [join(HERE, script), abs, ...extra, '--json'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  try { return JSON.parse(r.stdout); } catch { return null; }
};
const optimize = advise('optimize.mjs') || { opportunities: [] };
const deadcode = advise('deadcode.mjs') || { safe: [] };
const breakCycles = advise('break-cycles.mjs') || { cycles: [] };

const plan = planCampaign(graph, { optimize, deadcode, breakCycles, budget });
const payload = { target: graph.meta?.target || 'target', ...plan };

if (json) { process.stdout.write(JSON.stringify(payload) + '\n'); process.exit(0); }

const t = plan.totals;
console.log(`codeweb campaign: ${payload.target} — ${t.steps} step(s): ${t.cuts} cut, ${t.deletes} delete, ${t.merges} merge`);
console.log(`  projected: -${t.locReclaimed} LOC, ${t.cyclesBroken} cycle(s) broken (all steps stay gate-green in order)`);
for (const s of plan.steps) {
  const tag = s.type.toUpperCase().padEnd(6);
  const what = s.type === 'cut' ? `${s.files.join(' <-> ')}` : s.type === 'delete' ? s.op.ids.join(', ') : `${s.op.ids.join(' + ')} -> ${s.op.into}`;
  console.log(`  [${tag}] ${what}  (roi ${s.roi}; +${s.delta.locReclaimed} LOC, +${s.delta.cyclesBroken} cycle; cumulative -${s.cumulative.locReclaimed} LOC)`);
}
process.exit(0);
