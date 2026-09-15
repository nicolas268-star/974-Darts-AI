from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from supabase import create_client

from app.api.calendar_router import verify_internal_token
from app.config import settings
from app.services.committee_ranking_service import (
    build_event_preview,
    public_ranking,
    publish_event,
    validate_event,
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
def ranking_public():
    return public_ranking(db_client())


@router.get("/events/{event_id}/preview", dependencies=[Depends(verify_internal_token)])
def event_preview(event_id: str):
    try:
        return build_event_preview(event_id, db_client())
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/validate", dependencies=[Depends(verify_internal_token)])
def event_validate(payload: ValidationInput, x_user_id: str | None = Header(default=None)):
    if not payload.confirmed:
        raise HTTPException(status_code=400, detail="La validation officielle doit être confirmée.")
    try:
        return validate_event(db_client(), payload.event_id, [row.model_dump() for row in payload.results], x_user_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/publish", dependencies=[Depends(verify_internal_token)])
def event_publish(payload: PublicationInput, x_user_id: str | None = Header(default=None)):
    if not payload.confirmed:
        raise HTTPException(status_code=400, detail="La publication doit être confirmée.")
    try:
        return publish_event(db_client(), payload.event_id, x_user_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
