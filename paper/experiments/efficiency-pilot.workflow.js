// Efficiency pilot — does codeweb help a FRONTIER agent on HIGH-BLAST-RADIUS discovery?
//
// The H18 agent A/B was a null because (a) tasks were easy (floor effect) and (b) efficiency
// (tokens/steps) was never measured. This pilot isolates the MECHANISM the efficiency thesis rests
// on — pre-edit discovery ("find the complete set of callers I must update") — on deliberately
// high-fan-out targets where manual grep is error-prone, and measures BOTH axes:
//   - effectiveness: recall / precision of the discovered caller set vs a reconciled ground truth
//   - efficiency:    number of shell/read steps to reach that answer
// Read-only (no edits) -> no worktrees, deterministic grading, cheap. Frontier base model (agents
// inherit the main-loop model). A positive signal greenlights the full end-to-end study (Theme 5b);
// a flat result is an honest finding about where the tool does and doesn't pay off.
//
// Launch:  Workflow({scriptPath: ".../efficiency-pilot.workflow.js"})
//          Workflow({scriptPath: "...", args: {tasks: [ ...override ]}})
// Lever #1 (engine-frozen reps for a defensible claim) — read efficiency-pilot.truth.json and pass it
// in (the workflow sandbox has no fs), then ask for N reps:
//          Workflow({scriptPath: "...", args: {truth: <parsed truth.json>, reps: 5}})
//   - args.truth present  -> SKIP the per-run oracle (4 fewer agents/rep); grade vs the frozen set.
//   - args.reps = N       -> N engine-frozen reps; returns headline = mean +/- SD of the per-rep
//                            paired delta (treatment - control) for recall / precision / steps.
//   The paired delta cancels the per-run shared truth; steps are oracle-free. A real engine win is a
//   delta-shift exceeding the frozen-engine SD reported here.

export const meta = {
  name: 'codeweb-efficiency-pilot',
  description: 'Pilot: does codeweb improve a frontier agent on high-fan-out caller-discovery — recall (effectiveness) + steps (efficiency) vs grep-only. Supports frozen truth (args.truth) + engine-frozen reps (args.reps) for a paired-delta noise floor.',
  phases: [
    { title: 'Oracle', detail: 'per task: reconcile codeweb + independent grep into a confirmed ground-truth caller set (SKIPPED when args.truth is supplied)' },
    { title: 'Discover', detail: 'control (grep only) vs treatment (codeweb) each find the caller set; graded on recall + steps; paired delta per rep' },
  ],
}

const ROOT = 'D:/GitHub Projects/ecc-test/codeweb'
const GRAPHS = `${ROOT}/.codeweb/pilot` // pre-built graphs (steady-state: codeweb already set up)

// High-fan-out targets chosen from the actual graphs (incoming call/import degree). These are the
// cases where a refactor must touch many sites and manual grep is most likely to miss one.
const TASKS = (args && args.tasks) || [
  { id: 'axios-merge', repo: 'axios', symbol: 'merge', symbolId: 'lib/utils.js:merge', file: 'lib/utils.js', kind: 'function', note: 'core util, very common name -> grep-hostile (27 callers in-graph)' },
  { id: 'axios-AxiosError', repo: 'axios', symbol: 'AxiosError', symbolId: 'lib/core/AxiosError.js:AxiosError', file: 'lib/core/AxiosError.js', kind: 'class', note: 'distinctive name -> grep-friendlier (16 in-graph)' },
  { id: 'axios-AxiosHeaders', repo: 'axios', symbol: 'AxiosHeaders', symbolId: 'lib/core/AxiosHeaders.js:AxiosHeaders', file: 'lib/core/AxiosHeaders.js', kind: 'class', note: 'class usage sites (11 in-graph)' },
  { id: 'flask-render_template', repo: 'flask', symbol: 'render_template', symbolId: 'src/flask/templating.py:render_template', file: 'src/flask/templating.py', kind: 'function', note: 'python cross-module (9 in-graph)' },
]

const graphOf = (t) => `${GRAPHS}/${t.repo}/graph.json`
const corpusOf = (t) => `${ROOT}/paper/corpus/${t.repo}`

