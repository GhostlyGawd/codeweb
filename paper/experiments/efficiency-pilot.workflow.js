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

export const meta = {
  name: 'codeweb-efficiency-pilot',
  description: 'Pilot: does codeweb improve a frontier agent on high-fan-out caller-discovery — recall (effectiveness) + steps (efficiency) vs grep-only',
  phases: [
    { title: 'Oracle', detail: 'per task: reconcile codeweb + independent grep into a confirmed ground-truth caller set' },
    { title: 'Discover', detail: 'control (grep only) vs treatment (codeweb) each find the caller set; graded on recall + steps' },
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
const avg = (xs) => { const v = xs.filter((x) => typeof x === 'number'); return v.length ? r2(v.reduce((a, b) => a + b, 0) / v.length) : null }

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

// ---- run --------------------------------------------------------------------------------------
phase('Oracle')
log(`efficiency pilot: ${TASKS.length} high-fan-out targets · control(grep) vs treatment(codeweb) · graded on recall + steps`)

const perTask = await parallel(TASKS.map((t) => async () => {
  const [oracle, control, treatment] = await parallel([
    () => agent(oraclePrompt(t), { label: `oracle:${t.id}`, phase: 'Oracle', schema: ORACLE_SCHEMA, agentType: 'general-purpose' }),
    () => agent(controlPrompt(t), { label: `control:${t.id}`, phase: 'Discover', schema: ARM_SCHEMA, agentType: 'general-purpose' }),
    () => agent(treatmentPrompt(t), { label: `treat:${t.id}`, phase: 'Discover', schema: ARM_SCHEMA, agentType: 'general-purpose' }),
  ])
  if (!oracle) return { task: t.id, repo: t.repo, symbol: t.symbol, error: 'no-oracle' }
  const truth = oracle.confirmedTruth || []
  return {
    task: t.id, repo: t.repo, symbol: t.symbol, kind: t.kind, note: t.note,
    truthN: truth.length,
    oracle: {
      confirmedTruth: truth,
      codewebN: (oracle.codewebCallers || []).length,
      manualN: (oracle.manualCallers || []).length,
      codewebMissedReal: (oracle.discrepancies || []).filter((d) => d.verdict === 'codeweb-missed-real').length,
      manualMissedCodewebCaught: (oracle.discrepancies || []).filter((d) => d.verdict === 'manual-missed-codeweb-caught').length,
      codewebFalsePositives: (oracle.discrepancies || []).filter((d) => d.verdict === 'codeweb-false-positive').length,
      discrepancies: oracle.discrepancies || [],
    },
    control: control ? { ...score(control.foundCallers, truth), steps: control.stepCount, usedCodeweb: control.usedCodeweb, commands: control.commands } : null,
    treatment: treatment ? { ...score(treatment.foundCallers, truth), steps: treatment.stepCount, usedCodeweb: treatment.usedCodeweb, commands: treatment.commands } : null,
  }
}))

const ok = perTask.filter((o) => o && !o.error && o.control && o.treatment)
const means = {
  control: { recall: avg(ok.map((o) => o.control.recall)), precision: avg(ok.map((o) => o.control.precision)), steps: avg(ok.map((o) => o.control.steps)) },
  treatment: { recall: avg(ok.map((o) => o.treatment.recall)), precision: avg(ok.map((o) => o.treatment.precision)), steps: avg(ok.map((o) => o.treatment.steps)) },
}
// validity: did control honor the no-codeweb rule, and did treatment actually use codeweb?
const integrity = {
  controlUsedCodewebViolations: ok.filter((o) => o.control.usedCodeweb).map((o) => o.task),
  treatmentSkippedCodeweb: ok.filter((o) => !o.treatment.usedCodeweb).map((o) => o.task),
}

log(`graded ${ok.length}/${TASKS.length} tasks · control recall ${means.control.recall} @ ${means.control.steps} steps · treatment recall ${means.treatment.recall} @ ${means.treatment.steps} steps`)

return { config: { tasks: TASKS.map((t) => t.id), repos: [...new Set(TASKS.map((t) => t.repo))], frontierBaseModel: true }, means, integrity, perTask }
