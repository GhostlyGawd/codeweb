#!/usr/bin/env node
// codeweb — pipeline orchestrator (the entry point the /codeweb command + codebase-anatomy skill call).
// Runs the full deterministic pipeline for ONE target into its OWN workspace, so analyzing several
// targets never clobbers each other's outputs. Resolves all paths from the plugin root, so it works
// regardless of the caller's cwd (e.g. `node ${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs <target>`).
//
//   node scripts/run.mjs [<SRC>] [--target <label>] [--out-dir <dir>]
//
// Default workspace: <SRC>/.codeweb (override with --out-dir) — inside the mapped repo, exactly
// where MCP graph discovery and the three hooks walk up to find it (FUNNEL #2: the old default
// under the npx package root orphaned maps in the npx cache where nothing could ever find them).
// Stages read their workspace from CODEWEB_WS (default '.live' when run standalone).
// Outputs in the workspace: fragment.json, graph.json, overlap.md, report.html, report.md.
// Read-only over the target; never executes target code.
//
// Stream contract (CLI.md 5.1/6.1 — the fleet convention this file predated): stderr carries
// PROGRESS (the [run] stage lines, children's output, failure lines); stdout carries the RESULT
// (everything from `[run] done -> …` on: banner, since-last delta, artifact list, receipt,
// next steps — or, with --json, exactly one machine-readable line). So `codeweb . | grep mapped`
// works and `codeweb . 2>/dev/null` shows the results, like every other tool in the fleet.

import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, statSync } from 'node:fs';
import { atomicWrite, SCAN_CACHE_NAME, parseArgs } from './lib/cli.mjs';
import { findingBuckets } from './lib/graph-ops.mjs'; // ACTIVATION A3/A4: banner speaks the one findings vocabulary
import { metricsRow, appendHistory } from './lib/history.mjs'; // RETENTION R1/R8: the since-last-map delta + per-map ledger
import { recordMap } from './lib/stats.mjs';                   // RETENTION §4: firstMapAt/lastMapAt/mapCount
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..'); // plugin root (parent of scripts/)
// RETENTION R10: the running version prints in the done banner — with no phone-home by design,
// the banner is the only place a user can self-diagnose being releases behind.
const VERSION = (() => { try { return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version; } catch { return '0.0.0'; } })();

// Bump when ANY downstream stage (cluster/overlap/optimize/report) changes behavior — it keys the
// stage memo, so an old workspace can never serve outputs computed by an older pipeline.
const MEMO_VERSION = 1;

const USAGE = `usage: run.mjs [<SRC>] [--target <label>] [--out-dir <dir>] [--open] [--full] [--allow-empty] [--json]
  <SRC>            path to the codebase to map (default: current directory)
  --target <label> display label stamped into the map (default: last two path segments of <SRC>)
  --out-dir <dir>  where the artifacts go (default: <SRC>/.codeweb — where MCP + hooks find them)
  --open           open report.html when the map is built
  --serve          after the map, serve the workspace at http://127.0.0.1:<port> (localhost only)
  --full           recompute every stage (skip the fragment memo + edge cache)
  --allow-empty    permit a target with no supported source (writes an empty map)
  --json           machine mode: one JSON result line on stdout ({ws, symbols, actionable,
                   reused, version}); stage progress stays on stderr
  --stages <phase> partial pipeline; only 'through-overlap' (extract+cluster+overlap, skip
                   optimize+report) — the trend fast path; never writes the stage memo
  --coverage <p>   annotate the graph with a coverage report (lcov or c8 JSON) after mapping`;
