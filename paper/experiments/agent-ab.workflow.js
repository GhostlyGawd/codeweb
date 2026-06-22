// H18 — agent A/B field study (the capstone, weakest-evidence theme). See agent-ab.DESIGN.md.
//
// Question: does access to codeweb's pre-edit tools (find-similar / placement / impact / simulate-edit)
// make a coding agent produce edits with FEWER structural regressions and LESS new duplication than the
// SAME agent without them? control vs treatment differ ONLY by the codeweb protocol block.
//
// Grading is by codeweb's OWN deterministic, independently-verified diff.mjs gate (H5/H8) — a function,
// not a model judge. Each (task × condition × rep) is solved in its own throwaway copy of the corpus
// repo, so cells never collide. Tasks are proposed then adversarially screened for fairness and FROZEN
// before any solver runs (anti-rigging). Paired stats are computed AFTER this returns (not byte-repro:
// model nondeterminism — seeds/prompts/grader committed; the deterministic grading reproduces).
//
// Launch:  Workflow({scriptPath: ".../agent-ab.workflow.js", args: {smoke:true}})   // 4-cell harness check
//          Workflow({scriptPath: ".../agent-ab.workflow.js"})                       // full run

export const meta = {
  name: 'codeweb-agent-ab',
  description: 'H18 agent A/B: do codeweb pre-edit tools reduce an agent’s structural regressions + new duplication vs no tools',
  phases: [
    { title: 'Tasks', detail: 'propose candidate tasks, adversarially screen for fairness, freeze the set' },
    { title: 'Solve', detail: 'each (task x condition x rep) solved in an isolated repo copy, graded by diff.mjs' },
  ],
}

const ROOT = 'D:/GitHub Projects/ecc-test/codeweb'
const cfg = {
  repos: (args && args.repos) || ['axios', 'flask', 'express'],
  tasksN: (args && args.tasksN) || 9,
  reps: (args && args.reps) || 2,
  smoke: !!(args && args.smoke),
}
if (cfg.smoke) { cfg.repos = ['flask']; cfg.tasksN = 2; cfg.reps = 1 }

// ---- schemas --------------------------------------------------------------------------------------
const TASK = {
  type: 'object', additionalProperties: false,
  required: ['id', 'repo', 'kind', 'instruction', 'criterion'],
  properties: {
    id: { type: 'string', description: 'short stable slug, e.g. axios-add-headers-merge' },
    repo: { type: 'string' },
    kind: { type: 'string', enum: ['add', 'refactor', 'fix'] },
    instruction: { type: 'string', description: 'a precise, real task a developer would do — NO hint about existing code or codeweb' },
    criterion: { type: 'string', description: 'objective: what structural outcome marks the edit complete' },
    rationale: { type: 'string' },
  },
}
const TASKS_SCHEMA = { type: 'object', additionalProperties: false, required: ['candidates'], properties: { candidates: { type: 'array', items: TASK }, notes: { type: 'string' } } }
const REVIEWED_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['kept', 'rejected', 'frozenPath'],
  properties: {
    kept: { type: 'array', items: TASK },
    rejected: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'reason'], properties: { id: { type: 'string' }, reason: { type: 'string' } } } },
    frozenPath: { type: 'string', description: 'path to the committed-frozen tasks JSON it wrote' },
    fairnessNote: { type: 'string' },
  },
}
const CELL_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['taskId', 'condition', 'rep', 'completed', 'metrics', 'approachSummary'],
  properties: {
    taskId: { type: 'string' }, condition: { type: 'string', enum: ['control', 'treatment'] }, rep: { type: 'integer' },
    completed: { type: 'boolean', description: 'did you make a real edit that satisfies the criterion?' },
    metrics: {
      type: 'object', additionalProperties: false,
      required: ['structuralRegressions', 'newCycles', 'newDuplication', 'lostCallers', 'nodesAdded', 'edgesAdded'],
      properties: {
        structuralRegressions: { type: 'integer' }, newCycles: { type: 'integer' }, newDuplication: { type: 'integer' },
        lostCallers: { type: 'integer' }, nodesAdded: { type: 'integer' }, edgesAdded: { type: 'integer' },
      },
    },
    filesChanged: { type: 'integer' },
    codewebToolsUsed: { type: 'array', items: { type: 'string' }, description: 'treatment only: which tools you ran + what they told you' },
    approachSummary: { type: 'string' },
  },
}

