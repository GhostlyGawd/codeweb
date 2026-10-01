#!/usr/bin/env python3
"""Offline LOCAL-01 explicit-record validator. No network or automatic collection.

Reads only the ledger named on the command line and sibling frozen rules.json.
Prints an internal aggregate; it never writes, contacts people or publishes data.
Manual fields cannot establish that a human appointment or consent is authentic.
"""
import argparse
from collections import Counter, defaultdict
from datetime import datetime
import hashlib
import json
import math
from pathlib import Path
from statistics import median

PROTOCOL = "E01-2026-10-01-v1"
SOURCE = "95bf6178f1c3979d3ed169329002daa9a41fb73d"
TOOLS = {"codeweb_map", "codeweb_refresh", "codeweb_explain", "codeweb_impact",
         "codeweb_context", "codeweb_find_similar", "codeweb_diff", "codeweb_deadcode"}
PHASES = {"setup", "mapping", "refresh", "permission", "recovery", "source_reading",
          "inspection", "author", "reviewer", "checks", "facilitator", "adjudication"}
STATES = {"eligible_optional_use", "eligible_nonuse", "eligible_prompted_or_automatic_use",
          "no_eligible_opportunity", "eligible_inaccessible", "unknown"}
SLOTS = [("S01", "native"), ("S02", "treatment"), ("S03", "native"),
         ("R01", "treatment"), ("R02", "native")]


def timestamp(value):
    """Require timezone-aware timestamps; never treat a missing date as zero."""
    if not isinstance(value, str):
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return dt.timestamp() if dt.tzinfo is not None else None
    except ValueError:
        return None


def present(value):
    return isinstance(value, str) and bool(value.strip())


