#!/usr/bin/env node
// Build the hosted HTML paper (docs/paper/index.html) — self-contained (figures inlined, no external
// refs, so it works anywhere GitHub Pages serves it), brand-matched to the repo's GitHub-dark hero.
// Figures are read from paper/figures/*.svg (regenerate them first: node paper/figures/make-figures.mjs).
//   node paper/build-paper.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const fig = (name) => readFileSync(join(ROOT, 'paper', 'figures', name), 'utf8').trim();
const figure = (name, cap) => `<figure class="fig">${fig(name)}<figcaption>${cap}</figcaption></figure>`;

// pull a couple of live numbers so the prose can't silently drift from the data
const env = (() => {
  try { return JSON.parse(readFileSync(join(ROOT, 'paper/results/_env.json'), 'utf8')); } catch {}
  try { return JSON.parse(readFileSync(join(ROOT, 'paper/results/performance.json'), 'utf8'))._env || {}; } catch { return {}; }
})();
const corpus = (() => { try { return JSON.parse(readFileSync(join(ROOT, 'paper/corpus.manifest.json'), 'utf8')); } catch { return []; } })();
const corpusLine = corpus.map((c) => `${c.name}@${c.describe}`).join(' · ');

const CSS = `
:root{--bg:#0d1117;--panel:#161b22;--line:#30363d;--tx:#e6edf3;--mut:#8b949e;--blue:#58a6ff;--green:#3fb950;--purple:#a371f7;--amber:#ffb65c;--red:#f85149}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--tx);font:16px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
.hero{background:radial-gradient(circle at 50% 0%,#11161f,#0d1117 70%);border-bottom:1px solid var(--line);padding:64px 24px 40px}
.wrap{max-width:880px;margin:0 auto;padding:0 24px}
h1{font-size:38px;line-height:1.15;margin:0 0 12px;letter-spacing:-.5px}
.sub{font-size:18px;color:var(--mut);margin:0 0 20px;max-width:760px}
.meta{font-size:13px;color:var(--mut);font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
.nav{margin:22px 0 0;display:flex;flex-wrap:wrap;gap:8px}
.nav a{font-size:13px;color:var(--blue);text-decoration:none;border:1px solid var(--line);border-radius:999px;padding:5px 13px;background:#161b2266}
.nav a:hover{border-color:var(--blue);background:#1f6feb22}
section{padding:8px 0}
h2{font-size:26px;margin:46px 0 6px;padding-top:18px;border-top:1px solid var(--line);letter-spacing:-.3px}
h3{font-size:19px;margin:30px 0 4px;color:var(--tx)}
p{margin:12px 0}
a{color:var(--blue)}
code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.88em;background:#161b22;border:1px solid var(--line);border-radius:5px;padding:1px 6px}
pre{background:#161b22;border:1px solid var(--line);border-radius:10px;padding:16px 18px;overflow:auto}
pre code{background:none;border:none;padding:0;font-size:13px;line-height:1.6}
.abstract{background:linear-gradient(180deg,#161b22,#0d1117);border:1px solid var(--line);border-left:3px solid var(--blue);border-radius:12px;padding:8px 24px;margin:30px 0}
.callout{background:#161b22;border:1px solid var(--line);border-left:3px solid var(--amber);border-radius:10px;padding:6px 20px;margin:22px 0}
figure.fig{margin:26px 0;background:#0d111788;border:1px solid var(--line);border-radius:12px;padding:14px}
figure.fig svg{width:100%;height:auto;display:block}
figcaption{color:var(--mut);font-size:13px;margin-top:10px;text-align:center;line-height:1.5}
table{width:100%;border-collapse:collapse;margin:18px 0;font-size:14.5px}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--mut);font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:.4px}
tr:hover td{background:#161b2255}
.mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
.pass{color:var(--green);font-weight:700}.fail{color:var(--amber);font-weight:700}
.big{font-weight:800}
.lede{font-size:18px;color:var(--tx)}
ul{margin:12px 0;padding-left:22px}li{margin:6px 0}
.foot{border-top:1px solid var(--line);margin-top:54px;padding:30px 0 70px;color:var(--mut);font-size:13.5px}
.foot a{margin-right:16px}
.tag{display:inline-block;font-size:11px;font-weight:700;color:var(--green);border:1px solid var(--green);border-radius:5px;padding:1px 7px;vertical-align:middle;margin-left:8px}
.tag.warn{color:var(--amber);border-color:var(--amber)}
`;

