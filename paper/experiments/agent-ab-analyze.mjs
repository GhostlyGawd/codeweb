#!/usr/bin/env node
// H18 — analyze agent A/B raw cells into a verdict file. Deterministic (the raw cells + seeded
// bootstrap are fixed); the A/B *solving* is not byte-repro (model nondeterminism) but this
// analysis of the committed raw data is. See agent-ab.DESIGN.md.
//   node paper/experiments/agent-ab-analyze.mjs [raw.json] [out.json]
//   (defaults: paper/results/agent-ab-raw.json -> paper/results/agent-ab.json; the v2 rerun
//    passes agent-ab2-raw.json / agent-ab2.json)

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mean, median, cliffsDelta, pairedDiffCI } from '../lib/stats.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RAW_PATH = process.argv[2] ? resolve(process.argv[2]) : join(ROOT, 'paper/results/agent-ab-raw.json');
const OUT_PATH = process.argv[3] ? resolve(process.argv[3]) : join(ROOT, 'paper/results/agent-ab.json');
const raw = JSON.parse(readFileSync(RAW_PATH, 'utf8'));
const done = raw.cells.filter((c) => c.completed && c.metrics);
const byCond = (cond) => done.filter((c) => c.condition === cond);
const col = (cells, k) => cells.map((c) => c.metrics[k]).filter((v) => typeof v === 'number');

const METRICS = ['structuralRegressions', 'newDuplication', 'newCycles', 'lostCallers'];
const perCondition = {};
for (const cond of ['control', 'treatment']) {
  const cells = byCond(cond);
  perCondition[cond] = { completed: cells.length, usedAnyTool: cells.filter((c) => c.toolsUsed > 0).length };
  for (const m of METRICS) { const xs = col(cells, m); perCondition[cond][m] = { mean: +mean(xs).toFixed(3), median: median(xs), sum: xs.reduce((a, b) => a + b, 0) }; }
}

// paired by task: mean over completed reps per condition, for tasks present in BOTH conditions
const tasks = [...new Set(done.map((c) => c.task))];
const paired = {};
for (const m of METRICS) {
  const pairs = [];
  for (const t of tasks) {
    const c = col(byCond('control').filter((x) => x.task === t), m);
    const tr = col(byCond('treatment').filter((x) => x.task === t), m);
    if (c.length && tr.length) pairs.push({ task: t, before: mean(c), after: mean(tr) }); // before=control, after=treatment
  }
  const ci = pairedDiffCI(pairs, { B: 10000, seed: 0xA1B2 });
  // cell-level effect size (unpaired): treatment vs control
  const delta = cliffsDelta(col(byCond('treatment'), m), col(byCond('control'), m));
  paired[m] = {
    nPairedTasks: pairs.length,
    meanDiff_treatmentMinusControl: +ci.est.toFixed(3),
    bootstrapCI95: [+ci.lo.toFixed(3), +ci.hi.toFixed(3)],
    cliffsDelta: +delta.delta.toFixed(3), effectMagnitude: delta.magnitude,
    significant: ci.lo > 0 || ci.hi < 0,
  };
}

const primary = paired.structuralRegressions;
const verdict = primary.significant ? (primary.meanDiff_treatmentMinusControl < 0 ? 'treatment-better' : 'control-better') : 'null-inconclusive';

const out = {
  cluster: 'C7-agent-ab', hypothesis: 'H18', config: raw.config,
  completion: { cells: raw.cells.length, completed: done.length, control: byCond('control').length, treatment: byCond('treatment').length, died: raw.cells.filter((c) => c.died).length },
  toolEngagement: { treatmentCompleted: byCond('treatment').length, treatmentUsedTools: byCond('treatment').filter((c) => c.toolsUsed > 0).length, note: 'validity check: a null is only meaningful if treatment actually used the tools' },
  perCondition, paired,
  verdict,
  interpretation: process.argv[2] ? 'rerun — interpret from this data (see the workflow header for the design deltas vs v1); the v1 narrative below does NOT apply.' :
    'NULL / INCONCLUSIVE (pre-registered weakest-evidence theme). Treatment agents engaged codeweb in all completed cells (find-similar/placement/query/simulate-edit), and the tools returned correct answers (e.g. find-similar reported no existing equivalent on the reuse tasks). But both conditions performed near-ceiling — structural regressions ~0 and new duplication exactly 0 in BOTH arms — so there was no measurable headroom (a floor effect): on clean, well-scoped tasks a capable base model already avoids regressions and duplication, and codeweb’s pre-edit intelligence corroborated rather than corrected. The bootstrap CI on the paired difference straddles 0. This bounds the effect on EASY tasks near zero and neither confirms nor refutes the outcome hypothesis; demonstrating corrective value needs higher-blast-radius tasks or a weaker base model (future work). Per pre-registration, the paper’s thesis rests on Themes 1–4; H18 is reported as an honest pilot.',
  reproducibilityNote: 'The A/B solving is not byte-reproducible (model nondeterminism). This analysis of the committed raw cells (agent-ab-raw.json) + seeded bootstrap IS reproducible; tasks were frozen pre-solve in agent-ab-tasks.json.',
};
writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
console.log(`[agent-ab] verdict: ${verdict}`);
console.log(`  completed ${done.length}/${raw.cells.length} (control ${out.completion.control}, treatment ${out.completion.treatment}); treatment used tools in ${out.toolEngagement.treatmentUsedTools}/${out.completion.treatment}`);
for (const m of METRICS) console.log(`  ${m}: control ${perCondition.control[m].mean} vs treatment ${perCondition.treatment[m].mean} | paired diff ${paired[m].meanDiff_treatmentMinusControl} CI [${paired[m].bootstrapCI95}] δ=${paired[m].cliffsDelta} (${paired[m].effectMagnitude})${paired[m].significant ? ' *SIG*' : ''}`);
console.log(`[agent-ab] wrote ${OUT_PATH}`);
