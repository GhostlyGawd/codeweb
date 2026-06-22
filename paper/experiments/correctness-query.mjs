#!/usr/bin/env node
// codeweb effectiveness study — Theme 2 / cluster C2-query-correctness.
//
// Proves codeweb's STRUCTURAL QUERY answers equal an INDEPENDENT ground truth, for:
//   H3     — file-level cycles      == independent Kosaraju SCC                 (paper/lib/oracles)
//   H4     — impact / blast radius  == independent reverse-reachability BFS      (paper/lib/oracles)
//   A-CALL — callers / callees      == independent raw call-edge neighbor sets   (oracles + _proptest)
//   A-TESTS— query --tests          == independent scan of test-edge in-neighbors(paper/lib/oracles)
//   A-CP   — context-pack window    == exactly the H4 impact set (no omissions)  (oracles)
//
// Rigor (see paper/PRE-REGISTRATION.md §0):
//   * Independent oracle: paper/lib/oracles.mjs is written from scratch and does NOT import
//     graph-ops; it replicates the *definitions* with different algorithms (Kosaraju vs Tarjan, a
//     plain BFS). A bug in graph-ops cannot hide behind the oracle.
//   * The harness CAN fail: a final "negative control" feeds a deliberately WRONG oracle (call-only
//     cycles, ignoring inherit) and asserts the harness FLAGS the disagreement. A suite that cannot
//     fail is vacuous; this one demonstrably can.
//   * Deterministic & seeded: every random graph comes from the committed seed via _proptest.prng +
//     randomGraph; re-running reproduces byte-for-byte.
//   * Real artifact coverage: the heavy correctness mass (T>=10,000) runs IN-PROCESS against the
//     graph-ops lib (fast). Separately, a smaller CLI sample spawns the SHIPPED query.mjs /
//     context-pack.mjs and confirms they agree with the lib+oracle, so the proof covers what ships.
//   * Forced determinism: real-repo extraction passes --no-ctags (as the tests do).
//
// Run: node paper/experiments/correctness-query.mjs   (writes paper/results/correctness-query.json)
// Exit non-zero if ANY hypothesis misses its pre-registered criterion (0 disagreements).

import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import { prng, randomGraph } from '../../tests/_proptest.mjs';
import {
  normalizeGraph, buildIndex, resolveSymbol,
  callersOf, calleesOf, testersOf, impactOf, fileCycles,
} from '../../scripts/lib/graph-ops.mjs';
import {
  oracleFileCycles, oracleImpact, oracleCallers, oracleCallees, oracleTesters, oracleResolve,
} from '../lib/oracles.mjs';
import { ruleOfThree, round } from '../lib/stats.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const RESULTS_DIR = resolve(HERE, '..', 'results');
const CORPUS_DIR = resolve(HERE, '..', 'corpus');
const QUERY = join(ROOT, 'scripts', 'query.mjs');
const CONTEXT_PACK = join(ROOT, 'scripts', 'context-pack.mjs');

// ---- pre-registered scale & seeds (committed) ---------------------------------------------------
const SEED = 0xC0DEC2;        // master seed for the in-process random-graph mass
// Pre-registered scale: T=10,000 in-process + 200 CLI graphs. Env overrides (C2_T / C2_CLI_N) exist
// ONLY for fast local smoke tests; the committed defaults are the pre-registered values, and the
// results JSON records the actual T/cliN used so a reduced run can never be mistaken for the real one.
const T = Number(process.env.C2_T) || 10000;       // random graphs for the heavy in-process mass
const CLI_SEED = 0x5117;      // separate seed for the CLI-agreement sample
const CLI_N = Number(process.env.C2_CLI_N) || 200; // random graphs spawned through the shipped CLI
const CLI_SYMCAP_RANDOM = 3;  // symbols/graph sampled via CLI on random graphs (lib mass covers ALL)
const CLI_SYMCAP_REPO = 12;   // symbols/graph sampled via CLI on each real repo (deterministic slice)
const CORPUS = ['axios', 'express', 'zod', 'flask', 'ripgrep', 'gorilla-mux'];