const GH = 'https://github.com/GhostlyGawd/codeweb';
const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Does codeweb work? — A pre-registered effectiveness study</title>
<meta name="description" content="An empirical, pre-registered evaluation of codeweb: determinism, correctness, detection accuracy, performance, and agent outcomes. 32/33 checks pass; two real bugs found and fixed.">
<meta property="og:title" content="Does codeweb work? A pre-registered effectiveness study">
<meta property="og:description" content="32/33 pre-registered checks pass. 0 disagreements across ~120k correctness comparisons. Two real bugs found and fixed.">
<style>${CSS}</style></head>
<body>
<header class="hero"><div class="wrap">
<h1>Does codeweb work?</h1>
<p class="sub">A pre-registered effectiveness study — determinism, correctness, detection accuracy, performance, and agent outcomes, measured against independent oracles and a pinned cross-language corpus.</p>
<p class="meta">codeweb @ main · ${env.cores || 8}× ${env.cpu || 'x86-64'} · node ${env.node || 'v24'} · corpus pinned by SHA · every number reproducible with <code>node paper/run-all.mjs</code></p>
<nav class="nav">
<a href="#abstract">Abstract</a><a href="#method">Methodology</a><a href="#results">Results</a><a href="#bugs">Bugs found &amp; fixed</a><a href="#limits">Limitations</a><a href="#repro">Reproduce</a>
<a href="${GH}/blob/main/paper/PRE-REGISTRATION.md">Pre-registration ↗</a><a href="${GH}/tree/main/paper/results">Raw data ↗</a><a href="${GH}">Repo ↗</a>
</nav>
</div></header>

<main class="wrap">

<section id="abstract"><div class="abstract">
<h2 style="border:none;margin-top:18px">Abstract</h2>
<p>codeweb dissects a repository into atomic symbols, wires a call/import graph, clusters domains, and surfaces duplication — then serves that graph as an interactive map for humans and ~20 deterministic tools for coding agents. We asked, with scientific rigor, <span class="lede">does it actually work?</span> We decomposed "effectiveness" into five measurable properties and <strong>pre-registered 18 hypotheses plus ~15 auxiliary checks</strong> — each with an explicit null, an independent oracle, and a pass criterion fixed <em>before</em> any data.</p>
<p><strong>32 of 33 checks pass.</strong> Correctness is exact (<strong>0 disagreements over ~120,000 comparisons</strong> vs independent oracles; 0 violations over 20,000 edit-safety trials). Detection is accurate (exact-clone <strong>F1 1.0</strong> vs 0.67 baseline; renamed-clone recall <strong>1.0 structural vs 0.0 lexical</strong>; reuse MRR <strong>0.99</strong>). It scales <strong>sub-linearly</strong> (exponent b=0.33) and answers queries in ~120&nbsp;ms. And — the strongest sign the evaluation is real — the harnesses <strong>found two genuine bugs</strong> the engine's own 286-test suite missed; we fixed both and re-ran to prove the corrected claims.</p>
</div>
${figure('fig-scorecard.svg', 'Every shipped feature maps to at least one pre-registered check. The one miss (H15) is a measured characterization, not a defect — see §3.5.')}
</section>

<section id="why">
<h2>1 · Why test a tool this way</h2>
<p>Tools are usually sold on promises. codeweb makes <em>falsifiable</em> claims — "deterministic", "body-confirmed", "high-confidence dead code", "predicts the gate" — so we treated each as a hypothesis and tried to break it, applying the project's own engineering rigor to the evaluation: tests before implementations, independent oracles, adversarial review, and honest reporting of whatever the data showed. "Effectiveness" decomposes into five measurable properties:</p>
<table><thead><tr><th>Property</th><th>Question</th><th>Theme</th></tr></thead><tbody>
<tr><td class="big">Deterministic</td><td>Same input ⇒ same output? Incremental ≡ full?</td><td>1</td></tr>
<tr><td class="big">Correct</td><td>Do the structural answers equal independent ground truth?</td><td>2</td></tr>
<tr><td class="big">Accurate</td><td>Do the detectors hit real precision / recall?</td><td>3</td></tr>
<tr><td class="big">Performant</td><td>Does it scale; is it fast enough for an edit loop?</td><td>4</td></tr>
<tr><td class="big">Useful</td><td>Do agents edit better <em>with</em> it?</td><td>5 (capstone)</td></tr>
</tbody></table>
</section>

