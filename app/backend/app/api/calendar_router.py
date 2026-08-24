from __future__ import annotations

from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field, HttpUrl, field_validator
from secrets import compare_digest

from app.config import settings
from app.services.calendar_service import delete_event, list_events, upsert_event


router = APIRouter(prefix="/api/v1/calendar", tags=["Calendar"])


def verify_internal_token(
    x_internal_token: str | None = Header(default=None),
) -> None:
    if (
        not x_internal_token
        or not settings.internal_api_token
        or not compare_digest(x_internal_token, settings.internal_api_token)
    ):
        raise HTTPException(status_code=401, detail="Internal token invalid")


class CalendarEventInput(BaseModel):
    id: str | None = None
    title: str = Field(min_length=2, max_length=120)
    event_type: Literal["CHAMPIONSHIP", "TOURNAMENT", "FRIENDLY", "OTHER"]
    start_date: date
    start_time: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    end_date: date | None = None
    location: str = Field(min_length=2, max_length=120)
    address: str | None = Field(default=None, max_length=240)
    description: str | None = Field(default=None, max_length=1000)
    source_url: HttpUrl | None = None
    status: Literal["SCHEDULED", "COMPLETED", "CANCELLED"] = "SCHEDULED"

    @field_validator("end_date")
    @classmethod
    def validate_end_date(cls, value: date | None, info):
        start_date = info.data.get("start_date")
        if value and start_date and value < start_date:
            raise ValueError("La date de fin doit suivre la date de début.")
        return value


class DeleteCalendarEventInput(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    confirmed: bool = False


@router.get("/events")
def calendar_events():
    return list_events()


@router.post("/events/upsert", dependencies=[Depends(verify_internal_token)])
def calendar_event_upsert(
    payload: CalendarEventInput,
    x_user_id: str | None = Header(default=None),
):
    return upsert_event(payload.model_dump(mode="json"), x_user_id)


@router.post("/events/delete", dependencies=[Depends(verify_internal_token)])
def calendar_event_delete(payload: DeleteCalendarEventInput):
    if not payload.confirmed:
        raise HTTPException(status_code=400, detail="Confirmation requise.")
    result = delete_event(payload.id)
    if not result["deleted"]:
        raise HTTPException(status_code=404, detail="Événement introuvable.")
    return result
