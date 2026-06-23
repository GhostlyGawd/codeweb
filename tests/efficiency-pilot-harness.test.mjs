// Tests the PURE control flow + aggregation of paper/experiments/efficiency-pilot.workflow.js that
// the engine-frozen-reps claim (lever #1) depends on, WITHOUT spawning real agents. The workflow
// body is executed with stubbed runtime globals (agent/parallel/phase/log) so we can assert the
// frozen-truth oracle-skip, the rep loop, and the mean +/- SD paired-delta headline.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const EXP = join(HERE, '..', 'paper', 'experiments')
const TRUTH = JSON.parse(readFileSync(join(EXP, 'efficiency-pilot.truth.json'), 'utf8'))
const BODY = readFileSync(join(EXP, 'efficiency-pilot.workflow.js'), 'utf8').replace(/export const meta/, 'const meta')
const TASKS_N = Object.keys(TRUTH.targets).length

// Run the workflow body with stubbed runtime globals. `cannedArm(cond, taskId, rep)` returns the
// arm result object; an oracle stub records spawns so we can assert it is/ isn't called.
async function runHarness({ args, cannedArm, oracle }) {
  let oracleSpawns = 0
  const armSpawns = []
  const agent = (prompt, opts) => {
    const label = opts.label || ''
    if (label.startsWith('oracle:')) { oracleSpawns++; return Promise.resolve(oracle ? oracle(label) : { confirmedTruth: [], discrepancies: [] }) }
    const m = label.match(/^(control|treat):([^#]+)#?(\d+)?/)
    const cond = m[1] === 'treat' ? 'treatment' : 'control'
    const taskId = m[2]
    const rep = Number(m[3] || 1)
    armSpawns.push({ cond, taskId, rep })
    return Promise.resolve(cannedArm(cond, taskId, rep))
  }
  const parallel = (thunks) => Promise.all(thunks.map((th) => (typeof th === 'function' ? th() : th)))
  const noop = () => {}
  const budget = { total: null, spent: () => 0, remaining: () => Infinity }
  // eslint-disable-next-line no-new-func
  const run = new Function('agent', 'parallel', 'phase', 'log', 'args', 'budget', `return (async () => {\n${BODY}\n})()`)
  const result = await run(agent, parallel, noop, noop, args, budget)
  return { result, oracleSpawns, armSpawns }
}

// Treatment finds more of truth in fewer steps; treatment recall drifts down with rep while control
// is held constant, so the PAIRED delta varies across reps (=> nonzero sample SD).
function cannedArm(cond, taskId, rep) {
  const all = TRUTH.targets[taskId].truth
  const keepN = cond === 'treatment'
    ? Math.max(1, all.length - (rep - 1) * 2)
    : Math.max(1, Math.round(all.length * 0.5))
  const found = all.slice(0, keepN)
  const steps = cond === 'treatment' ? 9 + rep * 2 : 18
  return { taskId, condition: cond, foundCallers: found, commands: found.map((_, i) => `s${i}`), stepCount: steps, usedCodeweb: cond === 'treatment', confidence: 'stub' }
}

test('frozen truth (args.truth) SKIPS the oracle and runs reps with a paired-delta mean +/- SD headline', async () => {
  const REPS = 3
  const { result, oracleSpawns, armSpawns } = await runHarness({ args: { truth: TRUTH, reps: REPS }, cannedArm })

  assert.equal(oracleSpawns, 0, 'oracle must be skipped when frozen truth is supplied')
  assert.equal(armSpawns.length, REPS * TASKS_N * 2, 'control+treatment spawned once per task per rep')
  assert.equal(result.config.frozenTruth, true)
  assert.equal(result.config.reps, REPS)
  assert.equal(result.perRep.length, REPS)
  assert.ok(result.perRep.every((rep) => rep.length === TASKS_N), 'one row per task per rep')
  assert.equal(result.perRepMeanDelta.length, REPS)
  assert.equal(result.perTaskAgg.length, TASKS_N)

  const hl = result.headline
  assert.equal(hl.pairedDeltaRecall.n, REPS, 'headline aggregates over all reps')
  assert.equal(typeof hl.pairedDeltaRecall.mean, 'number')
  assert.ok(hl.pairedDeltaRecall.sd > 0, 'sample SD must be >0 for a rep-varying paired delta (exercises the noise-floor math)')
  assert.ok(hl.pairedDeltaRecall.mean >= 0, 'treatment recall >= control in stub => non-negative mean paired delta')
  assert.ok(hl.pairedDeltaSteps.mean < 0, 'treatment uses fewer steps => negative step delta')

  // every task carries a paired delta aggregated over reps
  for (const t of result.perTaskAgg) {
    assert.equal(t.reps, REPS)
    assert.equal(typeof t.delta.recall.mean, 'number')
    assert.equal(typeof t.delta.steps.mean, 'number')
  }

  // integrity: control never uses codeweb, treatment always does
  assert.equal(result.integrity.controlUsedCodewebViolations.length, 0)
  assert.equal(result.integrity.treatmentSkippedCodeweb.length, 0)
})

test('without args.truth the per-run oracle IS spawned (backward compatible)', async () => {
  // oracle returns a real confirmed set so the legacy grading path produces valid scores
  const oracle = (label) => {
    const taskId = label.replace(/^oracle:/, '').replace(/#\d+$/, '')
    return { confirmedTruth: TRUTH.targets[taskId].truth, codewebCallers: [], manualCallers: [], discrepancies: [] }
  }
  const { result, oracleSpawns, armSpawns } = await runHarness({ args: { reps: 1 }, cannedArm, oracle })

  assert.equal(oracleSpawns, TASKS_N, 'one oracle per task when no frozen truth')
  assert.equal(armSpawns.length, TASKS_N * 2)
  assert.equal(result.config.frozenTruth, false)
  assert.equal(result.config.reps, 1)
  assert.equal(result.perRep.length, 1)
  // still emits per-arm absolute means for continuity with the pre-lever-#1 output shape
  assert.ok(result.means && result.means.treatment && typeof result.means.treatment.recall === 'number')
  assert.ok(result.perTaskAgg[0].truthN > 0, 'oracle confirmedTruth flowed into grading')
})
