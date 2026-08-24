from __future__ import annotations

import unittest
import sys
import types

if "supabase" not in sys.modules:
    supabase_stub = types.ModuleType("supabase")
    supabase_stub.Client = object
    sys.modules["supabase"] = supabase_stub

from app.services.player_statistics_engine import (
    PlayerStatisticsDataset,
    PlayerStatisticsEngine,
)


class PlayerTeamCanonicalizationTests(unittest.TestCase):
    def test_legacy_fournaise_players_join_the_official_roster(self) -> None:
        dataset = PlayerStatisticsDataset(
            players=[
                {"id": "alex", "display_name": "Alex", "team_id": "legacy", "public_profile": True},
                {"id": "pierre", "display_name": "Pierre", "team_id": "plural", "public_profile": True},
            ],
            teams=[
                {"id": "official", "name": "PDC Fournaise", "club_id": "papangue"},
                {"id": "legacy", "name": "Fournaise", "club_id": "papangue"},
                {"id": "plural", "name": "PDC Fournaises", "club_id": "papangue"},
            ],
            clubs=[{"id": "papangue", "name": "Papangue Darts Club"}],
            seasons=[{"id": "season-2026", "name": "2026", "is_active": True}],
            rounds=[],
            encounters=[],
            matches=[],
            legs=[],
            stats=[],
            daily_stats=[],
            profiles=[],
            identities=[],
            aliases=[],
        )

        players = PlayerStatisticsEngine(dataset).overview("season-2026")

        self.assertEqual({player["name"] for player in players}, {"Alex", "Pierre"})
        self.assertEqual({player["team"] for player in players}, {"PDC Fournaise"})
        self.assertEqual({player["team_id"] for player in players}, {"official"})


if __name__ == "__main__":
    unittest.main()
