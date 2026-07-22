// BDD scenario spine for scripts/mcp-server.mjs (docs/specs/round2-ws-f.md §S1–S7). Driven by the
// long-lived tests/mcp-harness.mjs so a scenario can send a frame AFTER observing a trace event —
// the thing spawnSync batching cannot express. Cross-request ORDERING is asserted on CODEWEB_MCP_TRACE
// events (start/end/kill), never wall-clock; bursts whose enqueue order matters go out as ONE stdin
// write (sendBurst) so line order == enqueue order in a single readline drain. Queue invariants
// I1–I6 each carry an assertion here or in mcp.test.mjs (unit level).

import { test } from 'node:test';
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
// Await server exit, but FAIL FAST (never hang CI) if it doesn't happen — returns { code, signal }.
const exited = (h, ms = 10000) => Promise.race([
  h.exited,
  new Promise((_, rej) => setTimeout(() => rej(new Error(`server did not exit within ${ms}ms`)), ms)),
]);

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
    const { code } = await exited(h);
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
    const { code } = await exited(h);
    assert.equal(code, 0, 'server exits 0 on stdout EPIPE (never a crash / non-zero)');
  } finally { h.child.kill('SIGKILL'); }
});

// ---- S2 refresh-then-diff-parallel-ordering (I6/I2: the diff waits for the earlier-queued writer) -
// The #30 bug: diff was graphless ('(graphless)' slot) while refresh keyed to the graph path, so
// fired together diff completed BEFORE refresh and gated against stale bytes. Now both key to the
// workspace dir (diff via queueFrom=after) so the diff waits for the refresh. NOTE the tree changed
// under this test across the workstream: #33 moved codeweb_diff IN-PROCESS (it awaits the after-
// workspace writerTail per I6, then serves from cachedGraph — refresh is now the loop's ONLY child),
// so there is no `start(diff)` child event any more. The ordering is asserted by the DETERMINISTIC
// post-refresh PAYLOAD: cachedGraph re-stats after the refresh's writerTail resolves, so the diff
// sees the edit's node — impossible if it had not waited (the #30 regression) — plus end(refresh)
// fired and the diff spawned NO child (the #33 fast path engaged).
test('S2 refresh→diff in one burst: the diff reads POST-refresh bytes (waited, I6) and is served in-process (no child)', async () => {
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
    // MECHANISM (deterministic): the diff read post-refresh bytes — it awaited the refresh writer tail (I6).
    assert.ok(payload.nodes.added.includes('util.js:brandNewFn'), `diff read post-refresh bytes (added: ${payload.nodes.added})`);
    const ev = h.trace();
    assert.ok(ev.some((e) => e.ev === 'end' && e.tool === 'codeweb_refresh' && e.id === 10), 'the refresh writer ran to completion');
    assert.ok(!ev.some((e) => e.ev === 'start' && e.id === 11), 'the diff was served IN-PROCESS (#33) — no child spawned; refresh is the loop\'s only child');
    h.close(); assert.equal((await exited(h)).code, 0);
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
    h.close(); assert.equal((await exited(h)).code, 0);
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
    h.close(); assert.equal((await exited(h)).code, 0);
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
    assert.equal((await exited(h)).code, 0, 'server drains and exits 0 after the cancel');
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
    h.close(); assert.equal((await exited(h)).code, 0);
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
    h.close(); assert.equal((await exited(h)).code, 0);
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
    h.close(); assert.equal((await exited(h)).code, 0);
  } finally { h.child.kill('SIGKILL'); cleanup(dir); }
});

