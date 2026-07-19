#!/usr/bin/env node
// EFFICIENCY instrument for the engine-frozen reps run (lever #3 — the axis reps8.json was missing).
//
// reps8.json measured recall (effectiveness) + steps (efficiency), but steps were SELF-REPORTED by
// the agent and tokens / wall-clock were never instrumented. This reads the Workflow JOURNAL of an
// efficiency-pilot run plus its per-agent transcripts and recovers RUNTIME-MEASURED efficiency:
//   - outputTokens  : tokens the model generated      (summed from each transcript's usage)
//   - totalTokens   : full context processed = input + output + cacheRead + cacheCreate
//   - toolCalls     : runtime-counted tool invocations (journal) — the unbiased version of stepCount
//   - wallMs        : agent wall-clock = last - first transcript timestamp (== journal durationMs)
// Each is reported as the SAME paired delta (treatment - control) mean +/- SD the harness uses for
// recall/steps. Sign convention: NEGATIVE delta = codeweb is CHEAPER = a win (fewer tokens/tools/ms).
//
// No agents; deterministic over the recorded run. Joins journal `workflow_agent` events (label ->
// arm/task/rep, agentId) to `<transcriptDir>/agent-<agentId>.jsonl`. Also cross-checks the
// self-reported step delta in reps8.json against the runtime toolCalls delta computed here.
//
// Usage: node bench/experiments/efficiency-pilot.usage.mjs                       (defaults to the reps8 run)
//        node bench/experiments/efficiency-pilot.usage.mjs --journal <wf_*.json> [--transcripts <dir>] [--out <path>] [--json]
// Writes: bench/experiments/efficiency-pilot.usage.json

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, basename } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))

// Default source = the committed engine-frozen reps run (wf_12660328-d4d, engine c892f50). Its
// transcripts live in the session dir (local, uncommitted — like .codeweb/); usage.json is the
// committed measured artifact, the same way reps8.json is. Override with --journal for any run.
const DEFAULT_JOURNAL =
  'D:/GitHub Projects/ecc-test/projects/D--GitHub-Projects-ecc-test/bfdf2b4b-fdaf-40cb-b21d-c0c3e710325f/workflows/wf_12660328-d4d.json'

const METRICS = ['outputTokens', 'totalTokens', 'toolCalls', 'wallMs']

// ---- math (mirrors the harness exactly: sample SD n-1, r2 for means, r3 for stat) --------------
const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100)
const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000)
const nums = (xs) => xs.filter((x) => typeof x === 'number')
const avg = (xs) => { const v = nums(xs); return v.length ? r2(v.reduce((a, b) => a + b, 0) / v.length) : null }
const mean_ = (xs) => { const v = nums(xs); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }
const sd_ = (xs) => { const v = nums(xs); if (v.length < 2) return null; const m = mean_(v); return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)) }
export const stat = (xs) => ({ mean: r3(mean_(xs)), sd: r3(sd_(xs)), n: nums(xs).length })
const cap = (s) => s[0].toUpperCase() + s.slice(1)

