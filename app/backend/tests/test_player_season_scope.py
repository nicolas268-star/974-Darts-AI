from __future__ import annotations

import sys
import types

if "supabase" not in sys.modules:
    supabase_stub = types.ModuleType("supabase")
    supabase_stub.Client = object
    sys.modules["supabase"] = supabase_stub

from app.services.player_statistics_engine import PlayerStatisticsDataset, PlayerStatisticsEngine


def _engine() -> PlayerStatisticsEngine:
    dataset = PlayerStatisticsDataset(
        players=[{"id": "pierre", "display_name": "Pierre BERTLER", "team_id": "pdc", "public_profile": True}],
        teams=[{"id": "pdc", "name": "PDC Fournaise", "club_id": None}],
        clubs=[],
        seasons=[
            {"id": "empty-championship-2026", "name": "Championnat 2026", "is_active": True},
            {"id": "season-2026", "name": "2026", "is_active": False},
            {"id": "season-2027", "name": "2026-2027", "is_active": True},
        ],
        rounds=[
            {"id": "round-2026", "season_id": "season-2026", "code": "J1", "played_on": "2026-03-01", "published": True},
            {"id": "round-2027", "season_id": "season-2027", "code": "J1", "played_on": "2027-03-01", "published": True},
        ],
        encounters=[],
        matches=[],
        legs=[],
        stats=[],
        daily_stats=[
            {"id": "d1", "player_id": "pierre", "round_id": "round-2026", "team_id": "pdc", "legs_played": 4, "legs_won": 2, "average_3_darts": 48, "first_9": 50, "best_finish": 40, "elo_after": 1000},
            {"id": "d2", "player_id": "pierre", "round_id": "round-2027", "team_id": "pdc", "legs_played": 6, "legs_won": 4, "average_3_darts": 54, "first_9": 56, "best_finish": 80, "elo_after": 1020},
        ],
        profiles=[],
        identities=[],
        aliases=[],
    )
    return PlayerStatisticsEngine(dataset)


def test_calendar_year_selects_the_matching_sports_season() -> None:
    dashboard = _engine().dashboard("pierre", "2027")

    assert dashboard is not None
    assert dashboard["season"]["id"] == "season-2027"
    assert dashboard["season"]["name"] == "2026-2027"
    assert dashboard["kpis"]["legs_played"] == 6
    assert dashboard["kpis"]["average_3_darts"] == 54


def test_year_prefers_the_duplicate_season_that_contains_data() -> None:
    dashboard = _engine().dashboard("pierre", "2026")

    assert dashboard is not None
    assert dashboard["season"]["id"] == "season-2026"
    assert dashboard["kpis"]["legs_played"] == 4
    assert dashboard["meta"]["scope"]["season_strategy"] == "requested_year_data_rich"


def test_all_career_aggregates_every_published_season() -> None:
    dashboard = _engine().dashboard("pierre", "all")

    assert dashboard is not None
    assert dashboard["season"]["id"] == "all"
    assert dashboard["kpis"]["legs_played"] == 10
    assert dashboard["kpis"]["legs_won"] == 6
    assert dashboard["kpis"]["average_3_darts"] == 51.6
    assert [item["played_on"] for item in dashboard["trends"]] == ["2026-03-01", "2027-03-01"]


def test_future_year_returns_an_empty_but_valid_scope() -> None:
    dashboard = _engine().dashboard("pierre", "2028")

    assert dashboard is not None
    assert dashboard["season"] == {"id": "year:2028", "name": "2028", "is_active": False}
    assert dashboard["meta"]["has_data"] is False
    assert dashboard["kpis"]["legs_played"] == 0
