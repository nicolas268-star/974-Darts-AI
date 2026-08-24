from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client

from .api.import_router import router as import_router
from .api.duo_router import router as duo_router
from .api.player_router import router as player_router
from .api.identity_router import router as identity_router
from .api.system_router import router as system_router
from .api.nakka_sync_router import router as nakka_sync_router
from .api.control_router import router as control_router
from .api.calendar_router import router as calendar_router
from .api.audience_router import router as audience_router
from .api.tournament_watch_router import router as tournament_watch_router
from .api.season_registry_router import router as season_registry_router
from .api.player_transfer_router import router as player_transfer_router
from .config import settings
from .parser import parse_workbook
from .publisher import Publisher
from .services.ranking_service import build_ranking, get_rules
from .services.stats_service import player_overview


APP_VERSION = "21.0.9"

app = FastAPI(
    title="974 Darts AI Data API",
    version=APP_VERSION,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.allowed_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(import_router)
app.include_router(player_router)
app.include_router(duo_router)
app.include_router(identity_router)
app.include_router(system_router)
app.include_router(nakka_sync_router)
app.include_router(control_router)
app.include_router(calendar_router)
app.include_router(audience_router)
app.include_router(tournament_watch_router)
app.include_router(season_registry_router)
app.include_router(player_transfer_router)

def verify_token(token: str | None):
    if not token or token != settings.internal_api_token:
        raise HTTPException(status_code=401, detail="Internal token invalid")


@app.get("/health")
def health():
    return {
        "app": "974 Darts AI Data API",
        "version": APP_VERSION,
        "status": "ok",
    }


@app.post("/api/v1/import/publish")
async def publish(
    file: UploadFile = File(...),
    x_user_id: str | None = Header(default=None),
    x_internal_token: str | None = Header(default=None),
):
    """
    Endpoint historique de publication.

    Il reste inchangé pendant le Sprint 4.2.2. Le nouvel endpoint d'analyse
    est maintenant fourni par ``app.api.import_router``.
    """

    verify_token(x_internal_token)
    content = await file.read()
    parsed = parse_workbook(content, file.filename or "upload.xlsx")

    try:
        return Publisher().publish(parsed, x_user_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Exception as exc:
        import traceback

        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Publication failed: {type(exc).__name__}: {exc}",
        ) from exc


def db_client():
    return create_client(
        settings.supabase_url,
        settings.supabase_service_role_key,
    )


@app.get("/api/v1/ranking")
def ranking(season_id: str | None = None):
    return build_ranking(db_client(), season_id)


@app.get("/api/v1/competition-rules")
def competition_rules(season_id: str | None = None):
    return get_rules(db_client(), season_id)


@app.get("/api/v1/players")
def players(season_id: str | None = None):
    return {"players": player_overview(db_client(), season_id)}

# SPRINT 11 - MATCH HUB
from .sprint11_routes import router as sprint11_router
app.include_router(sprint11_router)

# SPRINT 14 - COMPETITION HUB
from .sprint14_routes import router as sprint14_router
app.include_router(sprint14_router)
