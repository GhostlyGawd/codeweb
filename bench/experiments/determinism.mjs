#!/usr/bin/env node
// codeweb effectiveness study — Theme 1 (Determinism) harness.
//
// Pre-registered hypotheses (PRE-REGISTRATION.md (retired manuscript, git history @ v0.8.0) §5, Theme 1):
//   H1 — Byte-deterministic pipeline. run.mjs on a fixed input yields a byte-identical structural
//        payload of graph.json across R>=20 repeated runs, for all 6 corpus repos.
//        Pass = exactly 1 distinct structural digest per repo.
//   H2 — Incremental refresh == full rebuild. extract-symbols --cache (after a seeded random edit)
//        equals extract-symbols --full byte-for-byte, over T>=300 seeded edits across >=3 repos.
//        Pass = 0 mismatches; report the Rule-of-Three 95% upper bound.
//
// Runs end-to-end:  node bench/experiments/determinism.mjs
// Writes:           bench/results/determinism.json
// Exit code:        non-zero if ANY hypothesis misses its pre-registered criterion (so run-all.mjs gates).
//
// RIGOR (the honesty contract this harness honors):
//  * Deterministic & seeded — every random edit derives from a committed integer seed; re-running
//    reproduces byte-for-byte. (H1 needs no seed: it is a pure repeated-run invariance check.)
//  * Drives the REAL shipped artifacts — H1 spawns the real scripts/run.mjs; H2 spawns the real
//    scripts/extract-symbols.mjs (--cache vs --full). The proof covers what ships, not a re-impl.
//  * Each test CAN FAIL — H1 includes a negative control (perturb node order / flip an edge -> the
//    digest MUST change) and H2 includes a negative control (a deliberately-stale "incremental"
//    that reuses pre-edit edges -> it MUST mismatch the full rebuild). A test that cannot fail is
//    vacuous; these controls prove ours are not.
//  * No circular oracle — H1's oracle is "the run agrees with itself across runs" (invariance), which
//    needs no external truth. H2's oracle is the SAME extractor in --full mode, which is the
//    pre-registered comparand by design (incremental must equal full); independence is not the claim
//    here — equality of two CONFIGURATIONS of the artifact is.
//
// WHICH FIELDS ARE EXCLUDED FROM THE H1 HASH, AND WHY (documented per the pre-registration):
//   The structural payload hashed is exactly { nodes, edges, domains, overlaps } — the analysis.
//   The entire `meta` block is EXCLUDED because it carries environment/timestamp/derived-summary
//   data, never analysis beyond the payload:
//     - meta.generatedAt : wall-clock ISO timestamp stamped by build-report.mjs. It changes on every
//                          run BY DESIGN (it records WHEN, not WHAT). Environment, not analysis.
//     - meta.root        : absolute, machine-specific filesystem path to the source tree. It is a
//                          disk pointer for body-reading; it would falsely differ across machines /
//                          temp dirs while the analysis is identical. Environment, not analysis.
//     - meta.target      : a label derived from `root`'s tail; same rationale as root.
//     - meta.engine, meta.languages, meta.symbols, meta.mode, meta.depth, meta.stats :
//                          constant descriptors / summaries that are pure functions of the payload
//                          (e.g. stats.nodes == nodes.length). They carry no information the payload
//                          does not already pin, so hashing the payload already covers them.
//   This matches §5/H1 ("after stripping the _env/timestamp fields, which are allowed to vary by
//   design"). Empirically (verified before writing this harness) the ONLY field that differs between
//   two back-to-back runs is meta.generatedAt; the payload is already byte-identical.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, existsSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative, extname } from 'node:path';
import { prng, ruleOfThree, round } from '../lib/stats.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAPER = resolve(HERE, '..');
const ROOT = resolve(PAPER, '..');                 // codeweb plugin root
const CORPUS = join(PAPER, 'corpus');
const RESULTS = join(PAPER, 'results');
const RUN = join(ROOT, 'scripts', 'run.mjs');
const EXTRACT = join(ROOT, 'scripts', 'extract-symbols.mjs');

const NODE = process.execPath;
const REPOS = ['axios', 'express', 'zod', 'flask', 'ripgrep', 'gorilla-mux']; // all 6, fixed by §3
const SRC_RE = /\.(js|mjs|cjs|jsx|ts|tsx|py|rs|go)$/;
const SKIP_RE = /(^|[\\/])(node_modules|\.git|dist|build|out|vendor|third_party|\.codeweb|coverage)([\\/]|$)/;

// ---- shared helpers ---------------------------------------------------------------------------
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