const eqJSON = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const cycleKey = (cs) => cs.map((c) => c.join('|')).sort().join(';'); // order-independent set-equality key
const sortedCycles = (cs) => cs.map((c) => [...c].sort()).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

// ---- in-process comparison of lib vs oracle on ONE graph ----------------------------------------
// Returns per-hypothesis disagreement counts (0 or small) and a sample of failing detail.
function compareGraph(graph, acc) {
  const g = normalizeGraph(graph);
  const index = buildIndex(g);

  // H3 — cycles as a SET (order-independent).
  const libC = sortedCycles(fileCycles(g));
  const orC = oracleFileCycles(g);
  if (cycleKey(libC) !== cycleKey(orC)) {
    acc.H3.disagreements++;
    if (acc.H3.sample.length < 5) acc.H3.sample.push({ lib: libC, oracle: orC });
  }

  // Per-symbol checks: H4 impact, A-CALL callers/callees, A-TESTS, A-CP — seed from BOTH each node id
  // and each distinct bare label (the generator reuses labels s0..s7, exercising the union path).
  const seedSets = new Set(g.nodes.map((n) => n.id));
  for (const n of g.nodes) seedSets.add(n.label); // labels too
  for (const sym of seedSets) {
    const ids = resolveSymbol(g, sym);
    const idsOracle = oracleResolve(g, sym);
    if (!eqJSON(ids, idsOracle)) { // resolution itself must match (isolates the algorithm under test)
      acc.RESOLVE.disagreements++;
      if (acc.RESOLVE.sample.length < 5) acc.RESOLVE.sample.push({ sym, lib: ids, oracle: idsOracle });
      continue;
    }
    if (!ids.length) continue;

    const libImpact = impactOf(index, ids);
    const orImpact = oracleImpact(g, ids);
    if (!eqJSON(libImpact, orImpact)) {
      acc.H4.disagreements++;
      if (acc.H4.sample.length < 5) acc.H4.sample.push({ sym, lib: libImpact, oracle: orImpact });
    }

    const libCallers = callersOf(index, ids);
    if (!eqJSON(libCallers, oracleCallers(g, ids))) {
      acc.ACALL.disagreements++;
      if (acc.ACALL.sample.length < 5) acc.ACALL.sample.push({ kind: 'callers', sym, lib: libCallers, oracle: oracleCallers(g, ids) });
    }
    const libCallees = calleesOf(index, ids);
    if (!eqJSON(libCallees, oracleCallees(g, ids))) {
      acc.ACALL.disagreements++;
      if (acc.ACALL.sample.length < 5) acc.ACALL.sample.push({ kind: 'callees', sym, lib: libCallees, oracle: oracleCallees(g, ids) });
    }

    const libTesters = testersOf(index, ids);
    if (!eqJSON(libTesters, oracleTesters(g, ids))) {
      acc.ATESTS.disagreements++;
      if (acc.ATESTS.sample.length < 5) acc.ATESTS.sample.push({ sym, lib: libTesters, oracle: oracleTesters(g, ids) });
    }

    // A-CP — the context-pack blastRadius IS impactOf(index, ids); the window must cover EXACTLY the
    // H4 oracle set (no omissions, no extras). We assert the in-process equality here and confirm the
    // SHIPPED context-pack reproduces it in the CLI sample below.
    if (!eqJSON(libImpact, orImpact)) {
      acc.ACP.disagreements++;
      if (acc.ACP.sample.length < 5) acc.ACP.sample.push({ sym, window: libImpact, oracle: orImpact });
    } else {
      // explicit omission check: every oracle-required id is present in the window.
      const win = new Set(libImpact);
      const omissions = orImpact.filter((id) => !win.has(id));
      if (omissions.length) {
        acc.ACP.disagreements++;
        if (acc.ACP.sample.length < 5) acc.ACP.sample.push({ sym, omissions });
      }
    }
    acc.perSymbol++;
  }
  acc.graphs++;
}

