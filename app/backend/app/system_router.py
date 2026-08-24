from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/api/v1/system", tags=["System"])

APP_INFO = {
    "application": "974 Darts AI",
    "backend_version": "7.6",
    "network_contract": "7.2.1a",
    "build_date": "2026-07-24",
    "frontend_required": "7.6",
    "player_dna_contract": "7.2.3",
    "player_coach_contract": "7.3",
    "identity_contract": "7.5",
    "career_contract": "7.5",
    "identity_contract": "7.5-enterprise",
    "identity_security": "RLS enabled",
    "identity_assistant_contract": "7.5.1",
    "canonical_merge_contract": "7.5.2",
    "identity_hub_contract": "7.6",
    "compatible": True,
}


@router.get("/info")
def system_info():
    """Return backend and Player Network contract compatibility information."""
    return APP_INFO
