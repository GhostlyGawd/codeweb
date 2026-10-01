# Pilot query and source map

Worker: Technical Lead; collection run is the run associated with the uploaded artifacts. Retrieval timestamps are in each JSONL record. Search results served only as discovery. Summaries and findings use opened originals.

## Queries actually run

1. `Claude Code grep LSP works experience blog` — located native-success, invocation and counterevidence candidates.
2. `site.github.com/anthropics/claude-code/issues ignores MCP tools grep` — located tool-definition failure; seed issue intentionally not counted again.
3. `site.github.com/anthropics/claude-code/issues "MCP" "never uses"` — found remote-auth reports; selected one firsthand author and checked resolution.

Selection is purposive, not random. No claim of search saturation. A future wave should explicitly expand current successful default/test workflows and non-builder segments.

## Evidence source access

| Record | Original source | Read boundary / reproduction |
|---|---|---|
| CW-P001 | [Scott Spence](https://scottspence.com/posts/enable-lsp-in-claude-code) | web.open, full article including September follow-up; page headings are record locators. |
| CW-P002 | [Issue 63451](https://github.com/anthropics/claude-code/issues/63451) | web.open body, then public GitHub REST issue + comments, all 5 comments. |
| CW-P003 | [Issue 39703](https://github.com/anthropics/claude-code/issues/39703) | web.open then REST body read in chunks, all 2 comments; deliberately one grouped record. |
| CW-P004 | [Reddit post](https://www.reddit.com/r/ClaudeCode/comments/1q83m0x/is_lsp_support_in_claude_code_dead_on_arrival/) | web.open full post and visible replies; unknown pagination/deleted content, marked partial. Exact timestamp not exposed. |
| CW-P005 | [Issue 53803](https://github.com/anthropics/claude-code/issues/53803) | REST complete body plus all 5 comments. Resolution checked against official changelog subsection. |

For each GitHub number N, independently GET `https://api.github.com/repos/anthropics/claude-code/issues/N` and `https://api.github.com/repos/anthropics/claude-code/issues/N/comments?per_page=100`. This worker used unauthenticated public HTTPS via Python urllib, separate from injected Paperclip authentication. Compare comment array length with issue.comments; all matched and were below page size. Record IDs and body hashes are in PILOT-VALIDATION.json. Full bodies were not redistributed in deliverables; reviewer can reopen originals. Private/deleted/moderated content cannot be certified.

[Official changelog](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md#21136) was fetched via raw.githubusercontent.com and section 2.1.136 read in full. Only that subsection is claimed read, not the entire changelog. [Fix comment](https://github.com/anthropics/claude-code/issues/53803#issuecomment-4403478616) and [later dispute](https://github.com/anthropics/claude-code/issues/53803#issuecomment-4658508696) explain CW-P005's unclear status. No conclusion about the linked follow-up 65036 without opening it. Closed/completed and stale labels alone never establish a fix.

## Exclusions and access limitations

- [Picklog](https://picklog.cc/blog/claude-code-grep-vs-lsp) was opened/read but explicitly identifies its author as the site's AI. Excluded from human firsthand evidence; its linked study and HN thread were not used as testimony.
- The related “AI Coding Tools I Actually Use” blog link was opened during discovery but not fully inspected; excluded from evidence and full-read counts.
- CW-001 was read from the staged seed, not independently recollected or counted as a new page. None of the five author/incident keys matches it. Related duplicate OAuth trackers and reposted summaries were not additional records.
- GitHub rendered pages omit activity comments. REST recovered them for the three retained GitHub records; no snippets-as-thread shortcut was used.
- Some combined tool outputs were truncated. Targeted rereads of retained issue bodies/comments supplied missing content before recording full access. This is an output budgeting limit, not a source denial.
- Artifact upload helper initially failed before an HTTP request because its default mktemp directory was sandbox-denied; a second helper attempt with TMPDIR also failed locally. Both stopped before HTTP (curl rejected its blank output argument). Direct in-memory multipart API upload avoids temporary files; no sandbox policy changed. No source HTTP access failure or worker exec EMFILE was encountered in this pilot. Reddit completeness/date uncertainty persists. Browser screenshot capability, authenticated sites, X and video transcripts were not tested.
- No claim that current Claude behavior is reproduced: historical_unresolved means no verified resolution in inspected material, not proof a defect persists today.

## Coverage accounting

Five firsthand records, three families, five author/project groups; four fully read retained source units and one partially accessible thread. One additional excluded AI-authored article fully read; do not add it to the human evidence numerator. Changelog subsection is resolution support, not a full source-page count. Searches, API endpoints and repeated opens do not multiply page or incident counts.
