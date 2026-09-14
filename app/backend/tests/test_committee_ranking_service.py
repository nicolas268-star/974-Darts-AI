from __future__ import annotations

import unittest
from unittest.mock import patch

from app.services.committee_ranking_service import build_event_preview


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
    def test_only_winner_bracket_awards_points(self) -> None:
        tournament = {
            "status": "AVAILABLE",
            "matches": [
                match("winner_1", 1, "Alice", "Bruno", "Alice"),
                match("winner_1", 1, "Chloé", "David", "Chloé"),
                match("winner_2", 2, "Alice", "Chloé", "Alice"),
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
