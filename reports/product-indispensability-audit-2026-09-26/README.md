# Codeweb: indispensability audit brief

26 September 2026. This is a scoped reconnaissance and a plan for the full investigation, not a claim that Codeweb has completed user, accessibility, or willingness-to-pay testing.

## Decision to investigate

**Working product thesis:** For developers who routinely let Claude Code or Codex edit a repository with meaningful cross-file dependencies, Codeweb should put a small, source-backed impact brief in the agent's normal workflow before an edit, then a credible change receipt in that same workflow after the edit. The developer should not need to think in terms of graphs, tool names, or baselines to get the answer. A report remains a useful inspection surface, but the edit is the unit of value.

This is a hypothesis. A deterministic map and a passing test suite prove a mechanism, not repeated value. The September 22 [real-task replay](../evidence-real-task-2026-09-22/README.md) explicitly did not establish a better maintainer decision. The [founder brief](../../docs/gtm-cofounder/founder-brief.md) records that actual user count and repeat use are unknown. One [public issue](https://github.com/GhostlyGawd/codeweb/issues/92) reports hands-on use of an older release; no retention or satisfaction claim follows from it.

## What the initial pass establishes

| Area | Observed evidence | Gap to test |
| --- | --- | --- |
| Product foundation | Published 0.15.0 offers a local graph, 28 MCP tools, Claude Code plugin and hooks, report, and CI gate; package and cross-platform checks are recorded in [current state](../../docs/product-team/CURRENT.md). | Whether an agent uses the right evidence at the right moment on a real task, and whether it changes the developer's decision. |
| Claude Code fit | Plugin installation and pre/post-edit hooks are documented in the [README](../../README.md#install). Claude Code supports plugins, skills, MCP, and lifecycle hooks in its [official extension model](https://code.claude.com/docs/en/features-overview). | Live, current-client first-run testing and the rate of useful versus noisy interventions. The packaged assessment did not certify a live Claude session. |
| Codex fit | The README offers a standalone MCP server and a rules snippet for Codex; the recorded Codex CLI assessment covered the baseline loop, not all tools. Current [OpenAI plugin documentation](https://developers.openai.com/plugins/concepts/plugins) supports skills, MCP, and lifecycle hooks, with [hook trust and local-script requirements](https://developers.openai.com/plugins/build/plugins). | A tested Codex-native package and host-specific first-run, hook, trust, and recovery behavior. Do not assume Claude hook behavior carries over unchanged. |
| Activation | [Get started capture](02-get-started-desktop.png): the first screen asks for a project map and then client configuration; Node 22+ is required. | Measure install-to-first-useful-answer, required decisions, permissions, failure recovery, and abandonment on a clean machine. |
| Meaning and design | [Homepage](01-home-desktop.png) has a consistent black/graphite/lime identity. [Demo](03-demo-desktop.png) opens with a dense findings table and terms such as body confidence, priority, and effort. The [mobile capture](04-home-mobile.png) retains the identity. | Can a developer see what changed, what may break, why Codeweb believes it, and what to inspect next within seconds? Full interaction, responsive, and accessibility audits remain to be run. |
| Paid product | The [charter boundary](../../README.md#free-forever-and-where-the-paid-line-sits) keeps local single-repo capability free. Hosted Teams, cross-repo history, and a planned €10/active-author price are described on the [pricing page](https://ghostlygawd.github.io/codeweb/pricing.html), which states this is not a live offer. | Identify the buyer, recurring team pain, proof of value, procurement objections, and willingness to pay before treating price or hosted scope as validated. |

The current product's identity is an asset. This investigation should improve clarity and use without casually replacing its pixel wordmark, monospace technical voice, or acid-lime emphasis. Refero reference roles: [Depot captured style](https://images.refero.design/styles/depot.dev/707c2922-e428-4ee4-847c-9791290712d1/preview_0.jpg) for showing a concrete product consequence immediately under the promise; [Linear changelog captured style](https://images.refero.design/styles/linear.app/11d3e58a-87d7-4a9a-bbf5-720f4fd3ffc6/preview_0.jpg) for quiet hierarchy and restrained density; [Factory's onboarding flow](https://refero.design/flows/7723) for explicit platform choice, connection state, and recovery cues. Factory's 19-step account flow is not a model for Codeweb's local activation. The dominant direction remains Codeweb's established brand. Are.na discovery is unnecessary unless original identity is reopened.

## The audit protocol

Run the full journey in fresh, disposable environments for current Claude Code and Codex, on macOS, Linux, and Windows where supported. Record screen and terminal state at each step; inspect the capture before making a visual finding. Keep runtime transcripts, package versions, configuration edits, timings, errors, and anonymized task outcomes. Mark unobserved steps clearly.

1. **Discover and install:** Can a target developer tell what Codeweb does from a real edit example, install it, and understand requested permissions? Record every command, restart, prompt, and manual configuration edit.
2. **First useful answer:** Give the agent a real cross-file change request. Observe whether Codeweb maps automatically, the agent invokes relevant tools, and the developer sees a concise, source-linked impact answer before code changes.
3. **Edit and check:** Observe pre-edit guidance, post-edit receipt, tests, false alarms, inconclusive states, and stale-map recovery. Compare with the same task and agent without Codeweb. Preserve the original baseline during repair.
4. **Inspect and trust:** From one warning, follow the chain to source, callers, evidence, coverage limits, and a next action. Observe whether the report clarifies or merely repeats tool output.
5. **Return and pay:** Give the participant a second task days later without prompting them to use Codeweb. Separately ask team buyers to review a concrete hosted PR/history prototype and a real price offer, without assuming individual users are buyers.

Every finding should be labeled **observed**, **measured**, **reported**, or **hypothesis**, with reproduction steps and source. Compare against the default agent workflow and relevant current alternatives. Do not score a clean structural gate as proof of behavior or complete code coverage.

## Six bounded research assignments

The existing Product Lead should own synthesis and preserve a single decision record. Six child assignments fit the current [terminal operating contract](../../docs/product-team/TERMINAL-CONTRACT.md); run no more than three agents concurrently and keep one active implementation workstream. An independent reviewer challenges evidence and conclusions at the end of each wave.

| Lens | Question and method | Required output |
| --- | --- | --- |
| 1. User workflow | Where do weekly Claude Code/Codex users lose confidence before or after edits? Conduct 6–8 discovery conversations across maintainers and team reviewers; observe 4–6 real tasks, including a return task. | Task timeline, current workaround, moments of uncertainty, verbatim evidence with consent, and segment ranked by repeated pain. |
| 2. Host-native fit | What can each host truly do today? Test current installation, skill/tool selection, hook timing/trust, output placement, failures, and uninstall in clean environments. | Reproducible Claude/Codex compatibility matrix, first-run recordings, friction count, and the smallest native packaging change. |
| 3. Engine truth | On representative JavaScript/TypeScript, Python, and one less-supported repo, which structural claims are right, missing, slow, or misleading? Include ambiguous and dynamic calls. | Precision/coverage error taxonomy, latency distribution, examples of misleading greens, and prioritized fixes. |
| 4. Experience and design | Audit the task path from installation through warning to source evidence on desktop and mobile. Use Refero styles first, then screens/flows; preserve Codeweb branding. | Screenshot-linked step audit, copy and hierarchy diagnosis, one dominant reference lock, and a prototype of the impact brief plus evidence detail. |
| 5. Paid buyer | Who owns the cost of reviewing agent changes across repositories, and what do they pay to remove? Show a concrete hosted gate/history offer to 3–5 plausible team buyers. | Buyer map, purchase trigger, alternatives, objections, and evidence for or against the charter's Teams offer and planned price. |
| 6. Competition and distribution | Compare Codeweb against built-in agent search/LSP and adjacent code-intelligence or PR tools on the same tasks; inspect discovery and install channels. | Task-by-task comparison, defensible wedge, distribution hypotheses, and claims to retire. |

Each assignment returns a short evidence sheet: sources and captures, observed facts, contradictory evidence, confidence, one decision it changes, and one experiment that could disprove its recommendation. Avoid six essays that repeat the same public marketing pages.

## Decision gates

After the first two research waves, choose **one user segment, one repeated job, and one primary in-agent moment**. Build one thin implementation for that moment and compare it with the default workflow. The initial product targets are hypotheses to measure and refine: a first useful answer without manual map/config repair, a short and relevant impact brief, source-backed warnings with visible limits, no disruptive hook delay, and users who choose Codeweb again on a later task.

Advance the hosted Teams offer only if buyer research shows a recurring organization-level job that the free local tool cannot satisfy under the charter's boundary. The proposed paid promise is managed PR checks, shared policy, and durable cross-repo evidence, with a clear trial and no surprise metering. Do not infer that a polished website or benchmark win creates willingness to pay.

## Operational state

The read-only Paperclip dashboard returned 0 open or in-progress tasks and 0 running agents on September 26. The prior [pause record]($LOCAL_HOME/.local/share/codeweb-paperclip-pilot/self-maintenance-01/PAUSED.json) says to resume only on the user's request. This brief does not create tasks, wake agents, send research invitations, change the product, or change the charter.
