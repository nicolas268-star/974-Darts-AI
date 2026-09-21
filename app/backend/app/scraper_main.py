from __future__ import annotations

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from app.config import settings
from app.services.nakka_sync_agent import (
    DEFAULT_SOURCE_URL,
    NakkaSyncError,
    run_and_store,
    validate_source_url,
)


app = FastAPI(
    title="974 Darts AI Scraper",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


class NakkaScrapeRequest(BaseModel):
    season: int = Field(default=2026, ge=2020, le=2100)
    source_url: str = DEFAULT_SOURCE_URL
    max_deep_events: int = Field(default=12, ge=0, le=80)


def verify_internal_token(token: str | None) -> None:
    if not token or token != settings.internal_api_token:
        raise HTTPException(status_code=401, detail="Internal token invalid")


@app.get("/health")
def health() -> dict[str, str]:
    return {"app": "974 Darts AI Scraper", "status": "ok"}


@app.post("/internal/nakka-sync/run")
def run_nakka_scrape(
    payload: NakkaScrapeRequest,
    x_internal_token: str | None = Header(default=None),
):
    verify_internal_token(x_internal_token)
    try:
        return run_and_store(
            validate_source_url(payload.source_url),
            season=payload.season,
            deep=True,
            max_deep_events=payload.max_deep_events,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except NakkaSyncError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
