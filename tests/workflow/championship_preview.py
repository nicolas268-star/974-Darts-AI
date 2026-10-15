"""Read-only championship UI fixture. Never imported by production."""
from fastapi import FastAPI
from stats_preview import router

app = FastAPI()
app.include_router(router)
