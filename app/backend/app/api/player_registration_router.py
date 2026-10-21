import os
from datetime import date
from secrets import compare_digest
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator

from .calendar_router import verify_internal_token
from app.services.player_registration_service import admin_options, official_rosters, save_registration

router = APIRouter(prefix="/api/v1/player-registrations", tags=["Player registrations"])


def administrator(x_user_id: str | None = Header(default=None), _=Depends(verify_internal_token)):
    allowed = os.getenv("ADMIN_USER_ID", "").strip()
    if not allowed or not x_user_id or not compare_digest(x_user_id, allowed):
        raise HTTPException(403, "Accès administrateur refusé.")
    return x_user_id


class RegistrationInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    request_id: UUID
    season_id: UUID
    club_code: str = Field(min_length=1, max_length=20)
    team_id: UUID
    identity_id: UUID | None = None
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    nakka_name: str = Field(default="", max_length=120)
    license_number: str = Field(default="", max_length=8)
    joined_on: date

    @field_validator("license_number")
    @classmethod
    def license_format(cls, value):
        if value and (len(value) != 8 or not value.isascii() or not value.isdigit()):
            raise ValueError("La licence doit comporter 8 chiffres ou rester vide en attente.")
        return value


def database():
    from app.main import db_client
    return db_client()


@router.get("/admin")
def options(_=Depends(administrator)):
    try:
        return admin_options(database())
    except Exception:
        raise HTTPException(503, "Les inscriptions sont indisponibles. Vérifie que la migration est installée.") from None


@router.post("/save")
def save(payload: RegistrationInput, actor=Depends(administrator)):
    try:
        return save_registration(database(), payload.model_dump(mode="json"), actor)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from None
    except Exception:
        raise HTTPException(503, "L’inscription n’a pas pu être confirmée. Tu peux réessayer sans créer de doublon.") from None


@router.get("/rosters")
def rosters(season_key: str = Query(default="2026-2027", pattern=r"^20\d{2}-20\d{2}$")):
    return {"rosters": official_rosters(database(), season_key)}