// ---- schemas ----------------------------------------------------------------------------------
const ID_FMT = 'each caller as `<relative-file-path>:<enclosing-symbol-name>` (e.g. `lib/core/Axios.js:request`); use `<file>:<module>` for a top-level/module-scope reference'

const ORACLE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['taskId', 'confirmedTruth', 'codewebCallers', 'manualCallers', 'discrepancies'],
  properties: {
    taskId: { type: 'string' },
    confirmedTruth: { type: 'array', items: { type: 'string' }, description: `the reconciled, hand-confirmed set of REAL caller symbols; ${ID_FMT}` },
    codewebCallers: { type: 'array', items: { type: 'string' }, description: 'raw set codeweb query --callers/--impact returned' },
    manualCallers: { type: 'array', items: { type: 'string' }, description: 'raw set found by exhaustive grep+read WITHOUT codeweb' },
    discrepancies: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['site', 'verdict'],
        properties: { site: { type: 'string' }, verdict: { type: 'string', enum: ['agree-real', 'codeweb-missed-real', 'manual-missed-codeweb-caught', 'codeweb-false-positive', 'manual-false-positive', 'not-a-real-reference'] }, note: { type: 'string' } },
      },
    },
    notes: { type: 'string' },
  },
}

const ARM_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['taskId', 'condition', 'foundCallers', 'commands', 'stepCount', 'usedCodeweb'],
  properties: {
    taskId: { type: 'string' },
    condition: { type: 'string', enum: ['control', 'treatment'] },
    foundCallers: { type: 'array', items: { type: 'string' }, description: `the caller set you found; ${ID_FMT}` },
    commands: { type: 'array', items: { type: 'string' }, description: 'the EXACT ordered list of shell/search/read actions you took (one per entry), verbatim' },
    stepCount: { type: 'integer', description: 'number of entries in commands (your real cost to reach the answer)' },
    usedCodeweb: { type: 'boolean' },
    confidence: { type: 'string', description: 'how sure are you the set is complete, and why you stopped' },
  },
}

// ---- prompts ----------------------------------------------------------------------------------
const COMMON = `codeweb root: ${ROOT}. Node is on PATH; use the Bash tool with forward-slash paths. Corpus repos are pinned read-only clones. This is a READ-ONLY task: do NOT edit any file.`

const oraclePrompt = (t) => `${COMMON}

You are the ORACLE establishing GROUND TRUTH for a fairness-critical benchmark. Target symbol: **${t.symbol}** (${t.kind}), defined in ${t.repo} at \`${t.file}\` (codeweb id \`${t.symbolId}\`). Repo root: ${corpusOf(t)}.

Goal: the COMPLETE, hand-confirmed set of caller symbols that reference this target (functions/methods/modules that call it, import it, instantiate it, or otherwise depend on it). Establish it TWO independent ways, then reconcile — unlimited effort:

(A) codeweb: \`node ${ROOT}/scripts/query.mjs ${graphOf(t)} --callers ${t.symbolId} --json\` (also try \`--impact ${t.symbolId} --json\`). Record exactly what it returns.
(B) INDEPENDENTLY of codeweb: exhaustively grep ${corpusOf(t)} for references to the symbol (its name, import paths, aliases/re-exports) and READ each hit to confirm it is a real reference to THIS symbol — not a same-named different thing. Record what you find.

RECONCILE: for every site in one set but not the other, open the code and decide the truth. Label each discrepancy: agree-real | codeweb-missed-real (a REAL caller that codeweb's output omitted) | manual-missed-codeweb-caught (a REAL caller only codeweb found) | codeweb-false-positive | manual-false-positive | not-a-real-reference. Then emit confirmedTruth = the reconciled set of REAL callers only.

Report ${ID_FMT}. Return confirmedTruth, codewebCallers (raw), manualCallers (raw), discrepancies (with verdicts), and notes. Be rigorous — control and treatment are graded against your confirmedTruth.`

