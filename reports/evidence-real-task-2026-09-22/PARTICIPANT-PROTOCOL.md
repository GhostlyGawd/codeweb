# One willing maintainer task: evidence receipt trial

Status: **prepared, not run**. This is a small behavior study for V1, not a statistical retention or edit-quality experiment. It requires a consenting maintainer with a real cross-file JavaScript/TypeScript task. The agent must not recruit or message anyone without separate recipient/channel/content authorization.

## Setup

Use the merged source build of Codeweb in the participant's own repository, with its normal local no-account behavior. Freeze the repository revision, selected task, source scope, tool version, and expected supported relationship oracle before looking at receipt output. The facilitator may inspect source and diff to establish that oracle; unresolved/dynamic relationships remain unknown. Keep the participant's code local and do not collect secrets in the sheet.

The task should involve a concrete function whose callers or dependencies might change during an edit. Avoid a toy planted caller. Record what the participant would inspect using their normal workflow first. If the participant does not want to use the feature or the analyzer cannot support the source, record that outcome and stop; do not replace them with a simulated persona.

## Script

1. Ask: “What are you changing, and which related code would you check before deciding this is done?” Record their answer before showing a receipt.
2. Map the repo and capture `codeweb_context` for the target with a task ID. Show the normal context as needed. Start the task timer when source and tools are ready.
3. Let the participant or their coding agent make the actual edit. Codeweb itself only reads source. Observe which files they inspect and which tool calls they choose without coaching.
4. Run their normal structural review and the same review with `evidenceReceipt`. Show the bounded changed-evidence result and any unanswered questions. Ask them to state the next action and final review decision. Stop the timer on that answer.
5. Independently compare named relationships against the frozen source oracle. Ask one short follow-up: “Did this change what you checked or your decision? Which line or relationship did that?” Record their words exactly, including “no.”

This single exposure cannot compare causal outcomes with a blinded control. If a controlled comparison is warranted later, use matched real tasks and an independently reviewed crossover protocol; do not have one participant repeat the same code change.

## Measures and decision rule

Primary observations: correct/incorrect/unknown supported relationships named, false completeness or safety claims, and whether the receipt caused a concrete additional inspection or changed the decision. Record actual elapsed seconds, total Codeweb response bytes and follow-up queries as diagnostic costs. The ordinary review verdict and receipt state are separate fields.

Proceed toward an opt-in public release if the task is supported, the receipt is accurate and understandable, and the participant can point to a useful action it enabled without a misleading safety claim. If it does not change inspection or decision, or causes avoidable confusion, simplify or defer promotion. One positive session is exploratory evidence; it does not validate the market or a token-saving claim.

## Empty capture sheet

| Field | Observation |
|---|---|
| Participant and consent (coded ID only) | |
| Repository/revision and task | |
| Tool/runtime version, baseline and profile | |
| Frozen source oracle and known unknowns | |
| Pre-receipt inspection plan | |
| Actual files/relationships inspected | |
| Receipt added/removed/changed evidence | |
| Ordinary review verdict and limitations | |
| Receipt state and open questions | |
| Final decision and exact participant quote | |
| Correct / incorrect / unresolved source claims | |
| False safety/completeness claim (yes/no, evidence) | |
| Elapsed seconds, total response bytes, follow-up calls | |
| Would they return to this on another real edit? Exact answer | |

The one-row sheet is duplicated only if more participants volunteer. Recruitment, invitations and actual answers remain pending.