def numeric(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0


def summarize(data, rules_sha256, allow_synthetic=False):
    errors, blockers = [], []
    synthetic = data.get("data_kind") == "synthetic_verification"
    if data.get("data_kind") not in {"actual", "synthetic_verification"}:
        errors.append("data_kind must explicitly be actual or synthetic_verification")
    if synthetic and not allow_synthetic:
        errors.append("synthetic records require --allow-synthetic and cannot be observed outcomes")
    if data.get("schema_version") != 1 or data.get("experiment_id") != "LOCAL-01" or data.get("protocol_version") != PROTOCOL:
        errors.append("schema/experiment/protocol identity mismatch")

    lists = {}
    for name in ["participants", "adjudicators", "cases", "followups", "cohort_effort"]:
        value = data.get(name)
        if not isinstance(value, list) or any(not isinstance(row, dict) for row in value):
            errors.append(name + " must be a list of records")
            value = []
        lists[name] = value
    participants, cases = lists["participants"], lists["cases"]

    def index(rows, field, label):
        out = {}
        for row in rows:
            key = row.get(field)
            if not present(key) or key in out:
                errors.append(label + " ID missing or duplicated")
            else:
                out[key] = row
        return out

    people = index(participants, "participant_id", "participant")
    adjudicators = index(lists["adjudicators"], "adjudicator_id", "adjudicator")
    case_index = index(cases, "case_id", "case")
    allocation = data.get("allocation") or {}
    pairs = allocation.get("pairs", [])
    if not isinstance(pairs, list) or any(not isinstance(pair, dict) for pair in pairs):
        errors.append("allocation pairs must be records")
        pairs = []
    pair_index = index(pairs, "pair_id", "pair")
    allocated_people = {pair.get("participant_id") for pair in pairs if present(pair.get("participant_id"))}

    def qualified(person):
        s = person.get("screening", {})
        screened, qualification = timestamp(s.get("completed_at")), timestamp(person.get("qualified_at"))
        return (person.get("role") == "ordinary_maintainer" and s.get("qualified") is True and
                all(s.get(k) is True for k in ["recent_unresolved_episode", "codex_usual", "source_authority", "two_distinct_comparable_changes"]) and
                screened is not None and qualification is not None and screened <= qualification)

    def consenting(person):
        c = person.get("consent", {})
        return (all(c.get(k) is True for k in ["observation", "source_access_by_named_adjudicator", "install_and_session_permissions"]) and
                timestamp(c.get("consented_at")) is not None and present(c.get("evidence_private_ref")))

    def preallocation_eligibility(person):
        screened = timestamp(person.get("screening", {}).get("completed_at"))
        qualification = timestamp(person.get("qualified_at"))
        consented = timestamp(person.get("consent", {}).get("consented_at"))
        freeze = timestamp(allocation.get("frozen_at"))
        return (all(value is not None for value in [screened, qualification, consented, freeze]) and
                screened <= qualification <= consented < freeze)

    enrolled = {pid for pid, person in people.items() if pid in allocated_people and qualified(person) and consenting(person) and preallocation_eligibility(person) and
                person.get("route", {}).get("confirmed") is True and person.get("route", {}).get("send_authorized") is True and
                present(person.get("route", {}).get("authorization_private_ref"))}
    acquisition = {
        "status": "unobserved" if not participants else "recorded_private_observations",
        "screened_records": sum(timestamp(p.get("screening", {}).get("completed_at")) is not None for p in participants),
        "qualified_records": sum(qualified(p) for p in participants),
        "consenting_qualified_records": sum(qualified(p) and consenting(p) for p in participants),
        "enrolled_records": len(enrolled),
        "setup_confirmed_records": sum(pid in enrolled and p.get("setup", {}).get("confirmed") is True for pid, p in people.items()),
        "useful_task_participants": 0,
        "not_population_counts": True,
    }

    costs, phase_totals, actor_totals = {}, defaultdict(float), defaultdict(float)
    effort_ids, actor_intervals = set(), defaultdict(list)

    def effort_rows(rows, label, case_id=None):
        if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
            errors.append(label + ": effort must be records")
            return None
        total = 0.0
        valid = True
        for row in rows:
            eid, actor = row.get("effort_id"), row.get("actor_id")
            start, end = timestamp(row.get("start_at")), timestamp(row.get("end_at"))
            if not present(eid) or eid in effort_ids:
                errors.append(label + ": effort ID missing or reused")
                valid = False
            effort_ids.add(eid) if present(eid) else None
            if (not present(actor) or not present(row.get("role")) or row.get("phase") not in PHASES or
                    row.get("mode") not in {"active", "blocked"} or start is None or end is None or end <= start or
                    not present(row.get("evidence_private_ref")) or not present(row.get("attribution_reason"))):
                errors.append(label + ": effort has missing/invalid actor, category, interval or evidence")
                valid = False
                continue
            seconds = end - start
            actor_intervals[actor].append((start, end, case_id or "cohort", eid))
            total += seconds
            phase_totals[row["phase"]] += seconds
            actor_totals[row["role"]] += seconds
        return total if valid else None

    # All observed case costs, including incomplete cases, remain in the descriptive total.
    for case in cases:
        cid = case.get("case_id") or "missing-case-id"
        costs[cid] = effort_rows(case.get("effort", []), cid, cid)
    cohort_total = effort_rows(lists["cohort_effort"], "cohort_effort")
    for intervals in actor_intervals.values():
        intervals.sort()
        for previous, current in zip(intervals, intervals[1:]):
            if current[0] < previous[1]:
                errors.append("per-actor effort intervals overlap within/across case or cohort attribution")

    case_blockers = defaultdict(list)
    def require(case_id, condition, message):
        if not condition:
            case_blockers[case_id].append(message)

    if cases:
        if data.get("rules_sha256") != rules_sha256:
            blockers.append("ledger does not acknowledge exact frozen rules hash")
        entry = data.get("entry", {})
        if entry.get("protocol_review_approved") is not True or not present(entry.get("protocol_review_ref")):
            blockers.append("separate protocol approval missing")
        if (timestamp(allocation.get("frozen_at")) is None or allocation.get("based_only_on_premeasurement_facts") is not True or
                allocation.get("comparability_agreed") is not True or not present(allocation.get("composition_reason"))):
            blockers.append("actual allocation/comparability not frozen from premeasurement facts")
        if len(pairs) != 5 or len(allocated_people) != 5 or len(enrolled) != 5:
            blockers.append("five actual separately allocated qualified consenting participants required")
        if len(cases) != 10:
            blockers.append("ten actual changes required; missing/access-failed/withdrawn cases retained")
        expected_cases = [pair.get(condition + "_case_id") for pair in pairs for condition in ["native", "treatment"]]
        if len(set(expected_cases)) != len(expected_cases) or set(expected_cases) != set(case_index):
            blockers.append("exactly one native and one treatment case per allocation required")
        if set(pair_index) != {slot for slot, _ in SLOTS}:
            blockers.append("five predefined slot identities required")
        for slot, first in SLOTS:
            pair = pair_index.get(slot, {})
            if pair.get("first_condition") != first or pair.get("job") not in {"scope", "reuse"} or not present(pair.get("comparability_private_ref")):
                blockers.append("predefined condition order/job/comparability evidence missing")

    change_ids = [case.get("change_id") for case in cases]
    if cases and (any(not present(cid) for cid in change_ids) or len(set(change_ids)) != len(change_ids)):
        blockers.append("every change must have a distinct real change ID; repeated timing is not independent")

    raw = Counter()
    additions, severe, wrong, unresolved, useful_people = 0, 0, 0, 0, set()
    per_case, condition_costs = [], {"native": [], "treatment": []}
    for case in cases:
        cid = case.get("case_id") or "missing-case-id"
        pid = case.get("participant_id")
        condition = case.get("condition")
        person = people.get(pid, {})
        consent, setup = person.get("consent", {}), person.get("setup", {})
        start = timestamp(case.get("task_started_at"))
        end = timestamp(case.get("task_ended_at"))
        pair = pair_index.get(case.get("pair_id"), {})
        order = 1 if pair.get("first_condition") == condition else 2
        require(cid, condition in condition_costs and case.get("job") in {"scope", "reuse"}, "valid job/condition required")
        require(cid, case.get("status") == "completed" and case.get("real_change") is True and start is not None and end is not None and end >= start, "actual complete timed change required")
        require(cid, pair.get("participant_id") == pid and pair.get(condition + "_case_id") == cid and pair.get("job") == case.get("job") and case.get("order") == order, "allocation identity/order mismatch")
        require(cid, pid in enrolled, "participant is not qualified/consented/authorized/enrolled")
        require(cid, preallocation_eligibility(person), "screening <= qualification <= consent must precede allocation")
        freeze = timestamp(allocation.get("frozen_at"))
        require(cid, freeze is not None and start is not None and freeze < start, "allocation must precede condition outcomes")
        consent_time = timestamp(consent.get("consented_at"))
        require(cid, consent_time is not None and start is not None and consent_time < start, "actual consent must precede observation")
        decision_maker = case.get("decision_maker_actor_id")
        require(cid, present(decision_maker) and decision_maker == pid and pid in people,
                "decision maker must be the nonmissing enrolled participant actor ID")
        require(cid, present(case.get("source_identity_private_ref")), "actual case source identity pin is missing")
        require(cid, setup.get("confirmed") is True and setup.get("candidate_source") == SOURCE and
                setup.get("source_regex_profile") is True and set(setup.get("approved_tools", [])) == TOOLS and
                all(setup.get(k) is True for k in ["permissions_participant_accepted", "native_controls_preserved", "configuration_scope_verified"]) and
                all(present(setup.get(k)) for k in ["node_version", "client_version", "model_requested", "reasoning_requested", "source_receipt_private_ref"]), "approved source/client/configuration/permissions setup confirmation missing")
        try:
            node_major = int(str(setup.get("node_version", "")).lstrip("v").split(".")[0])
        except ValueError:
            node_major = 0
        require(cid, node_major >= 22, "Node >=22 required")
        config = case.get("configuration", {})
        verified = timestamp(config.get("verified_at"))
        require(cid, verified is not None and freeze is not None and start is not None and
                freeze <= verified < start, "actual condition configuration must be verified after allocation and before task")
        require(cid, all(config.get(k) is True for k in ["native_controls_preserved", "host_model_identical_within_pair", "scope_verified"]) and
                present(config.get("inventory_private_ref")) and config.get("contamination") == "none_observed", "usual controls/scope or contamination review incomplete")
        if condition == "native":
            require(cid, config.get("baseline_absence_verified") is True and not config.get("approved_tool_events"), "native Codeweb absence including frontend must be verified")
        elif condition == "treatment":
            setup_started, setup_confirmed = timestamp(setup.get("started_at")), timestamp(setup.get("confirmed_at"))
            require(cid, all(value is not None for value in [consent_time, freeze, setup_started, setup_confirmed, verified, start]) and
                    consent_time <= freeze <= setup_started <= setup_confirmed <= verified < start,
                    "consented treatment setup must start after allocation and finish before verified treatment task")
            require(cid, config.get("candidate_source") == SOURCE and config.get("treatment_exposure_verified") is True and
                    isinstance(config.get("approved_tool_events"), list) and bool(config.get("approved_tool_events")) and
                    set(config.get("approved_tool_events", [])) <= TOOLS, "actual scoped eight-tool treatment exposure missing")
        stage = case.get("native_stage", {})
        require(cid, stage.get("completed") is True and present(stage.get("decision_private_ref")) and present(stage.get("evidence_private_ref")) and
                (condition != "treatment" or stage.get("recorded_before_treatment") is True), "competent native stage record required")
        oracle, judgement = case.get("oracle", {}), case.get("adjudication", {})
        aid = oracle.get("adjudicator_id")
        adjudicator = adjudicators.get(aid, {})
        availability, oracle_time = timestamp(adjudicator.get("availability_confirmed_at")), timestamp(oracle.get("frozen_at"))
        adjudicator_consent = timestamp(adjudicator.get("consented_at"))
        require(cid, adjudicator.get("human") is True and adjudicator.get("consent") is True and
                adjudicator.get("not_decision_maker_confirmed") is True and adjudicator.get("method") == "source_case_adjudication-v1" and
                present(adjudicator.get("name_private_ref")) and present(aid) and aid != decision_maker and aid not in people and aid == pair.get("adjudicator_id") and
                all(value is not None for value in [adjudicator_consent, availability, freeze, oracle_time, start]) and
                adjudicator_consent <= availability <= freeze <= oracle_time < start,
                "named consented available independent human adjudicator must precede allocation/oracle/task")
        require(cid, oracle_time is not None and start is not None and oracle_time < start and oracle.get("participant_scope_confirmed") is True and
                present(oracle.get("oracle_id")) and present(oracle.get("source_private_ref")) and present(oracle.get("bounded_limits_private_ref")), "bounded source oracle must be agreed/frozen before outcomes")
        source_pinned = timestamp(case.get("source_identity_recorded_at"))
        require(cid, all(value is not None for value in [consent_time, freeze, source_pinned, oracle_time]) and
                consent_time <= freeze <= source_pinned <= oracle_time and present(oracle.get("source_identity_private_ref")) and
                oracle.get("source_identity_private_ref") == case.get("source_identity_private_ref"),
                "oracle must reference the same actual source pin recorded after consent/allocation and before oracle")
        signed = timestamp(judgement.get("signed_at"))
        require(cid, judgement.get("adjudicator_id") == aid and signed is not None and end is not None and signed >= end and
                all(judgement.get(k) is True for k in ["source_validity", "agreement", "material_unknowns_resolved", "harm_review_complete"]) and
                present(judgement.get("evidence_private_ref")), "complete independent correctness/harm adjudication required")
        require(cid, judgement.get("final_decision_correct") is True and judgement.get("incorrect_acted_on_guidance") is False, "incorrect or unresolved decision cannot pass")
        if judgement.get("final_decision_correct") is False or judgement.get("incorrect_acted_on_guidance") is True:
            wrong += 1
        if judgement.get("material_unknowns_resolved") is not True:
            unresolved += 1
        phase_review = case.get("cost_phase_review", {})
        require(cid, case.get("costs_complete") is True and costs.get(cid) is not None and costs.get(cid, 0) > 0, "complete valid nonzero observed case effort required")
        observed_effort = case.get("effort", [])
        require(cid, isinstance(observed_effort, list) and any(isinstance(row, dict) and row.get("actor_id") == decision_maker and
                row.get("role") == "participant" for row in observed_effort), "decision-maker effort actor must match participant association")
        require(cid, isinstance(observed_effort, list) and any(isinstance(row, dict) and row.get("actor_id") == aid and
                row.get("role") == "adjudicator" and row.get("phase") == "adjudication" for row in observed_effort),
                "actual independent adjudicator effort actor must match appointed adjudicator")
        for phase in PHASES:
            item = phase_review.get(phase, {})
            has_rows = any(row.get("phase") == phase for row in case.get("effort", []) if isinstance(row, dict))
            require(cid, (item.get("status") == "observed" and has_rows) or
                    (item.get("status") == "not_applicable" and not has_rows and present(item.get("reason"))), "effort phase missing or unexplained zero: " + phase)
        finding_rows = case.get("findings", [])
        harm_rows, misses = case.get("harms", []), case.get("misses", [])
        require(cid, all(isinstance(x, list) and all(isinstance(r, dict) for r in x) for x in [finding_rows, harm_rows, misses]), "findings/harms/misses must be explicit records")
        if not isinstance(finding_rows, list) or any(not isinstance(r, dict) for r in finding_rows):
            finding_rows = []
        if not isinstance(harm_rows, list) or any(not isinstance(r, dict) for r in harm_rows):
            harm_rows = []
        if not isinstance(misses, list):
            misses = []
        raw[condition + "_findings"] += len(finding_rows)
        raw[condition + "_misses"] += len(misses)
        raw[condition + "_harms"] += len(harm_rows)
        keys, case_additions = set(), 0
        for finding in finding_rows:
            key = finding.get("unique_key")
            require(cid, present(key) and key not in keys and present(finding.get("finding_id")), "finding key/ID missing or duplicated")
            keys.add(key) if present(key) else None
            counted = (all(finding.get(k) is True for k in ["correct", "additional_to_native", "actionable", "participant_agrees", "adjudicator_agrees"]) and
                       present(finding.get("source_private_ref")) and present(finding.get("action_private_ref")))
            if condition == "treatment" and counted:
                case_additions += 1
            raw[condition + "_incorrect_candidates"] += finding.get("correct") is False
            require(cid, all(isinstance(finding.get(k), bool) for k in ["correct", "additional_to_native", "actionable", "participant_agrees", "adjudicator_agrees"]) and
                    present(finding.get("source_private_ref")), "finding correctness/actionability judgment missing")
        for miss in misses:
            require(cid, isinstance(miss, dict) and miss.get("severity") in {"minor", "material", "severe"} and
                    isinstance(miss.get("resolved"), bool) and present(miss.get("source_private_ref")) and
                    present(miss.get("adjudicator_verdict_private_ref")), "miss severity/source/adjudication missing")
            if isinstance(miss, dict) and miss.get("severity") == "severe":
                severe += 1
            if isinstance(miss, dict) and miss.get("severity") in {"material", "severe"} and miss.get("resolved") is not True:
                unresolved += 1
        for harm in harm_rows:
            require(cid, harm.get("severity") in {"minor", "material", "severe"} and isinstance(harm.get("resolved"), bool) and
                    present(harm.get("harm_id")) and present(harm.get("adjudicator_verdict_private_ref")), "harm severity/verdict missing")
            severe += harm.get("severity") == "severe"
            if harm.get("severity") in {"material", "severe"} and harm.get("resolved") is not True:
                unresolved += 1
        additions += case_additions
        if condition == "treatment" and case.get("activation_useful_decision") is True and pid in enrolled and not case_blockers[cid]:
            useful_people.add(pid)
        total = costs.get(cid)
        for field in ["model_wait_seconds", "model_tokens", "stdout_bytes"]:
            require(cid, case.get(field) is None or numeric(case.get(field)), "invalid optional numeric observation: " + field)
        if condition in condition_costs and total is not None:
            condition_costs[condition].append(total)
        per_case.append({"case_id": cid, "participant_id": pid, "pair_id": case.get("pair_id"), "job": case.get("job"), "condition": condition,
                         "order": case.get("order"), "status": case.get("status"), "valid_for_gate": not case_blockers[cid],
                         "effort_seconds": total, "additional_correct_actionable_findings": case_additions,
                         "raw_findings": len(finding_rows), "raw_misses": len(misses), "raw_harms": len(harm_rows),
                         "model_wait_seconds": case.get("model_wait_seconds"), "tokens": case.get("model_tokens"),
                         "stdout_bytes": case.get("stdout_bytes")})
    acquisition["useful_task_participants"] = len(useful_people)
    medians = {condition: median(values) if values else None for condition, values in condition_costs.items()}
    pair_results = []
    for pair in pairs:
        n, t = costs.get(pair.get("native_case_id")), costs.get(pair.get("treatment_case_id"))
        first = case_index.get(pair.get(pair.get("first_condition", "native") + "_case_id"), {})
        second_condition = "treatment" if pair.get("first_condition") == "native" else "native"
        second = case_index.get(pair.get(second_condition + "_case_id"), {})
        first_start, second_start = timestamp(first.get("task_started_at")), timestamp(second.get("task_started_at"))
        if cases and not (first_start is not None and second_start is not None and first_start < second_start):
            blockers.append("actual pair session chronology must match predefined order")
        pair_results.append({"pair_id": pair.get("pair_id"), "job": pair.get("job"), "first_condition": pair.get("first_condition"),
                             "native_effort_seconds": n, "treatment_effort_seconds": t,
                             "difference_seconds": t - n if n is not None and t is not None else None})
    subgroups = {}
    for job in ["scope", "reuse"]:
        rows = [row for row in per_case if row["job"] == job]
        subgroups[job] = {"case_count": len(rows), "additional_correct_actionable_findings": sum(r["additional_correct_actionable_findings"] for r in rows),
                          "median_seconds": {c: median([r["effort_seconds"] for r in rows if r["condition"] == c and r["effort_seconds"] is not None])
                                             if any(r["condition"] == c and r["effort_seconds"] is not None for r in rows) else None for c in condition_costs},
                          "raw_findings": sum(r["raw_findings"] for r in rows), "raw_misses": sum(r["raw_misses"] for r in rows),
                          "raw_harms": sum(r["raw_harms"] for r in rows)}

    # Later return is separate from the ten-task gate; a bad optional follow-up
    # record is flagged without invalidating otherwise complete task evidence.
    primary_validation_errors = list(errors)
    # One final record per participant summarizes the consented follow-up window.
    followup_index = index(lists["followups"], "participant_id", "followup participant")
    state_counts, eligible, returned = Counter(), set(), set()
    for pid in enrolled:
        followup = followup_index.get(pid, {})
        state = followup.get("state", "unknown")
        if state not in STATES:
            errors.append("followup state invalid")
            state = "unknown"
        if state != "unknown":
            if (people[pid].get("consent", {}).get("followup") is not True or followup.get("consented_route_verified") is not True or
                    timestamp(followup.get("observed_at")) is None or followup.get("participant_reviewed") is not True):
                errors.append("observed followup lacks explicit consented route/review/date")
                state = "unknown"
            elif state.startswith("eligible_") and not present(followup.get("actual_task_private_ref")):
                errors.append("eligible followup requires actual task evidence")
                state = "unknown"
            elif state == "eligible_optional_use" and not (followup.get("optional_useful_use") is True and
                    present(followup.get("changed_decision_private_ref")) and present(followup.get("source_or_check_private_ref"))):
                errors.append("optional useful use requires source-backed changed-decision evidence")
                state = "unknown"
        state_counts[state] += 1
        if state.startswith("eligible_"):
            eligible.add(pid)
        if state == "eligible_optional_use":
            returned.add(pid)
    if any(pid not in enrolled for pid in followup_index):
        errors.append("followup for non-enrolled person cannot enter return denominator")
    opportunity_return = {"status": "observed_known_eligible" if eligible else "unobserved_no_known_eligible_denominator",
                          "numerator_optional_useful_people": len(returned), "denominator_known_eligible_people": len(eligible),
                          "proportion": len(returned) / len(eligible) if eligible else None,
                          "states": {state: state_counts[state] for state in sorted(STATES)}}
    all_costs = list(costs.values()) + [cohort_total]
    order_groups = {order: [row for row in pair_results if row["first_condition"] == order] for order in ["native", "treatment"]}
    effort_comparison = (medians["treatment"] <= medians["native"] if all(medians.values()) else None)
    if not cases:
        verdict = "unobserved"
    elif severe or wrong:
        verdict = "blocked_harm_or_incorrect_decision"
    elif primary_validation_errors or blockers or any(case_blockers.values()) or unresolved:
        verdict = "incomplete_or_inconclusive"
    elif additions >= 2 and effort_comparison is True:
        verdict = "provisional_gate_pass"
    else:
        verdict = "provisional_gate_fail"
    return {"experiment_id": "LOCAL-01", "protocol_version": PROTOCOL,
            "data_kind": "synthetic_verification" if synthetic else data.get("data_kind"),
            "observed_customer_outcomes": False if synthetic else bool(cases),
            "publication_approved": False, "gate_status": verdict,
            "required_participants": 5, "required_changes": 10, "actual_case_records": len(cases),
            "additional_correct_actionable_findings": additions, "required_findings": 2,
            "median_effort_seconds": medians, "no_higher_treatment_median": effort_comparison,
            "severe_harms": severe, "incorrect_decisions": wrong, "unresolved_material_cases_or_harms": unresolved,
            "validation_errors": errors, "primary_validation_errors": primary_validation_errors,
            "followup_validation_errors": errors[len(primary_validation_errors):], "entry_or_cohort_blockers": blockers,
            "case_blockers": {cid: messages for cid, messages in case_blockers.items() if messages},
            "cases": per_case, "pairs": pair_results, "job_subgroups": subgroups, "condition_order_groups": order_groups,
            "raw_counts": dict(raw), "acquisition": acquisition, "opportunity_return": opportunity_return,
            "observed_task_plus_cohort_effort_seconds": sum(all_costs) if (cases or lists["cohort_effort"]) and all(v is not None for v in all_costs) else None,
            "cohort_effort_seconds": cohort_total, "effort_by_phase_seconds": dict(phase_totals),
            "effort_by_actor_role_seconds": dict(actor_totals),
            "limits": ["Descriptive five-person pilot; no population/PMF/causal inference.",
                       "Field assertions need real consent, identity and human review; helper cannot authenticate them.",
                       "Missing token/money observations do not establish zero cost or savings.",
                       "Internal aggregate; exact derivative publication approval remains separate."]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("ledger", type=Path, help="explicit private JSON ledger path")
    parser.add_argument("--allow-synthetic", action="store_true", help="allow clearly labeled verification data only")
    args = parser.parse_args()
    rules_path = Path(__file__).with_name("rules.json")
    try:
        rules_bytes = rules_path.read_bytes()
        rules = json.loads(rules_bytes)
        if (rules.get("protocol_version") != PROTOCOL or rules.get("candidate_source") != SOURCE or
                rules.get("target_participants") != 5 or rules.get("target_distinct_changes") != 10 or
                rules.get("required_additional_correct_actionable_findings") != 2 or
                rules.get("median_effort_comparison") != "treatment <= native; exact seconds; no tolerance/outlier removal"):
            raise ValueError("frozen rule identity/threshold mismatch")
        data = json.loads(args.ledger.read_text())
        if not isinstance(data, dict):
            raise ValueError("ledger must be a JSON object")
        result = summarize(data, hashlib.sha256(rules_bytes).hexdigest(), args.allow_synthetic)
    except (OSError, ValueError, TypeError, AttributeError) as exc:
        # Do not echo ledger contents or private paths on malformed input.
        print(json.dumps({"gate_status": "invalid_input", "error_type": type(exc).__name__, "publication_approved": False}))
        return 2
    print(json.dumps(result, indent=2, allow_nan=False))
    return 1 if result["validation_errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