const controlPrompt = (t) => `${COMMON}

TASK: find ALL caller symbols that reference **${t.symbol}** (${t.kind}) — defined in ${t.repo} at \`${t.file}\` — i.e. every function/method/module you would have to update if you changed it. Repo root: ${corpusOf(t)}.

CONDITION: CONTROL. You have NO special tooling. Use ONLY the Bash tool (grep/rg/sed/cat) and Read on the source. You may NOT run codeweb (do not run query.mjs / run.mjs / find-similar.mjs, and do not read any graph.json or the .codeweb/ dir). Work the way you realistically would on a real refactor: be thorough, but this is normal dev work, not an infinite audit — stop when you are reasonably confident you have them all.

Report ${ID_FMT}. CRITICAL: log every action you take in \`commands\` (one verbatim entry per shell command or file read, in order) and set stepCount to that count — this is the measured cost. Set usedCodeweb=false. Return foundCallers, commands, stepCount, usedCodeweb, confidence.`

const treatmentPrompt = (t) => `${COMMON}

TASK: find ALL caller symbols that reference **${t.symbol}** (${t.kind}) — defined in ${t.repo} at \`${t.file}\` — i.e. every function/method/module you would have to update if you changed it.

CONDITION: TREATMENT. codeweb is already set up; the graph for ${t.repo} is at \`${graphOf(t)}\`. Use it — that is your advantage. The unified query returns EVERY dependent (call ∪ import ∪ inherit ∪ test) in ONE shot, with a byKind breakdown:
  node ${ROOT}/scripts/query.mjs ${graphOf(t)} --dependents ${t.symbolId} --json
Also available: --callers (call-only, highest precision), --tests, --impact (transitive blast radius). Lean on the tool; triage/verify with the source as much as you judge necessary (e.g. a barrel-import dependent may be a file-level edge worth confirming).

Report ${ID_FMT} (query --callers already returns this format). Log every action in \`commands\` (one verbatim entry each, in order), set stepCount accordingly, usedCodeweb=true. Return foundCallers, commands, stepCount, usedCodeweb, confidence.`

// ---- grading (pure JS) ------------------------------------------------------------------------
const norm = (s) => String(s).trim().toLowerCase().replace(/\\/g, '/').replace(/^\.\//, '')
const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100)
const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000)
const nums = (xs) => xs.filter((x) => typeof x === 'number')
const avg = (xs) => { const v = nums(xs); return v.length ? r2(v.reduce((a, b) => a + b, 0) / v.length) : null }
const mean_ = (xs) => { const v = nums(xs); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }
// sample SD (n-1); null for n<2. The point of engine-frozen reps is to estimate this spread.
const sd_ = (xs) => { const v = nums(xs); if (v.length < 2) return null; const m = mean_(v); return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)) }
const stat = (xs) => ({ mean: r3(mean_(xs)), sd: r3(sd_(xs)), n: nums(xs).length })

function score(found, truth) {
  const T = new Set((truth || []).map(norm))
  const F = new Set((found || []).map(norm))
  let tp = 0
  for (const f of F) if (T.has(f)) tp++
  return {
    truthN: T.size, foundN: F.size, truePositives: tp,
    recall: r2(T.size ? tp / T.size : null),
    precision: r2(F.size ? tp / F.size : null),
    missed: [...T].filter((x) => !F.has(x)),
    extra: [...F].filter((x) => !T.has(x)),
  }
}

// ---- frozen truth + reps ----------------------------------------------------------------------
// FROZEN TRUTH (lever #1): pass a hand-verified, committed truth set via args.truth to remove the
// per-run oracle re-reconciliation that made cross-run absolutes incomparable (grep recall swung
// 0.79->0.50 between runs). When frozen truth is present we SKIP the oracle agent entirely (4 fewer
// agents/rep) and grade both arms against the stable set. args.truth may be the truth-file object
// ({ targets: { <taskId>: { truth: [...] } } }) or a plain { <taskId>: [...] } map. The workflow
// sandbox has no fs, so the CALLER reads efficiency-pilot.truth.json and passes it in as args.truth.
const TRUTH = (args && args.truth) || null
const truthFor = (taskId) => {
  if (!TRUTH) return null
  const node = (TRUTH.targets && TRUTH.targets[taskId]) || TRUTH[taskId]
  if (!node) return null
  return Array.isArray(node) ? node : (Array.isArray(node.truth) ? node.truth : null)
}
// REPS (lever #1): run R engine-frozen reps to estimate the noise floor of the agent-driven measure.
// Report mean(paired delta) +/- SD(paired delta); a real engine win is a delta-shift exceeding SD.
const REPS = Math.max(1, Math.floor((args && args.reps) || 1))

