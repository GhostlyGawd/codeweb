#!/usr/bin/env node
// Regrade committed efficiency-pilot runs against the FROZEN, hand-verified truth set (lever #1).
//
// Why: the original runs each graded against a fresh per-run oracle, so absolute recall/precision are
// NOT comparable across runs (the oracle re-reconciled truth every time; grep recall swung 0.79->0.50).
// This rescoring holds truth constant so run3 and run4 become directly comparable, and computes the
// PAIRED delta (treatment - control), which is the stable, defensible quantity.
//
// It needs NO agents: each arm's found-set is reconstructed exactly from what the run JSON stored.
// score() records, in normalized space, T = norm(oracleTruth), missed = T\F, extra = F\T. Therefore
// F = (T \ missed) U extra recovers the arm's found-set with zero loss (verified: foundN matches).
//
// Usage:  node paper/experiments/efficiency-pilot.regrade.mjs
//         node paper/experiments/efficiency-pilot.regrade.mjs --json   (machine-readable only)
// Writes: paper/experiments/efficiency-pilot.regrade.json

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const TRUTH_PATH = join(HERE, 'efficiency-pilot.truth.json')
const RUNS = [
  { tag: 'run3', path: join(HERE, 'efficiency-pilot.run3.json') },
  { tag: 'run4', path: join(HERE, 'efficiency-pilot.run4.json') },
]
const OUT_PATH = join(HERE, 'efficiency-pilot.regrade.json')
const JSON_ONLY = process.argv.includes('--json')

// ---- normalization + scoring (mirrors the harness exactly) ------------------------------------
const norm = (s) => String(s).trim().toLowerCase().replace(/\\/g, '/').replace(/^\.\//, '')
const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100)
const fileOf = (id) => norm(id).split(':')[0] // collapse `<file>:<sym>` -> `<file>` for file-level grading
const nums = (xs) => xs.filter((x) => typeof x === 'number')
const avg = (xs) => { const v = nums(xs); return v.length ? r2(v.reduce((a, b) => a + b, 0) / v.length) : null }

function score(foundSet, truthSet) {
  const T = truthSet, F = foundSet
  let tp = 0
  for (const f of F) if (T.has(f)) tp++
  return {
    truthN: T.size, foundN: F.size, tp,
    recall: r2(T.size ? tp / T.size : null),
    precision: r2(F.size ? tp / F.size : null),
  }
}

// Reconstruct an arm's normalized found-set from the stored (oracleTruth, missed, extra).
function reconstructFound(arm, oldOracleTruth) {
  const T = new Set((oldOracleTruth || []).map(norm))
  const missed = new Set((arm.missed || []).map(norm))
  const extra = (arm.extra || []).map(norm)
  return new Set([...[...T].filter((x) => !missed.has(x)), ...extra])
}

// ---- load frozen truth ------------------------------------------------------------------------
const truthDoc = JSON.parse(readFileSync(TRUTH_PATH, 'utf8'))
const truthTargets = truthDoc.targets || {}

// The set of files each repo's graph actually indexed — lets us partition truth into "in codeweb's
// indexed scope" (isolates discovery quality) vs full-repo (includes coverage gaps like unindexed
// .ts/smoke fixtures and the dropped merge.test.js).
function graphFiles(repo) {
  try {
    const g = JSON.parse(readFileSync(join(HERE, '..', '..', '.codeweb', 'pilot', repo, 'graph.json'), 'utf8'))
    const syms = g.symbols || g.nodes || []
    const arr = Array.isArray(syms) ? syms : Object.values(syms)
    return new Set(arr.map((s) => s.file || s.path || (s.id && String(s.id).split(':')[0])).filter(Boolean).map(norm))
  } catch { return null }
}
const graphFilesByRepo = {}

// Truth views per target: symbol-level (all refs), symbol-level (external = drop def-file self-refs),
// file-level (collapsed to files), and the same intersected with the graph's indexed file set.
function truthViews(taskId) {
  const node = truthTargets[taskId]
  if (!node || !Array.isArray(node.truth)) return null
  const defFile = norm(node.file || '')
  const all = node.truth.map(norm)
  const external = all.filter((id) => id.split(':')[0] !== defFile)
  const allFiles = [...new Set(all.map(fileOf))]
  if (!(node.repo in graphFilesByRepo)) graphFilesByRepo[node.repo] = graphFiles(node.repo)
  const indexed = graphFilesByRepo[node.repo]
  const inScope = (id) => !indexed || indexed.has(fileOf(id))
  return {
    symbolAll: new Set(all),
    symbolExternal: new Set(external),
    symbolIndexed: new Set(all.filter(inScope)),
    fileAll: new Set(allFiles),
    fileIndexed: new Set(allFiles.filter((f) => !indexed || indexed.has(f))),
  }
}

// ---- regrade each run -------------------------------------------------------------------------
const report = { generatedFrom: 'efficiency-pilot.truth.json', truthVersion: truthDoc.version || null, runs: {} }

