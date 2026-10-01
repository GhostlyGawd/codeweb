# Lens 06 — Buyer and paid-service value

Input manifest SHA256: `748f176be9d48ccf383ff6a6a601b56e7a8337bc898d27c2f1c319462a7e9852`.
Issue: COD-85 (`f3d31ac5-0a32-4c96-be9e-4aab46566c3d`); run: `818156ef-42b4-4323-b6e2-fa2a14a47bdb`; session: `01a0f080-987a-7d91-93ee-b2307a2a6ea2`.

**Verdict: revise.** Retain only a conditional residual-coordination paid hypothesis for qualification. Reject repackaged free receipts as the paid job; buyer authority, net incremental savings, purchase and renewal remain unestablished.

The supported candidate is a team already doing repeated producer/consumer checks whose accountable owner can buy relief from remaining coordination. The corpus identifies developers, payment participants and evaluators; it does not establish this buyer. A developer can champion the tool, a repository owner can approve access, and a budget owner can pay: these are distinct roles until an actual team shows otherwise.

The strongest rival interpretation is a useful free structural tool plus ordinary CI. If configuring existing checks and sharing ordinary PR artifacts solves the recurring job, Codeweb should yield to that alternative. A monorepo migration is not required to test a two-repo CI comparator. No build or trial is authorized by this report.

## Finding summary

| ID | Verdict | Finding |
|---|---|---|
| L06-F01 | narrow | H6 needs a narrower candidate buyer: an accountable owner of recurring multi-repository check coordination, whose residual work survives adequate CI. No such confirmed Codeweb buyer is established. |
| L06-F02 | reject | Reject a paid shared-receipt offer that merely republishes free structural checks and existing PR artifacts; coordination must demonstrably take work over. |
| L06-F03 | revise | Per-active-author pricing is an unvalidated proxy for coordination value; neither author count nor PR count alone explains this job. |
| L06-F04 | revise | Repository-policy and setup work may consume or prevent the paid benefit; aggregation permission is not transitive. |
| L06-F05 | retain | H7 survives: competitor cancellation and intended retention reveal service expectations, not Codeweb structural demand or renewal. |
| L06-F06 | unresolved_from_existing_evidence | The strategy's labor illustration is gross hypothetical value, not net paid-attributable savings or an economic buying result. |

## Full findings

### L06-F01 — narrow

H6 needs a narrower candidate buyer: an accountable owner of recurring multi-repository check coordination, whose residual work survives adequate CI. No such confirmed Codeweb buyer is established.

**Actor / segment:** Observed: multi-repo developer/champion (Y007); review-tool payment participant (Y001); compliance evaluator (Y004). Proposed, unobserved buyer: engineering/platform owner with budget authority over the coordination job.

**Task:** Obtain results for explicit producer/consumer revisions and get them to the responsible reviewers.

**Strongest supported case:** Y007 describes recurring manual invocation and a migration constraint. Y001 shows adjacent review can attract reported payment.

**Strongest countercase:** Y007 accepts CI as more correct and has not tried it. A champion asking the team to prioritize work is not the buyer. Y004 establishes an evaluator, not a sale.

**Failure scenario:** An enthusiastic developer introduces Codeweb, but the budget owner funds a one-time CI integration; no recurring coordination budget remains.

**Weakest assumption:** A recurring residual coordination job exists after ordinary CI, and its owner can actually buy outsourcing.

**Local implication:** Local success can produce a champion without creating an organization buying need.

**Paid implication:** Qualify the job and actual buying authority before treating any user as a paid lead; do not infer a company-size ICP.

**Confidence:** Moderate confidence in the observed pain and role distinctions; low confidence in the proposed buyer because no authority or residual-work observation exists.

**Minimal falsification test:** With one consenting team, inspect two recent cross-repo changes and its feasible CI alternative; identify who actually authorized the last comparable tool spend. Falsify this candidate if no recurring residual task or empowered owner can be named. Proposal only.

**Conditions:** Repeated cross-repo changes; Named consumer owners and runnable checks; Recurring human coordination after the best feasible CI baseline; Buyer has authority and source-policy permission.

