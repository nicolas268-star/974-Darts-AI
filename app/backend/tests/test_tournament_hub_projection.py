from copy import deepcopy
import unittest
from unittest.mock import patch

from app.services.competition_hub_service import CompetitionHubService


class TournamentHubProjectionTests(unittest.TestCase):
    def setUp(self):
        self.historical = {
            "code": "T1", "source_tournament_id": "t_shared", "discipline": "SINGLE",
            "event_name": "Ancienne fiche amicale", "date": "2026-10-18",
            "matches": [], "players": [], "summary": {"matches": 1},
        }

    def visible(self, rows):
        cache = patch("app.services.competition_hub_service.load_tournament_cache",
                      return_value={"tournaments": [deepcopy(self.historical)]})
        projection = patch("app.services.competition_hub_service.all_tournaments", return_value=deepcopy(rows))
        cache.start()
        projection.start()
        self.addCleanup(cache.stop)
        self.addCleanup(projection.stop)

    def test_reserved_unpublished_source_is_not_resurrected_from_cache_or_builtin_placeholder(self):
        self.visible([])
        cards = CompetitionHubService._tournament_cards()
        self.assertNotIn("T1", {row["code"] for row in cards})
        self.assertIsNone(CompetitionHubService.tournament("t1"))
        self.assertEqual(CompetitionHubService.tournament("t2")["status"], "WAITING_DATA")

    def test_published_projection_replaces_friendly_card_and_preserves_historical_url(self):
        official = {**self.historical, "event_name": "Publication officielle",
                    "classification": "OFFICIAL", "classification_label": "Compétition officielle du Comité",
                    "affects_committee_ranking": True, "ranking_status": "PUBLISHED",
                    "committee_event_key": "published-event"}
        self.visible([official])
        cards = [row for row in CompetitionHubService._tournament_cards() if row["code"] == "T1"]
        self.assertEqual(len(cards), 1)
        self.assertEqual(cards[0]["classification"], "OFFICIAL")
        self.assertEqual(cards[0]["href"], "/tournaments/t1")
        result = CompetitionHubService.tournament("t1")
        self.assertEqual(result["event_name"], "Publication officielle")
        self.assertEqual(result["committee_event_key"], "published-event")

    def test_new_official_slug_is_visible_without_a_legacy_t_code(self):
        official = {**self.historical, "code": "oc1-2026-10-18", "classification": "OFFICIAL"}
        self.visible([official])
        cards = CompetitionHubService._tournament_cards()
        self.assertEqual(len([row for row in cards if row["code"] == "OC1-2026-10-18"]), 1)
        self.assertNotIn("T1", {row["code"] for row in cards})
        self.assertIsNone(CompetitionHubService.tournament("t1"))
        self.assertEqual(CompetitionHubService.tournament("oc1-2026-10-18")["classification"], "OFFICIAL")

    def test_same_source_singles_and_doubles_remain_distinct(self):
        single = {**self.historical, "classification": "FRIENDLY"}
        double = {**single, "code": "club-open-double", "discipline": "DOUBLE"}
        self.visible([single, double])
        cards = [row for row in CompetitionHubService._tournament_cards() if row.get("discipline")]
        self.assertEqual({(row["code"], row["discipline"]) for row in cards},
                         {("T1", "SINGLE"), ("CLUB-OPEN-DOUBLE", "DOUBLE")})
        self.assertEqual(CompetitionHubService.tournament("club-open-double")["discipline"], "DOUBLE")

    def test_t5_recognition_survives_legacy_friendly_metadata(self):
        self.historical.update(code="T5", classification="FRIENDLY", affects_committee_ranking=False)
        self.visible([self.historical])
        card = next(row for row in CompetitionHubService._tournament_cards() if row["code"] == "T5")
        self.assertEqual(card["classification"], "COMMITTEE_RECOGNIZED")
        self.assertTrue(card["affects_committee_ranking"])
        self.assertEqual(CompetitionHubService.tournament("t5")["ranking_status"], "PUBLISHED")


if __name__ == "__main__":
    unittest.main()