// finding 24: THE flag loop (lib/cli.mjs parseArgs). This file pioneered the unknown-flag
// rejection (#5: `--help` once became the target path); the shared loop carries that policy now.
const { opts: flags, pos } = parseArgs(process.argv.slice(2), {
  usage: USAGE,
  flags: {
    target: { type: 'string', default: null },
    'out-dir': { type: 'string', default: null },
    open: { type: 'bool', default: false },
    serve: { type: 'bool', default: false },         // AI-IDEAS/reach: give the report a real origin, localhost only
    full: { type: 'bool', default: false },
    'allow-empty': { type: 'bool', default: false }, // forwarded to extract: skip the empty-map guard
    stages: { type: 'string', default: null },       // finding #42: partial pipeline (trend fast path)
    coverage: { type: 'string', default: null },     // #13: measured-execution annotation after the map
    json: { type: 'bool', default: false },          // CLI.md 5.1: the flagship's machine mode
  },
});
// FUNNEL #2 / FORMS cut #4: the main form has zero required fields. <SRC> defaults to the
// current directory; the empty-target guard downstream keeps a wrong cwd from producing a
// silent nonsense map.
const opts = { src: pos[0] ?? '.', target: flags.target, outDir: flags['out-dir'], open: flags.open, serve: flags.serve, full: flags.full, allowEmpty: flags['allow-empty'], stages: flags.stages, coverage: flags.coverage, json: flags.json };
// finding #42: --stages is a partial pipeline. Only 'through-overlap' is valid — any other value dies
// with usage (exit 2), so a typo can never silently run a different phase set. A partial run computes
// extract+cluster+overlap (graph.json's nodes/edges/domains/overlaps — all trend's metrics need),
// skips optimize+report, and NEVER writes the stage memo (a partial workspace must never satisfy a
// later full run's reuse check — the belt; the memo's per-output existence+hash check is the brace).
if (opts.stages !== null && opts.stages !== 'through-overlap') { console.error(`[run] unknown --stages "${opts.stages}" (valid: through-overlap)\n${USAGE}`); process.exit(2); }
const partial = opts.stages === 'through-overlap';
// Resolve the target against the CALLER's cwd (not the plugin root the stages run in) — a relative
// <SRC> must mean the same thing as a relative --out-dir. Fail here with one clean line, not a
// stage-level stack trace.
opts.src = resolve(opts.src);
if (!existsSync(opts.src)) { console.error(`[run] target not found: ${opts.src}`); process.exit(1); }
// FORMS F9: --coverage names a FILE — check it now, not after five stages of work on a large
// repo (the map used to build fully, then die on an lcov typo with an "aborting" frame that
// hid the map's success).
if (opts.coverage && !existsSync(resolve(opts.coverage))) {
  console.error(`[run] coverage report not found: ${resolve(opts.coverage)} (expected an lcov or c8 JSON file)\n${USAGE}`);
  process.exit(2);
}

// FUNNEL #2: the default workspace lives INSIDE the target (<SRC>/.codeweb) — exactly where MCP
// graph discovery and all three hooks walk up to. The old default (under the npx package root)
// orphaned maps in the npx cache where nothing could ever find them.
const ws = opts.outDir ? resolve(opts.outDir) : join(opts.src, '.codeweb');
mkdirSync(ws, { recursive: true });
// RETENTION R6: the workspace self-declares what is cache and what is MEMORY. `rm -rf .codeweb`
// is the natural clean-rebuild move — and it used to destroy the only two non-regenerable
// artifacts (annotations.json = triaged judgement, history.jsonl = the progression ledger).
// With this contract in place, git-tracked cleanup has a safe boundary. Never overwritten.
try {
  const gi = join(ws, '.gitignore');
  if (!existsSync(gi)) {
    atomicWrite(gi, [
      '# codeweb workspace — everything here is regenerable cache EXCEPT the whitelisted memory:',
      '# commit annotations.json (team judgement) and history.jsonl (progression); stats.json stays local.',
      '*',
      '!.gitignore',
      '!annotations.json',
      '!history.jsonl',
      '',
    ].join('\n'));
  }
} catch { /* the contract is best-effort — never fail a map over it */ }

