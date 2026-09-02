# Directory & registry submissions — status and prepared content

Every distribution target codeweb has been submitted to, with the evidence for the ones that
completed and copy-paste-ready content for the ones that need the account owner.

A target is **done** when it has a live listing, an open PR, or a confirmed submission receipt.
A target is **operator-owed** when the submission route is behind a login or a human-only form —
those carry prepared content below, so the remaining work is paste-and-send, not authoring.

Last swept: 2026-09-02 (end-of-mission sweep — every row re-checked live).

**Four items are owed to the operator and total roughly 12 minutes of pasting.** They are §1
(glama claim, ~3 min), §2 (awesome-claude-code issue form, ~4 min), §4 (Anthropic community
plugin directory, ~5 min), plus watching the mcp.directory review land. Nothing else is blocked
on them.

| Target | Status | Evidence / what is owed |
|---|---|---|
| Official MCP registry | **Live** | `io.github.GhostlyGawd/codeweb` at **0.14.0** — published by `.github/workflows/mcp-registry.yml` (OIDC, no secret). Verify: `curl 'https://registry.modelcontextprotocol.io/v0/servers?search=codeweb'` |
| glama.ai | **Live (auto-indexed), claim owed** | Listed at https://glama.ai/mcp/servers/GhostlyGawd/codeweb. Re-checked 2026-09-02: still renders "Unclaimed" and "limited discoverability". Claiming needs a Glama account — see §1 |
| mcp.directory | **Submitted 2026-09-02, review still pending** | `POST /api/submit-server` → 200 `{"ok":true,"message":"Server submitted for review!"}`. Their policy says within 24 h; `https://mcp.directory/servers/codeweb` was **still 404** at the end-of-mission sweep. No further action is possible from our side — it is their queue |
| punkpeye/awesome-mcp-servers | **PR open, mergeable** | https://github.com/punkpeye/awesome-mcp-servers/pull/13510 — re-checked 2026-09-02: `state=OPEN`, `mergeable=MERGEABLE`, not a draft. Waiting on their maintainer |
| appcypher/awesome-mcp-servers | **Not possible** | Repository is archived — GitHub refuses new PRs. Entry text kept in §3 if it is ever unarchived |
| hesreallyhim/awesome-claude-code | **Operator owed** | Web-UI issue form only; CONTRIBUTING forbids PRs and `gh`, and requires a human submitter — see §2. Re-checked 2026-09-02: no codeweb issue exists on that repo, so nothing has been filed by anyone |
| Anthropic plugin directory | **Operator owed** | Both submission forms are behind an authenticated account — see §4. Re-checked 2026-09-02: codeweb is absent from `anthropics/claude-plugins-community`'s `marketplace.json`, so the submission has not happened |

---

## 1. glama.ai — claim the existing listing

codeweb is already indexed and rendering correctly (README, badges, 28 tools, install commands).
The listing is *unclaimed*, which Glama flags as "Unclaimed servers have limited discoverability".

Claiming requires signing in to Glama, which needs an account. `/admin` redirects to
`https://glama.ai/sign-up?returnPath=…`.

**Operator steps (~3 min):**

1. Sign in at https://glama.ai/ with the GhostlyGawd GitHub account.
2. Open https://glama.ai/mcp/servers/GhostlyGawd/codeweb and press **Claim**.
3. Once verified, the admin panel at
   https://glama.ai/mcp/servers/GhostlyGawd/codeweb/admin allows editing the description and
   categories. Suggested description (83 chars, fits their limit):

   > Deterministic call/import graph over 28 MCP tools; PR gate. Zero deps, fully local.

   Categories already auto-assigned and correct: *Code Analysis*, *Developer Tools*.

---

## 2. hesreallyhim/awesome-claude-code — issue form, human submitter required

This list (53k stars) accepts recommendations **only** through its web-UI issue form.
Its CONTRIBUTING is explicit on both points:

> **NOTE: ALL RECOMMENDATIONS MUST BE MADE USING THE WEB UI ISSUE FORM TEMPLATE, OR YOU RISK
> BEING RESTRICTED FROM INTERACTING WITH THIS REPOSITORY TEMPORARILY.**
> […] It is **not** possible to submit a resource recommendation using the `gh` CLI.
> […] resource recommendations must be created by human beings.

Opening a PR or filing the issue through the API would violate the stated rules and risks an
interaction ban, so it is deliberately left to the operator.

**Eligibility is already met:** the ground rule is 14+ days of active development since the first
commit *or* 100+ stars. codeweb's repo was created 2026-06-21 (73 days) with continuous commits.

**Operator steps (~4 min):** open
https://github.com/hesreallyhim/awesome-claude-code/issues/new?template=recommend-resource.yml
and paste the fields below.

