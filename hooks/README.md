# Shipped hooks

The plugin configuration follows the event → matcher → command structure in the
[official hooks reference](https://code.claude.com/docs/en/hooks) and
[plugin reference](https://code.claude.com/docs/en/plugins-reference#hooks), read 2026-09-14.
Descriptions live here so the matcher objects contain only configuration fields.
This metadata change does not establish actual client startup compatibility.

## SessionStart — codeweb:session-brief

codeweb: when the session starts in a .codeweb-mapped repo, inject the ~2KB day-one briefing (domains, load-bearing symbols, entry points, tests, known issues) so the agent starts oriented instead of exploring (fail-open; inert until /codeweb has mapped the repo)

## PreToolUse — codeweb:pre-edit-impact

codeweb: before an edit in a .codeweb-mapped target, surface one line of blast-radius awareness (symbols + dependents in the file) so contract changes get impact-checked first (advisory; fail-open; inert until /codeweb has mapped the target)

## PostToolUse — codeweb:post-edit-diff

codeweb: after an edit to a .codeweb-mapped target, flag new dependency cycles or symbols that lost all callers (edges-only subset; fail-open, non-blocking, inert until /codeweb has mapped the target)

The pre-edit handler uses an unambiguous `old_string` edit window (including
`MultiEdit.edits`) and existing mapped symbol spans when available. A supplied
`symbol` id or unique mapped label also selects that symbol. File-only or
unresolved edits are labeled file summaries; changed source stamps prevent an
exact content-target claim. Known targets without mapped consumers stay quiet.
Bounded caller lists include same-file relationships and name omitted counts;
`codeweb_context` and `codeweb_impact` expand the evidence.

Invalid or empty mapped evidence and failed extraction produce a concise,
non-blocking recovery message. Unmapped targets, excluded directories and
supported quiet checks remain silent. Freshness without source stamps is unknown;
graph-only fallback uses existing stamps when available. Recovery preserves the
original pre-edit baseline. Hooks emit context without permission decisions.

These shipped envelopes and matchers are for Claude Code. Filesystem aliases of
the handler entrypoints are supported. Standalone Codex `apply_patch` payloads
are not adapted by this Claude hook configuration. Codex MCP/skill discovery and
explicit tools are separate surfaces; actual trusted ambient hook delivery in
either host remains a client verification boundary. No Codex ambient integration
or trusted-runtime success is established by direct payload tests.
