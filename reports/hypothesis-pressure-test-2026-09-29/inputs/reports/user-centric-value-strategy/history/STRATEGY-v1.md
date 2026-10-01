# Codeweb: a user-centred path to repeated value and payment

Prepared from the September 26 product review and the independently reviewed September 27 public-evidence research. This is a product and commercial proposal. Customer reliance, buying intent, price, and incremental Codeweb effect remain unvalidated. It does not change the charter or authorize a release, paid offer, or outreach.

## The product bet

For a developer who routinely uses Claude Code or Codex to change shared code, own one recurring decision: **what existing code should I reuse, and what affected code should I inspect before I make this change?**

The product should return enough source-backed evidence to help the developer act, with its coverage and freshness visible. The underlying local graph and queries are a technical asset; repeated usefulness in this decision is the proposed customer value. Treat the research's support for this job as a hypothesis worth testing, not a demand or retention result.

Public evidence reports forgotten abstractions, duplicated utilities, scope uncertainty, review burden, tool activation failures, and manual cross-repo checks. It also reports successful native tools, inexpensive CI substitutes, intentional duplication, and extra reading that does not improve decisions. The product has to perform well in the cases where structural evidence matters while avoiding burden in ordinary small changes. [Research synthesis](../user-pain-research-2026-09-27/README.md), [contradictions](../user-pain-research-2026-09-27/CONTRADICTIONS.md).

## Define the experience in the user's terms

| Situation and desired result | Proposed product behaviour | Evidence that it helped |
| --- | --- | --- |
| “I am adding a feature. I want to find the implementation we already have.” | Offer a small number of relevant implementation candidates with source locations and concrete similarity evidence. Keep the architecture/reuse decision with the developer. | The developer chooses a suitable existing implementation or avoids a needless duplicate, and confirms the suggestion was correct. |
| “I am changing shared code. I want to know where else to look.” | Show relevant mapped consumers and their relationship to the changed code. Explain the mapped scope and omissions. Expand details on request. | A relevant consumer or inspection decision changes compared with the recorded native workflow. A returned caller list alone is insufficient. |
| “My agent edited the repo. I want to know what actually changed and what was checked.” | Show structural deltas and actual check statuses against a preserved source baseline, with source links. Distinguish completed, failed, skipped, and unknown checks. | The developer correctly understands an important delta or unresolved check with less total inspection effort. |
| “I am reviewing someone else's change. I want to focus my attention.” | Present a short evidence path from a named change to an affected consumer or finding. Provide depth without requiring a graph tour. | A reviewer makes a correct triage decision more quickly, without missing material unknowns. |
| “Our change spans repositories. I want the affected work to be checked consistently.” | Paid hypothesis: managed coordination of checks and shared source-linked evidence across agreed repositories and explicit consumer relationships. | The team removes recurring coordination work beyond existing CI, and a real buyer chooses and renews the service. Current evidence is weak. |

These are proposed behaviours and success definitions, not a claim that all have been implemented. Cross-repo relationships, generated code, and runtime contract compatibility may require inputs or analysis not available in the current engine. Coordinate only supported checks; do not imply a static map can prove API or behavioral compatibility.

## Make the useful path feel native

The developer supplies an ordinary change request. Codeweb handles supported structural inspection around that request inside the host workflow. The developer should not repeatedly choose among 28 tools, manage map files, remember baseline lifecycle rules, or repair configuration to get the intended answer.

The preferred user path is:

1. Install through the supported host route and see actual readiness or one actionable setup problem.
2. On a consequential edit, receive a compact brief with consumers, reuse candidates, source locations, and limits.
3. Open the named source or expand evidence when it helps the decision.
4. After the edit, inspect supported deltas and actual validation statuses, then use the project's usual behavioral tests.

The brief should be conditional and low-noise. Test the existing outputs first; implement only the activation or output changes that a real task shows are necessary. Host discovery, hooks, skills, and MCP are delivery mechanisms, and actual client/session behavior must be demonstrated. A successful installation or a hook firing does not establish usefulness.

Keep failed, stale, unsupported, and empty results distinct. A known empty mapped set must not look like complete proof of no consumers. Background refresh, preserved baselines, bounded output, host permission handling, recovery, and uninstall are part of this user experience. Proposed future conveniences, such as remembering an intentionally ignored duplication or preferred inspection scope, should be explicit, local where appropriate, and scoped to the relevant source revision so that old decisions do not hide new problems.

## Earn repeated reliance

The desired repeat loop is: a real change creates uncertainty; the developer receives relevant evidence; inspection becomes easier or an omission is caught; the next similar change brings them back voluntarily.

Make the first value recognizable in the user's own repository. Avoid counting a generated graph, an installation, or a displayed warning as activation. Record what the developer did differently and why. The product's evidence history may become useful because it preserves agreed source facts and check outcomes across work, but history alone is not a moat or an earned purchase.

