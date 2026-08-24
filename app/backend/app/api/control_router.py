from __future__ import annotations

from secrets import compare_digest

from fastapi import APIRouter, Depends, Header, HTTPException

from app.config import settings
from app.services.control_quality_service import build_control_quality_report


router = APIRouter(prefix="/api/v1/control", tags=["Control & quality"])


def verify_internal_token(
    x_internal_token: str | None = Header(default=None),
) -> None:
    if (
        not x_internal_token
        or not settings.internal_api_token
        or not compare_digest(x_internal_token, settings.internal_api_token)
    ):
        raise HTTPException(status_code=401, detail="Internal token invalid")


@router.get("/quality", dependencies=[Depends(verify_internal_token)])
def control_quality():
    from app.main import db_client

    return build_control_quality_report(db_client())
