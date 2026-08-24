from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.services import nakka_competition_radar as radar


class NakkaCompetitionRadarTests(unittest.TestCase):
    def test_normalization_handles_accents_and_spacing(self) -> None:
        self.assertEqual(
            radar.normalize_text("  PDC—Fóurnaise  "),
            "pdc fournaise",
        )

    def test_matches_known_teams_in_participants(self) -> None:
        matches = radar.match_known_teams(
            "Tournoi amical",
            ["Kazadarts A", "PDC Neige", "Club visiteur"],
        )
        self.assertEqual(
            {item["id"] for item in matches},
            {"kazadarts-a", "pdc-neige"},
        )
        self.assertTrue(
            all(
                item["evidence"][0]["location"] == "participant"
                for item in matches
            )
        )

    def test_does_not_confuse_kazadarts_a_and_b(self) -> None:
        matches = radar.match_known_teams("J1 Kazadarts A contre 3BDC")
        self.assertEqual(
            {item["id"] for item in matches},
            {"kazadarts-a", "3bdc"},
        )

    def test_matches_reunion_club_references_in_tournament_titles(self) -> None:
        examples = {
            "Open de La Réunion 974": "reunion-974",
            "Tournoi Tampon Dart Club": "tdc",
            "Challenge PDC St Leu": "pdc-st-leu",
            "Open 3BC St Paul": "3bdc",
            "Tournoi Kazadarts Saint-Pierre": "kazadarts-saint-pierre",
            "Tournoi Papangue Darts Club 974": "pdc-st-leu",
        }
        for title, expected_id in examples.items():
            with self.subTest(title=title):
                matches = radar.match_known_teams(title)
                self.assertIn(
                    expected_id,
                    {item["id"] for item in matches},
                )

    def test_title_only_reunion_marker_does_not_match_participant_alone(self) -> None:
        matches = radar.match_known_teams(
            "Tournoi national",
            ["Les amis du 974"],
        )
        self.assertNotIn(
            "reunion-974",
            {item["id"] for item in matches},
        )

    def test_tournament_scan_reads_real_entry_names(self) -> None:
        tournament = {
            "tdid": "t_example_123",
            "title": "Coupe du jeudi",
            "t_date": 1780000000,
            "status": 40,
        }
        with patch.object(
            radar,
            "_request_json",
            return_value={
                **tournament,
                "entry_list": [
                    {"tpid": "a", "name": "PDC Fournaise"},
                    {"tpid": "b", "name": "Autre club"},
                ],
            },
        ):
            result = radar._scan_one_tournament(tournament, 2026, {})
        self.assertIsNotNone(result)
        self.assertEqual(result["matchedTeams"][0]["id"], "pdc-fournaise")
        self.assertEqual(result["confidence"], 95)
        self.assertEqual(result["decision"]["action"], "NEW")
        self.assertEqual(result["eventCount"], 1)

    def test_tournament_candidates_search_reunion_titles_beyond_recent_list(
        self,
    ) -> None:
        recent = {
            "tdid": "t_recent_1",
            "title": "Tournoi national",
        }
        archived = {
            "tdid": "t_archived_974",
            "title": "Open de La Réunion 974",
        }

        def fake_list(term: str, _count: int) -> list[dict[str, object]]:
            if term == "":
                return [recent]
            if term in {"974", "Réunion"}:
                return [archived]
            return []

        with patch.object(radar, "_tournament_list", side_effect=fake_list):
            candidates = radar._tournament_candidates("", 30)

        self.assertEqual(
            {item["tdid"] for item in candidates},
            {"t_recent_1", "t_archived_974"},
        )

    def test_explicit_tournament_keyword_uses_only_that_search(self) -> None:
        with patch.object(
            radar,
            "_tournament_list",
            return_value=[
                {
                    "tdid": "t_papangue_1",
                    "title": "Tournoi Papangue Darts Club 974",
                }
            ],
        ) as tournament_list:
            radar._tournament_candidates("Papangue", 60)

        tournament_list.assert_called_once_with("Papangue", 60)

    def test_league_scan_groups_matches_by_competition(self) -> None:
        events = [
            {
                "tdid": "t_day_1",
                "title": "J1 Kaz A vs PDC Neige",
                "t_date": 1770000000,
                "status": 40,
            },
            {
                "tdid": "t_day_2",
                "title": "J2 3BDC vs Kaz B",
                "t_date": 1770600000,
                "status": 40,
            },
        ]
        with patch.object(
            radar,
            "_league_events",
            return_value=("Championnat interclubs 974 (2026)", events),
        ):
            discoveries, inspected = radar._scan_one_league(
                {"lgid": radar.DEFAULT_LEAGUE_ID},
                2026,
                30,
                {},
            )
        self.assertEqual(inspected, 2)
        self.assertEqual(len(discoveries), 1)
        discovery = discoveries[0]
        self.assertEqual(discovery["eventCount"], 2)
        self.assertEqual(discovery["decision"]["action"], "TRACKED")
        self.assertTrue(discovery["alreadyTracked"])
        self.assertEqual(
            {team["id"] for team in discovery["matchedTeams"]},
            {"kazadarts-a", "kazadarts-b", "pdc-neige", "3bdc"},
        )

    def test_old_event_decisions_are_removed_during_migration(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            state_path = Path(temp_dir) / "radar.json"
            state_path.write_text(
                """
                {
                  "version": 1,
                  "lastScan": {"discoveries": [{"key": "league:t_old"}]},
                  "decisions": {
                    "league:t_old": {"action": "IGNORE"},
                    "tournament:t_keep": {"action": "FOLLOW"}
                  }
                }
                """,
                encoding="utf-8",
            )
            with patch.object(radar, "STATE_PATH", state_path):
                migrated = radar.load_radar_state()
        self.assertEqual(migrated["version"], 4)
        self.assertIsNone(migrated["lastScan"])
        self.assertNotIn("league:t_old", migrated["decisions"])
        self.assertIn("tournament:t_keep", migrated["decisions"])

    def test_registered_tournament_is_always_injected_as_tracked(self) -> None:
        registered = [
            {
                "code": "T1",
                "source_tournament_id": "t_lJst_9313",
                "date": "2026-05-14",
                "date_label": "14 mai 2026",
                "event_name": "Tournoi Papangue Darts Club 974",
                "season": "2026",
                "status": "AVAILABLE",
                "summary": {"matches": 23},
            }
        ]
        discoveries = radar._registered_tournament_discoveries(
            season=2026,
            keyword="",
            decisions={},
            tournaments=registered,
        )
        self.assertEqual(len(discoveries), 1)
        discovery = discoveries[0]
        self.assertEqual(discovery["sourceId"], "t_lJst_9313")
        self.assertEqual(discovery["eventCount"], 23)
        self.assertTrue(discovery["alreadyTracked"])
        self.assertEqual(discovery["decision"]["action"], "TRACKED")
        self.assertEqual(
            {team["id"] for team in discovery["matchedTeams"]},
            {"pdc-st-leu", "reunion-974"},
        )

    def test_registered_tournament_is_filtered_by_season(self) -> None:
        discoveries = radar._registered_tournament_discoveries(
            season=2027,
            keyword="",
            decisions={},
            tournaments=[
                {
                    "source_tournament_id": "t_lJst_9313",
                    "event_name": "Tournoi Papangue Darts Club 974",
                    "season": "2026",
                }
            ],
        )
        self.assertEqual(discoveries, [])

    def test_scanned_registered_tournament_is_marked_as_tracked(self) -> None:
        tournament = {
            "tdid": "t_lJst_9313",
            "title": "Tournoi Papangue Darts Club 974",
            "t_date": 1778716800,
            "status": 40,
        }
        with patch.object(
            radar,
            "_request_json",
            return_value={**tournament, "entry_list": []},
        ):
            result = radar._scan_one_tournament(
                tournament,
                2026,
                {},
                {"t_lJst_9313"},
            )
        self.assertIsNotNone(result)
        self.assertTrue(result["alreadyTracked"])
        self.assertEqual(result["decision"]["action"], "TRACKED")

    def test_admin_decision_never_publishes(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            state_path = Path(temp_dir) / "radar.json"
            with patch.object(radar, "STATE_PATH", state_path):
                state = radar._empty_state()
                state["lastScan"] = {
                    "discoveries": [
                        {
                            "key": "tournament:t_example_123",
                            "title": "Coupe 974",
                            "url": "https://n01darts.com/n01/tournament/comp.php?id=t_example_123",
                            "matchedTeams": [{"id": "3bdc"}],
                        }
                    ]
                }
                radar.save_radar_state(state)
                updated = radar.decide_discovery(
                    discovery_key="tournament:t_example_123",
                    action="FOLLOW",
                    confirmed=True,
                    decided_by="admin-test",
                )
        self.assertEqual(
            updated["decisions"]["tournament:t_example_123"]["action"],
            "FOLLOW",
        )
        self.assertFalse(updated["publication"]["automatic"])

    def test_admin_confirmation_is_required(self) -> None:
        with self.assertRaisesRegex(ValueError, "confirmation"):
            radar.decide_discovery(
                discovery_key="tournament:t_example_123",
                action="FOLLOW",
                confirmed=False,
                decided_by="admin-test",
            )

    def test_already_tracked_league_cannot_be_ignored(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            state_path = Path(temp_dir) / "radar.json"
            with patch.object(radar, "STATE_PATH", state_path):
                state = radar._empty_state()
                state["lastScan"] = {
                    "discoveries": [
                        {
                            "key": f"league:{radar.DEFAULT_LEAGUE_ID}:2026",
                            "title": "Championnat interclubs 974 (2026)",
                            "alreadyTracked": True,
                            "matchedTeams": [],
                        }
                    ]
                }
                radar.save_radar_state(state)
                with self.assertRaisesRegex(ValueError, "déjà suivie"):
                    radar.decide_discovery(
                        discovery_key=f"league:{radar.DEFAULT_LEAGUE_ID}:2026",
                        action="IGNORE",
                        confirmed=True,
                        decided_by="admin-test",
                    )


if __name__ == "__main__":
    unittest.main()
