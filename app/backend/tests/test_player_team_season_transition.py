import sys
import types
import unittest

if "supabase" not in sys.modules:
    supabase_stub = types.ModuleType("supabase")
    supabase_stub.Client = object
    sys.modules["supabase"] = supabase_stub

from app.services.player_statistics_engine import PlayerStatisticsDataset, PlayerStatisticsEngine


class PlayerTeamSeasonTransitionTests(unittest.TestCase):
    def engine(self):
        dataset = PlayerStatisticsDataset(
            players=[
                {"id": "p", "display_name": "Player", "team_id": "a", "public_profile": True},
                {"id": "opponent", "display_name": "Opponent", "team_id": "a", "public_profile": True},
            ],
            teams=[{"id": "a", "name": "Kazadarts A"}, {"id": "b", "name": "Kaz A Darts - B"}],
            clubs=[],
            seasons=[{"id": "old", "name": "2026", "is_active": False}, {"id": "new", "name": "2026-2027", "is_active": True}],
            rounds=[
                {"id": "r-old", "season_id": "old", "code": "J1", "played_on": "2026-03-02", "published": True},
                {"id": "r-new", "season_id": "new", "code": "J1", "played_on": "2026-09-28", "published": True},
            ],
            encounters=[{"id": "e", "round_id": "r-new", "name": "Derby", "home_team_id": "a", "away_team_id": "b"}],
            matches=[{"id": "m", "encounter_id": "e", "team_1_id": "a", "team_2_id": "b", "match_number": 1, "mode": "S"}],
            legs=[{"id": "l", "match_id": "m", "status": "VALID", "winner_team_id": "a"}],
            stats=[
                {"id": "s1", "leg_id": "l", "player_id": "p", "team_id": "b", "score": 450, "darts_thrown": 30, "leg_won": False},
                {"id": "s2", "leg_id": "l", "player_id": "opponent", "team_id": "a", "score": 501, "darts_thrown": 30, "leg_won": True},
            ],
            daily_stats=[{"id": "d", "player_id": "p", "round_id": "r-old", "team_id": "a", "legs_played": 4, "legs_won": 2, "average_3_darts": 40}],
            profiles=[], identities=[], aliases=[],
        )
        return PlayerStatisticsEngine(dataset)

    def test_transfer_changes_current_team_without_rewriting_history(self):
        engine = self.engine()
        current = engine.dashboard("p", "2027")
        historical = engine.dashboard("p", "2026")
        self.assertEqual(current["player"]["team_id"], "b")
        self.assertEqual(current["player"]["team"], "Kaz A Darts - B")
        self.assertEqual(historical["player"]["team_id"], "a")
        self.assertEqual(historical["kpis"]["legs_played"], 4)
        self.assertEqual(engine.data.players[0]["team_id"], "a")

    def test_match_opponent_uses_the_team_represented_in_that_match(self):
        current = self.engine().dashboard("p", "2027")
        self.assertEqual(current["recent_matches"][0]["opponent_team_id"], "a")
        self.assertEqual(current["recent_matches"][0]["opponent_names"], "Opponent")
        career = self.engine().dashboard("p", "all")
        self.assertEqual(career["recent_matches"][0]["opponent_team_id"], "a")

    def test_unpublished_affiliation_does_not_change_the_public_team(self):
        engine = self.engine()
        engine.data.rounds[1]["published"] = False
        rebuilt = PlayerStatisticsEngine(engine.data)
        self.assertEqual(rebuilt._identity(engine.data.players[0], engine.data.seasons[1])["team_id"], "a")

    def test_overview_and_dashboard_agree_on_season_team(self):
        engine = self.engine()
        player = next(row for row in engine.overview("2027") if row["player_id"] == "p")
        self.assertEqual(player["team_id"], engine.dashboard("p", "2027")["player"]["team_id"])


if __name__ == "__main__":
    unittest.main()
