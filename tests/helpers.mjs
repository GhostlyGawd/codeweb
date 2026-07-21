// codeweb test harness — dependency-free subprocess + fixture utilities.
// The engine scripts are monolithic run-on-import CLIs, so we characterize them by running the
// REAL shipped artifacts as child processes against crafted fixtures and asserting on their
// outputs (fragment.json / graph.json / overlap.md + the stderr banners). No engine refactor,
// no mocks: what ships is exactly what's tested.

import { spawnSync, execFile } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

export const TESTS_DIR = dirname(fileURLToPath(import.meta.url));
export const PLUGIN_ROOT = resolve(TESTS_DIR, '..');
export const SCRIPTS = join(PLUGIN_ROOT, 'scripts');
export const script = (name) => join(SCRIPTS, name);

// Run a node script as a child process. Never throws on non-zero exit — returns the full result
// so tests can assert on status/stdout/stderr explicitly.
export function runNode(scriptPath, args = [], { env = {}, cwd = PLUGIN_ROOT } = {}) {
  const r = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', error: r.error };
}

// Async sibling of runNode — same contract (resolves {status, stdout, stderr}, never rejects;
// status from error.code ?? 1 on failure), built on execFile so that awaited-in-parallel calls
// actually OVERLAP: node:test subtests only run concurrently when their bodies yield, and
// spawnSync bodies serialize even under {concurrency}. Round 2, finding #6.
export function runNodeAsync(scriptPath, args = [], { env = {}, cwd = PLUGIN_ROOT } = {}) {
  return new Promise((res) => {
    execFile(process.execPath, [scriptPath, ...args], {
      cwd,
      env: { ...process.env, ...env }, // the same merge as runNode — children keep PATH/CODEWEB_* vars
      encoding: 'utf8',
      maxBuffer: 1 << 28,
    }, (error, stdout, stderr) => {
      res({ status: error ? (error.code ?? 1) : 0, stdout: stdout || '', stderr: stderr || '', error: error || undefined });
    });
  });
}

// Create a unique temp dir (auto-unique via mkdtemp); caller cleans up with cleanup().
export function tmpDir(prefix = 'codeweb-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function cleanup(dir) {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
}

// Write a {relpath: content} map into a directory tree, creating parent dirs as needed.
export function writeTree(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

export function readJSON(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// Parse the extractor's stderr banner for the ambiguous-drop counter.
// Banner shape: "...; dropped N ambiguous bare-call edges"
export function ambiguousDropped(stderr) {
  const m = /dropped (\d+) ambiguous/.exec(stderr);
  return m ? Number(m[1]) : null;
}

// In-degree of a node id within a fragment/graph edge list (call edges by default).
export function indegree(edges, id, kind = null) {
  return edges.filter((e) => e.to === id && (kind == null || e.kind === kind)).length;
}

export function hasEdge(edges, from, to, kind = null) {
  return edges.some((e) => e.from === from && e.to === to && (kind == null || e.kind === kind));
}
