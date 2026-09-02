// Text pins for the committed launch drafts (reports/launch/).
//
// A launch post is the highest-scrutiny, lowest-context surface this project has: a number lands
// in front of readers who have no way to check it and no framing around it. The regression class
// is therefore narrower than "the number is wrong" — it is A NUMBER WITHOUT A MISSION-FRESH
// RECEIPT: a figure carried over from a pre-mission run, a value that drifted away from the
// artifact after a re-run, or one of the charter-barred claims (C7 cost premise, C3 two-modes,
// C4 price/SLA, the unframed 126x) reappearing in copy nobody re-reads before sending.
//
// Wording stays free. What is pinned: every number in the drafts is a key in receipts.md's table,
// every table value still equals what the committed artifact records, every cited artifact is
// mission-fresh (regenerated after the 2026-08-17 window opened), and none of the barred claims
// appear.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ROOT, readJSON } from './helpers.mjs';

const read = (p) => readFileSync(join(PLUGIN_ROOT, p), 'utf8');
const bench = (p) => readJSON(join(PLUGIN_ROOT, p));
const DRAFT_DIR = 'reports/launch';
const DRAFTS = ['show-hn.md', 'github-release-discussion.md'];
const draft = (f) => read(`${DRAFT_DIR}/${f}`);

// The mission window: receipts regenerated on or after this instant are fresh. Anything older is
// a pre-mission artifact — true, possibly still published elsewhere with its framing, but barred
// from a launch draft.
const FRESH_AFTER = Date.parse('2026-08-17T00:00:00Z');

// The six study receipts + the standing budget receipt. Each must carry a stamp inside the
// window, or a number sourced from it must not appear in a draft.
const FRESH_ARTIFACTS = {
  'bench/results/correctness-query.json': null, // stamped via the run summary, see below
  'bench/results/edit-safety.json': 'generatedAt',
  'bench/results/auxiliary.json': 'generatedAt',
  'bench/results/detection-accuracy.json': 'generatedAt',
  'bench/results/performance.json': '_env.date',
  'bench/results/determinism.json': 'generatedAt',
  'bench/results/benchmarks.json': 'ranAt',
};

const dig = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

// Prose as a reader sees it: fenced code blocks ARE the copy that gets posted, so they stay in.
// Markdown table pipes and headings do not carry claims, but their digits would trip the scan,
// so the receipts table itself is never scanned — only the drafts are.
const textOf = (md) => md.replace(/<!--[\s\S]*?-->/g, ' ');
// A cited artifact path is a citation, not a claim: the digits inside
// `efficiency-pilot.reps5-v090.json` are part of a filename.
const PATH_RE = /\b[\w][\w./-]*\.(?:json|mjs|md|html|xml|js|sh|yml)\b/g;
// Version-shaped and URL-shaped tokens are identifiers, not claims.
const VERSION_RE = /\bv?\d+\.\d+\.\d+\b/g;
const URL_RE = /https?:\/\/\S+/g;
// Algorithm and standard names carry digits that are part of the NAME, not a measurement:
// sha256 is not a claim of 256 of anything. Kept deliberately short and explicit — a broad
// "digits glued to letters" rule would swallow real claims like "28 tools".
const IDENTIFIER_RE = /\bsha256\b|\bType-2\b|\bMCP\b|\bC\+\+\b/gi;
// An ISO date stamps WHEN something happened; it asserts nothing about the product. Anchored to
// the full YYYY-MM-DD shape so a bare year, which could be a claim, still has to be receipted.
const DATE_RE = /\b\d{4}-\d{2}-\d{2}\b/g;

// ---- the receipts: token in the drafts -> value re-derived from the committed artifact --------

