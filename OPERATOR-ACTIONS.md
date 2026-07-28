# Operator actions — the zero-code moves only the account owner can make

Everything below needs GhostlyGawd's credentials (GitHub settings, npm publish rights, search
consoles); none of it is code, and none of it can be done from a PR. The growth audits
(`reports/SEO.md`, `reports/FUNNEL.md`, `reports/CRO.md`, `reports/RETENTION.md`) rank the first item as worth more traffic than
every code change combined.

## 1. GitHub repo settings (SEO F1 · two browser steps, once · highest reach)

No session credential can write repo settings — the remote proxy refuses with 403, and
Actions' `GITHUB_TOKEN` has no administration permission. So the settings are code now:
`.github/repo-settings.json` holds the description, homepage, and topics (`mcp`, `mcp-server`,
`model-context-protocol`, and twelve more), and `.github/workflows/repo-settings.yml` applies
it. It only needs a credential you mint in the browser:

1. https://github.com/settings/personal-access-tokens/new → **Fine-grained token** →
   Repository access: *Only select repositories* → `codeweb` → Permissions → Repository →
   **Administration: Read and write**. A short expiration is fine — it's needed once.
2. Repo → **Settings → Secrets and variables → Actions → New repository secret** → name it
   `REPO_SETTINGS_TOKEN`, paste the token.
3. Tell the agent (or Actions → repo-settings → Run workflow yourself). Delete the token
   afterwards if you like; while the secret exists, any merged edit to `repo-settings.json`
   re-applies automatically.

Zero-token alternative: the **About ⚙ gear** on the repo page edits description, website, and
topics in one dialog — paste the values from `.github/repo-settings.json`. (Every top-10 rival
for "mcp call graph codebase" carries 10–20 topics; codeweb currently has zero.)

## 2. MCP registry publish — automated (2026-07-25)

`.github/workflows/mcp-registry.yml` publishes `server.json` to the official registry. GitHub
Actions OIDC proves control of the `io.github.GhostlyGawd` namespace, so the workflow does not
need a browser login or secret.

The workflow starts after each successful `release` workflow run. It uses `workflow_run` because
events created with `GITHUB_TOKEN` do not start another workflow. You can also start the workflow
manually. The registry first listed version 0.12.0 on 2026-07-25.

Manual fallback, if ever needed:

```
brew install mcp-publisher        # or the release binary from github.com/modelcontextprotocol/registry
mcp-publisher login github        # interactive GitHub auth — proves io.github.GhostlyGawd ownership
mcp-publisher publish             # validates + submits server.json
# verify: curl 'https://registry.modelcontextprotocol.io/v0/servers?search=codeweb'
```

## 3. Search engines (SEO F6 · Bing handled · Google needs 3 clicks)

Each site deployment sends the sitemap URLs to Bing, Yandex, and the other IndexNow engines.
`.github/workflows/indexnow.yml` performs this action without an account or secret. The key file
that the build creates proves ownership.

Google does not accept IndexNow requests. Google finds the sitemap through `robots.txt` on its own
schedule. Search Console adds a dashboard for queries, impressions, and index status. You must use
your Google account to enable the dashboard:

1. https://search.google.com/search-console → **Add property** → *URL prefix* →
   `https://ghostlygawd.github.io/codeweb/`
2. Verify by **HTML tag** → send the `content="..."` token to an agent (one-line addition to the
   site head template), or use any other method you already have.
3. **Sitemaps** → submit `sitemap.xml`.

Bing Webmaster Tools (optional, dashboard only) can then import the verified Search Console
property in one click.

## 4. npm republish — nothing left to do

`NPM_TOKEN` is configured and working. The release workflow published version 0.9.0 to npm.
The workflow publishes each new release automatically.

Version 0.10.0 added the corrected registry document, category keywords, and the site as the
package homepage. The original plan called this release 0.9.1. Batches 7 and 8 added features, so
the release runbook required a minor version.

## 5. Personal email in plugin.json — resolved

`.claude-plugin/plugin.json` now lists the GitHub no-reply address.

## 6. VS Code Marketplace (parked)

Publishing `editor/vscode-codeweb` to the Marketplace stays **parked until you say go**
(standing instruction). The `.vsix` builds in CI; publishing needs a personal Azure DevOps
publisher token.

## 7. Branch protection: make the `check` gate required (harness install, 2026-07-26)

The goal-prompts harness is installed (ADR-0001 in `DECISIONS.md`; contract at
`docs/harness.md`): `sh scripts/check` now runs after every agent edit, before every commit,
and in CI (`.github/workflows/check.yml`). The one enforcement moment only you can wire is
branch protection — without it, a red `check` can still merge:

1. Repo → **Settings → Branches → Add branch ruleset** (or classic protection rule) for
   `main`.
2. Enable **Require status checks to pass** → search and add **`check`** (the job from
   `check.yml`). Adding the existing `test` / `consistency` jobs too is your call.
3. Optional, same dialog: **Require review from Code Owners** — `.github/CODEOWNERS` already
   routes the harness layer (`scripts/check`, the hooks, `check.yml`, `tests/harness/`,
   `evals/run.py`) to @GhostlyGawd.

Note for fresh clones: `core.hooksPath` is per-clone — run
`git config core.hooksPath .githooks` after cloning (CI backstops either way).
