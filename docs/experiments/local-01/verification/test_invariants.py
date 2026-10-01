#!/usr/bin/env python3
"""Synthetic verification only. No actual participant records or research outcomes."""
import copy
from datetime import datetime, timedelta, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("local01_summary", ROOT / "summarize.py")
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
RULE_HASH = hashlib.sha256((ROOT / "rules.json").read_bytes()).hexdigest()


def iso(dt):
    return dt.isoformat().replace("+00:00", "Z")


def template(name):
    return json.loads((ROOT / "templates" / name).read_text())


def synthetic_complete():
    data = template("empty-ledger.json")
    data.update(data_kind="synthetic_verification", rules_sha256=RULE_HASH)
    data["entry"] = {"protocol_review_approved": True, "protocol_review_ref": "SYNTHETIC-ONLY-review"}
    data["adjudicators"] = [{"adjudicator_id": "SYNTHETIC-A", "name_private_ref": "SYNTHETIC-NOT-A-HUMAN",
        "human": True, "consent": True, "availability_confirmed_at": "2026-10-01T22:00:00Z",
        "consented_at": "2026-10-01T22:00:00Z",
        "method": "source_case_adjudication-v1", "not_decision_maker_confirmed": True}]
    data["allocation"] = {"frozen_at": "2026-10-02T00:00:00Z", "based_only_on_premeasurement_facts": True,
                           "comparability_agreed": True, "composition_reason": "SYNTHETIC-ONLY target met", "pairs": []}
    base = datetime(2026, 10, 2, 10, tzinfo=timezone.utc)
    for i, (slot, first) in enumerate(helper.SLOTS):
        pid = "SYNTHETIC-P" + str(i + 1)
        person = template("participant.json")
        person.update(participant_id=pid, role="ordinary_maintainer", qualified_at="2026-10-01T22:00:00Z")
        person["screening"].update(completed_at="2026-10-01T22:00:00Z", recent_unresolved_episode=True,
            codex_usual=True, source_authority=True, two_distinct_comparable_changes=True, qualified=True)
        person["consent"].update(consented_at="2026-10-01T22:10:00Z", observation=True, source_access_by_named_adjudicator=True,
            install_and_session_permissions=True, followup=True, evidence_private_ref="SYNTHETIC-ONLY-consent")
        person["route"].update(confirmed=True, send_authorized=True, authorization_private_ref="SYNTHETIC-ONLY-route")
        person["setup"].update(confirmed=True, candidate_source=helper.SOURCE, node_version="v22.20.0",
            client_version="0.159.2", model_requested="gpt-6.1-sol", reasoning_requested="xhigh", source_regex_profile=True,
            approved_tools=sorted(helper.TOOLS), permissions_participant_accepted=True, native_controls_preserved=True,
            configuration_scope_verified=True, source_receipt_private_ref="SYNTHETIC-ONLY-receipt")
        data["participants"].append(person)
        pair = {"pair_id": slot, "participant_id": pid, "job": "scope" if i < 3 else "reuse",
            "native_case_id": slot + "-N", "treatment_case_id": slot + "-T", "first_condition": first,
            "comparability_private_ref": "SYNTHETIC-ONLY-comparability", "adjudicator_id": "SYNTHETIC-A"}
        data["allocation"]["pairs"].append(pair)
        for order, condition in enumerate([first, "treatment" if first == "native" else "native"], 1):
            cid = pair[condition + "_case_id"]
            start = base + timedelta(hours=i * 3 + order)
            case = template("case.json")
            case.update(case_id=cid, change_id="SYNTHETIC-distinct-" + cid, participant_id=pid, pair_id=slot,
                job=pair["job"], condition=condition, order=order, status="completed", real_change=True,
                task_started_at=iso(start), task_ended_at=iso(start + timedelta(seconds=550)),
                decision_maker_actor_id=pid, source_identity_private_ref="SYNTHETIC-ONLY-source",
                source_identity_recorded_at=iso(start - timedelta(seconds=360)), activation_useful_decision=True)
            case["configuration"].update(candidate_source=helper.SOURCE, native_controls_preserved=True,
                host_model_identical_within_pair=True, scope_verified=True, baseline_absence_verified=condition == "native",
                treatment_exposure_verified=condition == "treatment", inventory_private_ref="SYNTHETIC-ONLY-inventory",
                verified_at=iso(start - timedelta(seconds=10)),
                approved_tool_events=["codeweb_context"] if condition == "treatment" else [], contamination="none_observed")
            if condition == "treatment":
                person["setup"].update(started_at=iso(start - timedelta(seconds=300)), confirmed_at=iso(start - timedelta(seconds=20)))
            case["native_stage"].update(completed=True, recorded_before_treatment=True,
                decision_private_ref="SYNTHETIC-ONLY-decision", evidence_private_ref="SYNTHETIC-ONLY-evidence")
            case["oracle"].update(oracle_id="SYNTHETIC-oracle-" + cid, frozen_at=iso(start - timedelta(minutes=5)),
                adjudicator_id="SYNTHETIC-A", participant_scope_confirmed=True, source_private_ref="SYNTHETIC-ONLY-source",
                source_identity_private_ref=case["source_identity_private_ref"],
                bounded_limits_private_ref="SYNTHETIC-ONLY-limits")
            case["adjudication"].update(adjudicator_id="SYNTHETIC-A", signed_at=iso(start + timedelta(seconds=610)),
                source_validity=True, agreement=True, final_decision_correct=True, incorrect_acted_on_guidance=False,
                material_unknowns_resolved=True, harm_review_complete=True, evidence_private_ref="SYNTHETIC-ONLY-judgment")
            case["costs_complete"] = True
            case["cost_phase_review"] = {phase: {"status": "not_applicable", "reason": "SYNTHETIC-only no phase work"} for phase in helper.PHASES}
            case["cost_phase_review"]["inspection"] = {"status": "observed", "reason": None}
            case["cost_phase_review"]["adjudication"] = {"status": "observed", "reason": None}
            case["effort"] = [
                {"effort_id": cid + "-effort", "actor_id": pid, "role": "participant", "phase": "inspection", "mode": "active",
                 "start_at": iso(start), "end_at": iso(start + timedelta(seconds=550)), "evidence_private_ref": "SYNTHETIC-only-time", "attribution_reason": "own case"},
                {"effort_id": cid + "-adjudication", "actor_id": "SYNTHETIC-A", "role": "adjudicator", "phase": "adjudication", "mode": "active",
                 "start_at": iso(start + timedelta(seconds=550)), "end_at": iso(start + timedelta(seconds=600)), "evidence_private_ref": "SYNTHETIC-only-time", "attribution_reason": "own case"}]
            if condition == "treatment" and i < 2:
                case["findings"] = [{"finding_id": cid + "-F", "unique_key": cid + "-unique-action", "correct": True,
                    "additional_to_native": True, "actionable": True, "participant_agrees": True, "adjudicator_agrees": True,
                    "source_private_ref": "SYNTHETIC-ONLY-source", "action_private_ref": "SYNTHETIC-ONLY-action"}]
            data["cases"].append(case)
    return data


