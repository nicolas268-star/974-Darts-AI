from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field
from supabase import create_client
from postgrest.exceptions import APIError

from app.api.calendar_router import verify_internal_token
from app.config import settings
from app.services.committee_ranking_service import (
    build_event_preview,
    licensed_players,
    public_ranking,
)


router = APIRouter(prefix="/api/v1/committee-ranking", tags=["Committee ranking"])


def db_client():
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


class ResultInput(BaseModel):
    player_name: str = Field(min_length=1, max_length=120)
    club: str = Field(default="", max_length=120)
    gender: str = Field(default="X", pattern=r"^[MFX]$")
    placement: str = Field(pattern=r"^(WINNER|RUNNER_UP|SEMI_FINALIST|QUARTER_FINALIST|ROUND_OF_16)$")


class ValidationInput(BaseModel):
    event_id: str = Field(min_length=1, max_length=100)
    confirmed: bool = False
    results: list[ResultInput]


class PublicationInput(BaseModel):
    event_id: str = Field(min_length=1, max_length=100)
    confirmed: bool = False


@router.get("")
def ranking_public(season: str = Query("2026-2027", pattern=r"^20\d{2}-20\d{2}$")):
    from app.api.ranking_workflow_router import enabled
    from app.services.ranking_workflow import aggregate_public
    db = db_client()
    try:
        data = db.rpc("ranking_published_snapshot", {"p_season": season}).execute().data
        return aggregate_public(data, season)
    except APIError as exc:
        # Legacy fallback is allowed only before the new schema is installed.
        # Suspending actions must never revert published points to old tables.
        if str(exc.code) in {"PGRST202", "42883"} and not enabled():
            return public_ranking(db, season)
        raise HTTPException(503, "Le classement est temporairement indisponible.") from exc



@router.get("/licensed-players")
def licensed_players_public():
    return licensed_players(db_client())


@router.get("/events/{event_id}/preview", dependencies=[Depends(verify_internal_token)])
def event_preview(event_id: str):
    try:
        return build_event_preview(event_id, db_client())
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/validate", dependencies=[Depends(verify_internal_token)])
def event_validate(payload: ValidationInput):
    raise HTTPException(410, "Utilisez le workflow avec validation du Directeur sportif connecté.")


@router.post("/publish", dependencies=[Depends(verify_internal_token)])
def event_publish(payload: PublicationInput):
    raise HTTPException(410, "La publication exige une révision validée par le Directeur sportif.")
