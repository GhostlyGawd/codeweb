// H18-v2 — agent A/B rerun: AMBIENT codeweb vs control, on HARDER tasks. See agent-ab.DESIGN.md
// for the v1 pre-registration; this variant changes exactly two things, for pre-registered reasons:
//
//   1. TASK DIFFICULTY. v1 returned a NULL with a floor effect — both arms scored ~0 regressions
//      because clean, well-scoped tasks give a capable model nothing to get wrong (see
//      paper/results/agent-ab.json interpretation). v2 tasks must have real blast radius:
//      shape-changing edits to symbols with fan-in >= 5, cross-file refactors, contract changes.
//      Same anti-rigging protocol: propose -> adversarial screen -> FREEZE before any solver runs.
//   2. AMBIENT TREATMENT. v1 treatment could CALL tools (and did, 18/18) — but optional
//      consultation measures discipline, not the loop codeweb now ships: hooks INJECT the brief at
//      session start and the explain card (with caller-reliance contracts + confidence caveats)
//      before each edit. v2 treatment REQUIRES those steps — same information, zero discipline —
//      mirroring hooks/session-brief.mjs and hooks/pre-edit-impact.mjs.
//
// Launch (funded run — spends real tokens):
//   Workflow({scriptPath: ".../agent-ab2-ambient.workflow.js", args: {root: "<abs codeweb root>", smoke: true}})   // 4-cell harness check
//   Workflow({scriptPath: ".../agent-ab2-ambient.workflow.js", args: {root: "<abs codeweb root>"}})               // full run (~36 cells)
// Then:  node paper/experiments/agent-ab-analyze.mjs paper/results/agent-ab2-raw.json paper/results/agent-ab2.json

export const meta = {
  name: 'codeweb-agent-ab2-ambient',
  description: 'H18-v2: does the AMBIENT codeweb loop (brief + injected explain cards with reliance/caveats) reduce structural regressions on high-blast-radius tasks vs no tooling',
  phases: [
    { title: 'Tasks', detail: 'propose HARD tasks (fan-in >= 5 / shape changes), adversarially screen + verify difficulty via the graph, freeze' },
    { title: 'Solve', detail: 'each (task x condition x rep) in an isolated repo copy; ambient arm gets brief + explain cards; graded by diff.mjs' },
  ],
}

const ROOT = args && args.root
if (!ROOT) { log('args.root (absolute codeweb repo path) is required — aborting'); return { error: 'args.root required' } }
const cfg = {
  corpus: (args && args.corpus) || `${ROOT}/paper/corpus`,
  repos: (args && args.repos) || ['axios', 'flask', 'express'],
  tasksN: (args && args.tasksN) || 9,
  reps: (args && args.reps) || 2,
  smoke: !!(args && args.smoke),
}
if (cfg.smoke) { cfg.repos = [cfg.repos[0]]; cfg.tasksN = 2; cfg.reps = 1 }

// ---- schemas --------------------------------------------------------------------------------------
const TASK = {
  type: 'object', additionalProperties: false,
  required: ['id', 'repo', 'kind', 'instruction', 'criterion', 'difficultyEvidence'],
  properties: {
    id: { type: 'string' }, repo: { type: 'string' },
    kind: { type: 'string', enum: ['refactor', 'fix', 'add'] },
    instruction: { type: 'string', description: 'precise, real, self-contained — NO hint about existing code, blast radius, or codeweb' },
    criterion: { type: 'string', description: 'objective structural outcome that marks the edit complete' },
    difficultyEvidence: { type: 'string', description: 'from the graph: the touched symbol\'s fan-in / caller count / files affected — why this task has headroom for regressions' },
    rationale: { type: 'string' },
  },
}
const TASKS_SCHEMA = { type: 'object', additionalProperties: false, required: ['candidates'], properties: { candidates: { type: 'array', items: TASK }, notes: { type: 'string' } } }
const REVIEWED_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['kept', 'rejected', 'frozenPath'],
  properties: {
    kept: { type: 'array', items: TASK },
    rejected: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'reason'], properties: { id: { type: 'string' }, reason: { type: 'string' } } } },
    frozenPath: { type: 'string' },
    fairnessNote: { type: 'string' },
  },
}
const CELL_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['taskId', 'condition', 'rep', 'completed', 'metrics', 'approachSummary'],
  properties: {
    taskId: { type: 'string' }, condition: { type: 'string', enum: ['control', 'treatment'] }, rep: { type: 'integer' },
    completed: { type: 'boolean' },
    metrics: {
      type: 'object', additionalProperties: false,
      required: ['structuralRegressions', 'newCycles', 'newDuplication', 'lostCallers', 'nodesAdded', 'edgesAdded'],
      properties: {
        structuralRegressions: { type: 'integer' }, newCycles: { type: 'integer' }, newDuplication: { type: 'integer' },
        lostCallers: { type: 'integer' }, nodesAdded: { type: 'integer' }, edgesAdded: { type: 'integer' },
      },
    },
    filesChanged: { type: 'integer' },
    ambientContextNoted: { type: 'string', description: 'treatment only: what the brief/explain cards told you that shaped the edit (or "nothing useful" — honesty required)' },
    approachSummary: { type: 'string' },
  },
}

// ---- prompts --------------------------------------------------------------------------------------
const COMMON = `codeweb root: ${ROOT} (Node on PATH; use the Bash tool, forward-slash paths). The corpus repos are pinned read-only clones under ${cfg.corpus}/<repo>.`

