from __future__ import annotations

from typing import Any

from supabase import Client

from .player_statistics_engine import PlayerStatisticsEngine


def build_player_dashboard(db: Client, player_id: str, season_id: str | None = None) -> dict[str, Any] | None:
    return PlayerStatisticsEngine.from_db(db).dashboard(player_id, season_id)
