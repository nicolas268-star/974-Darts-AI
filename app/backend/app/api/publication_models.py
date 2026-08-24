from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class ExecutePublicationSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    inserted: int = Field(default=0, ge=0)
    updated: int = Field(default=0, ge=0)
    unchanged: int = Field(default=0, ge=0)


class ExecutePublicationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: str
    transactionId: str | None = None
    durationMs: int = Field(default=0, ge=0)
    summary: ExecutePublicationSummary
    message: str | None = None


__all__ = [
    "ExecutePublicationResponse",
    "ExecutePublicationSummary",
]
