// Proves the shared module reproduces two real scripts' parseArgs behavior, and shows generated help.
import { parseArgs, renderHelp } from './cli.js';

// --- worktree-lifecycle.js: ignores unknown flags; rich value/number flags + dest remaps ---
const WORKTREE = {
  name: 'worktree-lifecycle', onUnknown: 'ignore',
  summary: 'Analyze every git worktree in a repo and classify its lifecycle state.',
  flags: {
    json:          { help: 'Print the full ecc.worktree-lifecycle.v1 report as JSON' },
    conflicts:     { dest: 'conflictsOnly', help: 'Only show worktrees that would conflict on merge' },
    stale:         { dest: 'staleOnly', help: 'Only show stale (clean, inactive) worktrees' },
    'cleanup-plan':{ dest: 'cleanupPlan', help: 'Show which worktrees are safe to remove and why' },
    base:          { type: 'string', value: 'main', help: 'Base branch to compare against (default: main)' },
    'stale-days':  { type: 'number', value: 7, min: 0, help: 'Days of inactivity before stale (default: 7)' },
    repo:          { type: 'string', dest: 'repoRoot', value: 'CWD', help: 'Repository root (default: cwd)' },
  },
};

// --- doctor.js: throws on unknown; repeatable --target ---
const DOCTOR = {
  name: 'doctor', onUnknown: 'error',
  flags: {
    target: { type: 'string', many: true, help: 'Target to check (repeatable)' },
    json:   { help: 'Emit JSON' },
  },
};

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let pass = 0, fail = 0;
const check = (label, got, want) => { const ok = eq(got, want); console.log((ok ? 'PASS' : 'FAIL') + '  ' + label); if (ok) pass++; else { fail++; console.log('   got :', JSON.stringify(got)); console.log('   want:', JSON.stringify(want)); } };

// hand-written worktree parseArgs output for: --json --stale-days 14 --base dev --conflicts --bogus
check('worktree: flags+number+value+remap, unknown ignored',
  (({ help, _, ...v }) => v)(parseArgs(WORKTREE, ['node', 'x', '--json', '--stale-days', '14', '--base', 'dev', '--conflicts', '--bogus'])),
  { json: true, conflictsOnly: true, staleOnly: false, cleanupPlan: false, base: 'dev', staleDays: 14, repoRoot: 'CWD' });

// invalid --stale-days keeps default (matches original's Number.isFinite guard)
check('worktree: invalid number keeps default',
  parseArgs(WORKTREE, ['node', 'x', '--stale-days', 'abc']).staleDays, 7);

// doctor repeatable --target
check('doctor: repeatable --target + --json',
  (({ help, _, ...v }) => v)(parseArgs(DOCTOR, ['node', 'x', '--target', 'a', '--target', 'b', '--json'])),
  { target: ['a', 'b'], json: true });

// doctor throws on unknown (original throws `Unknown argument`)
let threw = false; try { parseArgs(DOCTOR, ['node', 'x', '--nope']); } catch (e) { threw = /Unknown argument/.test(e.message); }
check('doctor: throws on unknown flag', threw, true);

console.log(`\n${pass} pass / ${fail} fail`);
console.log('\n----- generated help for worktree-lifecycle (vs its 21-LOC hand-written usage()) -----\n');
console.log(renderHelp(WORKTREE));