// ---- prompts --------------------------------------------------------------------------------------
const COMMON = `codeweb root: ${ROOT} (Node on PATH; use the Bash tool, forward-slash paths). The corpus repos are pinned read-only clones under paper/corpus/<repo>.`

const proposePrompt = `${COMMON}

You are the TASK PROPOSER for a fair A/B study. Read these corpus repos and propose ${cfg.tasksN * 2} candidate coding tasks spread across them: ${cfg.repos.map((r) => `paper/corpus/${r}`).join(', ')}.

Mix three kinds roughly evenly:
- add: introduce a new function/helper that does a specific thing (some of these may overlap existing logic — but DESCRIBE the task neutrally, by behavior, NEVER hinting that similar code exists or mentioning codeweb).
- refactor: move/rename/merge something that touches multiple call sites.
- fix: a localized change with a non-trivial blast radius (multiple callers).

Each task must be (a) a REAL task a developer on that repo would plausibly do, (b) doable by a competent agent WITHOUT any special tooling, (c) gradeable by structural outcome (it changes the call/import graph). Give each: id (slug), repo, kind, instruction (precise, self-contained, no hints), criterion (objective structural outcome), rationale. Do NOT mention codeweb, duplication, or "existing similar code" in any instruction — that would tip off one condition. Return the candidates.`

const reviewPrompt = (proposed) => `${COMMON}

You are the ADVERSARIAL TASK REVIEWER guarding against a rigged study. Screen these ${proposed && proposed.candidates ? proposed.candidates.length : 0} candidate tasks:

${JSON.stringify(proposed && proposed.candidates, null, 1)}

For each, judge: (1) REPRESENTATIVE — a real task, not contrived to make a tool shine? (2) FAIR — could a competent agent plausibly do it WELL without codeweb? If a task can ONLY be done well with codeweb, it is rigged — REJECT it. (3) GRADEABLE — does success/failure show up as an objective structural change (new/changed call or import edges, possible new duplication or cycle)? (4) NEUTRAL WORDING — the instruction must not hint at existing code or mention codeweb/duplication. Fix wording if needed, else reject.

Keep the best ${cfg.tasksN} (balanced across kinds + repos). WRITE the frozen kept set to ${ROOT}/paper/results/agent-ab-tasks.json as JSON {frozenAt:"pre-solve", tasks:[...], rejected:[{id,reason}]} (create paper/results/ if needed). Return kept, rejected (with reasons), frozenPath, and a one-line fairnessNote.`