const proposePrompt = `${COMMON}

You are the TASK PROPOSER for a fair A/B study, v2 — the v1 study floored out (both arms ~0
regressions on easy tasks), so v2 tasks must have REAL blast radius. For each corpus repo
(${cfg.repos.map((r) => `${cfg.corpus}/${r}`).join(', ')}): first build its graph
(node "${ROOT}/scripts/run.mjs" "${cfg.corpus}/<repo>" --out-dir "$(mktemp -d)/g") and use
node "${ROOT}/scripts/query.mjs" <graph> --dependents <symbol> to VERIFY difficulty.

Propose ${cfg.tasksN * 2} candidates spread across the repos. Difficulty bar (every task must meet it):
the edit must plausibly touch a symbol with fan-in >= 5, or change a return/parameter shape used by
>= 3 caller files, or move/merge logic across >= 3 files. Mix kinds: refactor (shape/move/merge),
fix (localized change, wide blast), add (behavior that overlaps existing logic).

Each candidate: id, repo, kind, instruction (neutral wording — NEVER hint that similar code exists,
never mention codeweb/duplication/blast radius), criterion (objective structural outcome),
difficultyEvidence (the ACTUAL fan-in / caller-file counts you verified from the graph), rationale.`

const reviewPrompt = (proposed) => `${COMMON}

You are the ADVERSARIAL TASK REVIEWER guarding against a rigged study. Screen these candidates:

${JSON.stringify(proposed && proposed.candidates, null, 1)}

Judge each: (1) REPRESENTATIVE — a real task, not contrived for a tool demo? (2) FAIR — doable well
by a competent agent WITHOUT codeweb? If only codeweb makes it possible, REJECT. (3) HARD ENOUGH —
verify difficultyEvidence against the repo's graph yourself (build it if needed); reject floor-effect
tasks (touched symbols with trivial fan-in). (4) GRADEABLE — success shows up structurally.
(5) NEUTRAL WORDING — fix or reject.

Keep the best ${cfg.tasksN} (balanced across kinds + repos). WRITE the frozen set to
${ROOT}/paper/results/agent-ab2-tasks.json as {frozenAt:"pre-solve", designVariant:"v2-ambient-hard",
tasks:[...], rejected:[{id,reason}]}. Return kept, rejected, frozenPath, fairnessNote.`

const solvePrompt = (cell) => {
  const t = cell.task
  const treatment = cell.cond === 'treatment'
  return `${COMMON}

You are SOLVING a coding task. Condition: ${cell.cond.toUpperCase()}. Repetition: ${cell.rep}.

STRICT ISOLATION: never edit ${cfg.corpus}/${t.repo} directly. First COPY it:
  work=$(mktemp -d)/work ; cp -r "${cfg.corpus}/${t.repo}" "$work" ; rm -rf "$work/.git"
Do ALL work in $work.

TASK (${t.kind}, repo ${t.repo}): ${t.instruction}
Completion criterion: ${t.criterion}

STEPS:
1. Build the BEFORE graph:  node "${ROOT}/scripts/run.mjs" "$work" --out-dir "$work/.cwb"
${treatment ? `2. AMBIENT CONTEXT (in real usage codeweb's hooks inject this automatically at session
   start and before each edit — here you run the same two commands; they are REQUIRED, not optional):
   a. Orientation:  node "${ROOT}/scripts/brief.mjs" "$work/.cwb/graph.json"
   b. Before EACH file you edit, for the symbol(s) you are about to touch:
        node "${ROOT}/scripts/explain.mjs" "$work/.cwb/graph.json" "<symbol>"
      Read the card: its blast radius, its top callers, what callers RELY ON (fields/awaited/args
      — do not break those), and any ⚠ caveat (public API / dynamic dispatch). Let this shape the
      edit: preserve relied-on shapes, update every caller the card names, reuse instead of
      duplicating.` : `2. (No special tooling.) Read the code directly and implement the task as a competent developer would.`}
3. Make the edit in $work to satisfy the criterion.
4. Build the AFTER graph:  node "${ROOT}/scripts/run.mjs" "$work" --out-dir "$work/.cwa"
5. GRADE (deterministic — codeweb's own verified gate):
   node "${ROOT}/scripts/diff.mjs" "$work/.cwb/graph.json" "$work/.cwa/graph.json" --json
   Read: regressions (new cycle | new duplication | symbol that lost all callers), nodes/edges added.

REPORT (honestly — the grade is a fixed function, do not fudge it):
- completed; metrics.* from the diff; filesChanged; approachSummary (1-2 lines)${treatment ? `
- ambientContextNoted: what the brief/cards actually told you that shaped the edit ("nothing useful" is a valid answer)` : ''}
If a step errors, report completed:false with what failed (do not invent metrics).`
}

// ---- run ------------------------------------------------------------------------------------------
phase('Tasks')
log(`A/B v2 (ambient, hard tasks): repos=${cfg.repos.join(',')} · target ${cfg.tasksN} tasks · ${cfg.reps} rep(s)/cell${cfg.smoke ? ' · SMOKE' : ''}`)
const proposed = await agent(proposePrompt, { label: 'propose-hard-tasks', phase: 'Tasks', schema: TASKS_SCHEMA, agentType: 'general-purpose' })
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
return { designVariant: 'v2-ambient-hard', tasks, cells: cellsOut, config: cfg }
