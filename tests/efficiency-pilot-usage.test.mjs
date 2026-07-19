// Tests the EFFICIENCY instrument (bench/experiments/efficiency-pilot.usage.mjs) that adds the
// previously-missing axis to the pilot: tokens + wall-clock + runtime tool-calls, each as the SAME
// paired-delta (treatment - control) mean+/-SD the harness uses for recall/steps. The pure helpers
// (parseLabel/stat/aggregateUsage) are unit-tested with hand-computed deltas; the CLI is run against
// a synthetic Workflow journal + transcript fixture so the whole join+aggregate path is exercised
// without any real agents or the (session-local, uncommitted) production transcripts.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const USAGE = join(HERE, '..', 'bench', 'experiments', 'efficiency-pilot.usage.mjs')
const { parseLabel, stat, aggregateUsage } = await import('../bench/experiments/efficiency-pilot.usage.mjs')

test('parseLabel maps control/treat labels to arm + task + rep (and rejects others)', () => {
  assert.deepEqual(parseLabel('control:axios-merge#3'), { arm: 'control', task: 'axios-merge', rep: 3 })
  assert.deepEqual(parseLabel('treat:flask-render_template#1'), { arm: 'treatment', task: 'flask-render_template', rep: 1 })
  assert.deepEqual(parseLabel('control:axios-merge'), { arm: 'control', task: 'axios-merge', rep: 1 }, 'no #rep => rep 1')
  assert.equal(parseLabel('oracle:axios-merge#2'), null, 'oracle is not an efficiency arm')
  assert.equal(parseLabel('garbage'), null)
})

test('stat returns mean / sample-SD (n-1) / n, matching the harness aggregation', () => {
  assert.deepEqual(stat([-8, -6]), { mean: -7, sd: Math.round(Math.SQRT2 * 1000) / 1000, n: 2 })
  assert.deepEqual(stat([5]), { mean: 5, sd: null, n: 1 }, 'SD null for n<2')
  assert.deepEqual(stat([]), { mean: null, sd: null, n: 0 })
})

// 2 tasks x 2 reps. delta = treatment - control (NEGATIVE = codeweb cheaper = win).
// toolCalls: control=20 always; treatment t1r1=10,t2r1=14,t1r2=12,t2r2=16
//   per-task delta: t1r1 -10, t2r1 -6, t1r2 -8, t2r2 -4
//   perRepMeanDelta: rep1 avg(-10,-6)=-8 ; rep2 avg(-8,-4)=-6  => headline stat([-8,-6]) = -7 +/- sqrt2
// outputTokens: control=1000 always; treatment t1r1=400,t2r1=600,t1r2=500,t2r2=700
//   perRepMeanDelta: rep1 avg(-600,-400)=-500 ; rep2 avg(-500,-300)=-400 => -450 +/- sqrt(5000)
function rowsFixture() {
  const mk = (arm, task, rep, toolCalls, outputTokens, totalTokens, wallMs) =>
    ({ arm, task, rep, toolCalls, outputTokens, totalTokens, wallMs })
  return [
    mk('control', 't1', 1, 20, 1000, 10000, 100000), mk('treatment', 't1', 1, 10, 400, 4000, 60000),
    mk('control', 't2', 1, 20, 1000, 10000, 100000), mk('treatment', 't2', 1, 14, 600, 6000, 80000),
    mk('control', 't1', 2, 20, 1000, 10000, 100000), mk('treatment', 't1', 2, 12, 500, 5000, 70000),
    mk('control', 't2', 2, 20, 1000, 10000, 100000), mk('treatment', 't2', 2, 16, 700, 7000, 90000),
  ]
}

