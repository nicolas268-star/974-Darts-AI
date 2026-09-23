"""Test-only API entry point. Auth/PostgREST fixture must bind to loopback."""

from fastapi import FastAPI
from app.api.ranking_workflow_router import router
from app.api.committee_ranking_router import router as public_router

app = FastAPI()
app.include_router(router)
app.include_router(public_router)
