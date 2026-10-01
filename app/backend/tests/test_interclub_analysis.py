import copy
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import Mock, patch

if "supabase" not in sys.modules:
    stub = types.ModuleType("supabase")
    stub.Client = object
    sys.modules["supabase"] = stub

from app.services import interclub_analysis_service as service
from app.services.interclub_analysis_source import collect_evening, source_facts, _scoring_totals
from app.services.visibility_service import SummaryUnavailable, compose_summary

FIXTURE = Path(__file__).parent / "fixtures/interclub_j1.json"
EVENT = {"id": "calendar-j1", "title": "J1 Kaz A Darts - A VS Kaz A Darts - B", "event_type": "CHAMPIONSHIP",
         "status": "SCHEDULED", "start_date": "2026-09-28", "source_url": "https://n01darts.com/n01/league/season.php?id=t_eMqn_6846"}
SEASON = {"key": "2026-2027", "active": True, "nakkaLeagueId": "lg_EUoR_6095"}


class SourceTests(unittest.TestCase):
    def setUp(self):
        self.payload = json.loads(FIXTURE.read_text())

    def facts(self, event=EVENT):
        p = self.payload
        return source_facts(event, SEASON, service.event_key(event), p["data"], p["sets"], p["players"], p["teams"])

    def test_real_j1_scoring_and_distinct_source_identities(self):
        facts = self.facts()
        self.assertEqual([facts[k] for k in ("matches", "legs", "players", "home_score", "away_score")], [20, 45, 10, 17, 3])
        text = {f["id"]: f["text"] for f in facts["facts"]}
        self.assertIn("50,82 sur 14 legs", text["top_average"])
        self.assertIn("88", text["finish"])
        self.assertIn("MARQUES Yoann × 1", text["maximums"])
        self.assertIn("42,53", text["home_average"])
        # The erroneous shared source opid never merges Yoann and Yvan.
        self.assertEqual(facts["players"], 10)
        self.assertEqual(facts["url"], EVENT["source_url"])

    def test_empty_nakka_double_placeholder_has_no_scoring_data(self):
        before = self.facts()
        placeholder = {"tpid": "n49i", "leg": 8, "winLeg": 4,
                       "set": 4, "winSet": 2, "score": 0, "darts": 0}
        self.payload["players"][""] = placeholder
        self.assertEqual(self.facts(), before)
        # A blank row with real scoring data, a name or unknown team still blocks.
        for key, value in (("score", 1), ("darts", 3), ("f9Score", 60),
                           ("ton80", 1), ("oname", "Missing player"),
                           ("tpid", "unknown")):
            with self.subTest(key=key):
                self.payload["players"][""] = {**placeholder, key: value}
                with self.assertRaises(SummaryUnavailable):
                    self.facts()
        self.payload["players"][""] = placeholder
        self.payload["players"]["o0uh"]["ton80"] += 1
        with self.assertRaises(SummaryUnavailable):
            self.facts()
        self.setUp()
        self.payload["players"][""] = placeholder
        self.payload["teams"]["n49i"]["score"] += 1
        with self.assertRaises(SummaryUnavailable):
            self.facts()

    def test_authorized_3bdc_recovery_requires_exact_missing_double_scoring(self):
        event = {**EVENT, "start_date": "2026-09-30",
                 "source_url": "https://n01darts.com/n01/league/season.php?id=t_1hPp_2294"}
        original = copy.deepcopy(self.payload)
        original["data"]["tdid"] = "t_1hPp_2294"
        original["data"]["t_date"] = int(original["data"]["t_date"]) + 2 * 86400

        def collect(payload, chosen_event=event):
            return source_facts(chosen_event, SEASON, "recovery", payload["data"],
                                payload["sets"], payload["players"], payload["teams"],
                                with_details=True)

        expected = collect(original)
        publication = expected["publication"]
        double = next(m for m in publication["matches"] if m["mode"] == "D" and m["number"] == 19)
        double_legs = {leg["id"] for leg in publication["legs"] if leg["match_id"] == double["id"]}
        for omitted in ({double["id"] + ":2"}, double_legs):
            with self.subTest(omitted=omitted):
                stale = copy.deepcopy(original)
                rows = [row for row in publication["stats"] if row["leg_id"] not in omitted]
                for oid, total in _scoring_totals(rows).items():
                    stale["players"][oid].update(total)
                for team, total in stale["teams"].items():
                    total["score"] = sum(row["score"] for row in rows if row["team_id"] == team)
                    total["darts"] = sum(row["darts_thrown"] for row in rows if row["team_id"] == team)
                recovered = collect(stale)
                self.assertEqual(recovered["publication"]["stats"], publication["stats"])
                self.assertEqual(recovered["publication"]["players"], publication["players"])
                self.assertEqual(recovered["publication"]["score"], publication["score"])
                self.assertEqual(recovered["publication"]["source_reconciliation"]["legs_missing_from_source_scoring"], sorted(omitted))
                self.assertNotIn("source_reconciliation", expected["publication"])
                # Manual closure may have overwritten evening counters with
                # the two-leg score of Double 3. Recover only that exact case.
                two_leg = {leg["id"]: leg for leg in publication["legs"]
                           if leg["id"] in double_legs}
                if len(two_leg) == 2:
                    overwritten = copy.deepcopy(stale)
                    for team, total in overwritten["teams"].items():
                        total["set"] = 2
                        total["winSet"] = sum(leg["winner_team_id"] == team for leg in two_leg.values())
                    restored = collect(overwritten)
                    self.assertEqual(restored["publication"]["score"], publication["score"])
                    self.assertTrue(restored["publication"]["source_reconciliation"]["team_counters_replaced_by_double_3"])
                    broken = copy.deepcopy(overwritten)
                    broken["teams"]["n49i"]["winSet"] += 1
                    with self.assertRaises(SummaryUnavailable): collect(broken)
                    broken = copy.deepcopy(overwritten)
                    broken["teams"]["n49i"]["set"] = 3
                    with self.assertRaises(SummaryUnavailable): collect(broken)
                for kind in ("player", "team", "participation", "unfinished", "other_event"):
                    broken = copy.deepcopy(stale)
                    chosen_event = event
                    if kind == "player": broken["players"]["o0uh"]["score"] += 1
                    if kind == "team": broken["teams"]["n49i"]["darts"] += 3
                    if kind == "participation": broken["players"]["o0uh"]["leg"] += 1
                    if kind == "unfinished": broken["sets"][0]["endMatch"] = 0
                    if kind == "other_event": chosen_event = {**event, "source_url": EVENT["source_url"]}
                    with self.subTest(kind=kind):
                        with self.assertRaises(SummaryUnavailable): collect(broken, chosen_event)

    def test_incomplete_match_waits(self):
        self.payload["sets"].pop()
        with self.assertRaises(SummaryUnavailable): self.facts()
        self.setUp()
        self.payload["sets"][0]["endMatch"] = 0
        with self.assertRaises(SummaryUnavailable): self.facts()

    def test_date_results_and_player_aggregates_must_match(self):
        with self.assertRaises(SummaryUnavailable): self.facts({**EVENT, "start_date": "2026-09-29"})
        self.payload["teams"]["n49i"]["winSet"] = 18
        with self.assertRaises(SummaryUnavailable): self.facts()
        self.setUp()
        self.payload["players"]["o0uh"]["ton80"] = 2
        with self.assertRaises(SummaryUnavailable): self.facts()

    def test_collects_from_fixed_upstreams_and_rejects_mid_read_changes(self):
        p = self.payload
        def fetch(base, command, params, **kwargs):
            if command == "get_data": return p["data"]
            if command == "get_lg_schedule": return [{"p": ["n49i", "0t9o"], "lsid": "qx6h"}]
            if command == "get_setdata":
                self.assertEqual(params["tmid"], "t_eMqn_6846_lg_0_qx6h_0t9o_n49i")
                return p["sets"]
            return p["players"] if command == "player_stats_list" else p["teams"]
        self.assertEqual(collect_evening(EVENT, SEASON, "test", fetch)["legs"], 45)
        mock = Mock(side_effect=[p["data"], [{"p": ["n49i", "0t9o"], "lsid": "qx6h"}], p["sets"], p["players"], p["teams"], {**p["data"], "updateTime": 0}])
        with self.assertRaises(SummaryUnavailable): collect_evening(EVENT, SEASON, "test", mock)
        with self.assertRaises(ValueError): collect_evening({**EVENT, "source_url": "https://example.invalid/private"}, SEASON, "test", mock)


class ScheduleTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.addCleanup(patch.stopall)
        patch.object(service, "STATE_PATH", Path(self.directory.name) / "state.json").start()
        patch.dict(os.environ, {"OPENAI_API_KEY": ""}).start()
        patch.object(service, "_events", return_value=[EVENT]).start()
        patch.object(service, "registry_status", return_value={"seasons": [SEASON]}).start()
        p = json.loads(FIXTURE.read_text())
        self.facts = source_facts(EVENT, SEASON, service.event_key(EVENT), p["data"], p["sets"], p["players"], p["teams"])
        self.collected = {"facts": self.facts, "publication": {"validated": True}}
        self.collect = Mock(return_value=self.collected)
        self.publisher = Mock(return_value={"status": "PUBLISHED", "result_id": "published-id"})
        self.composer = Mock(side_effect=compose_summary)
        self.due = datetime(2026, 9, 28, 18, 0, tzinfo=timezone.utc)

    def run_at(self, now, events=None):
        return service.run_due_analyses(now=now, events=[EVENT] if events is None else events, seasons=[SEASON], collector=self.collect, publisher=self.publisher, composer=self.composer)

    def test_exact_local_boundary_and_idempotence_after_restart(self):
        self.assertEqual(service.due_at(EVENT), self.due)
        self.assertEqual(self.run_at(self.due - timedelta(seconds=1)), 0)
        self.assertEqual(self.run_at(self.due), 1)
        self.assertEqual(self.run_at(self.due + timedelta(minutes=1)), 0)
        self.assertEqual(self.run_at(self.due + timedelta(days=1)), 0)
        self.assertEqual(self.collect.call_count, 1)
        prepared = service.automatic_summary(service.event_key(EVENT))
        self.assertEqual(prepared["evening"]["matches"], 20)

    def test_incomplete_match_retries_at_next_slot_and_survives_restart(self):
        self.collect.side_effect = [SummaryUnavailable("Match en cours"), self.collected]
        self.run_at(self.due)
        self.assertIsNone(service.automatic_summary(service.event_key(EVENT)))
        self.assertEqual(self.run_at(self.due + timedelta(minutes=4)), 0)
        self.assertEqual(self.run_at(self.due + timedelta(minutes=10)), 1)
        self.assertEqual(service.available_records()[0]["status"], "READY")

    def test_all_ten_minute_slots_and_next_evening_cutoff(self):
        self.collect.side_effect = SummaryUnavailable("Match en cours")
        for minutes in range(0, 24 * 60 + 1, 10):
            slot = self.due + timedelta(minutes=minutes)
            self.assertEqual(self.run_at(slot + timedelta(seconds=20)), 1)
            self.assertEqual(self.run_at(slot + timedelta(seconds=40)), 0)
            self.assertEqual(self.run_at(slot + timedelta(minutes=1)), 0)
        self.assertEqual(self.collect.call_count, 145)
        self.assertEqual(self.run_at(self.due + timedelta(hours=24, minutes=10)), 0)
        self.assertEqual(self.run_at(self.due + timedelta(hours=24, minutes=1)), 0)

    def test_old_retry_state_uses_new_slots(self):
        service._write({"records": {service.event_key(EVENT): {
            "signature": service.signature(EVENT), "status": "WAITING",
            "last_attempt_at": (self.due + timedelta(minutes=1)).isoformat(),
            "next_try_at": (self.due + timedelta(minutes=6)).isoformat()}}})
        self.assertEqual(self.run_at(self.due + timedelta(minutes=6)), 0)
        self.assertEqual(self.run_at(self.due + timedelta(minutes=10)), 1)

    def test_restart_between_slots_waits_until_next_slot(self):
        self.assertEqual(self.run_at(self.due + timedelta(minutes=7)), 0)
        self.assertEqual(self.run_at(self.due + timedelta(minutes=10)), 1)

    def test_cancellations_postponements_and_non_championship_events(self):
        cancelled = {**EVENT, "status": "CANCELLED"}
        self.assertEqual(self.run_at(self.due, [cancelled, {**EVENT, "event_type": "FRIENDLY"}]), 0)
        self.run_at(self.due)
        with patch.object(service, "_events", return_value=[{**EVENT, "status": "COMPLETED"}]):
            self.assertEqual(len(service.available_records()), 1)
        with patch.object(service, "_events", return_value=[]):
            self.assertEqual(service.available_records(), [])
        postponed = {**EVENT, "start_date": "2026-10-02"}
        with patch.object(service, "_events", return_value=[postponed]):
            self.assertEqual(service.available_records(), [])
            self.assertEqual(self.run_at(self.due, [postponed]), 0)

    def test_one_failure_does_not_block_other_matches_and_retry_expires(self):
        self.collect.side_effect = [RuntimeError("upstream secret"), self.collected]
        self.assertEqual(self.run_at(self.due, [EVENT, {**EVENT, "id": "second"}]), 2)
        state = service._load()
        self.assertEqual([r["status"] for r in state["records"].values()], ["WAITING", "READY"])
        self.assertNotIn("upstream secret", json.dumps(state))
        self.assertEqual(self.run_at(self.due + timedelta(hours=49)), 0)

    def test_file_lock_prevents_duplicate_generations(self):
        with service._worker_lock():
            self.assertEqual(self.run_at(self.due), 0)
        self.collect.assert_not_called()

    def test_catalog_replaces_duplicate_published_result_and_reports_schedule(self):
        self.run_at(self.due)
        result = service.extend_catalog({"evenings": [{"id": "published"}]}, [{"id": "published", "source_sheet": EVENT["source_url"]}])
        self.assertEqual(len(result["evenings"]), 1)
        self.assertEqual(result["evenings"][0]["id"], service.event_key(EVENT))
        self.assertEqual(result["automation"]["timezone"], "Indian/Reunion")
        self.assertEqual(result["automation"]["retry_minutes"], 10)
        self.assertEqual(result["automation"]["window_hours"], 24)
        self.assertTrue(result["automation"]["until_next_day"])

    def test_ai_failure_retries_selection_without_recollecting_match(self):
        self.composer.return_value = {"evening": self.facts, "mode": "statistics"}
        self.composer.side_effect = None
        with patch.object(service, "ai_configured", return_value=True):
            self.run_at(self.due)
            self.composer.return_value = {"evening": self.facts, "mode": "ai"}
            self.run_at(self.due + timedelta(minutes=5))
            self.run_at(self.due + timedelta(minutes=10))
        self.assertEqual(self.collect.call_count, 1)
        self.assertEqual(self.composer.call_count, 2)
        self.assertEqual(self.publisher.call_count, 1)

    def test_preexisting_private_summary_still_requires_publication(self):
        service._write({"records": {service.event_key(EVENT): {"signature": service.signature(EVENT),
            "status": "READY", "summary": compose_summary(self.facts)}}})
        self.run_at(self.due)
        self.publisher.assert_called_once_with(self.collected)
        self.assertEqual(service._load()["records"][service.event_key(EVENT)]["published_result_id"], "published-id")

    def test_publication_failure_retries_and_ai_never_blocks_statistics(self):
        self.publisher.side_effect = [RuntimeError("DB offline"), {"status": "UNCHANGED", "result_id": "published-id"}]
        self.run_at(self.due)
        self.composer.assert_not_called()
        self.composer.side_effect = [RuntimeError("AI offline"), compose_summary(self.facts)]
        self.run_at(self.due + timedelta(minutes=10))
        self.assertEqual(service.available_records()[0]["published_result_id"], "published-id")
        self.run_at(self.due + timedelta(minutes=15))
        self.assertEqual(self.publisher.call_count, 2)
        self.assertEqual(service.available_records()[0]["status"], "READY")


if __name__ == "__main__":
    unittest.main()