Users should control when they expand detail, how they recover from failures, and which supported workflows they use. Dependence should come from work they would otherwise need to repeat, not from withheld local data or artificial switching barriers.

## Make product decisions from observed work

For every proposed change, record the actor, recent task, triggering uncertainty, consequence, current workaround, evidence source, and desired outcome. Then state the smallest product change that could reduce that burden and how it could fail.

Use the prepared [proof sprint](../product-proof-sprint-plan/README.md) to observe ordinary users' real tasks. Bring them an executable workflow using their familiar host and a consented task, rather than asking which features they would like in a future dashboard. The team owns participant sourcing, individual invitation preparation, session/asynchronous task logistics, and follow-up. External sending still needs explicit recipient/channel/content authority or a bounded standing policy; no founder contact list is required.

Use cases where native search/LSP/tests work well as controls. A participant who prefers their current workflow is evidence for narrowing or rejecting a proposal. Prioritize recurring, consequential burdens within actual Codeweb capability. Repeated friction such as ignored tools or misleading empty results can take priority over adding analysis features.

Measure four outcomes separately:

- **First useful decision:** a correct finding changes inspection scope or reuse choice.
- **Effort and warning burden:** total discovery and verification time, unnecessary reading/edits, false warnings, and failures.
- **Voluntary return:** the same person uses Codeweb on a later eligible task without prompting. Keep user retention distinct from organization expansion; a fixed user cohort's retained-user percentage cannot exceed 100%.
- **Earned purchase and renewal:** an actual buyer pays for a recurring team job and later continues. Survey enthusiasm or a public competitor price is insufficient.

Respect the local no-telemetry promise. Consented observations and an explicitly shared local task summary can supply early evidence. Existing activity tallies describe usage, not saved time or prevented regressions; those claims need separate adjudication.

## Connect developer value to a paid team job

The charter keeps all local single-repo capability free. A useful local product can create a developer advocate, but it does not itself create a purchase obligation. The paid product has to remove a recurring burden through hosting, multi-repo aggregation, or human attention.

The first paid hypothesis is a team already coordinating changes across producer/consumer repositories and paying repeatedly in engineer time to run, interpret, and share those checks. Proposed purchase promise: **keep agreed repository checks running and give the team shared, source-linked evidence of what was checked and what still needs inspection.** The actual offer must name the repositories, supported checks, coverage limits, ownership, recovery behavior, and data handling.

Test the simplest existing alternative first: checking out both repos in CI, type checking, tests, ordinary PR history, and current internal processes. If that solves the team's recurring job adequately, the hosted Codeweb offer must identify additional measured service value or yield to that alternative. Do not build a large collaboration/compliance suite from this sparse evidence. Roles, policy, or procurement features belong only when a demonstrated team job requires them.

The developer should be able to show the buyer one concrete case: the recurring burden, the supported work Codeweb took over, net time saved after setup and triage, unresolved limits, and predictable cost. No safety, time-saving, or security claim should rest on fear or a speculative outage cost.

## What would make the bill feel obvious

A strong paid offer combines repeated benefit, low adoption/maintenance effort, and clear proof that value exceeds the bill. Price cannot rescue an infrequent or burdensome workflow. The charter's planned per-active-author price is an intention, not a validated value metric or willingness-to-pay result; whether author count fits this hosted job also needs buyer testing.

Illustration only: at the planned €10 per active author, ten authors would cost €100 per month. If those same ten people actually saved 15 minutes per week for four weeks, that would be ten hours. At an assumed €75 loaded hourly cost, gross time value would be €750. Those savings and costs are invented inputs for explanation, not Codeweb results; setup, extra triage, and ongoing maintenance must be subtracted. A buyer should be able to justify the real observed numbers without accepting a benchmark slogan.

Do not adopt generic conversion percentages, price-multiple rules, or a fixed tier count as evidence. Earn the offer through the team's job, actual purchasing authority, service experience, payment, and renewal. The current research has no Codeweb paid buyer or renewal result.

## Recommended priority

1. Make the conditional consumer/reuse workflow demonstrably useful inside the intended hosts using existing capabilities first.
2. Remove activation and interpretation friction found in those real tasks; validate later voluntary use.
3. With a real recurring team coordination job, test the smallest hosted service against existing CI and manual practice.
4. Build and price around work customers actually return for and buy. Keep the existing local boundary intact unless the user explicitly changes it.

The homepage work remains a separate authorized delivery. Its claims should eventually show the demonstrated user outcome and a real consequence, and its installation path should connect to actual host readiness. The public user-pain research did not settle the exact visual direction or validate a new screen design.

## Confidence and review target

The strongest researched job is conditional pre-edit consumer/reuse inspection. The product experience above is our proposed response. Hosted cross-repo coordination is the weakest load-bearing assumption: evidence for recurrence, additional value over CI, buyer authority, and willingness to pay is sparse. The strategy should pass only as a falsifiable direction, never as proof that Codeweb is indispensable or a no-brainer purchase today.
