from fastapi import APIRouter, HTTPException
from supabase import create_client

from .config import settings
from .services.match_hub_service import build_match_hub, team_match_history


router = APIRouter()


def _db_client():
    return create_client(
        settings.supabase_url,
        settings.supabase_service_role_key,
    )


@router.get("/api/v1/teams/{team_id}/matches")
def team_matches(team_id: str, season_id: str | None = None):
    return team_match_history(_db_client(), team_id, season_id)


@router.get("/api/v1/match-hub/{result_id}")
def match_hub(result_id: str):
    payload = build_match_hub(_db_client(), result_id)
    if payload is None:
        raise HTTPException(
            status_code=404,
            detail="Résultat collectif introuvable.",
        )
    return payload
