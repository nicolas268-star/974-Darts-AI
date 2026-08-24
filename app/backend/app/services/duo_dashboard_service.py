from __future__ import annotations

from typing import Any

from supabase import Client

from .duo_statistics_engine import DuoStatisticsEngine


def build_duo_overview(db: Client, season_id: str | None = None, team_id: str | None = None) -> dict[str, Any]:
    return DuoStatisticsEngine.from_db(db).overview(season_id, team_id)


def build_duo_dashboard(db: Client, player_1_id: str, player_2_id: str, season_id: str | None = None) -> dict[str, Any] | None:
    return DuoStatisticsEngine.from_db(db).detail(player_1_id, player_2_id, season_id)