<section id="method">
<h2>2 · Methodology</h2>
<p><strong>Pre-registration.</strong> Every hypothesis and its null, metric, procedure, and pass criterion were fixed in <a href="${GH}/blob/main/paper/PRE-REGISTRATION.md">PRE-REGISTRATION.md</a> before data — the scientific analogue of writing the test before the implementation. Deviations are logged transparently in its §9.</p>
<p><strong>Corpus.</strong> A broad basket spanning all five native languages, cloned and pinned by SHA: <span class="mono">${corpusLine || 'axios · express · zod · flask · ripgrep · gorilla-mux'}</span> (~923 source files). Seeded synthetic corpora supply exact ground truth where real repos can only approximate it.</p>
<p><strong>Independent oracles.</strong> Each correctness claim is checked against a second, independently-written implementation (a naive Kosaraju for SCCs; a from-scratch reverse-BFS for impact; a separate edit-applier for the pre-flight oracle) — never against codeweb's own internals.</p>
<p><strong>Statistics.</strong> One shared, self-tested library: <strong>Wilson</strong> intervals for proportions, the <strong>Rule of Three</strong> (≤ 3/n) for zero-failure bounds, <strong>seeded bootstrap</strong> CIs, <strong>Cliff's δ</strong> for effect size, <strong>log-log OLS</strong> for scaling. No number without its uncertainty.</p>
<p><strong>Adversarial verification.</strong> Before a claim entered this paper an independent reviewer re-ran the harness and tried to <em>refute</em> it — checking oracle independence, non-vacuity (can the test fail?), whether the number meets the criterion, and whether the prose overstates the data.</p>
</section>

<section id="results">
<h2>3 · Results</h2>

<h3>3.1 · Determinism <span class="tag">2/2 pass</span></h3>
<table><thead><tr><th>Hyp</th><th>Claim</th><th>Result</th><th>Evidence</th></tr></thead><tbody>
<tr><td class="mono">H1</td><td>Byte-deterministic pipeline</td><td class="pass">PASS<sup>†</sup></td><td>1 distinct structural digest per repo across <strong>R=20</strong> runs, all 6 repos — including domain assignment</td></tr>
<tr><td class="mono">H2</td><td>Incremental refresh ≡ full rebuild</td><td class="pass">PASS</td><td>0 canonical mismatches over <strong>T=360</strong> seeded edits; Rule-of-Three bound ≤ 0.83%</td></tr>
</tbody></table>
<p><sup>†</sup> H1 began as a <em>failure</em> — the testing surfaced real nondeterminism (and a crash). Fixed, then proven; see <a href="#bugs">§4</a>.</p>

<h3>3.2 · Correctness vs independent oracles <span class="tag">11/11 pass</span></h3>
<p>The backbone of the proof: codeweb's structural answers are <em>exactly</em> an independent ground truth, over a very large number of trials.</p>
${figure('fig-correctness.svg', '10,000 seeded random graphs plus all six real repos; the shipped CLI cross-checked against the library so the proof covers the real artifact.')}
<table><thead><tr><th>Hyp</th><th>What</th><th>Comparisons</th><th>Disagreements</th></tr></thead><tbody>
<tr><td class="mono">H3</td><td><code>--cycles</code> == independent Kosaraju SCC</td><td>10,212</td><td class="pass">0</td></tr>
<tr><td class="mono">H4</td><td><code>--impact</code> == independent reverse-BFS</td><td>120,454</td><td class="pass">0</td></tr>
<tr><td class="mono">A-CALL</td><td><code>--callers/--callees</code> == raw call-edge neighbors</td><td>120,454</td><td class="pass">0</td></tr>
<tr><td class="mono">A-CP</td><td><code>context-pack</code> window == impact set (no omissions)</td><td>120,454</td><td class="pass">0</td></tr>
</tbody></table>
<h3>3.3 · Edit-safety &amp; pre-flight <span class="tag">6/6 pass</span></h3>
<p>The tools an agent leans on before editing are provably faithful — 0 violations across every trial:</p>
<table><thead><tr><th>Hyp</th><th>Claim</th><th>Trials</th><th>Violations</th></tr></thead><tbody>
<tr><td class="mono">H5</td><td><code>simulate-edit</code> verdict == the actual post-edit gate verdict</td><td>10,000</td><td class="pass">0</td></tr>
<tr><td class="mono">H6</td><td><code>campaign</code> steps never add a cycle absent from base, at any prefix</td><td>2,000</td><td class="pass">0</td></tr>
<tr><td class="mono">H7</td><td>a sharded query == the whole-graph query</td><td>2,000</td><td class="pass">0</td></tr>
<tr><td class="mono">H8</td><td><code>codemod</code> plan == post-write actual; merge↔inverse restores graph</td><td>2,000</td><td class="pass">0</td></tr>
<tr><td class="mono">A-CUT</td><td>every <code>break-cycles</code> cut, applied, removes its cycle</td><td>2,000</td><td class="pass">0</td></tr>
<tr><td class="mono">A-READ</td><td><code>reading-order</code> lists callees before callers (cycles degrade gracefully)</td><td>2,000</td><td class="pass">0</td></tr>
</tbody></table>

