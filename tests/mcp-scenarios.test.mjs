// BDD scenario spine for scripts/mcp-server.mjs (docs/specs/round2-ws-f.md §S1–S7). Driven by the
// long-lived tests/mcp-harness.mjs so a scenario can send a frame AFTER observing a trace event —
// the thing spawnSync batching cannot express. Cross-request ORDERING is asserted on CODEWEB_MCP_TRACE
// events (start/end/kill), never wall-clock; bursts whose enqueue order matters go out as ONE stdin
// write (sendBurst) so line order == enqueue order in a single readline drain. Queue invariants
// I1–I6 each carry an assertion here or in mcp.test.mjs (unit level).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { writeFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import { startServer, initServer } from './mcp-harness.mjs';
import { tmpDir, cleanup, script, writeTree, runNode, readJSON } from './helpers.mjs';
import { loadBriefSidecar } from '../scripts/lib/brief-sidecar.mjs';
import { loadSimilarIndex } from '../scripts/lib/similar-index.mjs';

const TRACE_ENV = { CODEWEB_MCP_TRACE: '1', CODEWEB_NO_AUTOREFRESH: '1' };

// Map a fresh isolated workspace (mutating scenarios each get their own). Returns { dir, src, graph }.
function mapFresh(prefix) {
  const dir = tmpDir(prefix);
  const src = join(dir, 'src');
  writeTree(src, {
    'main.js': 'import { helper } from "./util.js";\nexport function main() { return helper(2) + helper(3); }\n',
    'util.js': 'export function helper(x) {\n  if (x > 0) return x * 2;\n  return 0;\n}\n',
  });
  const out = join(dir, '.codeweb');
  const r = runNode(script('run.mjs'), [src, '--out-dir', out]);
  assert.equal(r.status, 0, `mapFresh built: ${r.stderr}`);
  return { dir, src, graph: join(out, 'graph.json') };
}
// index of the first trace event matching pred, or -1.
const traceIx = (events, pred) => events.findIndex(pred);

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

// ---- S2 refresh-then-diff-parallel-ordering (I2: a reader waits for an earlier-queued writer) ---
// The #30 bug: diff was graphless ('(graphless)' slot) while refresh keyed to the graph path, so
// fired together diff completed BEFORE refresh and gated against stale bytes. Now both key to the
// workspace dir (diff via queueFrom=after), so diff waits — and reads the post-refresh graph.
test('S2 refresh→diff in one burst: end(refresh) < start(diff), and diff reads the post-refresh edit', async () => {
  const { dir, src, graph } = mapFresh('codeweb-scn-s2-');
  const h = startServer({ env: TRACE_ENV });
  try {
    await initServer(h);
    const before = join(dir, 'before.json');
    writeFileSync(before, readFileSync(graph));                       // pre-edit snapshot
    writeFileSync(join(src, 'util.js'), readFileSync(join(src, 'util.js'), 'utf8') + '\nexport function brandNewFn(z) {\n  return z * 7;\n}\n'); // on-disk edit
    // ONE stdin write, refresh line first — enqueue order == line order in a single drain.
    h.sendBurst([
      { jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'codeweb_refresh', arguments: { graph } } },
      { jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'codeweb_diff', arguments: { before, after: graph } } },
    ]);
    const rDiff = await h.reply(11);
    await h.reply(10);
    const payload = JSON.parse(rDiff.result.content[0].text);
    assert.ok(payload.nodes.added.includes('util.js:brandNewFn'), `diff read post-refresh bytes (added: ${payload.nodes.added})`);
    // MECHANISM: end(refresh) strictly precedes start(diff) in the trace stream.
    const ev = h.trace();
    const endRefresh = traceIx(ev, (e) => e.ev === 'end' && e.tool === 'codeweb_refresh' && e.id === 10);
    const startDiff = traceIx(ev, (e) => e.ev === 'start' && e.tool === 'codeweb_diff' && e.id === 11);
    assert.ok(endRefresh >= 0 && startDiff >= 0, `both events present (end#refresh=${endRefresh}, start#diff=${startDiff})`);
    assert.ok(endRefresh < startDiff, 'refresh completes before diff starts (I2 ordering holds under parallel fire)');
    h.close(); assert.equal((await h.exited).code, 0);
  } finally { h.child.kill('SIGKILL'); cleanup(dir); }
});

