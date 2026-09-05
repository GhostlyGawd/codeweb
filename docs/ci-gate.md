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
      - uses: GhostlyGawd/codeweb/.github/actions/codeweb-gate@v0.14.0
        with:
          target: src             # subdirectory to analyze (default: .)
          codeweb-ref: v0.14.0    # pin the engine too — see below
          comment: true           # post the structural review as a sticky PR comment
          history: true           # keep a cross-PR trend line in the comment (Actions cache)
```

`fetch-depth: 0` is **required**: the gate materializes the PR base commit to build the "before"
graph, so the full history must be present.

**Pin the action to a release tag** (`@v0.13.0`-style, as above), not `@main` — a moving ref can
change your gate's verdict semantics under you. Pin the engine as well: `codeweb-ref` accepts a
branch, tag, or commit sha, and it defaults to `main` so the zero-config path keeps working.

Pin both to the same tag. The Action ref selects the workflow steps; `codeweb-ref` selects the
engine those steps clone and run. Left unpinned, either one can move under a green build.

**Monorepos:** the gate analyzes one `target` per invocation. Gate several packages with a
matrix — each package gets its own verdict, comment, and (with `history: true`) its own trend:

```yaml
    strategy:
      matrix:
        target: [packages/api, packages/web]
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: GhostlyGawd/codeweb/.github/actions/codeweb-gate@v0.14.0
        with:
          target: ${{ matrix.target }}
          codeweb-ref: v0.14.0
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

From the project directory, use the installed package:

```sh
npx -y @ghostlygawd/codeweb gate --base origin/main --target src
```

`--base` is any git ref (a branch, tag, or sha) to compare the current working tree against.


A source checkout can run `node scripts/ci-gate.mjs` with the same options.
A passing gate means only that the named structural rules found no regression. It does not prove runtime correctness or complete analysis of dynamic calls.

## Start with report-only checks

Use report-only mode to inspect findings before you enable blocking:

```sh
npx -y @ghostlygawd/codeweb gate --base origin/main --target src --report-only
```

The structural verdict and Markdown digest keep the regression finding. Only a completed regression changes from exit 1 to exit 0 in report-only mode.
Missing refs, failed graph builds, usage errors, and interrupted analysis still fail. Blocking remains the default.

For the Action, add `report-only: true` under `with:`. Use an Action ref and matching engine ref that contain this option; earlier releases do not support it.
The Action keeps the original gate exit code in its `verdict-code` output: 0 for clean, 1 for regression, and 2 for setup or analysis error.

## Check setup before the first query

Run these commands from your project directory:

```sh
npx -y @ghostlygawd/codeweb setup --client cursor
npx -y @ghostlygawd/codeweb .
npx -y @ghostlygawd/codeweb doctor --client cursor --config .cursor/mcp.json --json
```

`setup` prints a recipe without writing configuration. Choose `claude`, `cursor`, `windsurf`, `gemini`, or `codex`; merge the printed server entry into the named file and keep existing entries.
To remove the setup, remove only the `codeweb` server entry that you added.

`doctor` checks Node, the installed local MCP server, graph presence, and recorded source freshness. Its JSON lists named `pass`, `fail`, or `unknown` checks and an `ok` result.
Required failures or unverified freshness return exit 2. A successful local check returns exit 0; editor connection always remains unverified.

The optional `--client` and `--config` flags must be used together. Diagnostics inspect only that supplied file, never execute its command, and never print its values.
The Codex check supports the basic TOML recipe from `setup`. Other TOML forms can return `unknown`; this means the check cannot verify that syntax.

### Prove a caller query

Use a small source file, such as `src/example.js`:

```js
export function add(a, b) { return a + b; }
export function twice(x) { return add(x, x); }
```

Build its map with `npx -y @ghostlygawd/codeweb src --out-dir .codeweb`, then ask your connected agent to call `codeweb_callers` with `{"symbol":"add"}`.
The result must name `twice` as a caller. This query checks the editor connection and the map answer; the local doctor handshake alone cannot check the editor connection.
