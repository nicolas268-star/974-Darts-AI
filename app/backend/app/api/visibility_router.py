from uuid import UUID

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, ConfigDict

from ..config import settings
from ..services.visibility_service import SummaryUnavailable, compose_summary, list_evenings, load_evening

router = APIRouter(prefix="/api/v1/visibility", tags=["Visibility"])


def require_internal(token):
    if not token or token != settings.internal_api_token:
        raise HTTPException(status_code=401, detail="Internal token invalid")


class SummaryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    result_id: UUID


@router.get("/evenings")
def evenings(x_internal_token: str | None = Header(default=None)):
    require_internal(x_internal_token)
    from app.main import db_client
    return list_evenings(db_client())


def summary_payload(result_id, use_ai):
    from app.main import db_client
    try:
        return compose_summary(load_evening(db_client(), str(result_id)), use_ai=use_ai)
    except SummaryUnavailable as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/summary")
def preview(result_id: UUID, x_internal_token: str | None = Header(default=None)):
    require_internal(x_internal_token)
    return summary_payload(result_id, False)


@router.post("/summary")
def generate(request: SummaryRequest, x_internal_token: str | None = Header(default=None)):
    require_internal(x_internal_token)
    return summary_payload(request.result_id, True)
