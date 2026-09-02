# Show HN draft — v0.14.0

Submission-ready. Every number is bound in `receipts.md`. Operator submits (HN requires an
account and expects a human submitter); steps in `README.md`.

---

## Title

```
Show HN: Codeweb – I pre-registered 32 checks against independent oracles
```

*(Inside HN's title-length limit — asserted in `tests/launch-drafts.test.mjs`.)*

## URL

```
https://ghostlygawd.github.io/codeweb/research.html
```

The research page is the landing rather than the homepage: it opens with the pre-registration
framing, which is the part of this worth a click. The homepage is one nav click away.

## First comment (post immediately after submitting)

```
Author here.

codeweb maps a repository into a deterministic call/import graph and hands it to coding
agents over MCP - who calls this, what breaks if I change it, does this already exist -
so they stop grepping for structure. The same graph diffed across a PR becomes a CI gate
that fails a dependency cycle, a duplicate implementation, or a symbol that just lost its
last caller. Static analysis only; no LLM in the mapping loop, so the same code always
produces the same map.

The part I actually want feedback on is the evidence, not the tool.

Before collecting any data I wrote down 32 pass/fail checks - metric, procedure, and the
pass criterion for each - and graded them against oracles implemented separately from the
shipped code: a from-scratch Kosaraju SCC, a reverse-reachability BFS, an independent edit
applier. Six real repositories (axios, express, zod, flask, ripgrep, gorilla/mux), each
pinned to a SHA. All 32 pass: 497,864 answer-level comparisons against those oracles with
0 disagreements, 10,000 simulated edits where the pre-flight verdict never disagreed with
the real gate, and one structural digest per repository across 20 runs each.

Two things I want to be upfront about, because they are the reason I am posting the
evidence rather than a benchmark chart:

The oracles carry a negative control. Feed each one a deliberately wrong definition and
the harness must flag the disagreement - if it cannot fail, "0 disagreements" means
nothing. That control is in the committed receipt.

The capstone hypothesis was a null. I pre-registered "agents edit better with codeweb",
ran it on a frozen adversarially-screened task set, and got a paired difference of exactly
zero - a floor effect on tasks clean enough that the baseline already succeeded. It is
published in the repo beside the passes. A separate discovery pilot on an older engine did
show a caller-recall gain, and an earlier token-savings result from that same family did
not replicate when I re-ran it, so I lead with neither in this post.

I also found two real bugs by running these checks - a nondeterministic file enumeration
and a dead-code precision bug - which is the argument for pre-registration better than
anything I could say about it.

Performance, for the shape of it: 1,573 symbols and 5,001 edges over its own source in
1,178 ms cold, 143 ms warm; on a 3,215-symbol repository the worst query p95 is 51.89 ms,
of which 29.08 ms is Node process startup. The scaling fit over ten graphs gives an
exponent of 0.342 with a 95% CI upper bound of 0.5702, which is what rejects the quadratic
blowup the naive implementation had.

MIT, zero required dependencies, Node >= 22, runs entirely on your machine. No account, no
telemetry, no license key, and it reads code without ever executing it. 13 languages, 28
MCP tools, and a Claude Code plugin.

  npx -y @ghostlygawd/codeweb .

The full ledger - pre-registration, raw result JSON, the harnesses, and the honest list of
what I deliberately do not claim - is in the repo, and `node bench/run-all.mjs` re-runs the
whole study. I would rather be told a check is badly designed than have it quietly agree
with me.

https://github.com/GhostlyGawd/codeweb
```

## If asked "what about a language server / LSP?"

```
A language server answers one hop, on demand, inside one process. Four things I needed sit
outside that: transitive impact across the whole graph, duplicate-implementation detection,
dead code, and a diffable whole-graph snapshot - the artifact a CI gate needs to compare a
PR's structure against its base. codeweb replaces the grep loop, not your language server;
there is a page arguing it properly at /lsp.html.
```

## If asked "how is this different from just grepping?"

```
For a single symbol, grep is fine. The graph earns its keep on the transitive question -
what breaks two hops out - where the grep loop has to expand rounds and re-read files it
has already seen. I have a measured contrast on the site, but the honest caveat is that
the run behind it is from an older engine, so I am not quoting its number here. Re-running
it on the current engine is the next thing on my list.
```

## If asked about the business model

```
Everything that runs on one laptop against one repository is free forever, MIT - the map,
the MCP tools, the hooks, the CI gate Action, every language. That is a ratified line in
the repo's charter, not a phase. There is a hosted tier for teams that want the gate run
for them across repositories, with a stated price intent of EUR 10 per active author per
month, an active author being one who committed in the last 90 days. It is intent rather
than a live offer, and a payment problem there degrades the hosted service without ever
touching local tooling or your CI.
```

## Answering discipline for the thread

Per the LAUNCH-KIT: answer with receipts, link the artifact rather than an adjective. If
someone finds a number that does not re-derive, say so and fix the receipt. If a check is
badly designed, that is a real finding — record it in the honesty ledger rather than
defending it.

Do not restate the barred figures in the thread — the list is in `receipts.md` under "What
the drafts deliberately do not claim". The blast-radius cost ratio and the pilot recall
figures are published on the site with the framing that makes them honest; if a commenter
raises one, link the page that frames it rather than repeating the bare number here.
