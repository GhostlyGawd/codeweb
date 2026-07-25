# Contributing

One page, everything you need.

## The loop

```
git clone https://github.com/GhostlyGawd/codeweb.git && cd codeweb
npm ci                    # optional tree-sitter tier; the suite passes without it (a few skips)
npm test                  # the full suite, node:test, zero test dependencies
node scripts/check-consistency.mjs   # version/count/docs alignment — must say OK
```

Branch, change, add tests beside the behavior you changed (this repo is tests-first — every
behavior change lands with the test that pins it), run the two commands above, open a PR.

## What CI gates

Every PR runs: the full suite on ubuntu (Node 22 + 24) and windows (22), a no-AST leg (proves
the optional tier is optional), the benchmark smoke, `check-consistency` (which also rebuilds
the site and fails on drift — run `node site/build.mjs` after touching `site/`), codeweb's
own structural self-review on `scripts/`, and `tests/brand-sync.test.mjs` (visual surfaces —
see "Brand sync" below).

## Where things live

`scripts/` pipeline + CLIs · `scripts/lib/` shared logic · `hooks/` Claude Code hooks ·
`bin/` npm bins · `site/` → builds into `docs/` (GitHub Pages) · `editor/vscode-codeweb/`
the extension · `tests/` (see `tests/README.md`) · `reports/` audit paper trail ·
`decisions/` + `specs/` design history.

## Copy style (README, site, listings)

`tests/copy-density.test.mjs` gates the density; the voice rules are convention:

- Max ~2 sentences per paragraph. Over ~55 words, the test fails the build.
- Facts become bullets — one fact per line. Never a paragraph of eleven facts.
- State facts; skip the theater. No rhetorical-question openers, no "Today…" scene-setting,
  no drama fragments. The formula to avoid is problem-agitate-solve. The replacement: what it
  is, what it does, the number.
- Don't perform credibility. No meta-talk about our own rigor ("measured, not just claimed",
  "we couldn't move the goalposts", "published, not buried"). State the number, link the data,
  and let readers draw the conclusion.
- No "X, not Y" contrasts. The "not Y" half is posture. Say X.
- Sell the outcome; place properties as answers. Read-only, deterministic, zero-dependency are
  answers to specific worries (will it touch my code? will answers flake? is it heavy?) — they
  live in install and trust copy, never as headline features. The headline is what the user
  gets: agents that write better code, and a map.
- Subject, verb, object. No mirror constructions ("what it misses is what it breaks").
- Agents are plural and the reader's: "your agents … they", never "the agent … it".
- Outcome first, number second, receipt link third. Stats vocabulary (recall, F1, MRR)
  stays on the research page — and so does study apparatus (referees, corpora, A/B framing).
  The pitch never explains how something was measured; it says what you get, then links.
- Never link away from the funnel. No outbound links to other products inside the pitch.
- Tool and language counts are gated by `check-consistency` — never hardcode a new one.

## Brand sync (visual surfaces)

The report UI, the live demo, the screenshots, the README art, and the site are one visual
system. `tests/brand-sync.test.mjs` fails the build when they drift:

- **Tokens** — the report template and `site/tokens.css` must share the core palette; retired
  palettes (the old categorical set, traffic-light severity, the GitHub-dark and crafted-dark
  eras) are banned by hex on every authored surface. One accent (`#C6F24E`); data rides
  luminance ramps, never a second hue.
- **Shapes** — brand SVGs contain no circles, ellipses, or rounded rects; the injected demo
  nav carries no pills.
- **The demo is generated, not hand-kept.** After touching `scripts/report-template.html`,
  regenerate it: `node scripts/build-report.mjs docs/demo/axios.graph.json --out
  docs/demo/index.html --no-md && node site/build.mjs` (discard the `graph.json`
  `meta.generatedAt` churn). The gate byte-compares the demo's embedded style/script against
  the template.
- **Screenshots are stamped.** `assets/screens/.template-stamp` records the template hash the
  screenshots were shot from. A template change fails the gate until you re-shoot from
  `docs/demo/` (and *look at every image*), then run `node scripts/stamp-screens.mjs`.
- **Captions are receipts.** Every "N symbols … M domains" / "N callers" caption in the README
  and site is checked against `docs/demo/axios.graph.json`. Never type a number the graph
  doesn't contain.

## Releases

Maintainer-run: `.claude/skills/release-tag/SKILL.md` is the runbook (version prep →
`release.yml` publishes the GitHub Release and npm).
