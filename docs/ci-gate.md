# CI regression gate

Fail a pull request when an edit makes the structure worse — a **new dependency cycle**, a **new
duplication finding**, or a **symbol that loses all its callers**. Same verdict as
`scripts/diff.mjs`, run automatically on every PR.

## Add it to your repo

`.github/workflows/codeweb-gate.yml`:

```yaml
name: codeweb gate
on: pull_request
jobs:
  gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0          # required — the gate diffs against the PR base sha
      - uses: GhostlyGawd/codeweb/.github/actions/codeweb-gate@main
        with:
          target: src             # subdirectory to analyze (default: .)
```

`fetch-depth: 0` is **required**: the gate materializes the PR base commit to build the "before"
graph, so the full history must be present.

## What it does

1. Builds the **after** graph from the PR head (the checked-out working tree).
2. Builds the **before** graph from the PR base — checked out read-only into an ephemeral git
   worktree, so your tree is never touched.
3. Runs the `diff` regression gate. **Exit 1** (PR fails) on a regression, **exit 0** otherwise.

Pure removals never trip the gate — deleting code, cycles, or duplication is an improvement. A
brand-new uncalled function is reported but does not fail the build (agents add functions before
wiring them).

## Run it locally

```
node scripts/ci-gate.mjs --base <ref> [--repo <path>] [--target <subdir>]
```

`--base` is any git ref (a branch, tag, or sha) to compare the current working tree against.
