from __future__ import annotations

import unittest
from unittest.mock import patch
import sys
import types

if "supabase" not in sys.modules:
    supabase_stub = types.ModuleType("supabase")
    supabase_stub.Client = object
    sys.modules["supabase"] = supabase_stub

from app.services.committee_ranking_service import (
    _normalized_name,
    _points_for,
    _rank_players,
    build_event_preview,
)


def match(
    stage_code: str,
    stage_index: int,
    home: str,
    away: str,
    winner: str,
) -> dict[str, object]:
    return {
        "phase": "KNOCKOUT",
        "stage_code": stage_code,
        "stage_index": stage_index,
        "match_number": 0,
        "home": home,
        "away": away,
        "winner": winner,
    }


class CommitteeRankingServiceTests(unittest.TestCase):
    def test_official_name_normalization_ignores_accents_and_spacing(self) -> None:
        self.assertEqual(_normalized_name("  Stéphane ARBOUSSE "), "stephanearbousse")
        self.assertEqual(_normalized_name("Kévin BARRET"), "kevinbarret")

    def test_non_licensed_player_receives_no_points(self) -> None:
        self.assertEqual(_points_for("WINNER", "Non licencié"), 0)
        self.assertEqual(_points_for("WINNER", "Kaz A Darts 974"), 10)

    def test_category_ranking_does_not_overwrite_mixed_ranks(self) -> None:
        players = {
            "emmanuel": {
                "player_name": "Emmanuel GRASSET",
                "gender": "M",
                "total": 10,
                "event_points": {"t5": 10},
            },
            "dominique": {
                "player_name": "Dominique CANTY",
                "gender": "F",
                "total": 4,
                "event_points": {"t5": 4},
            },
            "nicolas": {
                "player_name": "Nicolas DUPONT",
                "gender": "M",
                "total": 6,
                "event_points": {"t5": 6},
            },
        }

        mixed = _rank_players(players, None)
        women = _rank_players(players, "F")

        self.assertEqual([row["rank"] for row in mixed], [1, 2, 3])
        self.assertEqual(women[0]["rank"], 1)
        self.assertEqual(mixed[-1]["rank"], 3)

    def test_only_winner_bracket_awards_points(self) -> None:
        tournament = {
            "status": "AVAILABLE",
            "matches": [
                match("ko_1", 1, "Alice", "Bruno", "Alice"),
                match("ko_1", 1, "Chloé", "David", "Chloé"),
                match("ko_2", 2, "Alice", "Chloé", "Alice"),
                match("loser_1", 101, "Bruno", "David", "David"),
                match("loser_2", 102, "David", "Chloé", "David"),
                match("grand_final_1", 201, "Alice", "David", "David"),
            ],
        }

        with patch(
            "app.services.committee_ranking_service.CompetitionHubService.tournament",
            return_value=tournament,
        ):
            preview = build_event_preview("club-open-kaz-2026-09-13")

        self.assertEqual(
            [(row["player_name"], row["placement"], row["points"]) for row in preview["results"]],
            [
                ("Alice", "WINNER", 10),
                ("Chloé", "RUNNER_UP", 8),
                ("Bruno", "SEMI_FINALIST", 6),
                ("David", "SEMI_FINALIST", 6),
            ],
        )
        self.assertEqual(preview["summary"]["source_matches"], 3)


if __name__ == "__main__":
    unittest.main()
