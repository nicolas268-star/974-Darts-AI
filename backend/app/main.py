
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from .config import settings
from .parser import parse_workbook
from .publisher import Publisher
from .services.ranking_service import build_ranking, get_rules
from .services.stats_service import player_overview
from supabase import create_client

app = FastAPI(title="974 Darts AI Data API", version="0.10.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.allowed_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def verify_token(token: str | None):
    if not token or token != settings.internal_api_token:
        raise HTTPException(status_code=401, detail="Internal token invalid")

@app.get("/health")
def health():
    return {"app": "974 Darts AI Data API", "version": "0.10.0", "status": "ok"}

@app.post("/api/v1/import/analyze")
async def analyze(
    file: UploadFile = File(...),
    x_internal_token: str | None = Header(default=None),
):
    verify_token(x_internal_token)
    content = await file.read()
    return parse_workbook(content, file.filename or "upload.xlsx").analysis

@app.post("/api/v1/import/publish")
async def publish(
    file: UploadFile = File(...),
    x_user_id: str | None = Header(default=None),
    x_internal_token: str | None = Header(default=None),
):
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
            detail=f"Publication failed: {type(exc).__name__}: {exc}"
        ) from exc


def db_client():
    return create_client(settings.supabase_url, settings.supabase_service_role_key)

@app.get("/api/v1/ranking")
def ranking(season_id: str | None = None):
    return build_ranking(db_client(), season_id)

@app.get("/api/v1/competition-rules")
def competition_rules(season_id: str | None = None):
    return get_rules(db_client(), season_id)

@app.get("/api/v1/players")
def players(season_id: str | None = None):
    return {"players": player_overview(db_client(), season_id)}
