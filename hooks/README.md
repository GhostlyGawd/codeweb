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
