# Contributing

One page, everything you need.

## The loop

```
git clone https://github.com/GhostlyGawd/codeweb.git && cd codeweb
npm ci                    # optional tree-sitter tier; the suite passes without it (a few skips)
npm test                  # the full suite, node:test, zero test dependencies
node scripts/check-consistency.mjs   # version/count/docs alignment — must say OK
```

Create a branch and make the change. Add tests beside the changed behavior. This repository is
tests-first, so each behavior change must include a test that fixes the behavior in place. Run the
two commands above, and then open a pull request.

## What CI gates

Each pull request runs these checks:

- the complete suite on Ubuntu with Node 22 and Node 24
- the complete suite on Windows with Node 22
- a no-AST job that verifies the optional tier is optional
- the benchmark smoke test
- `check-consistency`, which rebuilds the site and fails on drift
- codeweb's structural self-review of `scripts/`
- `tests/brand-sync.test.mjs`, which checks the visual surfaces

Run `node site/build.mjs` after you change a file under `site/`. See **Brand sync** below for the
visual-surface workflow.

## Where things live

`scripts/` pipeline + CLIs · `scripts/lib/` shared logic · `hooks/` Claude Code hooks ·
`bin/` npm bins · `site/` → builds into `docs/` (GitHub Pages) · `editor/vscode-codeweb/`
the extension · `tests/` (see `tests/README.md`) · `reports/` audit paper trail ·
`decisions/` + `specs/` design history.

## Writing style

`tests/copy-density.test.mjs` checks current product, operator, contributor, agent, and site
writing. Use these rules for new and revised prose:

- Keep a paragraph to approximately two sentences and no more than 55 words.
- Put independent facts in a list. Put one fact in each list item.
- Use consistent terms, direct sentences, active voice, and explicit subjects.
- Preserve technical meaning, values, units, conditions, requirements, and safety intent.
- Remove ambiguous pronouns, unnecessary synonyms, vague modifiers, and omitted information.
- State what the product is, what it does, and the measured result. Do not use theatrical
  scene-setting or problem-agitate-solve copy.
- State evidence directly. Link to the data instead of describing the writer's rigor.
- State the intended fact instead of using an “X, not Y” contrast.
- Lead with the outcome. Use read-only, deterministic, and zero-dependency properties where they
  answer a user concern.
- Refer to agents as the reader's plural agents: “your agents … they.”
- Put the outcome first, the number second, and the evidence link third. Keep study terminology
  and study design on the research page.
- Keep external product links out of the conversion path.
- Let `check-consistency` supply and verify tool and language counts.
- Do not claim ASD-STE100 compliance unless the formal compliance workflow passes every gate.

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
