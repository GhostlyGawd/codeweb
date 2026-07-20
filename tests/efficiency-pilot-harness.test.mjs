// Tests the PURE control flow + aggregation of bench/experiments/efficiency-pilot.workflow.js that
// the engine-frozen-reps claim (lever #1) depends on, WITHOUT spawning real agents. The workflow
// body is executed with stubbed runtime globals (agent/parallel/phase/log) so we can assert the
// frozen-truth oracle-skip, the rep loop, and the mean +/- SD paired-delta headline.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { runNode, tmpDir, cleanup, writeTree, script } from './helpers.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const EXP = join(HERE, '..', 'bench', 'experiments')
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
    armSpawns.push({ cond, taskId, rep, prompt })
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

test('args delivered as a JSON STRING is parsed (regression: must not silently fall back to the oracle)', async () => {
  // The Workflow runtime can hand the script `args` as a JSON string, not an object. If the script
  // reads args.truth/args.reps off the raw string they are undefined -> oracle path at reps=1 (the
  // cause of a wasted run). The script must normalize string args first.
  const REPS = 2
  const { result, oracleSpawns } = await runHarness({ args: JSON.stringify({ truth: TRUTH, reps: REPS }), cannedArm })
  assert.equal(oracleSpawns, 0, 'string args.truth must still SKIP the oracle')
  assert.equal(result.config.frozenTruth, true, 'string args must be parsed so frozen truth is used')
  assert.equal(result.config.reps, REPS, 'string args.reps must be honored')
  assert.equal(result.perRep.length, REPS)
})

test('M1: args.root repoints every prompt path — the harness is portable (Spec M)', async () => {
  const root = '/home/user/codeweb'
  const { result, armSpawns } = await runHarness({ args: { truth: TRUTH, reps: 1, root }, cannedArm })
  for (const s of armSpawns) {
    assert.ok(!s.prompt.includes('D:/GitHub Projects'), `no hardcoded Windows root in ${s.cond}:${s.taskId}`)
    assert.ok(s.prompt.includes(root), `args.root reaches the ${s.cond} prompt`)
  }
  const treat = armSpawns.find((s) => s.cond === 'treatment')
  assert.ok(treat.prompt.includes(`${root}/scripts/query.mjs`), 'treatment query command uses args.root')
  assert.ok(treat.prompt.includes(`${root}/.codeweb/pilot`), 'graphs default hangs off args.root')
  assert.equal(result.config.root, root, 'config records the root the run used')
})

test('M1b: defaults unchanged without args.root (backward compatible)', async () => {
  const { armSpawns } = await runHarness({ args: { truth: TRUTH, reps: 1 }, cannedArm })
  assert.ok(armSpawns.every((s) => s.prompt.includes('D:/GitHub Projects/ecc-test/codeweb')), 'legacy default root preserved')
})

test('M2: args.budgeted flips the treatment arm to MCP-parity budgeted consumption (Spec M)', async () => {
  const { result, armSpawns } = await runHarness({ args: { truth: TRUTH, reps: 1, root: '/r', budgeted: true }, cannedArm })
  const treats = armSpawns.filter((s) => s.cond === 'treatment')
  for (const s of treats) {
    assert.match(s.prompt, /--limit 20/, 'budgeted treatment instructs the MCP default limit')
    assert.match(s.prompt, /--offset|full/i, 'the agent keeps the same completeness choice a real MCP agent has')
  }
  const controls = armSpawns.filter((s) => s.cond === 'control')
  assert.ok(controls.every((s) => !s.prompt.includes('--limit 20')), 'control arm untouched')
  assert.equal(result.config.usedBudgeted, true, 'config records the budgeted condition')

  const plain = await runHarness({ args: { truth: TRUTH, reps: 1, root: '/r' }, cannedArm })
  assert.ok(plain.armSpawns.filter((s) => s.cond === 'treatment').every((s) => !s.prompt.includes('--limit 20')),
    'without args.budgeted the treatment prompt is the unbudgeted one')
  assert.equal(plain.result.config.usedBudgeted, false)
})

test('M3: the graph pre-flight proves truth ids resolve — exit 2 when one does not (Spec M)', () => {
  const dir = tmpDir('codeweb-preflight-')
  try {
    writeTree(dir, {
      'mini/src/a.js': 'export function alpha(x) {\n  return x + 1;\n}\n',
      'mini/src/b.js': "import { alpha } from './a.js';\nexport function gamma() {\n  return alpha(3);\n}\n",
    })
    const graphs = join(dir, 'graphs')
    mkdirSync(join(graphs, 'mini'), { recursive: true })
    const built = runNode(script('run.mjs'), [join(dir, 'mini/src'), '--out-dir', join(graphs, 'mini')])
    assert.equal(built.status, 0, built.stderr)

    const truthOk = join(dir, 'truth-ok.json')
    writeFileSync(truthOk, JSON.stringify({ targets: { 'mini-alpha': { repo: 'mini', symbolId: 'a.js:alpha', truth: ['b.js:gamma'] } } }))
    const ok = runNode(join(EXP, 'efficiency-pilot.preflight.mjs'), ['--graphs', graphs, '--truth', truthOk])
    assert.equal(ok.status, 0, ok.stderr)
    assert.match(ok.stdout, /mini-alpha/, 'per-target row printed')
    assert.match(ok.stdout, /truth 1/, 'truth size in the row')

    const truthBad = join(dir, 'truth-bad.json')
    writeFileSync(truthBad, JSON.stringify({ targets: { 'mini-nope': { repo: 'mini', symbolId: 'a.js:doesNotExist', truth: ['b.js:gamma'] } } }))
    const bad = runNode(join(EXP, 'efficiency-pilot.preflight.mjs'), ['--graphs', graphs, '--truth', truthBad])
    assert.equal(bad.status, 2, 'unresolvable symbolId must fail the pre-flight')
    assert.match(bad.stderr, /doesNotExist|unresolved/i, 'says which id failed')
  } finally { cleanup(dir) }
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