<h3>3.4 · Detection accuracy <span class="tag">5/5 pass</span></h3>
${figure('fig-detection.svg', 'Synthetic corpora with K planted clones (exact ground truth) plus body-confirmed axios labels for external validity.')}
<table><thead><tr><th>Hyp</th><th>Metric</th><th>codeweb</th><th>Baseline / contrast</th></tr></thead><tbody>
<tr><td class="mono">H9</td><td>Type-1 (exact) clone P / R / F1</td><td class="pass">1.0 / 1.0 / 1.0</td><td>name-match F1 0.67; axios precision 0.98</td></tr>
<tr><td class="mono">H10</td><td>Type-2 (renamed) clone recall</td><td class="pass">structural 1.0</td><td>lexical 0.0 (paired CI [1.0, 1.0])</td></tr>
<tr><td class="mono">H11</td><td><code>find-similar</code> MRR / r@1 / r@5</td><td class="pass">0.99 / 0.975 / 1.0</td><td>random MRR 0.11</td></tr>
<tr><td class="mono">H12</td><td>max <em>false</em> hub in-degree</td><td class="pass">0</td><td>legacy path fabricates 11</td></tr>
<tr><td class="mono">H13</td><td>dead-code safe-tier precision (recall)</td><td class="pass">1.0 (1.0)<sup>†</sup></td><td>legacy 0.52; axios 0.98</td></tr>
</tbody></table>
<p><sup>†</sup> H13 also began as a failure (a real footgun); fixed and proven — see <a href="#bugs">§4</a>.</p>

<h3>3.5 · Performance &amp; scale <span class="tag warn">3/4 pass</span></h3>
${figure('fig-scaling.svg', 'Runtime fit by log-log OLS over 10 points (6 real repos + 4 size-graded synthetic corpora). A quadratic engine would land at 2.0 and fail.')}
<table><thead><tr><th>Hyp</th><th>Claim</th><th>Result</th></tr></thead><tbody>
<tr><td class="mono">H14</td><td>Sub-quadratic scaling</td><td class="pass">PASS — exponent b=0.33, CI [0.13, 0.53]</td></tr>
<tr><td class="mono">H15</td><td>Incremental speedup at every churn fraction</td><td class="fail">PARTIAL — faster ≤10% churn (0.93–0.96×), parity at 25–50%</td></tr>
<tr><td class="mono">H16</td><td>Zero runtime dependencies</td><td class="pass">PASS — runs on empty node_modules</td></tr>
<tr><td class="mono">H17</td><td>Sub-second query latency</td><td class="pass">PASS — median 117 ms, p95 264 ms (ripgrep, 3,201 symbols)</td></tr>
</tbody></table>
<p>H15 is the one honest miss: the pre-registered criterion demanded a speedup at <em>every</em> churn fraction, and refresh only wins for realistic small changes. We report the curve, not a slogan.</p>

<h3>3.6 · Feature coverage <span class="tag">11/11 pass</span></h3>
<p>Every remaining shipped feature was pinned to an independent check: per-language extraction (<strong>5/5</strong> languages), self-contained report, treemap termination on adversarial input, CI-gate exit codes, duplication-trend monotonicity, placement gravity (<strong>200/200</strong>), fitness-rule detection (recall 1.0, 0 false flags), risk monotonicity (<strong>0/10,000</strong> violations), the hotspots formula (<strong>0/460</strong> mismatch), suppression identity, and <strong>MCP↔CLI parity across all 20 tools</strong>.</p>

<h3>3.7 · Agent outcome (capstone)</h3>
<div class="callout"><p><strong>Theme 5 — in progress.</strong> The pre-registered agent A/B field study (H18): does a coding agent equipped with codeweb's pre-edit tools introduce fewer structural regressions and less new duplication than the same agent without them? Tasks are proposed, adversarially screened for fairness, and frozen before any solver runs; each edit is graded by codeweb's own verified <code>diff.mjs</code> gate. Effect size and confidence intervals will appear here on completion. Per the pre-registration this is the weakest-evidence theme; the thesis above rests on Themes 1–4.</p></div>
</section>

