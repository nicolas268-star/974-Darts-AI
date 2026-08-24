from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel, Field

from app.config import settings
from app.services.nakka_sync_agent import (
    DEFAULT_SOURCE_URL,
    NakkaSyncError,
    accept_current_reference,
    load_state,
    run_and_store,
    validate_source_url,
)
from app.services.nakka_competition_radar import (
    NAKKA_HOME_URL,
    NakkaRadarError,
    decide_discovery,
    load_radar_state,
    run_radar_scan,
)
from app.services.nakka_direct_import import (
    NakkaDirectImportError,
    analyze_direct_event,
    import_direct_event,
    load_direct_state,
)
from app.services.nakka_watch_service import (
    acknowledge_watch,
    delete_watch,
    load_watch_state,
    run_watch,
    upsert_watch,
)


router = APIRouter(prefix="/api/v1/nakka-sync", tags=["Agent Nakka"])


class NakkaRunRequest(BaseModel):
    season: int = Field(default=2026, ge=2020, le=2100)
    source_url: str = DEFAULT_SOURCE_URL
    deep: bool = False
    max_deep_events: int = Field(default=12, ge=0, le=80)


class NakkaReferenceRequest(BaseModel):
    snapshot_hash: str = Field(pattern=r"^[a-f0-9]{64}$")
    confirmed: bool = False


class NakkaRadarRunRequest(BaseModel):
    season: int = Field(default=2026, ge=2020, le=2100)
    keyword: str = Field(default="", max_length=80)
    source_types: list[str] = Field(default_factory=lambda: ["LEAGUE", "TOURNAMENT"])
    max_items: int = Field(default=30, ge=1, le=120)


class NakkaRadarDecisionRequest(BaseModel):
    discovery_key: str = Field(min_length=5, max_length=120)
    action: str = Field(pattern=r"^(FOLLOW|IGNORE)$")
    confirmed: bool = False


class NakkaDirectAnalyzeRequest(BaseModel):
    season: int = Field(default=2026, ge=2020, le=2100)
    source_url: str = Field(min_length=20, max_length=500)


class NakkaDirectImportRequest(BaseModel):
    snapshot_hash: str = Field(pattern=r"^[a-f0-9]{64}$")
    confirmed: bool = False


class NakkaWatchUpsertRequest(BaseModel):
    id: str | None = None
    title: str = Field(min_length=2, max_length=120)
    season: int = Field(default=2026, ge=2020, le=2100)
    source_url: str = Field(min_length=20, max_length=500)
    event_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    event_time: str | None = Field(default="09:00", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    active: bool = True


class NakkaWatchActionRequest(BaseModel):
    id: str = Field(min_length=3, max_length=100)
    confirmed: bool = False


def verify_internal_token(token: str | None) -> None:
    if not token or token != settings.internal_api_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Internal token invalid",
        )


def _identity_candidates() -> list[dict[str, str]]:
    """Return official names and confirmed aliases for direct Nakka imports."""
    try:
        from app.main import db_client

        database = db_client()
        response = (
            database
            .table("players")
            .select("id,display_name")
            .execute()
        )
        rows = list(getattr(response, "data", None) or [])
        identities_response = (
            database.table("player_identities")
            .select("id,canonical_player_id,canonical_display_name,status")
            .execute()
        )
        identity_rows = list(getattr(identities_response, "data", None) or [])
        active_identities = {
            str(row.get("id")): row
            for row in identity_rows
            if row.get("id")
            and row.get("canonical_player_id")
            and str(row.get("status") or "ACTIVE").upper() == "ACTIVE"
        }
        aliases_response = (
            database.table("player_aliases")
            .select("identity_id,alias_name,confirmed")
            .eq("confirmed", True)
            .execute()
        )
        alias_rows = list(getattr(aliases_response, "data", None) or [])
    except Exception:
        return []
    candidates = [
        {
            "id": str(row.get("id") or ""),
            "name": str(row.get("display_name") or ""),
            "canonicalName": str(row.get("display_name") or ""),
        }
        for row in rows
        if row.get("id") and row.get("display_name")
    ]
    for alias in alias_rows:
        identity = active_identities.get(str(alias.get("identity_id") or ""))
        alias_name = str(alias.get("alias_name") or "").strip()
        if not identity or not alias_name:
            continue
        candidates.append({
            "id": str(identity.get("canonical_player_id") or ""),
            "name": alias_name,
            "canonicalName": str(
                identity.get("canonical_display_name") or alias_name
            ),
        })
    return candidates


@router.get("/status")
def nakka_sync_status(
    x_internal_token: str | None = Header(default=None),
):
    verify_internal_token(x_internal_token)
    return load_state()


