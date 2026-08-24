from __future__ import annotations

import re
import unicodedata

from fastapi import APIRouter, HTTPException, Query

from app.services.player_dashboard_service import build_player_dashboard
from app.services.player_statistics_engine import PlayerStatisticsEngine
from app.services.tournament_workbook_service import load_tournament_cache
from app.services.player_transfer_service import affiliations_from_current, player_affiliations
from app.services.player_identity_service import PlayerIdentityService

router = APIRouter(prefix="/api/v1/players", tags=["Players"])


def _normalized_name(value: str | None) -> str:
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(character for character in text if not unicodedata.combining(character))
    return re.sub(r"[^a-z0-9]+", "", text.casefold())


def _player_tournament_payload(player_id: str, season_id: str | None = None):
    from app.main import db_client

    dashboard = build_player_dashboard(db_client(), player_id, season_id)
    if dashboard is None:
        return None
    player = dashboard.get("player") or {}
    player_name = str(player.get("name") or "")
    normalized = _normalized_name(player_name)
    profile = PlayerIdentityService(db_client()).profile(player_id)
    accepted_names = {normalized}
    if profile:
        accepted_names.update(
            _normalized_name(str(alias.get("alias_name") or ""))
            for alias in profile.get("aliases") or []
        )
    participations = []
    for tournament in load_tournament_cache().get("tournaments") or []:
        participant = next(
            (
                item
                for item in tournament.get("players") or []
                if str(item.get("canonical_player_id") or "") == player_id
                or _normalized_name(str(item.get("name") or "")) in accepted_names
            ),
            None,
        )
        if participant is None:
            continue
        participations.append({
            "code": tournament.get("code"), "name": tournament.get("name"),
            "event_name": tournament.get("event_name"), "date": tournament.get("date"),
            "date_label": tournament.get("date_label"), "season": tournament.get("season"),
            "href": f"/tournaments/{str(tournament.get('code') or '').lower()}",
            "statistics": participant,
        })
    participations.sort(key=lambda item: (str(item.get("date") or ""), str(item.get("code") or "")), reverse=True)
    return {"player": {"player_id": player_id, "name": player_name, "team": player.get("team")}, "participation_count": len(participations), "participations": participations}


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
    player = payload.get("player") or {}
    payload["affiliations"] = affiliations_from_current(
        player_id,
        str(player.get("name") or ""),
        player.get("team"),
        player.get("club"),
    )
    return payload

@router.get("/{player_id}/affiliations")
def player_affiliation_history(player_id: str):
    from app.main import db_client
    try: return player_affiliations(db_client(), player_id)
    except ValueError as exc: raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{player_id}/tournaments")
def player_tournaments(player_id: str, season_id: str | None = Query(default=None)):
    """Return friendly-tournament performances observed for one player."""
    payload = _player_tournament_payload(player_id, season_id)
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
