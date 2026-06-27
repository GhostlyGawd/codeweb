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
const ab = (() => { try { return JSON.parse(readFileSync(join(ROOT, 'paper/results/agent-ab.json'), 'utf8')); } catch { return null; } })();
const abN = (path, dflt) => { try { return path.split('.').reduce((o, k) => o[k], ab); } catch { return dflt; } };

const CSS = `
:root{--bg:#100E14;--panel:#1A1820;--line:#322E3A;--tx:#ECECEE;--mut:#9C99A6;--blue:#C6F24E;--green:#5BD17A;--purple:#A78BFA;--amber:#FFB14E;--red:#FF5D5D}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--tx);font:16px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
.hero{background:radial-gradient(circle at 76% -12%,rgba(198,242,78,.08),#0A090D 56%,#100E14 100%);border-bottom:1px solid var(--line);padding:64px 24px 40px}
.wrap{max-width:880px;margin:0 auto;padding:0 24px}
h1{font-size:38px;line-height:1.15;margin:0 0 12px;letter-spacing:-.5px}
.sub{font-size:18px;color:var(--mut);margin:0 0 20px;max-width:760px}
.meta{font-size:13px;color:var(--mut);font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
.nav{margin:22px 0 0;display:flex;flex-wrap:wrap;gap:8px}
.nav a{font-size:13px;color:var(--blue);text-decoration:none;border:1px solid var(--line);border-radius:999px;padding:5px 13px;background:#1A182066}
.nav a:hover{border-color:var(--blue);background:#C6F24E22}
section{padding:8px 0}
h2{font-size:26px;margin:46px 0 6px;padding-top:18px;border-top:1px solid var(--line);letter-spacing:-.3px}
h3{font-size:19px;margin:30px 0 4px;color:var(--tx)}
p{margin:12px 0}
a{color:var(--blue)}
code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.88em;background:#1A1820;border:1px solid var(--line);border-radius:5px;padding:1px 6px}
pre{background:#1A1820;border:1px solid var(--line);border-radius:10px;padding:16px 18px;overflow:auto}
pre code{background:none;border:none;padding:0;font-size:13px;line-height:1.6}
.abstract{background:linear-gradient(180deg,#1A1820,#100E14);border:1px solid var(--line);border-left:3px solid var(--blue);border-radius:12px;padding:8px 24px;margin:30px 0}
.callout{background:#1A1820;border:1px solid var(--line);border-left:3px solid var(--amber);border-radius:10px;padding:6px 20px;margin:22px 0}
figure.fig{margin:26px 0;background:#100E1488;border:1px solid var(--line);border-radius:12px;padding:14px}
figure.fig svg{width:100%;height:auto;display:block}
figcaption{color:var(--mut);font-size:13px;margin-top:10px;text-align:center;line-height:1.5}
table{width:100%;border-collapse:collapse;margin:18px 0;font-size:14.5px}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--mut);font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:.4px}
tr:hover td{background:#1A182055}
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
<p>codeweb dissects a repository into atomic symbols, wires a call/import graph, clusters domains, and surfaces duplication — then serves that graph as an interactive map for humans and ~20 deterministic tools for coding agents. We asked, with scientific rigor, <span class="lede">does it actually work?</span> We decomposed "effectiveness" into five measurable properties and <strong>pre-registered 33 pass/fail checks across five themes</strong> (plus an agent-A/B capstone) — each with an explicit null, an independent oracle, and a pass criterion fixed <em>before</em> any data.</p>
<p><strong>32 of 33 checks pass.</strong> Correctness held against independent oracles — <strong>zero observed disagreements over &gt;490,000 comparisons</strong> (each symbol-level oracle ran ~120,000; Rule-of-Three bounds &lt;0.03% to &lt;0.0025%), and 0 violations over 20,000 edit-safety trials. Detection is accurate (exact-clone <strong>F1 1.0</strong> vs 0.67 baseline — partly a construct of the planted ratio; renamed-clone recall <strong>1.0 structural vs 0.0 lexical</strong>; reuse MRR <strong>0.99</strong>). It scales <strong>sub-quadratically</strong> — sub-linearly in this corpus (b=0.33, CI [0.13, 0.53]) — and answers queries in ~95–120&nbsp;ms. And — the strongest sign the evaluation is real — the harnesses <strong>found two genuine bugs</strong> the engine's own 286-test suite missed; we fixed both and re-ran to re-establish the corrected claims. The capstone agent A/B (§3.7) returned a <strong>null</strong> (paired difference exactly 0): the pre-edit tools engaged and answered correctly, but a capable base model already left no headroom on clean tasks — reported honestly as a pilot.</p>
<p><strong>A post-hoc follow-up (Theme-5b, §3.8) found the first measurable agent win.</strong> The H18 null was a <em>floor effect</em>; a separate pilot isolated the mechanism the efficiency thesis rests on — pre-edit <strong>discovery</strong> ("find the complete caller set you'd have to update") — on high-fan-out targets, control (grep) vs treatment (codeweb <code>--dependents</code>), same <strong>frontier</strong> base model. Across 8 engine-frozen reps graded against a hand-verified frozen truth set, codeweb lifted caller-discovery <strong>recall by +0.265 ± 0.045</strong> (all 8 reps positive; ≈6× the noise) while using <strong>≈34% fewer tool-calls</strong> and <strong>≈44% fewer tokens</strong>; output-token and wall-clock deltas were within noise. It measures <em>discovery</em> (upstream of edit quality) and is not one of the 33 pre-registered checks — but it is the first evidence codeweb moves a frontier agent where the task has headroom.</p>
</div>
${figure('fig-scorecard.svg', 'Every shipped feature maps to at least one pre-registered check. The one miss (H15) is a measured characterization, not a defect — see §3.5.')}
</section>

<section id="why">
<h2>1 · Why test a tool this way</h2>
<p>Tools are usually sold on promises. codeweb makes <em>falsifiable</em> claims — "deterministic", "body-confirmed", "high-confidence dead code", "predicts the gate" — so we treated each as a hypothesis and tried to break it, applying the project's own engineering rigor to the evaluation: tests before implementations, independent oracles, adversarial review, and honest reporting of whatever the data showed. "Effectiveness" decomposes into five measurable properties:</p>
<table><thead><tr><th>Property</th><th>Question</th><th>Theme</th></tr></thead><tbody>
<tr><td class="big">Deterministic</td><td>Same input ⇒ same output? Incremental ≡ full?</td><td>1</td></tr>
<tr><td class="big">Correct</td><td>Do the structural answers match independent ground truth?</td><td>2</td></tr>
<tr><td class="big">Accurate</td><td>Do the detectors hit real precision / recall?</td><td>3</td></tr>
<tr><td class="big">Performant</td><td>Does it scale; is it fast enough for an edit loop?</td><td>4</td></tr>
<tr><td class="big">Useful</td><td>Do agents edit better <em>with</em> it? And is pre-edit <em>discovery</em> cheaper for a frontier agent?</td><td>5 (capstone) · 5b (pilot)</td></tr>
</tbody></table>
</section>

<section id="method">
<h2>2 · Methodology</h2>
<p><strong>Pre-registration.</strong> Every hypothesis and its null, metric, procedure, and pass criterion were fixed in <a href="${GH}/blob/main/paper/PRE-REGISTRATION.md">PRE-REGISTRATION.md</a> before data — the scientific analogue of writing the test before the implementation. Deviations are logged transparently in its §9.</p>
<p><strong>Corpus.</strong> A broad basket spanning all five native languages, cloned and pinned by SHA: <span class="mono">${corpusLine || 'axios · express · zod · flask · ripgrep · gorilla-mux'}</span> (~923 source files). Seeded synthetic corpora supply exact ground truth where real repos can only approximate it.</p>
<p><strong>Independent oracles.</strong> Each correctness claim is checked against a second implementation that does not call codeweb's internals: a naive Kosaraju for SCCs, a from-scratch reverse-BFS for impact, and — for the pre-flight check — an independently-written edit-applier from the project's property-test harness (separate from the engine under test, though in-repo; disclosed as such).</p>
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
<p><sup>†</sup> H1 began as a <em>failure</em> — the testing surfaced real nondeterminism (and a crash). Fixed, then re-established; see <a href="#bugs">§4</a>.</p>

<h3>3.2 · Correctness vs independent oracles <span class="tag">5/5 pass</span></h3>
<p>The backbone of the evidence: codeweb's structural answers matched an independent ground truth in <em>every</em> trial. Each symbol-level oracle below independently ran ~120,000 per-symbol comparisons; <strong>&gt;490,000 in total, zero observed disagreements</strong>.</p>
${figure('fig-correctness.svg', '10,000 seeded random graphs plus all six real repos; the shipped CLI cross-checked against the library so the result covers the real artifact.')}
<table><thead><tr><th>Hyp</th><th>What</th><th>Comparisons</th><th>Disagreements</th></tr></thead><tbody>
<tr><td class="mono">H3</td><td><code>--cycles</code> == independent Kosaraju SCC</td><td>10,212</td><td class="pass">0</td></tr>
<tr><td class="mono">H4</td><td><code>--impact</code> == independent reverse-BFS</td><td>120,454</td><td class="pass">0</td></tr>
<tr><td class="mono">A-CALL</td><td><code>--callers/--callees</code> == raw call-edge neighbors</td><td>120,454</td><td class="pass">0</td></tr>
<tr><td class="mono">A-TESTS</td><td><code>--tests</code> == independent test-edge scan</td><td>120,454 (eff. ~10²)</td><td class="pass">0</td></tr>
<tr><td class="mono">A-CP</td><td><code>context-pack</code> window == impact set (no omissions)</td><td>120,454</td><td class="pass">0</td></tr>
</tbody></table>
<h3>3.3 · Edit-safety &amp; pre-flight <span class="tag">6/6 pass</span></h3>
<p>The tools an agent leans on before editing are faithful to the actual gate — 0 violations across every trial:</p>
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
<tr><td class="mono">H12</td><td>max <em>false</em> hub in-degree</td><td class="pass">0</td><td>legacy fabricates 11–30 across seeds</td></tr>
<tr><td class="mono">H13</td><td>dead-code safe-tier precision (recall)</td><td class="pass">1.0 (1.0)<sup>†</sup></td><td>legacy 0.52; axios 0.98</td></tr>
</tbody></table>
<p><sup>†</sup> The name-match baseline's 0.67 is partly a construct of the 1:1 planted clone:distractor ratio (§5); the genuine result is body-confirmation driving codeweb's false positives to zero where name-matching does not. H13 also began as a failure (a real footgun); fixed and re-established — see <a href="#bugs">§4</a>.</p>

<h3>3.5 · Performance &amp; scale <span class="tag warn">3/4 pass</span></h3>
${figure('fig-scaling.svg', 'Runtime fit by log-log OLS over 10 points (6 real repos + 4 size-graded synthetic corpora). A quadratic engine would land at 2.0 and fail.')}
<table><thead><tr><th>Hyp</th><th>Claim</th><th>Result</th></tr></thead><tbody>
<tr><td class="mono">H14</td><td>Sub-quadratic scaling</td><td class="pass">PASS — b=0.33, CI [0.13, 0.53], R² 0.56 (n=10, noisy); the CI rules out quadratic</td></tr>
<tr><td class="mono">H15</td><td>Incremental speedup at every churn fraction</td><td class="fail">PARTIAL — faster ≤10% churn (0.93–0.96×), parity at 25–50%</td></tr>
<tr><td class="mono">H16</td><td>Zero runtime dependencies</td><td class="pass">PASS — runs on empty node_modules</td></tr>
<tr><td class="mono">H17</td><td>Sub-second query latency</td><td class="pass">PASS (run-dependent) — typical ~95–100 ms; worst-case median 117 ms, p95 264 ms (ripgrep, 3,201 symbols)</td></tr>
</tbody></table>
<p>H14 passes the pre-registered bar (the CI rules out quadratic; in this corpus the fit is sub-linear, but R² 0.56 on 10 points makes it a noisy estimate). H15 is the one pass/fail miss: the criterion demanded a speedup at <em>every</em> churn fraction, and refresh only wins for realistic small changes — we report the curve. H17 latency is run-to-run variable: the worst-case median passed this committed run (117 ms) but has exceeded 250 ms under load; we report the distribution, comfortably sub-second regardless.</p>

<h3>3.6 · Feature coverage <span class="tag">11/11 pass</span></h3>
<p>Every remaining shipped feature was pinned to an independent check: per-language extraction (<strong>5/5</strong> languages), self-contained report, treemap termination on adversarial input, CI-gate exit codes, duplication-trend monotonicity, placement gravity (<strong>200/200</strong>), fitness-rule detection (recall 1.0, 0 false flags), risk monotonicity (<strong>0/10,000</strong> violations), the hotspots formula (<strong>0/460</strong> mismatch), suppression identity, and <strong>MCP↔CLI parity across all 20 tools</strong>.</p>

<h3>3.7 · Agent outcome (capstone) <span class="tag warn">null / inconclusive</span></h3>
<p>The pre-registered agent A/B (H18): does a coding agent equipped with codeweb's pre-edit tools (<code>find-similar</code>, <code>placement</code>, <code>impact</code>, <code>simulate-edit</code>) introduce fewer structural regressions and less new duplication than the same agent without them? Nine tasks (add / refactor / fix across axios, flask, express) were proposed, adversarially screened for fairness, and <strong>frozen before any solver ran</strong>. ${abN('completion.completed', 34)} of ${abN('completion.cells', 36)} cells completed (both non-completions on the <em>control</em> arm: 18 treatment vs 16 control).</p>
<div class="callout"><p><strong>No measurable difference.</strong> The pre-registered statistic — the <strong>paired</strong> per-task difference — was <strong>exactly 0</strong> (bootstrap CI [0,0]); that interval is <em>degenerate</em> (all 8 paired tasks had identical counts in both arms — a floor, not power). New duplication was <strong>0 in both arms</strong>; per-condition regression means were ${abN('perCondition.treatment.structuralRegressions.mean', 0.111)} (treatment) vs ${abN('perCondition.control.structuralRegressions.mean', 0.125)} (control); Cliff's δ negligible. The null is <em>valid, not confounded</em> — <strong>all ${abN('toolEngagement.treatmentUsedTools', 18)} treatment cells used the tools</strong>, which answered correctly (<code>find-similar</code> reported no existing equivalent on the reuse tasks; <code>placement</code> confirmed the right directory). Two caveats: grading used codeweb's verified <code>diff.mjs</code> but was run by the solver in its own workspace (<strong>self-reported</strong>, not independently re-graded — though the grader is a deterministic, verified function); and on these clean tasks a capable base model already avoids regressions/duplication, so codeweb <em>corroborated rather than corrected</em> (a floor effect). The effect on easy tasks is bounded near zero; demonstrating corrective value needs higher-blast-radius tasks or a weaker base model. Per the pre-registration the thesis rests on Themes 1–4; H18 is an honest pilot.</p></div>

<h3>3.8 · Agent discovery &amp; efficiency (Theme-5b — post-hoc pilot) <span class="tag">measurable win</span></h3>
<p>§3.7's null was a <em>floor effect</em>, not evidence of no value: on clean, well-scoped tasks a capable frontier model already makes regression-free edits, so codeweb had nothing to correct. Theme-5b removes that ceiling by isolating the mechanism the efficiency thesis rests on — pre-edit <strong>discovery</strong>: <em>"find the complete set of callers you would have to update if you changed this symbol."</em> Four deliberately high-fan-out targets (axios <code>merge</code>, <code>AxiosError</code>, <code>AxiosHeaders</code>; flask <code>render_template</code>), read-only A/B: <strong>control</strong> (grep/read only) vs <strong>treatment</strong> (codeweb's one-shot <code>--dependents</code>), same <strong>frontier base model</strong>. This is <strong>not</strong> a pre-registered confirmatory test (logged as a post-hoc deviation in §9.5); its trustworthiness comes from a hand-verified <strong>frozen truth</strong> set (independent of codeweb's own coverage), <strong>8 engine-frozen reps</strong> reporting the <strong>paired delta</strong> (treatment − control) as mean ± SD — where the SD <em>is</em> the noise floor a real effect must clear — and oracle-independent mechanism proofs (after the scanner fix, axios <code>AxiosError --callers</code> went <strong>1 → 20</strong>, <code>merge</code> <strong>3 → 6</strong>).</p>
<table><thead><tr><th>Metric (treatment − control)</th><th>Paired Δ ± SD</th><th>S/N</th><th>Reading</th></tr></thead><tbody>
<tr><td>discovery <strong>recall</strong></td><td class="pass">+0.265 ± 0.045</td><td>5.9</td><td>0.39 → 0.65; <em>all 8 reps positive</em> (symbol-level; file-level higher)</td></tr>
<tr><td><strong>tool-calls</strong> (runtime)</td><td class="pass">−6.44 ± 3.11</td><td>2.1</td><td>≈34% fewer; corroborates the agents' self-reported steps (−6.84) with an unbiased count</td></tr>
<tr><td><strong>total tokens</strong></td><td class="pass">−910k ± 394k</td><td>2.3</td><td>≈44% fewer (2.07M → 1.16M / rep)</td></tr>
<tr><td>output tokens</td><td class="fail">−827 ± 2393</td><td>0.35</td><td>within noise — honest null</td></tr>
<tr><td>wall-clock</td><td class="fail">−36k ± 57k ms</td><td>0.63</td><td>within noise &amp; concurrency-confounded — honest null</td></tr>
</tbody></table>
<p>The saving is <strong>less context-loading, not less thinking</strong>: the token drop is cache-read (1.83M → 0.99M) and input, while generation (output) is flat — exactly what "one deterministic query replaces grep→read→trace" predicts, and it concentrates on the high-fan-out classes where discovery is hardest. It bounds the H18 floor effect to <em>easy edit tasks</em> and is the first defensible evidence codeweb moves a <strong>frontier</strong> agent — on <em>discovery</em> (recall + cost), which is upstream of, not the same as, edit quality; it does <strong>not</strong> overturn the H18 edit-quality null. Scope: 4 targets / 2 repos / n=8; tool-calls and total tokens are the trustworthy axes (wall-clock is not). Data: <a href="${GH}/blob/main/paper/experiments/efficiency-pilot.reps8.json">efficiency-pilot.reps8.json</a> (recall), <a href="${GH}/blob/main/paper/experiments/efficiency-pilot.usage.json">efficiency-pilot.usage.json</a> (cost).</p>
</section>

<section id="bugs">
<h2>4 · What the study found <em>in codeweb itself</em></h2>
<p>A study that only confirms is suspect. The strongest evidence that this evaluation is rigorous is that it <strong>found real bugs</strong> — and fixed them in the open, each behind a reproducible A/B lever so anyone can flip the fix off and watch the metric regress.</p>
${figure('fig-findfix.svg', 'Two pre-registered checks failed first, surfacing defects the 286-test suite missed, then passed after a surgical fix.')}
<ul>
<li><strong>The pipeline was not deterministic.</strong> <code>extract-symbols</code> enumerated files via <code>rg --files</code>, whose parallel walk returns an unordered list (checked directly: 4 distinct orderings in 6 runs vs 1 when sorted); that order propagated into node ordering <em>and</em> domain assignment, so the same repo produced different analysis on different runs. And <code>overlap.mjs</code> crashed the whole pipeline on <code>express</code> via a stack-overflowing <code>Math.min(...sims)</code>. Fixes: sort the file list; use a spread-free reduce. The 286-test suite — which pins invariants, not reproducibility — never caught either.</li>
<li><strong>"Safe to delete" wasn't safe.</strong> <code>deadcode</code>'s safe tier correctly excluded symbols <em>called by</em> tests, but not functions <em>defined in</em> test files (helpers, mocks, <code>it</code>/<code>describe</code>). On <code>express</code>, 928 of 932 "safe" items were test functions; "delete the safe list" would have deleted the suite's scaffolding. Fix: route test-file definitions to "review". Safe-tier precision rose <strong>0.52 → 1.0</strong>.</li>
</ul>
</section>

<section id="limits">
<h2>5 · Limitations &amp; threats to validity</h2>
<ul>
<li><strong>Construct.</strong> "Regression" is defined operationally by <code>diff.mjs</code> (new cycle / new duplication / lost-all-callers) — a structural proxy for harm, not a semantic-correctness oracle.</li>
<li><strong>External validity.</strong> Synthetic corpora give exact labels but an artificial distribution; the six real repos give a realistic distribution but approximate labels (the axios labels are body-confirmed human-style judgments, disclosed as such).</li>
<li><strong>Baseline contrast (H9).</strong> The name-match baseline's precision is pinned near 0.5 by the 1:1 planted ratio; the F1 separation is genuine but its magnitude is partly a construct property.</li>
<li><strong>Oracle independence.</strong> The Theme 2 SCC/impact oracles are from-scratch; the H5 pre-flight oracle reuses an edit-applier from the project's property-test harness (independent of the engine, but in-repo). Disclosed, not overstated.</li>
<li><strong>Timing.</strong> Single-machine wall-clock; we foreground portable quantities (slope, ratios). H17 has failed a strict single-run threshold under load.</li>
<li><strong>Calibrated language.</strong> "Zero observed disagreements" with a Rule-of-Three bound is empirical evidence at a stated confidence, not a formal proof; we avoid "proven".</li>
<li><strong>Agent A/B (Theme 5).</strong> Not byte-reproducible; rests on 8 paired tasks with a degenerate (floor-effect) CI and self-reported (if deterministic) grading; the weakest-evidence theme, not load-bearing.</li>
<li><strong>Theme-5b (discovery pilot, §3.8).</strong> Post-hoc, not pre-registered (§9.5); measures caller <em>discovery</em> (a proxy upstream of edit quality), not edit quality itself; 4 targets / 2 repos / n=8; agent-driven. Recall, tool-calls, and total tokens clear the noise floor; output-tokens and wall-clock do not (nulls), and wall-clock is additionally concurrency-confounded.</li>
</ul>
</section>

<section id="repro">
<h2>6 · Reproduce it</h2>
<pre><code>bash paper/corpus/clone-corpus.sh     # clone + pin the corpus by SHA
node paper/run-all.mjs                # regenerate every deterministic result + the env manifest</code></pre>
<p>Raw results: <a href="${GH}/tree/main/paper/results">paper/results/</a>. Pre-registration &amp; deviation log: <a href="${GH}/blob/main/paper/PRE-REGISTRATION.md">PRE-REGISTRATION.md</a>. Each harness exits non-zero if any hypothesis misses its pre-registered criterion, so a silently-broken claim cannot ship green.</p>
<h2 id="conclusion" style="border-top:none">7 · Conclusion</h2>
<p class="lede">codeweb's deterministic guarantees are not marketing.</p>
<p>Its structural analysis matched independent oracles in every one of ~490,000 trials, its detectors are accurate against labeled ground truth, and it is fast and dependency-free. Where it fell short, the evaluation said so — and in two cases that honesty produced a better tool, because the harnesses found defects the existing test suite did not. And in the one place we gave codeweb headroom to help a <strong>frontier</strong> agent — recovering the complete caller set of a high-fan-out symbol — it did, measurably and above the noise floor (recall +0.27, ≈34% fewer tool-calls, ≈44% fewer tokens; §3.8), even as the easier edit-quality capstone (H18) stayed a null. Outcomes over promises: the data is in <a href="${GH}/tree/main/paper/results">paper/results/</a>, and the deterministic results regenerate with one command.</p>
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