const env = { ...process.env, CODEWEB_WS: ws };
const node = process.execPath;
const S = (p) => join(ROOT, p);
const run = (label, file, args, useEnv) => {
  console.error(`\n[run] ${label}`);
  const t0 = Date.now();
  try {
    // CLI.md 6.1: children's stdout is progress by definition — route it to OUR stderr so stdout
    // stays the result channel (and --json stays one parseable line). Child stderr passes through.
    execFileSync(node, [file, ...args], { stdio: ['ignore', 2, 'inherit'], env: useEnv ? env : process.env, cwd: ROOT });
  } catch (e) {
    // The stage already printed its own diagnostics (stdout -> our stderr, stderr inherited) —
    // add one clean line, not a raw execFileSync stack dump.
    console.error(`\n[run] stage '${label}' failed${typeof e?.status === 'number' ? ` (exit ${e.status})` : ''} — aborting`);
    process.exit(1);
  }
  // Per-stage wall-time, stderr only (Spec K): the scale bench parses these lines; artifacts
  // never see a timestamp from here.
  console.error(`[run] ${label} done in ${Date.now() - t0}ms`);
};
// ACTIVATION A2: optimize's per-item advisory dump (~90 lines on a real repo) buried the result
// under logistics. The stage runs CAPTURED: its headline lines still print (on stderr — stage
// chatter under the CLI.md 6.1 stream contract), the dump lives in optimize.md with a one-line
// pointer here; CODEWEB_VERBOSE=1 restores the firehose. Returns stdout so the banner can scrape
// the ready/LOC pair.
const runCapture = (label, file, args) => {
  console.error(`\n[run] ${label}`);
  const t0 = Date.now();
  let out = '';
  try {
    out = execFileSync(node, [file, ...args], { stdio: ['ignore', 'pipe', 'inherit'], env: process.env, cwd: ROOT, encoding: 'utf8' });
  } catch (e) {
    if (e.stdout) process.stderr.write(String(e.stdout)); // surface whatever it printed before dying
    console.error(`\n[run] stage '${label}' failed${typeof e?.status === 'number' ? ` (exit ${e.status})` : ''} — aborting`);
    process.exit(1);
  }
  const lines = out.split('\n');
  const verbose = process.env.CODEWEB_VERBOSE === '1';
  const shown = (verbose ? out : lines.slice(0, 3).join('\n')).trimEnd();
  if (shown) console.error(shown);
  if (!verbose && lines.length > 4) console.error(`  full advisory: ${join(ws, 'optimize.md')}`);
  console.error(`[run] ${label} done in ${Date.now() - t0}ms`);
  return out;
};
// ACTIVATION A3: the banner's headline numbers — one graph parse on a fresh map; the stage memo
// caches them (`banner`) so the reuse path prints the same result line parse-free.
const bannerFromGraph = () => {
  try {
    const g = JSON.parse(readFileSync(join(ws, 'graph.json'), 'utf8'));
    return { symbols: g.meta?.stats?.nodes ?? (g.nodes || []).length, ...findingBuckets(g.overlaps) };
  } catch { return null; }
};
let banner = null;
let sinceLast = null; // RETENTION R1: {prev, cur} metric rows when a previous map existed

const targetArg = opts.target ? ['--target', opts.target] : [];
// Extract always runs — it is the change detector — and rides the scan cache (Spec A), so a
// no-change re-run costs ~the regex baseline instead of a full parse.
run('extract', S('scripts/extract-symbols.mjs'), [opts.src, ...targetArg, ...(opts.allowEmpty ? ['--allow-empty'] : []), '--cache', join(ws, SCAN_CACHE_NAME), '--out', join(ws, 'fragment.json')], false);

// Spec B (docs/specs/perf-stage-memo-scale.md): the four downstream stages are pure functions of
// (fragment bytes, CODEWEB_* levers, pipeline version). When that key matches the previous run and
// every output still exists, reuse the outputs — wall-time changes, never a byte. --full forces.
const STAGE_OUTPUTS = ['graph.json', 'overlap.md', 'optimize.md', 'report.html', 'report.md'];
// Round 2, finding #19 (T-19.3): SOURCE_DATE_EPOCH joins the lever string when set — the stage
// outputs bake it in (graph.json's generatedAt rides the hashed bytes), so a changed epoch must
// never reuse old-epoch bytes, which the per-output hashes below would then fossilize.
const levers = Object.keys(process.env)
  .filter((k) => k.startsWith('CODEWEB_') && k !== 'CODEWEB_WS').sort()
  .map((k) => `${k}=${process.env[k]}`).join(';')
  + (process.env.SOURCE_DATE_EPOCH !== undefined ? `;SOURCE_DATE_EPOCH=${process.env.SOURCE_DATE_EPOCH}` : '');
const memoKey = createHash('sha1')
  .update(`v${MEMO_VERSION}|${levers}|`).update(readFileSync(join(ws, 'fragment.json')))
  .digest('hex');
const memoPath = join(ws, '.stages.json');
const sha1hex = (buf) => createHash('sha1').update(buf).digest('hex');
// Round 2, finding #19 (T-19.3): the memo records {s: byteLen, h: sha1} per output, hashed from
// each output's FINAL bytes (post-rename) just before the memo write. Reuse then requires the key
// match AND every output to exist with matching size (checked FIRST — truncation never hashes)
// and sha1. This replaces graphParses(): the old belt full-parsed graph.json (~167 ms @13.9 MB)
// yet caught only unparseable corruption of that one file — the other four outputs had no belt at
// all, and a parseable byte-tamper sailed through. Any miss -> recompute all (all-or-nothing, as
// before); a memo without `outputs` (old shape) or corrupt -> recompute once, upgraded on write; a
// crash between an output rename and the memo write leaves mismatched hashes -> recompute.
let prevMemo = null;
try { prevMemo = JSON.parse(readFileSync(memoPath, 'utf8')); } catch { /* absent/corrupt -> compute */ }
const outputsIntact = () => {
  if (!prevMemo || !prevMemo.outputs) return false; // old-shape memo: recompute, one run upgrades
  for (const f of STAGE_OUTPUTS) {
    const rec = prevMemo.outputs[f];
    if (!rec) return false;
    const p = join(ws, f);
    let st; try { st = statSync(p); } catch { return false; }      // missing
    if (st.size !== rec.s) return false;                           // truncated/resized: size first, never hash
    try { if (sha1hex(readFileSync(p)) !== rec.h) return false; }  // tampered — parseable or not
    catch { return false; }
  }
  return true;
};
const reusable = !opts.full && prevMemo?.key === memoKey && outputsIntact();