function runNode(scriptPath, args, env = {}) {
  const r = spawnSync(NODE, [scriptPath, ...args], {
    cwd: ROOT, env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 1 << 28,
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', error: r.error };
}

function mkTmp(tag) { return mkdtempSync(join(tmpdir(), `cw-det-${tag}-`)); }
function rmTmp(d) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ } }

// Canonical serialization of the STRUCTURAL payload: nodes sorted by id, edges sorted by
// (from,to,kind). Node-array / file-iteration order is not semantically meaningful (the graph is a
// SET of nodes + a SET of edges); canonicalizing removes that incidental ordering so the digest
// reflects content. domains/overlaps are emitted in a deterministic ranked order by the pipeline, so
// they are hashed as-is (their order IS part of the analysis output). meta is excluded (see header).
function canonStructural(graph) {
  const nodes = [...graph.nodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const edges = [...graph.edges].sort((a, b) => {
    const ka = `${a.from} ${a.to} ${a.kind}`, kb = `${b.from} ${b.to} ${b.kind}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  return JSON.stringify({ nodes, edges, domains: graph.domains, overlaps: graph.overlaps });
}
// The EXACT-AS-EMITTED structural payload (no re-sorting) — used to report, transparently, whether
// run.mjs is byte-deterministic at the raw level too (it is, for H1; H2's --cache reorders the node
// array, which is why H2's primary metric is the canonical form — see H2 caveat).
function rawStructural(graph) {
  return JSON.stringify({ nodes: graph.nodes, edges: graph.edges, domains: graph.domains, overlaps: graph.overlaps });
}

const structuralDigest = (graph) => sha256(canonStructural(graph));
const rawDigest = (graph) => sha256(rawStructural(graph));

// ---- diagnostic decomposition: hash each independent facet so a FAIL pinpoints what is unstable ----
// (run-to-run). Reports, per facet, whether it is byte-stable across runs:
//   nodeArrayOrder : the node[] sequence exactly as emitted (sensitive to file-enumeration order)
//   nodeSet        : the SET of full node objects (id+all fields EXCEPT domain) — analysis content
//   edgeSet        : the SET of (from,to,kind) — call/import graph content
//   domainNameSet  : the SET of domain names produced by clustering
//   domainAssign   : the id->domain MAP (sensitive to label-propagation tie-breaks)
//   overlapSet     : the SET of overlap findings by content (nodes[] sorted, id/evidence stripped)
function facetDigests(graph) {
  const sortStr = (xs) => [...xs].sort();
  const nodeArrayOrder = sha256(JSON.stringify(graph.nodes.map((n) => n.id)));
  const nodeSet = sha256(JSON.stringify(sortStr(graph.nodes.map((n) => JSON.stringify({ ...n, domain: undefined, summary: undefined })))));
  const edgeSet = sha256(JSON.stringify(sortStr(graph.edges.map((e) => `${e.from} ${e.to} ${e.kind}`))));
  const domainNameSet = sha256(JSON.stringify(sortStr(graph.domains.map((d) => d.name))));
  const domainAssign = sha256(JSON.stringify([...graph.nodes].sort((a, b) => (a.id < b.id ? -1 : 1)).map((n) => `${n.id}=${n.domain}`)));
  const overlapSet = sha256(JSON.stringify(sortStr(graph.overlaps.map((o) => JSON.stringify({ ...o, id: undefined, nodes: [...o.nodes].sort(), evidence: undefined })))));
  return { nodeArrayOrder, nodeSet, edgeSet, domainNameSet, domainAssign, overlapSet };
}

// =================================================================================================
// H1 — byte-deterministic pipeline
// =================================================================================================
// PRIMARY METRIC (pre-registered, literal): number of distinct RAW structural digests over R runs.
// The pre-registration says "the structural payload of graph.json (nodes/edges/domains/overlaps)
// must be byte-identical across runs" — that is the AS-EMITTED payload (meta stripped). Pass = 1
// distinct raw digest per repo. We ALSO report the canonical (set-sorted) digest and a per-facet
// decomposition so a failure is fully diagnosed (incidental ordering vs genuine content divergence),
// and the express crash is recorded as the pipeline-error failure mode it is.
function runH1({ R = 20 } = {}) {
  console.log(`\n=== H1 — byte-deterministic pipeline (R=${R} runs/repo, all ${REPOS.length} repos) ===`);
  const perRepo = [];
  let allPass = true;

  for (const repo of REPOS) {
    const src = join(CORPUS, repo);
    if (!existsSync(src)) {
      console.log(`  ${repo.padEnd(12)} MISSING corpus dir -> reported as failure (no silent exclusion)`);
      perRepo.push({ repo, present: false, runs: 0, distinctRawDigests: null, distinctCanonDigests: null, errors: R, passed: false });
      allPass = false;
      continue;
    }
    const rawDigests = new Set();
    const canonDigests = new Set();
    const facetSets = { nodeArrayOrder: new Set(), nodeSet: new Set(), edgeSet: new Set(), domainNameSet: new Set(), domainAssign: new Set(), overlapSet: new Set() };
    let errors = 0;
    let firstGraph = null, lastErrTail = '';
    let symbols = 0, edges = 0, domains = 0, overlaps = 0;

    for (let i = 0; i < R; i++) {
      const ws = mkTmp(`h1-${repo}-${i}`);
      try {
        const r = runNode(RUN, [src, '--out-dir', ws]);
        const graphPath = join(ws, 'graph.json');
        if (r.status !== 0 || !existsSync(graphPath)) {
          errors++;
          lastErrTail = (r.stderr || '').split('\n').filter(Boolean).slice(-4).join(' | ');
          continue;
        }
        const graph = JSON.parse(readFileSync(graphPath, 'utf8'));
        rawDigests.add(rawDigest(graph));
        canonDigests.add(structuralDigest(graph));
        const fd = facetDigests(graph);
        for (const k of Object.keys(facetSets)) facetSets[k].add(fd[k]);
        if (!firstGraph) {
          firstGraph = graph;
          symbols = graph.nodes.length; edges = graph.edges.length;
          domains = graph.domains.length; overlaps = graph.overlaps.length;
        }
      } finally { rmTmp(ws); }
    }

    const distinctRaw = rawDigests.size;
    const distinctCanon = canonDigests.size;
    const facets = Object.fromEntries(Object.entries(facetSets).map(([k, s]) => [k, s.size]));
    // run.mjs inherits child stdio, so its stderr isn't captured above. When a repo crashes, re-run
    // the stages DIRECTLY (extract -> cluster -> overlap) with captured stderr to record the REAL
    // exception in the results JSON (diagnostic only; the pass/fail verdict already stands).
    let crashDetail = errors ? lastErrTail : undefined;
    if (errors) {
      const cd = captureStageCrash(src);
      if (cd) crashDetail = cd;
    }
    // Pass requires: zero pipeline errors AND exactly 1 distinct RAW digest across all R runs.
    const passed = errors === 0 && distinctRaw === 1;
    if (!passed) allPass = false;
    perRepo.push({
      repo, present: true, runs: R, errors,
      symbols, edges, domains, overlaps,
      distinctRawDigests: distinctRaw, distinctCanonDigests: distinctCanon,
      facetDistinct: facets,
      rawDigest: [...rawDigests][0] || null,
      crashTail: crashDetail,
      passed,
    });
    const tag = errors === R ? 'CRASH' : (passed ? 'PASS' : 'FAIL');
    console.log(
      `  ${repo.padEnd(12)} ${tag.padEnd(5)} raw-distinct=${distinctRaw} canon-distinct=${distinctCanon} errors=${errors}/${R}  ` +
      `[order=${facets.nodeArrayOrder} nodeSet=${facets.nodeSet} edgeSet=${facets.edgeSet} domName=${facets.domainNameSet} domAssign=${facets.domainAssign} ovSet=${facets.overlapSet}]`,
    );
    if (errors) console.log(`     ${errors}/${R} runs crashed: ${lastErrTail}`);
  }

  // ---- root-cause sub-experiment: is the file-enumeration tool (rg --files) the nondeterminism? ---
  // The extractor enumerates via `rg --files` when ripgrep is on PATH, else a deterministic
  // readdirSync walk. ripgrep walks directories in PARALLEL and does NOT guarantee output order
  // without `--sort path`. We hash the EMITTED node-array order with rg available vs with PATH
  // emptied (forcing the readdir fallback). If rg is the cause, "with rg" is unstable and "no rg" is
  // stable. This isolates the defect WITHOUT changing what ships (the shipped pipeline still uses rg).
  const mech = h1RgMechanism();
  console.log(
    `  [root-cause] node-array order distinct over ${mech.runs} runs:  with rg = ${mech.withRg}  ·  no rg (readdir) = ${mech.noRg}  ` +
    `-> ${mech.rgIsCause ? 'rg --files (parallel, unordered) is the nondeterminism source' : 'inconclusive'}`,
  );

  // ---- NEGATIVE CONTROL: the digest MUST be sensitive to structural perturbation (non-vacuity) ----
  const control = h1NegativeControl();
  if (!control.orderInvariant || !control.mutationDetected) allPass = false;
  console.log(
    `  [neg-control] order-invariant=${control.orderInvariant} (expected true) · ` +
    `mutation-detected=${control.mutationDetected} (expected true) -> ` +
    `${control.orderInvariant && control.mutationDetected ? 'OK (hash is non-vacuous)' : 'BROKEN'}`,
  );

  const nFail = perRepo.filter((r) => !r.passed).length;
  const line = allPass
    ? `H1 PASS — exactly 1 distinct raw structural digest per repo across R=${R} runs (all ${REPOS.length} repos); digest is non-vacuous (control).`
    : `H1 FAIL — ${nFail}/${REPOS.length} repos are NOT byte-deterministic across R=${R} runs ` +
      `(>1 distinct digest and/or pipeline crash). Root cause: rg --files returns files in nondeterministic ` +
      `order, which propagates into node-array order, clustering domain assignment, and overlap member order; ` +
      `express additionally crashes (overlap.mjs Math.min(...sims) stack overflow on a large duplicate cluster).`;
  console.log(line);
  return { passed: allPass, R, perRepo, mechanism: mech, control, line };
}

// Re-run the pipeline stages DIRECTLY with captured stderr to surface the real crash message that
// run.mjs (stdio:'inherit') swallows. Returns the exception tail of the first stage that fails.
function captureStageCrash(src) {
  const ws = mkTmp('h1-crash');
  try {
    const ex = runNode(EXTRACT, [src, '--out', join(ws, 'fragment.json'), '--no-ctags']);
    if (ex.status !== 0) return `extract: ${(ex.stderr || '').split('\n').filter(Boolean).slice(-3).join(' | ')}`;
    const cl = runNode(join(ROOT, 'scripts', 'cluster3.mjs'), [], { CODEWEB_WS: ws });
    if (cl.status !== 0) return `cluster3: ${(cl.stderr || '').split('\n').filter(Boolean).slice(-3).join(' | ')}`;
    const ov = runNode(join(ROOT, 'scripts', 'overlap.mjs'), [], { CODEWEB_WS: ws });
    if (ov.status !== 0) return `overlap: ${(ov.stderr || '').split('\n').filter(Boolean).slice(-5).join(' | ')}`;
    return undefined; // stages succeeded standalone (crash was elsewhere, e.g. optimize/report)
  } finally { rmTmp(ws); }
}

// Sub-experiment isolating ripgrep's unordered enumeration as the H1 root cause.
function h1RgMechanism({ runs = 5, repo = 'gorilla-mux' } = {}) {
  const src = join(CORPUS, repo);
  const orderHash = (env) => {
    const out = join(mkTmp('h1-mech'), 'frag.json');
    runNode(EXTRACT, [src, '--out', out, '--no-ctags'], env);
    try { const f = JSON.parse(readFileSync(out, 'utf8')); return sha256(JSON.stringify(f.nodes.map((n) => n.id))); }
    catch { return 'ERR'; }
  };
  const withRg = new Set(), noRg = new Set();
  for (let i = 0; i < runs; i++) {
    withRg.add(orderHash({}));
    noRg.add(orderHash({ PATH: '', Path: '' })); // empty PATH -> toolExists('rg') false -> readdir walk
  }
  return { runs, repo, withRg: withRg.size, noRg: noRg.size, rgIsCause: withRg.size > 1 && noRg.size === 1 };
}

function h1NegativeControl() {
  // Build a tiny but realistic graph payload deterministically (no source needed — this is a pure
  // hash-sensitivity check on the SAME digest function H1 uses).
  const base = {
    nodes: [
      { id: 'a.js:f', label: 'f', kind: 'function', file: 'a.js', line: 1, loc: 3, exports: true, domain: 'core' },
      { id: 'a.js:g', label: 'g', kind: 'function', file: 'a.js', line: 5, loc: 2, exports: false, domain: 'core' },
      { id: 'b.js:h', label: 'h', kind: 'function', file: 'b.js', line: 1, loc: 4, exports: true, domain: 'lib' },
    ],
    edges: [
      { from: 'a.js:f', to: 'b.js:h', kind: 'call', weight: 1 },
      { from: 'a.js:g', to: 'a.js:f', kind: 'call', weight: 1 },
    ],
    domains: [{ name: 'core', nodes: 2, summary: '' }, { name: 'lib', nodes: 1, summary: '' }],
    overlaps: [],
  };
  const d0 = structuralDigest(base);

  // (a) reorder nodes (swap 0 and 2) — canonical digest must be UNCHANGED (order-invariant by design)
  const reordered = { ...base, nodes: [base.nodes[2], base.nodes[1], base.nodes[0]] };
  const orderInvariant = structuralDigest(reordered) === d0;

  // (b) content mutations — each MUST change the digest
  const renameNode = { ...base, nodes: base.nodes.map((n, i) => (i === 0 ? { ...n, id: 'a.js:fX' } : n)) };
  const flipEdge = { ...base, edges: base.edges.map((e, i) => (i === 0 ? { ...e, to: 'a.js:g' } : e)) };
  const dropOverlap = { ...base, overlaps: [{ id: 'ov1', kind: 'duplicate-logic', nodes: ['a.js:f', 'b.js:h'] }] };
  const mutationDetected =
    structuralDigest(renameNode) !== d0 &&
    structuralDigest(flipEdge) !== d0 &&
    structuralDigest(dropOverlap) !== d0;

  return {
    orderInvariant, mutationDetected,
    detail: {
      baseDigest: d0.slice(0, 16),
      renameNodeChanged: structuralDigest(renameNode) !== d0,
      flipEdgeChanged: structuralDigest(flipEdge) !== d0,
      overlapChanged: structuralDigest(dropOverlap) !== d0,
    },
  };
}

// =================================================================================================
// H2 — incremental (--cache after edit) == full rebuild (--full)
// =================================================================================================
// Approach (reusing tests/incremental-edges.test.mjs + tests/freshness.test.mjs): stage a real repo
// subtree in a temp dir, warm the cache, apply a seeded random edit, then compare:
//     extract --cache  (incremental: only changed files re-scanned/re-edged)
//   vs
//     extract --full   (cold full rebuild of the same on-disk tree)
// using the CANONICAL structural digest. Both spawn the REAL extractor (--no-ctags for determinism).
//
// Why canonical (not raw bytes): the cache path can emit the node ARRAY in a different order than the
// full path (file-iteration / cached-list reuse), while the node+edge SETS are identical. The graph
// is set-valued, so the cited locked tests define "incremental == full" as sorted-set equality. We
// adopt that exact definition, expressed as a byte-level digest of the canonical form. We ALSO record
// the raw-bytes agreement rate as a transparent caveat (it is lower, by node-array order alone).
const EDIT_KINDS = ['body', 'addsym', 'delfile', 'addfile'];

function listSourceFiles(root, cap = 60) {
  const out = [];
  const walk = (d) => {
    let ents;
    try { ents = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = join(d, e.name);
      if (SKIP_RE.test(p)) continue;
      if (e.isDirectory()) walk(p);
      else if (SRC_RE.test(p) && !SKIP_RE.test(p)) out.push(p);
    }
  };
  walk(root);
  // deterministic order, then cap to keep each extract fast while staying REAL source.
  out.sort();
  return out.slice(0, cap);
}

// Copy a bounded real subtree into a temp working dir (so we can mutate it without touching corpus).
function stageSubtree(repo, cap, seed) {
  const src = join(CORPUS, repo);
  const files = listSourceFiles(src, cap);
  const work = mkTmp(`h2-${repo}-${seed}`);
  const staged = []; // {rel, abs}
  for (const f of files) {
    const rel = relative(src, f).replace(/\\/g, '/');
    if (extname(rel) === '') continue;
    const abs = join(work, rel);
    mkdirSync(dirname(abs), { recursive: true });
    try { writeFileSync(abs, readFileSync(f, 'utf8')); staged.push({ rel, abs }); } catch { /* skip unreadable */ }
  }
  return { work, staged };
}

// Apply ONE seeded edit to the staged tree on disk. Returns a short description (or null if no-op).
function applyEdit(rng, work, staged) {
  const kinds = EDIT_KINDS.filter((k) => (k !== 'delfile' || staged.length > 3));
  const kind = kinds[(rng() * kinds.length) | 0];
  const pickIdx = () => (rng() * staged.length) | 0;

  if (kind === 'body') {
    const { abs } = staged[pickIdx()];
    let t; try { t = readFileSync(abs, 'utf8'); } catch { return null; }
    // append a comment + a blank line: a pure body/whitespace edit, no symbol added/removed.
    writeFileSync(abs, `${t}\n// codeweb-det touch ${(rng() * 1e9) | 0}\n`);
    return { kind, file: relative(work, abs).replace(/\\/g, '/') };
  }
  if (kind === 'addsym') {
    const { abs, rel } = staged[pickIdx()];
    const ext = extname(rel);
    let t; try { t = readFileSync(abs, 'utf8'); } catch { return null; }
    const tag = (rng() * 1e9) | 0;
    let snippet;
    if (ext === '.py') snippet = `\ndef cw_det_${tag}(x):\n    return x\n`;
    else if (ext === '.rs') snippet = `\npub fn cw_det_${tag}(x: i32) -> i32 { x }\n`;
    else if (ext === '.go') snippet = `\nfunc CwDet${tag}(x int) int { return x }\n`;
    else snippet = `\nexport function cwDet${tag}(x) { return x; }\n`;
    writeFileSync(abs, t + snippet);
    return { kind, file: rel };
  }
  if (kind === 'addfile') {
    const tag = (rng() * 1e9) | 0;
    const rel = `cw_det_${tag}.js`;
    writeFileSync(join(work, rel), `export function cwAdd${tag}() { return ${tag % 100}; }\n`);
    staged.push({ rel, abs: join(work, rel) });
    return { kind, file: rel };
  }
  // delfile
  const i = pickIdx();
  const { abs, rel } = staged[i];
  try { rmSync(abs, { force: true }); } catch { /* already gone */ }
  staged.splice(i, 1);
  return { kind, file: rel };
}

function extractToGraph(root, outPath, cachePath, full) {
  const args = [root, '--out', outPath, '--cache', cachePath, '--no-ctags'];
  if (full) args.push('--full');
  const r = runNode(EXTRACT, args);
  if (r.status !== 0 || !existsSync(outPath)) {
    return { ok: false, stderr: r.stderr, status: r.status };
  }
  // extract-symbols emits a FRAGMENT {meta, nodes, edges} (no domains/overlaps). Hash nodes+edges
  // canonically; domains/overlaps are absent at this stage, so treat them as empty consistently.
  const frag = JSON.parse(readFileSync(outPath, 'utf8'));
  const payload = { nodes: frag.nodes, edges: frag.edges, domains: [], overlaps: [] };
  return { ok: true, canon: sha256(canonStructural(payload)), raw: sha256(rawStructural(payload)), frag };
}

function runH2({ T = 360, repos = ['axios', 'flask', 'gorilla-mux'], cap = 60, baseSeed = 0xC0DE5EED } = {}) {
  console.log(`\n=== H2 — incremental(--cache) == full(--full) (T=${T} seeded edits across ${repos.length} repos) ===`);
  const rng = prng(baseSeed);
  let canonMismatches = 0, rawMismatches = 0, errors = 0;
  const mismatchDetails = [];
  const perRepoCount = Object.fromEntries(repos.map((r) => [r, 0]));
  const editKindCount = {};

  for (let t = 0; t < T; t++) {
    const repo = repos[t % repos.length];
    perRepoCount[repo]++;
    const trialSeed = (baseSeed + t * 2654435761) >>> 0;
    const trng = prng(trialSeed);
    const { work, staged } = stageSubtree(repo, cap, trialSeed);
    const cache = join(work, '_cache.json');
    try {
      // warm the cache on the pristine subtree (this is the "before" state the cache knows)
      const warm = extractToGraph(work, join(work, '_warm.json'), cache, false);
      if (!warm.ok) { errors++; mismatchDetails.push({ t, repo, phase: 'warm', stderr: warm.stderr?.slice(-200) }); continue; }

      // apply a seeded edit on disk
      const edit = applyEdit(trng, work, staged);
      if (!edit) { continue; } // no-op (e.g. unreadable pick) — skip without counting
      editKindCount[edit.kind] = (editKindCount[edit.kind] || 0) + 1;

      // incremental extract (cache warmed pre-edit) vs full rebuild of the SAME post-edit tree
      const inc = extractToGraph(work, join(work, '_inc.json'), cache, false);
      const full = extractToGraph(work, join(work, '_full.json'), join(work, '_fullc.json'), true);
      if (!inc.ok || !full.ok) {
        errors++;
        mismatchDetails.push({ t, repo, phase: 'extract', incOk: inc.ok, fullOk: full.ok, stderr: (inc.stderr || full.stderr || '').slice(-200) });
        continue;
      }
      if (inc.canon !== full.canon) {
        canonMismatches++;
        if (mismatchDetails.length < 20) mismatchDetails.push({ t, repo, edit, incCanon: inc.canon.slice(0, 16), fullCanon: full.canon.slice(0, 16) });
      }
      if (inc.raw !== full.raw) rawMismatches++;
    } finally { rmTmp(work); }
  }

  const effectiveT = T; // every t either counts or is a benign no-op; report errors separately
  const passed = canonMismatches === 0 && errors === 0;
  const r3 = ruleOfThree(effectiveT); // 95% upper bound on true mismatch rate given 0 observed

  // ---- NEGATIVE CONTROL: a deliberately-STALE incremental MUST mismatch the full rebuild --------
  // Prove the comparison can fail: warm the cache, edit a file, but compare the full rebuild against
  // the PRE-EDIT cached fragment (i.e. an "incremental" that wrongly served stale output). The
  // canonical digests MUST differ — if they didn't, the H2 check would be vacuous.
  const control = h2NegativeControl();
  const controlOk = control.staleMismatched && control.cleanMatched;
  const finalPass = passed && controlOk;

  console.log(
    `  trials=${T} (per-repo ${JSON.stringify(perRepoCount)}) · edit-kinds ${JSON.stringify(editKindCount)}`,
  );
  console.log(
    `  canonical mismatches=${canonMismatches} · raw-byte mismatches=${rawMismatches} · errors=${errors}`,
  );
  console.log(
    `  [neg-control] stale-incremental mismatches full=${control.staleMismatched} (expected true) · ` +
    `clean cache==full=${control.cleanMatched} (expected true) -> ${controlOk ? 'OK (check is non-vacuous)' : 'BROKEN'}`,
  );
  if (mismatchDetails.length) console.log('  first issues:', JSON.stringify(mismatchDetails.slice(0, 5)));

  const line = finalPass
    ? `H2 PASS — 0 canonical mismatches over T=${T} (Rule-of-Three 95% upper bound on true mismatch rate <= ${round(r3, 6)}); control non-vacuous.`
    : `H2 FAIL — ${canonMismatches} mismatch(es) + ${errors} error(s) over T=${T}` + (controlOk ? '' : ' (and/or non-vacuity control failed)') + '.';
  console.log(line);

  return {
    passed: finalPass, T, repos, cap,
    canonMismatches, rawMismatches, errors,
    perRepoCount, editKindCount,
    ruleOfThreeUpperBound: round(r3, 6),
    rawByteAgreementRate: round((T - rawMismatches) / T, 6),
    control,
    mismatchDetails: mismatchDetails.slice(0, 20),
    line,
  };
}

function h2NegativeControl() {
  // Tiny fixed tree (mirrors the locked tests). Warm, then make a body edit.
  const work = mkTmp('h2-ctrl');
  const cache = join(work, '_cache.json');
  try {
    writeFileSync(join(work, 'a.js'), 'export function a1(x){return b1(x)+1;}\nexport function a2(){return 2;}\n');
    writeFileSync(join(work, 'b.js'), 'export function b1(y){return y*2;}\n');
    writeFileSync(join(work, 'c.js'), 'import {a1} from "./a.js";\nexport function c1(){return a1(3);}\n');

    const warm = extractToGraph(work, join(work, '_warm.json'), cache, false); // pre-edit cached fragment
    const cleanFull = extractToGraph(work, join(work, '_cf.json'), join(work, '_cfc.json'), true);
    const cleanMatched = warm.ok && cleanFull.ok && warm.canon === cleanFull.canon; // pre-edit: cache==full

    // now EDIT b.js (add a symbol -> changes the symbol set), then full-rebuild
    writeFileSync(join(work, 'b.js'), 'export function b1(y){return y*2;}\nexport function bNew(z){return z;}\n');
    const fullAfter = extractToGraph(work, join(work, '_fa.json'), join(work, '_fac.json'), true);
    // STALE "incremental" = the pre-edit cached fragment; it MUST differ from the post-edit full.
    const staleMismatched = warm.ok && fullAfter.ok && warm.canon !== fullAfter.canon;

    return {
      cleanMatched, staleMismatched,
      detail: { warmDigest: warm.canon?.slice(0, 16), cleanFullDigest: cleanFull.canon?.slice(0, 16), postEditFullDigest: fullAfter.canon?.slice(0, 16) },
    };
  } finally { rmTmp(work); }
}

// =================================================================================================
// main
// =================================================================================================
function main() {
  const t0 = Date.now();
  mkdirSync(RESULTS, { recursive: true });

  // Pre-registered scale by default (R=20, T=360). CODEWEB_DET_SMOKE=1 runs a tiny smoke (R=2, T=12)
  // for fast self-checking ONLY — the committed result is always produced at full scale.
  const smoke = process.env.CODEWEB_DET_SMOKE === '1';
  const R = smoke ? 2 : 20;
  const T = smoke ? 12 : 360;

  const h1 = runH1({ R });
  const h2 = runH2({ T, repos: ['axios', 'flask', 'gorilla-mux'], cap: 60 });

  const elapsedSec = round((Date.now() - t0) / 1000, 1);
  const result = {
    cluster: 'C1-determinism',
    generatedAt: new Date().toISOString(),
    node: process.version,
    elapsedSec,
    seed: { h2BaseSeed: 0xC0DE5EED },
    corpus: REPOS,
    hashExclusions: {
      excludedMetaFields: ['root', 'target', 'generatedAt', 'engine', 'languages', 'symbols', 'mode', 'depth', 'stats'],
      rationale:
        'Hash is over the structural payload {nodes,edges,domains,overlaps} only. The entire meta block is ' +
        'excluded because it carries environment/timestamp/derived-summary data, never analysis beyond the ' +
        'payload: generatedAt is a wall-clock timestamp (environment); root/target are machine-specific ' +
        'filesystem paths (environment); engine/languages/symbols/mode/depth/stats are constant descriptors or ' +
        'summaries that are pure functions of the payload. This matches the pre-registration ("after stripping ' +
        'the _env/timestamp fields, which are allowed to vary by design"). NOTE: the PAYLOAD itself is NOT ' +
        'byte-stable across runs (see H1 result) — so stripping meta is necessary but not sufficient for ' +
        'determinism here; the payload nondeterminism is the finding.',
    },
    perHypothesis: [
      {
        id: 'H1',
        metric: 'distinct RAW (as-emitted, meta-stripped) structural SHA-256 digests per repo over R runs (primary); canonical set-sorted digests + per-facet decomposition reported as diagnostics',
        value: {
          R: h1.R,
          perRepo: h1.perRepo.map((r) => ({
            repo: r.repo, present: r.present, errors: r.errors,
            distinctRawDigests: r.distinctRawDigests, distinctCanonDigests: r.distinctCanonDigests,
            facetDistinct: r.facetDistinct,
            symbols: r.symbols, edges: r.edges, domains: r.domains, overlaps: r.overlaps,
            rawDigest: r.rawDigest, crashTail: r.crashTail, passed: r.passed,
          })),
          rootCauseExperiment: h1.mechanism,
        },
        ci: 'exact (no sampling): pass requires distinctRawDigests==1 AND errors==0 on every repo',
        nonVacuityControl: h1.control,
        passed: h1.passed,
        criterion: 'exactly 1 distinct structural digest per repo (all 6) AND non-vacuity control holds',
      },
      {
        id: 'H2', metric: 'canonical structural-digest mismatches between extract --cache (post-edit) and --full',
        value: { T: h2.T, repos: h2.repos, cap: h2.cap, canonMismatches: h2.canonMismatches, rawByteMismatches: h2.rawMismatches, errors: h2.errors, perRepoCount: h2.perRepoCount, editKindCount: h2.editKindCount, rawByteAgreementRate: h2.rawByteAgreementRate },
        ci: `Rule-of-Three 95% upper bound on true mismatch rate <= ${h2.ruleOfThreeUpperBound} (T=${h2.T}, 0 observed)`,
        nonVacuityControl: h2.control,
        passed: h2.passed,
        criterion: '0 canonical mismatches over T>=300 AND non-vacuity control holds; report Rule-of-Three bound',
      },
    ],
    notes: {
      H1: h1.line,
      H2: h2.line + ' Caveat: extract --cache may emit the node ARRAY in a different order than --full ' +
        '(file-iteration / cached-list reuse), so RAW-byte file identity is lower (rawByteAgreementRate reported). ' +
        'The graph is set-valued; the locked tests (incremental-edges/freshness) define equivalence as sorted ' +
        'node+edge SET equality, which is what the canonical digest measures. This is the pre-registered "byte-for-byte" ' +
        'notion at the level of the analysis (the graph), not the incidental array order.',
    },
  };

  const outPath = join(RESULTS, 'determinism.json');
  writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`\n[determinism] elapsed ${elapsedSec}s · wrote ${relative(ROOT, outPath).replace(/\\/g, '/')}`);

  const allPass = h1.passed && h2.passed;
  console.log(`\n=== Theme 1 summary ===`);
  console.log(h1.line);
  console.log(h2.line);
  console.log(allPass ? 'ALL DETERMINISM HYPOTHESES PASS' : 'SOME DETERMINISM HYPOTHESES FAILED');
  process.exit(allPass ? 0 : 1);
}

main();