// ---- S3 map-concurrency-serialization (I1: writers on one workspace never overlap, FIFO) --------
test('S3 two codeweb_map on one out dir in a burst: end(map#1) < start(map#2), surviving graph parses', async () => {
  const target = tmpDir('codeweb-scn-s3-');
  const out = join(target, '.codeweb');
  writeTree(join(target, 'src'), { 'a.js': 'export function alpha() { return beta(); }\nfunction beta() { return 1; }\n' });
  const h = startServer({ env: TRACE_ENV });
  try {
    await initServer(h);
    h.sendBurst([
      { jsonrpc: '2.0', id: 20, method: 'tools/call', params: { name: 'codeweb_map', arguments: { target: join(target, 'src'), out } } },
      { jsonrpc: '2.0', id: 21, method: 'tools/call', params: { name: 'codeweb_map', arguments: { target: join(target, 'src'), out } } },
    ]);
    const r20 = await h.reply(20); const r21 = await h.reply(21);
    assert.ok(!r20.result.isError && !r21.result.isError, 'both maps succeed');
    const ev = h.trace();
    const endMap1 = traceIx(ev, (e) => e.ev === 'end' && e.id === 20);
    const startMap2 = traceIx(ev, (e) => e.ev === 'start' && e.id === 21);
    assert.ok(endMap1 >= 0 && startMap2 >= 0, `both boundary events present (end#20=${endMap1}, start#21=${startMap2})`);
    assert.ok(endMap1 < startMap2, 'map#1 finishes before map#2 starts — no stage-by-stage interleave (I1)');
    assert.ok(readJSON(join(out, 'graph.json')).nodes.length >= 1, 'the surviving workspace parses green');
    h.close(); assert.equal((await h.exited).code, 0);
  } finally { h.child.kill('SIGKILL'); cleanup(target); }
});

// ---- I7 / T-31.2 autoRefresh-skip: a queued explicit writer suppresses the internal autoRefresh ---
// autoRefresh runs WITH freshness enabled here (no CODEWEB_NO_AUTOREFRESH). A stale workspace + an
// explicit refresh queued in the same drain → writersPending>0 → skip-autorefresh, exactly ONE
// refresh child spawns (the explicit one), never two concurrent extracts on one scan cache.
test('I7 autoRefresh-skip: explicit refresh + a stale-triggering query in one burst → skip-autorefresh, ONE refresh child', async () => {
  const { dir, src, graph } = mapFresh('codeweb-scn-i7-');
  const h = startServer({ env: { CODEWEB_MCP_TRACE: '1' } }); // autoRefresh ENABLED
  try {
    await initServer(h);
    // Make the graph stale: edit a source file so meta.sources stamps mismatch disk.
    writeFileSync(join(src, 'util.js'), readFileSync(join(src, 'util.js'), 'utf8') + '\nexport function extra() { return 9; }\n');
    h.sendBurst([
      { jsonrpc: '2.0', id: 30, method: 'tools/call', params: { name: 'codeweb_refresh', arguments: { graph } } },
      { jsonrpc: '2.0', id: 31, method: 'tools/call', params: { name: 'codeweb_impact', arguments: { graph, symbol: 'util.js:helper' } } },
    ]);
    await h.reply(31); await h.reply(30);
    const ev = h.trace();
    assert.ok(ev.some((e) => e.ev === 'skip-autorefresh' && e.ws === dirname(graph)), 'autoRefresh skipped because a writer is already queued (I7)');
    const refreshStarts = ev.filter((e) => e.ev === 'start' && e.tool === 'codeweb_refresh');
    assert.equal(refreshStarts.length, 1, 'exactly ONE refresh child spawned (the explicit one, not autoRefresh too)');
    h.close(); assert.equal((await h.exited).code, 0);
  } finally { h.child.kill('SIGKILL'); cleanup(dir); }
});

// ---- S4 cancellation-kills-child (T-34.1, I5: cancel suppresses the reply, still releases) -------
test('S4 cancellation-kills-child: notifications/cancelled on a running map → trace kill, NO reply for its id, ping answers, exit 0', async () => {
  const target = tmpDir('codeweb-scn-s4-');
  const out = join(target, '.codeweb');
  writeTree(join(target, 'src'), { 'a.js': 'export function alpha() { return 1; }\n' });
  const h = startServer({ env: TRACE_ENV });
  try {
    await initServer(h);
    h.send({ jsonrpc: '2.0', id: 40, method: 'tools/call', params: { name: 'codeweb_map', arguments: { target: join(target, 'src'), out } } });
    await h.traceEvent((e) => e.ev === 'start' && e.id === 40 && e.tool === 'codeweb_map'); // map child spawned
    h.send({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 40, reason: 'user' } });
    const kill = await h.traceEvent((e) => e.ev === 'kill' && e.id === 40);
    assert.equal(kill.reason, 'cancel', 'child killed by the cancel (not a timeout)');
    h.send({ jsonrpc: '2.0', id: 41, method: 'ping' });
    await h.reply(41); // server is alive
    h.close();
    assert.equal((await h.exited).code, 0, 'server drains and exits 0 after the cancel');
    assert.ok(!h.responses().some((r) => r.id === 40), 'no reply for the cancelled map (drain bounds the negative assertion)');
    assert.ok(!existsSync(join(out, 'graph.json')), 'killed before the report stage — no graph.json written');
  } finally { h.child.kill('SIGKILL'); cleanup(target); }
});

