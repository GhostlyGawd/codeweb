# Product clarity pilot

Status: not yet run. This procedure targets five participants. It contains no participant records or measured results.

Invite individual developers who use a coding assistant on their own JavaScript or TypeScript repository. Include small-team maintainers where available. Ask for consent before observing a session or recording any data. Participation and later contact are optional. A participant can stop or remove their record. Do not contact anyone automatically from this procedure.

Keep no telemetry in the product. Use participant-approved notes or local statistics that the participant chooses to share. Do not collect source code, access tokens, or client configuration contents. Agree on the data to retain, its owner, and its deletion date before the session. Obtain separate permission before publishing a quote, screenshot, name, or repository.

## Session procedure

1. Record a participant code, operating system, Node version, client/version, CodeWeb version, prior CodeWeb experience, and the permitted repository commit. Leave unavailable fields as `not recorded`.
2. Start a timer when the participant opens the setup guide. Ask them to select their client and follow the displayed recipe without help. Record installation failures, requests for help, and corrections. Stop the timer when they obtain a caller result and identify the corresponding source location. This is the first useful result. Five minutes is a target, not a promised result.
3. Ask the participant to inspect one source change. Show changed symbols, affected callers, new findings, and analysis limits. Ask what they would inspect next. A local server check alone does not prove that their editor is connected.
4. Use report-only mode first. Ask the participant to label each finding `accept`, `reject`, or `defer`, with a reason. Ask separately whether a blocking rule would have stopped an otherwise acceptable change. A rejection of an advisory cleanup is not automatically a false block.
5. If the participant agrees to a follow-up in week two, ask whether they used the tool again for a real change. Record non-response as unknown, not as successful retention or non-use. Record review time and exceptions from the records they choose to share.

## Measures

Report counts with each denominator. Keep assisted and unassisted results separate. For a zero denominator, report `not measured`; do not write zero percent. Five participants provide directional feedback, not population estimates.

| Measure | Definition |
|---|---|
| First useful result | Time from opening setup to a correct caller result confirmed in source; report each completed time and incomplete attempts. |
| Successful setup | Participants with a confirmed first query / participants who attempted setup. |
| Week two repeat use | Participants who report another real use / participants who answer the agreed follow-up; also show invited count and unknown responses. |
| Accepted findings | Accepted findings / findings with an accept, reject, or defer decision; report all three counts separately. |
| False blocking rate | Reviewed blocking findings judged incorrect or outside the agreed rule scope / all blocking findings reviewed; record the judgement reason and reviewer. |
| Review time | Time to inspect an affected caller and state a next action; label assisted sessions. |
| Exception use | Count of recorded exceptions, their reasons, and whether a later distinct finding remained visible. |

## Recording template

| Field | Value |
|---|---|
| Participant code and consent scope | [not recorded] |
| Session date and environment | [not recorded] |
| Source commit and CodeWeb version | [not recorded] |
| Attempt, help received, first result time | [not recorded] |
| Finding ID, decision, and reason | [not recorded] |
| Blocking judgement and rule scope | [not recorded] |
| Week two response and repeat use | [not recorded] |
| Data owner and deletion date | [not recorded] |
| Publication permission | [not recorded] |

Review where participants stop before adding features. Convert verified findings into the [case-study template](product-clarity-case-study.md). Keep unknown results visible.