if (reusable) {
  console.error('\n[run] stages reused (fragment unchanged) — skipping downstream recompute; --full forces');
  banner = prevMemo.banner || bannerFromGraph(); // pre-banner memos: one parse, this run only
} else {
  // RETENTION R1: hold the PREVIOUS map's metrics BEFORE cluster overwrites graph.json — the
  // re-map summary then leads with what changed since, instead of repeating the first run.
  let prevRow = null;
  if (!partial) { try { prevRow = metricsRow(JSON.parse(readFileSync(join(ws, 'graph.json'), 'utf8'))); } catch { /* first map here */ } }
  run('cluster', S('scripts/cluster3.mjs'), [], true);
  run('overlap', S('scripts/overlap.mjs'), [], true);
  if (partial) {
    // trend fast path: extract+cluster+overlap only. Skip optimize+report AND the memo write — a
    // partial workspace lacks optimize.md/report.* so it must never satisfy a later full run's memo.
    console.error('\n[run] --stages through-overlap: skipping optimize + report (memo not written)');
  } else {
    const optOut = runCapture('optimize', S('scripts/optimize.mjs'), [join(ws, 'graph.json'), '--out', join(ws, 'optimize.md')]);
    run('report', S('scripts/build-report.mjs'), [join(ws, 'graph.json'), ...(opts.open ? ['--open'] : [])], false);
    const headline = optOut.match(/(\d+) actionable findings · (\d+) ready · (\d+) blocked · (\d+) judgement/);
    const locM = optOut.match(/~(\d+) LOC reclaimed/);
    // ONE parse of the final graph feeds the banner, the history row, and the delta.
    let freshGraph = null;
    try { freshGraph = JSON.parse(readFileSync(join(ws, 'graph.json'), 'utf8')); } catch { /* banner/delta degrade */ }
    if (freshGraph) {
      banner = { symbols: freshGraph.meta?.stats?.nodes ?? (freshGraph.nodes || []).length, ...findingBuckets(freshGraph.overlaps) };
      if (headline) { banner.ready = Number(headline[2]); if (locM) banner.loc = Number(locM[1]); }
      // R1/R8: one appended row per FULL map — brief/trend/report read the series; reused
      // (memo-hit) runs never reach here, so the ledger records real recomputes only.
      const freshRow = metricsRow(freshGraph);
      appendHistory(join(ws, 'graph.json'), freshRow);
      if (prevRow) sinceLast = { prev: prevRow, cur: freshRow };
      recordMap(join(ws, 'graph.json')); // §4: firstMapAt/lastMapAt/mapCount/fullMaps
    }
    try {
      const outputs = {};
      for (const f of STAGE_OUTPUTS) { const b = readFileSync(join(ws, f)); outputs[f] = { s: b.length, h: sha1hex(b) }; }
      atomicWrite(memoPath, JSON.stringify({ key: memoKey, at: new Date().toISOString(), outputs, ...(banner ? { banner } : {}) }) + '\n');
    } catch { /* memo is best-effort */ }
  }
}

// Round 2, finding #18a: persist the post-edit hook's baseline summary beside graph.json — the
// hook then skips its per-edit baseline parse + before-side cycle/index recompute. On the reuse
// path only when the sidecar is missing/stale (one graph parse, amortized); best-effort by
// contract — a sidecar failure must never fail a map.
// finding #42: a partial (through-overlap) run produces no report — skip the post-edit hook sidecar
// too (it accompanies a full map; the trend fast path only needs graph.json for its metrics).
if (!partial) try {
  const { computeHookBaseline, writeHookBaselineBeside, hookBaselineFresh } = await import('./lib/hook-baseline.mjs');
  const gp = join(ws, 'graph.json');
  if (!reusable || !hookBaselineFresh(gp)) {
    const bytes = readFileSync(gp, 'utf8');
    writeHookBaselineBeside(gp, computeHookBaseline(JSON.parse(bytes), bytes, statSync(gp).mtimeMs));
  }
} catch { /* sidecar is best-effort */ }