test('aggregateUsage computes the paired-delta headline (mean +/- SD over reps) per metric', () => {
  const agg = aggregateUsage(rowsFixture())
  assert.equal(agg.headline.reps, 2)
  assert.deepEqual(agg.headline.pairedDeltaToolCalls, { mean: -7, sd: Math.round(Math.SQRT2 * 1000) / 1000, n: 2 })
  assert.deepEqual(agg.headline.pairedDeltaOutputTokens, { mean: -450, sd: Math.round(Math.sqrt(5000) * 1000) / 1000, n: 2 })
  // per-rep mean-over-tasks paired delta
  assert.equal(agg.perRepMeanDelta.length, 2)
  assert.equal(agg.perRepMeanDelta[0].deltaToolCalls, -8)
  assert.equal(agg.perRepMeanDelta[1].deltaToolCalls, -6)
  // per-task aggregate carries arm absolutes + paired delta
  const t1 = agg.perTaskAgg.find((t) => t.task === 't1')
  assert.equal(t1.reps, 2)
  assert.equal(t1.control.toolCalls.mean, 20)
  assert.equal(t1.treatment.toolCalls.mean, 11) // (10+12)/2
  assert.equal(t1.delta.toolCalls.mean, -9)     // (-10 + -8)/2
  // overall means
  assert.equal(agg.means.control.toolCalls, 20)
  assert.equal(agg.means.treatment.toolCalls, 13) // (10+14+12+16)/4
  assert.ok(agg.means.treatment.totalTokens < agg.means.control.totalTokens, 'codeweb uses fewer total tokens')
})

// ---- CLI integration over a synthetic journal + transcripts ------------------------------------
function assistantLine(ts, output, input, cacheRead) {
  return JSON.stringify({ type: 'assistant', timestamp: ts, usage: { input_tokens: input, output_tokens: output, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: 0 } })
}
// One transcript: two assistant turns; output sums to `output`, wall-clock = `wallMs`,
// total = input + output + cacheRead (cacheCreate 0).
function writeTranscript(dir, agentId, { output, input, cacheRead, wallMs }) {
  const t0 = '2026-01-01T00:00:00.000Z'
  const t1 = new Date(Date.parse(t0) + wallMs).toISOString()
  const body = [assistantLine(t0, output, input, cacheRead), assistantLine(t1, 0, 0, 0)].join('\n') + '\n'
  writeFileSync(join(dir, `agent-${agentId}.jsonl`), body)
}

test('CLI joins a Workflow journal to transcripts and writes a paired-delta usage.json', () => {
  const root = mkdtempSync(join(tmpdir(), 'cw-usage-'))
  const tdir = join(root, 'transcripts')
  mkdirSync(tdir)
  const out = join(root, 'usage.json')

  // mirror the fixture rows: build journal agent events + matching transcripts
  const rows = rowsFixture()
  const agents = rows.map((r, i) => {
    const id = `a${i}`
    const label = `${r.arm === 'treatment' ? 'treat' : 'control'}:${r.task}#${r.rep}`
    // total = input + output + cacheRead -> choose input/cacheRead so total matches the fixture
    const cacheRead = Math.max(0, r.totalTokens - r.outputTokens - 0)
    writeTranscript(tdir, id, { output: r.outputTokens, input: 0, cacheRead, wallMs: r.wallMs })
    return { type: 'workflow_agent', label, agentId: id, state: 'done', model: 'claude-opus-4-8[1m]', toolCalls: r.toolCalls, durationMs: r.wallMs }
  })
  const journal = { runId: 'wf_test', workflowName: 'codeweb-efficiency-pilot', workflowProgress: [{ type: 'workflow_phase', index: 1, title: 'Discover' }, ...agents] }
  const jpath = join(root, 'wf_test.json')
  writeFileSync(jpath, JSON.stringify(journal))

  execFileSync(process.execPath, [USAGE, '--journal', jpath, '--transcripts', tdir, '--out', out], { stdio: 'pipe' })
  const res = JSON.parse(readFileSync(out, 'utf8'))

  assert.equal(res.headline.reps, 2)
  assert.deepEqual(res.headline.pairedDeltaToolCalls, { mean: -7, sd: Math.round(Math.SQRT2 * 1000) / 1000, n: 2 })
  assert.deepEqual(res.headline.pairedDeltaOutputTokens, { mean: -450, sd: Math.round(Math.sqrt(5000) * 1000) / 1000, n: 2 })
  assert.equal(res.integrity.agentsExpected, 8)
  assert.equal(res.integrity.agentsJoined, 8)
  assert.equal(res.integrity.missingTranscripts.length, 0)
  assert.equal(res.integrity.unparsedLabels.length, 0)
  assert.equal(res.source.model, 'claude-opus-4-8[1m]')
  assert.equal(res.perAgent.length, 8, 'auditable per-agent rows are emitted')
})