// ---- label -> arm/task/rep --------------------------------------------------------------------
// Workflow agent labels: `control:<task>#<rep>` / `treat:<task>#<rep>` (rep omitted => 1). Oracle and
// anything else are not efficiency arms -> null.
export function parseLabel(label) {
  const m = String(label || '').match(/^(control|treat):(.+?)(?:#(\d+))?$/)
  if (!m) return null
  return { arm: m[1] === 'treat' ? 'treatment' : 'control', task: m[2], rep: Number(m[3] || 1) }
}

// ---- transcript usage + wall-clock ------------------------------------------------------------
// Sum the Anthropic usage fields across assistant turns and span the timestamps. Source of truth for
// tokens (the journal's `tokens` field has opaque semantics — it does not equal input+output here).
export function summarizeTranscript(path) {
  const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean)
  let output = 0, input = 0, cacheRead = 0, cacheCreate = 0, turns = 0
  let tsMin = Infinity, tsMax = -Infinity
  for (const ln of lines) {
    let o
    try { o = JSON.parse(ln) } catch { continue }
    const u = o.usage || (o.message && o.message.usage)
    if (u) {
      turns++
      output += u.output_tokens || 0
      input += u.input_tokens || 0
      cacheRead += u.cache_read_input_tokens || 0
      cacheCreate += u.cache_creation_input_tokens || 0
    }
    if (o.timestamp) {
      const t = Date.parse(o.timestamp)
      if (!Number.isNaN(t)) { if (t < tsMin) tsMin = t; if (t > tsMax) tsMax = t }
    }
  }
  return {
    output, input, cacheRead, cacheCreate,
    total: input + output + cacheRead + cacheCreate,
    wallMs: tsMax >= tsMin ? tsMax - tsMin : null,
    turns,
  }
}

// ---- aggregation (pure) -----------------------------------------------------------------------
// rows: [{ arm:'control'|'treatment', task, rep, outputTokens, totalTokens, toolCalls, wallMs }]
export function aggregateUsage(rows) {
  const tasks = [...new Set(rows.map((r) => r.task))]
  const reps = [...new Set(rows.map((r) => r.rep))].sort((a, b) => a - b)
  const get = (arm, task, rep) => rows.find((r) => r.arm === arm && r.task === task && r.rep === rep)

  // per (task, rep) paired delta = treatment - control, for each metric
  const pairDelta = (task, rep, m) => {
    const c = get('control', task, rep), t = get('treatment', task, rep)
    return (c && t && typeof c[m] === 'number' && typeof t[m] === 'number') ? t[m] - c[m] : null
  }

  // per-rep mean-over-tasks paired delta -> the numbers whose mean +/- SD is the headline
  const perRepMeanDelta = reps.map((rep) => {
    const row = { rep, tasksGraded: tasks.filter((task) => get('control', task, rep) && get('treatment', task, rep)).length }
    for (const m of METRICS) row['delta' + cap(m)] = avg(tasks.map((task) => pairDelta(task, rep, m)))
    return row
  })

  const headline = { reps: reps.length }
  for (const m of METRICS) headline['pairedDelta' + cap(m)] = stat(perRepMeanDelta.map((x) => x['delta' + cap(m)]))

  const perTaskAgg = tasks.map((task) => {
    const node = { task, repo: task.split('-')[0], reps: reps.filter((rep) => get('control', task, rep) && get('treatment', task, rep)).length, control: {}, treatment: {}, delta: {} }
    for (const m of METRICS) {
      node.control[m] = stat(reps.map((rep) => { const r = get('control', task, rep); return r ? r[m] : null }))
      node.treatment[m] = stat(reps.map((rep) => { const r = get('treatment', task, rep); return r ? r[m] : null }))
      node.delta[m] = stat(reps.map((rep) => pairDelta(task, rep, m)))
    }
    return node
  })

  const means = { control: {}, treatment: {} }
  for (const m of METRICS) {
    means.control[m] = avg(rows.filter((r) => r.arm === 'control').map((r) => r[m]))
    means.treatment[m] = avg(rows.filter((r) => r.arm === 'treatment').map((r) => r[m]))
  }

  return { headline, perTaskAgg, perRepMeanDelta, means }
}

// ---- CLI --------------------------------------------------------------------------------------
function argVal(flag) { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : null }

function transcriptDirFor(journalPath) {
  // journal: <sessionDir>/workflows/<runId>.json  ->  <sessionDir>/subagents/workflows/<runId>/
  const sessionDir = dirname(dirname(journalPath))
  return join(sessionDir, 'subagents', 'workflows', basename(journalPath, '.json'))
}

function buildReport(journalPath, transcriptDir) {
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'))
  const events = (journal.workflowProgress || []).filter((e) => e.type === 'workflow_agent')
  const armEvents = events.filter((e) => /^(control|treat):/.test(e.label || ''))

  const rows = []
  const missingTranscripts = []
  const unparsedLabels = []
  let model = null
  for (const e of armEvents) {
    const meta = parseLabel(e.label)
    if (!meta) { unparsedLabels.push(e.label); continue }
    if (!model && e.model) model = e.model
    const tpath = join(transcriptDir, `agent-${e.agentId}.jsonl`)
    if (!existsSync(tpath)) { missingTranscripts.push(e.label); continue }
    const s = summarizeTranscript(tpath)
    rows.push({
      arm: meta.arm, task: meta.task, rep: meta.rep, agentId: e.agentId,
      outputTokens: s.output, inputTokens: s.input, cacheReadTokens: s.cacheRead, totalTokens: s.total,
      toolCalls: typeof e.toolCalls === 'number' ? e.toolCalls : null,
      wallMs: s.wallMs, journalDurationMs: typeof e.durationMs === 'number' ? e.durationMs : null,
    })
  }

  const agg = aggregateUsage(rows)
  const tasks = [...new Set(rows.map((r) => r.task))]
  const reps = [...new Set(rows.map((r) => r.rep))]

  // signal-to-noise + verdict per metric (|mean|/sd; negative mean = codeweb cheaper)
  const interpretation = {}
  for (const m of METRICS) {
    const h = agg.headline['pairedDelta' + cap(m)]
    const ratio = (h.mean != null && h.sd) ? Math.abs(h.mean) / h.sd : null
    interpretation[m] = {
      pairedDelta: h.mean, sd: h.sd, signalToNoise: ratio != null ? r2(ratio) : null,
      direction: h.mean == null ? 'n/a' : (h.mean < 0 ? 'codeweb cheaper (win)' : h.mean > 0 ? 'codeweb costlier' : 'tie'),
    }
  }

  // cross-check: reps8 SELF-REPORTED step delta vs this run's RUNTIME toolCalls delta
  let stepCheck = null
  const reps8Path = join(HERE, 'efficiency-pilot.reps8.json')
  if (existsSync(reps8Path)) {
    try {
      const reps8 = JSON.parse(readFileSync(reps8Path, 'utf8'))
      const selfReported = reps8.headline && reps8.headline.pairedDeltaSteps
      stepCheck = {
        selfReportedStepDelta: selfReported || null,
        runtimeToolCallDelta: agg.headline.pairedDeltaToolCalls,
        note: 'Self-reported stepCount (reps8.json) vs runtime-counted toolCalls (this run). Same sign + comparable magnitude => the self-reported step win is corroborated by the unbiased runtime count.',
      }
    } catch { /* reps8 optional */ }
  }

  return {
    source: { journal: journalPath, runId: journal.runId || basename(journalPath, '.json'), transcriptDir, agentCount: armEvents.length, model, totalTokensJournal: journal.totalTokens ?? null, durationMsJournal: journal.durationMs ?? null },
    note: 'Runtime-measured efficiency for the engine-frozen reps run — the axis reps8.json omitted. Paired delta = treatment(codeweb) - control(grep); NEGATIVE = codeweb cheaper (win). Tokens/wallMs from per-agent transcripts; toolCalls from the journal. wallMs is concurrency-sensitive (agents ran under a shared cap) — tokens + toolCalls are the contention-free signals.',
    config: { tasks, repos: [...new Set(tasks.map((t) => t.split('-')[0]))], reps: reps.length, frozenTruth: true, frontierBaseModel: true, model },
    headline: agg.headline,
    interpretation,
    stepCheck,
    perTaskAgg: agg.perTaskAgg,
    perRepMeanDelta: agg.perRepMeanDelta,
    means: agg.means,
    perAgent: rows,
    integrity: {
      agentsExpected: armEvents.length,
      agentsJoined: rows.length,
      missingTranscripts,
      unparsedLabels,
      allDone: armEvents.every((e) => e.state === 'done'),
      model,
    },
  }
}

function main() {
  const journalPath = argVal('--journal') || DEFAULT_JOURNAL
  const transcriptDir = argVal('--transcripts') || transcriptDirFor(journalPath)
  const outPath = argVal('--out') || join(HERE, 'efficiency-pilot.usage.json')
  if (!existsSync(journalPath)) {
    console.error(`journal not found: ${journalPath}\nPass --journal <path/to/wf_*.json>.`)
    process.exit(1)
  }
  const report = buildReport(journalPath, transcriptDir)
  writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n')

  if (!process.argv.includes('--json')) {
    const h = report.headline
    const fmt = (s) => `${s.mean}${s.sd != null ? ` +/- ${s.sd}` : ''} (n=${s.n})`
    console.log(`efficiency usage — ${report.source.runId} · ${report.integrity.agentsJoined}/${report.integrity.agentsExpected} agents joined · model ${report.source.model}`)
    console.log(`  paired delta (treatment - control; NEGATIVE = codeweb cheaper):`)
    console.log(`    outputTokens : ${fmt(h.pairedDeltaOutputTokens)}`)
    console.log(`    totalTokens  : ${fmt(h.pairedDeltaTotalTokens)}`)
    console.log(`    toolCalls    : ${fmt(h.pairedDeltaToolCalls)}   (runtime; reps8 self-reported steps ${report.stepCheck?.selfReportedStepDelta?.mean ?? 'n/a'})`)
    console.log(`    wallMs       : ${fmt(h.pairedDeltaWallMs)}   (concurrency-sensitive)`)
    console.log(`  means: control output ${report.means.control.outputTokens} / treatment ${report.means.treatment.outputTokens} tokens`)
    if (report.integrity.missingTranscripts.length) console.log(`  WARN missing transcripts: ${report.integrity.missingTranscripts.length}`)
    console.log(`  -> ${outPath}`)
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
