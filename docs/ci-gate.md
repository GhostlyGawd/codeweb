# CI regression gate

Fail a pull request when an edit makes the structure worse — a **new dependency cycle**, a **new
duplication finding**, or a **symbol that loses all its callers**. Same verdict as
`scripts/diff.mjs`, run automatically on every PR.

## Add it to your repo

`.github/workflows/codeweb-gate.yml`:

```yaml
name: codeweb gate
on: pull_request
permissions:
  contents: read
  pull-requests: write            # only needed for `comment: true` below
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
          comment: true           # post the structural review as a sticky PR comment
```

`fetch-depth: 0` is **required**: the gate materializes the PR base commit to build the "before"
graph, so the full history must be present.

## The gate as a reviewer (`comment: true`)

With `comment: true` the action posts (and keeps updated, via a sticky marker) the same
**structural review digest** codeweb's own PRs get: the before→after delta (nodes, edges,
renames, cross-domain coupling, cycles, duplication findings), what blocked (if anything), and
the local reproduce command. Reviewers who never installed codeweb see the blast radius of every
gated PR where they already look. Notes:

- Requires `permissions: pull-requests: write` in the calling workflow (shown above) and a
  `pull_request` event. Without either, the comment is skipped with a warning and the **check
  verdict still enforces** — fork PRs with a read-only token degrade gracefully.
- The comment posts **before** the verdict fails the job, so a blocking regression always
  arrives with its explanation.

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
