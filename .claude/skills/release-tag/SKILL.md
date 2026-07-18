---
name: release-tag
description: Cut and publish a codeweb release end-to-end — prep the version/changelog file ecosystem, land it on main, push the vX.Y.Z tag, and let the tag-triggered workflow publish the GitHub Release. Use when asked to "cut a release", "tag a release", "publish vX.Y.Z", "do the release", or "ship version X".
---

# codeweb release runbook

A release is three moves: **prep the files → land on main → push the tag**. The tag push
triggers `.github/workflows/release.yml`, which publishes the GitHub Release server-side
with notes sliced from `CHANGELOG.md` — so the whole flow works from ANY environment,
including ones with no `gh` CLI and no GitHub-release API access (remote agent sessions).

Never commit to `main` directly; never push a tag until its release commit is ON `main`.

## 0. Preconditions

- CI green on `main`; working tree clean.
- `npm test` passes locally (expect ~400 tests; skips are fine — they're tree-sitter-absence tests).
- `node scripts/check-consistency.mjs` reports OK.
- `CHANGELOG.md` has a meaningful `[Unreleased]` section — that text becomes the release notes.

## 1. Prep the file ecosystem

Preferred (one motion):

```sh
node scripts/release.mjs --minor          # or --patch / --major / --version=X.Y.Z
```

It bumps `package.json`, rolls `[Unreleased]` into `## [X.Y.Z] - <today>` (+ link refs),
version-syncs `plugin.json` / `SKILL.md` / README badge / the mcp-server version literal,
rebuilds the site, and re-runs the consistency check. It never touches git.

**If executing the script is blocked** (some managed environments deny it), make the same
edits by hand with file-editing tools — the script is just these steps:

1. `package.json`: bump `"version"`.
2. `CHANGELOG.md`: retitle `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD`, add a fresh
   empty `## [Unreleased]` above it, and update the link refs at the bottom
   (`[Unreleased]: ...compare/vX.Y.Z...HEAD`, add `[X.Y.Z]: ...compare/vPREV...vX.Y.Z`).
3. Run `node scripts/version-sync.mjs` if runnable; otherwise mirror it: version fields in
   `.claude-plugin/plugin.json` and `skills/codebase-anatomy/SKILL.md`, the README version
   badge, and the hardcoded version literal in `scripts/mcp-server.mjs` (if drifted).
4. `node site/build.mjs` (regenerates `docs/`).
5. `node scripts/check-consistency.mjs` — must be OK before committing.

## 2. Land it on main

Commit on a feature branch, open a PR, let CI (`test` + `consistency` + the codeweb gate)
pass, merge. The release commit must be the one carrying the version bump.

## 3. Tag the release commit

**Path A — you can push tags** (local dev, tokens with full repo write):

```sh
git fetch origin main
git tag -a vX.Y.Z -m "codeweb vX.Y.Z" origin/main   # or the explicit release commit SHA
git push origin vX.Y.Z
```

The tag must point at a commit that CONTAINS `.github/workflows/release.yml` — tag-push
runs use the workflow file at the tagged commit, not at main.

**Path B — tag push denied** (remote agent sessions: push access is scoped to the
designated branch, so `refs/tags/*` gets HTTP 403; retrying is pointless — it's policy,
not network): dispatch the `release` workflow on `main` instead. It creates the tag
server-side at the dispatched ref, then publishes **in the same run** (a
GITHUB_TOKEN-pushed tag never re-triggers the tag-push path — GitHub's recursion guard).

- UI: Actions → release → "Run workflow" on `main` (version input optional — defaults to
  `package.json`).
- GitHub MCP: `actions_run_trigger` with `workflow_file: release.yml`, `ref: main`.

Rules the workflow enforces on both paths: the version must match `package.json` at the
tagged/dispatched ref (mismatch fails the run), and a hyphenated version (`v1.0.0-rc.1`)
publishes as a prerelease automatically.

## 4. Verify

- The `release` workflow run goes green (Actions tab, or `actions_list` over MCP).
- The Release exists: https://github.com/GhostlyGawd/codeweb/releases/tag/vX.Y.Z
  (over MCP: `get_release_by_tag`). Notes should read as the CHANGELOG section, not a
  fallback pointer.

The workflow is idempotent — re-running it (or re-pushing the tag) skips cleanly if the
Release already exists.

## Rollback

```sh
git push origin --delete vX.Y.Z     # remove the tag
```

Delete the GitHub Release from the releases page (or API) if it was published. Fix, then
re-prep/re-tag. Never move a tag that others may have fetched — cut a patch release instead.

## Environment variants

- **Remote / gh-less, branch-scoped push** (managed agent sessions): use Path B
  (workflow_dispatch). Everything else — prep, PR, verify — works unchanged. If script
  execution is also blocked, use the manual file-edit equivalent in step 1.
- **Remote / gh-less, full push access** (plain CI, deploy keys): Path A; publishing
  still happens server-side in the workflow.
- **Local with `gh`**: Path A; `gh release view vX.Y.Z` is a convenient verify. Creating
  the release manually with `gh release create` is unnecessary (the workflow will detect
  it and skip) but harmless.
