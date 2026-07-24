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

## 2. MCP registry publish (SEO F2 · ~30 min once)

`server.json` ships at the repo root (version is release-synced). Publish it:

```
brew install mcp-publisher        # or the release binary from github.com/modelcontextprotocol/registry
mcp-publisher login github        # interactive GitHub auth — proves io.github.ghostlygawd ownership
mcp-publisher publish             # validates + submits server.json
# verify: curl 'https://registry.modelcontextprotocol.io/v0/servers?search=codeweb'
```

Re-run `mcp-publisher publish` after each release (the release checklist prints a reminder once
this is wired; until then, it's manual).

## 3. Search engines (SEO F6 · Bing handled · Google needs 3 clicks)

Bing, Yandex, and the other IndexNow engines are handled: every site deploy pings them with the
sitemap's URLs (`.github/workflows/indexnow.yml` — no account, no secret; the ownership proof is
the key file the build emits). Google doesn't take IndexNow pings; it finds the sitemap through
`robots.txt` on its own schedule, so indexing happens either way. Search Console only adds the
dashboard (queries, impressions, index status) — and it needs your Google sign-in, which an
agent can't do for you:

1. https://search.google.com/search-console → **Add property** → *URL prefix* →
   `https://ghostlygawd.github.io/codeweb/`
2. Verify by **HTML tag** → send the `content="..."` token to an agent (one-line addition to the
   site head template), or use any other method you already have.
3. **Sitemaps** → submit `sitemap.xml`.

Bing Webmaster Tools (optional, dashboard only) can then import the verified Search Console
property in one click.

## 4. npm republish — nothing left to do

`NPM_TOKEN` is configured and working: the 0.9.0 publish came from the release workflow's npm
step, not a laptop. Cutting a release republishes npm automatically; v0.10.0 carries the
corrected registry doc (27 tools, category keywords) plus the site as the package homepage.
(Planned as "0.9.1" before Batches 7–8 landed feature work — the changelog's `### Added`
sections make it a minor per the release runbook.)

## 5. Personal email in plugin.json — resolved

`.claude-plugin/plugin.json` now lists the GitHub no-reply address.

## 6. VS Code Marketplace (parked)

Publishing `editor/vscode-codeweb` to the Marketplace stays **parked until you say go**
(standing instruction). The `.vsix` builds in CI; publishing needs a personal Azure DevOps
publisher token.