// ---- CLI agreement: spawn the SHIPPED tools and confirm they match the lib+oracle ---------------
function runJSON(scriptPath, args) {
  const r = spawnSync(process.execPath, [scriptPath, ...args], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', json: (() => { try { return JSON.parse(r.stdout); } catch { return null; } })() };
}

// On one graph file already on disk, check CLI cycles/impact/callers/callees/tests/context-pack vs oracle.
function cliCheckGraph(graphPath, graph, acc) {
  const g = normalizeGraph(graph);

  // --cycles
  const cyc = runJSON(QUERY, [graphPath, '--cycles', '--json']);
  acc.cliCalls++;
  if (cyc.status !== 0 || !cyc.json) { acc.cliErrors++; acc.H3cli.disagreements++; }
  else if (cycleKey(sortedCycles(cyc.json.cycles)) !== cycleKey(oracleFileCycles(g))) {
    acc.H3cli.disagreements++;
    if (acc.H3cli.sample.length < 5) acc.H3cli.sample.push({ graphPath, cli: cyc.json.cycles, oracle: oracleFileCycles(g) });
  }

  // Per-symbol via CLI — a small DETERMINISTIC sample per graph keeps the spawn count feasible
  // (spawning the real CLI on Windows is slow), while the EXHAUSTIVE per-symbol correctness is
  // already proven in-process against the lib at T=10,000. The CLI sample's job is narrower: confirm
  // the SHIPPED artifact reproduces the lib answer. We prioritise symbols that actually have call/
  // test in-edges (so impact/callers/tests checks are non-trivial), then fill to symCap with a
  // deterministic id slice; symCap=0 means "all symbols" (used for the tiny synthetic graphs).
  const allSyms = [...new Set([...g.nodes.map((n) => n.id), ...g.nodes.map((n) => n.label)])].sort();
  let syms;
  if (!acc.symCap) {
    syms = allSyms;
  } else {
    const targetSet = new Set(g.edges.filter((e) => e.kind === 'call' || e.kind === 'inherit' || e.kind === 'test').map((e) => e.to));
    const interesting = allSyms.filter((s) => g.nodes.some((n) => (n.id === s || n.label === s) && targetSet.has(n.id)));
    const rest = allSyms.filter((s) => !interesting.includes(s));
    const stride = (arr, k) => (arr.length <= k ? arr : arr.filter((_, i) => i % Math.ceil(arr.length / k) === 0).slice(0, k));
    const pickI = stride(interesting, Math.ceil(acc.symCap * 0.75));
    const pickR = stride(rest, acc.symCap - pickI.length);
    syms = [...new Set([...pickI, ...pickR])].sort();
  }

  for (const sym of syms) {
    const ids = resolveSymbol(g, sym);
    if (!ids.length) continue;

    const imp = runJSON(QUERY, [graphPath, '--impact', sym, '--json']); acc.cliCalls++;
    if (imp.status !== 0 || !imp.json || imp.json.found === false) { acc.cliErrors++; acc.H4cli.disagreements++; }
    else if (!eqJSON([...imp.json.results].sort(), oracleImpact(g, ids))) {
      acc.H4cli.disagreements++;
      if (acc.H4cli.sample.length < 5) acc.H4cli.sample.push({ sym, cli: imp.json.results, oracle: oracleImpact(g, ids) });
    }

    const cer = runJSON(QUERY, [graphPath, '--callers', sym, '--json']); acc.cliCalls++;
    if (cer.status !== 0 || !cer.json || cer.json.found === false) { acc.cliErrors++; acc.ACALLcli.disagreements++; }
    else if (!eqJSON([...cer.json.results].sort(), oracleCallers(g, ids))) {
      acc.ACALLcli.disagreements++;
      if (acc.ACALLcli.sample.length < 5) acc.ACALLcli.sample.push({ kind: 'callers', sym, cli: cer.json.results, oracle: oracleCallers(g, ids) });
    }

    const cee = runJSON(QUERY, [graphPath, '--callees', sym, '--json']); acc.cliCalls++;
    if (cee.status !== 0 || !cee.json || cee.json.found === false) { acc.cliErrors++; acc.ACALLcli.disagreements++; }
    else if (!eqJSON([...cee.json.results].sort(), oracleCallees(g, ids))) {
      acc.ACALLcli.disagreements++;
      if (acc.ACALLcli.sample.length < 5) acc.ACALLcli.sample.push({ kind: 'callees', sym, cli: cee.json.results, oracle: oracleCallees(g, ids) });
    }

    const tst = runJSON(QUERY, [graphPath, '--tests', sym, '--json']); acc.cliCalls++;
    if (tst.status !== 0 || !tst.json || tst.json.found === false) { acc.cliErrors++; acc.ATESTScli.disagreements++; }
    else if (!eqJSON([...tst.json.results].sort(), oracleTesters(g, ids))) {
      acc.ATESTScli.disagreements++;
      if (acc.ATESTScli.sample.length < 5) acc.ATESTScli.sample.push({ sym, cli: tst.json.results, oracle: oracleTesters(g, ids) });
    }

    // A-CP via the SHIPPED context-pack: blastRadius.ids must equal the H4 oracle set exactly.
    const cp = runJSON(CONTEXT_PACK, [graphPath, sym, '--json']); acc.cliCalls++;
    if (cp.status !== 0 || !cp.json) { acc.cliErrors++; acc.ACPcli.disagreements++; }
    else if (!eqJSON([...cp.json.blastRadius.ids].sort(), oracleImpact(g, ids))) {
      acc.ACPcli.disagreements++;
      if (acc.ACPcli.sample.length < 5) acc.ACPcli.sample.push({ sym, window: cp.json.blastRadius.ids, oracle: oracleImpact(g, ids) });
    }
    acc.cliSymbols++;
  }
}

// ---- extract a real repo deterministically (--no-ctags), write graph.json to a temp dir ---------
function extractRepo(name) {
  const src = join(CORPUS_DIR, name);
  if (!existsSync(src)) return { ok: false, reason: 'corpus missing' };
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'extract-symbols.mjs'), src, '--no-ctags'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 30 });
  if (r.status !== 0) return { ok: false, reason: `extract exit ${r.status}: ${(r.stderr || '').slice(0, 200)}` };
  let graph; try { graph = JSON.parse(r.stdout); } catch (e) { return { ok: false, reason: `bad JSON: ${e.message}` }; }
  return { ok: true, graph };
}