| Form field | Value |
|---|---|
| **Display Name** | `codeweb` |
| **Category** | `Linting` |
| **Link** | `https://github.com/GhostlyGawd/codeweb` |
| **Author Name** | `GhostlyGawd` |
| **Author Link** | `https://github.com/GhostlyGawd` |

**Description** (descriptive, not promotional; no emoji; one line — matches their STYLE rule):

```
Maps a repository into a deterministic call/import graph and exposes it to Claude Code as a plugin with 28 MCP tools for impact, callers, duplication, and dead code. Includes hooks that brief each session and impact-check each edit, and a CI gate that fails a pull request on a new dependency cycle, a new duplication, or a symbol that lost every caller.
```

Checklist: tick the first five boxes (all true — the resource is Claude Code specific, ships a
plugin/hooks/skill, links resolve, and no existing entry covers it), and leave the sixth
(the trap box) unchecked.

*Category note:* `Linting` is the closest fit — that section holds deterministic repo-quality
checkers (agnix, BlockWatch, Ctxlint, Schliff, Upkeep). If the maintainer prefers,
`Infrastructure & DevOps` also fits the CI gate framing.

---

## 3. appcypher/awesome-mcp-servers — archived, PRs impossible

The fork and branch were prepared before discovering the repository is archived
(`"archived": true`); GitHub rejects `createPullRequest` on archived repos. Nothing further is
possible from either side until a maintainer unarchives it. The prepared line, formatted for
their `Development Tools` section, is kept here so it can be reused:

```markdown
- <img src="https://ghostlygawd.github.io/codeweb/assets/favicon.svg" height="14" /> [GhostlyGawd/codeweb](https://github.com/GhostlyGawd/codeweb) - Deterministic call/import graph over a repository, exposed as 28 tools for impact, callers, duplication, dead code, and hotspots across 13 languages. Static analysis only, so the same code always produces the same map. Also ships a CI gate that fails a PR on a new dependency cycle, a new body-confirmed duplication, or a symbol that lost every caller. Zero required dependencies; runs locally and reads code, never executes it.
```

---

## 4. Anthropic plugin directory — authenticated form only

Anthropic runs two marketplaces. Only one accepts submissions:

- `claude-plugins-official` — curated by Anthropic at its own discretion. Per Anthropic's docs:
  "There is no application process, and the submission form does not add plugins to the official
  marketplace." Nothing to submit.
- `claude-community` — the public community marketplace, which does accept submissions, through
  one of two in-app forms.

Both forms sit behind an authenticated account and neither exposes a public API:

| Route | What happens unauthenticated |
|---|---|
| https://platform.claude.com/plugins/submit | Redirects to the Claude Console sign-in wall |
| https://claude.ai/admin-settings/directory/submissions/plugins/new | Redirects to `claude.ai/login`; additionally needs a Team/Enterprise org with directory-management access |

The Console form is the right route for an individual author (no Team/Enterprise org required).

**Pre-flight already passed:** `claude plugin validate .` → `✔ Validation passed` (exit 0) at
commit `d3bc53c`, and re-run at the end-of-mission sweep on the post-release HEAD — still
`✔ Validation passed`. The review pipeline runs this same check, so the manifest will not bounce.

**Operator steps (~5 min):** sign in at https://platform.claude.com/plugins/submit and submit
with these values.

| Field | Value |
|---|---|
| Plugin name | `codeweb` |
| Repository | `https://github.com/GhostlyGawd/codeweb` |
| Marketplace manifest | `.claude-plugin/marketplace.json` (repo root) |
| Version | `0.14.0` (the released tag; `npm view @ghostlygawd/codeweb version` is the source of truth) |
| License | MIT |
| Homepage | `https://ghostlygawd.github.io/codeweb/` |

**Description** (matches `.claude-plugin/plugin.json`, so the listing and the manifest agree):

```
Your agents break less code and burn fewer tokens. codeweb maps the repo into a deterministic call/import graph. Your agents get 28 MCP tools: impact, callers, duplication, risk, dead code, and more. /codeweb builds the map; hooks brief every session and impact-check every edit. You get an interactive HTML map of it all. Also maps any repo you want to review before adopting.
```

**If the form asks what makes it a good fit:**

```
codeweb is deterministic: static analysis, no LLM in the mapping loop, so the same code always produces the same map. It runs entirely on the user's machine with zero required dependencies, no account, and no telemetry, and it reads code without ever executing it. The plugin ships the /codeweb command, session-brief and pre-edit-impact hooks, a skill, and 28 MCP tools across 13 languages.
```

After approval, the plugin is pinned to a commit SHA in
`anthropics/claude-plugins-community` and CI bumps the pin on later pushes. The public catalog
syncs nightly, so allow a delay before it is installable. Check for the name in
https://github.com/anthropics/claude-plugins-community/blob/main/.claude-plugin/marketplace.json
