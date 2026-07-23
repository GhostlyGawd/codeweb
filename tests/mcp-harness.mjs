// Long-lived stdio MCP client for the BDD scenario spine (docs/specs/round2-ws-f.md §S1–S7).
//
// Every other MCP suite (mcp.test.mjs + the find/brief/stats/awareness/mcp-budget near-copies) drives
// the server with spawnSync-and-a-batched-stdin: it cannot express "send request B AFTER observing a
// trace event from request A", which is exactly what queue-ordering / cancellation scenarios need.
// This harness keeps ONE server child alive, reads newline-delimited JSON-RPC off stdout and the
// CODEWEB_MCP_TRACE NDJSON stream off stderr, and lets a test await a reply-by-id or a trace event by
// predicate, then send the next frame. Determinism rule (a loaded CI box): cross-request ORDERING is
// asserted on trace events (start/end/kill), never wall-clock; a burst whose enqueue order matters is
// sent as ONE stdin write via sendBurst (one readline drain => line order == enqueue order).

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = join(HERE, '..', 'scripts', 'mcp-server.mjs');

/**
 * Start a codeweb MCP server child with pipes on all three fds. Returns a control object:
 *   send(msg)            — one JSON-RPC message as one stdin line
 *   sendBurst([msg,...]) — many messages in ONE stdin write (enqueue order == line order)
 *   sendRaw(str)         — raw bytes (malformed frames, batch arrays) + trailing newline if absent
 *   reply(id, ms)        — Promise for the response whose .id === id
 *   waitFor(pred, ms)    — Promise for the first response matching pred
 *   traceEvent(pred, ms) — Promise for the first stderr trace event matching pred
 *   trace()/responses()  — snapshots (arrays) of everything seen so far
 *   close()              — end stdin (server drains in-flight work, then exits)
 *   destroyStdout()      — close our read end of the child's stdout (provoke a server-side EPIPE)
 *   exited               — Promise<{code, signal}> resolved on child close
 *   child                — the raw ChildProcess (escape hatch)
 */
export function startServer({ env = {}, cwd } = {}) {
  const child = spawn(process.execPath, [SERVER], {
    cwd: cwd || join(HERE, '..'),
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const responses = [];
  const respWaiters = [];
  const traceEvents = [];
  const traceWaiters = [];

  const pump = (items, waiters) => {
    for (let i = waiters.length - 1; i >= 0; i--) {
      const hit = items.find(waiters[i].pred);
      if (hit) { const w = waiters.splice(i, 1)[0]; w.settle(hit); }
    }
  };

  const rlOut = createInterface({ input: child.stdout });
  rlOut.on('line', (line) => {
    const s = line.trim(); if (!s) return;
    let msg; try { msg = JSON.parse(s); } catch { msg = { __raw: s }; }
    responses.push(msg); pump(responses, respWaiters);
  });
  // stderr carries CODEWEB_MCP_TRACE NDJSON (one {ev,...} per line) plus any free-form diagnostics.
  const rlErr = createInterface({ input: child.stderr });
  rlErr.on('line', (line) => {
    const s = line.trim(); if (!s) return;
    let ev; try { ev = JSON.parse(s); } catch { return; }
    if (ev && ev.ev) { traceEvents.push(ev); pump(traceEvents, traceWaiters); }
  });

  const exited = new Promise((resolve) => {
    child.on('close', (code, signal) => resolve({ code, signal }));
  });

  const awaitMatch = (items, waiters, pred, ms, what) => new Promise((resolve, reject) => {
    const existing = items.find(pred);
    if (existing) return resolve(existing);
    const timer = setTimeout(() => {
      const ix = waiters.findIndex((w) => w.settle === settle);
      if (ix >= 0) waiters.splice(ix, 1);
      reject(new Error(`mcp-harness: timeout (${ms}ms) waiting for ${what}`));
    }, ms);
    const settle = (v) => { clearTimeout(timer); resolve(v); };
    waiters.push({ pred, settle });
  });

  return {
    child,
    send: (msg) => { child.stdin.write(JSON.stringify(msg) + '\n'); },
    sendBurst: (msgs) => { child.stdin.write(msgs.map((m) => JSON.stringify(m)).join('\n') + '\n'); },
    sendRaw: (str) => { child.stdin.write(str.endsWith('\n') ? str : str + '\n'); },
    reply: (id, ms = 8000) => awaitMatch(responses, respWaiters, (m) => m.id === id, ms, `reply id=${id}`),
    waitFor: (pred, ms = 8000, what = 'response') => awaitMatch(responses, respWaiters, pred, ms, what),
    traceEvent: (pred, ms = 8000, what = 'trace event') => awaitMatch(traceEvents, traceWaiters, pred, ms, what),
    trace: () => traceEvents.slice(),
    responses: () => responses.slice(),
    close: () => { try { child.stdin.end(); } catch { /* already closed */ } },
    destroyStdout: () => { try { child.stdout.destroy(); } catch { /* already gone */ } },
    exited,
  };
}

/** Initialize the server and await its handshake reply. Returns the initialize result. */
export async function initServer(h, { protocol = '2025-06-18', id = 'init' } = {}) {
  h.send({ jsonrpc: '2.0', id, method: 'initialize', params: { protocolVersion: protocol, capabilities: {}, clientInfo: { name: 'harness', version: '0' } } });
  const res = await h.reply(id);
  return res.result;
}
