from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from app.api.calendar_router import verify_internal_token
from app.services.season_registry_service import calendar_preview, import_calendar, public_seasons, registry_status, scan_season

router = APIRouter(prefix="/api/v1/seasons", tags=["Seasons"])

class ScanRequest(BaseModel):
    key: str = Field(pattern=r"^20\d{2}(?:-20\d{2})?$")

class ImportRequest(ScanRequest):
    confirmed: bool = False

@router.get("")
def seasons_public():
    payload = public_seasons()
    try:
        from app.main import db_client
        rows = list(getattr(db_client().table("seasons").select("id,name,is_active").execute(), "data", None) or [])
        for season in payload["seasons"]:
            key = str(season["key"])
            match = next((row for row in rows if key in str(row.get("name") or "")), None)
            if match: season["dbSeasonId"] = match.get("id")
    except Exception:
        pass
    return payload

@router.get("/admin", dependencies=[Depends(verify_internal_token)])
def seasons_admin(): return registry_status()

@router.post("/scan", dependencies=[Depends(verify_internal_token)])
def season_scan(payload: ScanRequest):
    try: return {"season": scan_season(payload.key)}
    except ValueError as exc: raise HTTPException(status_code=404, detail=str(exc)) from exc

@router.post("/calendar/preview", dependencies=[Depends(verify_internal_token)])
def season_calendar_preview(payload: ScanRequest):
    try: return calendar_preview(payload.key)
    except ValueError as exc: raise HTTPException(status_code=404, detail=str(exc)) from exc

@router.post("/calendar/import", dependencies=[Depends(verify_internal_token)])
def season_calendar_import(payload: ImportRequest, x_user_id: str | None = Header(default=None)):
    try: return import_calendar(payload.key, payload.confirmed, x_user_id)
    except ValueError as exc: raise HTTPException(status_code=409, detail=str(exc)) from exc