const solvePrompt = (cell) => {
  const t = cell.task
  const treatment = cell.cond === 'treatment'
  return `${COMMON}

You are SOLVING a coding task. Condition: ${cell.cond.toUpperCase()}. Repetition: ${cell.rep}.

STRICT ISOLATION: never edit paper/corpus/${t.repo} directly. First COPY it to a fresh throwaway dir:
  work=$(mktemp -d)/work ; cp -r "${ROOT}/paper/corpus/${t.repo}" "$work" ; rm -rf "$work/.git"
Do ALL work in $work. (Use the Bash tool.)

TASK (${t.kind}, repo ${t.repo}): ${t.instruction}
Completion criterion: ${t.criterion}

STEPS:
1. Build the BEFORE graph of your copy:
   node "${ROOT}/scripts/run.mjs" "$work" --out-dir "$work/.cwb"     # -> $work/.cwb/graph.json
${treatment ? `2. CONSULT codeweb (read-only) to inform your edit — this is your advantage, USE it:
   - "does an implementation like this already EXIST? (reuse it, don't re-implement)":
       printf '%s' '<the body/signature you intend to write>' | node "${ROOT}/scripts/find-similar.mjs" "$work/.cwb/graph.json" --stdin --structural
   - "where should new code go?":  node "${ROOT}/scripts/placement.mjs" "$work/.cwb/graph.json" --calls <callee ids>
   - "what breaks if I change X?":  node "${ROOT}/scripts/query.mjs" "$work/.cwb/graph.json" --impact "<symbol>"
   - "will my structural change pass the gate?":  node "${ROOT}/scripts/simulate-edit.mjs" "$work/.cwb/graph.json" --merge <a,b> | --delete <s> | --move <s> --to <file>
   Let these steer you: REUSE existing code instead of duplicating it, and avoid edits that break callers.` : `2. (No special tooling.) Read the code directly and implement the task as a competent developer would.`}
3. Make the edit in $work to satisfy the criterion.
4. Build the AFTER graph:  node "${ROOT}/scripts/run.mjs" "$work" --out-dir "$work/.cwa"   # -> $work/.cwa/graph.json
5. GRADE (deterministic — codeweb's own verified gate):
   node "${ROOT}/scripts/diff.mjs" "$work/.cwb/graph.json" "$work/.cwa/graph.json" --json
   From its JSON read: regressions (the count/list of structural regressions = new cycle | new duplication | a symbol that lost all its callers), plus nodes/edges/overlaps added.

REPORT (honestly — the grade is a fixed function, do not fudge it):
- completed: did you make a real edit satisfying the criterion? (false if you couldn't)
- metrics.structuralRegressions: total regressions from diff.mjs
- metrics.newCycles / newDuplication / lostCallers: the breakdown from the diff's regressions
- metrics.nodesAdded / edgesAdded: from the diff
- filesChanged, approachSummary (1-2 lines${treatment ? '; list codewebToolsUsed and what each told you' : ''})
Keep it focused. If a step errors, report completed:false with what failed (do not invent metrics).`
}

// ---- run ------------------------------------------------------------------------------------------
phase('Tasks')
log(`A/B: repos=${cfg.repos.join(',')} · target ${cfg.tasksN} tasks · ${cfg.reps} rep(s)/cell${cfg.smoke ? ' · SMOKE' : ''}`)
const proposed = await agent(proposePrompt, { label: 'propose-tasks', phase: 'Tasks', schema: TASKS_SCHEMA, agentType: 'general-purpose' })
const reviewed = await agent(reviewPrompt(proposed), { label: 'review+freeze-tasks', phase: 'Tasks', schema: REVIEWED_SCHEMA, agentType: 'general-purpose' })
const tasks = ((reviewed && reviewed.kept) || []).slice(0, cfg.tasksN)
if (!tasks.length) { log('no tasks survived review — aborting'); return { tasks: [], cells: [], config: cfg } }
log(`${tasks.length} task(s) frozen -> ${reviewed.frozenPath}; solving ${tasks.length * 2 * cfg.reps} cells`)

phase('Solve')
const cells = []
for (const t of tasks) for (const cond of ['control', 'treatment']) for (let r = 0; r < cfg.reps; r++) cells.push({ task: t, cond, rep: r })
const results = await parallel(cells.map((c) => () =>
  agent(solvePrompt(c), { label: `${c.cond}:${c.task.id}#${c.rep}`, phase: 'Solve', schema: CELL_SCHEMA, agentType: 'general-purpose' })))
const cellsOut = results.map((r, i) => (r ? { task: cells[i].task.id, repo: cells[i].task.repo, kind: cells[i].task.kind, condition: cells[i].cond, rep: cells[i].rep, result: r } : { task: cells[i].task.id, condition: cells[i].cond, rep: cells[i].rep, result: null, died: true }))
const done = cellsOut.filter((c) => c.result && c.result.completed).length
log(`solved ${done}/${cells.length} cells completed`)
return { tasks, cells: cellsOut, config: cfg }