@router.get("/identity-candidates")
def nakka_identity_candidates(
    query: str | None = None,
    x_internal_token: str | None = Header(default=None),
):
    """Search canonical players from the protected Nakka administration UI."""
    verify_internal_token(x_internal_token)
    from app.services.player_identity_service import PlayerIdentityService
    from app.main import db_client

    return PlayerIdentityService(db_client()).alias_candidates(query=query)


@router.post("/run")
def run_nakka_sync(
    payload: NakkaRunRequest,
    x_internal_token: str | None = Header(default=None),
):
    verify_internal_token(x_internal_token)
    try:
        source_url = validate_source_url(payload.source_url)
        return run_and_store(
            source_url,
            season=payload.season,
            deep=payload.deep,
            max_deep_events=payload.max_deep_events,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except NakkaSyncError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Nakka est temporairement inaccessible ({type(exc).__name__}).",
        ) from exc


@router.post("/reference/accept")
def accept_nakka_reference(
    payload: NakkaReferenceRequest,
    x_internal_token: str | None = Header(default=None),
    x_user_id: str | None = Header(default=None),
):
    verify_internal_token(x_internal_token)
    try:
        return accept_current_reference(
            payload.snapshot_hash,
            confirmed=payload.confirmed,
            accepted_by=x_user_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/radar/status")
def nakka_radar_status(
    x_internal_token: str | None = Header(default=None),
):
    verify_internal_token(x_internal_token)
    state = load_radar_state()
    state["sourceHome"] = NAKKA_HOME_URL
    return state


@router.post("/radar/scan")
def run_nakka_radar(
    payload: NakkaRadarRunRequest,
    x_internal_token: str | None = Header(default=None),
):
    verify_internal_token(x_internal_token)
    try:
        return run_radar_scan(
            season=payload.season,
            keyword=payload.keyword,
            source_types=payload.source_types,
            max_items=payload.max_items,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except NakkaRadarError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Le radar Nakka est temporairement indisponible ({type(exc).__name__}).",
        ) from exc


@router.post("/radar/decision")
def decide_nakka_radar_discovery(
    payload: NakkaRadarDecisionRequest,
    x_internal_token: str | None = Header(default=None),
    x_user_id: str | None = Header(default=None),
):
    verify_internal_token(x_internal_token)
    try:
        return decide_discovery(
            discovery_key=payload.discovery_key,
            action=payload.action,
            confirmed=payload.confirmed,
            decided_by=x_user_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/direct/status")
def nakka_direct_status(
    x_internal_token: str | None = Header(default=None),
):
    verify_internal_token(x_internal_token)
    return load_direct_state()


@router.get("/watch/status")
def nakka_watch_status(x_internal_token: str | None = Header(default=None)):
    verify_internal_token(x_internal_token)
    return load_watch_state()


@router.post("/watch/upsert")
def nakka_watch_upsert(payload: NakkaWatchUpsertRequest, x_internal_token: str | None = Header(default=None), x_user_id: str | None = Header(default=None)):
    verify_internal_token(x_internal_token)
    try:
        return upsert_watch(payload.model_dump(), x_user_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/watch/run")
def nakka_watch_run(payload: NakkaWatchActionRequest, x_internal_token: str | None = Header(default=None)):
    verify_internal_token(x_internal_token)
    try:
        return run_watch(payload.id, automatic=False)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/watch/acknowledge")
def nakka_watch_acknowledge(payload: NakkaWatchActionRequest, x_internal_token: str | None = Header(default=None)):
    verify_internal_token(x_internal_token)
    return acknowledge_watch(payload.id)


@router.post("/watch/delete")
def nakka_watch_delete(payload: NakkaWatchActionRequest, x_internal_token: str | None = Header(default=None)):
    verify_internal_token(x_internal_token)
    if not payload.confirmed:
        raise HTTPException(status_code=400, detail="Confirmation requise.")
    return delete_watch(payload.id)


@router.post("/direct/analyze")
def analyze_nakka_direct_event(
    payload: NakkaDirectAnalyzeRequest,
    x_internal_token: str | None = Header(default=None),
):
    verify_internal_token(x_internal_token)
    try:
        return analyze_direct_event(
            source_url=payload.source_url,
            season=payload.season,
            identity_candidates=_identity_candidates(),
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except NakkaDirectImportError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "L’analyse directe Nakka est temporairement indisponible "
                f"({type(exc).__name__})."
            ),
        ) from exc


@router.post("/direct/import")
def import_nakka_direct_event(
    payload: NakkaDirectImportRequest,
    x_internal_token: str | None = Header(default=None),
    x_user_id: str | None = Header(default=None),
):
    verify_internal_token(x_internal_token)
    try:
        return import_direct_event(
            snapshot_hash=payload.snapshot_hash,
            confirmed=payload.confirmed,
            accepted_by=x_user_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
