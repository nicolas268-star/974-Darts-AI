from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from ..config import settings
from ..services.audience_service import record_event, summary

router = APIRouter(prefix="/api/v1/audience", tags=["audience"])


class AudienceEvent(BaseModel):
    event_type: str = "page_view"
    path: str
    device: str = "desktop"
    session: str = ""


def require_internal(token: str | None) -> None:
    if not token or token != settings.internal_api_token:
        raise HTTPException(status_code=401, detail="Internal token invalid")


@router.post("/events", status_code=202)
def ingest(event: AudienceEvent, x_internal_token: str | None = Header(default=None)):
    require_internal(x_internal_token)
    return {"accepted": record_event(event.model_dump())}


@router.get("/summary")
def get_summary(days: int = 30, x_internal_token: str | None = Header(default=None)):
    require_internal(x_internal_token)
    return summary(days)
