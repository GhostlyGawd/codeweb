#!/usr/bin/env node
// Re-extract the public Axios demo from a verified checkout. Never run target code.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseArgs, die, atomicWrite } from './lib/cli.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { opts } = parseArgs(process.argv.slice(2), {
  usage: 'usage: refresh-demo.mjs --source <pinned-axios-checkout>',
  flags: { source: { type: 'string', default: null } },
});
if (!opts.source) die('Supply --source with the pinned Axios checkout.', 2);
const source = resolve(opts.source);
const pin = JSON.parse(readFileSync(join(repo, 'bench/corpus.manifest.json'), 'utf8')).find(x => x.name === 'axios');
const git = args => spawnSync('git', ['-c', 'core.fsmonitor=false', ...args], { cwd: source, encoding: 'utf8' });
const head = git(['rev-parse', 'HEAD']);
if (head.status !== 0 || head.stdout.trim() !== pin.sha) die(`Expected pinned Axios commit ${pin.sha}.`, 2);
const clean = git(['diff', '--no-ext-diff', '--no-textconv', '--exit-code', 'HEAD', '--', 'lib']);
const extra = git(['ls-files', '--others', '--', 'lib']);
if (clean.status !== 0 || extra.status !== 0 || extra.stdout.trim()) die('Axios lib must match the pinned checkout with no extra source files.', 2);
const version = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')).version;
const work = mkdtempSync(join(tmpdir(), 'codeweb-demo-'));
// A release artifact must not inherit local experiment switches or another workspace.
const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('CODEWEB_'))),
  CODEWEB_WS: work, CODEWEB_ENGINE: 'regex', CODEWEB_NO_STATS: '1', SOURCE_DATE_EPOCH: '1788652800' };
const run = args => {
  const result = spawnSync(process.execPath, args, { cwd: repo, env, encoding: 'utf8', timeout: 120000, maxBuffer: 16 << 20 });
  if (result.status !== 0) throw new Error(result.stderr || `Demo step failed (${result.signal || result.status}).`);
};
try {
  // Force BOTH parser choices. CODEWEB_ENGINE=regex alone still permits host ctags.
  run(['scripts/extract-symbols.mjs', join(source, 'lib'), '--target', 'axios', '--engine', 'regex', '--no-ctags', '--out', join(work, 'fragment.json')]);
  const fragment = JSON.parse(readFileSync(join(work, 'fragment.json'), 'utf8'));
  if (fragment.meta?.engine !== 'regex') throw new Error('Demo extraction did not use the required regex engine.');
  run(['scripts/cluster3.mjs']);
  run(['scripts/overlap.mjs']);
  const graph = JSON.parse(readFileSync(join(work, 'graph.json'), 'utf8'));
  if (graph.meta?.engine !== 'regex + de-hubbed dir-seeded call-cohesion clustering') throw new Error('Demo graph has unexpected pipeline provenance.');
  for (const key of ['root', 'sources', 'dirs']) delete graph.meta[key];
  Object.assign(graph.meta, {
    sourceCommit: pin.sha,
    sourceUrl: `https://github.com/axios/axios/tree/${pin.sha}/lib`,
    extractorVersion: version,
    extractorEngine: fragment.meta.engine,
    rendererVersion: version,
    extractionScope: 'Axios lib; regex engine; static resolved edges only',
  });
  // Render in the temporary workspace so renderer sidecars never reach the public demo.
  const graphPath = join(work, 'graph.json');
  writeFileSync(graphPath, JSON.stringify(graph));
  run(['scripts/build-report.mjs', graphPath, '--out', join(work, 'index.html'), '--no-md']);
  const graphBytes = readFileSync(graphPath);
  const htmlBytes = readFileSync(join(work, 'index.html'));
  atomicWrite(join(repo, 'docs/demo/axios.graph.json'), graphBytes);
  atomicWrite(join(repo, 'docs/demo/index.html'), htmlBytes);
  console.log(JSON.stringify({ sourceCommit: pin.sha, version, symbols: graph.nodes.length, edges: graph.edges.length, domains: graph.domains.length }));
} catch (error) { console.error(error.message); process.exitCode = 2; }
finally { rmSync(work, { recursive: true, force: true }); }
