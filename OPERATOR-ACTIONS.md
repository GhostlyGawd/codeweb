# Operator actions — the zero-code moves only the account owner can make

Everything below needs GhostlyGawd's credentials (GitHub settings, npm publish rights, search
consoles); none of it is code, and none of it can be done from a PR. The growth audits
(`reports/SEO.md`, `reports/FUNNEL.md`, `reports/CRO.md`, `reports/RETENTION.md`) rank the first item as worth more traffic than
every code change combined.

## 1. GitHub repo settings (SEO F1 · two browser steps, once · highest reach)

Session credentials cannot write repository settings. The remote proxy returns HTTP 403, and
the Actions `GITHUB_TOKEN` does not have administration permission.

`.github/repo-settings.json` stores the description, homepage, and topics. The topics include
`mcp`, `mcp-server`, `model-context-protocol`, and twelve more.
`.github/workflows/repo-settings.yml` applies the settings. The workflow needs one credential
that you create in the browser:

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

The registry workflow starts after each successful `release` workflow run. It uses `workflow_run` because
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

## 8. Gate-adoption counter needs a search token (`CODE_SEARCH_TOKEN`, 2026-08-18)

The weekly acquisition ledger records `gateReposExternal` — how many external repos run the gate
Action — because that is charter trigger arm 2, and it is the demand signal for the hosted tier.

The built-in Actions `GITHUB_TOKEN` has not worked for this search. Run 32143218144 recorded
`null`, while the identical query answers 200 from a user token — so the blocker is the
credential, not the query.

The old code hid that: `curl -sf` swallowed the status, making "search refused us" and "zero
adoption" identical silent nulls. The workflow now logs a `::warning::` naming the HTTP status,
but it still cannot record a real number until a usable credential exists:

1. https://github.com/settings/personal-access-tokens/new → **Fine-grained token**. Code search
   needs **no permissions at all** — public repos only, so leave every scope unset.
2. Repo → **Settings → Secrets and variables → Actions → New repository secret** → name it
   `CODE_SEARCH_TOKEN`, paste the token.
3. Actions → *acquisition ledger* → **Run workflow** to record a real count immediately.

Until then the series stays honest — `null` means "not measured", never "zero adoption". The
current true value is 0 external repos (verified by hand on 2026-08-18 with an authenticated
search).

Update 2026-09-02: the built-in token now answers this search — the dispatch at `d3bc53c`
(run 33674790253) recorded `gateReposExternal: 0` as a real integer, no `::warning::`. A
`CODE_SEARCH_TOKEN` is therefore no longer required to keep the series measured, though it stays
the documented fallback if the built-in token starts refusing the query again.

## 9. Directory submissions that need your login (2026-09-02)

Three distribution targets cannot be completed without an account, and one is closed for good:

- **glama.ai** — codeweb is auto-indexed and rendering correctly, but the listing is unclaimed,
  which Glama flags as limiting discoverability. Claiming needs a Glama sign-in.
- **hesreallyhim/awesome-claude-code** — recommendations go through a web-UI issue form only; its
  CONTRIBUTING forbids PRs and the `gh` CLI, and requires a human submitter.
- **Anthropic community plugin directory** — both submission forms sit behind an authenticated
  account. `claude plugin validate .` already passes, so the manifest will not bounce.
- **appcypher/awesome-mcp-servers** — archived upstream; GitHub refuses new PRs. Nothing to do.

Everything is already written: field-by-field values and copy-paste descriptions are in
`reports/submissions/README.md`, which also records the targets that are already done
(mcp.directory submitted, punkpeye/awesome-mcp-servers PR #13510 open, official MCP registry
current). Roughly 12 minutes of pasting in total.

## 10. The Show HN post needs your account (2026-09-02)

The v0.14.0 launch posts are written, receipt-bound, and committed in `reports/launch/`. One of
the two channels is already live and one needs you:

- **GitHub Discussions (Announcements)** — **posted**, no action needed. The announcement is on
  the repo itself; the URL is in the discussion list.
- **Show HN** — **needs your login.** https://news.ycombinator.com/submit answers "You have to be
  logged in to submit", there is no API route, and HN's guidelines expect the submitter to be the
  person behind the project (the same reason the awesome-claude-code form above is yours).

**Steps (~3 min).** Everything to paste is in `reports/launch/show-hn.md`:

1. Sign in at https://news.ycombinator.com/login
2. Open https://news.ycombinator.com/submit
3. Title and URL from the draft's front matter, then post the draft's "First comment" as the
   first comment on your own submission.

The draft also carries prepared answers for the three questions the post is most likely to draw
(LSP, grep, business model), and the thread discipline: answer with the receipt, link the
artifact, and if a number does not re-derive, fix the receipt rather than defend the number.

**One thing to know before you post.** The story is **32 pre-registered checks, all 32 pass**, and
every surface now says so — the drafts, the research page, the pre-registration receipt and the
launch kit. The older "32 / 33" framing is gone (corrected 2026-09-02).

The 33rd check (H7, sharded-subgraph query equivalence) measured a feature deliberately deleted in
July (`8b6cfd4`). It is recorded as retired in `bench/results/edit-safety.json` →
`retiredHypotheses`, with its decision source, rather than dropped.

H15, the study's published miss, now passes against its original criterion on the repaired
harness. If someone asks why the number moved, that is the answer, and `bench/preregistration.md`
states it on the page.

The count is now derived from the six receipts by `tests/preregistration-count.test.mjs` on every
gate run, so retiring or adding a hypothesis moves the published surfaces or fails the build —
which is the mechanism whose absence let "33" outlive H7 for six weeks.
