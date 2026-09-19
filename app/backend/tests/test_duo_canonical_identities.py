from app.services.duo_statistics_engine import DuoStatisticsEngine
from app.services.player_statistics_engine import PlayerStatisticsDataset


def _dataset() -> PlayerStatisticsDataset:
    return PlayerStatisticsDataset(
        players=[
            {
                "id": "canonical-pierre",
                "display_name": "Pierre BERTLER",
                "team_id": "pdc",
                "public_profile": True,
            },
            {
                "id": "source-pierre",
                "display_name": "Pierre",
                "team_id": "pdc",
                "public_profile": True,
            },
            {
                "id": "nicolas",
                "display_name": "Nicolas DUPONT",
                "team_id": "pdc",
                "public_profile": True,
            },
            {
                "id": "canonical-alex",
                "display_name": "Alexandre SANZ VILLAR",
                "team_id": "kad",
                "public_profile": True,
            },
            {
                "id": "source-alex",
                "display_name": "Alex",
                "team_id": "kad",
                "public_profile": True,
            },
            {
                "id": "opponent-2",
                "display_name": "Adversaire 2",
                "team_id": "kad",
                "public_profile": True,
            },
        ],
        teams=[
            {"id": "pdc", "name": "PDC Fournaise", "club_id": None},
            {"id": "kad", "name": "Kazadarts A", "club_id": None},
        ],
        clubs=[],
        seasons=[{"id": "season", "name": "2026", "is_active": True}],
        rounds=[
            {
                "id": "round",
                "season_id": "season",
                "code": "J1",
                "played_on": "2026-01-01",
                "published": True,
            }
        ],
        encounters=[
            {
                "id": "encounter",
                "round_id": "round",
                "name": "PDC - KAD",
                "home_team_id": "pdc",
                "away_team_id": "kad",
            }
        ],
        matches=[
            {
                "id": "match",
                "encounter_id": "encounter",
                "match_number": 1,
                "nakka_match_number": 1,
                "mode": "double",
                "team_1_id": "pdc",
                "team_2_id": "kad",
                "winner_team_id": "pdc",
            }
        ],
        legs=[
            {
                "id": "leg",
                "match_id": "match",
                "leg_number": 1,
                "winner_team_id": "pdc",
                "status": "VALID",
            }
        ],
        stats=[
            {"id": "s1", "leg_id": "leg", "player_id": "source-pierre", "team_id": "pdc", "score": 200},
            {"id": "s2", "leg_id": "leg", "player_id": "nicolas", "team_id": "pdc", "score": 301},
            {"id": "s3", "leg_id": "leg", "player_id": "source-alex", "team_id": "kad", "score": 180},
            {"id": "s4", "leg_id": "leg", "player_id": "opponent-2", "team_id": "kad", "score": 200},
        ],
        daily_stats=[],
        profiles=[],
        identities=[
            {
                "id": "identity-pierre",
                "canonical_player_id": "canonical-pierre",
                "status": "ACTIVE",
                "merged_into_identity_id": None,
            },
            {
                "id": "identity-alex",
                "canonical_player_id": "canonical-alex",
                "status": "ACTIVE",
                "merged_into_identity_id": None,
            },
        ],
        aliases=[
            {
                "identity_id": "identity-pierre",
                "source_player_id": "source-pierre",
            },
            {
                "identity_id": "identity-alex",
                "source_player_id": "source-alex",
            },
        ],
    )


def test_duo_uses_canonical_identity_for_historical_player_rows():
    overview = DuoStatisticsEngine(_dataset()).overview("season")

    pdc_duo = next(duo for duo in overview["duos"] if duo["team_id"] == "pdc")
    players = {
        pdc_duo["player_1"]["id"]: pdc_duo["player_1"]["name"],
        pdc_duo["player_2"]["id"]: pdc_duo["player_2"]["name"],
    }

    assert players == {
        "canonical-pierre": "Pierre BERTLER",
        "nicolas": "Nicolas DUPONT",
    }
    assert pdc_duo["duo_id"] == "canonical-pierre__nicolas"
    assert sum(item["score"] for item in pdc_duo["contributions"]) == 501

    kad_duo = next(duo for duo in overview["duos"] if duo["team_id"] == "kad")
    kad_players = {
        kad_duo["player_1"]["id"]: kad_duo["player_1"]["name"],
        kad_duo["player_2"]["id"]: kad_duo["player_2"]["name"],
    }
    assert kad_players["canonical-alex"] == "Alexandre SANZ VILLAR"
    assert "source-alex" not in kad_players
