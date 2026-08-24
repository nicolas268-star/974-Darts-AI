from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.services.duo_dashboard_service import build_duo_dashboard, build_duo_overview

router = APIRouter(prefix="/api/v1/duos", tags=["Duos"])


@router.get("")
def duo_overview(
    season_id: str | None = Query(default=None),
    team_id: str | None = Query(default=None),
):
    """Return all observed duos and their season statistics."""
    from app.main import db_client

    return build_duo_overview(db_client(), season_id, team_id)


@router.get("/{player_1_id}/{player_2_id}")
def duo_dashboard(
    player_1_id: str,
    player_2_id: str,
    season_id: str | None = Query(default=None),
):
    """Return detailed statistics for one canonical player pair."""
    from app.main import db_client

    payload = build_duo_dashboard(db_client(), player_1_id, player_2_id, season_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Duo not found")
    return payload