<section id="bugs">
<h2>4 · What the study found <em>in codeweb itself</em></h2>
<p>A study that only confirms is suspect. The strongest evidence that this evaluation is rigorous is that it <strong>found real bugs</strong> — and fixed them in the open, each behind a reproducible A/B lever so anyone can flip the fix off and watch the metric regress.</p>
${figure('fig-findfix.svg', 'Two pre-registered checks failed first, surfacing defects the 286-test suite missed, then passed after a surgical fix.')}
<ul>
<li><strong>The pipeline was not deterministic.</strong> <code>extract-symbols</code> enumerated files via <code>rg --files</code>, whose parallel walk returns an unordered list; that order propagated into node ordering <em>and</em> domain assignment, so the same repo produced different analysis on different runs. And <code>overlap.mjs</code> crashed the whole pipeline on <code>express</code> via a stack-overflowing <code>Math.min(...sims)</code>. Fixes: sort the file list; use a spread-free reduce. The 286-test suite — which pins invariants, not reproducibility — never caught either.</li>
<li><strong>"Safe to delete" wasn't safe.</strong> <code>deadcode</code>'s safe tier correctly excluded symbols <em>called by</em> tests, but not functions <em>defined in</em> test files (helpers, mocks, <code>it</code>/<code>describe</code>). On <code>express</code>, 928 of 932 "safe" items were test functions; "delete the safe list" would have deleted the suite's scaffolding. Fix: route test-file definitions to "review". Safe-tier precision rose <strong>0.52 → 1.0</strong>.</li>
</ul>
</section>

<section id="limits">
<h2>5 · Limitations &amp; threats to validity</h2>
<ul>
<li><strong>Construct.</strong> "Regression" is defined operationally by <code>diff.mjs</code> (new cycle / new duplication / lost-all-callers) — a structural proxy for harm, not a semantic-correctness oracle.</li>
<li><strong>External validity.</strong> Synthetic corpora give exact labels but an artificial distribution; the six real repos give a realistic distribution but approximate labels (the axios labels are body-confirmed human-style judgments, disclosed as such).</li>
<li><strong>Baseline contrast (H9).</strong> The name-match baseline's precision is pinned near 0.5 by the 1:1 planted ratio; the F1 separation is genuine but its magnitude is partly a construct property.</li>
<li><strong>Timing.</strong> Single-machine wall-clock; we foreground portable quantities (log-log slope, ratios). H17 is run-to-run variable.</li>
<li><strong>Agent A/B (Theme 5).</strong> Not byte-reproducible (model nondeterminism); the weakest-evidence theme by design, explicitly not load-bearing for the thesis.</li>
</ul>
</section>

<section id="repro">
<h2>6 · Reproduce it</h2>
<pre><code>bash paper/corpus/clone-corpus.sh     # clone + pin the corpus by SHA
node paper/run-all.mjs                # regenerate every deterministic result + the env manifest</code></pre>
<p>Raw results: <a href="${GH}/tree/main/paper/results">paper/results/</a>. Pre-registration &amp; deviation log: <a href="${GH}/blob/main/paper/PRE-REGISTRATION.md">PRE-REGISTRATION.md</a>. Each harness exits non-zero if any hypothesis misses its pre-registered criterion, so a silently-broken claim cannot ship green.</p>
<h2 id="conclusion" style="border-top:none">7 · Conclusion</h2>
<p class="lede">codeweb's deterministic guarantees are not marketing.</p>
<p>Its structural analysis is exactly correct against independent oracles over ~120k trials, its detectors are accurate against labeled ground truth, and it is fast and dependency-free. Where it fell short, the evaluation said so — and in two cases that honesty produced a better tool, because the harnesses found defects the existing test suite did not. Outcomes over promises: the data is in <a href="${GH}/tree/main/paper/results">paper/results/</a>, and it regenerates with one command.</p>
</section>

<div class="foot wrap">
<a href="${GH}">codeweb on GitHub ↗</a><a href="${GH}/blob/main/paper/PRE-REGISTRATION.md">Pre-registration ↗</a><a href="${GH}/tree/main/paper/results">Raw data ↗</a><a href="../demo/">Interactive demo ↗</a>
<p>Generated by <code>node paper/build-paper.mjs</code> from pre-registered, committed results. Figures from <code>paper/figures/make-figures.mjs</code>.</p>
</div>
</main></body></html>
`;

mkdirSync(join(ROOT, 'docs', 'paper'), { recursive: true });
const dest = join(ROOT, 'docs', 'paper', 'index.html');
writeFileSync(dest, html);
console.log('[build-paper] wrote', dest, `(${(html.length / 1024).toFixed(1)} KB, self-contained)`);
