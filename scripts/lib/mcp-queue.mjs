// The MCP server's per-workspace child queue (#30/#31/#32), extracted whole in D2's split —
// the invariants and their scenario/unit pins (tests/mcp-queue.test.mjs, mcp-scenarios.test.mjs)
// are the contract; the aggressive 'writers skip readers' variant was reviewed and REJECTED
// (torn multi-artifact reads) — do not reintroduce it without per-result graph-stamp labeling.
//
// spawnQueues was keyed by the graph FILE path, so refresh (keyed by its graph) and diff (keyed by
// the shared '(graphless)' slot) never collided — the ordering the old comment promised did not
// hold. State is per-WORKSPACE-DIRECTORY: every graph tool, map, and keyed-graphless tool (diff)
// normalizes to the dir that holds graph.json / the map out dir, so operations on ONE workspace
// order correctly and different workspaces run concurrently. Draining rules = invariants I1–I7
// (WS-F spec):
//  I1 writers on one workspace never overlap, FIFO (chain on writerTail);
//  I2 a reader never starts before an earlier-QUEUED writer (awaits the writerTail snapshot at enqueue);
//  I3 a writer also waits for every reader ENQUEUED BEFORE it (join of writerTail + a readersInFlight
//     snapshot) — the CONSERVATIVE rule: a spawned reader makes MULTIPLE workspace reads (graph.json
//     then a sidecar), and a writer landing mid-read hands it a torn old/new state today's full
//     serialization makes impossible; preserving that linearization is the contract;
//  I4 readers run concurrently under a GLOBAL cap of READER_CAP children (FIFO waiters); a reader
//     acquires its slot only AFTER its I2 writerTail wait resolves and holds it only while its child
//     runs, so a reader blocked on a writer holds no slot (no cross-workspace starvation/deadlock);
//  I5 every job settles exactly once and always releases slot + writersPending + inflight + end();
//  I7 writersPending increments synchronously at enqueue so autoRefresh's same-drain skip is race-free.
// #32's win is reader-reader overlap (two advisors ≈ max, not sum). READER_CAP=1 restores full
// serialization (the rollback lever).

import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';

// writers = the tools that MUTATE a workspace (graph consumers must re-read after them) + the
// internal autoRefresh + map; every other spawned tool and fast-path fallback spawn is a reader.
export const WRITER_TOOLS = new Set(['codeweb_refresh', 'codeweb_annotate', 'codeweb_map']);

// THE queue key: graph tools -> dir of graph.json; map -> resolve(out); keyed-graphless (diff) ->
// dir of queueFrom(args). All normalize to one workspace-dir identity (T-30.1). '(graphless)' is a
// defensive fallback, unreachable today (only diff+map are graphless; diff has queueFrom, map is
// keyed by out above) — a unit pins that. Pure, so tests import it without a server.
export function queueKeyFor(tool, args, graphPath) {
  if (tool.map) return resolve(args.out || join(resolve(args.target || process.cwd()), '.codeweb'));
  if (tool.graphless) {
    const from = tool.queueFrom && tool.queueFrom(args);
    return from ? dirname(resolve(from)) : '(graphless)';
  }
  return dirname(resolve(graphPath));
}

/**
 * Build a queue instance wired to the host's lifecycle: `trace(ev, obj)` for the debug stream,
 * `begin()` when a job is accepted (the server counts pending async work), `end()` on every
 * settle path (the server drains-then-exits on stdin close). Returns { enqueueChild, wsOf,
 * inflight } — inflight is the id -> { kill, cancelled } map the cancel notification uses.
 */
