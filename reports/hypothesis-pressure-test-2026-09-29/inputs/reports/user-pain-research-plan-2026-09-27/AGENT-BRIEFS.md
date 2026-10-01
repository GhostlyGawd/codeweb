# Research lane briefs

Use the shared plan and evidence schema. These queries are starters, not assumed findings. Expand queries from actual user vocabulary. Each lane should read roughly 25–35 useful pages/threads, while the shared registry deduplicates overlaps. Prefer first-person accounts with a concrete incident, task, consequence, or workaround.

## 1 — Claude Code users

Investigate navigation and code discovery, finding the right implementation, context loss, caller awareness, refactors, checking the result, and repeat corrections. Distinguish CLI/desktop or other surfaces and record version when provided. Own Claude-specific issue and user-thread collection.

Starter themes: “Claude Code missed callers”, “Claude Code refactor broke”, “Claude Code large repository context”, “Claude Code duplicated existing function”, “Claude Code ignores MCP”, and equivalent source-native searches. Search successful LSP/search workflows, users satisfied with default tools, and complaints resolved by recent releases.

Return a task-moment map and the strongest evidence that additional structural context would or would not help. Do not label every model error as an opportunity for Codeweb.

## 2 — Codex users

Investigate repository understanding, multi-file edits, tool/skill discovery, review confidence, baseline checking, context and configuration, and repeat usage. Keep Codex CLI, desktop, and cloud evidence distinct. Own Codex-specific issue and user-thread collection.

Starter themes: “Codex missed dependency”, “Codex incomplete refactor”, “Codex repository context”, “Codex MCP tools unused”, “Codex review false positive”, and users' vocabulary discovered in sources. Search successful default workflows and version-specific resolutions.

Return host/surface differences, recurring pain mechanisms, and what truly needs a native extension. Verify current capability claims in official OpenAI documentation before using them as a gap.

## 3 — Cross-file change risk

Investigate concrete incidents: missed consumers, implicit/dynamic dependencies, duplicate implementation, renames, dead-code removal, generated code, monorepo boundaries, tests that missed a change, and difficult reviews. Own cross-product change narratives and project-maintainer case studies; use shared IDs for host threads already collected by lanes 1/2.

Starter themes: “AI refactor missed callers”, “agent change broke another package”, “AI duplicated existing logic”, “tests passed regression AI code”, “reviewing AI changes dependencies”. Search cases where static maps were incomplete or where ordinary grep/LSP/tests were enough.

Return mechanism-level cases: what was knowable before the edit, how it could be known, the cost of missing it, and whether Codeweb's actual capabilities could provide it. Identify cases beyond Codeweb's reach.

## 4 — Adoption and native experience

Investigate plugin/MCP/skill/hook installation, required configuration, permissions, restarts, first useful result, tool invocation, output volume, delays, warning fatigue, updates, removal, and successful setup. Own integration and onboarding-focused sources across hosts.

Starter themes: “MCP setup too much work”, “plugin slows coding agent”, “hook repeated warning”, “coding agent permission fatigue”, “installed MCP never used”, “removed Claude plugin”, “Codex plugin setup”. Search simple integrations users keep and experiences where defaults work well.

Return activation friction, retention barriers, expectations for native behavior, and user language for an acceptable evidence brief. Do not propose visual changes from text descriptions alone; use the saved audit or inspect actual screens for visual claims.

## 5 — Team review and trust

Investigate reviewers and maintainers' burden, confidence, false alerts, evidence chains, test selection, responsibility, private-source constraints, CI, organization policy, and multi-repo coordination. Separate practitioners' experience from management or vendor claims.

Starter themes: “review AI generated code harder”, “AI code review bottleneck”, “coding agent false positives”, “AI code changes trust evidence”, “team private code MCP”, “cross repository change review”. Search teams satisfied with their current checks and examples where extra gates create friction.

Return who owns the job, what a trustworthy check must show, and where durable/shared evidence would have value. Do not infer that criticism of AI code proves demand for another review tool.

## 6 — Value, alternatives, and buying

Investigate explicit purchase, renewal, cancellation, switching, and repeated-use accounts for code intelligence, developer extensions, PR review, and structural analysis. Distinguish consumers, buyers, tool builders, and vendors. Official pricing may describe offers; user accounts establish why someone paid or declined.

Starter themes: “code review tool worth paying”, “cancelled AI code review”, “MCP tool worth it”, “static analysis too noisy”, “why switched coding tool”, “free alternative code intelligence”. Search explicit rejection of paid tooling, stable use of free tools, and successful subscriptions.

Return recurring paid jobs and purchase triggers, evidence against them, and the charter-compatible Teams opportunity. Preserve the rule that local single-repo capability remains free. No outreach, sign-ups, or purchases in this research lane.

## Shared lane handoff

Each brief must include: search coverage; 5–8 strongest findings linked to evidence IDs; observed/reported facts versus inference; meaningful counterexamples; segments and workflow moments; one conclusion that changes the original audit; one recommended experiment; and unknowns requiring direct participants. Provide source access failures and a count of independent incidents rather than raw link volume alone.
