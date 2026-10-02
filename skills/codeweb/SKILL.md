---
name: codeweb
description: Inspect mapped callers and impact before changing code, find existing implementations before adding one, and review structural changes after an edit. Use during coding tasks; Codeweb product planning uses a separate workflow.
metadata:
  origin: community
  version: 0.16.0
---

# Codeweb

Use local source facts to scope the user's coding task. Prefer the installed Codeweb MCP tools; this workflow does not require a Claude-specific environment variable.

## Before changing existing code

Ask `codeweb_context` for the actual symbol you intend to edit. Use `codeweb_find` when you only have a concept or filename, then choose a source-backed symbol ID. `codeweb_impact` follows mapped consumers; `codeweb_dependents` also lists import/test users. Open the returned source before deciding what to change.

If the map is missing, use `codeweb_map` on the current project. A stale map needs `codeweb_refresh`. Keep the current project/worktree explicit when discovery could select a different map. If Codeweb is unavailable, continue with native source search and disclose the missing mapped evidence; `codeweb setup --client codex` prints the setup recipe without rewriting configuration.

For an authorized edit, capture a fresh baseline once before changing source using `codeweb_refresh` with `baseline:true`. Ordinary refreshes preserve it. Do not replace that baseline after editing or invent a pre-edit comparison when the original state is unavailable.

## Before adding an implementation

Use `codeweb_find_similar` with a concrete candidate body or signature when reuse uncertainty matters. Open relevant candidates and compare their contracts and callers. No matches, similarity scores and structural checks do not establish novelty, semantic interchangeability or safety.

## After an authorized edit

Use `codeweb_review` for changed files with the pre-edit baseline, or `codeweb_diff` with `before:"baseline", refresh:true`. Run the project's relevant behavioral checks as part of the authorized coding work. Codeweb itself performs static source analysis; a structural green does not prove the program works.

Preserve useful partial results and their typed limits. Missing consumers, stale data, unsupported bindings and omitted items need source inspection or expansion. Zero mapped callers is a lower bound, not proof of no runtime use. Cleanup tiers are review flags, not permission to delete source.

## Optional evidence receipts

Capture a receipt with `codeweb_context` using `captureEvidence:true` and a task label, then pass the receipt and same task to review. Check receipt state separately from the structural verdict. Evidence-mode context requests do not accept `full`, `bodies`, `window` or `limit`; use an ordinary context request for source bodies.

Return the source facts that affected the decision, any remaining limits, and the checks actually run. Keep analysis files and source previews local unless the user requests sharing.
