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
the site and fails on drift — run `node site/build.mjs` after touching `site/`), and codeweb's
own structural self-review on `scripts/`.

## Where things live

`scripts/` pipeline + CLIs · `scripts/lib/` shared logic · `hooks/` Claude Code hooks ·
`bin/` npm bins · `site/` → builds into `docs/` (GitHub Pages) · `editor/vscode-codeweb/`
the extension · `tests/` (see `tests/README.md`) · `reports/` audit paper trail ·
`decisions/` + `specs/` design history.

## Releases

Maintainer-run: `.claude/skills/release-tag/SKILL.md` is the runbook (version prep →
`release.yml` publishes the GitHub Release and npm).
