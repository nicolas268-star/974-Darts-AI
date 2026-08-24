from __future__ import annotations

import unittest

from app.services.tournament_round_robin import build_tournament_round_robins


def _match(
    home: str,
    away: str,
    home_score: int,
    away_score: int,
    *,
    home_average: float = 50.0,
    away_average: float = 45.0,
    stage: str = "rr_1",
    first_to: int = 3,
    win_points: int = 2,
) -> dict:
    return {
        "phase": "POOL",
        "stage_code": stage,
        "stage_label": "Round Robin",
        "round_robin_first_to": first_to,
        "round_robin_best_of": first_to * 2 - 1,
        "round_robin_win_points": win_points,
        "home": home,
        "away": away,
        "home_score": home_score,
        "away_score": away_score,
        "home_average_3_darts": home_average,
        "away_average_3_darts": away_average,
        "source_url": "https://n01darts.com/n01/league/season.php?id=test",
    }


class TournamentRoundRobinTests(unittest.TestCase):
    def test_builds_best_of_five_matrix_and_standings(self) -> None:
        tournament = {
            "players": [
                {"name": "Aline", "average_3_darts": 52.3},
                {"name": "Benoît", "average_3_darts": 48.1},
                {"name": "Cédric", "average_3_darts": 46.4},
            ],
            "matches": [
                _match("Aline", "Benoît", 3, 1, home_average=53.2),
                _match("Aline", "Cédric", 3, 2, home_average=51.4),
                _match("Benoît", "Cédric", 3, 0, home_average=49.2),
            ],
        }

        groups = build_tournament_round_robins(tournament)

        self.assertEqual(len(groups), 1)
        group = groups[0]
        self.assertEqual(group["format"], "ROUND_ROBIN")
        self.assertEqual(group["first_to"], 3)
        self.assertTrue(group["complete"])
        self.assertEqual(group["expected_match_count"], 3)
        self.assertEqual(
            [(row["name"], row["points"], row["rank"]) for row in group["standings"]],
            [("Aline", 4, 1), ("Benoît", 2, 2), ("Cédric", 0, 3)],
        )
        aline = group["matrix"][0]
        self.assertIsNone(aline["cells"][0])
        self.assertEqual(aline["cells"][1]["score_for"], 3)
        self.assertEqual(aline["cells"][1]["score_against"], 1)
        self.assertEqual(aline["cells"][1]["average_3_darts"], 53.2)
        benoit = group["matrix"][1]
        self.assertEqual(benoit["cells"][0]["score_for"], 1)
        self.assertEqual(benoit["cells"][0]["score_against"], 3)

    def test_marks_incomplete_round_robin(self) -> None:
        groups = build_tournament_round_robins({
            "players": [],
            "matches": [
                _match("Aline", "Benoît", 3, 2),
                _match("Aline", "Cédric", 3, 0),
            ],
        })

        self.assertEqual(len(groups), 1)
        self.assertFalse(groups[0]["complete"])
        self.assertEqual(groups[0]["match_count"], 2)
        self.assertEqual(groups[0]["expected_match_count"], 3)

    def test_builds_first_to_two_round_robin(self) -> None:
        groups = build_tournament_round_robins({
            "players": [],
            "matches": [
                _match("Aline", "Benoît", 2, 1, first_to=2, win_points=3),
                _match("Aline", "Cédric", 2, 0, first_to=2, win_points=3),
                _match("Benoît", "Cédric", 2, 0, first_to=2, win_points=3),
            ],
        })

        self.assertEqual(len(groups), 1)
        self.assertEqual(groups[0]["first_to"], 2)
        self.assertEqual(groups[0]["best_of"], 3)
        self.assertEqual(groups[0]["win_points"], 3)
        self.assertEqual(groups[0]["format_label"], "Round Robin · premier à 2 legs")
        self.assertEqual(groups[0]["standings"][0]["points"], 6)

    def test_builds_every_pool_as_its_own_matrix(self) -> None:
        groups = build_tournament_round_robins({
            "players": [],
            "matches": [
                _match("Aline", "Benoît", 2, 0, stage="rr_1", first_to=2),
                _match("Cédric", "Diane", 2, 1, stage="rr_2", first_to=2),
            ],
        })

        self.assertEqual([group["code"] for group in groups], ["rr_1", "rr_2"])


if __name__ == "__main__":
    unittest.main()