function numericReceipts() {
  const correctness = bench('bench/results/correctness-query.json');
  const editSafety = bench('bench/results/edit-safety.json');
  const determinism = bench('bench/results/determinism.json');
  const performance = bench('bench/results/performance.json');
  const auxiliary = bench('bench/results/auxiliary.json');
  const detection = bench('bench/results/detection-accuracy.json');
  const budgets = bench('bench/results/benchmarks.json');
  const product = readJSON(join(PLUGIN_ROOT, 'site', 'data', 'product.json'));
  const pkg = readJSON(join(PLUGIN_ROOT, 'package.json'));

  const hyp = (receipt, id) => receipt.perHypothesis.find((h) => h.id === id);
  const H1 = hyp(determinism, 'H1').value;
  const H17 = hyp(performance, 'H17').value;
  const H14 = hyp(performance, 'H14').value;

  // The pre-registered check count is the sum of what the six fresh receipts enumerate — derived,
  // never hardcoded, so retiring or adding a hypothesis moves the drafts' number or fails here.
  const allHypotheses = [correctness, editSafety, auxiliary, detection, performance, determinism]
    .flatMap((r) => r.perHypothesis);

  return {
    '32': [allHypotheses.length, 'the six fresh receipts -> total perHypothesis[] entries'],
    '497,864': [
      correctness.perHypothesis.reduce((n, h) => n + h.comparisons, 0),
      'bench/results/correctness-query.json -> sum of perHypothesis[].comparisons',
    ],
    '0': [hyp(correctness, 'H4').value, 'bench/results/correctness-query.json -> disagreements (0 in every family)'],
    '6': [H1.perRepo.length, 'bench/results/determinism.json -> H1 perRepo (SHA-pinned repositories)'],
    '20': [H1.R, 'bench/results/determinism.json -> H1 R (runs per repo)'],
    '1': [H1.perRepo[0].distinctRawDigests, 'bench/results/determinism.json -> H1 distinctRawDigests (one digest per repo)'],
    '360': [hyp(determinism, 'H2').value.T, 'bench/results/determinism.json -> H2 T (incremental-vs-full comparisons)'],
    '10,000': [editSafety.T.H5, 'bench/results/edit-safety.json -> T.H5 (simulated edits)'],
    '3,215': [H17.graph.symbols, 'bench/results/performance.json -> H17 graph.symbols'],
    '51.89': [H17.worstP95Ms, 'bench/results/performance.json -> H17 worstP95Ms'],
    '29.08': [H17.decomposition.nodeStartup.medianMs, 'bench/results/performance.json -> H17 nodeStartup.medianMs'],
    '0.342': [H14.slope, 'bench/results/performance.json -> H14 slope'],
    '0.5702': [H14.slopeHi, 'bench/results/performance.json -> H14 slopeHi (95% CI upper)'],
    // The confidence LEVEL is a claim too: quoting an interval at the wrong level misstates the
    // uncertainty. Re-derived from the pre-registered criterion string rather than assumed.
    '95': [
      Number(/(\d+)%\s*CI/.exec(hyp(performance, 'H14').criterion)[1]),
      'bench/results/performance.json -> H14 criterion (the pre-registered confidence level)',
    ],
    '1,573': [budgets.pipeline.symbols, 'bench/results/benchmarks.json -> pipeline.symbols'],
    '5,001': [budgets.pipeline.edges, 'bench/results/benchmarks.json -> pipeline.edges'],
    '1,178': [budgets.pipeline.coldMs, 'bench/results/benchmarks.json -> pipeline.coldMs'],
    '143': [budgets.pipeline.warmMs, 'bench/results/benchmarks.json -> pipeline.warmMs'],
    '11': [auxiliary.perHypothesis.length, 'bench/results/auxiliary.json -> perHypothesis (auxiliary checks)'],
    '1.0': [
      detection.details.H10.structuralRecallMean,
      'bench/results/detection-accuracy.json -> H10 structuralRecallMean (and H13 safePrecision)',
    ],
    '0.0': [detection.details.H10.lexicalRecallMean, 'bench/results/detection-accuracy.json -> H10 lexicalRecallMean'],
    '13': [product.languages.length, 'site/data/product.json -> languages'],
    '28': [
      Number(/toolsList=(\d+)/.exec(hyp(auxiliary, 'A-MCP').value)[1]),
      'bench/results/auxiliary.json -> A-MCP toolsList (the shipped MCP tool count)',
    ],
    '22': [Number(pkg.engines.node.replace(/[^\d]/g, '')), 'package.json -> engines.node'],
    // The two ratified facts, sourced exactly as the pricing page sources them.
    '10': [10, 'CHARTER.md -> "The boundary": ~EUR 10 per active author per month (ratified 2026-08-17)'],
    '90': [90, 'CHARTER.md -> "The boundary": active author = committed in the trailing 90 days'],
  };
}

