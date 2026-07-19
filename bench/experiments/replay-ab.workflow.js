// replay-ab — the funded A/B over MINED ground truth (see replay-mine.mjs): each task is a real
// historical commit that changed a depended-on function and — per the repo's own history — missed
// caller files a later commit had to fix. The agent replays the change at the parent revision;
// the answer key is what history says needed updating. No proposer bias, no floor effect.
//
//   control   — apply the change, no tooling.
//   treatment — AMBIENT codeweb (brief + explain cards with reliance/caveats), mirroring hooks.
//
// BLIND GRADING (v2 — the v1 pilot leaked): the solver NEVER sees the answer key. It works in a
// history-free export of the base revision (git archive -> fresh single-commit repo, so the
// follow-up fix that defines the key does not exist anywhere it can look), reports only the file
// list it changed plus the deterministic diff.mjs gate numbers, and THIS SCRIPT computes
// missedCovered = |filesChanged ∩ missedByChange| — a fixed function, per the spec.
//
// Launch (spends real tokens):
//   Workflow({scriptPath: ".../replay-ab.workflow.js", args: {root: "<abs codeweb>", tasksFile: "<abs replay-tasks.json>", smoke: true}})
// Persist the return to bench/results/replay-ab-raw.json; analyze coverage per condition.

export const meta = {
  name: 'codeweb-replay-ab',
  description: 'Replay real historical caller-breakages: does ambient codeweb cover the callers history says were missed?',
  phases: [
    { title: 'Load', detail: 'read + validate the mined ground-truth task file (frozen input, no generation)' },
    { title: 'Solve', detail: 'each (task x condition x rep) blind in a history-free copy at the base revision; coverage graded by the script, not the agent' },
  ],
}

let A = args
if (typeof A === 'string') { try { A = JSON.parse(A) } catch { A = null } } // tolerate stringified args
const ROOT = A && A.root
const TASKS_FILE = A && A.tasksFile
if (!ROOT || !TASKS_FILE) { log('args.root and args.tasksFile are required — aborting'); return { error: 'args.root and args.tasksFile required' } }
const cfg = { reps: (A && A.reps) || 2, smoke: !!(A && A.smoke) }

const TASK = {
  type: 'object', additionalProperties: true,
  required: ['repo', 'baseSha', 'symbol', 'label', 'file', 'missedByChange', 'instruction'],
  properties: {
    repo: { type: 'string' }, baseSha: { type: 'string' }, changeSha: { type: 'string' },
    symbol: { type: 'string' }, label: { type: 'string' }, file: { type: 'string' },
    callerFilesAtBase: { type: 'array', items: { type: 'string' } },
    missedByChange: { type: 'array', items: { type: 'string' } },
    instruction: { type: 'string' },
  },
}
const LOADED = { type: 'object', additionalProperties: false, required: ['tasks'], properties: { tasks: { type: 'array', items: TASK }, note: { type: 'string' } } }
// The solver reports WHAT IT DID (files + deterministic gate numbers) — never coverage of a key
// it must not know exists. additionalProperties stays false so a solver cannot smuggle one in.
const CELL = {
  type: 'object', additionalProperties: false,
  required: ['taskSymbol', 'condition', 'rep', 'completed', 'filesChanged', 'gate', 'approachSummary'],
  properties: {
    taskSymbol: { type: 'string' }, condition: { type: 'string', enum: ['control', 'treatment'] }, rep: { type: 'integer' },
    completed: { type: 'boolean' },
    filesChanged: {
      type: 'array', items: { type: 'string' },
      description: 'repo-relative paths of every tracked file your edit changed (from git status --porcelain in the work repo)',
    },
    gate: {
      type: 'object', additionalProperties: false,
      required: ['structuralRegressions', 'newCycles', 'newDuplication', 'lostCallers'],
      properties: {
        structuralRegressions: { type: 'integer' }, newCycles: { type: 'integer' },
        newDuplication: { type: 'integer' }, lostCallers: { type: 'integer' },
      },
    },
    ambientContextNoted: { type: 'string' },
    approachSummary: { type: 'string' },
  },
}

phase('Load')
const loaded = await agent(
  `Read the JSON file at ${TASKS_FILE} (Read tool). Return its "tasks" array VERBATIM (all fields), plus a one-line note on how many tasks it contains. Do not invent, drop, or reword tasks.`,
  { label: 'load-mined-tasks', phase: 'Load', schema: LOADED, agentType: 'general-purpose' })