export function createWorkspaceQueue({ trace, begin, end }) {
  const workspaces = new Map(); // wsKey -> { writerTail: Promise, writersPending: int, readersInFlight: Set<Promise> }
  function wsOf(key) {
    let w = workspaces.get(key);
    if (!w) { w = { writerTail: Promise.resolve(), writersPending: 0, readersInFlight: new Set() }; workspaces.set(key, w); }
    return w;
  }
  // I4: a global reader concurrency cap with a FIFO waiter queue. A released slot is handed DIRECTLY
  // to the next waiter (count unchanged) so ordering is preserved; only an unclaimed release grows
  // the count.
  const READER_CAP = 3;
  let readerSlots = READER_CAP;
  const readerWaiters = [];
  const acquireReaderSlot = () => (readerSlots > 0 ? (readerSlots--, Promise.resolve()) : new Promise((res) => readerWaiters.push(res)));
  const releaseReaderSlot = () => { const next = readerWaiters.shift(); if (next) next(); else readerSlots++; };
  const inflight = new Map(); // request id -> { kill, cancelled } (#34: id→child; runChild owns it)

  // THE one child wrapper (T-31.1): owns spawn/timeout/settle-once/trace/inflight for map,
  // autoRefresh AND every spawned tool — so the settle-once guard, the #34 cancel hook, and the
  // trace hook plug in ONCE. Guards the error+close DOUBLE-fire (Node: 'close' may or may not
  // follow 'error') with `settled`. onSettle shapes the reply and is NEVER called on a cancel (a
  // cancelled request gets no response, MCP). Resolves (never rejects) on settle.
  function runChild(id, entry, spec, releaseAll) {
    return new Promise((resolve_) => {
      const key = spec.key, tool = spec.tool;
      if (entry && entry.cancelled) { // cancelled while still queued — never spawn (I5)
        trace('kill', { id, tool, ws: key, pid: null, reason: 'cancel' });
        releaseAll(); return resolve_();
      }
      let settled = false, timedOut = false, child = null, timer = null, out = '', errBuf = '';
      const finish = (code) => {
        if (settled) return; settled = true;
        if (timer) clearTimeout(timer);
        const pid = child ? child.pid : null;
        if (entry && entry.cancelled) trace('kill', { id, tool, ws: key, pid, reason: 'cancel' });
        else if (timedOut) trace('kill', { id, tool, ws: key, pid, reason: 'timeout' });
        else trace('end', { id, tool, ws: key, pid });
        if (!(entry && entry.cancelled)) spec.onSettle({ code, out, errBuf, timedOut }); // cancel suppresses the reply (I5)
        releaseAll(); resolve_();
      };
      try { child = spawn(process.execPath, [spec.bin, ...spec.argv], { stdio: spec.stdio }); }
      catch (e) { errBuf = (e && e.message) || 'spawn failed'; return finish(null); }
      if (entry) entry.kill = () => { try { child.kill('SIGKILL'); } catch { /* raced exit */ } };
      trace('start', { id, tool, ws: key, pid: child.pid });
      timer = setTimeout(() => { timedOut = true; try { child.kill('SIGKILL'); } catch { /* raced exit */ } }, spec.timeoutMs);
      if (child.stdout) child.stdout.on('data', (d) => { out += d; });
      if (child.stderr) child.stderr.on('data', (d) => { errBuf += d; if (errBuf.length > 65536) errBuf = errBuf.slice(-32768); if (spec.onStderr) spec.onStderr(String(d)); });
      if (spec.input != null && child.stdin) {
        // #29: guard the stdin flush (async EPIPE + sync ERR_STREAM_DESTROYED + null stdin).
        try { child.stdin.on('error', () => {}); child.stdin.end(spec.input); }
        catch { /* destroyed/absent — the close/error path settles */ }
      }
      child.on('error', () => finish(null)); // double-fire guarded by `settled`
      child.on('close', (code) => finish(code));
    });
  }

  // Enqueue a child on its workspace. writersPending increments SYNCHRONOUSLY here (I7), before any
  // await. WRITERS chain on the join of writerTail + an enqueue-time readersInFlight snapshot (I1
  // FIFO + I3 conservative) and skip the slot gate. READERS capture writerTail at enqueue (I2),
  // await it, THEN acquire one global reader slot (I4) held only while the child runs; a reader is
  // registered in readersInFlight from enqueue until settle so a later writer (I3) waits for it.
  // releaseAll runs exactly once on every settle path (I5): releases the slot, deletes inflight,
  // decrements writersPending / removes from readersInFlight, calls end().
  function enqueueChild(id, spec) {
    const w = wsOf(spec.key);
    const entry = (id != null) ? { kill: () => {}, cancelled: false } : null;
    if (entry) inflight.set(id, entry);
    begin();

    if (spec.kind === 'writer') {
      w.writersPending++; // I7: before any await
      const readerSnapshot = [...w.readersInFlight]; // I3: readers enqueued before this writer
      let released = false;
      const releaseAll = () => { if (released) return; released = true; if (entry) inflight.delete(id); w.writersPending--; end(); };
      const job = Promise.allSettled([w.writerTail, ...readerSnapshot]).then(() => runChild(id, entry, spec, releaseAll));
      w.writerTail = job; // I1: the next writer chains after this one
      return job;
    }

    // reader
    let released = false, slotHeld = false, job;
    const releaseAll = () => {
      if (released) return; released = true;
      if (slotHeld) { releaseReaderSlot(); slotHeld = false; }
      if (entry) inflight.delete(id);
      w.readersInFlight.delete(job);
      end();
    };
    const tail = w.writerTail; // I2: snapshot the writer tail at enqueue
    job = tail.then(async () => {
      if (entry && entry.cancelled) return; // cancelled while queued behind a writer: acquire no slot
      await acquireReaderSlot();            // I4: only AFTER the I2 wait — a blocked reader holds no slot
      slotHeld = true;
    }).then(() => runChild(id, entry, spec, releaseAll));
    w.readersInFlight.add(job);
    return job;
  }

  return { enqueueChild, wsOf, inflight };
}