**Evidence type:** Inference from attributed public self-reports and frozen product documentation; no Codeweb customer trial.

**Supporting originals:**

- [CW-Y007](https://forum.cursor.com/t/any-way-of-using-multiple-repositories-in-bugbot/152120), posts 1, 5, 6; exposed lines 7–31; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:line 127`; bounded capture `sources/L06-source-addendum.json#sources[evidence_id=CW-Y007]`. Limit: No confirmed purchase authority or willingness to pay. March host limits are historical, not asserted current.
- [CW-Y001](https://forum.cursor.com/t/bugbot-pricing-feedback/131907), posts 1 and 3; exposed lines 9–48; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:line 121`; bounded capture `sources/L06-source-addendum.json#sources[evidence_id=CW-Y001]`. Limit: Historical price and intended retention, not observed renewal; no Codeweb buying intent.

**Opposing originals:**

- [CW-Y007](https://forum.cursor.com/t/any-way-of-using-multiple-repositories-in-bugbot/152120), posts 1, 5, 6; exposed lines 7–31; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:line 127`; bounded capture `sources/L06-source-addendum.json#sources[evidence_id=CW-Y007]`. Limit: No confirmed purchase authority or willingness to pay. March host limits are historical, not asserted current.
- [CW-Y004](https://forum.cursor.com/t/request-for-documentation-bugbot-repository-isolation-boundaries-for-gitlab/165666), posts 1, 6, 7; exposed lines 11–58; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:line 124`; bounded capture `sources/L06-source-addendum.json#sources[evidence_id=CW-Y004]`. Limit: No purchase authority, rejection, approval, or technical breach demonstrated.

### L06-F02 — reject

Reject a paid shared-receipt offer that merely republishes free structural checks and existing PR artifacts; coordination must demonstrably take work over.

**Actor / segment:** Authors, reviewers and internal tool owners already using CI/PR history; sophisticated internal builders are a countersegment.

**Task:** Run agreed checks, track revisions and expose outcomes without repeated manual chasing or artifact assembly.

**Strongest supported case:** Y007 motivates automated execution; a managed service could own dispatch, reruns, failures and result delivery for explicit relationships.

**Strongest countercase:** Y012 reuses artifacts already produced during development. Y005 builds internally. Frozen ci-gate.md already documents free sticky source-linked review and history.

**Failure scenario:** A hosted page wraps the free Action output while people still choose revisions, chase owners, repair runners and copy results. All savings came from CI setup.

**Weakest assumption:** The hosted layer can remove coordination beyond what the team can already automate adequately.

**Local implication:** Keep free local/gate evidence useful regardless of paid viability; structural green is not behavioral correctness.

**Paid implication:** Only residual service operation is a defensible paid increment. Static consumer maps cannot replace cross-repo type or contract tests.

**Confidence:** High confidence in documented free overlap and original alternative accounts; actual hosted increment remains unbuilt/unmeasured.

**Minimal falsification test:** For the same agreed two-repo check, compare adequate existing CI plus ordinary PR artifacts with proposed managed coordination. Log every human handoff and recovery action. Reject if the service changes presentation but removes no recurring task. Proposal only.

**Conditions:** Compare with configured CI, not a deliberately weak manual baseline; Keep behavioral test results separate from static analysis; Record actual supported checks and source revisions.

**Evidence type:** Inference from attributed public self-reports and frozen product documentation; no Codeweb customer trial.

**Supporting originals:**

- [CW-Y007](https://forum.cursor.com/t/any-way-of-using-multiple-repositories-in-bugbot/152120), posts 1, 5, 6; exposed lines 7–31; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:line 127`; bounded capture `sources/L06-source-addendum.json#sources[evidence_id=CW-Y007]`. Limit: No confirmed purchase authority or willingness to pay. March host limits are historical, not asserted current.

**Opposing originals:**

- [CW-Y012](https://www.beyondautocomplete.nl/ai-writes-faster-than-we-can-review-heres-how-we-fixed-that/), Solutions; Artifacts; Where we are now; exposed lines 14–41,49–53; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:line 132`; bounded capture `sources/L06-source-addendum.json#sources[evidence_id=CW-Y012]`. Limit: Initial experiment only days old. March 28 and July 10 follow-ups are same underlying team, not independent incidents.
- [CW-Y005](https://eng.wealthfront.com/2026/08/03/experiments-with-ai-code-review/), Why Build; Unix Philosophy; Dev Lifecycle; exposed lines 23–29,78–80,112–118; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:line 125`; bounded capture `sources/L06-source-addendum.json#sources[evidence_id=CW-Y005]`. Limit: Company self-report; no independent measurement or procurement authority. Reported costs not Codeweb WTP.

### L06-F03 — revise

Per-active-author pricing is an unvalidated proxy for coordination value; neither author count nor PR count alone explains this job.

**Actor / segment:** Billing participant/champion in an eight-developer team; actual budget approver remains unidentified.

**Task:** Pay predictably for recurring useful review/coordination without paying for departed or unrelated contributors.

**Strongest supported case:** Y001 values review of complex changes even from infrequent contributors; always-running service can matter despite sparse PRs.

**Strongest countercase:** The same account objects to billing fit and contractor charges. Its annual terms differ from Codeweb's proposed trailing-90-day measure, so it is not a direct forecast.

**Failure scenario:** Many authors touch unrelated code while only two owners coordinate a few repository boundaries; the bill grows without additional work removed. Conversely a low-volume high-value team is underdescribed by usage counts.

**Weakest assumption:** Active-author count tracks value well enough that a buyer accepts a predictable bill.

**Local implication:** Do not restrict free local capability to manufacture a seat-based upgrade.

**Paid implication:** Preserve the ratified price intent as hypothetical; test its fit, without silently changing pricing policy or issuing an offer.

**Confidence:** Strong single-account evidence of metric tension; no distribution, current competitor pricing, or Codeweb price acceptance established.

**Minimal falsification test:** For one qualified team, reconstruct a trailing-90-day eligible-author roster, separating bot/contractor identities, and compare the hypothetical invoice with actual coordination events and beneficiaries. Ask the real buyer to explain what budget would fund it. Reject the metric for that team if cost changes independently of the purchased job. No offer or charge authorized.

**Conditions:** Charter intent is about EUR10 per author committing in trailing 90 days, not a live price; Distinguish author, bot, contractor, reviewer and benefiting repository owner; Observe eligible coordination events and complexity separately from seat count.

**Evidence type:** Inference from attributed public self-reports and frozen product documentation; no Codeweb customer trial.

**Supporting originals:**

- [CW-Y001](https://forum.cursor.com/t/bugbot-pricing-feedback/131907), posts 1 and 3; exposed lines 9–48; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:line 121`; bounded capture `sources/L06-source-addendum.json#sources[evidence_id=CW-Y001]`. Limit: Historical price and intended retention, not observed renewal; no Codeweb buying intent.

**Opposing originals:**

- [CW-Y001](https://forum.cursor.com/t/bugbot-pricing-feedback/131907), posts 1 and 3; exposed lines 9–48; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:line 121`; bounded capture `sources/L06-source-addendum.json#sources[evidence_id=CW-Y001]`. Limit: Historical price and intended retention, not observed renewal; no Codeweb buying intent.
- [CW-Y010](https://community.sonarsource.com/t/is-it-easy-to-revert-from-developer-edition-to-community-edition/41189), post 1; exposed lines 7–18; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:line 130`; bounded capture `sources/L06-source-addendum.json#sources[evidence_id=CW-Y010]`. Limit: Outside two-year preference; proposed purchase, not completed sale or observed downgrade.

### L06-F04 — revise

Repository-policy and setup work may consume or prevent the paid benefit; aggregation permission is not transitive.

**Actor / segment:** Organization compliance evaluator; security/source owners are adoption gatekeepers, distinct from users and economic buyers.

**Task:** Authorize only permitted repository combinations and their retained derived evidence.

**Strongest supported case:** Y004 makes information boundaries an explicit evaluation requirement; credible handling might make a scoped service acceptable.

**Strongest countercase:** The public exchange ends at referral to security materials. Neither approval nor breach nor paid demand is established. Y007's functional need alone supplies no source-policy approval.

**Failure scenario:** A/B and B/C are allowed but shared derived evidence indirectly joins A/C; the buyer cannot approve the service, or maintaining policy costs more than the coordination saved.

**Weakest assumption:** A useful minimum data flow can be approved and maintained at less effort than it removes.

**Local implication:** Local operation avoids some transfers but does not establish organizational compliance automatically.

**Paid implication:** A bounded permitted-data specification and setup cost belong in buyer qualification; do not expand into a generic compliance platform.

**Confidence:** High confidence in the stated evaluator requirements; actual implementation, approval time and outcome unknown.

**Minimal falsification test:** Before a hosted pilot, present the exact two-repo data-flow/retention/deletion design to the team's actual source-policy owner, record permitted scope and work required. Falsify feasibility if the needed flow cannot be approved or setup/maintenance exhausts the measured benefit. No real source upload is authorized here.

**Conditions:** Explicit permitted relationships; Derived artifacts, caches, logs, retention and deletion covered; No blanket permission inferred from access to repositories individually.

**Evidence type:** Inference from attributed public self-reports and frozen product documentation; no Codeweb customer trial.

**Supporting originals:**

- [CW-Y004](https://forum.cursor.com/t/request-for-documentation-bugbot-repository-isolation-boundaries-for-gitlab/165666), posts 1, 6, 7; exposed lines 11–58; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:line 124`; bounded capture `sources/L06-source-addendum.json#sources[evidence_id=CW-Y004]`. Limit: No purchase authority, rejection, approval, or technical breach demonstrated.

**Opposing originals:**

- [CW-Y007](https://forum.cursor.com/t/any-way-of-using-multiple-repositories-in-bugbot/152120), posts 1, 5, 6; exposed lines 7–31; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:line 127`; bounded capture `sources/L06-source-addendum.json#sources[evidence_id=CW-Y007]`. Limit: No confirmed purchase authority or willingness to pay. March host limits are historical, not asserted current.
- [CW-Y004](https://forum.cursor.com/t/request-for-documentation-bugbot-repository-isolation-boundaries-for-gitlab/165666), posts 1, 6, 7; exposed lines 11–58; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:line 124`; bounded capture `sources/L06-source-addendum.json#sources[evidence_id=CW-Y004]`. Limit: No purchase authority, rejection, approval, or technical breach demonstrated.

### L06-F05 — retain

H7 survives: competitor cancellation and intended retention reveal service expectations, not Codeweb structural demand or renewal.

**Actor / segment:** Individual subscriber (Y002), adjacent-tool payment participant (Y001), and consultant advising a separate client (Y010).

**Task:** Receive reliable contracted service and decide whether to continue paying when the job persists.

**Strongest supported case:** Y002 cancellation follows entitlement/support confusion as well as low overall usage. This supports observable failure states and reliable service delivery as necessary conditions.

**Strongest countercase:** Y001 expresses intended continued use, not completed renewal. Y010 considers temporary branch monitoring; it is an old proposed purchase, not observed churn.

**Failure scenario:** A team pays during a migration, completes the work and stops needing coordination; alternatively silent failed runs force users to chase support and defeat the service promise.

**Weakest assumption:** A supported coordination job recurs long enough, and reliably enough, for an empowered buyer to renew voluntarily.

**Local implication:** Host-switching sentiment cannot establish structural-tool need or local repeated use.

**Paid implication:** Treat purchase and renewal as distinct missing observations. Demonstrate recovery/entitlement clarity, but do not mistake those table-stakes properties for the reason to buy.

**Confidence:** Strong distinction between recorded events and inference. No Codeweb purchase/renewal evidence; Y010 is dated 2021 and only a mechanism counterexample.

**Minimal falsification test:** Only after a separately authorized qualified pilot, record the actual buyer's payment decision and a later real renewal decision with reasons and continuing coordination load. A free extension or stated enthusiasm does not pass. Loss of the job or reversion to adequate CI falsifies durable subscription value for that segment.

**Conditions:** Separate paid purchase, intended continuation and observed renewal; Historical entitlement disputes are not claims about current product limits; Initial project need may end.

**Evidence type:** Inference from attributed public self-reports and frozen product documentation; no Codeweb customer trial.

**Supporting originals:**

- [CW-Y002](https://forum.cursor.com/t/bugbot-stopped-being-triggered/156739), posts 17, 19, 21; exposed lines 141–153; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:line 122`; bounded capture `sources/L06-source-addendum.json#sources[evidence_id=CW-Y002]`. Limit: May pricing changed; do not present April allowance as current. Cancellation is self-report.

**Opposing originals:**

- [CW-Y001](https://forum.cursor.com/t/bugbot-pricing-feedback/131907), posts 1 and 3; exposed lines 9–48; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:line 121`; bounded capture `sources/L06-source-addendum.json#sources[evidence_id=CW-Y001]`. Limit: Historical price and intended retention, not observed renewal; no Codeweb buying intent.
- [CW-Y010](https://community.sonarsource.com/t/is-it-easy-to-revert-from-developer-edition-to-community-edition/41189), post 1; exposed lines 7–18; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:line 130`; bounded capture `sources/L06-source-addendum.json#sources[evidence_id=CW-Y010]`. Limit: Outside two-year preference; proposed purchase, not completed sale or observed downgrade.

### L06-F06 — unresolved_from_existing_evidence

The strategy's labor illustration is gross hypothetical value, not net paid-attributable savings or an economic buying result.

**Actor / segment:** Proposed economic buyer responsible for engineering capacity; observed public accounts do not identify a Codeweb budget owner.

**Task:** Compare the fully loaded incremental service burden with the best feasible free/local/CI alternative.

**Strongest supported case:** Y007 provides a plausible repeated manual task, and Y001 shows payment for useful adjacent review is possible.

**Strongest countercase:** Neither account measures Codeweb time savings. Y004 adds adoption costs; Y005 and Y012 show internal/process substitutes. Price willingness cannot be derived from assumed wages.

**Failure scenario:** A dashboard appears to save ten hours against manual copying, but configured CI removes the same work; service setup and false-result triage make incremental savings zero or negative.

**Weakest assumption:** Recurring measured hours removed beyond adequate CI exceed all newly introduced work, and the buyer values that capacity enough to pay.

**Local implication:** Local discovery/inspection savings must remain in the local outcome ledger.

**Paid implication:** Do not present EUR750 gross value, a savings multiple or a low sticker price as proof of a purchase. Net savings and willingness to pay remain separate tests.

**Confidence:** High confidence that the numerical example is explicitly invented; no measured values to estimate commercial viability.

**Minimal falsification test:** Measure one team's matched recurring check workflow against adequate CI. Use the accounting equation below with actual setup and recovery time; stop the paid hypothesis for that case if net increment is nonpositive. If positive, separately test authorized payment and later renewal. Proposal only.

**Conditions:** Same supported work and coverage in both arms; Exclude free local benefits; Include setup, policy review, triage, runner failures, maintenance and billing administration; Count saved capacity separately from realizable cash savings.

**Evidence type:** Inference from attributed public self-reports and frozen product documentation; no Codeweb customer trial.

**Supporting originals:**

- [CW-Y007](https://forum.cursor.com/t/any-way-of-using-multiple-repositories-in-bugbot/152120), posts 1, 5, 6; exposed lines 7–31; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:line 127`; bounded capture `sources/L06-source-addendum.json#sources[evidence_id=CW-Y007]`. Limit: No confirmed purchase authority or willingness to pay. March host limits are historical, not asserted current.
- [CW-Y001](https://forum.cursor.com/t/bugbot-pricing-feedback/131907), posts 1 and 3; exposed lines 9–48; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:line 121`; bounded capture `sources/L06-source-addendum.json#sources[evidence_id=CW-Y001]`. Limit: Historical price and intended retention, not observed renewal; no Codeweb buying intent.

**Opposing originals:**

- [CW-Y004](https://forum.cursor.com/t/request-for-documentation-bugbot-repository-isolation-boundaries-for-gitlab/165666), posts 1, 6, 7; exposed lines 11–58; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:line 124`; bounded capture `sources/L06-source-addendum.json#sources[evidence_id=CW-Y004]`. Limit: No purchase authority, rejection, approval, or technical breach demonstrated.
- [CW-Y005](https://eng.wealthfront.com/2026/08/03/experiments-with-ai-code-review/), Why Build; Unix Philosophy; Dev Lifecycle; exposed lines 23–29,78–80,112–118; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:line 125`; bounded capture `sources/L06-source-addendum.json#sources[evidence_id=CW-Y005]`. Limit: Company self-report; no independent measurement or procurement authority. Reported costs not Codeweb WTP.
- [CW-Y012](https://www.beyondautocomplete.nl/ai-writes-faster-than-we-can-review-heres-how-we-fixed-that/), Solutions; Artifacts; Where we are now; exposed lines 14–41,49–53; frozen `inputs/reports/user-pain-research-2026-09-27/EVIDENCE.jsonl:line 132`; bounded capture `sources/L06-source-addendum.json#sources[evidence_id=CW-Y012]`. Limit: Initial experiment only days old. March 28 and July 10 follow-ups are same underlying team, not independent incidents.

## Incremental economics and decision sequence

The frozen strategy illustrates ten authors × EUR10/month = EUR100/month; ten people × 15 minutes/week × four weeks = ten hours; ten hours × an assumed EUR75/hour = EUR750 gross labor value. Every input is hypothetical. It is not a measured saving, price acceptance, or proof that saved time becomes cash. Even EUR650 after subtracting only the fee would omit setup and ongoing burden.

`net_paid_increment_before_fee = hourly_cost * (residual_coordination_hours_with_adequate_CI - residual_hours_with_service - incremental_setup_policy_hours_amortized - service_triage_recovery_maintenance_hours) - incremental_nonfee_costs; net_after_fee = net_paid_increment_before_fee - service_fee`

Disjoint time buckets; account for CI setup cost in comparator; no local savings double-counting, speculative prevented outage value, or cash savings inferred from freed time. State amortization horizon and sensitivity; do not hide upfront expense.

Qualification comes first: name the recurring task, adequate CI comparator, empowered buyer and permitted source scope. Then, under separate authorization, measure matched real work including all new burden. Only an actual purchase tests initial willingness to pay; only a later continuing paid decision with a persisting job tests renewal. A free local success does not skip these gates. The proof sprint is a proposed local experiment and cannot by itself settle paid demand.

## Frozen capability and proposal boundary

The charter keeps single-repo local capability free, including the CI gate. Frozen `inputs/docs/ci-gate.md`, “The gate as a reviewer,” documents sticky source-linked structural review and cross-PR history. That is documentation evidence, not a runtime verification performed here. The strategy proposes check dispatch, relevant-revision reruns, truthful pending/failed/skipped/completed states and recovery ownership. Their implementation and customer effect are not established by this review. People still own permissions, the check definitions, semantic interpretation and merge decisions.

## Access, preservation and review handoff

- No participant trial, external send, purchase, product edit or new service performed.
- Seven original public text reopens, no images/private materials. Remaining H7 records Y003/L055 read as frozen evidence records only; no fresh original verification used to enlarge the conclusion.
- No current competitor price/capability claims; historical disputes preserve dates and resolutions.
- Public self-reports are not controlled observations; source counts are not prevalence.
- No other pressure-test lens output read. Procedural shared-filesystem isolation, not access control; lead must verify runtime freshness independently.
- No claim of cross-repo runtime completeness, semantic reuse, behavioral safety, or buyer demand from model agreement.

All 192 frozen files were verified before analysis and at delivery. Canonical machine-readable findings carry the same six IDs and full for/against pointers in `06-findings.json`. Bounded original excerpts and access provenance are in `../sources/L06-source-addendum.json`; no full original webpage archive is claimed. First drafts are preserved under `../history/L06-first-draft/`. This is an analytical delivery, not self-review approval.
