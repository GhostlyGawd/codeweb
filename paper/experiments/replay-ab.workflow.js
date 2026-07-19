// replay-ab — the funded A/B over MINED ground truth (see replay-mine.mjs): each task is a real
// historical commit that changed a depended-on function and — per the repo's own history — missed
// caller files a later commit had to fix. The agent replays the change at the parent revision;
// the answer key is what history says needed updating. No proposer bias, no floor effect.
//
//   control   — apply the change, no tooling.
//   treatment — AMBIENT codeweb (brief + explain cards with reliance/caveats), mirroring hooks.
//
// Grading: (a) coverage of the historically-missed caller files (the ground truth), (b) the
// deterministic diff.mjs gate. Launch (spends real tokens):
//   Workflow({scriptPath: ".../replay-ab.workflow.js", args: {root: "<abs codeweb>", tasksFile: "<abs replay-tasks.json>", smoke: true}})
// Persist the return to paper/results/replay-ab-raw.json; analyze coverage per condition.

export const meta = {
  name: 'codeweb-replay-ab',
  description: 'Replay real historical caller-breakages: does ambient codeweb cover the callers history says were missed?',
  phases: [
    { title: 'Load', detail: 'read + validate the mined ground-truth task file (frozen input, no generation)' },
    { title: 'Solve', detail: 'each (task x condition x rep) at the base revision in an isolated copy; graded on missed-caller coverage + the gate' },
  ],
}

const ROOT = args && args.root
const TASKS_FILE = args && args.tasksFile
if (!ROOT || !TASKS_FILE) { log('args.root and args.tasksFile are required — aborting'); return { error: 'args.root and args.tasksFile required' } }
const cfg = { reps: (args && args.reps) || 2, smoke: !!(args && args.smoke) }

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
const CELL = {
  type: 'object', additionalProperties: false,
  required: ['taskSymbol', 'condition', 'rep', 'completed', 'metrics', 'approachSummary'],
  properties: {
    taskSymbol: { type: 'string' }, condition: { type: 'string', enum: ['control', 'treatment'] }, rep: { type: 'integer' },
    completed: { type: 'boolean' },
    metrics: {
      type: 'object', additionalProperties: false,
      required: ['missedCovered', 'missedTotal', 'structuralRegressions', 'newCycles', 'newDuplication', 'lostCallers'],
      properties: {
        missedCovered: { type: 'integer', description: 'how many of the historically-missed caller files your edit updated' },
        missedTotal: { type: 'integer' },
        structuralRegressions: { type: 'integer' }, newCycles: { type: 'integer' },
        newDuplication: { type: 'integer' }, lostCallers: { type: 'integer' },
      },
    },
    filesChanged: { type: 'array', items: { type: 'string' } },
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

ISOLATION: copy the repo and pin the base revision (never edit the original):
  work=$(mktemp -d)/work ; cp -r "${t.repo}" "$work" ; git -C "$work" checkout --detach ${t.baseSha} ; git -C "$work" clean -fd

TASK: ${t.instruction}

STEPS:
1. BEFORE graph:  node "${ROOT}/scripts/run.mjs" "$work" --out-dir "$work/.cwb"
${treatment ? `2. AMBIENT CONTEXT (what codeweb's hooks inject automatically in real use — REQUIRED here):
   a. node "${ROOT}/scripts/brief.mjs" "$work/.cwb/graph.json"
   b. node "${ROOT}/scripts/explain.mjs" "$work/.cwb/graph.json" "${t.label}"
   Read the card: blast radius, top callers, what callers RELY ON, any ⚠ caveat. Use it: update
   EVERY caller the card names to stay consistent with the changed signature.` : `2. (No special tooling.) Read the code as a competent developer would.`}
3. Apply the definition change and update the codebase to stay consistent with it.
4. AFTER graph:  node "${ROOT}/scripts/run.mjs" "$work" --out-dir "$work/.cwa"
5. GRADE:
   node "${ROOT}/scripts/diff.mjs" "$work/.cwb/graph.json" "$work/.cwa/graph.json" --json
   And list the files you changed:  git -C "$work" status --porcelain

REPORT (honestly; the answer key is fixed history — do not fudge):
- metrics.missedTotal = ${t.missedByChange.length}; metrics.missedCovered = how many of these files
  YOUR edit changed: ${JSON.stringify(t.missedByChange)}
- metrics.structuralRegressions / newCycles / newDuplication / lostCallers from the diff
- filesChanged (from git status), approachSummary${treatment ? ', ambientContextNoted (what the card told you; "nothing useful" is valid)' : ''}
- completed: false (with what failed) if any step errored — do not invent metrics.`
}

phase('Solve')
const cells = []
for (const t of tasks) for (const cond of ['control', 'treatment']) for (let r = 0; r < cfg.reps; r++) cells.push({ task: t, cond, rep: r })
const results = await parallel(cells.map((c) => () =>
  agent(solvePrompt(c), { label: `${c.cond}:${c.task.label}#${c.rep}`, phase: 'Solve', schema: CELL, agentType: 'general-purpose' })))
const cellsOut = results.map((r, i) => (r ? { task: cells[i].task.symbol, condition: cells[i].cond, rep: cells[i].rep, result: r } : { task: cells[i].task.symbol, condition: cells[i].cond, rep: cells[i].rep, result: null, died: true }))
const done = cellsOut.filter((c) => c.result && c.result.completed).length
log(`solved ${done}/${cells.length} cells completed`)
return { design: 'replay of mined historical caller-breakages; ground truth = missedByChange coverage', tasks: tasks.map((t) => t.symbol), cells: cellsOut, config: cfg }