// ---- S6 reader-overlap (I4: two readers on one workspace run CONCURRENTLY, ≈ max not sum) --------
// Before #32 every spawned tool on one workspace chained on a single tail, so hotspots-behind-risk ≈
// risk+hotspots (measured 203–225 ms ≈ sum). Now readers overlap under READER_CAP. DETERMINISM: a
// WRITER (refresh) barrier fronts the burst — both readers capture ITS writerTail at enqueue (I2) and
// are released by the SAME promise resolution, so their `.then` continuations run in ONE microtask
// drain and both `start` events fire before either child's `end` (a later I/O tick) — independent of
// stdin-chunk / enqueue jitter that a bare two-reader burst is subject to under load. Timing is never
// asserted, only the trace interleaving (I4 permits the overlap the pre-#32 single tail forbade).
test('S6 reader-overlap: two readers released together by a writer barrier → both start before either ends (I4)', async () => {
  const { dir, graph } = mapFresh('codeweb-scn-s6-');
  const h = startServer({ env: TRACE_ENV });
  try {
    await initServer(h);
    h.sendBurst([
      { jsonrpc: '2.0', id: 59, method: 'tools/call', params: { name: 'codeweb_refresh', arguments: { graph } } }, // barrier writer
      { jsonrpc: '2.0', id: 60, method: 'tools/call', params: { name: 'codeweb_risk', arguments: { graph } } },
      { jsonrpc: '2.0', id: 61, method: 'tools/call', params: { name: 'codeweb_hotspots', arguments: { graph } } },
    ]);
    for (const id of [59, 60, 61]) await h.reply(id);
    const ev = h.trace().filter((e) => e.id === 60 || e.id === 61); // reader events only
    const starts = ev.map((e, i) => ({ e, i })).filter((x) => x.e.ev === 'start').map((x) => x.i);
    const ends = ev.map((e, i) => ({ e, i })).filter((x) => x.e.ev === 'end').map((x) => x.i);
    assert.equal(starts.length, 2, 'both readers spawned a child');
    assert.equal(ends.length, 2, 'both readers ended');
    assert.ok(Math.max(...starts) < Math.min(...ends), 'both start events precede either end — concurrent (I4), not serialized');
    h.close(); assert.equal((await exited(h)).code, 0);
  } finally { h.child.kill('SIGKILL'); cleanup(dir); }
});

// ---- READER_CAP: 4 readers released together never exceed 3 concurrent children (I4) -------------
test('I4 cap: 4 readers released by a writer barrier peak at exactly READER_CAP=3 concurrent (never 4)', async () => {
  const { dir, graph } = mapFresh('codeweb-scn-cap-');
  const h = startServer({ env: TRACE_ENV });
  try {
    await initServer(h);
    h.sendBurst([
      { jsonrpc: '2.0', id: 69, method: 'tools/call', params: { name: 'codeweb_refresh', arguments: { graph } } }, // barrier writer
      { jsonrpc: '2.0', id: 70, method: 'tools/call', params: { name: 'codeweb_risk', arguments: { graph } } },
      { jsonrpc: '2.0', id: 71, method: 'tools/call', params: { name: 'codeweb_hotspots', arguments: { graph } } },
      { jsonrpc: '2.0', id: 72, method: 'tools/call', params: { name: 'codeweb_deadcode', arguments: { graph } } },
      { jsonrpc: '2.0', id: 73, method: 'tools/call', params: { name: 'codeweb_break_cycles', arguments: { graph } } },
    ]);
    for (const id of [69, 70, 71, 72, 73]) await h.reply(id);
    // count only the 4 READER children — the barrier writer (69) ran to completion before any of them.
    const readerIds = new Set([70, 71, 72, 73]);
    let active = 0, peak = 0;
    for (const e of h.trace()) { if (!readerIds.has(e.id)) continue; if (e.ev === 'start') { active++; peak = Math.max(peak, active); } else if (e.ev === 'end') active--; }
    assert.ok(peak <= 3, `never more than READER_CAP=3 children alive at once (peak was ${peak})`);
    assert.ok(peak >= 2, `readers DID overlap (peak ${peak}) — not accidentally serialized`);
    h.close(); assert.equal((await exited(h)).code, 0);
  } finally { h.child.kill('SIGKILL'); cleanup(dir); }
});