class Invariants(unittest.TestCase):
    def setUp(self):
        self.data = synthetic_complete()

    def result(self):
        return helper.summarize(self.data, RULE_HASH, allow_synthetic=True)

    def assert_no_pass(self):
        self.assertNotEqual(self.result()["gate_status"], "provisional_gate_pass")

    def test_complete_equal_effort_two_additions_is_synthetic_only(self):
        result = self.result()
        self.assertEqual(result["gate_status"], "provisional_gate_pass")
        self.assertFalse(result["observed_customer_outcomes"])
        self.assertFalse(result["publication_approved"])
        self.assertEqual(len(result["pairs"]), 5)
        self.assertEqual(result["median_effort_seconds"], {"native": 600, "treatment": 600})

    def test_empty_data_is_unobserved_not_zero_return_or_cost(self):
        result = helper.summarize(template("empty-ledger.json"), RULE_HASH)
        self.assertEqual(result["gate_status"], "unobserved")
        self.assertIsNone(result["opportunity_return"]["proportion"])
        self.assertIsNone(result["observed_task_plus_cohort_effort_seconds"])
        self.assertEqual(result["opportunity_return"]["denominator_known_eligible_people"], 0)

    def test_synthetic_requires_explicit_opt_in(self):
        result = helper.summarize(self.data, RULE_HASH)
        self.assertIn("synthetic records require --allow-synthetic and cannot be observed outcomes", result["validation_errors"])
        self.assertNotEqual(result["gate_status"], "provisional_gate_pass")

    def test_missing_consent_blocks(self):
        self.data["participants"][0]["consent"]["observation"] = False
        self.assert_no_pass()

    def test_unconfirmed_route_blocks(self):
        self.data["participants"][0]["route"]["confirmed"] = False
        self.assert_no_pass()

    def test_unnamed_adjudicator_blocks(self):
        self.data["adjudicators"][0]["name_private_ref"] = None
        self.assert_no_pass()

    def test_agent_or_self_adjudication_blocks(self):
        self.data["adjudicators"][0]["human"] = False
        self.assert_no_pass()
        self.data["adjudicators"][0]["human"] = True
        self.data["cases"][0]["decision_maker_actor_id"] = "SYNTHETIC-A"
        self.assert_no_pass()

    def test_unavailable_adjudicator_blocks(self):
        self.data["adjudicators"][0]["availability_confirmed_at"] = None
        self.assert_no_pass()

    def test_missing_adjudication_blocks(self):
        self.data["cases"][0]["adjudication"]["signed_at"] = None
        self.assert_no_pass()

    def test_missing_cost_phase_is_not_zero(self):
        self.data["cases"][0]["cost_phase_review"]["setup"] = {"status": "unknown", "reason": None}
        self.assert_no_pass()

    def test_unexplained_zero_cost_blocks(self):
        self.data["cases"][0]["cost_phase_review"]["setup"]["reason"] = None
        self.assert_no_pass()

    def test_same_actor_overlap_blocks(self):
        row = copy.deepcopy(self.data["cases"][0]["effort"][0])
        row["effort_id"] += "-double"
        row["phase"] = "author"
        self.data["cases"][0]["effort"].append(row)
        self.data["cases"][0]["cost_phase_review"]["author"] = {"status": "observed", "reason": None}
        self.assert_no_pass()
        self.assertIn("per-actor effort intervals overlap within/across case or cohort attribution", self.result()["validation_errors"])

    def test_cross_case_same_actor_overlap_blocks(self):
        a, b = self.data["cases"][:2]
        b["effort"][0].update(actor_id=a["effort"][0]["actor_id"], start_at=a["effort"][0]["start_at"], end_at=a["effort"][0]["end_at"])
        self.assert_no_pass()

    def test_two_actors_concurrent_time_adds_person_effort(self):
        row = copy.deepcopy(self.data["cases"][0]["effort"][0])
        row.update(effort_id="SYNTHETIC-concurrent", actor_id="SYNTHETIC-helper", role="facilitator", phase="facilitator")
        self.data["cases"][0]["effort"].append(row)
        self.data["cases"][0]["cost_phase_review"]["facilitator"] = {"status": "observed", "reason": None}
        self.assertEqual(self.result()["cases"][0]["effort_seconds"], 1150)
        self.assertFalse(self.result()["validation_errors"])

    def test_one_time_setup_changes_median_and_is_not_amortized(self):
        # Three actual synthetic treatment rows become more expensive; median must rise.
        for i, case in enumerate(c for c in self.data["cases"] if c["condition"] == "treatment"):
            if i < 3:
                start = helper.timestamp(case["task_started_at"])
                dt = datetime.fromtimestamp(start - 60, timezone.utc)
                case["effort"].append({"effort_id": case["case_id"] + "-setup", "actor_id": case["participant_id"],
                    "role": "participant", "phase": "setup", "mode": "active", "start_at": iso(dt), "end_at": iso(dt + timedelta(seconds=60)),
                    "evidence_private_ref": "SYNTHETIC-only-setup", "attribution_reason": "full observed setup"})
                case["cost_phase_review"]["setup"] = {"status": "observed", "reason": None}
        result = self.result()
        self.assertEqual(result["median_effort_seconds"]["treatment"], 660)
        self.assertEqual(result["gate_status"], "provisional_gate_fail")

    def test_severe_harm_blocks_even_resolved(self):
        self.data["cases"][0]["harms"] = [{"harm_id": "SYNTHETIC-harm", "severity": "severe", "resolved": True,
                                              "adjudicator_verdict_private_ref": "SYNTHETIC-ONLY-judgment"}]
        self.assertEqual(self.result()["gate_status"], "blocked_harm_or_incorrect_decision")

    def test_severe_miss_blocks(self):
        self.data["cases"][0]["misses"] = [{"severity": "severe", "resolved": True, "source_private_ref": "SYNTHETIC-ONLY-source",
                                              "adjudicator_verdict_private_ref": "SYNTHETIC-ONLY-judgment"}]
        self.assertEqual(self.result()["gate_status"], "blocked_harm_or_incorrect_decision")

    def test_unresolved_material_harm_blocks(self):
        self.data["cases"][0]["harms"] = [{"harm_id": "SYNTHETIC-harm", "severity": "material", "resolved": False,
                                              "adjudicator_verdict_private_ref": "SYNTHETIC-ONLY-judgment"}]
        self.assert_no_pass()

    def test_faster_incorrect_fails(self):
        self.data["cases"][1]["adjudication"]["final_decision_correct"] = False
        start = datetime.fromtimestamp(helper.timestamp(self.data["cases"][1]["effort"][0]["start_at"]), timezone.utc)
        self.data["cases"][1]["effort"][0]["end_at"] = iso(start + timedelta(seconds=300))
        self.assertEqual(self.result()["cases"][1]["effort_seconds"], 350)
        self.assertEqual(self.result()["gate_status"], "blocked_harm_or_incorrect_decision")

    def test_time_saving_without_additions_does_not_pass(self):
        for case in self.data["cases"]:
            case["findings"] = []
        self.assertEqual(self.result()["gate_status"], "provisional_gate_fail")

    def test_duplicate_change_or_finding_does_not_pass(self):
        self.data["cases"][1]["change_id"] = self.data["cases"][0]["change_id"]
        self.assert_no_pass()
        self.data = synthetic_complete()
        case = next(c for c in self.data["cases"] if c["findings"])
        case["findings"].append(copy.deepcopy(case["findings"][0]))
        self.assert_no_pass()

    def test_nine_changes_and_unverified_exposure_do_not_pass(self):
        self.data["cases"].pop()
        self.assert_no_pass()
        self.data = synthetic_complete()
        next(c for c in self.data["cases"] if c["condition"] == "treatment")["configuration"]["treatment_exposure_verified"] = False
        self.assert_no_pass()

    def test_baseline_frontend_absence_and_usual_tools_are_required(self):
        self.data["cases"][0]["configuration"]["baseline_absence_verified"] = None
        self.assert_no_pass()
        self.data = synthetic_complete()
        self.data["cases"][0]["configuration"]["native_controls_preserved"] = False
        self.assert_no_pass()

    def test_default_whole_server_and_unapproved_tool_not_accepted(self):
        self.data["participants"][0]["setup"]["approved_tools"].append("codeweb_review")
        self.assert_no_pass()

    def test_allocation_and_oracle_must_precede_outcomes(self):
        self.data["allocation"]["frozen_at"] = "2026-10-20T00:00:00Z"
        self.assert_no_pass()
        self.data = synthetic_complete()
        self.data["cases"][0]["oracle"]["frozen_at"] = self.data["cases"][0]["task_ended_at"]
        self.assert_no_pass()

    def test_predefined_condition_order_cannot_move(self):
        self.data["allocation"]["pairs"][0]["first_condition"] = "treatment"
        self.assert_no_pass()

    def test_missing_rules_acknowledgement_or_review_blocks(self):
        self.data["rules_sha256"] = "wrong"
        self.assert_no_pass()
        self.data = synthetic_complete()
        self.data["entry"]["protocol_review_approved"] = False
        self.assert_no_pass()

    def test_unknown_tokens_stay_unknown_and_do_not_invent_money(self):
        result = self.result()
        self.assertTrue(all(c["tokens"] is None for c in result["cases"]))
        self.assertEqual(result["gate_status"], "provisional_gate_pass")

    def test_followup_correct_denominator_includes_access_failure(self):
        states = ["eligible_optional_use", "eligible_nonuse", "eligible_inaccessible", "no_eligible_opportunity", "unknown"]
        for person, state in zip(self.data["participants"], states):
            row = template("followup.json")
            row.update(participant_id=person["participant_id"], observed_at="2026-10-06T00:00:00Z", consented_route_verified=True,
                       participant_reviewed=True, state=state, actual_task_private_ref="SYNTHETIC-only-opportunity")
            if state == "eligible_optional_use":
                row.update(optional_useful_use=True, changed_decision_private_ref="SYNTHETIC-only-action", source_or_check_private_ref="SYNTHETIC-only-source")
            self.data["followups"].append(row)
        result = self.result()["opportunity_return"]
        self.assertEqual(result["denominator_known_eligible_people"], 3)
        self.assertEqual(result["numerator_optional_useful_people"], 1)
        self.assertEqual(result["proportion"], 1 / 3)

    def test_prompted_automatic_use_not_optional_return(self):
        row = template("followup.json")
        row.update(participant_id=self.data["participants"][0]["participant_id"], observed_at="2026-10-06T00:00:00Z",
            consented_route_verified=True, participant_reviewed=True, state="eligible_prompted_or_automatic_use", actual_task_private_ref="SYNTHETIC-opportunity")
        self.data["followups"] = [row]
        result = self.result()["opportunity_return"]
        self.assertEqual(result["denominator_known_eligible_people"], 1)
        self.assertEqual(result["numerator_optional_useful_people"], 0)

    def test_unconsented_followup_is_unknown(self):
        self.test_prompted_automatic_use_not_optional_return()
        self.data["participants"][0]["consent"]["followup"] = False
        self.assertEqual(self.result()["opportunity_return"]["denominator_known_eligible_people"], 0)

    def test_cli_reads_only_explicit_synthetic_ledger_and_redacts_bad_input(self):
        with tempfile.TemporaryDirectory(prefix="SYNTHETIC-verification-", dir=ROOT / "verification") as tmp:
            ledger = Path(tmp) / "SYNTHETIC-ledger.json"
            ledger.write_text(json.dumps(self.data))
            run = subprocess.run(["python3", str(ROOT / "summarize.py"), str(ledger), "--allow-synthetic"], capture_output=True, text=True)
            self.assertEqual(run.returncode, 0, run.stderr)
            self.assertEqual(json.loads(run.stdout)["data_kind"], "synthetic_verification")
            self.assertFalse(json.loads(run.stdout)["observed_customer_outcomes"])
            ledger.write_text('{"PRIVATE-SECRET":')
            run = subprocess.run(["python3", str(ROOT / "summarize.py"), str(ledger)], capture_output=True, text=True)
            self.assertEqual(run.returncode, 2)
            self.assertNotIn("PRIVATE-SECRET", run.stdout + run.stderr)
            self.assertNotIn(str(ledger), run.stdout + run.stderr)

    def test_screening_or_qualification_after_tasks_never_passes(self):
        for person in self.data["participants"]:
            person["screening"]["completed_at"] = "2026-10-20T00:00:00Z"
            person["qualified_at"] = "2026-10-20T00:00:00Z"
        self.assert_no_pass()

    def test_qualification_cannot_precede_screening(self):
        self.data["participants"][0]["qualified_at"] = "2026-10-01T21:00:00Z"
        self.assert_no_pass()

    def test_final_trial_consent_must_precede_allocation(self):
        for person in self.data["participants"]:
            person["consent"]["consented_at"] = "2026-10-02T01:00:00Z"
        self.assert_no_pass()
        self.assertEqual(self.result()["acquisition"]["enrolled_records"], 0)

    def test_actual_source_pin_required_and_whitespace_is_missing(self):
        for invalid in [None, "", " ", 12]:
            with self.subTest(invalid=invalid):
                self.data = synthetic_complete()
                for case in self.data["cases"]:
                    case["source_identity_private_ref"] = invalid
                self.assert_no_pass()

    def test_source_pin_must_match_oracle_and_precede_it(self):
        self.data["cases"][0]["oracle"]["source_identity_private_ref"] = "SYNTHETIC-different-source"
        self.assert_no_pass()
        self.data = synthetic_complete()
        self.data["cases"][0]["source_identity_recorded_at"] = self.data["cases"][0]["task_ended_at"]
        self.assert_no_pass()

    def test_decision_maker_required_and_must_be_this_participant(self):
        for invalid in [None, "", " ", "SYNTHETIC-P2", "SYNTHETIC-A"]:
            with self.subTest(invalid=invalid):
                self.data = synthetic_complete()
                self.data["cases"][0]["decision_maker_actor_id"] = invalid
                self.assert_no_pass()

    def test_recorded_effort_actors_must_match_decisionmaker_and_adjudicator(self):
        self.data["cases"][0]["effort"][0]["actor_id"] = "SYNTHETIC-other-person"
        self.assert_no_pass()
        self.data = synthetic_complete()
        self.data["cases"][0]["effort"][1]["actor_id"] = "SYNTHETIC-other-adjudicator"
        self.assert_no_pass()

    def test_treatment_setup_requires_consented_ordered_dates(self):
        person = self.data["participants"][0]
        person["setup"]["confirmed_at"] = None
        self.assert_no_pass()
        self.data = synthetic_complete()
        self.data["participants"][0]["setup"]["started_at"] = "2026-10-01T21:00:00Z"
        self.assert_no_pass()
        self.data = synthetic_complete()
        self.data["participants"][0]["setup"]["confirmed_at"] = "2026-10-20T00:00:00Z"
        self.assert_no_pass()
        self.data = synthetic_complete()
        self.data["participants"][0]["setup"]["started_at"] = "2026-10-20T00:00:00Z"
        self.assert_no_pass()

    def test_condition_configuration_verified_before_task_after_allocation(self):
        self.data["cases"][0]["configuration"]["verified_at"] = self.data["cases"][0]["task_ended_at"]
        self.assert_no_pass()
        self.data = synthetic_complete()
        self.data["cases"][0]["configuration"]["verified_at"] = "2026-10-01T21:00:00Z"
        self.assert_no_pass()

    def test_adjudicator_consent_and_availability_precede_allocation_oracle(self):
        self.data["adjudicators"][0]["consented_at"] = None
        self.assert_no_pass()
        self.data = synthetic_complete()
        self.data["adjudicators"][0]["consented_at"] = "2026-10-03T00:00:00Z"
        self.assert_no_pass()
        self.data = synthetic_complete()
        self.data["adjudicators"][0]["availability_confirmed_at"] = self.data["cases"][0]["task_started_at"]
        self.assert_no_pass()

    def test_native_first_does_not_require_codeweb_setup_before_native_task(self):
        person = self.data["participants"][0]
        native = next(c for c in self.data["cases"] if c["participant_id"] == person["participant_id"] and c["condition"] == "native")
        self.assertGreater(helper.timestamp(person["setup"]["started_at"]), helper.timestamp(native["task_ended_at"]))
        self.assertEqual(self.result()["gate_status"], "provisional_gate_pass")

    def test_adjudicator_actor_cannot_alias_an_enrolled_participant(self):
        pid = self.data["participants"][0]["participant_id"]
        self.data["adjudicators"][0]["adjudicator_id"] = pid
        for pair in self.data["allocation"]["pairs"]:
            pair["adjudicator_id"] = pid
        for case in self.data["cases"]:
            case["oracle"]["adjudicator_id"] = pid
            case["adjudication"]["adjudicator_id"] = pid
        self.assert_no_pass()


if __name__ == "__main__":
    unittest.main(verbosity=2)