const oracleSummary = (oracle) => ({
  confirmedTruth: oracle.confirmedTruth || [],
  codewebN: (oracle.codewebCallers || []).length,
  manualN: (oracle.manualCallers || []).length,
  codewebMissedReal: (oracle.discrepancies || []).filter((d) => d.verdict === 'codeweb-missed-real').length,
  manualMissedCodewebCaught: (oracle.discrepancies || []).filter((d) => d.verdict === 'manual-missed-codeweb-caught').length,
  codewebFalsePositives: (oracle.discrepancies || []).filter((d) => d.verdict === 'codeweb-false-positive').length,
  discrepancies: oracle.discrepancies || [],
})

// One task within one rep: optional oracle (skipped if frozen) + control + treatment, scored + paired delta.
async function runTask(t, rep) {
  const frozen = truthFor(t.id)
  const tag = REPS > 1 ? `#${rep}` : ''
  const armThunks = [
    () => agent(controlPrompt(t), { label: `control:${t.id}${tag}`, phase: 'Discover', schema: ARM_SCHEMA, agentType: 'general-purpose' }),
    () => agent(treatmentPrompt(t), { label: `treat:${t.id}${tag}`, phase: 'Discover', schema: ARM_SCHEMA, agentType: 'general-purpose' }),
  ]
  const oracleThunk = frozen ? null : () => agent(oraclePrompt(t), { label: `oracle:${t.id}${tag}`, phase: 'Oracle', schema: ORACLE_SCHEMA, agentType: 'general-purpose' })
  const res = await parallel(oracleThunk ? [oracleThunk, ...armThunks] : armThunks)
  const [oracle, control, treatment] = oracleThunk ? res : [null, ...res]
  if (!frozen && !oracle) return { task: t.id, repo: t.repo, symbol: t.symbol, rep, error: 'no-oracle' }
  const truth = frozen || (oracle && oracle.confirmedTruth) || []
  const cs = control ? score(control.foundCallers, truth) : null
  const ts = treatment ? score(treatment.foundCallers, truth) : null
  // PAIRED delta (treatment - control): cancels the per-rep shared truth, so it is far more stable
  // across reps than either absolute. Steps delta is oracle-independent (a count of agent actions).
  const delta = (cs && ts) ? {
    recall: (cs.recall != null && ts.recall != null) ? r2(ts.recall - cs.recall) : null,
    precision: (cs.precision != null && ts.precision != null) ? r2(ts.precision - cs.precision) : null,
    steps: (control.stepCount != null && treatment.stepCount != null) ? treatment.stepCount - control.stepCount : null,
  } : null
  return {
    task: t.id, repo: t.repo, symbol: t.symbol, kind: t.kind, note: t.note, rep,
    truthN: truth.length, frozenTruth: !!frozen,
    oracle: frozen ? { frozen: true } : (oracle ? oracleSummary(oracle) : null),
    control: control ? { ...cs, steps: control.stepCount, usedCodeweb: control.usedCodeweb, foundCallers: control.foundCallers, commands: control.commands } : null,
    treatment: treatment ? { ...ts, steps: treatment.stepCount, usedCodeweb: treatment.usedCodeweb, foundCallers: treatment.foundCallers, commands: treatment.commands } : null,
    delta,
  }
}

// ---- run --------------------------------------------------------------------------------------
if (!TRUTH) phase('Oracle')
log(`efficiency pilot: ${TASKS.length} targets x ${REPS} rep(s) · control(grep) vs treatment(codeweb) · ${TRUTH ? 'FROZEN truth (oracle skipped)' : 'per-run oracle'} · graded on recall + steps`)

