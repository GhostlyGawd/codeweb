// BDD scenario spine for scripts/mcp-server.mjs (docs/specs/round2-ws-f.md §S1–S7). Driven by the
// long-lived tests/mcp-harness.mjs so a scenario can send a frame AFTER observing a trace event —
// the thing spawnSync batching cannot express. Cross-request ORDERING is asserted on CODEWEB_MCP_TRACE
// events (start/end/kill), never wall-clock; bursts whose enqueue order matters go out as ONE stdin
// write (sendBurst) so line order == enqueue order in a single readline drain. Queue invariants
// I1–I6 each carry an assertion here or in mcp.test.mjs (unit level).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { startServer, initServer } from './mcp-harness.mjs';
import { tmpDir, cleanup, script, writeTree, runNode, readJSON } from './helpers.mjs';

const TRACE_ENV = { CODEWEB_MCP_TRACE: '1', CODEWEB_NO_AUTOREFRESH: '1' };

// A real mapped workspace (run.mjs over a small tree) — graph.json with meta.root on disk plus the
// map-time sidecars. Shared by the read-only scenarios (find_similar, sidecar checks, advisors).
let MAPPED, MGRAPH;
before(() => {
  MAPPED = tmpDir('codeweb-scn-map-');
  const src = join(MAPPED, 'src');
  writeTree(src, {
    'main.js': 'import { helper } from "./util.js";\nexport function main() { return helper(2) + helper(3); }\n',
    'util.js': 'export function helper(x) {\n  if (x > 0) return x * 2;\n  return 0;\n}\nexport function spare(y) {\n  return y + 1;\n}\n',
  });
  const out = join(MAPPED, '.codeweb');
  const r = runNode(script('run.mjs'), [src, '--out-dir', out]);
  assert.equal(r.status, 0, `map fixture built: ${r.stderr}`);
  MGRAPH = join(out, 'graph.json');
});
after(() => { if (MAPPED) cleanup(MAPPED); });

// ---- S1 epipe-survival -------------------------------------------------------------------------
// The IMPROVEMENTS #29 repro: find_similar with a >64KB body and a bad graph path makes the child
// die before draining stdin; the flush EPIPEd and crashed the whole server (exit 1, request
// unanswered, all tools dead). The guard turns it into a normal isError result.
test('S1a epipe-survival: find_similar 1MB body + bad graph → isError result, and the server still answers a later ping (alive, exit 0)', async () => {
  const h = startServer({ env: TRACE_ENV });
  try {
    await initServer(h);
    const body = 'x'.repeat(1024 * 1024); // 1 MB — well past the 64KB pipe buffer
    h.send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'codeweb_find_similar', arguments: { graph: '/no/such/dir/nope.json', body } } });
    const r2 = await h.reply(2);
    assert.ok(!r2.error, 'find_similar is a tools/call result, not a JSON-RPC crash');
    assert.ok(r2.result.isError, 'the failed child surfaces as isError:true');
    // The server is ALIVE — a subsequent ping answers (the crash used to kill it here).
    h.send({ jsonrpc: '2.0', id: 3, method: 'ping' });
    const r3 = await h.reply(3);
    assert.ok(r3.result && !r3.error, 'ping answered after the EPIPE-prone call — server survived');
    h.close();
    const { code } = await h.exited;
    assert.equal(code, 0, 'clean exit on stdin close');
  } finally { h.child.kill('SIGKILL'); }
});

// Second half (T-29.2c): the client closes its stdout read end mid-reply burst. The server inherits
// lib/cli.mjs:19's process.stdout EPIPE→exit(0) handler via the import side effect; this pins it (and
// fails if that import is ever dropped). We flood enough replies that writes are still pending when we
// destroy the read end, so the EPIPE actually fires.
test('S1b epipe-survival: client closes its stdout read end mid-burst → server exits 0 (inherited cli.mjs guard)', async () => {
  const h = startServer({ env: TRACE_ENV });
  try {
    await initServer(h);
    // A big burst of tools/list replies (each ~kBs) overruns the 64KB pipe buffer.
    const burst = [];
    for (let i = 0; i < 400; i++) burst.push({ jsonrpc: '2.0', id: 1000 + i, method: 'tools/list' });
    h.sendBurst(burst);
    // Destroy our read end almost immediately — the server's pending writes now EPIPE.
    setTimeout(() => h.destroyStdout(), 5);
    const { code } = await h.exited;
    assert.equal(code, 0, 'server exits 0 on stdout EPIPE (never a crash / non-zero)');
  } finally { h.child.kill('SIGKILL'); }
});
