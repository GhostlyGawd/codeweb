#!/usr/bin/env node
// Reproduce every DETERMINISTIC result (Themes 1-4 + auxiliary) of the codeweb effectiveness study.
// Records the environment manifest, runs each harness against the pinned corpus, and gates on exit
// codes (a harness exits non-zero when a hypothesis misses its pre-registered criterion — so a
// silently-broken or regressed claim cannot ship green).
//
//   bash paper/corpus/clone-corpus.sh   # once: clone + pin the corpus
//   node paper/run-all.mjs              # full scale (slow: determinism R=20, performance, detection)
//   CODEWEB_DET_SMOKE=1 node paper/run-all.mjs   # determinism in fast smoke mode (other harnesses full)
//
// Theme 5 (H18, the agent A/B) is NOT run here: it is not byte-reproducible (model nondeterminism)
// and needs an agent runner — see paper/experiments/agent-ab.DESIGN.md and agent-ab.mjs.

import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import os from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const node = process.execPath;

// Ordered cheap-first: in-process oracle clusters (fast) before the heavy real-pipeline clusters.
const HARNESSES = [
  { id: 'correctness-query', file: 'paper/experiments/correctness-query.mjs' },
  { id: 'edit-safety', file: 'paper/experiments/edit-safety.mjs' },
  { id: 'auxiliary', file: 'paper/experiments/auxiliary.mjs' },
  { id: 'detection-accuracy', file: 'paper/experiments/detection-accuracy.mjs' },
  { id: 'performance', file: 'paper/experiments/performance.mjs' },
  { id: 'determinism', file: 'paper/experiments/determinism.mjs' },
];

const tryGit = (args) => { try { return execFileSync('git', args, { cwd: ROOT }).toString().trim(); } catch { return 'unknown'; } };

const env = {
  date: new Date().toISOString(),
  node: process.version,
  platform: os.platform(), release: os.release(), arch: os.arch(),
  cpu: os.cpus()[0]?.model?.trim(), cores: os.cpus().length,
  ramGB: +(os.totalmem() / 1e9).toFixed(1),
  codewebSha: tryGit(['rev-parse', 'HEAD']),
  codewebBranch: tryGit(['rev-parse', '--abbrev-ref', 'HEAD']),
  corpus: existsSync(join(ROOT, 'paper/corpus.manifest.json'))
    ? JSON.parse(readFileSync(join(ROOT, 'paper/corpus.manifest.json'), 'utf8'))
    : null,
  detSmoke: !!process.env.CODEWEB_DET_SMOKE,
};
writeFileSync(join(ROOT, 'paper/results/_env.json'), JSON.stringify(env, null, 2));
console.log(`[run-all] env: node ${env.node} · ${env.platform} ${env.arch} · ${env.cores} cores · ${env.ramGB}GB · codeweb ${String(env.codewebSha).slice(0, 7)} (${env.codewebBranch})${env.detSmoke ? ' · DET-SMOKE' : ''}`);
if (!env.corpus) console.warn('[run-all] WARNING: no corpus manifest — run `bash paper/corpus/clone-corpus.sh` first; real-repo experiments will be degraded.');

const summary = [];
let anyFail = false;
const t0 = Date.now();
for (const h of HARNESSES) {
  const abs = join(ROOT, h.file);
  if (!existsSync(abs)) { console.log(`[skip] ${h.id} (harness missing)`); summary.push({ id: h.id, status: 'missing' }); continue; }
  console.log(`\n${'='.repeat(70)}\n[run] ${h.id}\n${'='.repeat(70)}`);
  const start = Date.now();
  let exit = 0;
  try { execFileSync(node, [abs], { cwd: ROOT, stdio: 'inherit', env: process.env }); }
  catch (e) { exit = e.status ?? 1; anyFail = true; }
  const secs = +((Date.now() - start) / 1000).toFixed(1);
  summary.push({ id: h.id, exit, passed: exit === 0, seconds: secs });
  console.log(`[${exit === 0 ? 'PASS' : 'FAIL'}] ${h.id} (exit ${exit}, ${secs}s)`);
}
const out = { env, totalSeconds: +((Date.now() - t0) / 1000).toFixed(1), summary };
writeFileSync(join(ROOT, 'paper/results/_summary.json'), JSON.stringify(out, null, 2));

console.log(`\n${'='.repeat(70)}\n[run-all] summary (per-hypothesis detail in each paper/results/<id>.json):`);
for (const s of summary) console.log(`  ${(s.status || (s.passed ? 'PASS' : 'FAIL')).padEnd(7)} ${s.id}${s.seconds != null ? ` (${s.seconds}s)` : ''}`);
console.log(`  total ${out.totalSeconds}s -> paper/results/_summary.json`);

if (anyFail) {
  console.error('\n[run-all] one or more harnesses reported a FAILURE — a hypothesis missed its pre-registered criterion. This is the honest gate, not a crash; see the relevant results JSON and the paper for which claim and why.');
  process.exit(1);
}
console.log('\n[run-all] all harnesses met their pre-registered criteria.');