if (opts.coverage) run('coverage', S('scripts/coverage.mjs'), [join(ws, 'graph.json'), resolve(opts.coverage)], false); // #13

// CLI.md 5.1/6.1: everything from here down is the RESULT — it prints on stdout so pipes and
// `2>/dev/null` both work. --json replaces the whole text block with ONE machine-readable line
// (symbols/actionable are null when no banner exists, e.g. a --stages through-overlap run;
// reused mirrors the stage memo: true when the downstream stages did not execute this run).
if (opts.json) {
  console.log(JSON.stringify({
    ws,
    symbols: banner ? banner.symbols : null,
    actionable: banner ? banner.actionable : null,
    reused: reusable,
    version: VERSION,
  }));
} else {
  console.log(`\n[run] done -> ${ws} · codeweb v${VERSION}`);
  if (partial) {
    console.log(`[run]   ${ws}/graph.json · overlap.md · fragment.json (through-overlap: no report)`);
  } else {
    // ACTIVATION A3: the banner leads with the RESULT (what the map found), not logistics. Numbers
    // come from the graph itself (memo-cached on reuse) + optimize's headline; never recomputed here.
    if (banner) {
      const ready = banner.ready > 0 ? ` · ${banner.ready} ready merge(s)` : '';
      const loc = banner.loc > 0 ? ` (~${banner.loc} LOC reclaimable)` : '';
      console.log(`[run] mapped ${banner.symbols} symbols -> ${banner.actionable} actionable finding(s)${ready}${loc} — details: optimize.md`);
    }
    // RETENTION R1: the re-map is a PROGRESS REPORT — measured deltas only, never projections.
    if (sinceLast) {
      const { prev, cur } = sinceLast;
      const when = prev.at ? ` (${String(prev.at).slice(0, 10)})` : '';
      console.log(`[run] since last map${when}: dups ${prev.confirmed} -> ${cur.confirmed} · cycles ${prev.cycles} -> ${cur.cycles} · symbols ${prev.symbols} -> ${cur.symbols}`);
    }
    console.log(`[run]   ${ws}/report.html · report.md · overlap.md · optimize.md · graph.json · fragment.json`);
    // #10: the value receipt shows up where the user already is — one line, only when non-empty.
    let receipt = null;
    try {
      const { readStats, lifetimeTotals, monthLine } = await import('./lib/stats.mjs');
      receipt = monthLine(lifetimeTotals(readStats(join(ws, 'graph.json'))));
    } catch { /* receipt must never break the pipeline */ }
    if (receipt) {
      // Returning user (the hooks/MCP have accrued activity here): receipt instead of onboarding.
      console.log(`[run]   codeweb here so far: ${receipt} (full receipt: scripts/stats.mjs)`);
      if (!opts.open) console.log(`[run]   open ${join(ws, 'report.html')} in your browser (or re-run with --open)`);
      // REVENUE §3.2: the ONE in-product ask, at the receipt high point only — local counters,
      // 30-day throttle, never on first contact, never on agent/failure surfaces (--json included:
      // the suppressed block never prints, so the throttle is never burned unseen).
      try {
        const { sponsorAskDue, recordSponsorAsk } = await import('./lib/stats.mjs');
        if (sponsorAskDue(join(ws, 'graph.json'))) {
          console.log('[run]   codeweb is free — sponsoring pays for its benchmarks: https://github.com/sponsors/GhostlyGawd');
          recordSponsorAsk(join(ws, 'graph.json'));
        }
      } catch { /* the ask must never break the pipeline */ }
    } else {
      // ACTIVATION A5: first map of this repo — the three moves that turn one run into a habit.
      // #5 still holds: the map's whole point is to be LOOKED AT, so seeing it is step 1.
      const openCmd = process.platform === 'win32' ? 'start ""' : process.platform === 'darwin' ? 'open' : 'xdg-open';
      console.log(`[run] next:`);
      console.log(`[run]   1. ${opts.open ? 'the map is opening in your browser' : `see the map: ${openCmd} ${join(ws, 'report.html')}`}`);
      console.log(`[run]   2. live queries in Claude Code: claude mcp add codeweb -- npx -y -p @ghostlygawd/codeweb codeweb-mcp`);
      console.log(`[run]   3. after edits: re-run codeweb here — the refresh is cache-warm (seconds, not a re-map)`);
    }
  }
}
// reach: --serve keeps the process alive serving THIS workspace on localhost (Ctrl-C to stop).
if (!partial && opts.serve) run('serve', S('scripts/serve.mjs'), [ws], false);
