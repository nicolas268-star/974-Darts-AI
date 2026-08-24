from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field, HttpUrl

from app.api.calendar_router import verify_internal_token
from app.services.tournament_watch_service import analyze_manual, configure_settings, decide, delete_source, public_club_links, scan_all, send_test_email, status, upsert_source

router = APIRouter(prefix="/api/v1/tournament-watch", tags=["Tournament watch"])

class SourceInput(BaseModel):
    id: str | None = None
    name: str = Field(min_length=2, max_length=100)
    url: HttpUrl
    source_type: Literal["WEBSITE", "FACEBOOK", "INSTAGRAM", "NAKKA", "OTHER"] = "WEBSITE"
    active: bool = True

class DeleteInput(BaseModel):
    id: str
    confirmed: bool = False

class DecisionInput(BaseModel):
    id: str
    action: Literal["PUBLISH", "IGNORE"]
    edits: dict = Field(default_factory=dict)

class ManualAnalyzeInput(BaseModel):
    text: str = Field(min_length=8, max_length=20_000)
    source_name: str = Field(default="Annonce manuelle", max_length=100)
    source_url: str | None = Field(default=None, max_length=2000)

class SettingsInput(BaseModel):
    notification_email: str = Field(default="", max_length=254)
    automatic: bool = True


@router.get("/public-club-links")
def club_links_public():
    return public_club_links()

@router.get("/status", dependencies=[Depends(verify_internal_token)])
def watch_status():
    return status()

@router.post("/sources/upsert", dependencies=[Depends(verify_internal_token)])
def source_upsert(payload: SourceInput):
    try:
        return upsert_source(payload.model_dump(mode="json"))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

@router.post("/sources/delete", dependencies=[Depends(verify_internal_token)])
def source_delete(payload: DeleteInput):
    if not payload.confirmed:
        raise HTTPException(status_code=400, detail="Confirmation requise.")
    return delete_source(payload.id)

@router.post("/scan", dependencies=[Depends(verify_internal_token)])
def run_scan():
    return scan_all()

@router.post("/manual/analyze", dependencies=[Depends(verify_internal_token)])
def manual_analyze(payload: ManualAnalyzeInput):
    try:
        return analyze_manual(payload.text, payload.source_name, payload.source_url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

@router.post("/settings", dependencies=[Depends(verify_internal_token)])
def update_settings(payload: SettingsInput):
    try:
        return configure_settings(payload.notification_email, payload.automatic)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

@router.post("/settings/test-email", dependencies=[Depends(verify_internal_token)])
def test_email():
    try:
        return send_test_email()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

@router.post("/decision", dependencies=[Depends(verify_internal_token)])
def discovery_decision(payload: DecisionInput, x_user_id: str | None = Header(default=None)):
    try:
        return decide(payload.id, payload.action, payload.edits, x_user_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
