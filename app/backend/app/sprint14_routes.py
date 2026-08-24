from __future__ import annotations

from fastapi import APIRouter, HTTPException
from supabase import create_client

from app.config import settings
from app.services.competition_hub_service import CompetitionHubService


router = APIRouter(
    prefix="/api/v1/competitions",
    tags=["Sprint 14 - Compétitions"],
)


def service() -> CompetitionHubService:
    db = create_client(
        settings.supabase_url,
        settings.supabase_service_role_key,
    )
    return CompetitionHubService(db)


@router.get("")
def competition_catalog():
    return service().catalog()


@router.get("/championships/{season_ref}")
def championship_hub(season_ref: str):
    payload = service().championship(season_ref)
    if payload is None:
        raise HTTPException(
            status_code=404,
            detail="Saison introuvable",
        )
    return payload


@router.get("/tournaments")
def tournament_catalog():
    return CompetitionHubService.tournaments()


@router.get("/tournaments/{code}")
def tournament_hub(code: str):
    payload = CompetitionHubService.tournament(code)
    if payload is None:
        raise HTTPException(
            status_code=404,
            detail="Tournoi introuvable",
        )
    return payload
