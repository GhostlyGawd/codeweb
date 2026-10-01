# Codeweb product team — operating spec

Active bounded cycle, authorized September 14, 2026. Window: September 14–21, America/Chicago. This contract governs management around Codeweb; the current product charter and protected harness still govern the product.

## Objective

Turn the verified 0.15.0 release into an evidence-backed next decision with less manual coordination. Demonstrate a fresh-session lead → technical lead → independent reviewer handoff through Paperclip. A shipped release alone does not establish superior judgment or customer benefit.

## Current truth and authority

Read CURRENT.md, current CHARTER.md, CLAUDE.md, docs/harness.md and SPEC.md. Current authority overrides historical pilot reports and copied GTM drafts. Old task instructions governed their old assignments; this spec governs the new cycle.

Codeweb 0.15.0 is published on GitHub, npm and the MCP registry. npm has 133 verified package files. Release commit: `1cef887f3110f6e5783f754369744a0dacc5c8ee`. Registry-only correction: `9867484477fe9330345c58002695fe200c23e999`. Use the isolated cycle workspace and record its actual revision; the original checkout can be behind main.

Preserve “See what your AI edits affect.” / “Structural checks for AI code changes.” Preserve the free local product, zero required dependencies, deterministic analysis, no target-code execution and no local telemetry. Follow charter boundaries on parked experiments and Marketplace publication. Use Codex only.

## Ownership

| Owner | Responsibility | Output |
| --- | --- | --- |
| Product Lead | Compare evidence-backed opportunities and deferral; own customer-learning plan and final decision | Evidence brief, research kit, next decision, outcome review |
| Technical Lead | Reproduce concerns against shipped behavior; validate scope; implement at most one justified small correction | Reproduction or disproval, scoped spec if needed, candidate and verification receipt |
| Independent Reviewer | Challenge premise, current-state accuracy, scope and checks; review original criteria | Accept, request changes or defer, tied to exact artifacts |
| Operator | Supply intent, contacts/consent and decisions outside delegated scope | Answers only where required to proceed |

## Work and handoffs

Paperclip owns the live queue, task status and assignments. Repository artifacts hold evidence; CURRENT.md is the compact restart entry point. Each task names its owner, input revision, deliverable, completion check and dependency or follow-up trigger.

The initial chain is lead discovery → technical validation → independent review. Dependency-linked tasks should drive the chain without manual wakes between stages. Write artifacts before marking a task complete. A fresh next-role session reads the original request and artifacts and records what it recovered without root assistance.

The lead compares customer learning, demonstrated technical defects and deferral. Prepare three developer conversations and one observed real-task trial using the existing GTM plan. Distinguish actual users from prospects, reported experience from observation, and unknown from zero. Downloads count retrievals, not people.

Do not invent interviews, participants, quotes or usage. Prepare invitation drafts, an interview guide, a consent-aware observation protocol and an evidence template. External invitations or replies remain draft-only until the operator explicitly authorizes recipients and sending. Complete independent technical work while customer evidence is unavailable.

The builder may implement one small reversible correction only when current evidence reproduces the problem and the lead names scope and acceptance criteria. Product behavior follows SPEC's stable-ID process and the existing required gate. When the worthwhile opportunity depends on customer answers or a new architectural direction, prepare a concrete spec and defer dependent implementation with a named unblock action. Do not manufacture work to occupy agents.

No new release, deployment, public message, new agent, provider/account change or Paperclip fork is part of this cycle. These boundaries do not block research, local documentation, reproductions, scoped fixes or review.

## Cadence and bounds

Use assignment/dependency events for the initial chain; periodic heartbeats stay off. Existing agents have one concurrent run each and a 600-second timeout. Initial allowance: one substantive run per role, plus at most one corrective run per role. Do not create extra workers or retry a 409 ownership conflict.

Schedule one outcome review for September 21, 2026 at 09:00 America/Chicago (14:00 UTC) through Paperclip's native task monitor, with at most one scheduled attempt. Verify stored scheduling state before calling it configured. The local server and computer must be running for due work to execute; this is not hosted availability.

At follow-up, the lead evaluates participant evidence if available. Otherwise record customer outcome as unobserved, identify the missing input and make a bounded operational decision. Do not poll for absent answers or schedule repeated reminders. Future follow-through remains unverified until the checkpoint runs.

## Review and escalation

Never edit protected harness machinery, weaken checks or bypass a failure. Stop on authority conflict, missing required input, ownership conflict, repeated API failure, timeout or exhausted allowance. Name the owner and exact unblock action. Completed deliverables stay done; missing future measurement gets its own task.

Review exact file hashes or a candidate commit. Substantive revisions invalidate prior verdicts. Reviewers do not implement their own fixes. Return concrete findings to the owner; one correction/review pass is allowed, then escalate unresolved blockers.

## Success and intervention record

Operational success means reconciled historical state, three stages recovering published truth and handing off through Paperclip, evidence-linked outputs, a stored executable follow-up and no scope violations. Product success is distinct: a willing developer obtains a useful answer on a real task and reports whether they return. Missing customer evidence is not a failed retention measurement.

Record every root/operator intervention: timestamp, actor, cause, action, active time when measured, and planned setup/review versus unplanned rescue. Unknown time stays unknown. Verify automated handoffs against run events. Use SCORECARD's judgment, delivery, continuity, follow-through and learning dimensions.

The controlled team-versus-single-agent comparison has not run; do not claim superiority. At cycle end choose keep/configure/extend/defer from observed gaps. A fork requires evidence that configuration and integration cannot address a material requirement.
