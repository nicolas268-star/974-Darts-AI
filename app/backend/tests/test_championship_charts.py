import unittest
from unittest.mock import patch

from app.services.ranking_service import (
    _official_standings, _round_history, _pvp_fallback,
    build_ranking, RULES_2026_2027, DEFAULT_RULES,
)


class ChampionshipChartTests(unittest.TestCase):
    names = {"a": "Équipe A", "b": "Équipe B", "c": "Équipe C", "d": "Équipe D"}
    codes = {"r1": "J1", "r2": "J2", "r10": "J10"}

    def result(self, round_id, home="a", away="b", score=(17, 3), **extra):
        return dict(round_id=round_id, home_team_id=home, away_team_id=away,
                    home_score=score[0], away_score=score[1], **extra)

    def test_history_reconciles_with_standings_draws_forfeits_and_multiple_matches(self):
        results = [
            self.result("r10", forfeit_team_id="a"),
            self.result("r2", score=(10, 10)),
            self.result("r1", detail_status="COLLECTIVE_ONLY"),
            self.result("r2", "c", "d"),
            self.result("r2", "a", "c", (3, 17)),
        ]
        standings = _official_standings(results, self.names, self.codes, RULES_2026_2027, {}, 0)["standings"]
        history = _round_history(results, standings, self.names, self.codes, RULES_2026_2027)
        self.assertEqual([row["round"] for row in history], ["J1", "J2", "J10"])
        for team in standings:
            scores = [next(t for t in row["teams"] if t["team_id"] == team["team_id"]) for row in history]
            self.assertEqual(sum(row["points"] or 0 for row in scores), team["points"])
            self.assertEqual(scores[-1]["cumulative_points"], team["points"])
            self.assertEqual(sum(row["played"] for row in scores), team["played"])
        first = {team["team_id"]: team for team in history[0]["teams"]}
        self.assertIsNone(first["c"]["points"])
        self.assertEqual(first["c"]["played"], 0)
        last = {team["team_id"]: team for team in history[-1]["teams"]}
        self.assertEqual(last["a"]["points"], 0)
        self.assertEqual(last["a"]["played"], 1)
        self.assertEqual(last["a"]["cumulative_points"], 7)

    def test_previous_season_uses_its_own_rules(self):
        results = [self.result("r1")]
        standings = _official_standings(results, self.names, self.codes, DEFAULT_RULES, {}, 0)["standings"]
        history = _round_history(results, standings, self.names, self.codes, DEFAULT_RULES)
        self.assertEqual(history[0]["teams"][0]["points"], 3)

    def test_unpublished_and_other_season_rounds_are_excluded(self):
        tables = {
            "seasons": [{"id": "s", "name": "2026-2027", "is_active": True}],
            "rounds": [{"id": "r1", "code": "J1", "season_id": "s", "published": True},
                       {"id": "r2", "code": "J2", "season_id": "s", "published": False},
                       {"id": "r10", "code": "J10", "season_id": "old", "published": True}],
            "teams": [{"id": key, "name": name} for key, name in self.names.items()],
        }
        with patch("app.services.ranking_service._all", side_effect=lambda db, table, *args: tables[table]), \
             patch("app.services.ranking_service._optional_all", return_value=[self.result(r) for r in self.codes]), \
             patch("app.services.ranking_service.get_rules", return_value=RULES_2026_2027), \
             patch("app.services.ranking_service._detailed_leg_totals", return_value=({}, 0)):
            ranking = build_ranking(None, "s")
        self.assertEqual([row["round"] for row in ranking["round_history"]], ["J1"])
        self.assertEqual(ranking["standings"][0]["points"], 4)

    def test_fallback_history_reuses_reconstructed_encounters(self):
        tables = {"matches": [{"id": "m", "encounter_id": "e", "team_1_id": "a", "team_2_id": "b", "winner_team_id": "a"}], "legs": []}
        with patch("app.services.ranking_service._all", side_effect=lambda db, table, *args: tables[table]):
            ranking = _pvp_fallback(None, [{"id": "e", "round_id": "r1", "home_team_id": "a", "away_team_id": "b"}], self.names, DEFAULT_RULES, 0, self.codes)
        self.assertEqual(ranking["round_history"][0]["teams"][0]["cumulative_points"], ranking["standings"][0]["points"])

    def test_no_results_produces_no_invented_rounds(self):
        self.assertEqual(_round_history([], [], self.names, self.codes, DEFAULT_RULES), [])


if __name__ == "__main__":
    unittest.main()