// ---- S7 malformed-and-batch-frames (T-34.2 / T-34.3) -------------------------------------------
test('S7 malformed-and-batch-frames: 42, "x", null, [] each answer ONE -32600 (id:null); a following ping answers', async () => {
  const h = startServer({ env: TRACE_ENV });
  try {
    await initServer(h);
    const frames = ['42', '"x"', 'null', '[]'];
    for (let i = 0; i < frames.length; i++) {
      h.sendRaw(frames[i]);
      h.send({ jsonrpc: '2.0', id: 200 + i, method: 'ping' });
      await h.reply(200 + i); // the later ping proves the malformed frame was processed (no hang)
    }
    const invalid = h.responses().filter((r) => r.id === null && r.error && r.error.code === -32600);
    assert.equal(invalid.length, 4, 'one Invalid Request per frame (three scalars + the empty array), never a silent drop');
    h.close(); assert.equal((await h.exited).code, 0);
  } finally { h.child.kill('SIGKILL'); }
});

test('T-34.3 batch fan-out: [{ping id:9},{unknown-tool id:10}] → normal reply for 9 AND -32602 for 10 as individual lines; notifications stay silent', async () => {
  const h = startServer({ env: TRACE_ENV });
  try {
    await initServer(h);
    h.sendRaw(JSON.stringify([{ jsonrpc: '2.0', id: 9, method: 'ping' }, { jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'codeweb_nope', arguments: {} } }]));
    const r9 = await h.reply(9); const r10 = await h.reply(10);
    assert.ok(r9.result && !r9.error, 'ping member answered normally under its own id');
    assert.equal(r10.error.code, -32602, 'unknown-tool member → its own -32602 line (not collected into an array)');
    // [1,2] → two -32600; a batch of only a notification → silence, but a later ping still answers.
    h.sendRaw('[1,2]');
    h.sendRaw(JSON.stringify([{ jsonrpc: '2.0', method: 'notifications/initialized' }]));
    h.send({ jsonrpc: '2.0', id: 12, method: 'ping' });
    await h.reply(12);
    const invalid = h.responses().filter((r) => r.id === null && r.error && r.error.code === -32600);
    assert.equal(invalid.length, 2, '[1,2] → exactly two -32600 lines; the notification-only batch stays silent');
    h.close(); assert.equal((await h.exited).code, 0);
  } finally { h.child.kill('SIGKILL'); }
});

// ---- S5 refresh-preserves-sidecars (BY MECHANISM: stamps match, not wall-clock) ----------------
// A refresh used to rewrite graph.json but leave brief/index-lite/similar-index stale until the next
// full map, so every hook + find_similar fast path lost its floor. #25 rebuilds the trio in refresh.
// We assert by MECHANISM: after codeweb_refresh, all three loaders return non-null AND their stamps
// equal statSync(graph.json) — the exact freshness check the hooks run (never a timing measurement).
test('S5 refresh-preserves-sidecars: after codeweb_refresh all three sidecars are FRESH (stamps === statSync(graph.json))', async () => {
  const { dir, src, graph } = mapFresh('codeweb-scn-s5-');
  const cw = dirname(graph);
  assert.ok(existsSync(join(cw, 'brief.json')) && existsSync(join(cw, 'index-lite.json')) && existsSync(join(cw, 'similar-index.json')), 'map wrote the trio');
  const h = startServer({ env: TRACE_ENV });
  try {
    await initServer(h);
    writeFileSync(join(src, 'util.js'), readFileSync(join(src, 'util.js'), 'utf8') + '\nexport function fresh() { return 42; }\n');
    h.send({ jsonrpc: '2.0', id: 50, method: 'tools/call', params: { name: 'codeweb_refresh', arguments: { graph } } });
    const r = await h.reply(50);
    assert.ok(!r.result.isError, 'refresh succeeded');
    const payload = JSON.parse(r.result.content[0].text);
    assert.deepEqual(payload.sidecars, ['brief', 'index-lite', 'similar-index'], 'refresh reports the rebuilt trio');
    // MECHANISM: the loaders validate against graph.json's stat — non-null means the hook fast path engages.
    const st = statSync(graph);
    const stamp = { graphMtimeMs: st.mtimeMs, graphSize: st.size };
    assert.ok(loadBriefSidecar(graph), 'brief sidecar loads (fresh) against the refreshed graph');
    const sim = loadSimilarIndex(graph);
    assert.ok(sim, 'similar-index loads (fresh) — find_similar stops falling back to live');
    assert.deepEqual(sim.stamp, stamp, 'similar-index stamp === statSync(graph.json)');
    const lite = JSON.parse(readFileSync(join(cw, 'index-lite.json'), 'utf8'));
    assert.deepEqual(lite.stamp, stamp, 'index-lite stamp === statSync(graph.json)');
    const brief = JSON.parse(readFileSync(join(cw, 'brief.json'), 'utf8'));
    assert.deepEqual(brief.stamp, stamp, 'brief stamp === statSync(graph.json)');
    h.close(); assert.equal((await h.exited).code, 0);
  } finally { h.child.kill('SIGKILL'); cleanup(dir); }
});