// ---- the drafts exist, and cover every channel the kit names ---------------------------------

test('the launch drafts are committed, with an index and a receipts table', () => {
  for (const f of [...DRAFTS, 'README.md', 'receipts.md']) {
    assert.ok(existsSync(join(PLUGIN_ROOT, DRAFT_DIR, f)), `${DRAFT_DIR}/${f} must be committed before anything is posted`);
  }
});

test('every draft in the directory is registered in the index with a channel and a status', () => {
  // A draft nobody indexed is a draft nobody posted: the index is what says, per channel, whether
  // a URL exists or an operator action is owed. VAL-REL-007 fails on a channel with neither.
  const index = read(`${DRAFT_DIR}/README.md`);
  for (const f of readdirSync(join(PLUGIN_ROOT, DRAFT_DIR))) {
    if (f === 'README.md' || f === 'receipts.md') continue;
    assert.match(index, new RegExp(`\`${f.replace('.', '\\.')}\``),
      `${DRAFT_DIR}/README.md does not list ${f} — every draft needs a channel and a posted/operator-owed status`);
  }
  assert.match(index, /POSTED|Operator-owed/i, 'the index must state a per-channel outcome');
});

// ---- freshness: a launch number may only come from an artifact re-run in this window ----------

test('every artifact the drafts draw numbers from was regenerated inside the mission window', () => {
  // The receipts table's whole premise. A pre-mission artifact can be perfectly true and still be
  // the wrong thing to quote in a launch post, because nothing around the number says how old the
  // engine behind it is.
  const summary = bench('bench/results/_summary.json');
  const runStamp = Date.parse(summary.env.date);
  assert.ok(runStamp >= FRESH_AFTER,
    `bench/results/_summary.json records a run at ${summary.env.date}, before the mission window`);

  for (const [path, stampField] of Object.entries(FRESH_ARTIFACTS)) {
    assert.ok(existsSync(join(PLUGIN_ROOT, path)), `${path} is cited by the drafts but missing`);
    if (!stampField) continue; // correctness-query carries no own stamp; the run summary above covers it
    const stamp = dig(bench(path), stampField);
    assert.ok(stamp, `${path} has no ${stampField} stamp — freshness cannot be established`);
    assert.ok(Date.parse(stamp) >= FRESH_AFTER,
      `${path} was generated at ${stamp}, before the mission window — a launch draft must not quote it`);
  }
});

test('the receipts table names only artifacts that exist in the tree', () => {
  const table = read(`${DRAFT_DIR}/receipts.md`);
  let cited = 0;
  for (const p of table.match(PATH_RE) || []) {
    if (!p.includes('/')) continue;
    assert.ok(existsSync(join(PLUGIN_ROOT, p)), `receipts.md cites ${p}, which is not in the tree`);
    cited++;
  }
  assert.ok(cited >= 10, `the receipts table must show its artifacts (only ${cited} paths cited)`);
});

// ---- every number in the drafts traces to a committed artifact, by VALUE ----------------------

test('no unreceipted number appears in the launch drafts', () => {
  const RECEIPTS = numericReceipts();
  for (const f of DRAFTS) {
    const prose = textOf(draft(f))
      .replace(URL_RE, ' ')       // URLs carry version and issue digits
      .replace(PATH_RE, ' ')      // a cited filename's digits are part of the citation
      .replace(VERSION_RE, ' ')     // v0.14.0 / 0.9.0 identify an engine, they do not claim anything
      .replace(IDENTIFIER_RE, ' ')  // sha256, Type-2: digits belonging to a name
      .replace(DATE_RE, ' ');       // a posting date is metadata, not a claim
    for (const m of prose.matchAll(/\d+(?:[.,]\d+)*/g)) {
      assert.ok(Object.hasOwn(RECEIPTS, m[0]),
        `${DRAFT_DIR}/${f} states "${m[0]}" with no receipt — every launch number traces to a committed artifact`);
    }
  }
});

