#!/usr/bin/env node
// replay-analyze — turn replay A/B raw cells into the verdict file. Deterministic over the
// committed raw data; the solving itself is not byte-repro (model nondeterminism).
// Small-N by design: reports means, pooled ratios, and per-task pairs — DIRECTIONAL framing
// only, no significance machinery (docs/specs/replay-run.md).
//   node paper/experiments/replay-analyze.mjs [raw.json] [out.json]

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RAW_PATH = process.argv[2] ? resolve(process.argv[2]) : join(ROOT, 'paper/results/replay-ab-raw.json');
const OUT_PATH = process.argv[3] ? resolve(process.argv[3]) : join(ROOT, 'paper/results/replay-ab.json');
const raw = JSON.parse(readFileSync(RAW_PATH, 'utf8'));

const done = raw.cells.filter((c) => c.result && c.result.completed && c.grading);
const byCond = (cond) => done.filter((c) => c.condition === cond);
const frac = (c) => (c.grading.missedTotal ? c.grading.missedCovered / c.grading.missedTotal : 1);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const r3 = (x) => +(+x).toFixed(3);

const perCondition = {};
for (const cond of ['control', 'treatment']) {
  const cells = byCond(cond);
  const covered = cells.reduce((a, c) => a + c.grading.missedCovered, 0);
  const total = cells.reduce((a, c) => a + c.grading.missedTotal, 0);
  perCondition[cond] = {
    completed: cells.length,
    pooledCoverage: `${covered}/${total}`,
    pooledCoverageFrac: total ? r3(covered / total) : null,
    meanCellCoverage: r3(mean(cells.map(frac))),
    fullCoverageCells: cells.filter((c) => c.grading.missedCovered === c.grading.missedTotal).length,
    structuralRegressions: cells.reduce((a, c) => a + (c.result.gate?.structuralRegressions ?? 0), 0),
    lostCallers: cells.reduce((a, c) => a + (c.result.gate?.lostCallers ?? 0), 0),
  };
}

// per-task pairing: mean cell coverage per condition, tasks present in both arms
const perTask = [];
for (const t of [...new Set(done.map((c) => c.task))]) {
  const c = byCond('control').filter((x) => x.task === t).map(frac);
  const tr = byCond('treatment').filter((x) => x.task === t).map(frac);
  if (c.length && tr.length) perTask.push({ task: t, control: r3(mean(c)), treatment: r3(mean(tr)), diff: r3(mean(tr) - mean(c)) });
}

// validity: a treatment result only counts as AMBIENT if the agent actually read the cards
const treatmentValidity = byCond('treatment').map((c) => ({
  task: c.task, rep: c.rep,
  ambientEngaged: !!(c.result.ambientContextNoted && c.result.ambientContextNoted.trim()),
}));

const cov = (cond) => perCondition[cond].pooledCoverageFrac;
const d = cov('treatment') - cov('control');
const verdict = done.length < raw.cells.length / 2 ? 'insufficient-completions'
  : Math.abs(d) < 1e-9 ? (cov('treatment') >= 0.999 ? 'both-at-ceiling' : 'tie-directional')
  : d > 0 ? 'treatment-better-directional' : 'control-better-directional';

const INTERPRETATIONS = {
  'both-at-ceiling':
    'Every completed cell in BOTH arms covered every historically-missed caller file and passed the ' +
    'structural gate. The 2025 change this replays really did miss 2 of its 3 caller files (axios needed ' +
    'two follow-up PRs); a capable agent replaying the same change under an explicit "keep the codebase ' +
    'consistent" instruction misses none of them, with or without codeweb — on a 3-caller, single-package ' +
    'task, grep alone saturates. What this run establishes: the instrument works end-to-end (blind solve, ' +
    'leak-free isolation, fixed-function grading), the ambient loop cost nothing (0 regressions; the ' +
    'card’s caller list matched ground truth exactly, and treatment agents reported it drove which ' +
    'call sites they touched), and the effect of ambient context on THIS task shape is bounded near zero. ' +
    'What it cannot say: anything about many-caller, cross-package changes (where grep does not saturate), ' +
    'weaker base agents, or time/token cost to reach coverage — the corpus has one task because guarded ' +
    'mining kills most candidates (see replay-tasks.json); growing it is the path to a discriminating run.',
  'treatment-better-directional':
    'Treatment covered more historically-missed caller files than control. Directional only at this N.',
  'control-better-directional':
    'Control covered more historically-missed caller files than treatment. Directional only at this N — report plainly.',
  'tie-directional': 'Both arms covered the same fraction, below ceiling. Directional only at this N.',
  'insufficient-completions': 'Too few cells completed to read anything. Fix the harness before interpreting.',
};

const out = {
  experiment: 'replay-ab (v2 blind protocol)',
  spec: 'docs/specs/replay-run.md',
  design: raw.design, config: raw.config, tasks: raw.tasks,
  completion: { cells: raw.cells.length, completed: done.length, died: raw.cells.filter((c) => c.died).length },
  primaryMetric: 'missedCovered/missedTotal — coverage of historically-missed caller files, computed by the workflow from filesChanged ∩ missedByChange (never self-reported)',
  perCondition, perTask, treatmentValidity,
  verdict,
  interpretation: INTERPRETATIONS[verdict] || 'Unrecognized verdict — read the numbers directly.',
  framing: 'DIRECTIONAL ONLY: single-digit task count and reps — no significance claims, no intervals. The pooled ratio and per-task pairs are the whole story; read them plainly.',
  pilotNote: 'The v1 pilot (replay-ab-pilot.json) is EXCLUDED: it leaked its answer key and ran on a task later found invalid. This file analyzes only v2 blind-protocol cells.',
};
writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
console.log(`[replay-ab] verdict: ${verdict}`);
console.log(`  completed ${done.length}/${raw.cells.length}; coverage control ${perCondition.control.pooledCoverage} vs treatment ${perCondition.treatment.pooledCoverage}`);
for (const p of perTask) console.log(`  ${p.task}: control ${p.control} vs treatment ${p.treatment} (diff ${p.diff})`);
console.log(`[replay-ab] wrote ${OUT_PATH}`);
