# Method and screening notes

## Research question

Which publicly described problems around agent-assisted coding plausibly match Codeweb's structural analysis, and which workflow-defined audiences should be investigated first?

This is an exploratory convenience sample assembled on 2026-09-15 UTC (2026-09-14 in the founder's timezone). It is not a systematic review, survey, complete forum scrape, or representative sample. The search history and retained records make the decisions inspectable, but live search rankings cannot be reproduced exactly.

## Discovery

Seed: the January Reddit discussion already found during this conversation, plus the September HN refactoring discussion. Expand to GitHub and the Cursor forum. Search for positive experiences and competing explanations as well as failures.

Executed search queries, in batches:

| Batch | Queries |
| --- | --- |
| 1 | `"Claude Code" "missed" "callers" refactor`; `"Cursor" "refactor" "breaks" "files" reddit`; `"Claude Code" "tokens" "grep" codebase reddit`; `"coding agent" "duplicate" "existing" code reddit` |
| 2 | `site:forum.cursor.com refactor "references"`; `site:forum.cursor.com "duplicate" "functions"`; `site:reddit.com/r/ClaudeCode "Huge token usage because of huge codebase"`; `site:github.com/anthropics/claude-code/issues "refactor" "callers"` |
| 3 | `site:forum.cursor.com "refactoring" "breaks"`; `site:forum.cursor.com "creates" "duplicate" code`; `site:reddit.com/r/ClaudeCode "Huge token usage"`; `site:news.ycombinator.com "Claude" "refactoring" "works"` |
| 4 | `site:github.com/anthropics/claude-code/issues "ignores" "LSP"`; `site:github.com/anthropics/claude-code/issues "duplicates" "code"`; `site:forum.cursor.com "refactoring" "broken" after:2026-01-01`; `site:reddit.com/r/ClaudeCode "codebase" "understand" "tokens" after:2026-06-01` |
| GitHub API follow-up | Issue searches for `LSP ignored` (no returned results) and `LSP` in `anthropics/claude-code`; inspect #39979, #46870, and #93474. |

Search results are discovery leads. Retained claims come from opened primary conversations or GitHub/HN APIs. HN HTML requests were rate-limited; its public Algolia item API supplied comment text, authors, dates, and thread relationships. No signed-in/private communities were accessed.

## Selection and counting

- Retain a specific experience, concrete request, or substantive counterexample relevant to the research question. Mere agreement, jokes, votes, vague advice, and generic complaints do not become records.
- Retain one account per conversation, combining repeated comments from that account. All 25 retained account names are distinct, but cross-platform identity cannot be verified.
- Assign themes only when expressed in the selected text. A statement about overengineering is not automatically coded as duplicated logic. A high bill is not evidence that navigation caused it.
- Code requests separately from problem experiences. Keep counterexamples with no problem codes so positive outcomes cannot inflate problem counts.
- Separate public testimony from verified causation. No reported bug, usage number, measurement, or product outcome was reproduced during this research.
- Do not infer company size, professional role, or purchasing authority from writing style, username, or platform. Unstated attributes remain unknown.
- Accounts were selected qualitatively, not exhaustively. Counts describe retained records, not all relevant accounts in those threads. The amount of material seen differs by platform and page availability.

The 25 records comprise 15 Reddit accounts from seven threads, two Cursor-forum accounts from two threads, three GitHub issue authors, and five HN accounts from one thread. There are 19 problem records, two requests, and four counterexamples. Several records have multiple themes.

Affiliation screening was limited to the selected posts and their visible context. No vendor affiliation was disclosed in the counted accounts; this is not proof of independence, human authorship, or absence of promotion.

## Screening examples

This table records meaningful exclusions and context sources, not an exhaustive count of every search result screened. A preview-only exclusion was not read as a complete source.

| Source | Treatment and reason |
| --- | --- |
| [GrepAI launch post](https://www.reddit.com/r/ClaudeAI/comments/1qiv0d3/open_source_i_reduced_claude_code_input_tokens_by/) | Exclude vendor-authored token-saving claims from customer counts; promotional framing visible in search result. |
| [SemanticFS post](https://www.reddit.com/r/ClaudeAI/comments/1sguh2d/i_tracked_exactly_how_many_tokens_claude_code/) | Exclude product pitch from counts; user replies could be inspected in a future pass. Preview only in this run. |
| [Automatic TLDR mirror](https://www.reddit.com/r/ClaudeCodeTLDR/comments/1ud8tfy/tldr_huge_token_usage_because_of_huge_codebase/) | Deduplicate to original thread. The bot summary is not another person or another incident. |
| [Measured graph-tool post](https://www.reddit.com/r/ClaudeAI/comments/1ulbixa/i_actually_measured_the_codebasememory_mcps_token/) | Exclude the OP's channel-promoting measurement from counts; retain two concrete user comments, V15/V16. Their affiliations remain unverified. |
| [June quota discussion](https://www.reddit.com/r/ClaudeCode/comments/1ucie7v/huge_token_usage_because_of_huge_codebase/) | Exclude comments explicitly promoting the authors' indexers. Retain the OP and two contrasting workplace/native-workflow accounts. |
| [Cursor Claude 3.7 discussion](https://forum.cursor.com/t/claude-3-7-booby-traps/63114) | Historical context only: March 2025, old model. Contains duplication complaints and self-described nondevelopers, but is outside the retained 2026 cohort. |
| [Cursor folder-tree request](https://forum.cursor.com/t/allow-ai-to-read-project-folder-tree/33022) | Historical context only: December 2024. Do not treat the old feature gap as a current limitation. |
| [Cursor v0.50.4 feedback](https://forum.cursor.com/t/bug-feedback-after-cursor-v0-50-4/92890) | Historical context only: May 2025; duplicate rule files are also different from duplicate function bodies. |
| [HN experienced developer account](https://news.ycombinator.com/item?id=44769257) | Historical positive context only: August 2025, verified through item API. |
| [Codeweb #92](https://github.com/GhostlyGawd/codeweb/issues/92) | Actual Codeweb user signal retained in founder brief, outside this category-discovery denominator. The authorized support reply is separate from research. |

## Date and evidence limitations

GitHub and HN dates came from timestamped APIs; Cursor dates from the displayed posts. Reddit exposes inconsistent search dates and relative page ages in some fetched versions. Store exact dates only as attributed metadata; uncertain records are explicitly labeled. Do not derive a last-90-days rate or trend from this corpus.

Closed GitHub reports remain historical testimony and do not establish a currently unfixed bug. User opinions about cache behavior, model capability, or benchmark performance are not documentation for those products.

## Improving frequency measurement next time

To estimate relative issue frequency in a community, use a fixed collection window and a predefined frame: for example, all eligible posts in specified communities during four weeks, or a reproducible systematic sample. Include non-complaint posts in the denominator. Keep moderator removals, inaccessible posts, and exclusions visible.

Use a consistent codebook, count one account per theme, deduplicate cross-posts, and have a second reviewer independently code a subset. Compare counts separately by platform and time period; choose comparable windows. Within-frame frequencies then describe that community sample more credibly, while selection into the forum still prevents generalization to all developers.

This run supports discovery and recruitment hypotheses. It does not establish willingness to pay, adoption, repeat use, market size, or that Codeweb is the preferred solution.