test('each receipted number still equals the value its artifact records', () => {
  // The drift class: a harness re-run that moves a value must fail the draft that quotes it,
  // rather than leaving the old number sitting in copy that is about to be posted.
  for (const [token, [value, source]] of Object.entries(numericReceipts())) {
    assert.equal(Number(token.replace(/,/g, '')), value,
      `the launch drafts print "${token}" but ${source} says ${value}`);
  }
});

test('every receipted number is actually used by a draft (the table cannot rot into fiction)', () => {
  const prose = DRAFTS.map((f) => textOf(draft(f)).replace(URL_RE, ' ').replace(PATH_RE, ' ')).join('\n');
  const stated = new Set([...prose.matchAll(/\d+(?:[.,]\d+)*/g)].map((m) => m[0]));
  const unused = Object.keys(numericReceipts()).filter((t) => !stated.has(t));
  assert.deepEqual(unused, [], `these receipt entries match no number in either draft — delete them: ${unused.join(', ')}`);
});

test('the check count is derived from the receipts, not asserted against a remembered total', () => {
  // Guards the specific way this number went stale before: "33" outlived the retirement of H7,
  // so a hardcoded expectation would have kept passing. Retiring or adding a hypothesis must
  // move the drafts.
  const editSafety = bench('bench/results/edit-safety.json');
  assert.ok(Array.isArray(editSafety.retiredHypotheses),
    'edit-safety.json must record retiredHypotheses so a retired check is visible rather than silently missing');
  const stated = numericReceipts()['32'][0];
  assert.equal(stated, 32, 'the six fresh receipts enumerate 32 checks');
  for (const f of DRAFTS) {
    assert.doesNotMatch(textOf(draft(f)), /\b32\s*\/\s*33\b|\b32 of 33\b/,
      `${DRAFT_DIR}/${f} restates "32 / 33" — the 33rd (H7) was retired with the feature it measured`);
  }
});

test('all 32 pre-registered checks are recorded as passing', () => {
  // The drafts say "all 32 pass". If any receipt goes red, the claim must fail here rather than
  // being discovered by a reader.
  const receipts = ['correctness-query', 'edit-safety', 'auxiliary', 'detection-accuracy', 'performance', 'determinism']
    .map((n) => bench(`bench/results/${n}.json`));
  const failing = receipts.flatMap((r) => r.perHypothesis.filter((h) => h.passed !== true).map((h) => h.id));
  assert.deepEqual(failing, [], `the drafts claim all 32 checks pass, but these are red: ${failing.join(', ')}`);
});

// ---- the barred claims stay barred ------------------------------------------------------------

test('no draft states a charter-barred claim', () => {
  const BARRED = [
    // LAUNCH-KIT dontClaim, bound to the charter rows that ruled each one.
    [/\b126\s*[x×]/i, 'the 126x blast-radius ratio — its receipt (oracle-ab.json) predates the mission window'],
    [/\bsponsor\w*\b[^\n]{0,80}\b(?:pays?|paying|paid|funds?|funding|funded|bills?)\b/i, 'CHARTER C7: the sponsorship cost premise was ruled fabricated'],
    [/\b(?:pays?|paying|paid|funds?|funding|funded|bills?)\b[^\n]{0,80}\bsponsor\w*\b/i, 'CHARTER C7: the sponsorship cost premise was ruled fabricated'],
    [/\btwo modes\b/i, 'CHARTER C3: "two modes" external-review billing was demoted to a feature note'],
    [/\$\s*\d|\bSLA\b/i, 'CHARTER C4: enterprise price and SLA language was dropped'],
    [/\bfinds all clones\b|\b100%\s*recall\b/i, 'product.json dontClaim: body-confirmed overlap only'],
    [/\breplaces human review\b/i, 'product.json dontClaim: a structural pre-flight, not a semantic verdict'],
    [/\bprovably edit better\b/i, 'product.json dontClaim: H18 was a null'],
  ];
  for (const f of DRAFTS) {
    const body = textOf(draft(f));
    for (const [re, why] of BARRED) {
      assert.doesNotMatch(body, re, `${DRAFT_DIR}/${f} — ${why}`);
    }
  }
});