// ---- writer-barrier (I2 + I3): a writer waits for an earlier reader; a later reader waits for it ---
test('I2/I3 writer-barrier: [reader, writer, reader] one burst → end(reader1) ≤ start(writer) < start(reader2)', async () => {
  const { dir, graph } = mapFresh('codeweb-scn-barrier-');
  const h = startServer({ env: TRACE_ENV });
  try {
    await initServer(h);
    // reader1 (risk) is registered in readersInFlight at enqueue; the writer (refresh) snapshots it and
    // waits (I3); reader2 (hotspots) captures the writer's tail and waits for it (I2). One drain → order.
    h.sendBurst([
      { jsonrpc: '2.0', id: 80, method: 'tools/call', params: { name: 'codeweb_risk', arguments: { graph } } },
      { jsonrpc: '2.0', id: 81, method: 'tools/call', params: { name: 'codeweb_refresh', arguments: { graph } } },
      { jsonrpc: '2.0', id: 82, method: 'tools/call', params: { name: 'codeweb_hotspots', arguments: { graph } } },
    ]);
    for (const id of [80, 81, 82]) await h.reply(id);
    const ev = h.trace();
    const endReader1 = traceIx(ev, (e) => e.ev === 'end' && e.id === 80);
    const startWriter = traceIx(ev, (e) => e.ev === 'start' && e.id === 81);
    const startReader2 = traceIx(ev, (e) => e.ev === 'start' && e.id === 82);
    assert.ok(endReader1 >= 0 && startWriter >= 0 && startReader2 >= 0, `boundary events present (end#80=${endReader1}, start#81=${startWriter}, start#82=${startReader2})`);
    assert.ok(endReader1 <= startWriter, 'the writer waits for the earlier-queued reader to finish (I3)');
    assert.ok(startWriter < startReader2, 'the later reader waits for the writer (I2)');
    h.close(); assert.equal((await exited(h)).code, 0);
  } finally { h.child.kill('SIGKILL'); cleanup(dir); }
});

// ---- cancel-during-diff-fast-path (T-34.1 × #33 I6): the async non-child path suppresses too ------
// The #33 diff fast path is the ONE async non-child path. It awaits the after-workspace writerTail;
// a cancel while it awaits must suppress its reply (no child to kill — a no-op kill + the cancelled
// flag). We queue a slow writer (refresh) ahead of the diff so the diff is provably still awaiting.
test('cancel-during-diff-fast-path: cancel while the diff awaits the writer tail → NO reply, ping answers', async () => {
  const { dir, src, graph } = mapFresh('codeweb-scn-cdf-');
  const before = join(dir, 'before.json');
  writeFileSync(before, readFileSync(graph));
  writeFileSync(join(src, 'util.js'), readFileSync(join(src, 'util.js'), 'utf8') + '\nexport function slowly() { return 1; }\n');
  const h = startServer({ env: TRACE_ENV });
  try {
    await initServer(h);
    // refresh (writer) + diff (fast path, awaits the refresh tail) in one burst.
    h.sendBurst([
      { jsonrpc: '2.0', id: 90, method: 'tools/call', params: { name: 'codeweb_refresh', arguments: { graph } } },
      { jsonrpc: '2.0', id: 91, method: 'tools/call', params: { name: 'codeweb_diff', arguments: { before, after: graph } } },
    ]);
    await h.traceEvent((e) => e.ev === 'start' && e.id === 90); // refresh running → diff is awaiting its tail
    h.send({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 91, reason: 'user' } });
    await h.reply(90); // refresh completes; the diff's suppressed attempt runs on its tail
    h.send({ jsonrpc: '2.0', id: 92, method: 'ping' });
    await h.reply(92);
    h.close();
    assert.equal((await exited(h)).code, 0, 'server drains and exits 0');
    assert.ok(!h.responses().some((r) => r.id === 91), 'the cancelled diff fast path emitted NO reply');
  } finally { h.child.kill('SIGKILL'); cleanup(dir); }
});
