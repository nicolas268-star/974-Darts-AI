"""Real Nakka fixtures, active publication guards and internal summary routes."""
from copy import deepcopy
import os
import tempfile
import unittest
from unittest.mock import patch


from app.services import tournament_page_service as pages
from app.services import tournament_visibility as visibility
from app.services.visibility_context import load_context, save_context
from app.services.visibility_service import SummaryUnavailable
from test_tournament_page_service import Database, current_oc1, legacy_t5, read_fixture


class TournamentVisibilityTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        environment = patch.dict(os.environ, {"OPENAI_API_KEY": "configured-but-unused", "VISIBILITY_CACHE_DIR": directory.name})
        environment.start()
        self.addCleanup(environment.stop)
        cache = patch.object(pages, "load_tournament_cache", return_value={"tournaments": []})
        cache.start()
        self.addCleanup(cache.stop)
        self.snapshot = read_fixture("oc1_published.json")
        self.snapshot["source"] = current_oc1()
        self.db = Database(self.snapshot)

    def oc1(self):
        tournament, _ = pages.official_payload(self.db, self.db.event)
        tournament["location"] = "Saint-Leu, La Réunion"
        return tournament

    def test_oc1_published_revision_retains_150_points_and_real_29_players(self):
        before = deepcopy(self.db.tables)
        with patch("app.services.ranking_nakka.collect_private", side_effect=AssertionError("No Nakka on GET")) as source, \
                patch("app.services.visibility_service._ai_selection", side_effect=AssertionError("No AI")) as ai:
            catalog = visibility.list_tournaments(self.db)
            summary = visibility.tournament_summary(self.db, "OC1-2026-10-18")
        self.assertEqual(catalog["tournaments"][0]["id"], "tournament:oc1-2026-10-18")
        self.assertFalse(catalog["ai_available"])
        self.assertEqual(summary["kind"], "tournament")
        self.assertEqual(summary["mode"], "statistics")
        self.assertFalse(summary["ai_available"])
        self.assertEqual(summary["evening"]["players"], 29)
        self.assertEqual(summary["evening"]["matches"], 83)
        self.assertEqual(summary["evening"]["legs"], 226)
        self.assertEqual(summary["evening"]["date"], "18/10/2026")
        self.assertEqual(summary["evening"]["playersLabel"], "joueurs")
        facts = {fact["id"]: fact["text"] for fact in summary["evening"]["facts"]}
        self.assertIn("150 au total", facts["committee_points"])
        self.assertIn("30 pts Comité", facts["winner"])
        self.assertIn("24 pts Comité", facts["runner_up"])
        self.assertIn("6 poules", facts["format"])
        self.assertIn("consolante", facts["format"])
        self.assertIn("2 au total", facts["maximums"])
        for channel in ("whatsapp", "facebook"):
            text = summary[channel]
            self.assertIn("https://974darts.re/tournaments/oc1-2026-10-18", text)
            self.assertIn("t_ssSW_4561", text)
            self.assertNotIn("999999", text)
            self.assertNotIn("deux équipes", text)
            self.assertNotIn("120–139", text)
            self.assertNotIn("double élimination", text)
        source.assert_not_called()
        ai.assert_not_called()
        self.assertEqual(self.db.tables, before)
        self.assertFalse(self.db.commits)
        self.assertTrue(all(operation == "select" for _, operation in self.db.operations))

    def test_t5_recognized_historical_page_keeps_35_players_and_exact_published_points(self):
        db, _, prior, results = legacy_t5()
        with patch.object(pages, "load_tournament_cache", return_value={"tournaments": [prior]}):
            summary = visibility.tournament_summary(db, "T5")
        self.assertEqual(summary["evening"]["players"], 35)
        self.assertEqual(summary["evening"]["matches"], 90)
        self.assertEqual(summary["evening"]["legs"], 232)
        facts = {fact["id"]: fact["text"] for fact in summary["evening"]["facts"]}
        self.assertIn(f"{sum(row['points'] for row in results)} au total", facts["committee_points"])
        self.assertIn("Emmanuel GRASSET", facts["winner"])
        self.assertNotIn("PRIVATE-ADMIN", str(summary))
        self.assertNotIn("PRIVATE-MATCH-ADMIN", str(summary))
        self.assertEqual(summary["evening"]["url"], "https://974darts.re/tournaments/t5")
        self.assertFalse(db.commits)

    def test_missing_statistics_are_omitted_and_known_zero_remains_a_real_zero(self):
        tournament = self.oc1()
        tournament["players"][0]["scores_180"] = None
        summary = visibility.compose_tournament_summary(tournament)
        self.assertNotIn("maximums", {fact["id"] for fact in summary["evening"]["facts"]})
        for player in tournament["players"]:
            player.update(scores_180=0, average_3_darts=None, first_9=None, best_finish=None)
        facts = {fact["id"]: fact["text"] for fact in visibility.build_tournament_facts(tournament)["facts"]}
        self.assertIn("0 au total", facts["maximums"])
        self.assertTrue({"top_average", "first9", "finish"}.isdisjoint(facts))
        tournament.update(players=[], matches=[], summary={})
        evening = visibility.build_tournament_facts(tournament)
        self.assertIsNone(evening["players"])
        self.assertIsNone(evening["matches"])
        self.assertIsNone(evening["legs"])

    def test_only_active_published_official_or_recognized_pages_are_selectable(self):
        published = self.oc1()
        cases = [
            {**published, "classification": "FRIENDLY"},
            {**published, "ranking_status": "ADMIN_DRAFT"},
            {**published, "source_tournament_id": "another-source"},
            {**published, "discipline": "DOUBLE"},
            {**published, "official_publication": {"revision_id": "obsolete", "status": "PUBLISHED"}},
            {**published, "official_publication": {"revision_id": "published-14", "status": "ADMIN_DRAFT"}},
        ]
        for tournament in cases:
            with self.subTest(tournament=tournament.get("classification")), \
                    patch.object(visibility, "all_tournaments", return_value=[tournament]):
                self.assertEqual(visibility.list_tournaments(self.db)["tournaments"], [])
                with self.assertRaises(SummaryUnavailable):
                    visibility.tournament_summary(self.db, published["code"])
        with patch.object(visibility, "all_tournaments", return_value=[published, deepcopy(published)]):
            self.assertEqual(visibility.list_tournaments(self.db)["tournaments"], [])
        with self.assertRaises(SummaryUnavailable):
            visibility.tournament_summary(self.db, "unknown")

    def test_workflow_failure_or_unpublished_revision_cannot_reuse_a_cached_label(self):
        tournament = self.oc1()
        self.db.save(tournament)
        with patch.object(visibility, "official_events", side_effect=RuntimeError("unavailable")):
            with self.assertRaises(RuntimeError):
                visibility.list_tournaments(self.db)
        self.db.tables["ranking_workflow_revisions"][0]["status"] = "ADMIN_DRAFT"
        with self.assertRaises(ValueError):
            visibility.tournament_summary(self.db, tournament["code"])
        self.db.tables["ranking_workflow_revisions"] = []
        with self.assertRaises(ValueError):
            visibility.list_tournaments(self.db)

    def test_context_persists_by_tournament_without_collisions_or_ranking_writes(self):
        tournament = self.oc1()
        before = deepcopy(tournament)
        initial = visibility.compose_tournament_summary(tournament)
        save_context(tournament["code"], "Ancien contexte interclubs")
        save_context("bdc:t5", "Autre contexte BDC")
        text = "Merci aux bénévoles et au club hôte."
        updated = visibility.compose_tournament_summary(tournament, context=text)
        repeated = visibility.compose_tournament_summary(tournament)
        self.assertEqual(repeated["context"], text)
        self.assertEqual(repeated["fingerprint"], updated["fingerprint"])
        self.assertNotEqual(initial["fingerprint"], updated["fingerprint"])
        self.assertIn("Saint-Leu, La Réunion", repeated["whatsapp"])
        self.assertIn(text, repeated["facebook"])
        self.assertEqual(load_context({"result_id": tournament["code"]}), "Ancien contexte interclubs")
        self.assertEqual(visibility.compose_tournament_summary({**tournament, "code": "another"})["context"], "")
        self.assertEqual(visibility.compose_tournament_summary(tournament, context="")["context"], "")
        for invalid in (4, {}, "x" * 1601):
            with self.assertRaises(ValueError):
                visibility.compose_tournament_summary(tournament, context=invalid)
        self.assertEqual(tournament, before)

    def test_doublettes_keep_collective_counts_and_individual_points_separate(self):
        tournament = {"code": "double-test", "discipline": "DOUBLE", "event_name": "Coupe doublettes",
                      "players": [], "duos": [{"nakka_participant_id": "a", "name": "Duo confirmé A", "average_3_darts": 47},
                                                {"nakka_participant_id": "b", "name": "Duo confirmé B", "average_3_darts": 43}],
                      "official_results": [{"name": name, "source_ref": source, "placement": placement, "points": points}
                          for name, source, placement, points in (("Alice", "a:1", "WINNER", 30), ("Bruno", "a:2", "WINNER", 30),
                                                                  ("Chloé", "b:1", "RUNNER_UP", 20), ("David", "b:2", "RUNNER_UP", 20))]}
        summary = visibility.compose_tournament_summary(tournament)
        facts = {fact["id"]: fact["text"] for fact in summary["evening"]["facts"]}
        self.assertEqual(summary["evening"]["players"], 2)
        self.assertEqual(summary["evening"]["playersLabel"], "doublettes")
        self.assertIn("Duo confirmé A", facts["winner"])
        self.assertIn("Alice : 30 pts", facts["individual_points"])
        self.assertIn("100 au total", facts["committee_points"])
        self.assertIn("Performances collectives des doublettes", summary["whatsapp"])
        self.assertNotIn("4 joueurs", summary["whatsapp"])


if __name__ == "__main__":
    unittest.main()
