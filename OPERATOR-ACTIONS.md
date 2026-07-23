# Operator actions — the zero-code moves only the account owner can make

Everything below needs GhostlyGawd's credentials (GitHub settings, npm publish rights, search
consoles); none of it is code, and none of it can be done from a PR. The growth audits
(`SEO.md`, `FUNNEL.md`, `CRO.md`, `RETENTION.md`) rank the first item as worth more traffic than
every code change combined.

## 1. GitHub repo settings (SEO F1 · minutes · highest reach)

**Settings → General**, on https://github.com/GhostlyGawd/codeweb:

- **Description** (leads with the searched nouns; the persuasion angle is CRO C11):

  > See what an edit breaks before you write it — deterministic call/import graph + 27 MCP tools for coding agents. Claude Code plugin & MCP server; zero deps, runs 100% locally.

- **Website**: `https://ghostlygawd.github.io/codeweb/`

- **Topics** (paste all — every top-10 rival for "mcp call graph codebase" carries 10–20 of these;
  codeweb currently has zero):

  `mcp` `mcp-server` `model-context-protocol` `claude-code` `claude-code-plugin` `call-graph`
  `dependency-graph` `code-analysis` `static-analysis` `code-visualization` `codebase-map`
  `dead-code` `refactoring` `developer-tools` `ai-agents`

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

## 3. Search engine submission (SEO F6 · minutes, after next Pages deploy)

`robots.txt` + `sitemap.xml` now deploy with the site. Then:

- **Google Search Console** → add property `ghostlygawd.github.io/codeweb/` (URL-prefix), verify
  via the HTML-tag method if asked, submit `https://ghostlygawd.github.io/codeweb/sitemap.xml`.
- **Bing Webmaster Tools** → same property, same sitemap (imports from Search Console in one click).

## 4. npm 0.9.1 publish (SEO F4 · rides the next release)

The published 0.9.0 registry doc still says "24 MCP tools" and misses the category keywords.
`package.json`'s description/keywords are already updated in-repo — cutting **v0.9.1** via the
normal release flow (`node scripts/release.mjs --patch`, then the release workflow) republishes
and re-indexes npm. No extra action beyond the release itself.

## 5. Decide: the personal email in plugin.json (SEO F8 note)

`.claude-plugin/plugin.json` publishes a personal email in `author`. Keep it (fine for OSS) or
swap for the GitHub no-reply address — your call; the release sync won't touch it.

## 6. VS Code Marketplace (parked)

Publishing `editor/vscode-codeweb` to the Marketplace stays **parked until you say go**
(standing instruction). The `.vsix` builds in CI; publishing needs a personal Azure DevOps
publisher token.