let tasks = (loaded && loaded.tasks) || []
if (cfg.smoke) tasks = tasks.slice(0, 1)
if (!tasks.length) { log('no tasks in file — aborting'); return { tasks: [], cells: [] } }
log(`${tasks.length} mined task(s); solving ${tasks.length * 2 * cfg.reps} cells`)

const solvePrompt = (cell) => {
  const t = cell.task
  const treatment = cell.cond === 'treatment'
  return `codeweb root: ${ROOT} (Node on PATH; Bash tool; forward-slash paths).

You are REPLAYING a real historical change. Condition: ${cell.cond.toUpperCase()}. Rep ${cell.rep}.

ISOLATION — build a history-free work repo (an export of one revision, then a fresh git init):
  base=$(mktemp -d) ; work="$base/work" ; mkdir -p "$work"
  git -C "${t.repo}" archive ${t.baseSha} | tar -x -C "$work"
  git -C "$work" init -q && git -C "$work" add -A && git -C "$work" -c user.email=replay@local -c user.name=replay commit -qm base
HARD RULES: after the export, $work is the ONLY code you consult. Do not read "${t.repo}" or any
other checkout again; do not use git history beyond the single "base" commit (none other exists in
$work — that is the point); do not go looking for this experiment's harness, task, or result files.
The instruction below is complete — everything you need is in it plus the work tree itself.

TASK: ${t.instruction}

STEPS:
1. BEFORE graph:  node "${ROOT}/scripts/run.mjs" "$work" --out-dir "$base/cwb"
${treatment ? `2. AMBIENT CONTEXT (what codeweb's hooks inject automatically in real use — REQUIRED here):
   a. node "${ROOT}/scripts/brief.mjs" "$base/cwb/graph.json"
   b. node "${ROOT}/scripts/explain.mjs" "$base/cwb/graph.json" "${t.label}"
   Read the card: blast radius, top callers, what callers RELY ON, any ⚠ caveat. Use it: update
   EVERY caller the card names to stay consistent with the changed signature.` : `2. (No special tooling.) Read the code as a competent developer would.`}
3. Apply the definition change and update the codebase to stay consistent with it.
4. AFTER graph:  node "${ROOT}/scripts/run.mjs" "$work" --out-dir "$base/cwa"
5. GRADE:
   node "${ROOT}/scripts/diff.mjs" "$base/cwb/graph.json" "$base/cwa/graph.json" --json
   And list the files you changed:  git -C "$work" status --porcelain

REPORT (honestly — do not fudge):
- filesChanged: every tracked file path from git status (strip the status letters; paths only)
- gate.structuralRegressions / newCycles / newDuplication / lostCallers from the diff.mjs output
- approachSummary${treatment ? ', ambientContextNoted (what the card told you; "nothing useful" is valid)' : ''}
- completed: false (with what failed) if any step errored — do not invent numbers.`
}

phase('Solve')
const cells = []
for (const t of tasks) for (const cond of ['control', 'treatment']) for (let r = 0; r < cfg.reps; r++) cells.push({ task: t, cond, rep: r })
// SEQUENTIAL on purpose (Spec D, docs/specs/replay-corpus-v3.md): budget.spent() deltas around
// each cell give exact per-cell token cost — the cost-to-coverage secondary metric that
// discriminates even when both arms sit at the coverage ceiling. Parallel cells would interleave
// spends and corrupt the attribution; wall-clock is the price of a clean number.
const results = []
for (const c of cells) {
  const before = budget.spent()
  const r = await agent(solvePrompt(c), { label: `${c.cond}:${c.task.label}#${c.rep}`, phase: 'Solve', schema: CELL, agentType: 'general-purpose' })
  results.push(r ? { ...r, cost: { tokens: Math.max(0, budget.spent() - before) } } : r)
}
// grading — the fixed function the solver never saw: coverage of history's missed-caller files
const cellsOut = results.map((r, i) => {
  const c = cells[i]
  const base = { task: c.task.symbol, condition: c.cond, rep: c.rep, result: r }
  if (!r) return { ...base, died: true }
  const changed = new Set((r.filesChanged || []).map((p) => p.replace(/^\.\//, '').trim()).filter(Boolean))
  const covered = c.task.missedByChange.filter((f) => changed.has(f))
  return { ...base, grading: { missedTotal: c.task.missedByChange.length, missedCovered: covered.length, coveredFiles: covered } }
})
const done = cellsOut.filter((c) => c.result && c.result.completed).length
log(`solved ${done}/${cells.length} cells completed`)
return { design: 'replay of mined historical caller-breakages; blind solve, coverage graded by the workflow from filesChanged ∩ missedByChange', tasks: tasks.map((t) => t.symbol), cells: cellsOut, config: cfg }