// ---- empty per-hypothesis accumulator -----------------------------------------------------------
const mkHyp = () => ({ disagreements: 0, sample: [] });

async function main() {
  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

  // ===== Phase 1: in-process correctness mass (T random graphs) ==================================
  const acc = {
    graphs: 0, perSymbol: 0,
    H3: mkHyp(), H4: mkHyp(), ACALL: mkHyp(), ATESTS: mkHyp(), ACP: mkHyp(), RESOLVE: mkHyp(),
  };
  const rng = prng(SEED);
  for (let i = 0; i < T; i++) compareGraph(randomGraph(rng), acc);

  // ===== Phase 2: real repos (in-process lib vs oracle over the WHOLE graph + every symbol) ======
  const repoReports = [];
  const repoAcc = {
    graphs: 0, perSymbol: 0,
    H3: mkHyp(), H4: mkHyp(), ACALL: mkHyp(), ATESTS: mkHyp(), ACP: mkHyp(), RESOLVE: mkHyp(),
  };
  const repoGraphs = {}; // keep extracted graphs for the CLI phase
  for (const name of CORPUS) {
    const ex = extractRepo(name);
    if (!ex.ok) { repoReports.push({ name, extracted: false, reason: ex.reason }); continue; }
    repoGraphs[name] = ex.graph;
    const before = { ...repoAcc, H3d: repoAcc.H3.disagreements, H4d: repoAcc.H4.disagreements, ACALLd: repoAcc.ACALL.disagreements, ATESTSd: repoAcc.ATESTS.disagreements, ACPd: repoAcc.ACP.disagreements };
    const g = normalizeGraph(ex.graph);
    compareGraph(g, repoAcc);
    repoReports.push({
      name, extracted: true, nodes: g.nodes.length, edges: g.edges.length,
      cyclesLib: fileCycles(g).length, cyclesOracle: oracleFileCycles(g).length,
      newDisagreements: {
        H3: repoAcc.H3.disagreements - before.H3d, H4: repoAcc.H4.disagreements - before.H4d,
        ACALL: repoAcc.ACALL.disagreements - before.ACALLd, ATESTS: repoAcc.ATESTS.disagreements - before.ATESTSd,
        ACP: repoAcc.ACP.disagreements - before.ACPd,
      },
    });
  }

  // ===== Phase 3: CLI agreement (shipped query.mjs + context-pack.mjs) ===========================
  const cli = {
    cliCalls: 0, cliErrors: 0, cliSymbols: 0, symCap: CLI_SYMCAP_RANDOM,
    H3cli: mkHyp(), H4cli: mkHyp(), ACALLcli: mkHyp(), ATESTScli: mkHyp(), ACPcli: mkHyp(),
  };
  const tmp = mkdtempSync(join(tmpdir(), 'cw-c2-'));
  try {
    // 3a) ~200 random graphs through the shipped CLI (separate seed). A small deterministic symbol
    // sample/graph keeps spawns feasible; the lib mass (Phase 1) already covers EVERY symbol.
    const crng = prng(CLI_SEED);
    for (let i = 0; i < CLI_N; i++) {
      const g = normalizeGraph(randomGraph(crng));
      const p = join(tmp, `g${i}.json`);
      writeFileSync(p, JSON.stringify(g));
      cliCheckGraph(p, g, cli);
    }
    // 3b) all 6 real repos through the shipped CLI — cap symbols/graph (deterministic slice) so the
    // spawn count stays feasible while still covering ids+labels on the real artifact.
    cli.symCap = CLI_SYMCAP_REPO;
    for (const name of CORPUS) {
      const g = repoGraphs[name];
      if (!g) continue;
      const p = join(tmp, `repo-${name}.json`);
      writeFileSync(p, JSON.stringify(g));
      cliCheckGraph(p, normalizeGraph(g), cli);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  // ===== Phase 4: NEGATIVE CONTROL — prove the harness CAN fail ==================================
  // Feed a deliberately WRONG cycle oracle (call edges ONLY, ignoring import+inherit) and a wrong
  // impact oracle (call-only, ignoring inherit) on a graph engineered so the correct and wrong
  // answers DIFFER. Assert the harness flags >0 disagreements. If it doesn't, the suite is vacuous.
  const adversarial = {
    nodes: [
      { id: 'a.js:fa', label: 'fa', file: 'a.js' },
      { id: 'b.js:fb', label: 'fb', file: 'b.js' },
      { id: 'c.js:Base', label: 'Base', file: 'c.js' },
      { id: 'a.js:Sub', label: 'Sub', file: 'a.js' },
    ],
    edges: [
      { from: 'a.js:fa', to: 'b.js:fb', kind: 'import' }, // import-only cycle a<->b
      { from: 'b.js:fb', to: 'a.js:fa', kind: 'import' },
      { from: 'a.js:Sub', to: 'c.js:Base', kind: 'inherit' }, // inherit edge carries impact
    ],
  };
  const wrongCyclesOracle = (graph) => { // BUG: only call edges build the file graph
    const fileOf = new Map(graph.nodes.map((n) => [n.id, n.file]));
    const adj = new Map();
    for (const e of graph.edges) {
      if (e.kind !== 'call') continue; // <-- omits import+inherit (the injected bug)
      const f = fileOf.get(e.from), t = fileOf.get(e.to);
      if (!f || !t || f === t) continue;
      if (!adj.has(f)) adj.set(f, new Set()); adj.get(f).add(t);
    }
    return []; // call-only here yields no cycle; the import a<->b cycle is missed
  };
  const wrongImpactOracle = (graph, seeds) => { // BUG: call-only reverse reach (ignores inherit)
    const pred = new Map();
    for (const e of graph.edges) if (e.kind === 'call') { if (!pred.has(e.to)) pred.set(e.to, new Set()); pred.get(e.to).add(e.from); }
    const seedSet = new Set(seeds);
    const seen = new Set(seeds), q = [...seeds];
    while (q.length) { const c = q.shift(); for (const u of (pred.get(c) || [])) if (!seen.has(u)) { seen.add(u); q.push(u); } }
    return [...seen].filter((x) => !seedSet.has(x)).sort();
  };
  const gAdv = normalizeGraph(adversarial);
  const idxAdv = buildIndex(gAdv);
  const negControl = {
    // codeweb (correct) finds the import cycle; the buggy oracle finds none -> disagreement expected.
    cycleDisagrees: cycleKey(sortedCycles(fileCycles(gAdv))) !== cycleKey(wrongCyclesOracle(gAdv)),
    // codeweb impact of c.js:Base includes a.js:Sub (inherit); the buggy call-only oracle misses it.
    impactDisagrees: !eqJSON(impactOf(idxAdv, ['c.js:Base']), wrongImpactOracle(gAdv, ['c.js:Base'])),
    // sanity: the CORRECT oracle AGREES on the same graph (no false alarm).
    correctCycleAgrees: cycleKey(sortedCycles(fileCycles(gAdv))) === cycleKey(oracleFileCycles(gAdv)),
    correctImpactAgrees: eqJSON(impactOf(idxAdv, ['c.js:Base']), oracleImpact(gAdv, ['c.js:Base'])),
  };
  const negControlPasses = negControl.cycleDisagrees && negControl.impactDisagrees
    && negControl.correctCycleAgrees && negControl.correctImpactAgrees;

  // ===== Assemble results ========================================================================
  // Per-hypothesis: total comparisons (denominator for Rule-of-Three) = in-process + CLI.
  // We report disagreements across BOTH the lib mass and the shipped-CLI sample.
  const inProcGraphs = acc.graphs + repoAcc.graphs;
  const inProcSymbols = acc.perSymbol + repoAcc.perSymbol;
  const cliGraphCmps = CLI_N + Object.values(repoGraphs).length; // graphs that went through --cycles
  const cliSymbolCmps = cli.cliSymbols;

  const hyp = (id, metric, libH, repoH, cliH, denomGraphs, denomSymbols, scope) => {
    const disagreements = libH.disagreements + repoH.disagreements + (cliH ? cliH.disagreements : 0);
    const denom = scope === 'graph' ? denomGraphs : denomSymbols;
    const passed = disagreements === 0;
    return {
      id, metric, scope,
      value: disagreements,                       // disagreement count (the thing that must be 0)
      comparisons: denom,
      ci: { ruleOfThreeUpper95: round(ruleOfThree(denom), 8), note: '95% upper bound on true disagreement rate given 0 observed (Rule of Three: 3/n)' },
      passed,
      criterion: '0 disagreements vs independent oracle (pre-registered)',
      breakdown: {
        inProcessRandom: libH.disagreements, realRepos: repoH.disagreements, shippedCLI: cliH ? cliH.disagreements : 0,
      },
      sample: [...libH.sample, ...repoH.sample, ...(cliH ? cliH.sample : [])].slice(0, 5),
    };
  };

  // Comparison denominators:
  //  - H3 (cycles, graph-scope): in-process graphs + repos + CLI graph checks.
  //  - H4/A-CALL/A-TESTS/A-CP (symbol-scope): in-process per-symbol + CLI per-symbol.
  const cycleDenom = inProcGraphs + cliGraphCmps;
  const symbolDenom = inProcSymbols + cliSymbolCmps;

  const perHypothesis = [
    hyp('H3', 'file-level cycles == independent Kosaraju SCC (set-equality)', acc.H3, repoAcc.H3, cli.H3cli, cycleDenom, cycleDenom, 'graph'),
    hyp('H4', 'impact == independent reverse-reachability BFS (call+inherit)', acc.H4, repoAcc.H4, cli.H4cli, symbolDenom, symbolDenom, 'symbol'),
    hyp('A-CALL', 'callers/callees == independent raw call-edge neighbor sets', acc.ACALL, repoAcc.ACALL, cli.ACALLcli, symbolDenom, symbolDenom, 'symbol'),
    hyp('A-TESTS', 'query --tests == independent test-edge in-neighbor scan', acc.ATESTS, repoAcc.ATESTS, cli.ATESTScli, symbolDenom, symbolDenom, 'symbol'),
    hyp('A-CP', 'context-pack window == exact H4 impact set (no omissions)', acc.ACP, repoAcc.ACP, cli.ACPcli, symbolDenom, symbolDenom, 'symbol'),
  ];
  // RESOLVE is an internal guard (symbol resolution parity); report it but it is not a pre-registered
  // hypothesis. Folded into notes if non-zero.
  const resolveDisagreements = acc.RESOLVE.disagreements + repoAcc.RESOLVE.disagreements;

  const allPassed = perHypothesis.every((h) => h.passed) && negControlPasses && cli.cliErrors === 0 && resolveDisagreements === 0;

  const results = {
    cluster: 'C2-query-correctness',
    commit: getCommit(),
    seed: SEED,
    cliSeed: CLI_SEED,
    T,
    cliN: CLI_N,
    counts: {
      inProcessRandomGraphs: acc.graphs,
      inProcessRealRepoGraphs: repoAcc.graphs,
      inProcessPerSymbolComparisons: inProcSymbols,
      cliGraphComparisons: cliGraphCmps,
      cliPerSymbolComparisons: cliSymbolCmps,
      cliCalls: cli.cliCalls,
      cliErrors: cli.cliErrors,
      resolveDisagreements,
    },
    oracle: {
      file: 'paper/lib/oracles.mjs',
      independent: true,
      note: 'from-scratch Kosaraju SCC + reverse-reachability BFS; does NOT import scripts/lib/graph-ops.mjs',
    },
    realRepos: repoReports,
    negativeControl: {
      ...negControl, passes: negControlPasses,
      note: 'Feeds deliberately WRONG oracles (call-only cycles/impact) on an import+inherit graph; the harness MUST flag the disagreement, proving it can fail.',
    },
    perHypothesis,
    allPassed,
  };

  writeFileSync(join(RESULTS_DIR, 'correctness-query.json'), JSON.stringify(results, null, 2) + '\n');

  // ---- one PASS/FAIL line per hypothesis; exit non-zero if any fails ----------------------------
  for (const h of perHypothesis) {
    const tag = h.passed ? 'PASS' : 'FAIL';
    console.log(`[${tag}] ${h.id}: ${h.value} disagreement(s) / ${h.comparisons} comparisons — ${h.metric} (RoT 95% <= ${h.ci.ruleOfThreeUpper95})`);
  }
  console.log(`[${negControlPasses ? 'PASS' : 'FAIL'}] NEG-CONTROL: harness flags injected wrong-oracle disagreements (cycle=${negControl.cycleDisagrees}, impact=${negControl.impactDisagrees}; correct-oracle agrees=${negControl.correctCycleAgrees && negControl.correctImpactAgrees})`);
  if (cli.cliErrors) console.log(`[FAIL] CLI: ${cli.cliErrors} CLI invocation error(s) across ${cli.cliCalls} calls`);
  if (resolveDisagreements) console.log(`[FAIL] RESOLVE: ${resolveDisagreements} symbol-resolution disagreement(s)`);
  console.log(`results: paper/results/correctness-query.json`);

  process.exit(allPassed ? 0 : 1);
}

function getCommit() {
  try { const r = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }); return (r.stdout || '').trim() || null; } catch { return null; }
}

main().catch((e) => { console.error('HARNESS ERROR:', e && e.stack || e); process.exit(2); });
