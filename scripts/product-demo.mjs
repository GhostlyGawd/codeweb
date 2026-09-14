#!/usr/bin/env node
// Development-only reproduction. The fixture is parsed, never executed.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseArgs, die } from './lib/cli.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const USAGE = 'usage: product-demo.mjs --out <new-directory>\nCreates a local cross-file-cycle fixture and verifies its observed review and gate results.';
const { opts, pos } = parseArgs(process.argv.slice(2), {
  usage: USAGE, flags: { out: { type: 'string', default: null } },
});
if (!opts.out || pos.length) die(USAGE, 2);
const out = resolve(opts.out);

const app = `import { calculateFeature } from './feature.js';

throw new Error('DEMO_SOURCE_MUST_NOT_EXECUTE');

export function run(value) {
  const input = Number(value);
  const bounded = Math.max(1, input);
  const adjusted = bounded + 2;
  const result = calculateFeature(adjusted);
  const message = 'feature total: ' + result;
  return { result, message };
}
`;
const feature = `import { adjust } from './math.js';

export function calculateFeature(value) {
  let total = 0;
  for (let i = 0; i < value; i += 1) {
    const weight = i * 3;
    total += weight;
  }
  const normalized = total / Math.max(1, value);
  return adjust(normalized);
}
`;
const math = `export function adjust(value) {
  if (value < 0) {
    return 0;
  }
  const whole = Math.floor(value);
  const fraction = value - whole;
  const step = fraction >= 0.5 ? 1 : 0;
  return whole + step;
}
`;

// Fixture Git operations must not inherit the caller's index, worktree, or hooks.
const env = { ...process.env, CODEWEB_NO_STATS: '1', CODEWEB_NO_PROMO: '1',
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
  GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z' };
for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_PARAMETERS']) delete env[key];
function command(binary, args, { cwd = ROOT, expected = 0 } = {}) {
  const result = spawnSync(binary, args, { cwd, env, encoding: 'utf8', timeout: 30000, maxBuffer: 1 << 25 });
  if (result.status !== expected) {
    const detail = result.error?.message || result.stderr?.trim() || result.stdout?.trim() || result.signal || 'no output';
    throw new Error(`${binary === process.execPath ? 'node' : binary} ${args[0]}: expected exit ${expected}, got ${result.status}; ${detail}`);
  }
  return result;
}
const codeweb = (args, options) => command(process.execPath, [join(ROOT, 'bin/codeweb.mjs'), ...args], options);
const jsonFile = (name, value) => writeFileSync(join(out, name), JSON.stringify(value, null, 2) + '\n');
const requireEvidence = (condition, message) => { if (!condition) throw new Error(`demo evidence missing: ${message}`); };

try {
  // Non-recursive creation rejects existing paths, including symlinks. Never reuse a receipt.
  mkdirSync(out);
  const repo = join(out, 'repo');
  const hooks = join(out, 'empty-hooks');
  mkdirSync(repo);
  mkdirSync(hooks);
  writeFileSync(join(repo, 'app.js'), app);
  writeFileSync(join(repo, 'feature.js'), feature);
  writeFileSync(join(repo, 'math.js'), math);
  const git = (...args) => command('git', ['-c', `core.hooksPath=${hooks}`, ...args], { cwd: repo });
  git('init', '--quiet', `--template=${hooks}`);
  git('config', 'core.hooksPath', hooks);
  git('add', 'app.js', 'feature.js', 'math.js');
  git('-c', 'user.name=CodeWeb demo', '-c', 'user.email=demo@example.invalid', '-c', 'commit.gpgSign=false',
    'commit', '--quiet', '-m', 'demo: baseline fixture');
  const baseCommit = git('rev-parse', 'HEAD').stdout.trim();

  const beforeGraph = join(out, 'before/graph.json');
  const afterGraph = join(out, 'after/graph.json');
  codeweb([repo, '--out-dir', join(out, 'before')]);
  const callers = JSON.parse(command(process.execPath, [join(ROOT, 'bin/codeweb-query.mjs'), beforeGraph,
    '--callers', 'feature.js:calculateFeature', '--json']).stdout);
  requireEvidence(callers.results?.includes('app.js:run'), 'app.js:run calls feature.js:calculateFeature');
  jsonFile('callers.json', callers);

  writeFileSync(join(repo, 'feature.js'), `import { run } from './app.js';\n${feature}`
    .replace('return adjust(normalized);', 'return value > 10 ? run(value - 1).result : adjust(normalized);'));
  codeweb([repo, '--out-dir', join(out, 'after')]);
  const diffResult = command(process.execPath, [join(ROOT, 'bin/codeweb-diff.mjs'), beforeGraph, afterGraph, '--json'], { expected: 1 });
  const diff = JSON.parse(diffResult.stdout);
  requireEvidence(diff.cycles?.added?.length > 0 && diff.verdict?.ok === false, 'a new cycle makes the diff fail');
  jsonFile('diff.json', diff);

  const reviewHtml = join(out, 'review.html');
  const review = JSON.parse(codeweb(['review', afterGraph, '--changed', 'feature.js', '--before', beforeGraph,
    '--json', '--html', reviewHtml]).stdout);
  requireEvidence(review.changedSymbols?.some((item) => (typeof item === 'string' ? item : item.id) === 'feature.js:calculateFeature'), 'changed feature function');
  requireEvidence(review.structural?.newCycles?.length > 0, 'review reports the cycle');
  requireEvidence(review.review?.affectedCallers?.some((item) => item.id === 'app.js:run'), 'review includes the affected caller');
  requireEvidence(existsSync(reviewHtml) && /<h3>run<\/h3>[\s\S]*?app\.js:/.test(readFileSync(reviewHtml, 'utf8')), 'HTML includes the affected caller and its source location');
  jsonFile('review.json', review);

  const gateArgs = ['gate', '--base', baseCommit, '--repo', repo];
  const blocking = codeweb(gateArgs, { expected: 1 });
  const reportOnly = codeweb([...gateArgs, '--report-only']);
  requireEvidence([blocking, reportOnly].every((result) => /regression/i.test(result.stdout)
    && /new dependency cycle/i.test(result.stdout)), 'both gate modes retain the finding');
  writeFileSync(join(out, 'gate-blocking.txt'), blocking.stdout + blocking.stderr);
  writeFileSync(join(out, 'gate-report-only.txt'), reportOnly.stdout + reportOnly.stderr);
  const productVersion = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
  jsonFile('receipt.json', {
    schemaVersion: 1, productVersion, fixture: 'cross-file-cycle', baseCommit,
    beforeGraph: 'before/graph.json', afterGraph: 'after/graph.json', reviewHtml: 'review.html',
    changedFile: 'feature.js', expectedCaller: 'app.js:run',
    gate: { blockingExitCode: blocking.status, reportOnlyExitCode: reportOnly.status, verdict: 'regression' },
    verified: true,
  });
  console.log(`product-demo: verified; receipt: ${join(out, 'receipt.json')}`);
} catch (error) {
  console.error(`product-demo: ${error.message}`);
  process.exitCode = 2;
}
