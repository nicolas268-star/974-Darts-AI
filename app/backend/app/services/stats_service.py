from __future__ import annotations

from typing import Any

from supabase import Client

from .player_statistics_engine import PlayerStatisticsEngine


def player_overview(db: Client, season_id: str | None = None) -> list[dict[str, Any]]:
    return PlayerStatisticsEngine.from_db(db).overview(season_id)