for (const run of RUNS) {
  let doc
  try { doc = JSON.parse(readFileSync(run.path, 'utf8')) } catch { continue }
  const perTask = doc.perTask || []
  const rows = []
  for (const t of perTask) {
    if (!t || t.error || !t.control || !t.treatment) continue
    const views = truthViews(t.task)
    if (!views) { rows.push({ task: t.task, error: 'no-frozen-truth-for-task' }); continue }
    const oldTruth = (t.oracle && t.oracle.confirmedTruth) || []
    const cFound = reconstructFound(t.control, oldTruth)
    const tFound = reconstructFound(t.treatment, oldTruth)
    const cFileFound = new Set([...cFound].map(fileOf))
    const tFileFound = new Set([...tFound].map(fileOf))

    const grade = (cf, tf, view) => {
      const c = score(cf, view), tr = score(tf, view)
      return {
        control: { recall: c.recall, precision: c.precision },
        treatment: { recall: tr.recall, precision: tr.precision },
        deltaRecall: (c.recall != null && tr.recall != null) ? r2(tr.recall - c.recall) : null,
        deltaPrecision: (c.precision != null && tr.precision != null) ? r2(tr.precision - c.precision) : null,
      }
    }

    rows.push({
      task: t.task, repo: t.repo, symbol: t.symbol,
      oldTruthN: oldTruth.length,
      frozenTruthN: views.symbolAll.size,
      frozenExternalN: views.symbolExternal.size,
      steps: { control: t.control.steps, treatment: t.treatment.steps, delta: (typeof t.control.steps === 'number' && typeof t.treatment.steps === 'number') ? t.treatment.steps - t.control.steps : null },
      // original recall/precision (vs the per-run oracle) for reference
      original: {
        control: { recall: t.control.recall, precision: t.control.precision },
        treatment: { recall: t.treatment.recall, precision: t.treatment.precision },
        deltaRecall: (t.control.recall != null && t.treatment.recall != null) ? r2(t.treatment.recall - t.control.recall) : null,
      },
      symbolAll: grade(cFound, tFound, views.symbolAll),
      symbolExternal: grade(cFound, tFound, views.symbolExternal),
      symbolIndexed: grade(cFound, tFound, views.symbolIndexed),
      fileAll: grade(cFileFound, tFileFound, views.fileAll),
      fileIndexed: grade(cFileFound, tFileFound, views.fileIndexed),
    })
  }

  const graded = rows.filter((r) => !r.error)
  const meanBlock = (pick) => ({
    control: { recall: avg(graded.map((r) => pick(r).control.recall)), precision: avg(graded.map((r) => pick(r).control.precision)) },
    treatment: { recall: avg(graded.map((r) => pick(r).treatment.recall)), precision: avg(graded.map((r) => pick(r).treatment.precision)) },
    deltaRecall: avg(graded.map((r) => pick(r).deltaRecall)),
    deltaPrecision: avg(graded.map((r) => pick(r).deltaPrecision)),
  })
  report.runs[run.tag] = {
    tasksGraded: graded.length,
    means: {
      steps: { control: avg(graded.map((r) => r.steps.control)), treatment: avg(graded.map((r) => r.steps.treatment)), delta: avg(graded.map((r) => r.steps.delta)) },
      original: { deltaRecall: avg(graded.map((r) => r.original.deltaRecall)) },
      symbolAll: meanBlock((r) => r.symbolAll),
      symbolExternal: meanBlock((r) => r.symbolExternal),
      symbolIndexed: meanBlock((r) => r.symbolIndexed),
      fileAll: meanBlock((r) => r.fileAll),
      fileIndexed: meanBlock((r) => r.fileIndexed),
    },
    perTask: rows,
  }
}

writeFileSync(OUT_PATH, JSON.stringify(report, null, 2))

if (JSON_ONLY) { console.log(JSON.stringify(report, null, 2)); process.exit(0) }

// ---- human-readable summary -------------------------------------------------------------------
const f = (x) => (x == null ? ' n/a ' : (x >= 0 ? '+' : '') + x.toFixed(2))
const p = (x) => (x == null ? 'n/a' : x.toFixed(2))
console.log(`\nRegrade vs FROZEN truth (${TRUTH_PATH.split(/[\\/]/).pop()}, v${report.truthVersion})`)
console.log('Paired delta = treatment(codeweb) - control(grep). Positive = codeweb better.\n')
const line = (label, b, withP) => console.log(`  ${label.padEnd(30)}` +
  `control R=${p(b.control.recall)}${withP ? ` P=${p(b.control.precision)}` : ''} | ` +
  `treatment R=${p(b.treatment.recall)}${withP ? ` P=${p(b.treatment.precision)}` : ''} | ` +
  `ΔR=${f(b.deltaRecall)}${withP ? ` ΔP=${f(b.deltaPrecision)}` : ''}`)
for (const [tag, r] of Object.entries(report.runs)) {
  console.log(`=== ${tag} (${r.tasksGraded} tasks) ===`)
  console.log('  -- PRIMARY (robust to attribution convention) --')
  line('file-level, indexed scope:', r.means.fileIndexed, true)
  line('file-level, full repo:', r.means.fileAll, true)
  console.log(`  steps:                        control=${p(r.means.steps.control)} treatment=${p(r.means.steps.treatment)} Δ=${f(r.means.steps.delta)} (negative = fewer = better)`)
  console.log('  -- SECONDARY (symbol-level; attribution-noisy, see truth.json gradingPolicy) --')
  line('symbol-level, indexed scope:', r.means.symbolIndexed, false)
  line('symbol-level, full repo:', r.means.symbolAll, false)
  line('symbol-level, external only:', r.means.symbolExternal, false)
  console.log('')
}
console.log(`Full per-task detail -> ${OUT_PATH.split(/[\\/]/).pop()}`)
