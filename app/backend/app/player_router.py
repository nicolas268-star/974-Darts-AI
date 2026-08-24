from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.services.player_dashboard_service import build_player_dashboard
from app.services.player_statistics_engine import PlayerStatisticsEngine

router = APIRouter(prefix="/api/v1/players", tags=["Players"])


@router.get("/{player_id}/dashboard")
def player_dashboard(
    player_id: str,
    season_id: str | None = Query(default=None),
):
    """Return chart-ready player statistics aligned with the live Supabase schema."""
    from app.main import db_client

    payload = build_player_dashboard(db_client(), player_id, season_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Player not found")
    return payload

@router.get("/{player_id}/network")
def player_network(
    player_id: str,
    season_id: str | None = Query(default=None),
):
    """Return observed partner and opponent relationships for one player."""
    from app.main import db_client

    payload = PlayerStatisticsEngine.from_db(db_client()).network(player_id, season_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Player not found")
    return payload

@router.get("/{player_id}/dna")
def player_dna(
    player_id: str,
    season_id: str | None = Query(default=None),
):
    """Return internal analytical Player DNA indicators."""
    from app.main import db_client

    payload = PlayerStatisticsEngine.from_db(db_client()).dna(player_id, season_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Player not found")
    return payload

@router.get("/{player_id}/coach")
def player_coach(player_id: str, season_id: str | None = Query(default=None)):
    from app.main import db_client
    payload = PlayerStatisticsEngine.from_db(db_client()).coach(player_id, season_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Player not found")
    return payload

@router.get("/compare/{left_player_id}/{right_player_id}")
def compare_players(left_player_id: str, right_player_id: str, season_id: str | None = Query(default=None)):
    from app.main import db_client
    payload=PlayerStatisticsEngine.from_db(db_client()).compare(left_player_id,right_player_id,season_id)
    if payload is None: raise HTTPException(status_code=404,detail="Player comparison unavailable")
    return payload

