from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from app.api.calendar_router import verify_internal_token
from app.services.player_transfer_service import admin_status, cancel_transfer, upsert_transfer

router = APIRouter(prefix="/api/v1/player-transfers", tags=["Player transfers"])
class TransferInput(BaseModel):
    id: str | None = None
    player_id: str = Field(min_length=1, max_length=100)
    target_club: str | None = Field(default=None, max_length=120)
    target_team: str | None = Field(default=None, max_length=120)
    effective_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    note: str | None = Field(default=None, max_length=500)
class CancelInput(BaseModel): id: str; confirmed: bool = False

@router.get("/admin", dependencies=[Depends(verify_internal_token)])
def transfers_admin():
    from app.main import db_client
    return admin_status(db_client())
@router.post("/upsert", dependencies=[Depends(verify_internal_token)])
def transfer_upsert(payload: TransferInput, x_user_id: str | None = Header(default=None)):
    from app.main import db_client
    try: return upsert_transfer(db_client(), payload.model_dump(), x_user_id)
    except ValueError as exc: raise HTTPException(status_code=422, detail=str(exc)) from exc
@router.post("/cancel", dependencies=[Depends(verify_internal_token)])
def transfer_cancel(payload: CancelInput, x_user_id: str | None = Header(default=None)):
    try: return cancel_transfer(payload.id, payload.confirmed, x_user_id)
    except ValueError as exc: raise HTTPException(status_code=409, detail=str(exc)) from exc