// reps x tasks; reps run concurrently (the workflow's own concurrency cap pipelines the agents).
const repResults = await parallel(
  Array.from({ length: REPS }, (_, r) => () => parallel(TASKS.map((t) => () => runTask(t, r + 1)))),
)
const allRows = repResults.flat().filter(Boolean)
const ok = allRows.filter((o) => o && !o.error && o.control && o.treatment)

// per-arm absolute means (context only — NOT comparable across runs when truth re-reconciles)
const means = {
  control: { recall: avg(ok.map((o) => o.control.recall)), precision: avg(ok.map((o) => o.control.precision)), steps: avg(ok.map((o) => o.control.steps)) },
  treatment: { recall: avg(ok.map((o) => o.treatment.recall)), precision: avg(ok.map((o) => o.treatment.precision)), steps: avg(ok.map((o) => o.treatment.steps)) },
}

// per-task aggregate across reps: arm absolutes + paired delta, each as mean +/- SD
const perTaskAgg = TASKS.map((t) => {
  const rows = ok.filter((o) => o.task === t.id)
  if (!rows.length) return { task: t.id, repo: t.repo, symbol: t.symbol, reps: 0, error: 'no-graded-reps' }
  return {
    task: t.id, repo: t.repo, symbol: t.symbol, kind: t.kind, truthN: rows[0].truthN, reps: rows.length,
    control: { recall: stat(rows.map((r) => r.control.recall)), precision: stat(rows.map((r) => r.control.precision)), steps: stat(rows.map((r) => r.control.steps)) },
    treatment: { recall: stat(rows.map((r) => r.treatment.recall)), precision: stat(rows.map((r) => r.treatment.precision)), steps: stat(rows.map((r) => r.treatment.steps)) },
    delta: { recall: stat(rows.map((r) => r.delta.recall)), precision: stat(rows.map((r) => r.delta.precision)), steps: stat(rows.map((r) => r.delta.steps)) },
  }
})

// per-rep mean-over-tasks paired delta -> R numbers whose mean +/- SD IS the noise-floor headline
const perRepMeanDelta = Array.from({ length: REPS }, (_, r) => {
  const rows = ok.filter((o) => o.rep === r + 1)
  return {
    rep: r + 1, tasksGraded: rows.length,
    deltaRecall: avg(rows.map((o) => o.delta.recall)),
    deltaPrecision: avg(rows.map((o) => o.delta.precision)),
    deltaSteps: avg(rows.map((o) => o.delta.steps)),
    controlRecall: avg(rows.map((o) => o.control.recall)),
    treatmentRecall: avg(rows.map((o) => o.treatment.recall)),
  }
})
const headline = {
  reps: REPS,
  pairedDeltaRecall: stat(perRepMeanDelta.map((x) => x.deltaRecall)),
  pairedDeltaPrecision: stat(perRepMeanDelta.map((x) => x.deltaPrecision)),
  pairedDeltaSteps: stat(perRepMeanDelta.map((x) => x.deltaSteps)),
}

// validity: did control honor the no-codeweb rule, and did treatment actually use codeweb?
const integrity = {
  controlUsedCodewebViolations: [...new Set(ok.filter((o) => o.control.usedCodeweb).map((o) => `${o.task}#${o.rep}`))],
  treatmentSkippedCodeweb: [...new Set(ok.filter((o) => !o.treatment.usedCodeweb).map((o) => `${o.task}#${o.rep}`))],
}

const hl = headline.pairedDeltaRecall
log(`graded ${ok.length}/${TASKS.length * REPS} task-reps · paired delta recall ${hl.mean ?? 'n/a'}${hl.sd != null ? ` +/- ${hl.sd}` : ''} · paired delta steps ${headline.pairedDeltaSteps.mean ?? 'n/a'}${headline.pairedDeltaSteps.sd != null ? ` +/- ${headline.pairedDeltaSteps.sd}` : ''}`)

return {
  config: { tasks: TASKS.map((t) => t.id), repos: [...new Set(TASKS.map((t) => t.repo))], reps: REPS, frozenTruth: !!TRUTH, frontierBaseModel: true },
  headline, perTaskAgg, perRepMeanDelta, means, integrity,
  perRep: repResults,
}
