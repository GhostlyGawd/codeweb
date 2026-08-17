# CI regression gate

The gate fails a pull request when an edit introduces one of these structural regressions:

- a **new dependency cycle**
- a **new duplication finding**
- a **non-exported symbol that loses every caller**

Exported symbols are exempt from the pull-request gate. The edit simulation and post-edit hook
also flag exported symbols as `check: call-caller-preflight`. The gate runs the same verdict as
`scripts/diff.mjs` on each pull request.

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
      - uses: GhostlyGawd/codeweb/.github/actions/codeweb-gate@v0.12.0
        with:
          target: src             # subdirectory to analyze (default: .)
          comment: true           # post the structural review as a sticky PR comment
          history: true           # keep a cross-PR trend line in the comment (Actions cache)
```

`fetch-depth: 0` is **required**: the gate materializes the PR base commit to build the "before"
graph, so the full history must be present.

**Pin the action to a release tag** (`@v0.12.0`-style, as above), not `@main` — a moving ref can
change your gate's verdict semantics under you. The `codeweb-ref` input (which version of the
engine runs) accepts a branch, tag, or commit sha and deserves the same pinning in production.

**Monorepos:** the gate analyzes one `target` per invocation. Gate several packages with a
matrix — each package gets its own verdict, comment, and (with `history: true`) its own trend:

```yaml
    strategy:
      matrix:
        target: [packages/api, packages/web]
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: GhostlyGawd/codeweb/.github/actions/codeweb-gate@v0.12.0
        with:
          target: ${{ matrix.target }}
```

## The gate as a reviewer (`comment: true`)

With `comment: true`, the action posts a **structural review digest** and updates the same sticky
comment after each run. The digest shows changes to nodes, edges, names, cross-domain coupling,
cycles, and duplication findings.

The digest also identifies each blocker and gives the local reproduction command. Reviewers can
inspect the pull request's blast radius without installing codeweb.

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