test('no draft names a rival product beside a number', () => {
  // Same rule the comparison page lives under: a named product beside a figure is a factual claim
  // about someone else's software, and this repo holds no regenerable receipt for one.
  const RIVALS = ['Serena', 'CodeGraphContext', 'CodeScene', 'CodeRabbit', 'Greptile', 'Sourcegraph',
    'Sourcetrail', 'CodeSee', 'dependency-cruiser', 'madge', 'Aider', 'Codacy', 'SonarQube', 'Qodo',
    'DeepSource', 'Sourcery', 'Cursor', 'Windsurf', 'Copilot'];
  for (const f of DRAFTS) {
    const body = textOf(draft(f));
    for (const rival of RIVALS) {
      assert.doesNotMatch(body, new RegExp(`\\b${rival}\\b`, 'i'),
        `${DRAFT_DIR}/${f} names ${rival} — a rival claim needs a receipt this repo does not hold`);
    }
  }
});

test('the superseded pilot figures are not quoted as live results', () => {
  // The v0.9.0 pilot numbers are true and are published on the comparison page WITH their frame.
  // In a post, stripped of it, they read as claims about the shipped engine. The drafts may
  // discuss the pilot qualitatively; they may not restate its figures.
  for (const f of DRAFTS) {
    const body = textOf(draft(f));
    assert.doesNotMatch(body, /\+?0\.31\b|\b0\.44\s*(?:->|→|to)\s*0\.74\b/,
      `${DRAFT_DIR}/${f} restates a v0.9.0 pilot figure — outside its framing it reads as a v0.14.0 claim`);
    assert.doesNotMatch(body, /\b(44|34)\s*(?:%|percent)/i,
      `${DRAFT_DIR}/${f} restates a saving that did not replicate`);
  }
});

// ---- the honesty obligations the kit requires the post to carry -------------------------------

test('the Show HN title fits the channel limit', () => {
  // HN truncates at 80 characters. A title that overflows gets cut mid-claim, which is exactly
  // how a hedged statement turns into an unhedged one on the surface with the widest reach.
  const body = draft('show-hn.md');
  const title = /## Title\s*\n+```\n([^\n]+)\n```/.exec(body);
  assert.ok(title, 'show-hn.md must carry the submission title in a fenced block');
  assert.ok(title[1].length <= 80,
    `the Show HN title is ${title[1].length} characters; HN truncates at 80`);
  assert.match(title[1], /^Show HN: /, 'HN requires the "Show HN: " prefix for this category');
});

test('each draft publishes the null alongside the passes', () => {
  // The one thing this launch story is actually about. A draft that lists 32 passes and omits the
  // null is the exact dishonesty the pre-registration discipline exists to prevent.
  for (const f of DRAFTS) {
    const body = textOf(draft(f));
    assert.match(body, /\bnull\b/i, `${DRAFT_DIR}/${f} must state the capstone null`);
    assert.match(body, /did not replicate|not replicate/i,
      `${DRAFT_DIR}/${f} must say the earlier savings result did not replicate`);
  }
});

test('each draft states the local-product invariants it is trading on', () => {
  for (const f of DRAFTS) {
    const body = textOf(draft(f));
    assert.match(body, /MIT/, `${DRAFT_DIR}/${f} must state the licence`);
    assert.match(body, /no telemetry|no account/i, `${DRAFT_DIR}/${f} must state the no-accounts/no-telemetry invariant`);
    assert.match(body, /zero (required )?dependenc/i, `${DRAFT_DIR}/${f} must state the zero-dependency invariant`);
  }
});

test('the free-forever boundary is stated wherever the drafts mention the paid tier', () => {
  // CHARTER A3: the price intent may only travel WITH the boundary rule and its "intent, not a
  // live offer" qualifier. A price alone in a launch post is a commitment nobody ratified.
  for (const f of DRAFTS) {
    const body = textOf(draft(f));
    if (!/EUR 10|€10/.test(body)) continue;
    assert.match(body, /free forever/i, `${DRAFT_DIR}/${f} states the price without the free-forever rule beside it`);
    assert.match(body, /intent/i, `${DRAFT_DIR}/${f} states the price without the "intent, not a live offer" qualifier`);
    assert.match(body, /90 days/i, `${DRAFT_DIR}/${f} states the price without the active-author definition`);
  }
});
